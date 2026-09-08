#!/usr/bin/env node
'use strict';

/**
 * scripts/seed-contractable-project.js
 *
 * contracts-payments(합의→서명→결제→납품→정산) 플로우를 실제 DB(Prisma/Supabase)로
 * 테스트하려면 CONTRACT_PENDING 상태의 프로젝트(의뢰인·프리랜서·수락된 지원)가 먼저
 * 있어야 한다. 이 스크립트는 그 상태를 "실제 비즈니스 로직을 통해서" 만들어 준다 —
 * DB에 행을 직접 꽂아 넣지 않는다.
 *
 * 하는 일 (전부 실제 HTTP API 호출):
 *   1. Supabase 관리자 API로 의뢰인·프리랜서 계정 2개를 만들고 이메일 확인을 건너뛴다
 *      (실제 메일함을 열어 링크를 클릭할 수 없으므로).
 *   2. 서버의 실제 회원가입(register) → 로그인(login) API를 그대로 호출해 로컬 users
 *      테이블 행을 만들고 access token을 발급받는다. (auth.service.ts의
 *      resolveOrCreateIntentUser 경로 — completeRegistration이 아니라 login 한 번으로
 *      끝난다. 자세한 이유는 이 파일 하단 주석 참고.)
 *   3. 의뢰인 토큰으로 실제 프로젝트 등록 API를 호출한다.
 *   4. 프리랜서 토큰으로 실제 지원 API를 호출한다.
 *   5. 의뢰인 토큰으로 실제 지원 수락 API를 호출한다 — 여기서 프로젝트가
 *      CONTRACT_PENDING으로 전이된다 (project-management 내부 계약 경유).
 *
 * 실행 전제:
 *   - 이 서버가 AUTH_PROVIDER_MODE=supabase로 로컬에서 떠 있어야 한다(mock 모드면 4번
 *     계정이 FK 위반을 일으킨다 — express-app.ts의 isPrismaConfigured 주석 참고).
 *     npm run dev 실행 시 "mock 인증으로 띄울까요?" 질문에 N으로 답하거나,
 *     AUTH_PROVIDER_MODE=supabase npm run dev:run 으로 띄운다.
 *   - DATABASE_URL이 실제 Supabase Postgres를 가리켜야 한다 (Prisma 리포지토리가 붙는다).
 *   - 리포 루트 .env에 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY /
 *     WEB_ORIGIN이 채워져 있어야 한다.
 *
 * 실행:
 *   node scripts/seed-contractable-project.js
 *   (서버 주소를 바꾸려면) SERVER_BASE_URL=http://localhost:3000 node scripts/seed-contractable-project.js
 *
 * 이 스크립트는 이 샌드박스 안에서 실행되지 않는다 — Supabase/로컬 DB로 나가는 네트워크가
 * 여기서는 막혀 있다. 팀장 로컬 환경에서 실행해야 한다.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..');

/** 리포 루트 .env를 최소한으로 읽는다. 이미 설정된 환경변수는 덮어쓰지 않는다
 *  (express-app.ts가 쓰는 dotenv override:false 관례와 맞춘다). 외부 패키지 의존 없음 —
 *  이 스크립트는 리포 루트(dotenv 미설치)에서도, app/server에서도 그대로 돌아가야 한다. */
function loadRootEnv() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadRootEnv();

const SERVER_BASE_URL = process.env.SERVER_BASE_URL ?? 'http://localhost:3000';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEB_ORIGIN = (process.env.WEB_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0];

function requireEnv(name, value) {
  if (!value) {
    console.error(`[seed] .env에 ${name}이(가) 없습니다. 리포 루트 .env를 확인해 주세요.`);
    process.exit(1);
  }
}
requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
requireEnv('WEB_ORIGIN', WEB_ORIGIN);

async function loadSupabaseAdminClient() {
  // @supabase/supabase-js는 리포 루트 node_modules에 이미 있다 (app/web·app/server와 공용
  // 의존성). require()는 CJS 진입점을 그대로 쓴다.
  const { createClient } = require('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function randomSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

async function api(pathname, { method = 'GET', body, accessToken, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (origin) headers.Origin = origin;
  const res = await fetch(`${SERVER_BASE_URL}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // 204 등 본문 없는 응답
  }
  return { status: res.status, body: json };
}

/**
 * 계정 하나를 만들고 access token까지 발급받는다.
 *
 * register()는 성공 여부를 노출하지 않는 202("접수했습니다")만 돌려준다 (보안 설계 —
 * auth.service.ts register() 주석 참고). authUserId를 얻으려면 Supabase 관리자 API로
 * 이메일로 사용자를 직접 찾아야 한다.
 */
async function createSeedAccount(supabaseAdmin, { role, namePrefix }) {
  const suffix = randomSuffix();
  const email = `pactfive.seed.${role.toLowerCase()}.${suffix}@example.com`;
  const password = `Seed!${suffix}Aa1`; // 8자 이상 조건 충족
  const name = `${namePrefix} 시드 계정 ${suffix}`;

  console.log(`[seed] ${role} 계정 등록 중: ${email}`);
  const registerRes = await api('/api/v1/auth/registrations', {
    method: 'POST',
    origin: WEB_ORIGIN,
    body: { email, password, name, role, returnTo: '/' },
  });
  if (registerRes.status !== 202) {
    throw new Error(
      `[${role}] 회원가입 요청 실패 (status ${registerRes.status}): ${JSON.stringify(registerRes.body)}`,
    );
  }

  // Supabase 관리자 API로 방금 만든 계정을 이메일로 찾는다. JS SDK의 admin.listUsers()는
  // 이메일 필터를 지원하지 않는 버전이 있어, 페이지를 돌며 직접 찾는다 — 새로 만든
  // 테스트 계정이라 앞쪽 페이지에서 곧 찾을 가능성이 높다.
  let authUserId = null;
  for (let page = 1; page <= 20 && !authUserId; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`[${role}] Supabase listUsers 실패: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) authUserId = found.id;
    if (data.users.length < 200) break; // 마지막 페이지
  }
  if (!authUserId) {
    throw new Error(
      `[${role}] Supabase에서 방금 만든 계정(${email})을 찾지 못했습니다. Supabase 대시보드에서 수동 확인이 필요할 수 있습니다.`,
    );
  }

  // 이메일 확인 없이 즉시 확인 처리 — 실제 메일함을 열 수 없으므로.
  const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    email_confirm: true,
  });
  if (confirmError) throw new Error(`[${role}] 이메일 확인 처리 실패: ${confirmError.message}`);

  // 서버의 실제 로그인 API. 로컬 users 행이 아직 없으므로 서버가
  // resolveOrCreateIntentUser 경로를 타 registrationIntent(1단계에서 저장됨)의
  // name/role로 로컬 사용자를 만들고, 그대로 세션까지 발급한다 — completeRegistration을
  // 별도로 부를 필요가 없다.
  const loginRes = await api('/api/v1/auth/sessions', {
    method: 'POST',
    origin: WEB_ORIGIN,
    body: { email, password },
  });
  if (loginRes.status !== 200) {
    throw new Error(`[${role}] 로그인 실패 (status ${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
  }

  console.log(`[seed] ${role} 계정 준비 완료: userId=${loginRes.body.user.userId}`);
  return {
    email,
    password,
    authUserId,
    userId: loginRes.body.user.userId,
    accessToken: loginRes.body.accessToken,
    accessTokenExpiresAt: loginRes.body.accessTokenExpiresAt,
  };
}

async function main() {
  const supabaseAdmin = await loadSupabaseAdminClient();

  const client = await createSeedAccount(supabaseAdmin, { role: 'CLIENT', namePrefix: '의뢰인' });
  const freelancer = await createSeedAccount(supabaseAdmin, { role: 'FREELANCER', namePrefix: '프리랜서' });

  // 3. 의뢰인 — 실제 프로젝트 등록 API
  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log('[seed] 프로젝트 등록 중...');
  const projectRes = await api('/api/v1/projects', {
    method: 'POST',
    accessToken: client.accessToken,
    body: {
      title: 'contracts-payments 테스트용 시드 프로젝트',
      description:
        '이 프로젝트는 contracts-payments 플로우(합의→서명→결제→납품→정산)를 실제 DB로 ' +
        '테스트하기 위해 scripts/seed-contractable-project.js가 자동 생성했습니다.',
      category: 'WEB_DEVELOPMENT',
      recruitmentStartAt: null,
      recruitmentDeadlineAt: deadline,
      budgetAmount: 3_000_000,
      skillIds: ['REACT', 'NODEJS'],
      pricingAnalysisId: null,
    },
  });
  if (projectRes.status !== 201) {
    throw new Error(`프로젝트 등록 실패 (status ${projectRes.status}): ${JSON.stringify(projectRes.body)}`);
  }
  const projectId = projectRes.body.projectId;
  console.log(`[seed] 프로젝트 생성됨: projectId=${projectId}`);

  // 4. 프리랜서 — 실제 지원 API
  console.log('[seed] 지원서 제출 중...');
  const applyRes = await api(`/api/v1/projects/${projectId}/applications`, {
    method: 'POST',
    accessToken: freelancer.accessToken,
    body: {
      coverLetter:
        '안녕하세요. contracts-payments 테스트를 위해 자동 생성된 지원서입니다. '.repeat(3),
      expectedAmount: 3_000_000,
      expectedDurationDays: 14,
    },
  });
  if (applyRes.status !== 201) {
    throw new Error(`지원 실패 (status ${applyRes.status}): ${JSON.stringify(applyRes.body)}`);
  }
  const applicationId = applyRes.body.applicationId;
  console.log(`[seed] 지원 생성됨: applicationId=${applicationId}`);

  // 5. 의뢰인 — 실제 지원 수락 API (여기서 CONTRACT_PENDING 전이)
  console.log('[seed] 지원 수락 중...');
  const acceptRes = await api(`/api/v1/applications/${applicationId}/accept`, {
    method: 'POST',
    accessToken: client.accessToken,
  });
  if (acceptRes.status !== 200) {
    throw new Error(`지원 수락 실패 (status ${acceptRes.status}): ${JSON.stringify(acceptRes.body)}`);
  }
  console.log('[seed] 지원 수락 완료 — 프로젝트가 CONTRACT_PENDING 상태로 전이됐어야 합니다.');

  console.log('\n========================================');
  console.log('완료. 아래 정보로 contracts-payments 엔드포인트를 계속 테스트하세요.');
  console.log('========================================');
  console.log(
    JSON.stringify(
      {
        projectId,
        applicationId,
        client: {
          userId: client.userId,
          email: client.email,
          password: client.password,
          accessToken: client.accessToken,
          accessTokenExpiresAt: client.accessTokenExpiresAt,
        },
        freelancer: {
          userId: freelancer.userId,
          email: freelancer.email,
          password: freelancer.password,
          accessToken: freelancer.accessToken,
          accessTokenExpiresAt: freelancer.accessTokenExpiresAt,
        },
      },
      null,
      2,
    ),
  );
  console.log(
    '\naccessToken 만료 후에는 각 계정의 email/password로 POST /api/v1/auth/sessions ' +
      `(Origin: ${WEB_ORIGIN}) 를 다시 호출해 재로그인할 수 있습니다.`,
  );
}

main().catch((error) => {
  console.error('\n[seed] 실패:', error.message);
  process.exit(1);
});
