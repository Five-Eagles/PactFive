/**
 * contracts-payments payment-ready API smoke.
 * 실행: node features/contracts-payments/review/payment-ready-smoke.mjs
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
const accounts = JSON.parse(fs.readFileSync(path.join(root, '.dev-accounts.local.json'), 'utf8')).accounts;
const byKey = Object.fromEntries(accounts.map((a) => [a.key, a]));

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

const results = [];
function ok(n, p, d) {
  results.push({ n, p, d });
  console.log(`${p ? 'PASS' : 'FAIL'} ${n} | ${d}`);
}

const client = byKey['client-payment-ready'];
if (!client?.contractId || !client?.paymentId || !client?.projectId) {
  throw new Error('payment-ready seed incomplete');
}

const cTok = await login('client-payment-ready');
const fTok = await login('freelancer-payment-ready');

const prepF = await api('/api/v1/payments', {
  method: 'POST',
  token: fTok,
  body: { contractId: client.contractId },
});
ok(
  'C-07 freelancer prepare blocked',
  prepF.status === 403 || prepF.status === 409,
  `status=${prepF.status} code=${prepF.body?.error?.code}`,
);

const getP = await api(`/api/v1/payments/${client.paymentId}`, { token: cTok });
ok(
  'client getPayment',
  getP.status === 200,
  `status=${getP.status} statusField=${getP.body?.status}`,
);

const prepC = await api('/api/v1/payments', {
  method: 'POST',
  token: cTok,
  body: { contractId: client.contractId },
});
ok(
  'client prepare ok/idempotent',
  prepC.status === 200 || prepC.status === 201 || prepC.status === 409,
  `status=${prepC.status} paymentId=${prepC.body?.paymentId} code=${prepC.body?.error?.code}`,
);

const getF = await api(`/api/v1/payments/${client.paymentId}`, { token: fTok });
ok(
  'freelancer getPayment (party)',
  getF.status === 200 || getF.status === 403,
  `status=${getF.status} code=${getF.body?.error?.code}`,
);

const ctr = await api(`/api/v1/contracts/${client.contractId}`, { token: cTok });
ok(
  'client getContract',
  ctr.status === 200,
  `status=${ctr.status} contractStatus=${ctr.body?.status || ctr.body?.contractStatus}`,
);

const neg = await api(`/api/v1/projects/${client.projectId}/negotiation-offers/current`, {
  token: cTok,
});
ok(
  'negotiation current',
  neg.status === 200,
  `status=${neg.status} agreement=${neg.body?.agreementStatus} contractId=${neg.body?.contractId}`,
);

const fail = results.filter((r) => !r.p).length;
console.log(`TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail}`);
const outDir = path.join(root, 'feedback_loop/2026-09-20');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'contracts-payments-api-smoke.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
);
process.exit(fail ? 1 : 0);
