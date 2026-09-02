export type UserRole = "CLIENT" | "FREELANCER";
export type OAuthProvider = "GOOGLE" | "KAKAO";

export type UserAuthSummary = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  profileImageUrl: string | null;
};

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  returnTo: string;
};

export type RegisterResponse = {
  status: "EMAIL_VERIFICATION_REQUIRED";
  message: string;
};

export type CreateAuthSessionInput = {
  email: string;
  password: string;
  deviceLabel?: string;
  returnTo?: string;
};

export type CompleteRegistrationInput = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  deviceLabel?: string;
  returnTo: string;
};

export type AuthenticatedSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  returnTo: string;
  user: UserAuthSummary;
};

export type CreateOAuthAuthorizationInput = {
  oauthProvider: OAuthProvider;
  role?: UserRole;
  returnTo: string;
};

export type CreateOAuthAuthorizationResponse = {
  authorizationUrl: string;
  expiresAt: string;
};

export type ProviderUser = {
  authUserId: string;
  email: string;
  emailVerified: boolean;
};

export type ProviderSession = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  providerSessionId: string;
  user: ProviderUser;
};

// Access Token 검증만으로는 Refresh Token을 얻을 수 없다. 전체 ProviderSession과 분리해
// 실연동 어댑터가 존재하지 않는 Refresh Token을 빈 문자열로 위조하지 못하게 한다.
export type VerifiedAccessSession = Omit<ProviderSession, "refreshToken">;

export type ProviderSessionCredential =
  | {
      kind: "ACCESS_TOKEN";
      providerSessionId: string;
      accessToken: string;
    }
  | {
      kind: "REFRESH_TOKEN";
      providerSessionId: string;
      refreshToken: string;
    };

export type UserRecord = {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  role: UserRole;
  profileImageUrl: string | null;
  deletedAt: Date | null;
  lastLoginAt: Date | null;
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  providerSessionId: string;
  refreshTokenFingerprint: string;
  previousTokenFingerprint: string | null;
  deviceLabel: string | null;
  issuedAt: Date;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
  revokedReason: "LOGOUT" | "LOGOUT_ALL" | "REUSE_DETECTED" | "PASSWORD_CHANGED" | "USER_WITHDRAWN" | null;
};

export type RegistrationIntent = {
  authUserId: string;
  email: string;
  name: string;
  role: UserRole;
  returnTo: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  recoveryExpiresAt: Date;
};

export type OAuthIntent = {
  oauthProvider: OAuthProvider;
  role?: UserRole;
  returnTo: string;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  providerFlowState: string;
};

export type RegistrationRecoveryProof = {
  authUserId: string;
  email: string;
  intentNonce: string;
  issuedAt: Date;
  expiresAt: Date;
};

export type AuthContext = UserAuthSummary & {
  authenticated: true;
  accessTokenExpiresAt: string;
};

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details: Array<{ field: string; reason: string }> | null;
  };
};
