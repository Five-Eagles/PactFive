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

function requireEnv(name, value) {
  if (!value) {
    console.error(`[seed] .env에 ${name}이(가) 없습니다. 리포 루트 .env를 확인해 주세요.`);
    process.exit(1);
  }
}
requireEnv('SUPABASE_URL', SUPABASE_URL);
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
requireEnv('WEB_ORIGIN', WEB_ORIGIN);

// 전부 @example.com 가짜 계정이라 고정 비밀번호를 코드에 둬도 안전하다(auth.mock.ts의 고정
// mock 토큰과 같은 성격). 결과 파일(.dev-accounts.local.json)은 .gitignore에 있다.
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
  const res = await fetch(`${SERVER_BASE_URL}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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
    email: 'seed.client.fresh@example.com',
    label: '의뢰인 · 신규',
    feature: 'user-management / ai-pricing',
    description: '프로젝트가 아직 없는 갓 가입한 의뢰인. 프로필 화면, AI 견적(프로젝트 등록 전) 테스트용.',
  },
  {
    key: 'freelancer-fresh',
    role: 'FREELANCER',
    email: 'seed.freelancer.fresh@example.com',
    label: '프리랜서 · 신규',
    feature: 'user-management / engagement',
    description: '지원·북마크가 없는 갓 가입한 프리랜서. 프로필, 프로젝트 탐색·북마크 토글 테스트용.',
  },
  {
    key: 'client-recruiting',
    role: 'CLIENT',
    email: 'seed.client.recruiting@example.com',
    label: '의뢰인 · 모집 중 프로젝트',
    feature: 'project-management',
    description:
      '모집 중(RECRUITING) 프로젝트 1개 보유. 프로젝트 수정·마감·재모집·취소, 그리고 지원 수락/거절(freelancer-applicant가 이미 지원해 둠) 테스트용.',
  },
  {
    key: 'freelancer-applicant',
    role: 'FREELANCER',
    email: 'seed.freelancer.applicant@example.com',
    label: '프리랜서 · 지원(PENDING) 상태',
    feature: 'applications',
    description: 'client-recruiting의 프로젝트에 지원서(PENDING)를 낸 상태. 내 지원 목록/상세 화면 테스트용.',
  },
  {
    key: 'client-contract-pending',
    role: 'CLIENT',
    email: 'seed.client.contract-pending@example.com',
    label: '의뢰인 · 계약 대기(합의 전)',
    feature: 'contracts-payments (합의)',
    description: '지원 수락까지 끝나 CONTRACT_PENDING인 프로젝트의 의뢰인. 합의 제안 테스트용.',
  },
  {
    key: 'freelancer-contract-pending',
    role: 'FREELANCER',
    email: 'seed.freelancer.contract-pending@example.com',
    label: '프리랜서 · 계약 대기(합의 전)',
    feature: 'contracts-payments (합의)',
    description: 'client-contract-pending과 짝. 합의 수락 테스트용.',
  },
  {
    key: 'client-payment-ready',
    role: 'CLIENT',
    email: 'seed.client.payment-ready@example.com',
    label: '의뢰인 · 서명 완료·결제 준비',
    feature: 'contracts-payments (결제~납품) / reviews',
    description:
      '합의·서명까지 끝나고 결제 준비(clientKey 발급)까지 된 상태. 결제 확정 이후(브라우저 필요)와 그 다음 정산까지는 문서(scripts/seed-dev-accounts.md) 안내를 따라 한 번 더 진행해야 reviews 테스트가 가능해진다.',
  },
  {
    key: 'freelancer-payment-ready',
    role: 'FREELANCER',
    email: 'seed.freelancer.payment-ready@example.com',
    label: '프리랜서 · 서명 완료·결제 준비',
    feature: 'contracts-payments (결제~납품) / reviews',
    description: 'client-payment-ready와 짝.',
  },
];

const MARKER = {
  recruiting: '[시드:project-management] 모집 중 테스트 프로젝트',
  contractPending: '[시드:contracts-payments] 계약대기 테스트 프로젝트',
  paymentReady: '[시드:contracts-payments] 결제준비 테스트 프로젝트',
};

async function ensureAccount(supabaseAdmin, persona) {
  const { email, role, label } = persona;

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

  console.log(`[seed] ${persona.key}: 신규 생성 중 (${email})`);
  const registerRes = await api('/api/v1/auth/registrations', {
    method: 'POST',
    origin: WEB_ORIGIN,
    body: { email, password: SEED_PASSWORD, name: label, role, returnTo: '/' },
  });
  if (registerRes.status !== 202) {
    throw new Error(`[${persona.key}] 회원가입 실패 (status ${registerRes.status}): ${JSON.stringify(registerRes.body)}`);
  }

  const authUserId = await findSupabaseUserIdByEmail(supabaseAdmin, email);
  if (!authUserId) {
    throw new Error(`[${persona.key}] Supabase에서 방금 만든 계정(${email})을 찾지 못했습니다.`);
  }
  const { error: confirmError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, { email_confirm: true });
  if (confirmError) throw new Error(`[${persona.key}] 이메일 확인 처리 실패: ${confirmError.message}`);

  const loginRes = await api('/api/v1/auth/sessions', {
    method: 'POST',
    origin: WEB_ORIGIN,
    body: { email, password: SEED_PASSWORD },
  });
  if (loginRes.status !== 200) {
    throw new Error(`[${persona.key}] 로그인 실패 (status ${loginRes.status}): ${JSON.stringify(loginRes.body)}`);
  }
  console.log(`[seed] ${persona.key}: 생성 완료 (userId=${loginRes.body.user.userId})`);
  return { ...persona, userId: loginRes.body.user.userId, accessToken: loginRes.body.accessToken, password: SEED_PASSWORD };
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
}

main().catch((error) => {
  console.error('\n[seed] 실패:', error.message);
  process.exit(1);
});
