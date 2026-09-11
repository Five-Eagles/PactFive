/**
 * reviews live API smoke — seed payment-ready 기준 (COMPLETED 전 단계 포함).
 * 실행: node features/reviews/review/reviews-api-smoke.mjs
 * 전제: 서버 :3000 · `.dev-accounts.local.json` · WEB_ORIGIN(.env)
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
const accountsPath = path.join(root, '.dev-accounts.local.json');
const accounts = JSON.parse(fs.readFileSync(accountsPath, 'utf8')).accounts;
const byKey = Object.fromEntries(accounts.map((a) => [a.key, a]));

async function api(p, { method = 'GET', body, token, extraHeaders = {} } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
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
if (!client?.projectId || !free?.userId) {
  throw new Error('payment-ready seed incomplete');
}

const cTok = await login('client-payment-ready');
const fTok = await login('freelancer-payment-ready');
const prj = client.projectId;

const patch = await api(`/api/v1/projects/${prj}/reviews`, { method: 'PATCH', token: cTok });
ok('R-02 PATCH reviews 405', patch.status === 405, `status=${patch.status}`);

const me = await api(`/api/v1/projects/${prj}/reviews/me`, { token: cTok });
ok(
  'GET reviews/me',
  me.status === 200 && me.body?.myDirection === 'CLIENT_TO_FREELANCER',
  `status=${me.status} canReview=${me.body?.canReview} reason=${me.body?.reason} myDirection=${me.body?.myDirection}`,
);

const list = await api(`/api/v1/projects/${prj}/reviews`, { token: cTok });
ok('GET project reviews', list.status === 200, `status=${list.status} items=${(list.body?.items || []).length}`);

const rating = await api(`/api/v1/users/${free.userId}/rating`, { token: cTok });
ok(
  'GET user rating',
  rating.status === 200 && rating.body?.reviewCount === 0,
  `status=${rating.status} avg=${rating.body?.averageRating} count=${rating.body?.reviewCount}`,
);

const urevs = await api(`/api/v1/users/${free.userId}/reviews`, { token: cTok });
ok(
  'GET user reviews',
  urevs.status === 200,
  `status=${urevs.status} items=${(urevs.body?.items || []).length}`,
);

const fme = await api(`/api/v1/projects/${prj}/reviews/me`, { token: fTok });
ok(
  'freelancer reviews/me myDirection',
  fme.status === 200 && fme.body?.myDirection === 'FREELANCER_TO_CLIENT',
  `status=${fme.status} myDirection=${fme.body?.myDirection} reason=${fme.body?.reason}`,
);

const bad = await api(`/api/v1/projects/${prj}/reviews`, {
  method: 'POST',
  token: cTok,
  body: { rating: 5, tags: ['WORK_QUALITY'], content: 123 },
  extraHeaders: { 'Idempotency-Key': `rv-smoke-bad-${Date.now()}` },
});
const badOk = me.body?.canReview
  ? bad.status === 422 || bad.status === 400
  : bad.status === 409 && bad.body?.error?.code === 'PROJECT_NOT_COMPLETED';
ok(
  'POST invalid/guarded',
  badOk,
  `status=${bad.status} code=${bad.body?.error?.code} canReview=${me.body?.canReview}`,
);

const fail = results.filter((r) => !r.p).length;
console.log(`TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail}`);
const outDir = path.join(root, 'feedback_loop/2026-09-11');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'reviews-api-smoke.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
);
process.exit(fail ? 1 : 0);
