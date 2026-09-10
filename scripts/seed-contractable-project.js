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
 * 하는 일:
 *   1. 의뢰인·프리랜서 계정 2개를 scripts/lib/bootstrap-seed-user.ts로 만든다 —
 *      Supabase Admin API(auth.admin.createUser, 확인 이메일을 보내지 않는 경로)로 Auth
 *      계정을 만들고, 로컬 users 테이블 행도 같은 스크립트가 Prisma로 직접 INSERT한다
 *      (2026-09-10 변경 — 예전엔 공개 signUp을 거쳐서 Confirm Email 설정에 따라 이메일
 *      발송 rate limit이나 서버의 설정 오류 가드에 막혔다. 이유는 그 파일 헤더 주석 참고).
 *   2. 그 계정으로 서버의 실제 로그인(login) API를 호출해 access token을 받는다(이메일을
 *      보내지 않는 경로라 손대지 않았다).
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
// 2026-09-10 추가 — seed-dev-accounts.js와 같은 이유(주석 참고): Supabase Auth가 signUp
// 단계에서 @example.com을 "invalid" (code: email_address_invalid)로 거부해서 바꿨다.
const SEED_EMAIL_DOMAIN = process.env.SEED_EMAIL_DOMAIN ?? 'pactfive-dev-seed.com';

function requireEnv(name, value) {
  if (!value) {
    console.error(`[seed] .env에 ${name}이(가) 없습니다. 리포 루트 .env를 확인해 주세요.`);
    process.exit(1);
  }
}
requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
requireEnv('WEB_ORIGIN', WEB_ORIGIN);
// 2026-09-10 추가 — 계정 부트스트랩이 scripts/lib/bootstrap-seed-user.ts(Prisma 직접
// INSERT)를 거치면서 DATABASE_URL도 필수가 됐다(문서 §준비물에는 이미 있었지만 실제
// 검증은 안 하고 있었다). 없으면 tsx 하위 프로세스 안에서 애매한 에러로 죽는 대신 여기서
// 먼저 명확하게 막는다.
requireEnv('DATABASE_URL', process.env.DATABASE_URL);

function randomSuffix() {
  return crypto.randomBytes(4).toString('hex');
}

async function api(pathname, { method = 'GET', body, accessToken, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (origin) headers.Origin = origin;
  const url = `${SERVER_BASE_URL}${pathname}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    // fetch()의 TypeError('fetch failed')는 메시지만으로는 원인을 알 수 없다 — 실제 이유는
    // error.cause에 있다(ECONNREFUSED 등). 여기서 붙여서 던져야 main().catch에서 보인다.
    const cause = error.cause ? ` — 원인: ${error.cause.code ?? error.cause.message ?? error.cause}` : '';
    throw new Error(
      `${url} 요청 자체가 실패했습니다${cause}\n` +
        `[seed] 서버가 ${SERVER_BASE_URL}에서 떠 있는지 확인하세요 — ` +
        `npm run dev를 AUTH_PROVIDER_MODE=supabase(mock 아님)로 실행했는지, ` +
        `SERVER_BASE_URL을 커스텀했다면 포트가 맞는지 확인하세요.`,
    );
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    // 204 등 본문 없는 응답
  }
  return { status: res.status, body: json };
}

// 2026-09-10 — seed-dev-accounts.js와 같은 이유로 공개 signUp(POST /api/v1/auth/registrations)
// 경로를 버렸다: Confirm Email이 켜져 있으면 이 호출마다 Supabase가 실제 확인 이메일을
// 보내려고 시도해 시간당 2통 제한에 걸리고, 꺼져 있으면 서버가 즉시-세션 응답을 설정
// 오류로 보고 무조건 503으로 막는다. scripts/lib/bootstrap-seed-user.ts(Supabase Admin API
// + 로컬 users 테이블 직접 INSERT)로 우회한다 — 자세한 이유는 그 파일 헤더 주석 참고.
// node_modules/.bin/tsx(확장자 없음)는 POSIX shebang 스크립트라 Windows에서
// execFileSync로 직접 실행하면 ENOENT가 난다(2026-09-10, 실제 Windows 실행에서 재현) —
// cmd.exe는 shebang을 모른다. tsx 패키지의 실제 CLI 엔트리(node_modules/tsx/dist/cli.mjs)를
// `node`로 직접 실행해 셸 shim을 아예 거치지 않는다 — OS 불문 동일하게 동작한다.
const TSX_CLI_PATH = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const BOOTSTRAP_HELPER_PATH = path.join(__dirname, 'lib', 'bootstrap-seed-user.ts');

function bootstrapAccountViaAdminApi({ email, password, name, role }) {
  const { execFileSync } = require('node:child_process');
  const payload = JSON.stringify({ email, password, name, role });
  let stdout;
  try {
    stdout = execFileSync(process.execPath, [TSX_CLI_PATH, BOOTSTRAP_HELPER_PATH, payload], {
      cwd: REPO_ROOT,
      env: process.env,
      encoding: 'utf8',
    });
  } catch (error) {
    const stderrText = (error.stderr ?? '').toString().trim();
    let reason = stderrText || error.message;
    try {
      reason = JSON.parse(stderrText).error ?? reason;
    } catch {
      // stderr가 JSON이 아니면(예: tsx 자체 크래시) 원문 그대로 둔다.
    }
    throw new Error(`[${role}] Supabase/DB 계정 부트스트랩 실패: ${reason}`);
  }
  const lastLine = stdout.trim().split('\n').pop();
  return JSON.parse(lastLine);
}

/**
 * 계정 하나를 만들고 access token까지 발급받는다. Supabase Auth 생성 + 로컬 users 행
 * INSERT는 bootstrapAccountViaAdminApi가 맡고(이메일 발송 없음), 여기서는 그 결과로
 * 실제 로그인 API만 호출해 access token을 받는다.
 */
async function createSeedAccount({ role, namePrefix }) {
  const suffix = randomSuffix();
  const email = `pactfive.seed.${role.toLowerCase()}.${suffix}@${SEED_EMAIL_DOMAIN}`;
  const password = `Seed!${suffix}Aa1`; // 8자 이상 조건 충족
  const name = `${namePrefix} 시드 계정 ${suffix}`;

  console.log(`[seed] ${role} 계정 부트스트랩 중: ${email}`);
  const bootstrap = bootstrapAccountViaAdminApi({ email, password, name, role });
  console.log(`[seed] ${role} 계정 Supabase/DB 준비 완료 (authUserId=${bootstrap.authUserId})`);

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
    authUserId: bootstrap.authUserId,
    userId: loginRes.body.user.userId,
    accessToken: loginRes.body.accessToken,
    accessTokenExpiresAt: loginRes.body.accessTokenExpiresAt,
  };
}

async function main() {
  const client = await createSeedAccount({ role: 'CLIENT', namePrefix: '의뢰인' });
  const freelancer = await createSeedAccount({ role: 'FREELANCER', namePrefix: '프리랜서' });

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
