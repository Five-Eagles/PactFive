/**
 * app Toss sandbox 프로브 — 키·실패 승인·prepare clientKey·PaymentPage 위젯 배선.
 * 성공 confirm(유효 paymentKey)은 결제창 수동. 시드 결제 행은 건드리지 않는다.
 * 실행: node features/contracts-payments/review/toss-sandbox-probe.mjs
 */
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
const secret = process.env.PG_SECRET_KEY?.trim() ?? '';
const clientKeyEnv = process.env.PG_CLIENT_KEY?.trim() ?? '';
const accounts = JSON.parse(fs.readFileSync(path.join(root, '.dev-accounts.local.json'), 'utf8')).accounts;
const byKey = Object.fromEntries(accounts.map((a) => [a.key, a]));
const paymentPage = fs.readFileSync(
  path.join(root, 'app/web/src/features/contracts-payments/PaymentPage.tsx'),
  'utf8',
);

const results = [];
function ok(n, p, d) {
  results.push({ n, p, d });
  console.log(`${p ? 'PASS' : 'FAIL'} ${n} | ${d}`);
}

function basicAuth(secretKey) {
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

async function api(p, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
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

ok(
  'env PG_SECRET_KEY present',
  Boolean(secret),
  secret ? `prefix=${secret.slice(0, 8)}…` : 'missing',
);
ok(
  'env PG_CLIENT_KEY present',
  Boolean(clientKeyEnv) && clientKeyEnv.startsWith('test_'),
  clientKeyEnv ? `prefix=${clientKeyEnv.slice(0, 8)}…` : 'missing',
);

if (secret) {
  // 어댑터와 동일한 confirm URL — 잘못된 키는 4xx + PAYMENT_CONFIRM_FAILED 경로만 본다.
  const confirmRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      Authorization: basicAuth(secret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentKey: 'pay_invalid_app_probe',
      orderId: `order_invalid_app_probe_${Date.now()}`,
      amount: 1000,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const confirmBody = await confirmRes.json().catch(() => ({}));
  ok(
    'Toss sandbox confirm rejects bad paymentKey',
    confirmRes.status >= 400 && confirmRes.status < 500,
    `status=${confirmRes.status} code=${confirmBody.code ?? null}`,
  );

  const retrieveRes = await fetch(
    `https://api.tosspayments.com/v1/payments/orders/${encodeURIComponent('order_missing_app_probe')}`,
    {
      headers: { Authorization: basicAuth(secret) },
      signal: AbortSignal.timeout(20_000),
    },
  );
  const retrieveBody = await retrieveRes.json().catch(() => ({}));
  ok(
    'Toss sandbox retrieve rejects missing order',
    retrieveRes.status >= 400 && retrieveRes.status < 500,
    `status=${retrieveRes.status} code=${retrieveBody.code ?? null}`,
  );
} else {
  ok('Toss sandbox confirm rejects bad paymentKey', false, 'skipped — no secret');
  ok('Toss sandbox retrieve rejects missing order', false, 'skipped — no secret');
}

const client = byKey['client-payment-ready'];
if (!client?.contractId) throw new Error('payment-ready seed incomplete');

const cTok = await login('client-payment-ready');
const prep = await api('/api/v1/payments', {
  method: 'POST',
  token: cTok,
  body: { contractId: client.contractId },
});
const prepOk = prep.status === 200 || prep.status === 201 || prep.status === 409;
const returnedKey = prep.body?.clientKey ?? prep.body?.payment?.clientKey ?? null;
ok(
  'app preparePayment returns sandbox clientKey',
  prepOk && typeof returnedKey === 'string' && returnedKey.startsWith('test_'),
  `status=${prep.status} clientKeyPrefix=${typeof returnedKey === 'string' ? returnedKey.slice(0, 8) + '…' : returnedKey} code=${prep.body?.error?.code ?? null}`,
);

ok(
  'PaymentPage loads Toss SDK CDN',
  paymentPage.includes('js.tosspayments.com') && paymentPage.includes('loadTossSdk'),
  'CDN + loadTossSdk',
);
ok(
  'PaymentPage requestPayment + confirmPayment',
  paymentPage.includes('requestPayment') && paymentPage.includes('confirmPayment('),
  'widget redirect + server confirm wiring',
);

const fail = results.filter((r) => !r.p).length;
console.log(`TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail}`);
const outDir = path.join(root, 'feedback_loop/2026-09-20');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'contracts-payments-toss-probe.json'),
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      note: '성공 confirm(유효 paymentKey)은 위젯 수동. 본 프로브는 시드 결제 행을 FAILED로 만들지 않음.',
      results,
    },
    null,
    2,
  ),
);
process.exit(fail ? 1 : 0);
