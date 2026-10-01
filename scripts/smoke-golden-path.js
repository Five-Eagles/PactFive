#!/usr/bin/env node
'use strict';

/**
 * scripts/smoke-golden-path.js — 대표 흐름(골든 패스) API 점검
 *
 * 2026-10-01 신설(포트폴리오 정리). 데모에서 반드시 끝까지 성공해야 하는 흐름을 API로 따라간다.
 *   프로필 → 프로젝트 등록 → 지원 → (알림) → 수락 → 금액 합의 → 계약 서명 → 결제 → 납품 → 승인 → 상호 리뷰
 *
 * 실행 (서버가 먼저 떠 있어야 한다)
 *   node scripts/smoke-golden-path.js                       # 서버가 mock 인증 모드일 때 (npm run dev:mock-auth)
 *   node scripts/smoke-golden-path.js --accounts            # 실제 DB 모드: .dev-accounts.local.json 의 '신규' 계정으로 로그인
 *   SMOKE_BASE_URL=http://localhost:3000 node scripts/smoke-golden-path.js
 *
 * 주의
 *   - 실제 데이터(프로젝트·지원·계약·결제·리뷰)를 새로 만든다. 운영 데모 DB에 돌리면 데모 데이터가 늘어난다.
 *   - 결제 완료는 Toss 결제창이 필요해 로컬 개발용 /api/internal/dev/simulate-payment-paid 로 대신한다.
 *     이 경로가 없는 배포 서버에서는 결제 단계에서 멈춘다(SKIP로 표시).
 *   - 결과는 화면과 scripts/.out/golden-path.json 에 남는다. 토큰·비밀번호는 출력하지 않는다.
 */

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const BASE = (process.env.SMOKE_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const ORIGIN = process.env.SMOKE_ORIGIN || process.env.WEB_ORIGIN || 'http://localhost:5174';
const USE_ACCOUNTS = process.argv.includes('--accounts');

const results = [];
const ctx = {};
let stopped = false;

function record(step, pass, detail, extra) {
  const status = pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL';
  results.push({ step, status, detail, ...(extra ? { extra } : {}) });
  console.log(`${status.padEnd(4)}  ${step}${detail ? `  — ${detail}` : ''}`);
  return pass;
}

async function call(method, url, { token, body, idem } = {}) {
  const headers = { 'content-type': 'application/json', origin: ORIGIN };
  if (token) headers.authorization = `Bearer ${token}`;
  if (idem) headers['idempotency-key'] = randomUUID();
  let res;
  try {
    res = await fetch(`${BASE}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    return { status: 0, json: null, error: error.message };
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}

const code = (r) => r.json?.error?.code ?? r.json?.code ?? r.error ?? '';
const brief = (r) => `status=${r.status}${code(r) ? ` code=${code(r)}` : ''}${r.json?.error?.message ? ` msg=${r.json.error.message}` : ''}`;

/** 응답 어디에 있든 첫 번째로 나오는 key 값을 찾는다 (응답 모양이 기능마다 조금씩 달라서). */
function find(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== null && obj[key] !== undefined) return obj[key];
  for (const v of Object.values(obj)) {
    const found = find(v, key, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

async function step(name, fn) {
  if (stopped) return record(name, null, '앞 단계 실패로 건너뜀');
  try {
    const out = await fn();
    if (out === false) stopped = true;
    return out;
  } catch (error) {
    stopped = true;
    return record(name, false, `예외: ${error.message}`);
  }
}

async function login() {
  if (!USE_ACCOUNTS) {
    ctx.client = { token: 'pactfive-mock-client-01' };
    ctx.freelancer = { token: 'pactfive-mock-freelancer-01' };
    return record('로그인 (mock 토큰)', true, '서버가 mock 모드여야 한다');
  }
  const file = path.join(ROOT, '.dev-accounts.local.json');
  if (!fs.existsSync(file)) return record('로그인 (.dev-accounts)', false, '.dev-accounts.local.json 없음 — npm run seed:dev-accounts 먼저');
  const accounts = JSON.parse(fs.readFileSync(file, 'utf8')).accounts ?? [];
  const pick = (role) => accounts.find((a) => a.role === role && /신규/.test(a.label ?? '')) ?? accounts.find((a) => a.role === role);
  for (const role of ['CLIENT', 'FREELANCER']) {
    const acc = pick(role);
    if (!acc) return record(`로그인 ${role}`, false, '계정 없음');
    const r = await call('POST', '/api/v1/auth/sessions', { body: { email: acc.email, password: acc.password, deviceLabel: 'golden-path-smoke' } });
    if (r.status !== 200 || !r.json?.accessToken) return record(`로그인 ${role}`, false, brief(r));
    ctx[role === 'CLIENT' ? 'client' : 'freelancer'] = { token: r.json.accessToken };
    record(`로그인 ${role}`, true, acc.label);
  }
  return true;
}

async function main() {
  console.log(`[골든 패스 점검] ${BASE} (${USE_ACCOUNTS ? '실계정 로그인' : 'mock 토큰'})\n`);
  const t0 = Date.now();

  await step('서버 응답', async () => {
    const r = await call('GET', '/health');
    return record('서버 응답', r.status === 200, brief(r));
  });
  await step('로그인', login);

  await step('인증 확인', async () => {
    // /auth/contexts/current 는 실제 인증 서비스 전용이라 mock 모드에서는 401이다. requireAuth를 거치는 프로필 조회로 확인한다.
    const c = await call('GET', '/api/v1/profiles/me', { token: ctx.client.token });
    const f = await call('GET', '/api/v1/profiles/me', { token: ctx.freelancer.token });
    return record('인증 확인', c.status !== 401 && f.status !== 401, `client=${brief(c)} freelancer=${brief(f)}`);
  });

  await step('의뢰인 프로필 저장', async () => {
    const r = await call('PATCH', '/api/v1/profiles/me', { token: ctx.client.token, body: { name: '골든패스 의뢰인', bio: null, profileImageUrl: null, companyName: '골든패스 주식회사', businessField: 'WEB_DEVELOPMENT', websiteUrl: null } });
    const g = await call('GET', '/api/v1/profiles/me', { token: ctx.client.token });
    return record('의뢰인 프로필 저장', r.status === 200 && g.json?.complete === true, `${brief(r)} complete=${g.json?.complete}`);
  });

  await step('프리랜서 프로필 저장', async () => {
    const r = await call('PATCH', '/api/v1/profiles/me', { token: ctx.freelancer.token, body: { name: '골든패스 프리랜서', bio: null, profileImageUrl: null, primaryCategory: 'WEB_DEVELOPMENT', careerYears: 3, skills: ['React', 'Node.js'] } });
    const g = await call('GET', '/api/v1/profiles/me', { token: ctx.freelancer.token });
    return record('프리랜서 프로필 저장', r.status === 200 && g.json?.complete === true, `${brief(r)} skills=${JSON.stringify(g.json?.profile?.skills)} complete=${g.json?.complete}`);
  });

  await step('프로젝트 등록', async () => {
    const deadline = new Date(Date.now() + 14 * 86400000).toISOString();
    const r = await call('POST', '/api/v1/projects', { token: ctx.client.token, body: {
      title: `골든패스 점검 프로젝트 ${new Date().toISOString().slice(0, 16)}`,
      description: '대표 흐름 자동 점검용 프로젝트입니다. 쇼핑몰 관리자 화면과 주문 API를 만듭니다.',
      category: 'WEB_DEVELOPMENT', recruitmentDeadlineAt: deadline, budgetAmount: 3000000, skillIds: ['REACT', 'NODEJS'],
    } });
    ctx.projectId = find(r.json, 'projectId') ?? find(r.json, 'id');
    return record('프로젝트 등록', (r.status === 200 || r.status === 201) && !!ctx.projectId, `${brief(r)} projectId=${ctx.projectId}`);
  });

  await step('지원 가능 여부', async () => {
    const r = await call('GET', `/api/v1/projects/${ctx.projectId}/application-eligibility`, { token: ctx.freelancer.token });
    return record('지원 가능 여부', r.status === 200 && find(r.json, 'canApply') === true, `${brief(r)} canApply=${find(r.json, 'canApply')} reason=${find(r.json, 'reason') ?? ''}`);
  });

  await step('프리랜서 지원', async () => {
    const r = await call('POST', `/api/v1/projects/${ctx.projectId}/applications`, { token: ctx.freelancer.token, idem: true, body: { coverLetter: '비슷한 쇼핑몰 관리자 화면을 세 건 만든 경험이 있습니다. React와 Node.js로 주문 관리, 상품 등록, 정산 화면을 구현했고 '.repeat(1) + '모든 프로젝트를 일정 안에 납품했습니다. 이번 프로젝트도 주 단위로 진행 상황을 공유하면서 안정적으로 마무리하겠습니다.', expectedAmount: 2800000, expectedDurationDays: 30 } });
    ctx.applicationId = find(r.json, 'applicationId') ?? find(r.json, 'id');
    return record('프리랜서 지원', (r.status === 200 || r.status === 201) && !!ctx.applicationId, `${brief(r)} applicationId=${ctx.applicationId}`);
  });

  await step('알림: 의뢰인 새 지원', async () => {
    const r = await call('GET', '/api/v1/notifications', { token: ctx.client.token });
    const items = r.json?.items ?? [];
    const hit = items.some((n) => n.type === 'APPLICATION_SUBMITTED' && n.resourceId === ctx.applicationId);
    record('알림: 의뢰인 새 지원', r.status === 200 && hit, `${brief(r)} items=${items.length}`);
    return true; // 알림 실패는 거래를 막지 않으므로 다음 단계는 계속한다
  });

  await step('의뢰인 수락', async () => {
    const r = await call('POST', `/api/v1/applications/${ctx.applicationId}/accept`, { token: ctx.client.token, idem: true });
    let ok = r.status === 200 || r.status === 201 || r.status === 202;
    const opId = find(r.json, 'operationId');
    if (ok && r.status === 202 && opId) {
      for (let i = 0; i < 10; i += 1) {
        const o = await call('GET', `/api/v1/application-operations/${opId}`, { token: ctx.client.token });
        const st = find(o.json, 'status');
        if (st === 'SUCCEEDED' || st === 'COMPLETED') break;
        if (st === 'FAILED') { ok = false; break; }
        await new Promise((res) => setTimeout(res, 500));
      }
    }
    return record('의뢰인 수락', ok, `${brief(r)}${opId ? ` operationId=${opId}` : ''}`);
  });

  await step('알림: 프리랜서 수락', async () => {
    const r = await call('GET', '/api/v1/notifications', { token: ctx.freelancer.token });
    const items = r.json?.items ?? [];
    record('알림: 프리랜서 수락', r.status === 200 && items.some((n) => n.type === 'APPLICATION_ACCEPTED'), `${brief(r)} items=${items.length}`);
    return true;
  });

  await step('금액 제안', async () => {
    const r = await call('POST', `/api/v1/projects/${ctx.projectId}/negotiation-offers`, { token: ctx.client.token, idem: true, body: { amount: 2800000, message: '지원하신 금액으로 진행하고 싶습니다.' } });
    ctx.offerId = find(r.json, 'offerId') ?? find(r.json, 'id');
    return record('금액 제안 (의뢰인)', (r.status === 200 || r.status === 201) && !!ctx.offerId, `${brief(r)} offerId=${ctx.offerId}`);
  });

  await step('금액 동의', async () => {
    const r = await call('POST', `/api/v1/projects/${ctx.projectId}/negotiation-offers/${ctx.offerId}/accept`, { token: ctx.freelancer.token, idem: true, body: { expectedRound: 1 } });
    ctx.contractId = find(r.json, 'contractId');
    if (!ctx.contractId) {
      const c = await call('GET', `/api/v1/projects/${ctx.projectId}/negotiation-offers/current`, { token: ctx.client.token });
      ctx.contractId = find(c.json, 'contractId');
    }
    return record('금액 동의 (프리랜서)', (r.status === 200 || r.status === 201) && !!ctx.contractId, `${brief(r)} contractId=${ctx.contractId}`);
  });

  for (const [who, label] of [['client', '의뢰인'], ['freelancer', '프리랜서']]) {
    await step(`계약 서명 (${label})`, async () => {
      const r = await call('POST', `/api/v1/contracts/${ctx.contractId}/sign`, { token: ctx[who].token, idem: true });
      return record(`계약 서명 (${label})`, r.status === 200 || r.status === 201, `${brief(r)} contractStatus=${find(r.json, 'status') ?? ''}`);
    });
  }

  await step('결제 준비', async () => {
    const r = await call('POST', '/api/v1/payments', { token: ctx.client.token, idem: true, body: { contractId: ctx.contractId } });
    ctx.paymentId = find(r.json, 'paymentId') ?? find(r.json, 'id');
    return record('결제 준비', (r.status === 200 || r.status === 201) && !!ctx.paymentId, `${brief(r)} paymentId=${ctx.paymentId}`);
  });

  await step('결제 완료 (개발용 대체)', async () => {
    const r = await call('POST', '/api/internal/dev/simulate-payment-paid', { body: { paymentId: ctx.paymentId } });
    if (r.status === 404) { record('결제 완료 (개발용 대체)', null, '개발용 경로 없음 — 실제 Toss 결제창 필요'); return false; }
    const p = await call('GET', `/api/v1/payments/${ctx.paymentId}`, { token: ctx.client.token });
    return record('결제 완료 (개발용 대체)', r.status === 200 && find(p.json, 'status') === 'PAID', `${brief(r)} paymentStatus=${find(p.json, 'status')}`);
  });

  await step('납품 요청', async () => {
    // 실제 서버는 upload-prepare 에 size·sha256, request 에 objectKey·uploadId 를 받는다 (OpenAPI 문서와 다름 — 2026-10-01 확인).
    const content = Buffer.from('pactfive golden path delivery');
    const sha256 = require('node:crypto').createHash('sha256').update(content).digest('hex');
    const prep = await call('POST', `/api/v1/contracts/${ctx.contractId}/deliveries/upload-prepare`, { token: ctx.freelancer.token, body: { fileName: 'delivery.zip', contentType: 'application/zip', size: content.length, sha256 } });
    const objectKey = find(prep.json, 'objectKey'); const uploadId = find(prep.json, 'uploadId');
    if (!objectKey || !uploadId) return record('납품 요청', false, `upload-prepare ${brief(prep)}`);
    const r = await call('POST', `/api/v1/contracts/${ctx.contractId}/deliveries/request`, { token: ctx.freelancer.token, idem: true, body: { objectKey, uploadId, message: '최종 결과물입니다.' } });
    return record('납품 요청', r.status === 200 || r.status === 201, `prepare=${prep.status} ${brief(r)}`);
  });

  await step('납품 승인', async () => {
    const r = await call('POST', `/api/v1/contracts/${ctx.contractId}/deliveries/approve`, { token: ctx.client.token, idem: true });
    return record('납품 승인', r.status === 200 || r.status === 201, brief(r));
  });

  await step('거래 완료 상태', async () => {
    const r = await call('GET', `/api/v1/projects/${ctx.projectId}`, { token: ctx.client.token });
    const tx = find(r.json, 'transactionStatus');
    return record('거래 완료 상태', r.status === 200 && tx === 'COMPLETED', `${brief(r)} transactionStatus=${tx}`) || true;
  });

  for (const [who, label, tags] of [['client', '의뢰인→프리랜서', ['WORK_QUALITY', 'ON_TIME_DELIVERY']], ['freelancer', '프리랜서→의뢰인', ['CLEAR_REQUIREMENTS', 'FAST_FEEDBACK']]]) {
    await step(`리뷰 (${label})`, async () => {
      const r = await call('POST', `/api/v1/projects/${ctx.projectId}/reviews`, { token: ctx[who].token, idem: true, body: { rating: 5, content: '골든 패스 점검 리뷰입니다.', tags } });
      return record(`리뷰 (${label})`, r.status === 200 || r.status === 201, brief(r)) || true;
    });
  }

  const summary = { pass: 0, fail: 0, skip: 0 };
  for (const r of results) summary[r.status.toLowerCase()] += 1;
  console.log(`\n결과: PASS ${summary.pass} / FAIL ${summary.fail} / SKIP ${summary.skip}  (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
  const outDir = path.join(__dirname, '.out');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'golden-path.json');
  fs.writeFileSync(file, JSON.stringify({ ranAt: new Date().toISOString(), base: BASE, mode: USE_ACCOUNTS ? 'accounts' : 'mock', summary, ids: { projectId: ctx.projectId, applicationId: ctx.applicationId, contractId: ctx.contractId, paymentId: ctx.paymentId }, results }, null, 2));
  console.log(`결과 파일: ${path.relative(ROOT, file)}`);
  process.exitCode = summary.fail ? 1 : 0;
}

main().catch((error) => { console.error(error); process.exit(1); });
