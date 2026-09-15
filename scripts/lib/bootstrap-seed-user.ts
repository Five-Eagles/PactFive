/**
 * scripts/lib/bootstrap-seed-user.ts
 *
 * 2026-09-10 추가 — seed-dev-accounts.js/seed-contractable-project.js가 계정을 만들 때 그동안
 * `POST /api/v1/auth/registrations`(공개 signUp)를 거쳐 왔는데, Confirm Email이 켜져 있으면
 * Supabase가 그 호출마다 실제 확인 이메일을 "보내려고 시도"해서 시간당 2통 제한에 걸리고,
 * 꺼져 있으면 서버 코드(auth.service.ts 267~274행)가 signUp의 즉시-세션 응답을 설정 오류로
 * 보고 무조건 503으로 막는다 — 즉 켜도 막히고 꺼도 막히는 상태였다(2026-09-10 논의).
 *
 * 이 스크립트는 그 경로를 완전히 피한다. Supabase Admin API의 `auth.admin.createUser({
 * email_confirm: true })`는 signUp과 다른 호출이라 확인 이메일을 아예 보내지 않는다(전송
 * 자체가 없으니 rate limit 대상도 아니다) — 공식 문서·이슈 기준으로 이번 세션에서 확인했다.
 * 그렇게 만든 Supabase Auth 계정에 맞춰 로컬 `users` 테이블 행도 Prisma로 직접 INSERT한다
 * (app/server의 실제 서버 코드가 쓰는 것과 동일한 PrismaClient 싱글턴·ID 생성 규칙을
 * 그대로 가져다 쓴다 — auth.service.ts의 resolveOrCreateIntentUser()가 만드는 모양과
 * 똑같이 { id, authUserId, email, name, role, profileImageUrl: null, deletedAt: null }).
 *
 * 그 다음부터는 원래 스크립트가 그대로 쓰던 POST /api/v1/auth/sessions(로그인)를 쓴다 —
 * 이건 이메일을 보내지 않으므로 손댈 이유가 없었다. login()은 로컬에 user가 이미 있으면
 * (findByAuthUserId) registrationIntent 없이도 바로 세션을 만들어 준다(auth.service.ts
 * 422행) — 그래서 이 스크립트가 registrationIntent를 전혀 안 만들어도 로그인이 된다.
 *
 * 프로젝트/지원/계약/결제 등 나머지 테이블은 손대지 않는다 — 그쪽은 애초에 이메일을 보내는
 * 코드가 아니라 rate limit과 무관했고, ApplicationOperation/ContractSignatureAudit/
 * PaymentIdempotencyRecord 같은 이벤트·감사·멱등성 테이블을 서버의 실제 서비스 로직이
 * 채워야 앱이 정합성 있게 동작한다 — 그 테이블들까지 CSV로 직접 꽂으면 화면에는 보여도
 * 실제 상태 전이(재시도·감사 로그·멱등성 체크)가 깨질 수 있어 하지 않는다. 계정 생성이라는
 * 진짜 병목만 이 스크립트로 우회하고, 나머지는 이미 검증된 API 흐름을 그대로 쓴다.
 *
 * 사용: tsx scripts/lib/bootstrap-seed-user.ts '{"email":"...","password":"...","name":"...","role":"CLIENT"}'
 * 성공 시 stdout에 {"authUserId":"...","userId":"...","created":true|false} 한 줄 JSON.
 * 실패 시 stderr에 {"error":"..."} 한 줄 JSON을 찍고 exit code 1.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// app/server/src/shared/prisma-client.ts와 동일한 싱글턴·어댑터 조립 방식을 그대로 재사용한다
// (단일 정본 원칙 — PrismaClient 생성 로직이 두 곳에서 갈라지지 않게).
import { getPrismaClient } from '../../app/server/src/shared/prisma-client.js';
import { createAuthRecordId } from '../../app/server/src/features/user-management/auth-record-id.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

function loadRootEnv(): void {
  const envPath = resolve(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

type Role = 'CLIENT' | 'FREELANCER';

interface Payload {
  email: string;
  password: string;
  name: string;
  role: Role;
}

function parsePayload(): Payload {
  const raw = process.argv[2];
  if (!raw) throw new Error('JSON payload 인자가 없습니다 — {"email":...,"password":...,"name":...,"role":...}');
  const parsed = JSON.parse(raw) as Partial<Payload>;
  if (!parsed.email || !parsed.password || !parsed.name || (parsed.role !== 'CLIENT' && parsed.role !== 'FREELANCER')) {
    throw new Error('payload에 email/password/name/role(CLIENT|FREELANCER)이 모두 필요합니다.');
  }
  return parsed as Payload;
}

async function findAuthUserIdByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Supabase listUsers 실패: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function main(): Promise<void> {
  loadRootEnv();
  const { email, password, name, role } = parsePayload();
  const normalizedEmail = email.trim().toLowerCase();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('.env에 SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY가 없습니다.');
  }
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Supabase Auth 쪽 — admin.createUser는 signUp과 별개 경로라 확인 이메일을 보내지
  //    않는다. 이미 있는 이메일이면 에러가 나므로 listUsers로 찾아서 재사용한다(idempotent).
  let authUserId: string;
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { seedAccount: true },
  });
  if (createError || !created?.user) {
    const existing = await findAuthUserIdByEmail(supabaseAdmin, normalizedEmail);
    if (!existing) {
      throw new Error(
        `Supabase 계정 생성 실패(${createError?.message ?? '알 수 없는 오류'})했고, listUsers에서도 ${normalizedEmail}을 찾지 못했습니다.`,
      );
    }
    authUserId = existing;
    // 기존 계정 비밀번호가 SEED_PASSWORD와 다를 수 있으니 맞춰 둔다 — 이후 로그인 단계가
    // 이 비밀번호로 POST /api/v1/auth/sessions를 호출하기 때문이다.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
    });
    if (updateError) throw new Error(`기존 Supabase 계정 비밀번호 동기화 실패: ${updateError.message}`);
  } else {
    authUserId = created.user.id;
  }

  // 2) 로컬 DB 쪽 — auth.service.ts의 resolveOrCreateIntentUser()가 만드는 것과 같은 모양의
  //    행을 직접 넣는다. 이미 있으면(재실행) 그대로 재사용한다.
  const prisma = getPrismaClient();
  try {
    const existingUser = await prisma.user.findUnique({ where: { authUserId } });
    if (existingUser) {
      process.stdout.write(`${JSON.stringify({ authUserId, userId: existingUser.id, created: false })}\n`);
      return;
    }

    const conflict = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' }, deletedAt: null },
    });
    if (conflict) {
      throw new Error(
        `이메일(${normalizedEmail})은 다른 authUserId(${conflict.authUserId})로 이미 users 테이블에 있습니다 — 데이터 불일치, 수동 확인이 필요합니다.`,
      );
    }

    const userId = createAuthRecordId('usr');
    await prisma.user.create({
      data: {
        id: userId,
        authUserId,
        email: normalizedEmail,
        name,
        role,
        profileImageUrl: null,
        deletedAt: null,
      },
    });
    process.stdout.write(`${JSON.stringify({ authUserId, userId, created: true })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(1);
});
