import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 실행: features/user-management에서 npx tsx prototype/run.tsx
// JSX를 이 파일에 쓰지 않는다. 그래야 React 설치 확인보다 react/jsx-runtime이 먼저 로드되지 않는다.
function ensurePackagesInstalled(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  while (!existsSync(path.join(dir, "scripts", "ensure-deps.js"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("scripts/ensure-deps.js를 찾지 못했습니다.");
    dir = parent;
  }
  execSync(`node ${JSON.stringify(path.join(dir, "scripts", "ensure-deps.js"))}`, { stdio: "inherit" });
}

type TestResult = {
  group: string;
  name: string;
  ok: boolean;
  detail?: string;
};

async function main() {
  ensurePackagesInstalled();

  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { LoginForm } = await import("./web/LoginForm");
  const webEntry = await import("./web/index");
  const {
    AuthProblem,
    AuthSessionService,
    buildBearerAuthorization,
    fingerprintRefreshToken,
    requireAllowedOrigin,
    safeReturnToOrRoot,
    validateReturnTo,
  } = await import("./server/auth.service");
  const {
    createAuthController,
    OAUTH_INTENT_COOKIE_NAME,
    OAUTH_INTENT_COOKIE_OPTIONS,
    REGISTRATION_RECOVERY_COOKIE_NAME,
    REGISTRATION_RECOVERY_COOKIE_OPTIONS,
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_OPTIONS,
  } = await import("./server/auth.controller");
  const { InMemoryAuthRepository } = await import("./mock/in-memory-auth.repository");
  const { MockAuthProvider } = await import("./mock/mock-auth.adapter");
  const {
    MOCK_CLIENT_AUTHORIZATION,
    MOCK_FREELANCER_AUTHORIZATION,
    authenticateMockAuthorization,
  } = await import("./mock/auth.mock");
  const { createMockAuthMiddlewareFromEnvironment } = await import("./mock/mock-auth.middleware");
  const { createSupabaseAuthAdapter } = await import("./server/supabase-auth.adapter");
  const {
    AuthApiError,
    buildProtectedApiHeaders,
    createAuthMutationQueue,
    createProtectedApiCaller,
    createRefreshCoordinator,
  } = await import("./web/api/auth");
  const {
    createAuthEpochGuard,
    createEpochSingleFlightRestorer,
    createReturnNavigator,
    createSingleFlightRestorer,
    reduceAuthFailure,
  } = await import("./web/useAuth");

  const results: TestResult[] = [];
  const here = path.dirname(fileURLToPath(import.meta.url));

  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }

  function assertEqual(actual: unknown, expected: unknown, message: string): void {
    if (actual !== expected) throw new Error(`${message} (expected=${String(expected)}, actual=${String(actual)})`);
  }

  async function expectProblem(
    action: () => unknown | Promise<unknown>,
    expected: { status?: number; code: string; message?: string },
  ): Promise<any> {
    try {
      await action();
    } catch (error) {
      assert(error instanceof AuthProblem, `AuthProblem이 아닌 오류: ${String(error)}`);
      assertEqual(error.code, expected.code, "오류 코드 불일치");
      if (expected.status !== undefined) assertEqual(error.status, expected.status, "HTTP 상태 불일치");
      if (expected.message !== undefined) assertEqual(error.message, expected.message, "사용자 메시지 불일치");
      return error;
    }
    throw new Error(`${expected.code} 오류가 발생하지 않았습니다.`);
  }

  async function test(group: string, name: string, action: () => unknown | Promise<unknown>): Promise<void> {
    try {
      await action();
      results.push({ group, name, ok: true });
      console.log(`[PASS] [${group}] ${name}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ group, name, ok: false, detail });
      console.error(`[FAIL] [${group}] ${name}: ${detail}`);
    }
  }

  function createRequestHarness(input: {
    origin?: string;
    cookie?: string;
    authorization?: string;
    body?: unknown;
    query?: Record<string, string>;
  }) {
    const headers: Record<string, string | undefined> = {
      origin: input.origin,
      cookie: input.cookie,
      authorization: input.authorization,
    };
    return {
      body: input.body ?? {},
      query: input.query ?? {},
      header: (name: string) => headers[name.toLowerCase()],
    } as any;
  }

  function createResponseHarness() {
    const state = {
      status: 0,
      ended: false,
      body: undefined as unknown,
      clearedCookies: [] as string[],
      cookies: [] as string[],
      headers: {} as Record<string, string>,
      redirect: undefined as string | undefined,
    };
    const response = {
      cookie: (name: string) => { state.cookies.push(name); return response; },
      clearCookie: (name: string) => { state.clearedCookies.push(name); return response; },
      setHeader: (name: string, value: string) => { state.headers[name] = value; return response; },
      status: (status: number) => { state.status = status; return response; },
      json: (body: unknown) => { state.body = body; state.ended = true; return response; },
      end: () => { state.ended = true; return response; },
      redirect: (status: number, target: string) => {
        state.status = status;
        state.redirect = target;
        state.ended = true;
        return response;
      },
    } as any;
    return { response, state };
  }

  function createFixture(keyOverrides: {
    refreshFingerprintKey?: string;
    oauthIntentEncryptionKey?: string;
    registrationRecoveryEncryptionKey?: string;
  } = {}) {
    const provider = new MockAuthProvider();
    const repository = new InMemoryAuthRepository();
    let nowMs = Date.parse("2026-08-26T00:00:00.000Z");
    let userSequence = 100;
    let sessionSequence = 100;

    const accounts = [
      { authUserId: "auth_client", email: "client@example.com", emailVerified: true, password: "password123" },
      { authUserId: "auth_social", email: "social@example.com", emailVerified: true, password: null },
      { authUserId: "auth_withdrawn", email: "withdrawn@example.com", emailVerified: true, password: "password123" },
      { authUserId: "auth_orphan", email: "orphan@example.com", emailVerified: true, password: "password123" },
      { authUserId: "auth_unconfirmed", email: "unconfirmed@example.com", emailVerified: false, password: "password123" },
    ];
    for (const account of accounts) provider.seedAccount(account);

    repository.seedUser({
      id: "usr_client",
      authUserId: "auth_client",
      email: "client@example.com",
      name: "클라이언트 사용자",
      role: "CLIENT",
      profileImageUrl: null,
      deletedAt: null,
      lastLoginAt: null,
    });
    repository.seedUser({
      id: "usr_social",
      authUserId: "auth_social",
      email: "social@example.com",
      name: "소셜 사용자",
      role: "FREELANCER",
      profileImageUrl: null,
      deletedAt: null,
      lastLoginAt: null,
    });
    repository.seedUser({
      id: "usr_withdrawn",
      authUserId: "auth_withdrawn",
      email: "withdrawn@example.com",
      name: "탈퇴 사용자",
      role: "CLIENT",
      profileImageUrl: null,
      deletedAt: new Date("2026-08-20T00:00:00.000Z"),
      lastLoginAt: null,
    });

    const service = new AuthSessionService({
      provider,
      repositories: repository,
      // 7일은 승인 전 제안값이다. 프로토타입에서도 생성자에 명시 주입해 확정 상수로 숨기지 않는다.
      sessionAbsoluteTtlMs: 7 * 24 * 60 * 60 * 1000,
      refreshFingerprintKey: keyOverrides.refreshFingerprintKey ?? "non-secret-prototype-fingerprint-key",
      oauthIntentEncryptionKey: keyOverrides.oauthIntentEncryptionKey ?? "non-secret-prototype-oauth-intent-key",
      registrationRecoveryEncryptionKey:
        keyOverrides.registrationRecoveryEncryptionKey ?? "non-secret-prototype-registration-recovery-key",
      oauthCallbackUrl: "https://api.pactfive.test/api/v1/auth/oauth-callbacks",
      now: () => new Date(nowMs),
      nonce: () => `nonce_${nowMs}_${++sessionSequence}`,
      nextUserId: () => `usr_generated_${++userSequence}`,
      nextSessionId: () => `ses_generated_${++sessionSequence}`,
    });

    return {
      provider,
      repository,
      service,
      advance: (milliseconds: number) => { nowMs += milliseconds; },
    };
  }

  async function loginClient(fixture: ReturnType<typeof createFixture>, returnTo = "/projects/new") {
    return fixture.service.login({
      email: "client@example.com",
      password: "password123",
      returnTo,
      deviceLabel: "prototype-browser",
    });
  }

  console.log("=== user-management prototype 자동 검증 ===");

  await test("R01", "확인 전에는 앱 사용자·세션·토큰을 만들지 않고, 확인 뒤에만 동기화한다", async () => {
    const f = createFixture();
    await expectProblem(() => f.service.register({} as any), { status: 422, code: "VALIDATION_ERROR" });
    await expectProblem(() => f.service.confirmEmail("bad"), { status: 400, code: "EMAIL_CONFIRMATION_INVALID" });
    const initialUsers = f.repository.getUsers().length;
    const response = await f.service.register({
      email: "new@example.com",
      password: "password123",
      name: "신규 사용자",
      role: "FREELANCER",
      returnTo: "/projects/new",
    });
    assertEqual(response.status, "EMAIL_VERIFICATION_REQUIRED", "가입 접수 상태");
    assert(!JSON.stringify(response).toLowerCase().includes("token"), "가입 202에 토큰이 포함됨");
    assertEqual(f.repository.getUsers().length, initialUsers, "확인 전 앱 사용자 생성 금지");
    assertEqual(f.repository.getSessions().length, 0, "확인 전 앱 세션 생성 금지");
    const token = f.provider.getConfirmationToken("new@example.com");
    assert(token, "Mock 확인 token hash가 준비되지 않음");
    const confirmed = await f.service.confirmEmail(token);
    assertEqual(confirmed.body.user.role, "FREELANCER", "보호 intent 역할 반영");
    assertEqual(f.repository.getSessions().length, 1, "확인 후 세션 생성");
    assert(!Object.prototype.hasOwnProperty.call(confirmed.body, "refreshToken"), "공개 본문에 Refresh Token 노출");

    const contextConflict = createFixture();
    await contextConflict.service.register({
      email: "confirm-conflict@example.com",
      password: "password123",
      name: "확인 충돌 사용자",
      role: "CLIENT",
      returnTo: "/",
    });
    const conflictToken = contextConflict.provider.getConfirmationToken("confirm-conflict@example.com")!;
    const activeLogin = await loginClient(contextConflict);
    await expectProblem(
      () => contextConflict.service.confirmEmail(conflictToken, undefined, activeLogin.refreshToken),
      { status: 409, code: "AUTH_CONTEXT_CONFLICT" },
    );
    await contextConflict.service.logout(activeLogin.refreshToken);
    const confirmedAfterLogout = await contextConflict.service.confirmEmail(
      conflictToken,
      undefined,
      activeLogin.refreshToken,
    );
    assertEqual(confirmedAfterLogout.body.user.email, "confirm-conflict@example.com", "충돌 검사 전에 token hash가 소비됨");

    const compensated = createFixture();
    compensated.repository.failNextRegistrationIntentSave();
    await expectProblem(
      () => compensated.service.register({
        email: "compensate@example.com",
        password: "password123",
        name: "보상 사용자",
        role: "CLIENT",
        returnTo: "/",
      }),
      { status: 503, code: "AUTH_REGISTRATION_SYNC_FAILED" },
    );
    assert(!compensated.provider.hasAccount("compensate@example.com"), "intent 저장 실패 시 신규 공급자 사용자 미삭제");

    const recovery = createFixture();
    await recovery.service.register({
      email: "recovery@example.com",
      password: "password123",
      name: "복구 사용자",
      role: "CLIENT",
      returnTo: "/",
    });
    await recovery.provider.verifyEmail(recovery.provider.getConfirmationToken("recovery@example.com")!);
    recovery.advance(25 * 60 * 60 * 1000);
    const recoveryProblem = await expectProblem(
      () => recovery.service.login({ email: "recovery@example.com", password: "password123" }),
      { status: 409, code: "REGISTRATION_COMPLETION_REQUIRED" },
    );
    assertEqual(recovery.repository.getUsers().length, 3, "만료 intent로 자동 앱 사용자 생성 금지");
    assert(typeof recoveryProblem.recoveryCookie === "string", "10분 복구 쿠키 자료 누락");
    assertEqual(REGISTRATION_RECOVERY_COOKIE_NAME, "__Host-pactfiveRegistrationRecovery", "복구 쿠키 이름");
    assertEqual(REGISTRATION_RECOVERY_COOKIE_OPTIONS.secure, true, "복구 쿠키 Secure");
    assertEqual(REGISTRATION_RECOVERY_COOKIE_OPTIONS.httpOnly, true, "복구 쿠키 HttpOnly");
    assertEqual(REGISTRATION_RECOVERY_COOKIE_OPTIONS.sameSite, "strict", "복구 쿠키 SameSite");
    assertEqual(REGISTRATION_RECOVERY_COOKIE_OPTIONS.maxAge, 10 * 60 * 1000, "복구 쿠키 10분 TTL");
    const completed = await recovery.service.completeRegistration(
      {
        email: "recovery@example.com",
        password: "password123",
        name: "새로 확인한 이름",
        role: "FREELANCER",
        returnTo: "/projects/new",
      },
      recoveryProblem.recoveryCookie,
    );
    assertEqual(completed.body.user.name, "새로 확인한 이름", "오래된 intent 이름을 복원함");
    assertEqual(completed.body.user.role, "FREELANCER", "복구 폼의 새 역할 미반영");
    assertEqual(completed.body.returnTo, "/projects/new", "복구 폼의 새 returnTo 미반영");

    const direct = createFixture();
    await expectProblem(
      () => direct.service.completeRegistration(
        {
          email: "orphan@example.com",
          password: "password123",
          name: "직접 가입자",
          role: "CLIENT",
          returnTo: "/",
        },
        undefined,
      ),
      { status: 403, code: "REGISTRATION_RECOVERY_INVALID" },
    );

    const retryableRecovery = createFixture();
    await retryableRecovery.service.register({
      email: "retry-recovery@example.com",
      password: "password123",
      name: "초기 이름",
      role: "CLIENT",
      returnTo: "/",
    });
    await retryableRecovery.provider.verifyEmail(
      retryableRecovery.provider.getConfirmationToken("retry-recovery@example.com")!,
    );
    retryableRecovery.advance(25 * 60 * 60 * 1000);
    const retryProof = await expectProblem(
      () => retryableRecovery.service.login({
        email: "retry-recovery@example.com",
        password: "password123",
      }),
      { status: 409, code: "REGISTRATION_COMPLETION_REQUIRED" },
    );
    const originalCreateSession = retryableRecovery.repository.createSession.bind(retryableRecovery.repository);
    let rejectFirstSessionWrite = true;
    retryableRecovery.repository.createSession = async (record) => {
      if (rejectFirstSessionWrite) {
        rejectFirstSessionWrite = false;
        throw new Error("simulated recovery session failure");
      }
      return originalCreateSession(record);
    };
    const retryInput = {
      email: "retry-recovery@example.com",
      password: "password123",
      name: "재입력 이름",
      role: "FREELANCER" as const,
      returnTo: "/projects/new",
    };
    await expectProblem(
      () => retryableRecovery.service.completeRegistration(retryInput, retryProof.recoveryCookie),
      { status: 503, code: "AUTH_SESSION_SYNC_FAILED" },
    );
    assert(
      !(await retryableRecovery.repository.findByEmail("retry-recovery@example.com")),
      "세션 실패 후 불완전 앱 사용자가 남아 복구 재시도를 막음",
    );
    const retried = await retryableRecovery.service.completeRegistration(retryInput, retryProof.recoveryCookie);
    assertEqual(retried.body.user.name, "재입력 이름", "동일 복구 proof 재시도 실패");
    const tamperedRecoveryEnvelope = retryProof.recoveryCookie.split(".");
    const recoveryCipherFirst = tamperedRecoveryEnvelope[3][0];
    tamperedRecoveryEnvelope[3] = `${recoveryCipherFirst === "A" ? "B" : "A"}${tamperedRecoveryEnvelope[3].slice(1)}`;
    await expectProblem(
      () => retryableRecovery.service.completeRegistration(retryInput, tamperedRecoveryEnvelope.join(".")),
      { status: 403, code: "REGISTRATION_RECOVERY_INVALID" },
    );

    const tenMinuteExpiry = createFixture();
    await tenMinuteExpiry.service.register({
      email: "ten-minute@example.com",
      password: "password123",
      name: "십분 복구",
      role: "CLIENT",
      returnTo: "/",
    });
    await tenMinuteExpiry.provider.verifyEmail(
      tenMinuteExpiry.provider.getConfirmationToken("ten-minute@example.com")!,
    );
    tenMinuteExpiry.advance(25 * 60 * 60 * 1000);
    const tenMinuteProof = await expectProblem(
      () => tenMinuteExpiry.service.login({ email: "ten-minute@example.com", password: "password123" }),
      { status: 409, code: "REGISTRATION_COMPLETION_REQUIRED" },
    );
    tenMinuteExpiry.advance(10 * 60 * 1000 + 1);
    await expectProblem(
      () => tenMinuteExpiry.service.completeRegistration(
        {
          email: "ten-minute@example.com",
          password: "password123",
          name: "십분 재입력",
          role: "CLIENT",
          returnTo: "/",
        },
        tenMinuteProof.recoveryCookie,
      ),
      { status: 410, code: "REGISTRATION_RECOVERY_EXPIRED" },
    );

    const expiredRecovery = createFixture();
    await expiredRecovery.service.register({
      email: "expired-recovery@example.com",
      password: "password123",
      name: "만료 복구",
      role: "CLIENT",
      returnTo: "/",
    });
    await expiredRecovery.provider.verifyEmail(
      expiredRecovery.provider.getConfirmationToken("expired-recovery@example.com")!,
    );
    expiredRecovery.advance(31 * 24 * 60 * 60 * 1000);
    const expiredRecoveryProblem = await expectProblem(
      () => expiredRecovery.service.login({
        email: "expired-recovery@example.com",
        password: "password123",
      }),
      { status: 403, code: "REGISTRATION_NOT_AVAILABLE" },
    );
    assertEqual(expiredRecoveryProblem.recoveryCookie, undefined, "30일 만료 뒤 복구 쿠키 발급");
  });

  await test("R01", "live 가입 응답을 소유권 증거로 신뢰하지 않고 확인 type을 고정한다", async () => {
    let confirmationType: string | undefined;
    const adapter = createSupabaseAuthAdapter({
      supabaseUrl: "https://unit.supabase.co",
      publishableKey: "unit-publishable-key",
      serviceRoleKey: "unit-service-role-key",
      emailConfirmationRedirectTo: "https://app.pactfive.test/auth/email-confirmation",
      clientFactory: (_url, _key, options) => {
        assertEqual(options.auth?.persistSession, false, "이메일 signUp이 세션을 지속함");
        return {
          auth: {
            signUp: async () => ({
              data: {
                user: {
                  id: "33333333-3333-4333-8333-333333333333",
                  email: "pending-live@example.com",
                  identities: [{ id: "existing-unconfirmed-identity" }],
                  email_confirmed_at: null,
                  confirmed_at: null,
                },
                session: null,
              },
              error: null,
            }),
            verifyOtp: async (input: { type: string }) => {
              confirmationType = input.type;
              return {
                data: { session: null, user: null },
                error: { code: "otp_expired", message: "expired" },
              };
            },
          },
        } as any;
      },
    });

    const registration = await adapter.registerEmail({
      email: "pending-live@example.com",
      password: "attacker-password",
    });
    assertEqual(registration.created, false, "기존 미확인 identity를 신규 사용자로 오판함");
    try {
      await adapter.verifyEmail("unit-token-hash");
    } catch {
      // 이 검사는 공급자 결과가 아니라 adapter가 SDK에 전달한 고정 type만 확인한다.
    }
    assertEqual(confirmationType, "email", "이메일 확인 token hash type 불일치");
  });

  await test("R02", "활성 이메일 중복 가입은 같은 202를 반환하고 기존 사용자를 바꾸지 않는다", async () => {
    const f = createFixture();
    const before = JSON.stringify(f.repository.getUsers().find((user) => user.id === "usr_client"));
    const duplicate = await f.service.register({
      email: "CLIENT@example.com",
      password: "different-password",
      name: "바꾸려는 이름",
      role: "FREELANCER",
      returnTo: "/",
    });
    assertEqual(duplicate.status, "EMAIL_VERIFICATION_REQUIRED", "중복 이메일의 동일 202 상태");
    assertEqual(
      JSON.stringify(f.repository.getUsers().find((user) => user.id === "usr_client")),
      before,
      "기존 사용자 변경 금지",
    );

    const pending = createFixture();
    await pending.service.register({
      email: "pending@example.com",
      password: "owner-password",
      name: "원 소유자",
      role: "CLIENT",
      returnTo: "/projects/new",
    });
    const originalIntent = await pending.repository.findRegistrationIntentByEmail("pending@example.com");
    const originalToken = pending.provider.getConfirmationToken("pending@example.com");
    assert(originalIntent && originalToken, "확인 대기 fixture 준비 실패");

    const originalRegisterEmail = pending.provider.registerEmail.bind(pending.provider);
    pending.provider.registerEmail = async (input) => ({
      ...(await originalRegisterEmail(input)),
      // 실제 Supabase의 기존 미확인 identity 오판을 재현한다. 서비스는 이 힌트를 신뢰하면 안 된다.
      created: true,
    });
    const attackerResponse = await pending.service.register({
      email: "pending@example.com",
      password: "attacker-password",
      name: "공격자 이름",
      role: "FREELANCER",
      returnTo: "/",
    });
    const afterAttack = await pending.repository.findRegistrationIntentByEmail("pending@example.com");
    assertEqual(attackerResponse.status, "EMAIL_VERIFICATION_REQUIRED", "공격 시에도 동일 202");
    assertEqual(afterAttack?.nonce, originalIntent.nonce, "소유권 없이 pending intent nonce 덮어씀");
    assertEqual(afterAttack?.role, "CLIENT", "소유권 없이 pending 역할 덮어씀");
    pending.provider.registerEmail = originalRegisterEmail;

    pending.advance(60 * 60 * 1000);
    const resendResponse = await pending.service.requestEmailConfirmation("pending@example.com");
    const afterResend = await pending.repository.findRegistrationIntentByEmail("pending@example.com");
    const resentToken = pending.provider.getConfirmationToken("pending@example.com");
    assertEqual(resendResponse.status, "EMAIL_CONFIRMATION_REQUEST_ACCEPTED", "재전송 동일 응답");
    assert(afterResend && afterResend.nonce !== originalIntent.nonce, "정상 재전송에서 최신 nonce 미회전");
    assert(afterResend.expiresAt.getTime() > originalIntent.expiresAt.getTime(), "재전송에서 24시간 TTL 미연장");
    assert(resentToken !== originalToken, "Mock 확인 token hash 미회전");

    pending.advance(25 * 60 * 60 * 1000);
    const expiredNonce = (await pending.repository.findRegistrationIntentByEmail("pending@example.com"))?.nonce;
    const expiredToken = pending.provider.getConfirmationToken("pending@example.com");
    await pending.service.requestEmailConfirmation("pending@example.com");
    assertEqual(
      (await pending.repository.findRegistrationIntentByEmail("pending@example.com"))?.nonce,
      expiredNonce,
      "만료 intent를 이메일-only 재전송으로 교체함",
    );
    assertEqual(pending.provider.getConfirmationToken("pending@example.com"), expiredToken, "만료 intent인데 메일 token을 재발급함");
    await expectProblem(
      () => pending.service.requestEmailConfirmation("not-an-email"),
      { status: 422, code: "VALIDATION_ERROR" },
    );

    await pending.service.register({
      email: "pending@example.com",
      password: "owner-password",
      name: "다시 확인한 이름",
      role: "FREELANCER",
      returnTo: "/",
    });
    const replacedByOwner = await pending.repository.findRegistrationIntentByEmail("pending@example.com");
    assert(replacedByOwner?.nonce !== expiredNonce, "전체 가입 폼+소유권 확인 후 만료 intent 미교체");
    assertEqual(replacedByOwner?.role, "FREELANCER", "소유자 재접수 역할 미반영");
  });

  await test("R03", "기존 사용자의 역할은 재로그인·두 번째 OAuth로 바뀌지 않는다", async () => {
    const f = createFixture();
    const start = await f.service.createOAuthAuthorization(
      { oauthProvider: "KAKAO", role: "FREELANCER", returnTo: "/" },
    );
    f.provider.queueOAuthCode("same-user", {
      authUserId: "auth_client",
      email: "client@example.com",
      emailVerified: true,
      password: "password123",
    }, f.provider.getLatestProviderFlowState());
    const result = await f.service.completeOAuthCallback("same-user", start.sealedIntent);
    assertEqual(result.body.user.role, "CLIENT", "저장된 역할 유지");
    assertEqual(f.repository.getUsers().find((user) => user.id === "usr_client")?.role, "CLIENT", "DB 역할 불변");
  });

  await test("R04", "최초 OAuth 가입은 역할이 필수이고 기존 사용자는 intent 역할을 무시한다", async () => {
    const fresh = createFixture();
    const start = await fresh.service.createOAuthAuthorization({ oauthProvider: "GOOGLE", returnTo: "/" });
    fresh.provider.queueOAuthCode("new-no-role", {
      authUserId: "auth_oauth_new",
      email: "oauth-new@example.com",
      emailVerified: true,
      password: null,
    }, fresh.provider.getLatestProviderFlowState());
    await expectProblem(
      () => fresh.service.completeOAuthCallback("new-no-role", start.sealedIntent),
      { status: 403, code: "OAUTH_ACCOUNT_NOT_AVAILABLE" },
    );

    const existing = createFixture();
    const existingStart = await existing.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "FREELANCER", returnTo: "/" },
    );
    existing.provider.queueOAuthCode("existing-role", {
      authUserId: "auth_client",
      email: "client@example.com",
      emailVerified: true,
      password: "password123",
    }, existing.provider.getLatestProviderFlowState());
    const existingResult = await existing.service.completeOAuthCallback("existing-role", existingStart.sealedIntent);
    assertEqual(existingResult.body.user.role, "CLIENT", "기존 사용자 역할 유지");
  });

  await test("R05", "계정 없음·오류 비밀번호·OAuth-only·탈퇴는 같은 401, 미확인만 403이다", async () => {
    const f = createFixture();
    await expectProblem(() => f.service.login({} as any), { status: 422, code: "VALIDATION_ERROR" });
    const attempts = [
      { email: "missing@example.com", password: "password123" },
      { email: "client@example.com", password: "wrong-password" },
      { email: "social@example.com", password: "anything123" },
      { email: "withdrawn@example.com", password: "password123" },
    ];
    const messages: string[] = [];
    for (const attempt of attempts) {
      const problem = await expectProblem(() => f.service.login(attempt), {
        status: 401,
        code: "INVALID_CREDENTIALS",
      });
      messages.push(problem.message);
    }
    assertEqual(new Set(messages).size, 1, "실패 유형별 메시지가 달라 계정 상태가 노출됨");
    await expectProblem(
      () => f.service.login({ email: "unconfirmed@example.com", password: "password123" }),
      { status: 403, code: "EMAIL_VERIFICATION_REQUIRED" },
    );
  });

  await test("R06", "공급자 성공 뒤 앱 사용자 매핑 실패 시 공급자 세션을 폐기한다", async () => {
    const f = createFixture();
    await expectProblem(
      () => f.service.login({ email: "orphan@example.com", password: "password123" }),
      { status: 403, code: "REGISTRATION_NOT_AVAILABLE" },
    );
    assert(f.provider.getCallNames().includes("signOut"), "고립 공급자 세션이 폐기되지 않음");
    assertEqual(f.repository.getSessions().length, 0, "앱 검사 실패인데 로컬 세션이 생성됨");

    const syncFailure = createFixture();
    syncFailure.repository.createSession = async () => { throw new Error("simulated DB failure"); };
    await expectProblem(() => loginClient(syncFailure), { status: 503, code: "AUTH_SESSION_SYNC_FAILED" });
    assert(syncFailure.provider.getCallNames().includes("signOut"), "세션 저장 실패 후 공급자 세션 미폐기");
  });

  await test("R07", "모든 앱 검사와 세션 생성 성공 뒤에만 lastLoginAt을 갱신한다", async () => {
    const f = createFixture();
    await expectProblem(
      () => f.service.login({ email: "client@example.com", password: "wrong-password" }),
      { status: 401, code: "INVALID_CREDENTIALS" },
    );
    assertEqual(f.repository.getUsers().find((user) => user.id === "usr_client")?.lastLoginAt, null, "실패 로그인 기록됨");
    await loginClient(f);
    assert(f.repository.getUsers().find((user) => user.id === "usr_client")?.lastLoginAt instanceof Date, "성공 로그인 미기록");
  });

  await test("R08", "GOOGLE·KAKAO만 AuthProvider 포트를 통해 시작한다", async () => {
    const f = createFixture();
    await f.service.createOAuthAuthorization({ oauthProvider: "GOOGLE", returnTo: "/" });
    await f.service.createOAuthAuthorization({ oauthProvider: "KAKAO", returnTo: "/" });
    await expectProblem(
      () => f.service.createOAuthAuthorization({ oauthProvider: "GITHUB" as any, returnTo: "/" }),
      { status: 422, code: "VALIDATION_ERROR" },
    );
    assertEqual(f.provider.getCallNames().filter((name) => name === "createOAuthAuthorization").length, 2, "포트 호출 수");
    const serviceSource = readFileSync(path.join(here, "server", "auth.service.ts"), "utf8");
    assert(!serviceSource.includes("@supabase/supabase-js"), "서비스가 Supabase SDK에 직접 결합됨");
  });

  await test("R08", "live 어댑터가 flowId별 PKCE 상태를 요청 단위 저장소로 복원한다", async () => {
    const flowId = "0123456789abcdef0123456789abcdef";
    const verifier = "v".repeat(56);
    const storedVerifier = JSON.stringify(verifier);
    const verifierStorageKey = `sb-unit-auth-token-flow-${flowId}-code-verifier`;
    const authUserId = "11111111-1111-4111-8111-111111111111";
    const providerSessionId = "22222222-2222-4222-8222-222222222222";
    const accessToken = [
      Buffer.from(JSON.stringify({ alg: "none" }), "utf8").toString("base64url"),
      Buffer.from(JSON.stringify({
        sub: authUserId,
        session_id: providerSessionId,
        exp: Math.floor(Date.now() / 1_000) + 3_600,
      }), "utf8").toString("base64url"),
      "test-signature",
    ].join(".");
    const providerUser = {
      id: authUserId,
      email: "live-oauth@example.com",
      email_confirmed_at: "2026-08-26T00:00:00.000Z",
      confirmed_at: "2026-08-26T00:00:00.000Z",
    };
    let clientSequence = 0;

    const adapter = createSupabaseAuthAdapter({
      supabaseUrl: "https://unit.supabase.co",
      publishableKey: "unit-publishable-key",
      serviceRoleKey: "unit-service-role-key",
      emailConfirmationRedirectTo: "https://app.pactfive.test/auth/email-confirmation",
      clientFactory: (_url, _key, options) => {
        const authOptions = options.auth as any;
        const storage = authOptions.storage as {
          getItem(key: string): string | null | Promise<string | null>;
          setItem(key: string, value: string): void | Promise<void>;
        };
        assertEqual(authOptions.persistSession, true, "OAuth 요청 단위 PKCE 저장소가 SDK에서 비활성화됨");
        clientSequence += 1;

        if (clientSequence === 1) {
          return {
            auth: {
              signInWithOAuth: async (input: any) => {
                assertEqual(input.provider, "google", "Google 공급자 매핑");
                await storage.setItem(verifierStorageKey, storedVerifier);
                return {
                  data: {
                    provider: "google",
                    url: "https://accounts.google.test/oauth?state=provider-owned",
                    flowId,
                  },
                  error: null,
                };
              },
            },
          } as any;
        }

        if (clientSequence === 2) {
          return {
            auth: {
              exchangeCodeForSession: async (code: string, exchangeOptions: { flowId?: string }) => {
                assertEqual(code, "oauth-code", "OAuth code 전달");
                assertEqual(exchangeOptions.flowId, flowId, "callback flowId 복원");
                assertEqual(await storage.getItem(verifierStorageKey), storedVerifier, "callback PKCE verifier 복원");
                return {
                  data: {
                    session: {
                      access_token: accessToken,
                      refresh_token: "unit-refresh-token",
                      expires_in: 3_600,
                      expires_at: Math.floor(Date.now() / 1_000) + 3_600,
                      token_type: "bearer",
                      user: providerUser,
                    },
                    user: providerUser,
                  },
                  error: null,
                };
              },
            },
          } as any;
        }

        throw new Error("예상하지 않은 Supabase client 생성");
      },
    });

    let started: Awaited<ReturnType<typeof adapter.createOAuthAuthorization>>;
    try {
      started = await adapter.createOAuthAuthorization({
        provider: "GOOGLE",
        redirectTo: "https://app.pactfive.test/api/v1/auth/oauth/callback",
      });
    } catch (error) {
      throw new Error(`live OAuth 시작 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
    assert(started.authorizationUrl.includes("state=provider-owned"), "공급자 OAuth URL 손실");
    assert(!started.providerFlowState.includes(verifier), "PKCE verifier가 providerFlowState 평문에 노출됨");
    let exchanged: Awaited<ReturnType<typeof adapter.exchangeOAuthCode>>;
    try {
      exchanged = await adapter.exchangeOAuthCode("oauth-code", started.providerFlowState);
    } catch (error) {
      throw new Error(`live OAuth callback 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
    assertEqual(exchanged.providerSessionId, providerSessionId, "JWT session_id 매핑");
    assertEqual(exchanged.user.authUserId, authUserId, "JWT sub 사용자 매핑");
    assertEqual(exchanged.refreshToken, "unit-refresh-token", "OAuth Refresh Token 매핑");

    let tamperedRejected = false;
    try {
      await adapter.exchangeOAuthCode("oauth-code", `${started.providerFlowState}!`);
    } catch (error) {
      tamperedRejected = (error as { code?: string }).code === "INVALID_CREDENTIALS";
    }
    assert(tamperedRejected, "변조된 PKCE snapshot 허용");
  });

  await test("R09", "OAuth 사용자는 이메일 문자열이 아니라 authUserId로 매핑한다", async () => {
    const f = createFixture();
    const start = await f.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "FREELANCER", returnTo: "/" },
    );
    f.provider.queueOAuthCode("uuid-canonical", {
      authUserId: "auth_client",
      email: "provider-updated@example.com",
      emailVerified: true,
      password: null,
    }, f.provider.getLatestProviderFlowState());
    const result = await f.service.completeOAuthCallback("uuid-canonical", start.sealedIntent);
    assertEqual(result.body.user.userId, "usr_client", "authUserId 기반 기존 사용자 매핑 실패");
    assertEqual(result.body.user.email, "client@example.com", "앱 사용자 정본 대신 공급자 문자열을 노출함");
  });

  await test("R10", "탈퇴 사용자의 OAuth 공급자 세션을 폐기하고 로그인을 거부한다", async () => {
    const f = createFixture();
    const start = await f.service.createOAuthAuthorization({ oauthProvider: "KAKAO", returnTo: "/" });
    f.provider.queueOAuthCode("withdrawn-oauth", {
      authUserId: "auth_withdrawn",
      email: "withdrawn@example.com",
      emailVerified: true,
      password: null,
    }, f.provider.getLatestProviderFlowState());
    await expectProblem(
      () => f.service.completeOAuthCallback("withdrawn-oauth", start.sealedIntent),
      { status: 403, code: "OAUTH_ACCOUNT_NOT_AVAILABLE" },
    );
    assert(f.provider.getCallNames().includes("signOut"), "탈퇴 OAuth 공급자 세션 미폐기");

    const missingEmail = createFixture();
    const missingEmailStart = await missingEmail.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "CLIENT", returnTo: "/" },
    );
    missingEmail.provider.queueOAuthCode("missing-email", {
      authUserId: "auth_missing_email",
      email: "",
      emailVerified: true,
      password: null,
    }, missingEmail.provider.getLatestProviderFlowState());
    await expectProblem(
      () => missingEmail.service.completeOAuthCallback("missing-email", missingEmailStart.sealedIntent),
      { status: 403, code: "OAUTH_ACCOUNT_NOT_AVAILABLE" },
    );
  });

  await test("R11", "같은 UUID만 기존 계정으로 인정하고 충돌·로그인 중 OAuth·수동 연결을 차단한다", async () => {
    const f = createFixture();
    const start = await f.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "CLIENT", returnTo: "/" },
    );
    const activeLogin = await loginClient(f);
    f.provider.queueOAuthCode("email-conflict", {
      authUserId: "different-auth-id",
      email: "client@example.com",
      emailVerified: true,
      password: null,
    }, f.provider.getLatestProviderFlowState());
    await expectProblem(
      () => f.service.completeOAuthCallback("email-conflict", start.sealedIntent),
      { status: 403, code: "OAUTH_ACCOUNT_NOT_AVAILABLE" },
    );
    await expectProblem(
      () => f.service.createOAuthAuthorization(
        { oauthProvider: "KAKAO", returnTo: "/" },
        activeLogin.refreshToken,
      ),
      { status: 409, code: "AUTH_CONTEXT_CONFLICT" },
    );
    await f.service.logout(activeLogin.refreshToken);
    const allowedAfterLogout = await f.service.createOAuthAuthorization(
      { oauthProvider: "KAKAO", returnTo: "/" },
      activeLogin.refreshToken,
    );
    assert(allowedAfterLogout.authorizationUrl.includes("kakao"), "폐기된 쿠키를 유효 세션으로 오판");
    assert(!("linkIdentity" in f.provider), "수동 identity 연결 메서드가 포트에 노출됨");

    const emailSwitch = createFixture();
    const existingSession = await loginClient(emailSwitch);
    await expectProblem(
      () => emailSwitch.service.login(
        { email: "client@example.com", password: "password123", returnTo: "/" },
        undefined,
        existingSession.refreshToken,
      ),
      { status: 409, code: "AUTH_CONTEXT_CONFLICT" },
    );

    const deletedConflict = createFixture();
    const deletedStart = await deletedConflict.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "CLIENT", returnTo: "/" },
    );
    deletedConflict.provider.queueOAuthCode("deleted-email-conflict", {
      authUserId: "new-auth-for-deleted-email",
      email: "withdrawn@example.com",
      emailVerified: true,
      password: null,
    }, deletedConflict.provider.getLatestProviderFlowState());
    await expectProblem(
      () => deletedConflict.service.completeOAuthCallback("deleted-email-conflict", deletedStart.sealedIntent),
      { status: 403, code: "OAUTH_ACCOUNT_NOT_AVAILABLE" },
    );

    const callbackRace = createFixture();
    const raceStart = await callbackRace.service.createOAuthAuthorization(
      { oauthProvider: "KAKAO", role: "FREELANCER", returnTo: "/projects/new" },
    );
    callbackRace.provider.queueOAuthCode("race-code", {
      authUserId: "auth_race_oauth",
      email: "race-oauth@example.com",
      emailVerified: true,
      password: null,
    }, callbackRace.provider.getLatestProviderFlowState());
    const raceLogin = await callbackRace.service.login(
      {
        email: "client@example.com",
        password: "password123",
        returnTo: "/projects/new",
      },
      raceStart.sealedIntent,
    );
    await expectProblem(
      () => callbackRace.service.completeOAuthCallback("race-code", raceStart.sealedIntent),
      { status: 400, code: "OAUTH_INTENT_INVALID" },
    );
    assertEqual(raceLogin.body.user.userId, "usr_client", "이메일 로그인 승자 세션 누락");

    const callbackWins = createFixture();
    const callbackWinsStart = await callbackWins.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "FREELANCER", returnTo: "/" },
    );
    callbackWins.provider.queueOAuthCode("callback-wins-code", {
      authUserId: "auth_callback_winner",
      email: "callback-winner@example.com",
      emailVerified: true,
      password: null,
    }, callbackWins.provider.getLatestProviderFlowState());
    const callbackWinner = await callbackWins.service.completeOAuthCallback(
      "callback-wins-code",
      callbackWinsStart.sealedIntent,
    );
    await expectProblem(
      () => callbackWins.service.login(
        { email: "client@example.com", password: "password123", returnTo: "/" },
        callbackWinsStart.sealedIntent,
      ),
      { status: 409, code: "AUTH_CONTEXT_CONFLICT" },
    );
    assertEqual(callbackWinner.body.user.email, "callback-winner@example.com", "OAuth callback 승자 세션 누락");

    const postCancelFailure = createFixture();
    const pendingStart = await postCancelFailure.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "CLIENT", returnTo: "/" },
    );
    postCancelFailure.repository.createSession = async () => { throw new Error("simulated DB failure"); };
    const controller = createAuthController(postCancelFailure.service, "https://app.pactfive.test");
    const { response, state } = createResponseHarness();
    await controller.createSession(
      createRequestHarness({
        origin: "https://app.pactfive.test",
        cookie: `${OAUTH_INTENT_COOKIE_NAME}=${encodeURIComponent(pendingStart.sealedIntent)}`,
        body: { email: "client@example.com", password: "password123", returnTo: "/" },
      }),
      response,
    );
    assertEqual(state.status, 503, "intent 취소 뒤 세션 실패 상태");
    assert(state.clearedCookies.includes(OAUTH_INTENT_COOKIE_NAME), "실패 뒤 소비된 OAuth intent 쿠키가 남음");
  });

  await test("R12", "인증 컨텍스트는 앱 사용자·저장 역할·로그인·만료 상태를 제공한다", async () => {
    const f = createFixture();
    const login = await loginClient(f);
    const context = await f.service.getCurrentContext(login.body.accessToken);
    assertEqual(context.userId, "usr_client", "컨텍스트 userId");
    assertEqual(context.role, "CLIENT", "앱 저장 역할");
    assertEqual(context.authenticated, true, "로그인 상태");
    assert(Boolean(context.accessTokenExpiresAt), "Access Token 만료 상태 누락");
    f.provider.expireAccessToken(login.body.accessToken);
    await expectProblem(() => f.service.getCurrentContext(login.body.accessToken), {
      status: 401,
      code: "AUTH_REQUIRED",
    });
  });

  await test("R13", "보호 요청은 Access Token만 Bearer로 전달하고 Refresh Token은 공개 본문에 없다", async () => {
    const f = createFixture();
    const login = await loginClient(f);
    assertEqual(buildBearerAuthorization(login.body.accessToken), `Bearer ${login.body.accessToken}`, "서버 Bearer 형식");
    const headers = buildProtectedApiHeaders(login.body.accessToken) as Record<string, string>;
    assertEqual(headers.Authorization, `Bearer ${login.body.accessToken}`, "웹 Bearer 형식");
    assert(!JSON.stringify(login.body).includes(login.refreshToken), "Refresh Token이 공개 응답 본문에 포함됨");
    assert(!Object.prototype.hasOwnProperty.call(login.body, "refreshToken"), "공개 DTO에 refreshToken 필드 존재");
  });

  await test("R14", "앱 시작 Refresh는 single-flight로 한 번만 실행되고 완료 전 결과를 공개하지 않는다", async () => {
    let callCount = 0;
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    const restore = createSingleFlightRestorer(async () => {
      callCount += 1;
      return pending;
    });
    const first = restore();
    const second = restore();
    assertEqual(callCount, 1, "동시 restore가 중복 Refresh를 호출함");
    let settled = false;
    first.then(() => { settled = true; });
    await Promise.resolve();
    assertEqual(settled, false, "Refresh 완료 전에 인증 결과 공개");
    release("restored");
    assertEqual(await first, "restored", "첫 restore 결과");
    assertEqual(await second, "restored", "공유 restore 결과");

    let epochRestoreCount = 0;
    const epochResolvers = new Map<number, (value: string) => void>();
    const epochRestore = createEpochSingleFlightRestorer((epoch) => {
      epochRestoreCount += 1;
      return new Promise<string>((resolve) => { epochResolvers.set(epoch, resolve); });
    });
    const epochZeroA = epochRestore(0);
    const epochZeroB = epochRestore(0);
    const epochOne = epochRestore(1);
    assertEqual(epochRestoreCount, 2, "로그아웃 뒤 새 epoch restore가 이전 Promise에 합류함");
    epochResolvers.get(0)?.("epoch-zero");
    epochResolvers.get(1)?.("epoch-one");
    assertEqual(await epochZeroA, "epoch-zero", "이전 epoch restore 결과");
    assertEqual(await epochZeroB, "epoch-zero", "같은 epoch single-flight 결과");
    assertEqual(await epochOne, "epoch-one", "새 epoch 독립 restore 결과");

    let underlyingEpochCount = 0;
    const underlyingResolvers = new Map<unknown, (value: {
      accessToken: string;
      accessTokenExpiresAt: string;
    }) => void>();
    const epochCoordinatedRefresh = createRefreshCoordinator((coordinationKey) => {
      underlyingEpochCount += 1;
      return new Promise((resolve) => { underlyingResolvers.set(coordinationKey, resolve); });
    });
    const composedEpochRestore = createEpochSingleFlightRestorer((epoch) => epochCoordinatedRefresh(epoch));
    const composedZero = composedEpochRestore(0);
    const composedOne = composedEpochRestore(1);
    assertEqual(underlyingEpochCount, 2, "새 epoch restore가 이전 underlying Refresh Promise에 합류함");
    underlyingResolvers.get(0)?.({ accessToken: "epoch-zero-token", accessTokenExpiresAt: "2026-08-26T01:00:00.000Z" });
    underlyingResolvers.get(1)?.({ accessToken: "epoch-one-token", accessTokenExpiresAt: "2026-08-26T01:00:00.000Z" });
    assertEqual((await composedZero).accessToken, "epoch-zero-token", "이전 epoch underlying Refresh 결과");
    assertEqual((await composedOne).accessToken, "epoch-one-token", "새 epoch underlying Refresh 결과");

    let crossPathCount = 0;
    let releaseCrossPath!: (value: { accessToken: string; accessTokenExpiresAt: string }) => void;
    const crossPathPending = new Promise<{ accessToken: string; accessTokenExpiresAt: string }>((resolve) => {
      releaseCrossPath = resolve;
    });
    const sharedRefresh = createRefreshCoordinator(() => {
      crossPathCount += 1;
      return crossPathPending;
    });
    const crossPathRestore = createSingleFlightRestorer(sharedRefresh);
    const crossPathCaller = createProtectedApiCaller({
      refresh: sharedRefresh,
      onAccessToken: () => undefined,
      onSessionInvalid: () => undefined,
    });
    const restoreResult = crossPathRestore();
    const protectedResult = crossPathCaller({
      accessToken: "expired",
      returnTo: "/projects",
      request: async (token) => {
        if (token === "expired") throw new AuthApiError(401, "AUTH_REQUIRED", "만료");
        return token;
      },
    });
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(crossPathCount, 1, "restore와 보호 API가 교차 Refresh를 중복 호출함");
    releaseCrossPath({ accessToken: "cross-path-token", accessTokenExpiresAt: "2026-08-26T01:00:00.000Z" });
    assertEqual((await restoreResult).accessToken, "cross-path-token", "교차 restore 결과");
    assertEqual(await protectedResult, "cross-path-token", "교차 보호 API 결과");
    const hookSource = readFileSync(path.join(here, "web", "useAuth.ts"), "utf8");
    assert(hookSource.includes("void restore().catch"), "앱 시작 restore 호출 지점이 없음");
  });

  await test("R15", "공급자 성공·sessionId 일치 뒤에만 CAS rotation하고 parent 복구를 허용한다", async () => {
    const f = createFixture();
    const login = await loginClient(f);
    const before = f.repository.getSessions()[0];
    const refreshed = await f.service.refresh(login.refreshToken);
    const rotated = f.repository.getSessions()[0];
    assertEqual(rotated.previousTokenFingerprint, before.refreshTokenFingerprint, "이전 fingerprint 이동");
    assertEqual(
      rotated.refreshTokenFingerprint,
      fingerprintRefreshToken(refreshed.refreshToken, "non-secret-prototype-fingerprint-key"),
      "현재 fingerprint rotation",
    );
    const recovered = await f.service.refresh(login.refreshToken);
    assertEqual(recovered.refreshToken, refreshed.refreshToken, "정상 parent-token 복구 수렴");
    assertEqual(f.repository.getSessions()[0].revokedReason, null, "previous 일치만으로 재사용 폐기함");

    const logoutRace = createFixture();
    const logoutRaceLogin = await loginClient(logoutRace);
    await logoutRace.service.refresh(logoutRaceLogin.refreshToken);
    const originalTouch = logoutRace.repository.touchSession.bind(logoutRace.repository);
    logoutRace.repository.touchSession = async (input) => {
      await logoutRace.repository.revokeSession(input.sessionId, "LOGOUT", new Date("2026-08-26T00:00:01.000Z"));
      return originalTouch(input);
    };
    const logoutRaceProblem = await expectProblem(
      () => logoutRace.service.refresh(logoutRaceLogin.refreshToken),
      { status: 401, code: "AUTH_SESSION_INVALID" },
    );
    assertEqual(logoutRaceProblem.clearRefreshCookie, true, "Refresh/로그아웃 경합에서 쿠키 삭제 미지시");
    assert(logoutRace.provider.getCallNames().includes("signOut"), "Refresh/로그아웃 경합에서 공급자 세션 미폐기");

    const advancedRace = createFixture();
    const advancedLogin = await loginClient(advancedRace);
    await advancedRace.service.refresh(advancedLogin.refreshToken);
    const advancedOriginalTouch = advancedRace.repository.touchSession.bind(advancedRace.repository);
    advancedRace.repository.touchSession = async (input) => {
      await advancedRace.repository.rotateSession({
        sessionId: input.sessionId,
        expectedCurrentFingerprint: input.expectedCurrentFingerprint,
        nextFingerprint: fingerprintRefreshToken("simulated-third-token", "non-secret-prototype-fingerprint-key"),
        usedAt: input.usedAt,
      });
      return advancedOriginalTouch(input);
    };
    const advancedProblem = await expectProblem(
      () => advancedRace.service.refresh(advancedLogin.refreshToken),
      { status: 503, code: "AUTH_SESSION_SYNC_FAILED" },
    );
    assertEqual(advancedProblem.clearRefreshCookie, false, "정상 선행 rotation을 세션 만료로 오분류");
    assert(!advancedRace.provider.getCallNames().includes("signOut"), "정상 선행 rotation의 공급자 세션을 폐기함");

    const convergence = createFixture();
    const convergenceLogin = await loginClient(convergence);
    const originalRotate = convergence.repository.rotateSession.bind(convergence.repository);
    let rejectFirstCas = true;
    convergence.repository.rotateSession = async (input) => {
      if (rejectFirstCas) {
        rejectFirstCas = false;
        return false;
      }
      return originalRotate(input);
    };
    await expectProblem(() => convergence.service.refresh(convergenceLogin.refreshToken), {
      status: 503,
      code: "AUTH_SESSION_SYNC_FAILED",
    });
    const converged = await convergence.service.refresh(convergenceLogin.refreshToken);
    assertEqual(
      convergence.repository.getSessions()[0].refreshTokenFingerprint,
      fingerprintRefreshToken(converged.refreshToken, "non-secret-prototype-fingerprint-key"),
      "provider rotation 성공 후 DB CAS 실패를 parent 결과로 수렴하지 못함",
    );

    const mismatch = createFixture();
    const mismatchLogin = await loginClient(mismatch);
    const mismatchFingerprint = mismatch.repository.getSessions()[0].refreshTokenFingerprint;
    mismatch.provider.overrideNextRefreshProviderSessionId("other-provider-session");
    await expectProblem(
      () => mismatch.service.refresh(mismatchLogin.refreshToken),
      { status: 503, code: "AUTH_SESSION_SYNC_FAILED" },
    );
    assertEqual(mismatch.repository.getSessions()[0].refreshTokenFingerprint, mismatchFingerprint, "sessionId 불일치인데 DB 변경");

    const reused = createFixture();
    const reusedLogin = await loginClient(reused);
    reused.provider.failNextRefresh("REFRESH_TOKEN_ALREADY_USED");
    await expectProblem(() => reused.service.refresh(reusedLogin.refreshToken), {
      status: 401,
      code: "AUTH_SESSION_INVALID",
    });
    assertEqual(reused.repository.getSessions()[0].revokedReason, "REUSE_DETECTED", "상관 가능한 reuse 미폐기");

    const uncorrelated = createFixture();
    const uncorrelatedLogin = await loginClient(uncorrelated);
    uncorrelated.provider.failNextRefresh("REFRESH_TOKEN_ALREADY_USED", null);
    const uncorrelatedProblem = await expectProblem(() => uncorrelated.service.refresh(uncorrelatedLogin.refreshToken), {
      status: 503,
      code: "AUTH_SESSION_SYNC_FAILED",
    });
    assertEqual(uncorrelated.repository.getSessions()[0].revokedReason, null, "상관 불가능한 reuse로 세션 폐기");
    assertEqual(uncorrelatedProblem.clearRefreshCookie, false, "상관 불가능한 오류에서 쿠키를 영구 삭제함");

    const notFound = createFixture();
    const notFoundLogin = await loginClient(notFound);
    notFound.provider.failNextRefresh("REFRESH_TOKEN_NOT_FOUND");
    await expectProblem(() => notFound.service.refresh(notFoundLogin.refreshToken), {
      status: 401,
      code: "AUTH_SESSION_INVALID",
    });
    assertEqual(notFound.repository.getSessions()[0].revokedReason, null, "not_found를 reuse로 오분류");
    assert(notFound.repository.getSessions()[0].revokedAt instanceof Date, "provider 최종 거부 후 로컬 세션이 활성으로 남음");

    const mappingLoss = createFixture();
    const mappingLossLogin = await loginClient(mappingLoss);
    mappingLoss.repository.findByAuthUserId = async () => null;
    await expectProblem(() => mappingLoss.service.refresh(mappingLossLogin.refreshToken), {
      status: 401,
      code: "AUTH_SESSION_INVALID",
    });
    assert(mappingLoss.repository.getSessions()[0].revokedAt instanceof Date, "사용자 매핑 소실 후 로컬 세션 미폐기");
    assert(mappingLoss.provider.getCallNames().includes("signOut"), "사용자 매핑 소실 후 갱신된 공급자 세션 미폐기");
  });

  await test("R16", "확정 401은 로그아웃 상태, 503은 기존 세션을 유지하는 재시도 상태다", async () => {
    const invalid = reduceAuthFailure(new AuthApiError(401, "AUTH_SESSION_INVALID", "세션 만료"));
    const temporary = reduceAuthFailure(new AuthApiError(503, "AUTH_PROVIDER_UNAVAILABLE", "일시 장애"));
    assertEqual(invalid.status, "anonymous", "확정 401 상태");
    assertEqual(temporary.status, "retryable", "503 재시도 상태");
    assertEqual(temporary.action, "RETRY", "503 재시도 동작");

    const f = createFixture();
    const login = await loginClient(f);
    f.provider.failNextRefresh("PROVIDER_UNAVAILABLE");
    const problem = await expectProblem(() => f.service.refresh(login.refreshToken), {
      status: 503,
      code: "AUTH_PROVIDER_UNAVAILABLE",
    });
    assertEqual(problem.clearRefreshCookie, false, "일시 장애에서 쿠키 삭제 지시");
    assertEqual(f.repository.getSessions()[0].revokedAt, null, "일시 장애에서 로컬 세션 폐기");

    const contextFailure = createFixture();
    const contextLogin = await loginClient(contextFailure);
    contextFailure.provider.failNextAccessVerification("PROVIDER_UNAVAILABLE");
    const contextProblem = await expectProblem(
      () => contextFailure.service.getCurrentContext(contextLogin.body.accessToken),
      { status: 503, code: "AUTH_PROVIDER_UNAVAILABLE" },
    );
    assertEqual(contextProblem.clearRefreshCookie, false, "컨텍스트 일시 장애를 세션 만료로 오분류");
    assertEqual(contextFailure.repository.getSessions()[0].revokedAt, null, "컨텍스트 일시 장애에서 세션 폐기");

    let requestCount = 0;
    let refreshCount = 0;
    let storedAccessToken = "old-access";
    const protectedCaller = createProtectedApiCaller({
      refresh: async () => {
        refreshCount += 1;
        return { accessToken: "new-access", accessTokenExpiresAt: "2026-08-26T01:00:00.000Z" };
      },
      onAccessToken: (token) => { storedAccessToken = token; },
      onSessionInvalid: () => { throw new Error("유효한 refresh 뒤 로그인 이동"); },
    });
    const protectedResult = await protectedCaller({
      accessToken: storedAccessToken,
      returnTo: "/projects/new",
      request: async (token) => {
        requestCount += 1;
        if (token === "old-access") throw new AuthApiError(401, "AUTH_REQUIRED", "만료");
        return "protected-ok";
      },
    });
    assertEqual(protectedResult, "protected-ok", "보호 API 재시도 결과");
    assertEqual(requestCount, 2, "보호 API는 최초+1회만 호출해야 함");
    assertEqual(refreshCount, 1, "401 후 Refresh는 1회만 호출해야 함");
    assertEqual(storedAccessToken, "new-access", "새 Access Token 메모리 반영");

    let temporaryNavigated = false;
    const temporaryCaller = createProtectedApiCaller({
      refresh: async () => { throw new AuthApiError(503, "AUTH_PROVIDER_UNAVAILABLE", "일시 장애"); },
      onAccessToken: () => undefined,
      onSessionInvalid: () => { temporaryNavigated = true; },
    });
    await (async () => {
      try {
        await temporaryCaller({
          accessToken: "expired",
          returnTo: "/projects/new",
          request: async () => { throw new AuthApiError(401, "AUTH_REQUIRED", "만료"); },
        });
      } catch {
        // 기대한 일시 장애
      }
    })();
    assertEqual(temporaryNavigated, false, "503을 로그아웃 이동으로 가장함");

    const invalidPaths: string[] = [];
    const invalidCaller = createProtectedApiCaller({
      refresh: async () => { throw new AuthApiError(401, "AUTH_SESSION_INVALID", "세션 만료"); },
      onAccessToken: () => undefined,
      onSessionInvalid: (returnTo) => invalidPaths.push(returnTo),
    });
    await (async () => {
      try {
        await invalidCaller({
          accessToken: "expired",
          returnTo: "/projects/new",
          request: async () => { throw new AuthApiError(401, "AUTH_REQUIRED", "만료"); },
        });
      } catch {
        // 기대한 영구 만료
      }
    })();
    assertEqual(invalidPaths[0], "/projects/new", "세션 만료 이동에서 returnTo 미보존");

    let releaseConcurrentRefresh!: (value: { accessToken: string; accessTokenExpiresAt: string }) => void;
    const concurrentRefresh = new Promise<{ accessToken: string; accessTokenExpiresAt: string }>((resolve) => {
      releaseConcurrentRefresh = resolve;
    });
    let concurrentRefreshCount = 0;
    const concurrentCaller = createProtectedApiCaller({
      refresh: () => {
        concurrentRefreshCount += 1;
        return concurrentRefresh;
      },
      onAccessToken: () => undefined,
      onSessionInvalid: () => undefined,
    });
    const concurrentRequest = (token: string) => token === "old"
      ? Promise.reject(new AuthApiError(401, "AUTH_REQUIRED", "만료"))
      : Promise.resolve("ok");
    const concurrentA = concurrentCaller({ accessToken: "old", returnTo: "/projects", request: concurrentRequest });
    const concurrentB = concurrentCaller({ accessToken: "old", returnTo: "/projects/new", request: concurrentRequest });
    await Promise.resolve();
    await Promise.resolve();
    assertEqual(concurrentRefreshCount, 1, "동시 보호 요청이 Refresh rotation을 중복 실행함");
    releaseConcurrentRefresh({ accessToken: "shared-new", accessTokenExpiresAt: "2026-08-26T01:00:00.000Z" });
    assertEqual((await Promise.all([concurrentA, concurrentB])).join(","), "ok,ok", "동시 요청 재시도 결과");
  });

  await test("R17", "로그아웃은 Origin 확인 후 로컬 세션을 멱등 폐기하고 잔여 JWT를 즉시 차단한다", async () => {
    const f = createFixture();
    const login = await loginClient(f);
    const allowedOrigins = ["https://app.pactfive.test", "https://staging.pactfive.test"] as const;
    requireAllowedOrigin("https://staging.pactfive.test", allowedOrigins);
    await expectProblem(() => requireAllowedOrigin("https://evil.test", allowedOrigins), {
      status: 403,
      code: "ORIGIN_NOT_ALLOWED",
    });
    assertEqual(f.repository.getSessions()[0].revokedAt, null, "잘못된 Origin 전에 상태 변경됨");

    f.provider.failSignOut(true);
    await f.service.logout(login.refreshToken, login.body.accessToken);
    await f.service.logout(login.refreshToken, login.body.accessToken);
    assertEqual(f.repository.getSessions()[0].revokedReason, "LOGOUT", "로컬 로그아웃 폐기 이유");
    await expectProblem(() => f.service.getCurrentContext(login.body.accessToken), {
      status: 401,
      code: "AUTH_REQUIRED",
    });

    const expiredBearer = createFixture();
    const expiredLogin = await loginClient(expiredBearer);
    await expiredBearer.service.logout(expiredLogin.refreshToken, undefined);
    assertEqual(expiredBearer.repository.getSessions()[0].revokedReason, "LOGOUT", "Bearer 없이 쿠키 세션 미폐기");
    assert(expiredBearer.provider.getCallNames().includes("signOut"), "Bearer 없이 Refresh credential 공급자 폐기 미요청");

    const queue = createAuthMutationQueue();
    const order: string[] = [];
    let releaseMutation!: () => void;
    const mutationGate = new Promise<void>((resolve) => { releaseMutation = resolve; });
    const refreshMutation = queue(async () => {
      order.push("refresh-start");
      await mutationGate;
      order.push("refresh-end");
    });
    const logoutMutation = queue(async () => { order.push("logout"); });
    await Promise.resolve();
    assertEqual(order.join(","), "refresh-start", "logout가 진행 중 Refresh와 병렬 실행됨");
    releaseMutation();
    await Promise.all([refreshMutation, logoutMutation]);
    assertEqual(order.join(","), "refresh-start,refresh-end,logout", "logout가 인증 mutation 뒤에 수렴하지 않음");

    const epoch = createAuthEpochGuard();
    const restoreEpoch = epoch.capture();
    epoch.advance();
    assertEqual(epoch.isCurrent(restoreEpoch), false, "로그아웃 뒤 지연 restore가 여전히 현재 흐름으로 인정됨");
    const expectCancelled = async (pending: Promise<unknown>, label: string) => {
      let error: unknown;
      try {
        await pending;
      } catch (caught) {
        error = caught;
      }
      assert(error instanceof AuthApiError, `${label} 취소 오류 타입`);
      assertEqual(error.status, 409, `${label} 취소 상태`);
      assertEqual(error.code, "AUTH_FLOW_CANCELLED", `${label} 취소 코드`);
    };

    let staleRefreshCurrent = true;
    let staleTokenPublished = false;
    let releaseStaleRefresh!: (value: { accessToken: string; accessTokenExpiresAt: string }) => void;
    let markRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>((resolve) => { markRefreshStarted = resolve; });
    const staleProtectedCaller = createProtectedApiCaller({
      refresh: () => {
        markRefreshStarted();
        return new Promise((resolve) => { releaseStaleRefresh = resolve; });
      },
      onAccessToken: () => { staleTokenPublished = true; },
      onSessionInvalid: () => undefined,
    });
    const staleRefreshResult = staleProtectedCaller({
      accessToken: "expired-before-logout",
      returnTo: "/projects",
      request: async (token) => {
        if (token === "expired-before-logout") throw new AuthApiError(401, "AUTH_REQUIRED", "만료");
        return "should-not-publish";
      },
      isAuthFlowCurrent: () => staleRefreshCurrent,
    });
    await refreshStarted;
    staleRefreshCurrent = false;
    releaseStaleRefresh({ accessToken: "stale-after-logout", accessTokenExpiresAt: "2026-08-26T01:00:00.000Z" });
    await expectCancelled(staleRefreshResult, "지연 Refresh");
    assertEqual(staleTokenPublished, false, "로그아웃 뒤 지연 Refresh 토큰을 메모리에 게시함");

    let staleInvalidRedirected = false;
    let staleInvalidRefreshed = false;
    const staleInvalidCaller = createProtectedApiCaller({
      refresh: async () => {
        staleInvalidRefreshed = true;
        return { accessToken: "unused", accessTokenExpiresAt: "2026-08-26T01:00:00.000Z" };
      },
      onAccessToken: () => undefined,
      onSessionInvalid: () => { staleInvalidRedirected = true; },
    });
    await expectCancelled(staleInvalidCaller({
      accessToken: "stale-401",
      returnTo: "/projects",
      request: async () => { throw new AuthApiError(401, "AUTH_REQUIRED", "만료"); },
      isAuthFlowCurrent: () => false,
    }), "지연 401");
    assertEqual(staleInvalidRefreshed, false, "지연 401이 새 Refresh를 시작함");
    assertEqual(staleInvalidRedirected, false, "지연 401이 새 인증 흐름을 로그인으로 이동함");

    let initialCurrent = true;
    let releaseInitial!: (value: string) => void;
    const initialCaller = createProtectedApiCaller({
      refresh: async () => ({ accessToken: "unused", accessTokenExpiresAt: "2026-08-26T01:00:00.000Z" }),
      onAccessToken: () => undefined,
      onSessionInvalid: () => undefined,
    });
    const initialResult = initialCaller({
      accessToken: "valid-before-logout",
      returnTo: "/projects",
      request: () => new Promise<string>((resolve) => { releaseInitial = resolve; }),
      isAuthFlowCurrent: () => initialCurrent,
    });
    initialCurrent = false;
    releaseInitial("sensitive-old-result");
    await expectCancelled(initialResult, "지연 최초 보호 응답");

    let retryCurrent = true;
    let retryRequestCount = 0;
    let releaseRetry!: (value: string) => void;
    let markRetryStarted!: () => void;
    const retryStarted = new Promise<void>((resolve) => { markRetryStarted = resolve; });
    const retryCaller = createProtectedApiCaller({
      refresh: async () => ({ accessToken: "refreshed-before-logout", accessTokenExpiresAt: "2026-08-26T01:00:00.000Z" }),
      onAccessToken: () => undefined,
      onSessionInvalid: () => undefined,
    });
    const retryResult = retryCaller({
      accessToken: "expired",
      returnTo: "/projects",
      request: async () => {
        retryRequestCount += 1;
        if (retryRequestCount === 1) throw new AuthApiError(401, "AUTH_REQUIRED", "만료");
        markRetryStarted();
        return new Promise<string>((resolve) => { releaseRetry = resolve; });
      },
      isAuthFlowCurrent: () => retryCurrent,
    });
    await retryStarted;
    retryCurrent = false;
    releaseRetry("stale-retry-result");
    await expectCancelled(retryResult, "지연 재시도 보호 응답");
    const authHookSource = readFileSync(path.join(here, "web", "useAuth.ts"), "utf8");
    assert(
      /onSessionInvalid:[\s\S]*?authEpoch\.advance\(\)/.test(authHookSource),
      "확정 세션 만료가 인증 epoch를 무효화하지 않음",
    );

    const controllerFailure = createFixture();
    const controllerLogin = await loginClient(controllerFailure);
    controllerFailure.repository.findByRefreshFingerprint = async () => { throw new Error("simulated DB outage"); };
    const logoutController = createAuthController(controllerFailure.service, allowedOrigins);
    const failedResponse = createResponseHarness();
    await logoutController.deleteCurrentSession(
      createRequestHarness({
        origin: "https://staging.pactfive.test",
        cookie: `${REFRESH_COOKIE_NAME}=${encodeURIComponent(controllerLogin.refreshToken)}`,
      }),
      failedResponse.response,
    );
    assertEqual(failedResponse.state.status, 503, "로그아웃 저장소 실패 상태");
    assertEqual(
      (failedResponse.state.body as { error?: { code?: string } })?.error?.code,
      "AUTH_LOGOUT_SYNC_FAILED",
      "로그아웃 저장소 실패 코드",
    );
    assert(failedResponse.state.clearedCookies.includes(REFRESH_COOKIE_NAME), "로그아웃 실패 뒤 Refresh 쿠키 미삭제");
    assert(failedResponse.state.clearedCookies.includes(OAUTH_INTENT_COOKIE_NAME), "로그아웃 뒤 OAuth intent 쿠키 미삭제");
    assert(
      failedResponse.state.clearedCookies.includes(REGISTRATION_RECOVERY_COOKIE_NAME),
      "로그아웃 뒤 가입 복구 쿠키 미삭제",
    );

    const deniedResponse = createResponseHarness();
    await logoutController.deleteCurrentSession(
      createRequestHarness({
        origin: "https://evil.test",
        cookie: `${REFRESH_COOKIE_NAME}=${encodeURIComponent(controllerLogin.refreshToken)}`,
      }),
      deniedResponse.response,
    );
    assertEqual(deniedResponse.state.status, 403, "Origin 거부 상태");
    assert(!deniedResponse.state.clearedCookies.includes(REFRESH_COOKIE_NAME), "Origin 거부 전에 쿠키 상태 변경");
  });

  await test("R18", "Refresh는 HttpOnly Strict 쿠키만 사용하고 Access Token은 메모리에만 둔다", async () => {
    assertEqual(REFRESH_COOKIE_NAME, "__Host-pactfiveRefreshToken", "Refresh 쿠키 이름");
    assertEqual(REFRESH_COOKIE_OPTIONS.secure, true, "Secure");
    assertEqual(REFRESH_COOKIE_OPTIONS.httpOnly, true, "HttpOnly");
    assertEqual(REFRESH_COOKIE_OPTIONS.sameSite, "strict", "SameSite");
    assertEqual(REFRESH_COOKIE_OPTIONS.path, "/", "Path");
    assert(!Object.prototype.hasOwnProperty.call(REFRESH_COOKIE_OPTIONS, "domain"), "Domain 속성 금지");

    const webSources = [
      path.join(here, "web", "api", "auth.ts"),
      path.join(here, "web", "useAuth.ts"),
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    assert(!/localStorage|sessionStorage|indexedDB/i.test(webSources), "브라우저 영속 저장소 사용");
    assert(!webSources.includes("@supabase/supabase-js"), "브라우저 Supabase 세션 사용");

    const f = createFixture();
    const login = await loginClient(f);
    const absoluteExpiry = login.sessionExpiresAt.toISOString();
    f.advance(24 * 60 * 60 * 1000);
    const refreshed = await f.service.refresh(login.refreshToken);
    assertEqual(refreshed.sessionExpiresAt.toISOString(), absoluteExpiry, "Refresh로 절대 수명 연장됨");
    f.advance(6 * 24 * 60 * 60 * 1000);
    await expectProblem(() => f.service.refresh(refreshed.refreshToken), {
      status: 401,
      code: "AUTH_SESSION_INVALID",
    });
    assert(f.repository.getSessions()[0].revokedAt instanceof Date, "절대 TTL 만료 후 로컬 세션 미폐기");
    assert(f.provider.getCallNames().includes("signOut"), "절대 TTL 만료 후 공급자 세션 폐기 미요청");

    const protectedExpiry = createFixture();
    const protectedLogin = await loginClient(protectedExpiry);
    protectedExpiry.advance(7 * 24 * 60 * 60 * 1000);
    await expectProblem(() => protectedExpiry.service.getCurrentContext(protectedLogin.body.accessToken), {
      status: 401,
      code: "AUTH_REQUIRED",
    });
    assert(protectedExpiry.repository.getSessions()[0].revokedAt instanceof Date, "보호 API 절대 TTL 만료 세션 미폐기");
    assert(protectedExpiry.provider.getCallNames().includes("signOut"), "보호 API 절대 TTL 만료 공급자 세션 미폐기");
  });

  await test("R19", "인증 성공 뒤 보존한 returnTo로 정확히 한 번만 복귀한다", async () => {
    const f = createFixture();
    const result = await loginClient(f, "/projects/new");
    assertEqual(result.body.returnTo, "/projects/new", "서버 확정 복귀 경로");
    const paths: string[] = [];
    const navigate = createReturnNavigator((value) => paths.push(value));
    navigate(result.body.returnTo);
    navigate(result.body.returnTo);
    assertEqual(paths.length, 1, "중복 복귀");
    assertEqual(paths[0], "/projects/new", "복귀 대상");
    const loginFormSource = readFileSync(path.join(here, "web", "LoginForm.tsx"), "utf8");
    assert(
      loginFormSource.includes('state.status === "authenticated"') &&
      loginFormSource.includes("safeReturnToOrRoot(returnTo)") &&
      loginFormSource.includes("navigateOnce(safeReturnTo)"),
      "앱 restore 성공 뒤 검증된 returnTo 복귀 지점 누락",
    );
  });

  await test("R20", "외부·이중슬래시·역슬래시·fragment·제어문자·비허용 경로를 차단한다", async () => {
    const allowed = ["/", "/projects", "/projects/new", "/bookmarks", "/profile", "/projects/prj_ABC-123"];
    for (const value of allowed) assertEqual(validateReturnTo(value), value, `허용 경로 거부: ${value}`);
    const rejected = [
      "https://evil.test",
      "//evil.test/path",
      "/\\evil",
      "/projects#fragment",
      "/projects\u0000",
      "%2F%2Fevil.test",
      "/admin",
      "/projects/prj_bad/value",
    ];
    for (const value of rejected) assertEqual(validateReturnTo(value), null, `위험 경로 허용: ${JSON.stringify(value)}`);
    assertEqual(safeReturnToOrRoot("https://evil.test"), "/", "웹 복귀 fallback이 외부 URL을 유지함");
    assertEqual(safeReturnToOrRoot("/projects/new"), "/projects/new", "웹 복귀 허용 경로 손실");
  });

  await test("R21", "OAuth state와 앱 intent를 분리하고 10분·암호화·일회성 계약을 지킨다", async () => {
    const f = createFixture();
    const start = await f.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "FREELANCER", returnTo: "/projects/new" },
    );
    assert(start.authorizationUrl.includes("state=provider-owned-"), "공급자 state 누락");
    assert(!start.authorizationUrl.includes("FREELANCER") && !start.authorizationUrl.includes("projects"), "state/URL에 앱 intent 노출");
    assert(!start.sealedIntent.includes("FREELANCER") && !start.sealedIntent.includes("/projects/new"), "intent 평문 노출");
    assertEqual(Date.parse(start.expiresAt) - Date.parse("2026-08-26T00:00:00.000Z"), 10 * 60 * 1000, "intent TTL");

    const envelope = start.sealedIntent.split(".");
    const firstCipherCharacter = envelope[3][0];
    envelope[3] = `${firstCipherCharacter === "A" ? "B" : "A"}${envelope[3].slice(1)}`;
    const tampered = envelope.join(".");
    await expectProblem(() => f.service.completeOAuthCallback("unused", tampered), {
      status: 400,
      code: "OAUTH_INTENT_INVALID",
    });

    f.provider.queueOAuthCode("oauth-once", {
      authUserId: "auth_new_oauth_once",
      email: "once@example.com",
      emailVerified: true,
      password: null,
    }, f.provider.getLatestProviderFlowState());
    const first = await f.service.completeOAuthCallback("oauth-once", start.sealedIntent);
    assertEqual(first.body.returnTo, "/projects/new", "보호 intent returnTo 복원");
    assertEqual(first.body.user.role, "FREELANCER", "보호 intent role 복원");
    await expectProblem(() => f.service.completeOAuthCallback("oauth-once", start.sealedIntent), {
      status: 400,
      code: "OAUTH_INTENT_INVALID",
    });

    const codeSwap = createFixture();
    await codeSwap.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "CLIENT", returnTo: "/" },
    );
    const flowAState = codeSwap.provider.getLatestProviderFlowState();
    const flowB = await codeSwap.service.createOAuthAuthorization(
      { oauthProvider: "KAKAO", role: "FREELANCER", returnTo: "/projects/new" },
    );
    codeSwap.provider.queueOAuthCode("flow-a-code", {
      authUserId: "auth_code_swap",
      email: "code-swap@example.com",
      emailVerified: true,
      password: null,
    }, flowAState);
    await expectProblem(
      () => codeSwap.service.completeOAuthCallback("flow-a-code", flowB.sealedIntent),
      { status: 400, code: "OAUTH_INTENT_INVALID" },
    );

    const expired = createFixture();
    const expiredStart = await expired.service.createOAuthAuthorization(
      { oauthProvider: "KAKAO", role: "CLIENT", returnTo: "/" },
    );
    expired.advance(10 * 60 * 1000 + 1);
    await expectProblem(() => expired.service.completeOAuthCallback("unused", expiredStart.sealedIntent), {
      status: 400,
      code: "OAUTH_INTENT_INVALID",
    });
    assertEqual(OAUTH_INTENT_COOKIE_NAME, "__Host-pactfiveOAuthIntent", "OAuth intent 쿠키 이름");
    assertEqual(OAUTH_INTENT_COOKIE_OPTIONS.sameSite, "lax", "OAuth callback용 SameSite");
    const callbackControllerFixture = createFixture();
    const callbackStart = await callbackControllerFixture.service.createOAuthAuthorization(
      { oauthProvider: "GOOGLE", role: "CLIENT", returnTo: "/projects" },
    );
    callbackControllerFixture.provider.queueOAuthCode("controller-callback", {
      authUserId: "auth_controller_callback",
      email: "controller-callback@example.com",
      emailVerified: true,
      password: null,
    }, callbackControllerFixture.provider.getLatestProviderFlowState());
    const callbackController = createAuthController(callbackControllerFixture.service, "https://app.pactfive.test");
    const callbackResponse = createResponseHarness();
    await callbackController.completeOAuthCallback(
      createRequestHarness({
        cookie: `${OAUTH_INTENT_COOKIE_NAME}=${encodeURIComponent(callbackStart.sealedIntent)}`,
        query: { code: "controller-callback" },
      }),
      callbackResponse.response,
    );
    assertEqual(callbackResponse.state.status, 302, "OAuth callback redirect 상태");
    assertEqual(callbackResponse.state.redirect, "/projects", "OAuth callback 복귀 경로");
    assert(callbackResponse.state.clearedCookies.includes(OAUTH_INTENT_COOKIE_NAME), "callback 성공 뒤 intent 쿠키 미삭제");

    const failedCallbackResponse = createResponseHarness();
    await callbackController.completeOAuthCallback(
      createRequestHarness({ query: { code: "missing-intent" } }),
      failedCallbackResponse.response,
    );
    assertEqual(failedCallbackResponse.state.redirect, "/login?oauthError=oauth_failed", "callback 실패 안전 redirect");
    assert(failedCallbackResponse.state.clearedCookies.includes(OAUTH_INTENT_COOKIE_NAME), "callback 실패 뒤 intent 쿠키 미삭제");
    const authServiceSource = readFileSync(path.join(here, "server", "auth.service.ts"), "utf8");
    assert(authServiceSource.includes("cancelPendingOAuthIntent"), "동시 callback을 막는 서버 nonce 취소 경계 누락");
  });

  await test("R22", "두 고정 Mock Bearer를 정확히 일치 비교해 역할별 컨텍스트를 만든다", () => {
    const client = authenticateMockAuthorization(MOCK_CLIENT_AUTHORIZATION, "test");
    const freelancer = authenticateMockAuthorization(MOCK_FREELANCER_AUTHORIZATION, "mock");
    assertEqual(client.userId, "usr_00000000000000000000000001", "CLIENT userId");
    assertEqual(client.role, "CLIENT", "CLIENT role");
    assertEqual(freelancer.userId, "usr_00000000000000000000000002", "FREELANCER userId");
    assertEqual(freelancer.role, "FREELANCER", "FREELANCER role");
    let rejected = false;
    try {
      authenticateMockAuthorization(`${MOCK_CLIENT_AUTHORIZATION}x`, "test");
    } catch {
      rejected = true;
    }
    assert(rejected, "부분 일치 토큰 허용");

    const middleware = createMockAuthMiddlewareFromEnvironment({
      NODE_ENV: "development",
      AUTH_PROVIDER_MODE: "mock",
    });
    let nextCalled = false;
    const response = {
      locals: {},
      status: () => response,
      json: () => response,
    } as any;
    middleware(
      { header: (name: string) => name.toLowerCase() === "authorization" ? MOCK_CLIENT_AUTHORIZATION : undefined } as any,
      response,
      () => { nextCalled = true; },
    );
    assert(nextCalled, "고정 Bearer가 실제 Mock middleware를 통과하지 못함");
    assertEqual(response.locals.authContext.role, "CLIENT", "middleware 인증 컨텍스트 역할");
  });

  await test("R23", "Mock 토큰은 test/mock에서만 허용하고 Authorization 원문을 기록하지 않는다", () => {
    const auditEvents: Array<{ code: string }> = [];
    let productionRejected = false;
    try {
      authenticateMockAuthorization(MOCK_CLIENT_AUTHORIZATION, "production", (event) => auditEvents.push(event));
    } catch {
      productionRejected = true;
    }
    assert(productionRejected, "production에서 Mock 토큰 허용");
    assert(!JSON.stringify(auditEvents).includes("pactfive-mock-client-01"), "감사 로그에 Authorization 원문 노출");
    let previewRejected = false;
    try {
      authenticateMockAuthorization(MOCK_FREELANCER_AUTHORIZATION, "preview");
    } catch {
      previewRejected = true;
    }
    assert(previewRejected, "preview에서 Mock 토큰 허용");
    let startupRejected = false;
    try {
      createMockAuthMiddlewareFromEnvironment({
        NODE_ENV: "production",
        AUTH_PROVIDER_MODE: "mock",
      });
    } catch (error) {
      startupRejected = String(error).includes("MOCK_AUTH_STARTUP_REJECTED");
    }
    assert(startupRejected, "production composition이 Mock middleware로 시작됨");
    let liveAdapterClosed = false;
    try {
      createSupabaseAuthAdapter();
    } catch (error) {
      liveAdapterClosed = String(error).includes("AUTH_PROVIDER_NOT_READY");
    }
    assert(liveAdapterClosed, "설정 전 라이브 어댑터가 fail-closed하지 않음");

    let weakKeyRejected = false;
    try {
      createFixture({ refreshFingerprintKey: "too-short" });
    } catch (error) {
      weakKeyRejected = String(error).includes("at least 32 bytes");
    }
    assert(weakKeyRejected, "짧은 Refresh fingerprint 키를 허용함");
    let reusedKeyRejected = false;
    try {
      createFixture({
        refreshFingerprintKey: "same-non-secret-prototype-key-material",
        oauthIntentEncryptionKey: "same-non-secret-prototype-key-material",
      });
    } catch (error) {
      reusedKeyRejected = String(error).includes("must be distinct");
    }
    assert(reusedKeyRejected, "인증 목적별 동일 키 재사용을 허용함");

    const mockSource = readFileSync(path.join(here, "mock", "auth.mock.ts"), "utf8");
    const adapterSource = readFileSync(path.join(here, "mock", "mock-auth.adapter.ts"), "utf8");
    assert(!/console\.(log|info|warn|error)\s*\(.*authorization/i.test(`${mockSource}\n${adapterSource}`), "Authorization 로그 코드 존재");
  });

  const html = renderToStaticMarkup(React.createElement(LoginForm, { returnTo: "/projects/new" }));
  assertEqual(typeof webEntry.default, "function", "prototype/web/index.tsx default export 누락");
  const requiredTexts = [
    "로그인",
    "로그인 후 계속할 작업",
    "작성 내용 보존됨",
    "이메일",
    "name@example.com",
    "비밀번호",
    "비밀번호 8자 이상",
    "Google로 계속하기",
    "Kakao로 계속하기",
    "이메일로 로그인",
    "회원가입",
  ];
  for (const textValue of requiredTexts) {
    await test("UI", `high-fi 필수 텍스트 렌더: ${textValue}`, () => {
      assert(html.includes(textValue), `렌더 결과에 '${textValue}'가 없음`);
    });
  }

  const prototypeSources = [
    path.join(here, "server", "auth.types.ts"),
    path.join(here, "server", "auth.service.ts"),
    path.join(here, "mock", "mock-auth.adapter.ts"),
  ].map((file) => readFileSync(file, "utf8")).join("\n");
  await test("ARCH", "앱 비밀번호 해시·자체 JWT 의존성을 만들지 않는다", () => {
    assert(!/passwordHash|password_hash|jwt\.sign|jsonwebtoken/.test(prototypeSources), "금지된 앱 인증 정본 의존성 발견");
  });

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;
  console.log(`=== 결과: PASS ${passed}, FAIL ${failed}, TOTAL ${results.length} ===`);
  if (failed > 0) {
    console.error("실패 목록:");
    for (const result of results.filter((candidate) => !candidate.ok)) {
      console.error(`- [${result.group}] ${result.name}: ${result.detail}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[FATAL] prototype 실행 실패:", error);
  process.exitCode = 1;
});
