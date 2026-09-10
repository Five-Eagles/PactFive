#!/usr/bin/env node
'use strict';

/**
 * scripts/seed-dev-accounts.js
 *
 * npm run dev에서 mock 인증(N)을 끄고 실제 Supabase 인증으로 띄웠을 때, 각 기능 담당자가
 * 자기 화면을 바로 테스트할 수 있도록 "기능별로 적절한 상태를 이미 갖춘" 계정 8개를
 * 만든다. app/web의 DevAuthToggle이 이 결과(.dev-accounts.local.json)를 읽어 화면에서
 * 계정을 골라 로그인할 수 있게 해준다.
 *
 * scripts/seed-contractable-project.js와 같은 원칙 — DB에 값을 직접 꽂지 않는다. 전부 실제
 * 로 떠 있는 서버의 API를 순서대로 호출한다. 다른 점은 이메일이 매번 랜덤이 아니라
 * 고정이라는 것 — 재실행해도 계정이 늘어나지 않고, 이미 만든 상태를 그대로 재사용한다
 * (idempotent). 이미 있는 계정·프로젝트·지원·계약을 발견하면 새로 만들지 않고 건너뛴다.
 *
 * 실행 전제는 scripts/seed-contractable-project.md와 같다(AUTH_PROVIDER_MODE=supabase로
 * 서버가 떠 있어야 함, .env에 SUPABASE_*·DATABASE_URL·WEB_ORIGIN 필요). 자세한 설명은
 * scripts/seed-dev-accounts.md 참고.
 *
 * 실행: npm run seed:dev-accounts
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE_PATH = path.join(REPO_ROOT, '.dev-accounts.local.json');

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
// 2026-09-09 추가 — "마감 처리" 시나리오(아래 ensureRecruitmentClosed)에만 쓴다. 없으면
// 그 시나리오 하나만 건너뛰고 나머지 8개 계정은 그대로 만든다(다른 필수 env처럼
// requireEnv로 죽이지 않는다 — 이건 선택 기능이다, CR-0001 §4 운영 게이트와 같은 값).
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;
// 2026-09-10 추가 — 원래 @example.com을 썼는데, Supabase Auth가 signUp 단계에서
// "Email address ... is invalid" (code: email_address_invalid, status 400)로 거부한다.
// RFC 2606이 example.com/net/org를 "절대 실제로 쓰이면 안 되는 예약 도메인"으로 정해 둔
// 값이라, Supabase가 이 도메인들을 자체적으로 차단하는 것으로 보인다(공식 문서에 명시된
// 동작은 아니고, 실제 이 프로젝트에서 재현된 증상 기준). env로 바꿀 수 있게 해서, 이 값도
// 막히면 코드를 다시 고치지 않고 .env의 SEED_EMAIL_DOMAIN만 바꾸면 되게 했다.
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

// 전부 가짜 계정(SEED_EMAIL_DOMAIN)이라 고정 비밀번호를 코드에 둬도 안전하다(auth.mock.ts의
// 고정 mock 토큰과 같은 성격). 결과 파일(.dev-accounts.local.json)은 .gitignore에 있다.
const SEED_PASSWORD = 'PactFiveSeedDev!1';

async function loadSupabaseAdminClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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
    // fetch()가 던지는 TypeError('fetch failed')는 메시지 자체가 원인을 안 알려준다 —
    // 실제 이유(ECONNREFUSED 등)는 error.cause에 있는데 그냥 두면 위쪽 main().catch에서
    // error.message만 찍혀 "fetch failed"만 보이고 끝난다. 여기서 원인을 붙여 던진다.
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
    // 본문 없는 응답
  }
  return { status: res.status, body: json };
}

async function findSupabaseUserIdByEmail(supabaseAdmin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Supabase listUsers 실패: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 계정 명세 — 기능별로 필요한 "이미 갖춰진 상태"를 여기서 결정한다. 새 페르소나가
// 필요해지면 이 배열에 추가하고 아래 조립 순서에 연결한다.
// ---------------------------------------------------------------------------
const ACCOUNTS = [
  {
    key: 'client-fresh',
    role: 'CLIENT',
    email: `seed.client.fresh@${SEED_EMAIL_DOMAIN}`,
    label: '의뢰인 · 신규',
    feature: 'user-management / ai-pricing',
    description: '프로젝트가 아직 없는 갓 가입한 의뢰인. 프로필 화면, AI 견적(프로젝트 등록 전) 테스트용.',
  },
  {
    key: 'freelancer-fresh',
    role: 'FREELANCER',
    email: `seed.freelancer.fresh@${SEED_EMAIL_DOMAIN}`,
    label: '프리랜서 · 신규',
    feature: 'user-management / engagement',
    description: '지원·북마크가 없는 갓 가입한 프리랜서. 프로필, 프로젝트 탐색·북마크 토글 테스트용.',
  },
  {
    key: 'client-recruiting',
    role: 'CLIENT',
    email: `seed.client.recruiting@${SEED_EMAIL_DOMAIN}`,
    label: '의뢰인 · 모집 중 프로젝트',
    feature: 'project-management',
    description:
      '모집 중(RECRUITING) 프로젝트 1개 보유. 프로젝트 수정·마감·재모집·취소, 그리고 지원 수락/거절(freelancer-applicant가 이미 지원해 둠) 테스트용.',
  },
  {
    key: 'freelancer-applicant',
    role: 'FREELANCER',
    email: `seed.freelancer.applicant@${SEED_EMAIL_DOMAIN}`,
    label: '프리랜서 · 지원(PENDING) 상태',
    feature: 'applications',
    description: 'client-recruiting의 프로젝트에 지원서(PENDING)를 낸 상태. 내 지원 목록/상세 화면 테스트용.',
  },
  {
    key: 'client-contract-pending',
    role: 'CLIENT',
    email: `seed.client.contract-pending@${SEED_EMAIL_DOMAIN}`,
    label: '의뢰인 · 계약 대기(합의 전)',
    feature: 'contracts-payments (합의)',
    description: '지원 수락까지 끝나 CONTRACT_PENDING인 프로젝트의 의뢰인. 합의 제안 테스트용.',
  },
  {
    key: 'freelancer-contract-pending',
    role: 'FREELANCER',
    email: `seed.freelancer.contract-pending@${SEED_EMAIL_DOMAIN}`,
    label: '프리랜서 · 계약 대기(합의 전)',
    feature: 'contracts-payments (합의)',
    description: 'client-contract-pending과 짝. 합의 수락 테스트용.',
  },
  {
    key: 'client-payment-ready',
    role: 'CLIENT',
    email: `seed.client.payment-ready@${SEED_EMAIL_DOMAIN}`,
    label: '의뢰인 · 서명 완료·결제 준비',
    feature: 'contracts-payments (결제~납품) / reviews',
    description:
      '합의·서명까지 끝나고 결제 준비(clientKey 발급)까지 된 상태. 결제 확정 이후(브라우저 필요)와 그 다음 정산까지는 문서(scripts/seed-dev-accounts.md) 안내를 따라 한 번 더 진행해야 reviews 테스트가 가능해진다.',
  },
  {
    key: 'freelancer-payment-ready',
    role: 'FREELANCER',
    email: `seed.freelancer.payment-ready@${SEED_EMAIL_DOMAIN}`,
    label: '프리랜서 · 서명 완료·결제 준비',
    feature: 'contracts-payments (결제~납품) / reviews',
    description: 'client-payment-ready와 짝.',
  },
  {
    key: 'client-recruitment-closed',
    role: 'CLIENT',
    email: `seed.client.closed@${SEED_EMAIL_DOMAIN}`,
    label: '의뢰인 · 마감 처리 완료(CLOSED)',
    feature: 'project-management / applications',
    description:
      '등록 직후 마감되도록 짧은 마감 시각으로 만든 뒤 /internal/v1/projects/sweep-deadlines를 직접 호출해 실제로 CLOSED까지 밀어붙인 프로젝트. 대기 중이던 지원자는 자동거절(AUTO_REJECTED)된다 — "마감된 프로젝트" 화면, 지원자 자동거절 목록 테스트용. INTERNAL_SERVICE_TOKEN이 .env에 없으면 이 계정 쌍은 건너뛴다.',
  },
  {
    key: 'freelancer-auto-rejected',
    role: 'FREELANCER',
    email: `seed.freelancer.auto-rejected@${SEED_EMAIL_DOMAIN}`,
    label: '프리랜서 · 마감으로 자동거절(AUTO_REJECTED)',
    feature: 'applications',
    description: 'client-recruitment-closed의 프로젝트에 PENDING으로 지원한 뒤 마감 스윕으로 자동거절된 상태. 내 지원 목록에서 AUTO_REJECTED 사유 표시 테스트용.',
  },
];

const MARKER = {
  recruiting: '[시드:project-management] 모집 중 테스트 프로젝트',
  contractPending: '[시드:contracts-payments] 계약대기 테스트 프로젝트',
  paymentReady: '[시드:contracts-payments] 결제준비 테스트 프로젝트',
  closed: '[시드:project-management] 마감 처리 테스트 프로젝트',
};

/**
 * 회원가입 → (필요시) 강제 확인 → 로그인을 한 번 시도한다. 실패하면 {@link ensureAccount}가
 * 해석해서 재시도할지 판단할 수 있도록, 성공 시 세션을, 실패 시 원인 진단에 필요한 정보를
 * 그대로 담은 객체를 던진다(throw하지 않는다 — 호출부에서 로그인 실패 body를 봐야 하므로).
 */
async function attemptRegisterConfirmLogin(supabaseAdmin, persona) {
  const { email, role, label } = persona;

  console.log(`[seed] ${persona.key}: 신규 생성 시도 중 (${email})`);
  const registerRes = await api('/api/v1/auth/registrations', {
    method: 'POST',
    origin: WEB_ORIGIN,
    body: { email, password: SEED_PASSWORD, name: label, role, returnTo: '/' },
  });

  // status가 202가 아니어도 곧바로 포기하지 않는다 — 이전에 여기서 한 번 끊긴 실행(잘못된
  // 이메일 도메인, 이메일 발송 rate limit 등으로 이번 세션에서 실제로 여러 번 겪은 상황)이
  // Supabase 쪽에는 signUp까지 성공시켜 뒀는데 이메일 확인·로컬 동기화 전에 죽었을 수 있다.
  // 이 경우 register()는 Supabase의 422 user_already_exists를 받아서 실패하지만
  // (auth.service.ts가 클라이언트에는 일부러 뭉뚱그린 AUTH_PROVIDER_UNAVAILABLE만 준다 —
  // 이메일 존재 여부를 노출하지 않으려는 의도적 보안 설계, 여기서 고치면 안 된다), 실제로는
  // 아래의 "Supabase 관리자 API로 찾아서 강제 확인 후 로그인"으로 복구 가능할 수 있다.
  if (registerRes.status !== 202) {
    console.log(
      `[seed] ${persona.key}: 회원가입 응답이 202가 아님 (status ${registerRes.status}) — ` +
        'Supabase에는 이미 있는 계정일 수 있어 강제 확인·재로그인으로 복구를 시도합니다.',
    );
  }

  const authUserId = await findSupabaseUserIdByEmail(supabaseAdmin, email);
  if (!authUserId) {
    return {
      ok: false,
      recoverable: false,
      authUserId: null,
      reason:
        `회원가입 실패(status ${registerRes.status}: ${JSON.stringify(registerRes.body)})했고, ` +
        `Supabase에서도 이 이메일(${email})을 가진 계정을 찾지 못했습니다 — 복구할 수 없는 상태입니다.`,
    };
  }
  const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, { email_confirm: true });
  if (confirmError) {
    return {
      ok: false,
      recoverable: false,
      authUserId,
      reason: `이메일 확인 처리 실패: ${confirmError.message}`,
    };
  }

  const loginRes = await api('/api/v1/auth/sessions', {
    method: 'POST',
    origin: WEB_ORIGIN,
    body: { email, password: SEED_PASSWORD },
  });
  if (loginRes.status !== 200) {
    // REGISTRATION_NOT_AVAILABLE(403) — auth.service.ts의 login()이 Supabase 확인은 됐지만
    // 로컬 registrationIntent가 없어서(또는 만료돼서) 로컬 계정을 자동으로 못 만든다는 뜻이다.
    // 우리 seed 흐름에서는 "이전 실행이 signUp까지만 성공시키고 intent 저장 전에 죽었을 때"
    // 정확히 이 상태가 된다 — 이 Supabase 계정은 로그인으로 절대 복구되지 않으므로, 삭제하고
    // 처음부터 다시 회원가입해야 한다(재시도하면 registrationIntent가 새로 저장된다).
    const code = loginRes.body?.error?.code;
    return {
      ok: false,
      recoverable: code === 'REGISTRATION_NOT_AVAILABLE',
      authUserId,
      reason:
        `강제 확인 후에도 로그인 실패 (status ${loginRes.status}): ${JSON.stringify(loginRes.body)}` +
        (code === 'REGISTRATION_NOT_AVAILABLE'
          ? ' — Supabase에는 계정이 있지만 로컬 registrationIntent가 없어(이전 실행이 signUp 직후 끊김) 자동 복구가 불가능합니다. 이 Supabase 계정을 삭제하고 재시도합니다.'
          : ' — Supabase에 이 이메일로 다른 비밀번호의 계정이 이미 있을 수 있습니다(고정 SEED_PASSWORD와 불일치).'),
    };
  }

  console.log(`[seed] ${persona.key}: 생성/복구 완료 (userId=${loginRes.body.user.userId})`);
  return {
    ok: true,
    session: { ...persona, userId: loginRes.body.user.userId, accessToken: loginRes.body.accessToken, password: SEED_PASSWORD },
  };
}

async function ensureAccount(supabaseAdmin, persona) {
  const { email } = persona;

  // 빠른 경로 — 이미 완전히 준비된 계정이면 로그인 한 번으로 끝난다(재실행 시 매번
  // Supabase 관리자 API를 부르지 않아도 되게).
  const quickLogin = await api('/api/v1/auth/sessions', {
    method: 'POST',
    origin: WEB_ORIGIN,
    body: { email, password: SEED_PASSWORD },
  });
  if (quickLogin.status === 200) {
    console.log(`[seed] ${persona.key}: 기존 계정 재사용`);
    return { ...persona, userId: quickLogin.body.user.userId, accessToken: quickLogin.body.accessToken, password: SEED_PASSWORD };
  }

  const first = await attemptRegisterConfirmLogin(supabaseAdmin, persona);
  if (first.ok) return first.session;

  if (!first.recoverable) {
    throw new Error(`[${persona.key}] ${first.reason}`);
  }

  // 2026-09-10 추가 — REGISTRATION_NOT_AVAILABLE(로컬 intent 없음)은 로그인으로 복구가 안
  // 되므로, 그 "고아" Supabase 계정을 지우고 한 번만 더 처음부터 시도한다. 이번엔 Supabase에
  // 계정이 없는 상태에서 다시 시작하므로 register()가 정상적으로 registrationIntent까지
  // 저장하고 끝난다(이메일 발송 rate limit·잘못된 도메인 문제가 이미 해결된 상태라는 전제).
  console.log(`[seed] ${persona.key}: ${first.reason}`);
  if (first.authUserId) {
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(first.authUserId);
    if (deleteError) {
      throw new Error(`[${persona.key}] 고아 계정 삭제 실패: ${deleteError.message} — 직접 Supabase 대시보드에서 정리해 주세요.`);
    }
    console.log(`[seed] ${persona.key}: 고아 Supabase 계정 삭제 완료 — 재시도합니다.`);
  }

  const second = await attemptRegisterConfirmLogin(supabaseAdmin, persona);
  if (second.ok) return second.session;
  throw new Error(`[${persona.key}] 재시도 후에도 실패: ${second.reason}`);
}

async function ensureProject(clientSession, markerTitle) {
  const mine = await api(`/api/v1/clients/${clientSession.userId}/projects`, {
    accessToken: clientSession.accessToken,
  });
  if (mine.status !== 200) throw new Error(`프로젝트 목록 조회 실패: ${JSON.stringify(mine.body)}`);
  const existing = mine.body.items.find((p) => p.title === markerTitle);
  if (existing) return existing;

  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const created = await api('/api/v1/projects', {
    method: 'POST',
    accessToken: clientSession.accessToken,
    body: {
      title: markerTitle,
      description: '시드 스크립트(scripts/seed-dev-accounts.js)가 자동 생성한 테스트용 프로젝트입니다.',
      category: 'WEB_DEVELOPMENT',
      recruitmentStartAt: null,
      recruitmentDeadlineAt: deadline,
      budgetAmount: 3_000_000,
      skillIds: ['REACT', 'NODEJS'],
      pricingAnalysisId: null,
    },
  });
  if (created.status !== 201) throw new Error(`프로젝트 생성 실패: ${JSON.stringify(created.body)}`);
  return created.body;
}

async function ensureApplication(freelancerSession, projectId) {
  const mine = await api('/api/v1/applications/me', { accessToken: freelancerSession.accessToken });
  if (mine.status !== 200) throw new Error(`지원 목록 조회 실패: ${JSON.stringify(mine.body)}`);
  const existing = (mine.body.items ?? []).find((a) => a.projectId === projectId);
  if (existing) return existing;

  const applied = await api(`/api/v1/projects/${projectId}/applications`, {
    method: 'POST',
    accessToken: freelancerSession.accessToken,
    body: {
      coverLetter: '시드 스크립트가 자동 생성한 지원서입니다. '.repeat(4),
      expectedAmount: 3_000_000,
      expectedDurationDays: 14,
    },
  });
  if (applied.status !== 201) throw new Error(`지원 실패: ${JSON.stringify(applied.body)}`);
  return applied.body;
}

/** 프로젝트를 CONTRACT_PENDING까지 밀어붙인다(이미 그 이상이면 그대로 둔다). */
async function ensureContractPending(clientSession, freelancerSession, markerTitle) {
  const project = await ensureProject(clientSession, markerTitle);
  if (project.transactionStatus && project.transactionStatus !== 'NONE') {
    return project; // 이미 CONTRACT_PENDING 이상 — 재사용.
  }

  const application = await ensureApplication(freelancerSession, project.projectId);
  if (application.status === 'PENDING') {
    const accept = await api(`/api/v1/applications/${application.applicationId}/accept`, {
      method: 'POST',
      accessToken: clientSession.accessToken,
    });
    if (accept.status !== 200) throw new Error(`지원 수락 실패: ${JSON.stringify(accept.body)}`);
  }

  const mine = await api(`/api/v1/clients/${clientSession.userId}/projects`, {
    accessToken: clientSession.accessToken,
  });
  return (mine.body.items ?? []).find((p) => p.projectId === project.projectId) ?? project;
}

async function getCurrentNegotiation(session, projectId) {
  const res = await api(`/api/v1/projects/${projectId}/negotiation-offers/current`, {
    accessToken: session.accessToken,
  });
  if (res.status !== 200) throw new Error(`합의 현황 조회 실패: ${JSON.stringify(res.body)}`);
  return res.body;
}

/**
 * CONTRACT_PENDING → 합의 제안·수락 → 서명(양쪽) → 결제 준비(clientKey 발급)까지.
 * 결제 확정(confirmPayment)은 실제 토스 결제위젯이 필요해 여기서 멈춘다(문서 참고).
 */
async function ensurePaymentReady(clientSession, freelancerSession, projectId) {
  let current = await getCurrentNegotiation(clientSession, projectId);

  if (!current.agreementId) {
    const propose = await api(`/api/v1/projects/${projectId}/negotiation-offers`, {
      method: 'POST',
      accessToken: clientSession.accessToken,
      body: { amount: 3_000_000 },
    });
    if (propose.status !== 200) throw new Error(`합의 제안 실패: ${JSON.stringify(propose.body)}`);
    current = propose.body;
  }

  if (current.agreementStatus === 'PROPOSED' && current.offer?.offeredByUserId === clientSession.userId) {
    const accept = await api(
      `/api/v1/projects/${projectId}/negotiation-offers/${current.offer.offerId}/accept`,
      {
        method: 'POST',
        accessToken: freelancerSession.accessToken,
        body: { expectedRound: current.offer.round },
      },
    );
    if (accept.status !== 200) throw new Error(`합의 수락 실패: ${JSON.stringify(accept.body)}`);
    current = accept.body;
  }

  if (!current.contractId) {
    throw new Error(
      '계약이 아직 만들어지지 않았습니다 — 합의 상태가 REJECTED 등으로 어긋났을 수 있습니다. ' +
        '이 계정으로 화면에서 직접 진행 상태를 바꾼 적이 있다면 문서의 "알려진 한계"를 참고하세요.',
    );
  }
  const contractId = current.contractId;

  let contract = await api(`/api/v1/contracts/${contractId}`, { accessToken: clientSession.accessToken });
  if (contract.status !== 200) throw new Error(`계약 조회 실패: ${JSON.stringify(contract.body)}`);

  if (contract.body.status !== 'SIGNED') {
    if (!contract.body.clientSignedAt) {
      const sign = await api(`/api/v1/contracts/${contractId}/sign`, {
        method: 'POST',
        accessToken: clientSession.accessToken,
      });
      if (sign.status !== 200) throw new Error(`의뢰인 서명 실패: ${JSON.stringify(sign.body)}`);
    }
    contract = await api(`/api/v1/contracts/${contractId}`, { accessToken: clientSession.accessToken });
    if (contract.body.status !== 'SIGNED' && !contract.body.freelancerSignedAt) {
      const sign = await api(`/api/v1/contracts/${contractId}/sign`, {
        method: 'POST',
        accessToken: freelancerSession.accessToken,
      });
      if (sign.status !== 200) throw new Error(`프리랜서 서명 실패: ${JSON.stringify(sign.body)}`);
    }
  }

  const payment = await api('/api/v1/payments', {
    method: 'POST',
    accessToken: clientSession.accessToken,
    body: { contractId },
  });
  if (payment.status !== 200) {
    throw new Error(`결제 준비 실패 (status ${payment.status}): ${JSON.stringify(payment.body)}`);
  }

  return { contractId, ...payment.body };
}

/**
 * 2026-09-09 추가 — "마감 처리" 시나리오. registerProject의 마감 검증(project.service.ts
 * validateDeadline)이 `deadline <= now`를 거부하므로 처음부터 과거 시각으로는 못 만든다 —
 * 대신 등록 직후 마감되도록 몇 초 뒤로만 잡고, 그 시각이 지나길 기다린 다음
 * `/internal/v1/projects/sweep-deadlines`(서비스 토큰 필요)를 직접 호출해 실제로 마감시킨다.
 * 마감 처리는 멱등이라(deadline-sweep.service.ts 주석) 재실행해도 안전하다.
 */
async function ensureRecruitmentClosed(clientSession, freelancerSession, markerTitle) {
  if (!INTERNAL_SERVICE_TOKEN) {
    console.log(
      '[seed] INTERNAL_SERVICE_TOKEN이 .env에 없어 "마감 처리(CLOSED)" 시나리오는 건너뜁니다 — ' +
        '값을 채우고 다시 실행하면 이 계정 쌍도 만들어집니다.',
    );
    return null;
  }

  const mine = await api(`/api/v1/clients/${clientSession.userId}/projects`, {
    accessToken: clientSession.accessToken,
  });
  if (mine.status !== 200) throw new Error(`프로젝트 목록 조회 실패: ${JSON.stringify(mine.body)}`);
  let project = mine.body.items.find((p) => p.title === markerTitle);

  if (!project) {
    const deadline = new Date(Date.now() + 6000).toISOString(); // 등록 직후(6초 뒤) 마감되도록 일부러 짧게 잡는다.
    const created = await api('/api/v1/projects', {
      method: 'POST',
      accessToken: clientSession.accessToken,
      body: {
        title: markerTitle,
        description:
          '시드 스크립트(scripts/seed-dev-accounts.js)가 "마감 처리" 테스트용으로 자동 생성한 프로젝트입니다. 등록 직후 마감되도록 일부러 마감 시각을 짧게 잡았습니다.',
        category: 'WEB_DEVELOPMENT',
        recruitmentStartAt: null,
        recruitmentDeadlineAt: deadline,
        budgetAmount: 2_000_000,
        skillIds: ['REACT'],
        pricingAnalysisId: null,
      },
    });
    if (created.status !== 201) throw new Error(`마감 테스트용 프로젝트 생성 실패: ${JSON.stringify(created.body)}`);
    project = created.body;
  }

  if (project.recruitmentStatus === 'CLOSED') {
    console.log('[seed] 마감 처리 시나리오: 이미 CLOSED 상태 — 재사용');
    return project;
  }

  await ensureApplication(freelancerSession, project.projectId);

  const waitMs = new Date(project.recruitmentDeadlineAt).getTime() - Date.now() + 1000; // 마감 + 1초 여유.
  if (waitMs > 0) {
    console.log(`[seed] 마감 처리 시나리오: 마감 시각까지 ${Math.ceil(waitMs / 1000)}초 대기 중...`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const swept = await api('/internal/v1/projects/sweep-deadlines', {
    method: 'POST',
    accessToken: INTERNAL_SERVICE_TOKEN,
  });
  if (swept.status !== 200) throw new Error(`마감 스윕 호출 실패 (status ${swept.status}): ${JSON.stringify(swept.body)}`);

  const after = await api(`/api/v1/clients/${clientSession.userId}/projects`, {
    accessToken: clientSession.accessToken,
  });
  const closed = (after.body.items ?? []).find((p) => p.projectId === project.projectId) ?? project;
  if (closed.recruitmentStatus !== 'CLOSED') {
    throw new Error(
      `마감 스윕을 호출했지만 프로젝트가 아직 CLOSED가 아닙니다 (recruitmentStatus=${closed.recruitmentStatus}) — ` +
        '마감 시각이 실제로 지났는지, 서버 시계가 맞는지 확인하세요.',
    );
  }
  console.log('[seed] 마감 처리 시나리오: CLOSED 확인 완료');
  return closed;
}

async function main() {
  const supabaseAdmin = await loadSupabaseAdminClient();

  const sessions = {};
  for (const persona of ACCOUNTS) {
    sessions[persona.key] = await ensureAccount(supabaseAdmin, persona);
  }

  console.log('[seed] project-management + applications 상태 구성 중...');
  const recruitingProject = await ensureProject(sessions['client-recruiting'], MARKER.recruiting);
  await ensureApplication(sessions['freelancer-applicant'], recruitingProject.projectId);

  console.log('[seed] contracts-payments 계약대기 상태 구성 중...');
  const contractPendingProject = await ensureContractPending(
    sessions['client-contract-pending'],
    sessions['freelancer-contract-pending'],
    MARKER.contractPending,
  );

  console.log('[seed] contracts-payments 결제준비 상태 구성 중 (합의→서명→결제준비)...');
  const paymentReadyProject = await ensureContractPending(
    sessions['client-payment-ready'],
    sessions['freelancer-payment-ready'],
    MARKER.paymentReady,
  );
  const paymentReadyInfo = await ensurePaymentReady(
    sessions['client-payment-ready'],
    sessions['freelancer-payment-ready'],
    paymentReadyProject.projectId,
  );

  console.log('[seed] project-management 마감 처리(CLOSED) 상태 구성 중 (INTERNAL_SERVICE_TOKEN 필요)...');
  const closedProject = await ensureRecruitmentClosed(
    sessions['client-recruitment-closed'],
    sessions['freelancer-auto-rejected'],
    MARKER.closed,
  );

  const extras = {
    'client-recruiting': { projectId: recruitingProject.projectId },
    'freelancer-applicant': { projectId: recruitingProject.projectId },
    'client-contract-pending': { projectId: contractPendingProject.projectId },
    'freelancer-contract-pending': { projectId: contractPendingProject.projectId },
    'client-payment-ready': {
      projectId: paymentReadyProject.projectId,
      contractId: paymentReadyInfo.contractId,
      paymentId: paymentReadyInfo.paymentId,
      orderId: paymentReadyInfo.orderId,
      amount: paymentReadyInfo.amount,
      clientKey: paymentReadyInfo.clientKey,
    },
    'freelancer-payment-ready': {
      projectId: paymentReadyProject.projectId,
      contractId: paymentReadyInfo.contractId,
    },
    // closedProject는 INTERNAL_SERVICE_TOKEN이 없으면 null — 그 경우 이 두 계정은 로그인은
    // 되지만 projectId가 비어 있다(note로 이유를 남긴다). accounts.map에서 처리.
    'client-recruitment-closed': closedProject
      ? { projectId: closedProject.projectId, recruitmentStatus: closedProject.recruitmentStatus }
      : { note: 'INTERNAL_SERVICE_TOKEN 미설정 — 프로젝트 미생성. .env에 값을 채우고 재실행하세요.' },
    'freelancer-auto-rejected': closedProject
      ? { projectId: closedProject.projectId }
      : { note: 'INTERNAL_SERVICE_TOKEN 미설정 — 프로젝트 미생성. .env에 값을 채우고 재실행하세요.' },
  };

  const accounts = ACCOUNTS.map((persona) => {
    const session = sessions[persona.key];
    return {
      key: persona.key,
      label: persona.label,
      feature: persona.feature,
      description: persona.description,
      role: persona.role,
      email: session.email,
      password: session.password,
      userId: session.userId,
      ...(extras[persona.key] ?? {}),
    };
  });

  fs.writeFileSync(
    OUTPUT_FILE_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), accounts }, null, 2),
  );

  console.log('\n========================================');
  console.log(`완료 — ${accounts.length}개 계정을 ${OUTPUT_FILE_PATH}에 기록했습니다.`);
  console.log('npm run dev로 서버를 띄운 채 웹 화면의 DEV 위젯을 열면 계정을 골라 로그인할 수 있습니다.');
  console.log('========================================\n');

  console.log('[남은 수동 단계 — client-payment-ready / freelancer-payment-ready]');
  console.log(
    '결제 확정(paymentKey)은 실제 토스페이먼츠 결제위젯에서만 발급됩니다. 아래 값으로 브라우저에서',
  );
  console.log('결제를 완료한 뒤, 그 결과 paymentKey로 POST /api/v1/payments/confirm을 호출하세요.');
  console.log(
    JSON.stringify(
      { orderId: paymentReadyInfo.orderId, amount: paymentReadyInfo.amount, clientKey: paymentReadyInfo.clientKey },
      null,
      2,
    ),
  );
  console.log(
    '그 다음, reviews 테스트가 필요하면 정산까지 마치는 아래 호출을 한 번 더 하세요(자동 COMPLETED 전이):',
  );
  console.log(
    `  curl -X POST ${SERVER_BASE_URL}/api/internal/dev/simulate-settlement -H "Content-Type: application/json" -d '{"paymentId":"${paymentReadyInfo.paymentId}"}'`,
  );
  console.log('자세한 설명은 scripts/seed-dev-accounts.md를 참고하세요.');

  if (!closedProject) {
    console.log(
      '\n[안내] client-recruitment-closed / freelancer-auto-rejected 계정은 로그인은 가능하지만, ' +
        'INTERNAL_SERVICE_TOKEN이 없어 "마감 처리" 프로젝트는 아직 만들지 않았습니다. ' +
        '.env에 INTERNAL_SERVICE_TOKEN을 채운 뒤 npm run seed:dev-accounts를 다시 실행하세요.',
    );
  }
}

main().catch((error) => {
  console.error('\n[seed] 실패:', error.message);
  process.exit(1);
});
