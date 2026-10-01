#!/usr/bin/env node
'use strict';

/**
 * scripts/check-db-readonly.js — 실제 DB 상태 점검 (읽기 전용)
 *
 * 2026-10-01 신설. 포트폴리오 정리(골든 패스 점검) 전에 실제 Supabase Postgres가 어떤 상태인지
 * 확인한다. Claude 작업 환경에서는 DB에 접속할 수 없어서, 팀장 PC 터미널에서 한 번 실행한다.
 *
 *   실행: 리포 루트에서  node scripts/check-db-readonly.js
 *   전제: 리포 루트 .env 의 DATABASE_URL (앱과 같은 값)
 *
 * 안전장치
 *   - 트랜잭션을 READ ONLY로 열고 마지막에 ROLLBACK 한다. 데이터를 바꾸는 쿼리는 DB가 거부한다.
 *   - 개수·코드값만 출력한다. 이메일·이름·토큰 같은 개인정보와 비밀값은 출력하지 않는다.
 *   - 결과는 화면에 출력하고, 같은 내용을 scripts/.out/db-check.json 에도 저장한다(.gitignore 대상).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SERVER_MODULES = path.join(ROOT, 'app', 'server', 'node_modules');
const { Client } = require(path.join(SERVER_MODULES, 'pg'));
require(path.join(SERVER_MODULES, 'dotenv')).config({ path: path.join(ROOT, '.env'), quiet: true });

// app이 실제로 쓰는 12종 (scripts/lib/seed-skill-catalog.ts, in-memory-external.adapter.ts)
const APP_SKILLS = ['REACT', 'NODEJS', 'SQL', 'TYPESCRIPT', 'JAVASCRIPT', 'VUE', 'SPRING', 'FIGMA', 'FLUTTER', 'PYTHON', 'HTML_CSS', 'AWS'];
// PRD v6.6 §8.2 기술 스택 32종
const PRD_SKILLS = [
  'HTML_CSS', 'JAVASCRIPT', 'TYPESCRIPT', 'REACT', 'VUE', 'FRONTEND_ETC',
  'NODEJS', 'JAVA', 'PYTHON', 'PHP', 'GO', 'BACKEND_ETC',
  'IOS', 'ANDROID', 'CROSS_PLATFORM',
  'SQL', 'NOSQL', 'CLOUD', 'DEVOPS', 'DATA_ANALYSIS',
  'UI_UX_DESIGN', 'GRAPHIC_DESIGN', 'BRANDING', 'VIDEO_MOTION', 'DESIGN_ETC',
  'PERFORMANCE_MARKETING', 'CONTENT_MARKETING', 'SEO', 'SNS_MARKETING',
  'SERVICE_PLANNING', 'QA_TEST', 'ETC_SKILL',
];

const report = { checkedAt: new Date().toISOString(), ok: true, sections: {}, warnings: [] };
const warn = (msg) => { report.warnings.push(msg); };

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('[실패] 리포 루트 .env 에 DATABASE_URL 이 없습니다. 앱을 실행할 때 쓰는 값과 같은 값을 넣어 주세요.');
    process.exit(1);
  }
  const host = (() => { try { return new URL(process.env.DATABASE_URL).host; } catch { return '(URL 형식 아님)'; } })();
  console.log(`[연결] ${host} 에 읽기 전용으로 접속합니다...`);

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 20000 });
  await client.connect();
  const q = async (sql, params) => (await client.query(sql, params)).rows;

  try {
    await client.query('BEGIN READ ONLY');

    // 1. 연결
    const [conn] = await q(`select now() as now, current_database() as db, split_part(version(), ' ', 2) as pg`);
    report.sections.connection = { database: conn.db, postgres: conn.pg, serverTime: conn.now };

    // 2. 마이그레이션
    const migTable = await q(`select to_regclass('public._prisma_migrations') as t`);
    if (migTable[0].t) {
      const migs = await q(`select migration_name, finished_at, rolled_back_at from _prisma_migrations order by started_at`);
      const failed = migs.filter((m) => !m.finished_at && !m.rolled_back_at).map((m) => m.migration_name);
      const localDir = path.join(ROOT, 'app', 'server', 'prisma', 'migrations');
      const local = fs.existsSync(localDir) ? fs.readdirSync(localDir).filter((n) => /^\d{14}_/.test(n)).sort() : [];
      const applied = new Set(migs.filter((m) => m.finished_at).map((m) => m.migration_name));
      const notApplied = local.filter((n) => !applied.has(n));
      report.sections.migrations = { applied: applied.size, latest: migs.length ? migs[migs.length - 1].migration_name : null, failed, notAppliedFromRepo: notApplied };
      if (failed.length) warn(`실패한 마이그레이션 ${failed.length}건: ${failed.join(', ')}`);
      if (notApplied.length) warn(`리포에는 있지만 DB에 적용 안 된 마이그레이션 ${notApplied.length}건: ${notApplied.join(', ')}`);
    } else {
      warn('_prisma_migrations 테이블이 없습니다. 마이그레이션이 한 번도 적용되지 않았을 수 있습니다.');
    }

    // 3. 테이블별 행 수
    const tables = await q(`select tablename from pg_tables where schemaname = 'public' and tablename not like '\\_%' order by tablename`);
    const counts = {};
    for (const { tablename } of tables) {
      const [r] = await q(`select count(*)::int as n from "${tablename.replace(/"/g, '""')}"`);
      counts[tablename] = r.n;
    }
    report.sections.rowCounts = counts;

    // 4. 기술 목록
    if (counts.skills !== undefined) {
      const skills = await q(`select id, is_custom, is_active from skills`);
      const official = skills.filter((s) => !s.is_custom);
      const officialIds = new Set(official.filter((s) => s.is_active).map((s) => s.id));
      report.sections.skills = {
        total: skills.length,
        officialActive: officialIds.size,
        custom: skills.length - official.length,
        missingAppSkills: APP_SKILLS.filter((id) => !officialIds.has(id)),
        missingPrdSkills: PRD_SKILLS.filter((id) => !officialIds.has(id)),
        notInPrd: [...officialIds].filter((id) => !PRD_SKILLS.includes(id)).sort(),
      };
      if (report.sections.skills.missingAppSkills.length) warn(`앱이 쓰는 기술 중 DB에 없는 것: ${report.sections.skills.missingAppSkills.join(', ')} → npm run seed:skill-catalog 필요`);
    }

    // 5. 사용자와 프로필 (개수만)
    const users = await q(`
      select u.role::text as role, coalesce(u.oauth_provider::text, 'EMAIL') as signup,
             count(*)::int as users,
             count(*) filter (where u.deleted_at is not null)::int as deleted,
             count(cp.id)::int as client_profile, count(cp.completed_at)::int as client_completed,
             count(fp.id)::int as freelancer_profile, count(fp.completed_at)::int as freelancer_completed
      from users u
      left join client_profiles cp on cp.user_id = u.id
      left join freelancer_profiles fp on fp.user_id = u.id
      group by 1, 2 order by 1, 2`);
    report.sections.users = users;
    const [noProfile] = await q(`
      select count(*)::int as n from users u
      where u.deleted_at is null
        and ((u.role = 'CLIENT' and not exists (select 1 from client_profiles c where c.user_id = u.id))
          or (u.role = 'FREELANCER' and not exists (select 1 from freelancer_profiles f where f.user_id = u.id)))`);
    report.sections.usersWithoutProfile = noProfile.n;
    const [longIds] = await q(`select count(*)::int as n from users where length(id) > 30`);
    if (longIds.n) warn(`users.id 가 30자를 넘는 행 ${longIds.n}건 (CR-0002 ID 길이 이슈)`);

    // 6. 거래 흐름 상태 분포 (골든 패스 시드가 있는지 판단용)
    const dist = async (table, col) => (counts[table] === undefined ? null
      : Object.fromEntries((await q(`select ${col}::text as k, count(*)::int as n from ${table} group by 1 order by 1`)).map((r) => [r.k, r.n])));
    report.sections.flow = {
      projectsRecruitment: await dist('projects', 'recruitment_status'),
      projectsTransaction: await dist('projects', 'transaction_status'),
      applications: await dist('applications', 'status'),
      contracts: await dist('contracts', 'status'),
      payments: await dist('payments', 'status'),
    };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
  }
}

function print() {
  const s = report.sections;
  console.log('\n===== PactFive DB 점검 결과 (읽기 전용) =====');
  if (s.connection) console.log(`DB: ${s.connection.database} / Postgres ${s.connection.postgres}`);
  if (s.migrations) console.log(`마이그레이션: 적용 ${s.migrations.applied}건, 마지막 ${s.migrations.latest}`);
  if (s.rowCounts) {
    console.log('\n[테이블 행 수]');
    for (const [t, n] of Object.entries(s.rowCounts)) console.log(`  ${t.padEnd(40)} ${String(n).padStart(6)}`);
  }
  if (s.skills) console.log(`\n[기술] 공식(활성) ${s.skills.officialActive} / 커스텀 ${s.skills.custom} / PRD 32종 중 없는 것 ${s.skills.missingPrdSkills.length}개`);
  if (s.users) {
    console.log('\n[사용자·프로필]');
    console.table(s.users);
    console.log(`  프로필 행이 아예 없는 활성 사용자: ${s.usersWithoutProfile}명`);
  }
  if (s.flow) {
    console.log('\n[거래 흐름 상태 분포]');
    for (const [k, v] of Object.entries(s.flow)) console.log(`  ${k.padEnd(22)} ${v ? JSON.stringify(v) : '(테이블 없음)'}`);
  }
  console.log(`\n[경고] ${report.warnings.length ? '' : '없음'}`);
  for (const w of report.warnings) console.log(`  - ${w}`);
}

function save() {
  const outDir = path.join(__dirname, '.out');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'db-check.json');
  fs.writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\n결과 파일: ${path.relative(ROOT, file)}`);
}

main()
  .then(() => { print(); save(); })
  .catch((error) => {
    report.ok = false;
    report.error = error && error.message ? error.message : String(error);
    console.error(`\n[실패] ${report.error}`);
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timeout/i.test(report.error)) console.error('  → 인터넷 연결, Supabase 프로젝트 일시정지 여부, DATABASE_URL 호스트를 확인해 주세요.');
    if (/password authentication|SASL/i.test(report.error)) console.error('  → DATABASE_URL 의 비밀번호가 맞는지 확인해 주세요.');
    save();
    process.exit(1);
  });
