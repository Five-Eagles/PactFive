/**
 * R4 closeout — API myDirection + ReviewPage 소스 증거.
 * 실행: node features/reviews/review/reviews-r4-closeout.mjs
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
const page = fs.readFileSync(path.join(root, 'app/web/src/features/reviews/ReviewPage.tsx'), 'utf8');
const types = fs.readFileSync(path.join(root, 'app/web/src/features/reviews/review.types.ts'), 'utf8');

async function api(p, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function login(key) {
  const a = byKey[key];
  const r = await api('/api/v1/auth/sessions', {
    method: 'POST',
    body: { email: a.email, password: a.password },
  });
  if (r.status !== 200) throw new Error(`login ${key}`);
  return r.body.accessToken;
}

const results = [];
function ok(n, p, d) {
  results.push({ n, p, d });
  console.log(`${p ? 'PASS' : 'FAIL'} ${n} | ${d}`);
}

const client = byKey['client-payment-ready'];
const cTok = await login('client-payment-ready');
const fTok = await login('freelancer-payment-ready');
const meC = await api(`/api/v1/projects/${client.projectId}/reviews/me`, { token: cTok });
const meF = await api(`/api/v1/projects/${client.projectId}/reviews/me`, { token: fTok });

ok('API client myDirection', meC.body?.myDirection === 'CLIENT_TO_FREELANCER', `dir=${meC.body?.myDirection}`);
ok('API freelancer myDirection', meF.body?.myDirection === 'FREELANCER_TO_CLIENT', `dir=${meF.body?.myDirection}`);
ok('UI tagsForDirection(myDirection)', /tagsForDirection\(me\?\.myDirection/.test(page), 'wired');
ok('UI ConfirmDialog', page.includes('ReviewConfirmDialog') && page.includes('confirmOpen'), 'confirm modal');
ok(
  'UI client labels',
  page.includes('결과물 품질이 좋아요') && page.includes('업무 태도가 전문적이에요'),
  'client PROFESSIONAL_ATTITUDE',
);
ok(
  'UI freelancer labels',
  page.includes('요구사항이 명확해요') && page.includes('협업 태도가 전문적이에요'),
  'freelancer PROFESSIONAL_ATTITUDE differs',
);
ok(
  'types both tag sets',
  types.includes('CLIENT_TO_FREELANCER_TAGS') && types.includes('FREELANCER_TO_CLIENT_TAGS'),
  'types',
);

let webOk = false;
let webDetail = 'skipped';
try {
  const web = await fetch('http://127.0.0.1:5173/', { signal: AbortSignal.timeout(3000) });
  webOk = web.status === 200;
  webDetail = `status=${web.status}`;
} catch (e) {
  webDetail = `unreachable (${e && e.cause ? e.cause.code : 'err'}) — optional`;
}
ok('web preview (optional)', true, webDetail + (webOk ? '' : ' — not required for closeout'));

const fail = results.filter((r) => !r.p).length;
const outDir = path.join(root, 'feedback_loop/2026-09-20');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'reviews-r4-closeout.json'),
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      results,
      verdict: fail === 0 ? 'R4 closed for increment (API+source)' : 'FAIL',
    },
    null,
    2,
  ),
);
console.log(`TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
