/**
 * user-management(인증) 도메인 타입 — 웹 전용 사본.
 *
 * 원본(`features/user-management/prototype/web/*`)은 `../../server/auth.types`를 상대 경로로
 * 그대로 import했지만, `app/web`과 `app/server`는 별도로 배포되는 독립 패키지다(ADR-0007 모노레포
 * 배포 설정 — "두 폴더 사이에 공유 코드가 실제로 필요해지는 시점에 change-requests/로 재검토한다").
 * npm workspaces 등 공식 타입 공유 체계가 아직 없으므로, 웹에서 필요한 DTO만 이 파일에 옮겨
 * 적었다. 서버 쪽 정본은 `app/server/src/features/user-management/auth.types.ts`이며, 두 파일이
 * 갈라지지 않도록 API 계약이 바뀌면 함께 갱신해야 한다 (feedback_loop에 기록).
 */
export type UserRole = 'CLIENT' | 'FREELANCER';
export type OAuthProvider = 'GOOGLE' | 'KAKAO';

export type UserAuthSummary = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  profileImageUrl: string | null;
};

export type AuthContext = UserAuthSummary & {
  authenticated: true;
  accessTokenExpiresAt: string;
};

export type AuthenticatedSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  returnTo: string;
  user: UserAuthSummary;
};

export type CreateAuthSessionInput = {
  email: string;
  password: string;
  deviceLabel?: string;
  returnTo?: string;
};

export type RegisterInput = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  returnTo: string;
};

export type RegisterResponse = {
  status: 'EMAIL_VERIFICATION_REQUIRED';
  message: string;
};

export type CompleteRegistrationInput = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  deviceLabel?: string;
  returnTo: string;
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

export type RefreshAuthSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
};

export type RequestEmailConfirmationResponse = {
  status: 'EMAIL_CONFIRMATION_REQUEST_ACCEPTED';
  message: string;
};
