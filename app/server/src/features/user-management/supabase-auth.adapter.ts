import {
  createClient,
  type Session,
  type SupabaseClient,
  type SupabaseClientOptions,
  type SupportedStorage,
  type User,
} from "@supabase/supabase-js";

import { ProviderAuthError, type AuthProvider, type ProviderErrorCode } from "./auth.port";
import type {
  OAuthProvider,
  ProviderSession,
  ProviderSessionCredential,
  ProviderUser,
  VerifiedAccessSession,
} from "./auth.types";

type ClientOptions = SupabaseClientOptions<"public">;

export type SupabaseClientFactory = (
  supabaseUrl: string,
  supabaseKey: string,
  options: ClientOptions,
) => SupabaseClient;

export type SupabaseAuthAdapterOptions = {
  supabaseUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
  emailConfirmationRedirectTo: string;
  clientFactory?: SupabaseClientFactory;
};

type PkceFlowSnapshot = {
  version: 1;
  flowId: string;
  verifierStorageKey: string;
  verifier: string;
};

type JwtSessionClaims = {
  sub: string;
  sessionId: string;
  expiresAtSeconds: number;
};

const FLOW_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const MAX_PROVIDER_FLOW_STATE_LENGTH = 4_096;
const MAX_JWT_LENGTH = 16_384;

function encodeBase64UrlUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64UrlUtf8(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

class OperationMemoryStorage implements SupportedStorage {
  private readonly values = new Map<string, string>();

  constructor(entries: ReadonlyArray<readonly [string, string]> = []) {
    for (const [key, value] of entries) {
      this.values.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  findPkceVerifier(flowId: string): { key: string; verifier: string } | null {
    const suffix = `-flow-${flowId}-code-verifier`;
    for (const [key, verifier] of this.values) {
      if (key.endsWith(suffix)) {
        return { key, verifier };
      }
    }
    return null;
  }
}

function mapOAuthProvider(provider: OAuthProvider): "google" | "kakao" {
  return provider === "GOOGLE" ? "google" : "kakao";
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function readErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  return typeof error.status === "number" ? error.status : undefined;
}

function providerError(
  error: unknown,
  providerSessionId?: string,
  fallback: ProviderErrorCode = "PROVIDER_UNAVAILABLE",
): ProviderAuthError {
  if (error instanceof ProviderAuthError) {
    return error;
  }

  const sourceCode = readErrorCode(error);
  const status = readErrorStatus(error);
  let code = fallback;

  if (status === 429 || sourceCode?.startsWith("over_") === true) {
    code = "RATE_LIMITED";
  } else {
    switch (sourceCode) {
      case "email_not_confirmed":
        code = "EMAIL_NOT_CONFIRMED";
        break;
      case "refresh_token_not_found":
        code = "REFRESH_TOKEN_NOT_FOUND";
        break;
      case "refresh_token_already_used":
        code = "REFRESH_TOKEN_ALREADY_USED";
        break;
      case "otp_expired":
      case "flow_state_expired":
        code = "EMAIL_CONFIRMATION_EXPIRED";
        break;
      case "signup_disabled":
      case "email_provider_disabled":
      case "oauth_provider_not_supported":
      case "provider_disabled":
      case "otp_disabled":
      case "bad_oauth_callback":
        code = "CONFIGURATION_INVALID";
        break;
      case "bad_jwt":
      case "no_authorization":
      case "session_expired":
      case "session_not_found":
      case "user_not_found":
      case "invalid_credentials":
      case "bad_code_verifier":
      case "bad_oauth_state":
      case "flow_state_not_found":
      case "validation_failed":
        code = "INVALID_CREDENTIALS";
        break;
      case "hook_timeout":
      case "hook_timeout_after_retry":
      case "request_timeout":
      case "unexpected_failure":
        code = "PROVIDER_UNAVAILABLE";
        break;
    }
  }

  return new ProviderAuthError(code, code, providerSessionId);
}

function invalidProviderResult(message: string): ProviderAuthError {
  void message;
  return new ProviderAuthError("CONFIGURATION_INVALID");
}

function isStoredPkceVerifier(value: string): boolean {
  try {
    const decoded: unknown = JSON.parse(value);
    return typeof decoded === "string" && PKCE_VERIFIER_PATTERN.test(decoded);
  } catch {
    return false;
  }
}

function requireConfiguredOptions(
  options: SupabaseAuthAdapterOptions | undefined,
): SupabaseAuthAdapterOptions {
  const missing =
    !options ||
    typeof options.supabaseUrl !== "string" ||
    typeof options.publishableKey !== "string" ||
    typeof options.serviceRoleKey !== "string" ||
    typeof options.emailConfirmationRedirectTo !== "string" ||
    options.supabaseUrl.trim() === "" ||
    options.publishableKey.trim() === "" ||
    options.serviceRoleKey.trim() === "" ||
    options.emailConfirmationRedirectTo.trim() === "";

  if (missing) {
    throw new Error(
      "AUTH_PROVIDER_NOT_READY: Supabase URL, publishable key, service-role key, 이메일 확인 URL이 필요합니다.",
    );
  }

  try {
    const supabaseUrl = new URL(options.supabaseUrl);
    const confirmationUrl = new URL(options.emailConfirmationRedirectTo);
    if (
      !["http:", "https:"].includes(supabaseUrl.protocol) ||
      !["http:", "https:"].includes(confirmationUrl.protocol) ||
      supabaseUrl.username !== "" ||
      supabaseUrl.password !== "" ||
      confirmationUrl.username !== "" ||
      confirmationUrl.password !== ""
    ) {
      throw new Error("invalid URL");
    }
  } catch {
    throw new Error(
      "AUTH_PROVIDER_NOT_READY: Supabase URL 또는 이메일 확인 URL 설정이 올바르지 않습니다.",
    );
  }

  return options;
}

function createClientOptions(storage: SupportedStorage, persistSession = false): ClientOptions {
  return {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
      // OAuth PKCE 작업에서만 true로 전달한다. auth-js는 false일 때 주입 storage를 무시하지만,
      // 이 storage는 한 연산 동안만 살아 있으므로 true여도 세션이 외부에 영속화되지는 않는다.
      persistSession,
      skipAutoInitialize: true,
      storage,
    },
  };
}

function encodePkceFlowSnapshot(
  storage: OperationMemoryStorage,
  flowId: string,
): string {
  if (!FLOW_ID_PATTERN.test(flowId)) {
    throw invalidProviderResult("Supabase가 유효한 OAuth flowId를 반환하지 않았습니다.");
  }

  const verifierEntry = storage.findPkceVerifier(flowId);
  if (!verifierEntry || !isStoredPkceVerifier(verifierEntry.verifier)) {
    throw invalidProviderResult("Supabase가 OAuth PKCE verifier를 저장하지 않았습니다.");
  }
  if (
    verifierEntry.key.length > 256 ||
    verifierEntry.key.includes("\0") ||
    !verifierEntry.key.endsWith(`-flow-${flowId}-code-verifier`)
  ) {
    throw invalidProviderResult("Supabase OAuth PKCE 저장 키가 올바르지 않습니다.");
  }

  const snapshot: PkceFlowSnapshot = {
    version: 1,
    flowId,
    verifierStorageKey: verifierEntry.key,
    verifier: verifierEntry.verifier,
  };
  const encoded = encodeBase64UrlUtf8(JSON.stringify(snapshot));
  if (encoded.length > MAX_PROVIDER_FLOW_STATE_LENGTH) {
    throw invalidProviderResult("Supabase OAuth PKCE 상태가 허용 크기를 초과했습니다.");
  }
  return encoded;
}

function decodePkceFlowSnapshot(providerFlowState: string): PkceFlowSnapshot {
  if (
    typeof providerFlowState !== "string" ||
    providerFlowState.length === 0 ||
    providerFlowState.length > MAX_PROVIDER_FLOW_STATE_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(providerFlowState)
  ) {
    throw new ProviderAuthError("INVALID_CREDENTIALS", "INVALID_CREDENTIALS");
  }

  try {
    const parsed: unknown = JSON.parse(decodeBase64UrlUtf8(providerFlowState));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("invalid snapshot");
    }

    const candidate = parsed as Partial<PkceFlowSnapshot> & Record<string, unknown>;
    const keys = Object.keys(candidate).sort();
    if (
      keys.join(",") !== "flowId,verifier,verifierStorageKey,version" ||
      candidate.version !== 1 ||
      typeof candidate.flowId !== "string" ||
      !FLOW_ID_PATTERN.test(candidate.flowId) ||
      typeof candidate.verifierStorageKey !== "string" ||
      candidate.verifierStorageKey.length === 0 ||
      candidate.verifierStorageKey.length > 256 ||
      candidate.verifierStorageKey.includes("\0") ||
      !candidate.verifierStorageKey.endsWith(`-flow-${candidate.flowId}-code-verifier`) ||
      typeof candidate.verifier !== "string" ||
      !isStoredPkceVerifier(candidate.verifier)
    ) {
      throw new Error("invalid snapshot");
    }

    return {
      version: 1,
      flowId: candidate.flowId,
      verifierStorageKey: candidate.verifierStorageKey,
      verifier: candidate.verifier,
    };
  } catch {
    throw new ProviderAuthError("INVALID_CREDENTIALS", "INVALID_CREDENTIALS");
  }
}

function decodeVerifiedJwtSessionClaims(accessToken: string): JwtSessionClaims {
  if (
    typeof accessToken !== "string" ||
    accessToken.length === 0 ||
    accessToken.length > MAX_JWT_LENGTH
  ) {
    throw new ProviderAuthError("INVALID_CREDENTIALS", "INVALID_CREDENTIALS");
  }

  const segments = accessToken.split(".");
  if (segments.length !== 3 || segments.some((segment) => segment.length === 0)) {
    throw new ProviderAuthError("INVALID_CREDENTIALS", "INVALID_CREDENTIALS");
  }

  try {
    const payload: unknown = JSON.parse(decodeBase64UrlUtf8(segments[1]));
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new Error("invalid JWT payload");
    }
    const claims = payload as Record<string, unknown>;
    if (
      typeof claims.sub !== "string" ||
      !UUID_PATTERN.test(claims.sub) ||
      typeof claims.session_id !== "string" ||
      !UUID_PATTERN.test(claims.session_id) ||
      typeof claims.exp !== "number" ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Math.floor(Date.now() / 1_000)
    ) {
      throw new Error("invalid JWT claims");
    }
    return {
      sub: claims.sub,
      sessionId: claims.session_id,
      expiresAtSeconds: claims.exp,
    };
  } catch {
    throw new ProviderAuthError("INVALID_CREDENTIALS", "INVALID_CREDENTIALS");
  }
}

function toProviderUser(user: User, expectedAuthUserId?: string): ProviderUser {
  const email = user.email?.trim().toLowerCase();
  if (
    !UUID_PATTERN.test(user.id) ||
    (expectedAuthUserId !== undefined && user.id !== expectedAuthUserId) ||
    !email ||
    email.length > 320
  ) {
    throw invalidProviderResult("Supabase 사용자 응답에 필수 식별자가 없습니다.");
  }
  return {
    authUserId: user.id,
    email,
    emailVerified: Boolean(user.email_confirmed_at ?? user.confirmed_at),
  };
}

function toProviderSession(session: Session): ProviderSession {
  const claims = decodeVerifiedJwtSessionClaims(session.access_token);
  if (
    typeof session.refresh_token !== "string" ||
    session.refresh_token.length === 0 ||
    session.refresh_token.length > MAX_JWT_LENGTH ||
    session.user.id !== claims.sub
  ) {
    throw invalidProviderResult("Supabase 세션 응답의 식별자가 일치하지 않습니다.");
  }
  return {
    accessToken: session.access_token,
    accessTokenExpiresAt: new Date(claims.expiresAtSeconds * 1_000),
    refreshToken: session.refresh_token,
    providerSessionId: claims.sessionId,
    user: toProviderUser(session.user, claims.sub),
  };
}

function toVerifiedAccessSession(accessToken: string, user: User): VerifiedAccessSession {
  const claims = decodeVerifiedJwtSessionClaims(accessToken);
  return {
    accessToken,
    accessTokenExpiresAt: new Date(claims.expiresAtSeconds * 1_000),
    providerSessionId: claims.sessionId,
    user: toProviderUser(user, claims.sub),
  };
}

function isNotFoundError(error: unknown): boolean {
  return readErrorCode(error) === "user_not_found";
}

export function createSupabaseAuthAdapter(options?: SupabaseAuthAdapterOptions): AuthProvider {
  const settings = requireConfiguredOptions(options);
  const clientFactory: SupabaseClientFactory = settings.clientFactory ?? createClient;

  const createPublicClient = (
    storage = new OperationMemoryStorage(),
    persistSession = false,
  ): SupabaseClient =>
    clientFactory(
      settings.supabaseUrl,
      settings.publishableKey,
      createClientOptions(storage, persistSession),
    );
  const createAdminClient = (): SupabaseClient =>
    clientFactory(
      settings.supabaseUrl,
      settings.serviceRoleKey,
      createClientOptions(new OperationMemoryStorage()),
    );

  const revokeAccessToken = async (accessToken: string, providerSessionId: string): Promise<void> => {
    const adminClient = createAdminClient();
    const { error } = await adminClient.auth.admin.signOut(accessToken, "local");
    if (error) {
      throw providerError(error, providerSessionId);
    }
  };

  const verifyAccessToken = async (accessToken: string): Promise<VerifiedAccessSession> => {
    try {
      const client = createPublicClient();
      // getUser(accessToken)이 Supabase Auth 서버에서 토큰을 검증한 뒤에만 JWT 구조를 읽는다.
      const { data, error } = await client.auth.getUser(accessToken);
      if (error) {
        throw providerError(error);
      }
      if (!data.user) {
        throw new ProviderAuthError("INVALID_CREDENTIALS", "INVALID_CREDENTIALS");
      }
      return toVerifiedAccessSession(accessToken, data.user);
    } catch (error) {
      throw providerError(error);
    }
  };

  return {
    async registerEmail(input) {
      try {
        const client = createPublicClient();
        const { data, error } = await client.auth.signUp({
          email: input.email,
          password: input.password,
          options: { emailRedirectTo: settings.emailConfirmationRedirectTo },
        });
        if (error) {
          throw providerError(error);
        }
        if (!data.user) {
          throw invalidProviderResult("Supabase 회원가입 응답에 사용자가 없습니다.");
        }

        const user = toProviderUser(data.user);
        const unexpectedSession = data.session ? toProviderSession(data.session) : undefined;
        return {
          user,
          // 기존 미확인 사용자도 identities를 포함할 수 있다. 공개 signUp 응답만으로 신규 생성을
          // 증명할 수 없으므로 live 어댑터는 보상 삭제 힌트를 절대 세우지 않는다.
          created: false,
          ...(unexpectedSession ? { unexpectedSession } : {}),
        };
      } catch (error) {
        throw providerError(error);
      }
    },

    async verifyPendingRegistrationOwnership(email, password) {
      try {
        const client = createPublicClient();
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        const errorCode = readErrorCode(error);
        if (errorCode === "email_not_confirmed") {
          return true;
        }
        if (
          errorCode === "invalid_credentials" ||
          errorCode === "user_not_found" ||
          errorCode === "email_address_invalid"
        ) {
          return false;
        }
        if (error) {
          throw providerError(error);
        }
        if (!data.session) {
          throw invalidProviderResult("Supabase 소유권 확인 응답에 세션이 없습니다.");
        }

        const session = toProviderSession(data.session);
        await revokeAccessToken(session.accessToken, session.providerSessionId);
        return false;
      } catch (error) {
        throw providerError(error);
      }
    },

    async deleteUnconfirmedUser(authUserId) {
      try {
        const adminClient = createAdminClient();
        const { data, error } = await adminClient.auth.admin.getUserById(authUserId);
        if (error) {
          if (isNotFoundError(error)) {
            return;
          }
          throw providerError(error);
        }
        if (!data.user) {
          return;
        }
        if (data.user.email_confirmed_at ?? data.user.confirmed_at) {
          throw invalidProviderResult("확인된 Supabase 사용자는 보상 삭제할 수 없습니다.");
        }

        const deletion = await adminClient.auth.admin.deleteUser(authUserId);
        if (deletion.error && !isNotFoundError(deletion.error)) {
          throw providerError(deletion.error);
        }
      } catch (error) {
        throw providerError(error);
      }
    },

    async requestEmailConfirmation(email) {
      try {
        const client = createPublicClient();
        const { error } = await client.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: settings.emailConfirmationRedirectTo },
        });
        if (error) {
          throw providerError(error);
        }
      } catch (error) {
        throw providerError(error);
      }
    },

    async verifyEmail(tokenHash) {
      try {
        const client = createPublicClient();
        const { data, error } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: "email",
        });
        if (error) {
          throw providerError(error);
        }
        if (!data.session) {
          throw invalidProviderResult("Supabase 이메일 확인 응답에 세션이 없습니다.");
        }
        return toProviderSession(data.session);
      } catch (error) {
        throw providerError(error);
      }
    },

    async signInWithPassword(email, password) {
      try {
        const client = createPublicClient();
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) {
          throw providerError(error);
        }
        if (!data.session) {
          throw invalidProviderResult("Supabase 로그인 응답에 세션이 없습니다.");
        }
        return toProviderSession(data.session);
      } catch (error) {
        throw providerError(error);
      }
    },

    async createOAuthAuthorization(input) {
      try {
        const storage = new OperationMemoryStorage();
        const client = createPublicClient(storage, true);
        const { data, error } = await client.auth.signInWithOAuth({
          provider: mapOAuthProvider(input.provider),
          options: {
            redirectTo: input.redirectTo,
            skipBrowserRedirect: true,
          },
        });
        if (error) {
          throw providerError(error);
        }
        if (!data.url || !data.flowId) {
          throw invalidProviderResult("Supabase OAuth 시작 응답에 URL 또는 flowId가 없습니다.");
        }
        return {
          authorizationUrl: data.url,
          providerFlowState: encodePkceFlowSnapshot(storage, data.flowId),
        };
      } catch (error) {
        throw providerError(error);
      }
    },

    async exchangeOAuthCode(code, providerFlowState) {
      try {
        const snapshot = decodePkceFlowSnapshot(providerFlowState);
        const storage = new OperationMemoryStorage([
          [snapshot.verifierStorageKey, snapshot.verifier],
        ]);
        const client = createPublicClient(storage, true);
        const { data, error } = await client.auth.exchangeCodeForSession(code, {
          flowId: snapshot.flowId,
        });
        if (error) {
          throw providerError(error);
        }
        if (!data.session) {
          throw invalidProviderResult("Supabase OAuth 교환 응답에 세션이 없습니다.");
        }
        return toProviderSession(data.session);
      } catch (error) {
        throw providerError(error);
      }
    },

    async refreshSession(input) {
      try {
        const client = createPublicClient();
        const { data, error } = await client.auth.refreshSession({
          refresh_token: input.refreshToken,
        });
        if (error) {
          throw providerError(error, input.expectedProviderSessionId);
        }
        if (!data.session) {
          throw invalidProviderResult("Supabase 갱신 응답에 세션이 없습니다.");
        }

        const session = toProviderSession(data.session);
        if (session.providerSessionId !== input.expectedProviderSessionId) {
          throw new ProviderAuthError(
            "INVALID_CREDENTIALS",
            "INVALID_CREDENTIALS",
            input.expectedProviderSessionId,
          );
        }
        return session;
      } catch (error) {
        throw providerError(error, input.expectedProviderSessionId);
      }
    },

    verifyAccessToken,

    async revokeSession(credential: ProviderSessionCredential) {
      try {
        let accessToken: string;
        if (credential.kind === "ACCESS_TOKEN") {
          const verified = await verifyAccessToken(credential.accessToken);
          if (verified.providerSessionId !== credential.providerSessionId) {
            throw new ProviderAuthError(
              "INVALID_CREDENTIALS",
              "INVALID_CREDENTIALS",
              credential.providerSessionId,
            );
          }
          accessToken = credential.accessToken;
        } else {
          const client = createPublicClient();
          const { data, error } = await client.auth.refreshSession({
            refresh_token: credential.refreshToken,
          });
          if (error) {
            throw providerError(error, credential.providerSessionId);
          }
          if (!data.session) {
            throw invalidProviderResult("Supabase 폐기용 갱신 응답에 세션이 없습니다.");
          }
          const refreshed = toProviderSession(data.session);
          if (refreshed.providerSessionId !== credential.providerSessionId) {
            throw new ProviderAuthError(
              "INVALID_CREDENTIALS",
              "INVALID_CREDENTIALS",
              credential.providerSessionId,
            );
          }
          accessToken = refreshed.accessToken;
        }

        await revokeAccessToken(accessToken, credential.providerSessionId);
      } catch (error) {
        throw providerError(error, credential.providerSessionId);
      }
    },
  };
}
