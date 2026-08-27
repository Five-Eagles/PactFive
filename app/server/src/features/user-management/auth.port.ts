import type {
  OAuthProvider,
  ProviderSession,
  ProviderUser,
  RefreshResult,
  RegistrationIntent,
} from "./auth.types";

export type ProviderErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_NOT_CONFIRMED"
  | "REFRESH_TOKEN_NOT_FOUND"
  | "REFRESH_TOKEN_ALREADY_USED"
  | "EMAIL_CONFIRMATION_EXPIRED"
  | "RATE_LIMITED"
  | "CONFIGURATION_INVALID"
  | "PROVIDER_NOT_READY"
  | "PROVIDER_UNAVAILABLE";

export class ProviderAuthError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message = code,
    public readonly providerSessionId?: string,
  ) {
    super(message);
    this.name = "ProviderAuthError";
  }
}

export interface AuthProvider {
  registerEmail(input: { email: string; password: string }): Promise<{
    user: ProviderUser;
    created: boolean;
    unexpectedSession?: ProviderSession;
  }>;
  verifyPendingRegistrationOwnership(email: string, password: string): Promise<boolean>;
  saveRegistrationIntent(intent: RegistrationIntent): Promise<void>;
  getRegistrationIntent(authUserId: string): Promise<RegistrationIntent | null>;
  findRegistrationIntentByEmail(email: string): Promise<RegistrationIntent | null>;
  clearRegistrationIntent(authUserId: string, nonce: string): Promise<void>;
  deleteUnconfirmedUser(authUserId: string): Promise<void>;
  requestEmailConfirmation(email: string): Promise<void>;
  verifyEmail(tokenHash: string): Promise<ProviderSession>;
  signInWithPassword(email: string, password: string): Promise<ProviderSession>;
  createOAuthAuthorization(input: {
    provider: OAuthProvider;
    redirectTo: string;
  }): Promise<{ authorizationUrl: string; providerFlowState: string }>;
  exchangeOAuthCode(code: string, providerFlowState: string): Promise<ProviderSession>;
  refreshSession(refreshToken: string): Promise<RefreshResult>;
  verifyAccessToken(accessToken: string): Promise<ProviderSession>;
  signOut(providerSessionId: string): Promise<void>;
}

// Supabase SDK는 통합 단계의 supabase-auth.adapter.ts 한 곳에서만 이 포트를 구현한다.
// 수동 identity 연결 메서드는 의도적으로 제공하지 않는다.
