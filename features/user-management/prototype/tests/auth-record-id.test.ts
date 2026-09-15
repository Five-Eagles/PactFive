import assert from "node:assert/strict";
import { createAuthRecordId } from "../server/auth-record-id";
import { AuthSessionService } from "../server/auth.service";
import { InMemoryAuthRepository } from "../mock/in-memory-auth.repository";
import { MockAuthProvider } from "../mock/mock-auth.adapter";

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const timestamp = Date.parse("2026-09-08T00:00:00Z");
function decodeTime(identifier: string): number {
  return [...identifier.slice(4, 14)].reduce((sum, character) => sum * 32 + alphabet.indexOf(character), 0);
}
function fixture() {
  const provider = new MockAuthProvider(); const repository = new InMemoryAuthRepository();
  const service = new AuthSessionService({ provider, repositories: repository,
    sessionAbsoluteTtlMs: 7 * 24 * 60 * 60 * 1000,
    refreshFingerprintKey: "synthetic-fingerprint-key-for-testing-only",
    oauthIntentEncryptionKey: "synthetic-oauth-intent-key-for-testing-only",
    registrationRecoveryEncryptionKey: "synthetic-registration-key-for-testing-only",
    oauthCallbackUrl: "https://api.pactfive.test/api/v1/auth/oauth-callbacks",
    now: () => new Date(timestamp),
  });
  return { provider, repository, service };
}

export async function runAuthRecordIdTests(
  test: (group: string, name: string, action: () => unknown | Promise<unknown>) => Promise<void>,
): Promise<void> {
  const group = "인증 식별자";
  await test(group, "ID-01: 사용자·세션 식별자는 정본 접두어와 ULID로 정확히 삼십 자다", () => {
    for (const prefix of ["usr", "ses"] as const) {
      const identifier = createAuthRecordId(prefix, timestamp);
      assert.equal(identifier.length, 30);
      assert.match(identifier, /^(usr|ses)_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
      assert.equal(decodeTime(identifier), timestamp);
    }
  });
  await test(group, "ID-01: 최대·최소 시각과 전체 난수 비트가 손실 없이 인코딩된다", () => {
    assert.equal(createAuthRecordId("usr", 0, new Uint8Array(10)), "usr_" + "0".repeat(26));
    assert.equal(createAuthRecordId("ses", 0xffffffffffff, new Uint8Array(10).fill(255)), "ses_7" + "Z".repeat(25));
    const entropy = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const identifier = createAuthRecordId("usr", timestamp, entropy);
    const decoded = [...identifier.slice(14)].reduce((sum, character) => sum * 32n + BigInt(alphabet.indexOf(character)), 0n);
    const expected = [...entropy].reduce((sum, byte) => sum * 256n + BigInt(byte), 0n);
    assert.equal(decoded, expected);
  });
  await test(group, "ID-01: 범위 밖 시각·접두어·난수 길이는 축약하지 않고 거부한다", () => {
    for (const invalid of [-1, 1.1, NaN, Infinity, 0x1000000000000]) assert.throws(() => createAuthRecordId("usr", invalid));
    assert.throws(() => createAuthRecordId("bad" as "usr", timestamp));
    for (const length of [0, 9, 11]) assert.throws(() => createAuthRecordId("usr", timestamp, new Uint8Array(length)));
  });
  await test(group, "ID-01: 같은 밀리초의 반복 호출도 새 보안 난수를 사용한다", () => {
    const generated = new Set(Array.from({ length: 2048 }, () => createAuthRecordId("usr", timestamp)));
    assert.equal(generated.size, 2048);
    assert(createAuthRecordId("usr", timestamp, new Uint8Array(10)) < createAuthRecordId("usr", timestamp + 1, new Uint8Array(10)));
  });
  await test(group, "ID-02: 기본 생성기를 사용한 가입 확인은 사용자·세션 모두 DB 길이에 맞는다", async () => {
    const f = fixture();
    await f.service.register({ email: "id-check@example.test", password: "password123", name: "식별자 검증", role: "CLIENT", returnTo: "/" });
    const confirmed = await f.service.confirmEmail(f.provider.getConfirmationToken("id-check@example.test")!);
    const user = f.repository.getUsers()[0]; const session = f.repository.getSessions()[0];
    assert.match(user.id, /^usr_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    assert.match(session.id, /^ses_[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    assert.equal(session.userId, user.id); assert.equal(confirmed.body.user.userId, user.id);
    assert.equal(decodeTime(user.id), timestamp); assert.equal(decodeTime(session.id), timestamp);
  });
  await test(group, "ID-02: 기존 긴 사용자 식별자는 로그인·세션 발급 중 변경하지 않는다", async () => {
    const f = fixture(); const userId = "usr_0123456789abcdef0123456789abcdef";
    f.provider.seedAccount({ authUserId: "auth_existing", email: "existing@example.test", emailVerified: true, password: "password123" });
    f.repository.seedUser({ id: userId, authUserId: "auth_existing", email: "existing@example.test", name: "기존 사용자", role: "CLIENT", profileImageUrl: null, deletedAt: null, lastLoginAt: null });
    const loggedIn = await f.service.login({ email: "existing@example.test", password: "password123" });
    assert.equal(loggedIn.body.user.userId, userId);
    assert.equal(f.repository.getUsers()[0].id, userId);
    assert.equal(f.repository.getSessions()[0].userId, userId);
    assert.equal(f.repository.getSessions()[0].id.length, 30);
  });
}
