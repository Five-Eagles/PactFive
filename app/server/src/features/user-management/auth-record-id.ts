import { randomBytes } from 'node:crypto';

/**
 * 원본: features/user-management/prototype/server/auth-record-id.ts (오민혁, PR #89
 * 후속 #2026-09-08 CR-0002). ERD `users.id`/`auth_sessions.id`는 varchar(30)인데 기존
 * `AuthSessionService`의 기본 생성기는 `usr_`/`ses_` + UUID32(하이픈 제거)라 36자였다 —
 * schema.prisma의 `@db.VarChar(30)`을 넘겨 실제 DB에는 저장되지 않는 값이었다.
 *
 * 접두어(3) + `_`(1) + ULID26 = 30자로 고쳤다. 기존 36자로 이미 저장된 데이터는 이 파일이
 * 건드리지 않는다 — change-requests/0002-user-rating-and-auth-id-integration.md "미완료 조건"
 * 참고(실제 36자 자료 조사·이관은 별도 승인 필요, 이번 반영 범위 밖).
 */
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAX_TIMESTAMP = 0xffffffffffff;

/** ERD의 접두어 + ULID 26자. 같은 밀리초 내 정렬은 보장하지 않는다. */
export function createAuthRecordId(
  prefix: 'usr' | 'ses',
  timestamp = Date.now(),
  entropy: Uint8Array = randomBytes(10),
): string {
  if (
    (prefix !== 'usr' && prefix !== 'ses') ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_TIMESTAMP ||
    !(entropy instanceof Uint8Array) ||
    entropy.length !== 10
  ) {
    throw new Error('Invalid auth record ID source');
  }
  let encoded = BigInt(timestamp);
  for (const byte of entropy) encoded = (encoded << 8n) | BigInt(byte);
  let ulid = '';
  for (let index = 0; index < 26; index += 1) {
    ulid = CROCKFORD_BASE32[Number(encoded & 31n)] + ulid;
    encoded >>= 5n;
  }
  return `${prefix}_${ulid}`;
}
