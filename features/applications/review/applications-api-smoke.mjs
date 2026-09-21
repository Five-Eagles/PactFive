/**
 * applications live API smoke — seed recruiting / closed 기준.
 * 실행: node features/applications/review/applications-api-smoke.mjs
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

const recruiting = byKey['client-recruiting'];
const applicant = byKey['freelancer-applicant'];
const closed = byKey['client-recruitment-closed'];
if (!recruiting?.projectId || !closed?.projectId) throw new Error('seed incomplete');

const cTok = await login('client-recruiting');
const fTok = await login('freelancer-applicant');
const closedTok = await login('client-recruitment-closed');
const prj = recruiting.projectId;

const proj = await api(`/api/v1/projects/${prj}`, { token: cTok });
const ac = proj.body?.applicationCount ?? proj.body?.project?.applicationCount;
const pending = proj.body?.pendingApplicationCount ?? proj.body?.project?.pendingApplicationCount;
const recruitment = proj.body?.recruitmentStatus ?? proj.body?.project?.recruitmentStatus;
ok(
  'recruiting OPEN + counts',
  proj.status === 200 && recruitment === 'OPEN' && Number(ac) >= 1,
  `status=${proj.status} recruitment=${recruitment} ac=${ac} pending=${pending}`,
);

const list = await api(`/api/v1/projects/${prj}/applications`, { token: cTok });
const items = list.body?.items ?? list.body?.applications ?? [];
ok('client list applications', list.status === 200 && items.length >= 1, `status=${list.status} items=${items.length}`);

const cover = '가'.repeat(100);
const bad = await api(`/api/v1/projects/${prj}/applications`, {
  method: 'POST',
  token: cTok,
  body: { coverLetter: cover, expectedAmount: 10000, expectedDurationDays: 10 },
  extraHeaders: { 'Idempotency-Key': `ap-smoke-client-${Date.now()}` },
});
ok('CLIENT apply blocked', bad.status === 403, `status=${bad.status} code=${bad.body?.error?.code}`);

const me = await api('/api/v1/applications/me', { token: fTok });
const meItems = me.body?.items ?? me.body?.applications ?? [];
ok('freelancer applications/me', me.status === 200 && meItems.length >= 1, `status=${me.status} items=${meItems.length}`);

const elig = await api(`/api/v1/projects/${prj}/application-eligibility`, { token: fTok });
ok(
  'eligibility reachable',
  elig.status === 200 && typeof elig.body?.canApply === 'boolean',
  `status=${elig.status} canApply=${elig.body?.canApply} profileCompletion=${elig.body?.profileCompletion}`,
);

const closedProj = await api(`/api/v1/projects/${closed.projectId}`, { token: closedTok });
const cac = closedProj.body?.applicationCount ?? closedProj.body?.project?.applicationCount;
const crec = closedProj.body?.recruitmentStatus ?? closedProj.body?.project?.recruitmentStatus;
ok(
  'CLOSED cumulative count',
  closedProj.status === 200 && crec === 'CLOSED' && Number(cac) >= 1,
  `status=${closedProj.status} recruitment=${crec} ac=${cac}`,
);

const fail = results.filter((r) => !r.p).length;
console.log(`TOTAL ${results.length} PASS ${results.length - fail} FAIL ${fail}`);
const outDir = path.join(root, 'feedback_loop/2026-09-21');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'applications-api-smoke.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2),
);
process.exit(fail ? 1 : 0);
