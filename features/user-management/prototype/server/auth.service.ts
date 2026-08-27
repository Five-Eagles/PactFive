import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import type { AuthProvider } from "./auth.port";
import { ProviderAuthError } from "./auth.port";
import type { AuthRepositories } from "./auth.repository";
import { safeReturnToOrRoot, validateReturnTo } from "../shared/return-to";
import type {
  AuthContext,
  AuthSessionRecord,
  AuthenticatedSessionResponse,
  CreateAuthSessionInput,
  CompleteRegistrationInput,
  CreateOAuthAuthorizationInput,
  CreateOAuthAuthorizationResponse,
  OAuthIntent,
  ProviderSessionCredential,
  ProviderSession,
  RegisterInput,
  RegisterResponse,
  RegistrationRecoveryProof,
  RegistrationIntent,
  UserRecord,
  UserRole,
} from "./auth.types";

const GENERIC_INVALID_CREDENTIALS = "이메일 또는 비밀번호가 올바르지 않습니다.";
const GENERIC_REGISTRATION_MESSAGE = "확인 메일을 보냈습니다. 메일에서 가입을 계속해 주세요.";
const OAUTH_INTENT_TTL_MS = 10 * 60 * 1000;
const REGISTRATION_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const REGISTRATION_RECOVERY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REGISTRATION_RECOVERY_COOKIE_TTL_MS = 10 * 60 * 1000;

function requireStrongKey(label: string, value: string): void {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error(`${label} must contain at least 32 bytes`);
  }
}

export class AuthProblem extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly clearRefreshCookie = false,
    public readonly clearRegistrationRecoveryCookie = false,
  ) {
    super(message);
    this.name = "AuthProblem";
  }
}

export class RegistrationCompletionRequiredProblem extends AuthProblem {
  constructor(public readonly recoveryCookie: string) {
    super(409, "REGISTRATION_COMPLETION_REQUIRED", "가입을 완료해 주세요.", true);
    this.name = "RegistrationCompletionRequiredProblem";
  }
}

export type InternalSessionResult = {
  body: AuthenticatedSessionResponse;
  refreshToken: string;
  sessionExpiresAt: Date;
};

export type InternalRefreshResult = {
  body: { accessToken: string; accessTokenExpiresAt: string };
  refreshToken: string;
  sessionExpiresAt: Date;
};

export type InternalOAuthAuthorizationResult = CreateOAuthAuthorizationResponse & {
  sealedIntent: string;
};

export type AuthServiceOptions = {
  provider: AuthProvider;
  repositories: AuthRepositories;
  sessionAbsoluteTtlMs: number;
  refreshFingerprintKey: string;
  oauthIntentEncryptionKey: string;
  registrationRecoveryEncryptionKey: string;
  oauthCallbackUrl: string;
  now?: () => Date;
  nonce?: () => string;
  nextUserId?: () => string;
  nextSessionId?: () => string;
};

export { safeReturnToOrRoot, validateReturnTo } from "../shared/return-to";

export function requireSafeReturnTo(value: string): string {
  const safe = validateReturnTo(value);
  if (!safe) throw new AuthProblem(422, "UNSAFE_RETURN_TO", "안전하지 않은 복귀 경로입니다.");
  return safe;
}

export type AllowedOrigins = string | readonly string[];

export function requireAllowedOrigin(origin: string | undefined, allowedOrigins: AllowedOrigins): void {
  const exactAllowedOrigins = typeof allowedOrigins === "string" ? [allowedOrigins] : allowedOrigins;
  if (!origin || !exactAllowedOrigins.includes(origin)) {
    throw new AuthProblem(403, "ORIGIN_NOT_ALLOWED", "요청 출처를 확인할 수 없습니다.");
  }
}

export function fingerprintRefreshToken(token: string, key: string): string {
  return createHmac("sha256", key).update(token).digest("hex");
}

export function buildBearerAuthorization(accessToken: string): string {
  return `Bearer ${accessToken}`;
}

export class OAuthIntentCodec {
  private readonly key: Buffer;

  constructor(secret: string) {
    requireStrongKey("oauthIntentEncryptionKey", secret);
    this.key = createHash("sha256").update(secret).digest();
  }

  seal(intent: OAuthIntent): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = Buffer.from(
      JSON.stringify({
        ...intent,
        issuedAt: intent.issuedAt.toISOString(),
        expiresAt: intent.expiresAt.toISOString(),
      }),
      "utf8",
    );
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  open(value: string): OAuthIntent {
    try {
      const [version, ivPart, tagPart, ciphertextPart] = value.split(".");
      if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart) throw new Error("invalid envelope");
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivPart, "base64url"));
      decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextPart, "base64url")),
        decipher.final(),
      ]).toString("utf8");
      const parsed = JSON.parse(plaintext) as Omit<OAuthIntent, "issuedAt" | "expiresAt"> & {
        issuedAt: string;
        expiresAt: string;
      };
      return { ...parsed, issuedAt: new Date(parsed.issuedAt), expiresAt: new Date(parsed.expiresAt) };
    } catch {
      throw new AuthProblem(400, "OAUTH_INTENT_INVALID", "OAuth 요청 정보를 확인할 수 없습니다.");
    }
  }
}

export class RegistrationRecoveryCodec {
  private readonly key: Buffer;

  constructor(secret: string) {
    requireStrongKey("registrationRecoveryEncryptionKey", secret);
    this.key = createHash("sha256").update(secret).digest();
  }

  seal(proof: RegistrationRecoveryProof): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const plaintext = Buffer.from(
      JSON.stringify({
        ...proof,
        issuedAt: proof.issuedAt.toISOString(),
        expiresAt: proof.expiresAt.toISOString(),
      }),
      "utf8",
    );
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  open(value: string): RegistrationRecoveryProof {
    try {
      const [version, ivPart, tagPart, ciphertextPart] = value.split(".");
      if (version !== "v1" || !ivPart || !tagPart || !ciphertextPart) throw new Error("invalid envelope");
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivPart, "base64url"));
      decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextPart, "base64url")),
        decipher.final(),
      ]).toString("utf8");
      const parsed = JSON.parse(plaintext) as Omit<RegistrationRecoveryProof, "issuedAt" | "expiresAt"> & {
        issuedAt: string;
        expiresAt: string;
      };
      return { ...parsed, issuedAt: new Date(parsed.issuedAt), expiresAt: new Date(parsed.expiresAt) };
    } catch {
      throw new AuthProblem(
        403,
        "REGISTRATION_RECOVERY_INVALID",
        "가입 복구 정보를 확인할 수 없습니다.",
        false,
        true,
      );
    }
  }
}

export class AuthSessionService {
  private readonly provider: AuthProvider;
  private readonly repositories: AuthRepositories;
  private readonly sessionAbsoluteTtlMs: number;
  private readonly refreshFingerprintKey: string;
  private readonly oauthCallbackUrl: string;
  private readonly now: () => Date;
  private readonly nonce: () => string;
  private readonly nextUserId: () => string;
  private readonly nextSessionId: () => string;
  private readonly oauthIntentCodec: OAuthIntentCodec;
  private readonly registrationRecoveryCodec: RegistrationRecoveryCodec;

  constructor(options: AuthServiceOptions) {
    if (!Number.isFinite(options.sessionAbsoluteTtlMs) || options.sessionAbsoluteTtlMs <= 0) {
      throw new Error("sessionAbsoluteTtlMs must be configured explicitly");
    }
    requireStrongKey("refreshFingerprintKey", options.refreshFingerprintKey);
    requireStrongKey("oauthIntentEncryptionKey", options.oauthIntentEncryptionKey);
    requireStrongKey("registrationRecoveryEncryptionKey", options.registrationRecoveryEncryptionKey);
    if (new Set([
      options.refreshFingerprintKey,
      options.oauthIntentEncryptionKey,
      options.registrationRecoveryEncryptionKey,
    ]).size !== 3) {
      throw new Error("authentication keys must be distinct");
    }
    this.provider = options.provider;
    this.repositories = options.repositories;
    this.sessionAbsoluteTtlMs = options.sessionAbsoluteTtlMs;
    this.refreshFingerprintKey = options.refreshFingerprintKey;
    this.oauthCallbackUrl = options.oauthCallbackUrl;
    this.now = options.now ?? (() => new Date());
    this.nonce = options.nonce ?? (() => randomUUID());
    this.nextUserId = options.nextUserId ?? (() => `usr_${randomUUID().replace(/-/g, "")}`);
    this.nextSessionId = options.nextSessionId ?? (() => `ses_${randomUUID().replace(/-/g, "")}`);
    this.oauthIntentCodec = new OAuthIntentCodec(options.oauthIntentEncryptionKey);
    this.registrationRecoveryCodec = new RegistrationRecoveryCodec(options.registrationRecoveryEncryptionKey);
  }

  async register(input: RegisterInput): Promise<RegisterResponse> {
    this.validateRegistrationInput(input);
    const returnTo = requireSafeReturnTo(input.returnTo);
    const email = this.normalizeEmail(input.email);

    if (await this.repositories.findActiveByEmail(email)) return this.registrationAccepted();

    let registration: Awaited<ReturnType<AuthProvider["registerEmail"]>>;
    try {
      registration = await this.provider.registerEmail({ email, password: input.password });
    } catch (error) {
      throw this.mapRegistrationProviderError(error);
    }
    if (registration.unexpectedSession) {
      await this.safeProviderRevoke(this.accessCredential(registration.unexpectedSession));
      throw new AuthProblem(
        503,
        "AUTH_CONFIGURATION_INVALID",
        "이메일 확인 설정을 점검해 주세요.",
      );
    }
    // Supabase signUp의 identities는 기존 미확인 계정에도 존재할 수 있으므로 생성 여부를
    // 소유권 증거로 쓰지 않는다. 모든 sessionless 결과에서 비밀번호 소유권을 다시 확인한다.
    let ownsPendingRegistration = false;
    try {
      ownsPendingRegistration = await this.provider.verifyPendingRegistrationOwnership(email, input.password);
    } catch {
      return this.registrationAccepted();
    }
    if (!ownsPendingRegistration) return this.registrationAccepted();
    const issuedAt = this.now();
    const intent: RegistrationIntent = {
      authUserId: registration.user.authUserId,
      email,
      name: input.name.trim(),
      role: input.role,
      returnTo,
      nonce: this.nonce(),
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + REGISTRATION_INTENT_TTL_MS),
      recoveryExpiresAt: new Date(issuedAt.getTime() + REGISTRATION_RECOVERY_TTL_MS),
    };

    try {
      await this.repositories.saveRegistrationIntent(intent);
    } catch (error) {
      if (registration.created) await this.provider.deleteUnconfirmedUser(registration.user.authUserId);
      throw new AuthProblem(503, "AUTH_REGISTRATION_SYNC_FAILED", "가입 정보를 연결하지 못했습니다.");
    }
    return this.registrationAccepted();
  }

  async requestEmailConfirmation(email: string): Promise<{
    status: "EMAIL_CONFIRMATION_REQUEST_ACCEPTED";
    message: string;
  }> {
    if (!this.isValidEmail(email)) {
      throw new AuthProblem(422, "VALIDATION_ERROR", "이메일 형식을 확인해 주세요.");
    }
    try {
      const normalized = this.normalizeEmail(email);
      const current = await this.repositories.findRegistrationIntentByEmail(normalized);
      const issuedAt = this.now();
      if (current && current.expiresAt.getTime() > issuedAt.getTime()) {
        await this.repositories.saveRegistrationIntent({
          ...current,
          nonce: this.nonce(),
          issuedAt,
          expiresAt: new Date(issuedAt.getTime() + REGISTRATION_INTENT_TTL_MS),
          recoveryExpiresAt: new Date(issuedAt.getTime() + REGISTRATION_RECOVERY_TTL_MS),
        });
        await this.provider.requestEmailConfirmation(normalized);
      }
    } catch (error) {
      if (error instanceof ProviderAuthError && error.code === "RATE_LIMITED") {
        throw new AuthProblem(429, "EMAIL_CONFIRMATION_RATE_LIMITED", "잠시 후 다시 시도해 주세요.");
      }
      if (error instanceof ProviderAuthError && error.code === "CONFIGURATION_INVALID") {
        throw new AuthProblem(503, "EMAIL_DELIVERY_NOT_CONFIGURED", "확인 메일 설정을 점검해 주세요.");
      }
      throw new AuthProblem(503, "AUTH_PROVIDER_UNAVAILABLE", "인증 서버에 잠시 연결할 수 없습니다.");
    }
    return {
      status: "EMAIL_CONFIRMATION_REQUEST_ACCEPTED",
      message: "확인 메일 요청을 접수했습니다.",
    };
  }

  async confirmEmail(
    tokenHash: string,
    deviceLabel?: string,
    currentRefreshToken?: string,
    pendingOAuthIntent?: string,
  ): Promise<InternalSessionResult> {
    if (await this.hasActiveRefreshSession(currentRefreshToken)) {
      throw new AuthProblem(409, "AUTH_CONTEXT_CONFLICT", "현재 세션에서 먼저 로그아웃해 주세요.");
    }
    if (typeof tokenHash !== "string" || tokenHash.trim().length < 8) {
      throw new AuthProblem(400, "EMAIL_CONFIRMATION_INVALID", "확인 링크가 유효하지 않습니다.");
    }
    await this.cancelPendingOAuthIntent(pendingOAuthIntent);
    let providerSession: ProviderSession;
    try {
      providerSession = await this.provider.verifyEmail(tokenHash);
    } catch (error) {
      if (error instanceof ProviderAuthError && error.code === "EMAIL_CONFIRMATION_EXPIRED") {
        throw new AuthProblem(410, "EMAIL_CONFIRMATION_EXPIRED", "확인 링크가 만료됐습니다.");
      }
      if (error instanceof ProviderAuthError && error.code === "RATE_LIMITED") {
        throw new AuthProblem(429, "AUTH_RATE_LIMITED", "잠시 후 다시 시도해 주세요.");
      }
      if (error instanceof ProviderAuthError && error.code === "PROVIDER_UNAVAILABLE") {
        throw new AuthProblem(503, "AUTH_PROVIDER_UNAVAILABLE", "인증 서버에 잠시 연결할 수 없습니다.");
      }
      throw new AuthProblem(400, "EMAIL_CONFIRMATION_INVALID", "확인 링크가 유효하지 않습니다.");
    }

    try {
      const intent = await this.repositories.findRegistrationIntentByAuthUserId(providerSession.user.authUserId);
      if (!intent || intent.expiresAt.getTime() <= this.now().getTime()) {
        throw new AuthProblem(409, "REGISTRATION_COMPLETION_REQUIRED", "가입 정보를 다시 확인해 주세요.");
      }
      const user = await this.resolveOrCreateIntentUser(providerSession.user, intent);
      const result = await this.synchronizeSession(user, providerSession, intent.returnTo, deviceLabel);
      await this.safeClearRegistrationIntent(intent.authUserId, intent.nonce);
      return result;
    } catch (error) {
      await this.safeProviderRevoke(this.accessCredential(providerSession));
      if (error instanceof AuthProblem && error.code === "AUTH_SESSION_SYNC_FAILED") throw error;
      if (error instanceof AuthProblem && error.code === "REGISTRATION_COMPLETION_REQUIRED") throw error;
      if (error instanceof AuthProblem) {
        throw new AuthProblem(
          403,
          "EMAIL_CONFIRMATION_NOT_AVAILABLE",
          "이메일 확인을 완료할 수 없습니다.",
        );
      }
      throw error;
    }
  }

  async login(
    input: CreateAuthSessionInput,
    pendingOAuthIntent?: string,
    currentRefreshToken?: string,
  ): Promise<InternalSessionResult> {
    if (await this.hasActiveRefreshSession(currentRefreshToken)) {
      throw new AuthProblem(409, "AUTH_CONTEXT_CONFLICT", "현재 세션에서 먼저 로그아웃해 주세요.");
    }
    this.validateLoginInput(input);
    const returnTo = input.returnTo === undefined ? "/" : requireSafeReturnTo(input.returnTo);
    let providerSession: ProviderSession;
    try {
      providerSession = await this.provider.signInWithPassword(this.normalizeEmail(input.email), input.password);
    } catch (error) {
      if (error instanceof ProviderAuthError && error.code === "EMAIL_NOT_CONFIRMED") {
        throw new AuthProblem(403, "EMAIL_VERIFICATION_REQUIRED", "이메일 확인이 필요합니다.");
      }
      if (error instanceof ProviderAuthError && error.code === "PROVIDER_UNAVAILABLE") {
        throw this.mapProviderAvailability(error);
      }
      if (error instanceof ProviderAuthError && error.code === "RATE_LIMITED") {
        throw new AuthProblem(429, "AUTH_RATE_LIMITED", "잠시 후 다시 시도해 주세요.");
      }
      throw new AuthProblem(401, "INVALID_CREDENTIALS", GENERIC_INVALID_CREDENTIALS, true);
    }

    try {
      let user = await this.repositories.findByAuthUserId(providerSession.user.authUserId);
      let completedIntent: RegistrationIntent | null = null;
      if (!user) {
        const intent = await this.repositories.findRegistrationIntentByAuthUserId(providerSession.user.authUserId);
        if (intent && intent.expiresAt.getTime() > this.now().getTime()) {
          user = await this.resolveOrCreateIntentUser(providerSession.user, intent);
          completedIntent = intent;
        } else if (intent && intent.recoveryExpiresAt.getTime() > this.now().getTime()) {
          const issuedAt = this.now();
          const recoveryCookie = this.registrationRecoveryCodec.seal({
            authUserId: providerSession.user.authUserId,
            email: this.normalizeEmail(providerSession.user.email),
            intentNonce: intent.nonce,
            issuedAt,
            expiresAt: new Date(issuedAt.getTime() + REGISTRATION_RECOVERY_COOKIE_TTL_MS),
          });
          throw new RegistrationCompletionRequiredProblem(recoveryCookie);
        } else {
          throw new AuthProblem(
            403,
            "REGISTRATION_NOT_AVAILABLE",
            "가입을 자동으로 완료할 수 없습니다.",
            true,
          );
        }
      }

      if (!user || user.deletedAt || this.normalizeEmail(user.email) !== this.normalizeEmail(providerSession.user.email)) {
        throw new AuthProblem(401, "INVALID_CREDENTIALS", GENERIC_INVALID_CREDENTIALS, true);
      }

      await this.cancelPendingOAuthIntent(pendingOAuthIntent);
      const result = await this.synchronizeSession(user, providerSession, returnTo, input.deviceLabel);
      if (completedIntent) {
        await this.safeClearRegistrationIntent(completedIntent.authUserId, completedIntent.nonce);
      }
      return result;
    } catch (error) {
      await this.safeProviderRevoke(this.accessCredential(providerSession));
      throw error;
    }
  }

  async completeRegistration(
    input: CompleteRegistrationInput,
    sealedRecoveryProof: string | undefined,
    pendingOAuthIntent?: string,
    currentRefreshToken?: string,
  ): Promise<InternalSessionResult> {
    if (await this.hasActiveRefreshSession(currentRefreshToken)) {
      throw new AuthProblem(409, "AUTH_CONTEXT_CONFLICT", "현재 세션에서 먼저 로그아웃해 주세요.");
    }
    this.validateRegistrationInput(input);
    const returnTo = requireSafeReturnTo(input.returnTo);
    if (!sealedRecoveryProof) {
      throw new AuthProblem(
        403,
        "REGISTRATION_RECOVERY_INVALID",
        "가입 복구 정보를 확인할 수 없습니다.",
        false,
        true,
      );
    }
    const proof = this.registrationRecoveryCodec.open(sealedRecoveryProof);
    const now = this.now();
    if (proof.expiresAt.getTime() <= now.getTime()) {
      throw new AuthProblem(
        410,
        "REGISTRATION_RECOVERY_EXPIRED",
        "가입 복구 시간이 만료되었습니다.",
        false,
        true,
      );
    }

    let providerSession: ProviderSession;
    try {
      providerSession = await this.provider.signInWithPassword(this.normalizeEmail(input.email), input.password);
    } catch (error) {
      if (error instanceof ProviderAuthError && error.code === "EMAIL_NOT_CONFIRMED") {
        throw new AuthProblem(403, "EMAIL_VERIFICATION_REQUIRED", "이메일 확인이 필요합니다.");
      }
      if (error instanceof ProviderAuthError && error.code === "PROVIDER_UNAVAILABLE") {
        throw this.mapProviderAvailability(error);
      }
      throw new AuthProblem(401, "INVALID_CREDENTIALS", GENERIC_INVALID_CREDENTIALS);
    }

    let createdUser: UserRecord | null = null;
    try {
      const intent = await this.repositories.findRegistrationIntentByAuthUserId(providerSession.user.authUserId);
      const proofMatches =
        providerSession.user.emailVerified &&
        proof.authUserId === providerSession.user.authUserId &&
        this.normalizeEmail(proof.email) === this.normalizeEmail(providerSession.user.email) &&
        this.normalizeEmail(input.email) === this.normalizeEmail(providerSession.user.email) &&
        intent?.authUserId === proof.authUserId &&
        intent.nonce === proof.intentNonce;
      if (!proofMatches || !intent) {
        throw new AuthProblem(
          403,
          "REGISTRATION_RECOVERY_INVALID",
          "가입 복구 정보를 확인할 수 없습니다.",
          false,
          true,
        );
      }
      if (intent.recoveryExpiresAt.getTime() <= now.getTime()) {
        throw new AuthProblem(
          410,
          "REGISTRATION_RECOVERY_EXPIRED",
          "가입 복구 시간이 만료되었습니다.",
          false,
          true,
        );
      }
      const mapped = await this.repositories.findByAuthUserId(providerSession.user.authUserId);
      const emailConflict = await this.repositories.findByEmail(providerSession.user.email);
      if (mapped || emailConflict) {
        throw new AuthProblem(
          409,
          "REGISTRATION_NOT_AVAILABLE",
          "가입 복구를 진행할 수 없습니다.",
          false,
          true,
        );
      }
      await this.cancelPendingOAuthIntent(pendingOAuthIntent);
      const user = await this.repositories.createUser({
        id: this.nextUserId(),
        authUserId: providerSession.user.authUserId,
        email: this.normalizeEmail(providerSession.user.email),
        name: input.name.trim(),
        role: input.role,
        profileImageUrl: null,
        deletedAt: null,
      });
      createdUser = user;
      const result = await this.synchronizeSession(user, providerSession, returnTo, input.deviceLabel);
      await this.safeClearRegistrationIntent(intent.authUserId, intent.nonce);
      return result;
    } catch (error) {
      await this.safeProviderRevoke(this.accessCredential(providerSession));
      if (createdUser) {
        await this.repositories.deleteUserIfUninitialized(createdUser.id, createdUser.authUserId);
      }
      if (error instanceof AuthProblem) throw error;
      throw new AuthProblem(
        409,
        "REGISTRATION_NOT_AVAILABLE",
        "가입 복구를 진행할 수 없습니다.",
        false,
        true,
      );
    }
  }

  async createOAuthAuthorization(
    input: CreateOAuthAuthorizationInput,
    currentRefreshToken?: string,
  ): Promise<InternalOAuthAuthorizationResult> {
    this.validateOAuthAuthorizationInput(input);
    if (await this.hasActiveRefreshSession(currentRefreshToken)) {
      throw new AuthProblem(409, "AUTH_CONTEXT_CONFLICT", "현재 세션에서 먼저 로그아웃해 주세요.");
    }
    const returnTo = requireSafeReturnTo(input.returnTo);
    let providerStart;
    try {
      providerStart = await this.provider.createOAuthAuthorization({
        provider: input.oauthProvider,
        redirectTo: this.oauthCallbackUrl,
      });
    } catch {
      throw new AuthProblem(503, "AUTH_PROVIDER_NOT_READY", "소셜 로그인 설정이 준비되지 않았습니다.");
    }
    const issuedAt = this.now();
    const intent: OAuthIntent = {
      oauthProvider: input.oauthProvider,
      role: input.role,
      returnTo,
      nonce: this.nonce(),
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + OAUTH_INTENT_TTL_MS),
      providerFlowState: providerStart.providerFlowState,
    };
    return {
      authorizationUrl: providerStart.authorizationUrl,
      expiresAt: intent.expiresAt.toISOString(),
      sealedIntent: this.oauthIntentCodec.seal(intent),
    };
  }

  async completeOAuthCallback(
    code: string,
    sealedIntent: string,
    deviceLabel?: string,
    currentRefreshToken?: string,
  ): Promise<InternalSessionResult> {
    if (await this.hasActiveRefreshSession(currentRefreshToken)) {
      throw new AuthProblem(409, "AUTH_CONTEXT_CONFLICT", "현재 세션에서 먼저 로그아웃해 주세요.");
    }
    if (typeof code !== "string" || !code.trim()) {
      throw new AuthProblem(400, "OAUTH_INTENT_INVALID", "OAuth 요청 정보를 확인할 수 없습니다.");
    }
    const intent = this.oauthIntentCodec.open(sealedIntent);
    if (intent.expiresAt.getTime() <= this.now().getTime()) {
      throw new AuthProblem(400, "OAUTH_INTENT_INVALID", "OAuth 요청 정보가 만료되었거나 이미 사용됐습니다.");
    }
    const consumed = await this.repositories.consumeOAuthNonce(intent.nonce, intent.expiresAt);
    if (!consumed) {
      throw new AuthProblem(400, "OAUTH_INTENT_INVALID", "OAuth 요청 정보가 만료되었거나 이미 사용됐습니다.");
    }
    const returnTo = safeReturnToOrRoot(intent.returnTo);

    let providerSession: ProviderSession;
    try {
      providerSession = await this.provider.exchangeOAuthCode(code, intent.providerFlowState);
    } catch (error) {
      if (
        error instanceof ProviderAuthError &&
        (error.code === "PROVIDER_UNAVAILABLE" || error.code === "PROVIDER_NOT_READY" || error.code === "CONFIGURATION_INVALID")
      ) {
        throw new AuthProblem(503, "AUTH_PROVIDER_NOT_READY", "소셜 로그인 설정이 준비되지 않았습니다.");
      }
      throw new AuthProblem(400, "OAUTH_INTENT_INVALID", "OAuth 요청 정보를 확인할 수 없습니다.");
    }

    try {
      if (!providerSession.user.emailVerified || !this.isValidEmail(providerSession.user.email)) {
        throw new AuthProblem(403, "OAUTH_ACCOUNT_NOT_AVAILABLE", "소셜 로그인을 완료할 수 없습니다.");
      }
      let user = await this.repositories.findByAuthUserId(providerSession.user.authUserId);
      if (user?.deletedAt) {
        throw new AuthProblem(403, "OAUTH_ACCOUNT_NOT_AVAILABLE", "소셜 로그인을 완료할 수 없습니다.");
      }

      if (!user) {
        const conflictingEmail = await this.repositories.findByEmail(providerSession.user.email);
        if (conflictingEmail) {
          throw new AuthProblem(403, "OAUTH_ACCOUNT_NOT_AVAILABLE", "소셜 로그인을 완료할 수 없습니다.");
        }
        if (!intent.role) {
          throw new AuthProblem(403, "OAUTH_ACCOUNT_NOT_AVAILABLE", "소셜 로그인을 완료할 수 없습니다.");
        }
        user = await this.repositories.createUser({
          id: this.nextUserId(),
          authUserId: providerSession.user.authUserId,
          email: this.normalizeEmail(providerSession.user.email),
          name: "PactFive 사용자",
          role: intent.role,
          profileImageUrl: null,
          deletedAt: null,
        });
      }

      return await this.synchronizeSession(user, providerSession, returnTo, deviceLabel);
    } catch (error) {
      await this.safeProviderRevoke(this.accessCredential(providerSession));
      if (error instanceof AuthProblem) throw error;
      throw new AuthProblem(403, "OAUTH_ACCOUNT_NOT_AVAILABLE", "소셜 로그인을 완료할 수 없습니다.");
    }
  }

  async refresh(refreshToken: string): Promise<InternalRefreshResult> {
    const fingerprint = fingerprintRefreshToken(refreshToken, this.refreshFingerprintKey);
    const candidate = await this.repositories.findByRefreshFingerprint(fingerprint);
    const now = this.now();
    if (!candidate || candidate.session.revokedAt) {
      throw new AuthProblem(401, "AUTH_SESSION_INVALID", "세션이 만료되었습니다.", true);
    }
    if (candidate.session.expiresAt.getTime() <= now.getTime()) {
      await this.repositories.invalidateSession(candidate.session.id, now);
      await this.safeProviderRevoke({
        kind: "REFRESH_TOKEN",
        providerSessionId: candidate.session.providerSessionId,
        refreshToken,
      });
      throw new AuthProblem(401, "AUTH_SESSION_INVALID", "세션이 만료되었습니다.", true);
    }

    let providerSession: ProviderSession;
    try {
      providerSession = await this.provider.refreshSession({
        refreshToken,
        expectedProviderSessionId: candidate.session.providerSessionId,
      });
    } catch (error) {
      if (error instanceof ProviderAuthError && error.code === "REFRESH_TOKEN_ALREADY_USED") {
        if (error.providerSessionId === candidate.session.providerSessionId) {
          await this.repositories.revokeSession(candidate.session.id, "REUSE_DETECTED", now);
          throw new AuthProblem(401, "AUTH_SESSION_INVALID", "세션이 만료되었습니다.", true);
        }
        throw new AuthProblem(503, "AUTH_SESSION_SYNC_FAILED", "세션 동기화에 실패했습니다.");
      }
      if (error instanceof ProviderAuthError && error.code === "REFRESH_TOKEN_NOT_FOUND") {
        await this.repositories.invalidateSession(candidate.session.id, now);
        throw new AuthProblem(401, "AUTH_SESSION_INVALID", "세션이 만료되었습니다.", true);
      }
      if (error instanceof ProviderAuthError && error.code === "INVALID_CREDENTIALS") {
        throw new AuthProblem(503, "AUTH_SESSION_SYNC_FAILED", "세션 동기화에 실패했습니다.");
      }
      throw new AuthProblem(503, "AUTH_PROVIDER_UNAVAILABLE", "인증 서버에 잠시 연결할 수 없습니다.");
    }

    if (providerSession.providerSessionId !== candidate.session.providerSessionId) {
      await this.safeProviderRevoke(this.accessCredential(providerSession));
      throw new AuthProblem(503, "AUTH_SESSION_SYNC_FAILED", "세션 동기화에 실패했습니다.");
    }

    const mappedUser = await this.repositories.findByAuthUserId(providerSession.user.authUserId);
    if (!mappedUser || mappedUser.id !== candidate.session.userId || mappedUser.deletedAt) {
      try {
        await this.repositories.invalidateSession(candidate.session.id, now);
      } finally {
        await this.safeProviderRevoke(this.accessCredential(providerSession));
      }
      throw new AuthProblem(401, "AUTH_SESSION_INVALID", "세션이 만료되었습니다.", true);
    }

    const nextFingerprint = fingerprintRefreshToken(providerSession.refreshToken, this.refreshFingerprintKey);
    if (candidate.matched === "PREVIOUS") {
      if (nextFingerprint !== candidate.session.refreshTokenFingerprint) {
        throw new AuthProblem(503, "AUTH_SESSION_SYNC_FAILED", "세션 동기화에 실패했습니다.");
      }
      const touched = await this.repositories.touchSession({
        sessionId: candidate.session.id,
        expectedCurrentFingerprint: candidate.session.refreshTokenFingerprint,
        usedAt: now,
      });
      if (!touched) {
        await this.throwRefreshPersistenceConflict(candidate.session, providerSession, now);
      }
    } else if (nextFingerprint === candidate.session.refreshTokenFingerprint) {
      const touched = await this.repositories.touchSession({
        sessionId: candidate.session.id,
        expectedCurrentFingerprint: candidate.session.refreshTokenFingerprint,
        usedAt: now,
      });
      if (!touched) {
        await this.throwRefreshPersistenceConflict(candidate.session, providerSession, now);
      }
    } else {
      const rotated = await this.repositories.rotateSession({
        sessionId: candidate.session.id,
        expectedCurrentFingerprint: candidate.session.refreshTokenFingerprint,
        nextFingerprint,
        usedAt: now,
      });
      if (!rotated) {
        await this.throwRefreshPersistenceConflict(candidate.session, providerSession, now);
      }
    }

    return {
      body: {
        accessToken: providerSession.accessToken,
        accessTokenExpiresAt: providerSession.accessTokenExpiresAt.toISOString(),
      },
      refreshToken: providerSession.refreshToken,
      sessionExpiresAt: candidate.session.expiresAt,
    };
  }

  async restoreSession(refreshToken: string): Promise<InternalRefreshResult> {
    return this.refresh(refreshToken);
  }

  async hasActiveRefreshSession(refreshToken: string | undefined): Promise<boolean> {
    if (!refreshToken) return false;
    const candidate = await this.repositories.findByRefreshFingerprint(
      fingerprintRefreshToken(refreshToken, this.refreshFingerprintKey),
    );
    return Boolean(
      candidate &&
      candidate.session.revokedAt === null &&
      candidate.session.expiresAt.getTime() > this.now().getTime(),
    );
  }

  async getCurrentContext(accessToken: string): Promise<AuthContext> {
    let providerSession: Awaited<ReturnType<AuthProvider["verifyAccessToken"]>>;
    try {
      providerSession = await this.provider.verifyAccessToken(accessToken);
    } catch (error) {
      if (error instanceof ProviderAuthError && error.code === "INVALID_CREDENTIALS") {
        throw new AuthProblem(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
      }
      throw new AuthProblem(503, "AUTH_PROVIDER_UNAVAILABLE", "인증 서버에 잠시 연결할 수 없습니다.");
    }
    const localSession = await this.repositories.findActiveByProviderSessionId(providerSession.providerSessionId);
    if (!localSession) {
      throw new AuthProblem(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
    }
    if (localSession.expiresAt.getTime() <= this.now().getTime()) {
      try {
        await this.repositories.invalidateSession(localSession.id, this.now());
      } finally {
        await this.safeProviderRevoke(this.accessCredential(providerSession));
      }
      throw new AuthProblem(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
    }
    const user = await this.repositories.findByAuthUserId(providerSession.user.authUserId);
    if (!user || user.id !== localSession.userId || user.deletedAt) {
      try {
        await this.repositories.invalidateSession(localSession.id, this.now());
      } finally {
        await this.safeProviderRevoke(this.accessCredential(providerSession));
      }
      throw new AuthProblem(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
    }
    return {
      ...this.toUserSummary(user),
      authenticated: true,
      accessTokenExpiresAt: providerSession.accessTokenExpiresAt.toISOString(),
    };
  }

  async logout(refreshToken: string | undefined, bearerAccessToken?: string): Promise<void> {
    if (!refreshToken) return;
    let candidate: Awaited<ReturnType<AuthRepositories["findByRefreshFingerprint"]>>;
    try {
      candidate = await this.repositories.findByRefreshFingerprint(
        fingerprintRefreshToken(refreshToken, this.refreshFingerprintKey),
      );
    } catch {
      throw new AuthProblem(503, "AUTH_LOGOUT_SYNC_FAILED", "로그아웃 상태를 확정하지 못했습니다.");
    }
    if (!candidate) return;
    try {
      await this.repositories.revokeSession(candidate.session.id, "LOGOUT", this.now());
    } catch {
      throw new AuthProblem(503, "AUTH_LOGOUT_SYNC_FAILED", "로그아웃 상태를 확정하지 못했습니다.");
    }

    let revokedWithAccessToken = false;
    if (bearerAccessToken) {
      try {
        const providerSession = await this.provider.verifyAccessToken(bearerAccessToken);
        if (providerSession.providerSessionId === candidate.session.providerSessionId) {
          await this.provider.revokeSession(this.accessCredential(providerSession));
          revokedWithAccessToken = true;
        }
      } catch {
        // 공급자 오류나 만료 Bearer는 로컬 로그아웃 결과를 되돌리지 않는다.
      }
    }
    if (!revokedWithAccessToken) {
      await this.safeProviderRevoke({
        kind: "REFRESH_TOKEN",
        providerSessionId: candidate.session.providerSessionId,
        refreshToken,
      });
    }
  }

  private async synchronizeSession(
    user: UserRecord,
    providerSession: ProviderSession,
    returnTo: string,
    deviceLabel?: string,
  ): Promise<InternalSessionResult> {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.sessionAbsoluteTtlMs);
    const sessionId = this.nextSessionId();
    let sessionCreated = false;
    try {
      await this.repositories.createSession({
        id: sessionId,
        userId: user.id,
        providerSessionId: providerSession.providerSessionId,
        refreshTokenFingerprint: fingerprintRefreshToken(providerSession.refreshToken, this.refreshFingerprintKey),
        previousTokenFingerprint: null,
        deviceLabel: deviceLabel?.trim() || null,
        issuedAt: now,
        expiresAt,
        lastUsedAt: now,
        revokedAt: null,
        revokedReason: null,
      });
      sessionCreated = true;
      await this.repositories.updateLastLoginAt(user.id, now);
    } catch {
      if (sessionCreated) await this.repositories.revokeSession(sessionId, "LOGOUT", now);
      await this.safeProviderRevoke(this.accessCredential(providerSession));
      throw new AuthProblem(503, "AUTH_SESSION_SYNC_FAILED", "세션 동기화에 실패했습니다.");
    }

    return {
      body: {
        accessToken: providerSession.accessToken,
        accessTokenExpiresAt: providerSession.accessTokenExpiresAt.toISOString(),
        returnTo,
        user: this.toUserSummary(user),
      },
      refreshToken: providerSession.refreshToken,
      sessionExpiresAt: expiresAt,
    };
  }

  private async resolveOrCreateIntentUser(
    providerUser: ProviderSession["user"],
    intent: RegistrationIntent,
  ): Promise<UserRecord> {
    if (
      providerUser.authUserId !== intent.authUserId ||
      !providerUser.emailVerified ||
      this.normalizeEmail(providerUser.email) !== this.normalizeEmail(intent.email)
    ) {
      throw new AuthProblem(409, "REGISTRATION_INTENT_MISMATCH", "가입 정보를 확인할 수 없습니다.");
    }
    const mapped = await this.repositories.findByAuthUserId(providerUser.authUserId);
    if (mapped) {
      if (mapped.deletedAt) throw new AuthProblem(401, "INVALID_CREDENTIALS", GENERIC_INVALID_CREDENTIALS);
      return mapped;
    }
    const emailConflict = await this.repositories.findActiveByEmail(providerUser.email);
    if (emailConflict) throw new AuthProblem(409, "REGISTRATION_CONFLICT", "가입을 완료할 수 없습니다.");
    return this.repositories.createUser({
      id: this.nextUserId(),
      authUserId: providerUser.authUserId,
      email: this.normalizeEmail(providerUser.email),
      name: intent.name,
      role: intent.role,
      profileImageUrl: null,
      deletedAt: null,
    });
  }

  private validateRegistrationInput(input: RegisterInput): void {
    if (
      !input ||
      typeof input !== "object" ||
      !this.isValidEmail(input.email) ||
      typeof input.password !== "string" ||
      input.password.length < 8 ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      typeof input.returnTo !== "string" ||
      ("deviceLabel" in input && input.deviceLabel !== undefined && typeof input.deviceLabel !== "string")
    ) {
      throw new AuthProblem(422, "VALIDATION_ERROR", "입력값을 확인해 주세요.");
    }
    this.requireRole(input.role);
  }

  private validateLoginInput(input: CreateAuthSessionInput): void {
    if (
      !input ||
      typeof input !== "object" ||
      !this.isValidEmail(input.email) ||
      typeof input.password !== "string" ||
      input.password.length === 0 ||
      (input.returnTo !== undefined && typeof input.returnTo !== "string") ||
      (input.deviceLabel !== undefined && typeof input.deviceLabel !== "string")
    ) {
      throw new AuthProblem(422, "VALIDATION_ERROR", "입력값을 확인해 주세요.");
    }
  }

  private validateOAuthAuthorizationInput(input: CreateOAuthAuthorizationInput): void {
    if (
      !input ||
      typeof input !== "object" ||
      (input.oauthProvider !== "GOOGLE" && input.oauthProvider !== "KAKAO") ||
      typeof input.returnTo !== "string" ||
      (input.role !== undefined && input.role !== "CLIENT" && input.role !== "FREELANCER")
    ) {
      throw new AuthProblem(422, "VALIDATION_ERROR", "OAuth 요청값을 확인해 주세요.");
    }
  }

  private requireRole(role: UserRole): void {
    if (role !== "CLIENT" && role !== "FREELANCER") {
      throw new AuthProblem(422, "VALIDATION_ERROR", "역할을 확인해 주세요.");
    }
  }

  private isValidEmail(email: unknown): email is string {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private toUserSummary(user: UserRecord) {
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      profileImageUrl: user.profileImageUrl,
    };
  }

  private registrationAccepted(): RegisterResponse {
    return { status: "EMAIL_VERIFICATION_REQUIRED", message: GENERIC_REGISTRATION_MESSAGE };
  }

  private mapProviderAvailability(error: unknown): AuthProblem {
    if (error instanceof ProviderAuthError && error.code === "PROVIDER_UNAVAILABLE") {
      return new AuthProblem(503, "AUTH_PROVIDER_UNAVAILABLE", "인증 서버에 잠시 연결할 수 없습니다.");
    }
    return new AuthProblem(503, "AUTH_PROVIDER_UNAVAILABLE", "인증 서버에 잠시 연결할 수 없습니다.");
  }

  private mapRegistrationProviderError(error: unknown): AuthProblem {
    if (error instanceof ProviderAuthError && error.code === "RATE_LIMITED") {
      return new AuthProblem(429, "AUTH_RATE_LIMITED", "잠시 후 다시 시도해 주세요.");
    }
    if (
      error instanceof ProviderAuthError &&
      (error.code === "CONFIGURATION_INVALID" || error.code === "PROVIDER_NOT_READY")
    ) {
      return new AuthProblem(503, "AUTH_CONFIGURATION_INVALID", "이메일 확인 설정을 점검해 주세요.");
    }
    return new AuthProblem(503, "AUTH_PROVIDER_UNAVAILABLE", "인증 서버에 잠시 연결할 수 없습니다.");
  }

  private accessCredential(
    session: Pick<ProviderSession, "providerSessionId" | "accessToken">,
  ): ProviderSessionCredential {
    return {
      kind: "ACCESS_TOKEN",
      providerSessionId: session.providerSessionId,
      accessToken: session.accessToken,
    };
  }

  private async safeProviderRevoke(credential: ProviderSessionCredential): Promise<void> {
    try {
      await this.provider.revokeSession(credential);
    } catch {
      // 앱 인증 실패를 공급자 오류로 되돌리지 않는다. 통합 구현은 비밀값 없이 식별자만 감사한다.
    }
  }

  private async throwRefreshPersistenceConflict(
    candidate: AuthSessionRecord,
    providerSession: ProviderSession,
    now: Date,
  ): Promise<never> {
    let latest: Awaited<ReturnType<AuthRepositories["findSessionById"]>>;
    try {
      latest = await this.repositories.findSessionById(candidate.id);
    } catch {
      throw new AuthProblem(503, "AUTH_SESSION_SYNC_FAILED", "세션 동기화에 실패했습니다.");
    }
    if (
      !latest ||
      latest.providerSessionId !== candidate.providerSessionId ||
      latest.revokedAt !== null ||
      latest.expiresAt.getTime() <= now.getTime()
    ) {
      await this.safeProviderRevoke(this.accessCredential(providerSession));
      throw new AuthProblem(401, "AUTH_SESSION_INVALID", "세션이 만료되었습니다.", true);
    }
    throw new AuthProblem(503, "AUTH_SESSION_SYNC_FAILED", "세션 동기화에 실패했습니다.");
  }

  private async safeClearRegistrationIntent(authUserId: string, nonce: string): Promise<void> {
    try {
      await this.repositories.clearRegistrationIntent(authUserId, nonce);
    } catch {
      // 사용자는 이미 앱 역할과 세션에 고정됐다. stale intent는 기존 사용자 검사로 재사용되지 않으며,
      // 통합 구현은 정리 재시도 대상만 식별자 기반으로 기록한다.
    }
  }

  private async cancelPendingOAuthIntent(sealedIntent: string | undefined): Promise<void> {
    if (!sealedIntent) return;
    let intent: OAuthIntent;
    try {
      intent = this.oauthIntentCodec.open(sealedIntent);
    } catch {
      return;
    }
    if (intent.expiresAt.getTime() <= this.now().getTime()) return;
    const cancelled = await this.repositories.consumeOAuthNonce(intent.nonce, intent.expiresAt);
    if (!cancelled) {
      throw new AuthProblem(409, "AUTH_CONTEXT_CONFLICT", "다른 인증 흐름이 이미 완료 중입니다.");
    }
  }
}
