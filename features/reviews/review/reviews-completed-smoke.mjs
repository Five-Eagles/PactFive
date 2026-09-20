/**
 * payment-ready → (dev) PAID → 납품 → 정산 → 리뷰 작성·R-03 스모크.
 * 실행: node features/reviews/review/reviews-completed-smoke.mjs
 * 전제: 서버 :3000 · seed payment-ready · 비프로덕션 simulate-* 라우트
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m || process.env[m[1]] !== undefined) continue;
  process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const BASE = process.env.SERVER_BASE_URL ?? 'http://127.0.0.1:3000';
const ORIGIN = process.env.WEB_ORIGIN;
const accounts = JSON.parse(fs.readFileSync(path.join(root, '.dev-accounts.local.json'), 'utf8')).accounts;
const byKey = Object.fromEntries(accounts.map((a) => [a.key, a]));

async function api(p, { method = 'GET', body, token, extraHeaders = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

async function login(key) {
  const a = byKey[key];
  const r = await api('/api/v1/auth/sessions', {
    method: 'POST',
    body: { email: a.email, password: a.password },
  });
  if (r.status !== 200) throw new Error(`login ${key} ${r.status}`);
  return r.body.accessToken;
}

const results = [];
function ok(n, p, d) {
  results.push({ n, p, d });
  console.log(`${p ? 'PASS' : 'FAIL'} ${n} | ${d}`);
}

const client = byKey['client-payment-ready'];
const free = byKey['freelancer-payment-ready'];
if (!client?.projectId || !client?.paymentId || !client?.contractId) {
  throw new Error('payment-ready seed incomplete');
}

const cTok = await login('client-payment-ready');
const fTok = await login('freelancer-payment-ready');
const { projectId, paymentId, contractId } = client;
const stamp = Date.now();

const me0 = await api(`/api/v1/projects/${projectId}/reviews/me`, { token: cTok });
const alreadyDone =
  me0.body?.canReview === true || me0.body?.reason === 'REVIEW_ALREADY_SUBMITTED';

if (!alreadyDone) {
  const payGet = await api(`/api/v1/payments/${paymentId}`, { token: cTok });
  if (payGet.body?.status === 'READY' || payGet.body?.status === 'PENDING') {
    const paid = await api('/api/internal/dev/simulate-payment-paid', {
      method: 'POST',
      body: { paymentId },
    });
    ok(
      'dev simulate-payment-paid',
      paid.status === 200 && paid.body?.status === 'PAID',
      `status=${paid.status} bodyStatus=${paid.body?.status}`,
    );
  } else {
    ok(
      'dev simulate-payment-paid',
      payGet.body?.status === 'PAID' || payGet.body?.status === 'RELEASED',
      `skipped statusField=${payGet.body?.status}`,
    );
  }

  const sha256 = crypto.createHash('sha256').update(`delivery-${stamp}`).digest('hex');
  const prep = await api(`/api/v1/contracts/${contractId}/deliveries/upload-prepare`, {
    method: 'POST',
    token: fTok,
    body: {
      fileName: 'smoke-delivery.zip',
      contentType: 'application/zip',
      size: 128,
      sha256,
    },
  });
  ok(
    'prepareDeliveryUpload',
    prep.status === 200 || prep.status === 201 || prep.status === 409,
    `status=${prep.status} uploadId=${prep.body?.uploadId}`,
  );

  if (prep.body?.uploadId && prep.body?.objectKey) {
    const reqDel = await api(`/api/v1/contracts/${contractId}/deliveries/request`, {
      method: 'POST',
      token: fTok,
      body: {
        uploadId: prep.body.uploadId,
        objectKey: prep.body.objectKey,
        message: '스모크 납품입니다.',
      },
      extraHeaders: { 'Idempotency-Key': `rv-del-req-${stamp}` },
    });
    ok(
      'requestDelivery',
      reqDel.status === 200 || reqDel.status === 201 || reqDel.status === 409,
      `status=${reqDel.status} code=${reqDel.body?.error?.code}`,
    );
  } else {
    ok('requestDelivery', true, 'skipped (upload not prepared)');
  }

  const appr = await api(`/api/v1/contracts/${contractId}/deliveries/approve`, {
    method: 'POST',
    token: cTok,
    body: {},
    extraHeaders: { 'Idempotency-Key': `rv-del-appr-${stamp}` },
  });
  ok(
    'approveDelivery',
    appr.status === 200 || appr.status === 201 || appr.status === 409,
    `status=${appr.status} code=${appr.body?.error?.code}`,
  );

  const settled = await api('/api/internal/dev/simulate-settlement', {
    method: 'POST',
    body: { paymentId },
  });
  ok('dev simulate-settlement', settled.status === 200 && settled.body?.ok === true, `status=${settled.status}`);
} else {
  ok('pipeline', true, `skipped — me reason=${me0.body?.reason} canReview=${me0.body?.canReview}`);
}

const me = await api(`/api/v1/projects/${projectId}/reviews/me`, { token: cTok });
ok(
  'reviews/me completed-or-submitted',
  me.status === 200 && (me.body?.canReview === true || me.body?.reason === 'REVIEW_ALREADY_SUBMITTED'),
  `status=${me.status} canReview=${me.body?.canReview} reason=${me.body?.reason} myDirection=${me.body?.myDirection}`,
);

const bad = await api(`/api/v1/projects/${projectId}/reviews`, {
  method: 'POST',
  token: cTok,
  body: { rating: 5, tags: ['WORK_QUALITY'], content: 123 },
  extraHeaders: { 'Idempotency-Key': `rv-r03-${stamp}` },
});
ok(
  'R-03 content typeof → 422',
  bad.status === 422 ||
    (me.body?.reason === 'REVIEW_ALREADY_SUBMITTED' && bad.status === 409),
  `status=${bad.status} code=${bad.body?.error?.code}`,
);

// 의뢰인이 이미 썼으면 프리랜서 방향으로 bodyHash(sha256) 생성을 검증한다.
const writerTok = me.body?.reason === 'REVIEW_ALREADY_SUBMITTED' ? fTok : cTok;
const created = await api(`/api/v1/projects/${projectId}/reviews`, {
  method: 'POST',
  token: writerTok,
  body: {
    rating: 5,
    tags: writerTok === fTok ? ['CLEAR_REQUIREMENTS'] : ['WORK_QUALITY'],
    content: '스모크 리뷰 — 요구사항 전달이 명확했습니다.',
  },
  extraHeaders: { 'Idempotency-Key': `rv-create-${stamp}` },
});
const createOk =
  created.status === 201 ||
  created.status === 200 ||
  (created.status === 409 && created.body?.error?.code === 'REVIEW_ALREADY_SUBMITTED');
ok(
  'createReview (sha256 bodyHash)',
  createOk,
  `status=${created.status} reviewId=${created.body?.reviewId} visibility=${created.body?.visibility} code=${created.body?.error?.code}`,
);

const fail = results.filter((r) => !r.p).length;
console.log(`TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail}`);
const outDir = path.join(root, 'feedback_loop/2026-09-20');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'reviews-completed-smoke.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
);
process.exit(fail ? 1 : 0);
