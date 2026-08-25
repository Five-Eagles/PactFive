# user-management — API 계약

> 상태: **작업 가설**. 구현 후 팀장 통합 단계에서 확정한다. Base URL은 `/api/v1`이며, 아래의
> `/auth`는 인증 도메인 네임스페이스다. 그 아래 리소스 경로는 복수 명사와 kebab-case를 쓴다.

## 공통 규약

- JSON 요청은 `Content-Type: application/json; charset=utf-8`를 사용한다.
- 인증이 필요한 요청은 `Authorization: Bearer <accessToken>`을 사용한다. 검증 후 미들웨어가
  `req.user = { userId, role }`을 주입한다.
- access token은 응답 본문으로 전달한다. refresh token 원문은 응답 본문·DB·로그에 넣지 않고
  `pactfiveRefreshToken` HttpOnly·Secure·SameSite=Lax 쿠키로만 전달한다.
- refresh token 해시와 rotation 감사 정보는 ERD의 `auth_sessions`에 기록한다. 토큰 자체의 발급,
  교환, 검증과 공급자 세션 폐기는 Supabase Auth가 담당한다.
- 오류 응답 형식은 다음과 같다.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해 주세요.",
    "details": [{ "field": "email", "reason": "must be a valid email" }]
  }
}
```

## POST /api/v1/auth/registrations

이메일 계정을 만들고, Supabase가 발급한 세션을 PactFive 세션으로 연결한다.

요청:

```json
{
  "email": "user@example.com",
  "password": "string",
  "name": "홍길동",
  "role": "CLIENT"
}
```

응답 201 (`Set-Cookie: pactfiveRefreshToken=...` 포함):

```json
{
  "accessToken": "string",
  "accessTokenExpiresAt": "2026-08-25T12:00:00Z",
  "user": {
    "userId": "usr_01H8X...",
    "email": "user@example.com",
    "name": "홍길동",
    "role": "CLIENT",
    "profileImageUrl": null
  }
}
```

에러:

- 409 `REGISTRATION_NOT_AVAILABLE` — 이미 가입됐거나 기존 소셜 계정과 충돌한다. 두 경우 모두
  `해당 이메일로 가입을 완료할 수 없습니다.`로 통일한다.
- 422 `VALIDATION_ERROR` — 이메일 형식, 비밀번호 정책, 이름 또는 역할 값이 유효하지 않다.
- 503 `AUTH_PROVIDER_UNAVAILABLE` — Supabase 프로젝트 또는 이메일 인증 설정이 준비되지 않았다.

현재 응답은 **MVP에서 이메일 확인 없이 즉시 세션을 발급한다는 작업 가설**이다. Supabase의 이메일
확인 설정이 켜져 있다면 구현 전에 `202 EMAIL_VERIFICATION_REQUIRED` 응답을 계약에 추가해야 하며,
어댑터가 반환한 세션이 없는데 서버가 임의로 토큰을 만들면 안 된다.

## POST /api/v1/auth/sessions

이메일과 비밀번호로 로그인한다.

요청:

```json
{ "email": "user@example.com", "password": "string", "deviceLabel": "Chrome on Windows" }
```

응답 200 (`Set-Cookie: pactfiveRefreshToken=...` 포함):

```json
{
  "accessToken": "string",
  "accessTokenExpiresAt": "2026-08-25T12:00:00Z",
  "user": {
    "userId": "usr_01H8X...",
    "email": "user@example.com",
    "name": "홍길동",
    "role": "FREELANCER",
    "profileImageUrl": null
  }
}
```

에러:

- 401 `INVALID_CREDENTIALS` — 이메일/비밀번호 불일치, `deleted_at`이 있는 탈퇴 계정,
  이메일 로그인 수단이 없는 소셜 전용 계정(ERD의 `password_hash` 또는 구현 전 확정할 동등한
  앱 소유 판정 정보)을 모두
  `이메일 또는 비밀번호가 올바르지 않습니다.`로 응답한다.
- 422 `VALIDATION_ERROR` — 이메일 형식 또는 필수 필드가 유효하지 않다.
- 429 `AUTH_RATE_LIMITED` — 로그인 시도 제한을 초과했다.
- 503 `AUTH_PROVIDER_UNAVAILABLE` — Supabase Auth에 연결할 수 없다.

## POST /api/v1/auth/oauth-authorizations

Google 또는 Kakao OAuth 시작 URL을 만든다. 첫 소셜 로그인 때 역할을 정할 수 있도록 `role`을
선택적으로 받으며, 기존 연동 계정에서는 이 값을 무시한다.

요청:

```json
{
  "oauthProvider": "GOOGLE",
  "role": "CLIENT",
  "returnTo": "/projects/new"
}
```

응답 200:

```json
{
  "authorizationUrl": "https://external-provider.example/opaque",
  "expiresAt": "2026-08-25T11:10:00Z"
}
```

에러:

- 422 `VALIDATION_ERROR` — `oauthProvider`가 `GOOGLE | KAKAO`가 아니거나 `role`이
  `CLIENT | FREELANCER`가 아니다.
- 422 `UNSAFE_RETURN_TO` — `returnTo`가 아래 허용 규칙을 통과하지 못한다.
- 503 `AUTH_PROVIDER_NOT_READY` — 요청한 공급자의 계정·키·리다이렉트 설정이 확인되지 않았다.

`returnTo`는 서버가 서명한 OAuth state에 넣는다. 한 번 URL decode한 뒤에도 단일 `/`로 시작하는
상대 경로여야 하고, scheme/host, `//`, 역슬래시, 제어문자, fragment는 거부한다. 현재 허용 목록은
`/`, `/projects`, `/projects/new`, `/bookmarks`, `/profile` 및
`/projects/{projectId}`(`prj_` 식별자)다. 목록 밖 값은 `/`로 조용히 전달하지 않고 422로 거부한다.
웹 라우트 확정 시 이 목록도 함께 검토한다.

## GET /api/v1/auth/oauth-callbacks

Supabase가 전달한 authorization code와 서명된 state를 교환한다. 성공하면 앱의 활성 `users`를
확인하고 세션을 만든 뒤, state에 보관한 안전한 `returnTo`로 이동한다.

쿼리 예:

```text
?code=opaque&state=signed-opaque-state
```

응답 302: `Location: /projects/new`와 refresh cookie를 설정한다.

에러:

- 400 `OAUTH_CALLBACK_INVALID` — code가 없거나 공급자가 callback을 거부했다.
- 400 `OAUTH_STATE_INVALID` — state의 서명·만료·일회성 사용 검증에 실패했다.
- 403 `OAUTH_ACCOUNT_NOT_AVAILABLE` — 탈퇴 계정, 연동 충돌, 검증된 이메일 누락 또는 신규 계정의
  역할 누락. 모두 `소셜 로그인을 완료할 수 없습니다.`로 통일한다.
- 503 `AUTH_PROVIDER_NOT_READY` — 해당 Google/Kakao 연동 설정이 준비되지 않았다.

오류 때는 access/refresh token을 발급하지 않는다. 브라우저 UX에서는 동일 코드를 로그인 화면의
일반 오류 문구로 매핑하되 공급자 원문 오류나 계정 존재 여부는 쿼리 문자열에 싣지 않는다.

## POST /api/v1/auth/sessions/refresh

HttpOnly 쿠키의 refresh token을 Supabase Auth에서 교환하고 rotation한다. 요청 본문은 없다.

응답 200 (`Set-Cookie`로 새 refresh token 교체):

```json
{
  "accessToken": "string",
  "accessTokenExpiresAt": "2026-08-25T13:00:00Z"
}
```

에러:

- 401 `AUTH_SESSION_INVALID` — 쿠키 누락, 만료, 폐기, 공급자 거부, 탈퇴 계정 또는 이전 토큰 재사용.
  모두 `로그인 세션이 유효하지 않습니다.`로 통일하고 쿠키를 제거한다. 이전 토큰 재사용이면 해당
  `auth_sessions`를 `REUSE_DETECTED`로 폐기한다.
- 503 `AUTH_PROVIDER_UNAVAILABLE` — Supabase Auth에 연결할 수 없다. 이 경우 성공으로 가장해
  자체 토큰을 만들지 않는다.

## DELETE /api/v1/auth/sessions/current

현재 Supabase 세션과 대응하는 `auth_sessions`를 폐기(`revoked_reason=LOGOUT`)하고 refresh cookie를
제거한다. `Authorization: Bearer <accessToken>`이 필요하다.

응답 204: 본문 없음.

에러:

- 401 `AUTH_REQUIRED` — Bearer token이 없거나 형식·서명·만료가 유효하지 않다.

로컬 세션 폐기와 쿠키 제거가 끝난 뒤 공급자 폐기 응답이 지연돼도 로그아웃 결과를 되돌리지 않는다.

## GET /api/v1/auth/contexts/current

현재 Bearer token의 PactFive 사용자 컨텍스트를 반환한다.

응답 200:

```json
{
  "userId": "usr_01H8X...",
  "email": "user@example.com",
  "name": "홍길동",
  "role": "CLIENT",
  "profileImageUrl": null
}
```

에러:

- 401 `AUTH_REQUIRED` — 토큰 누락·형식 오류·만료·폐기, 존재하지 않는 사용자 또는 탈퇴 계정.
  모두 `로그인이 필요합니다.`로 통일한다.

## DTO

```ts
type UserRole = 'CLIENT' | 'FREELANCER';
type OAuthProvider = 'GOOGLE' | 'KAKAO';

type UserAuthSummary = {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  profileImageUrl: string | null;
};

type RegisterRequest = { email: string; password: string; name: string; role: UserRole };
type RegisterInput = RegisterRequest;
type RegisterResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: UserAuthSummary;
};

type CreateAuthSessionRequest = { email: string; password: string; deviceLabel?: string };
type CreateAuthSessionInput = CreateAuthSessionRequest;
type CreateAuthSessionResponse = RegisterResponse;

type CreateOAuthAuthorizationRequest = {
  oauthProvider: OAuthProvider;
  role?: UserRole;
  returnTo: string;
};
type CreateOAuthAuthorizationInput = CreateOAuthAuthorizationRequest;
type CreateOAuthAuthorizationResponse = { authorizationUrl: string; expiresAt: string };

type RefreshAuthSessionInput = { refreshToken: string };
type RefreshAuthSessionResponse = { accessToken: string; accessTokenExpiresAt: string };
type GetCurrentAuthContextResponse = UserAuthSummary;

type ErrorDetail = { field: string; reason: string };
type ErrorResponse = {
  error: { code: string; message: string; details: ErrorDetail[] | null };
};
```

`RefreshAuthSessionInput.refreshToken`은 쿠키에서 controller가 읽어 service에 넘기는 서버 내부
입력이다. HTTP 요청 body DTO가 아니다.

## Supabase 포트/어댑터 경계

- controller/service는 `AuthProvider`를 정의한 `auth.port.ts`만 참조한다.
- `supabase-auth.adapter.ts`만 Supabase SDK와 공급자별 오류·세션 자료구조를 안다.
- 구체 어댑터 연결은 composition root에서만 한다. Google/Kakao 키나 Supabase 키를 service,
  DTO, 응답, 로그에 넣지 않는다.
- PactFive service는 `users.deleted_at`, 역할, 소셜 전용 여부, OAuth 연결 충돌과 안전한
  `returnTo`를 판정한다. Supabase는 이 도메인 규칙을 대신 판정하지 않는다.
- `auth_sessions`는 공급자 발급 토큰의 해시·기기·rotation 감사 기록이지 자체 JWT 발급소가 아니다.
  Supabase가 필요한 rotation 신호를 제공하지 못하면 임의 구현하지 말고 ERD/계약을 함께 재검토한다.
- Supabase가 소유한 비밀번호 해시는 PactFive DB로 복사하지 않는다. ERD의
  `users.password_hash`와 소셜 전용 여부 판정을 Supabase 방식에 맞추는 방법은 구현 전에 ERD와
  함께 확정하며, 그 전까지 어댑터 내부 값을 임의로 영속화하지 않는다.

## 외부 계정·키 준비 상태 (구현 전 게이트)

2026-08-25 현재 저장소 문서만으로는 다음 항목이 **확인되지 않았다**. 실제 비밀값을 이 문서나
커밋에 기록하지 않고, 담당자가 대시보드에서 존재·활성 여부만 확인해야 한다.

| 대상 | 확인할 항목 | 현재 판정 |
|---|---|---|
| Supabase | 프로젝트 생성, Auth 활성화, 앱 URL/허용 redirect URL, 이메일 확인 정책, 서버·웹용 키 주입 | 미확인 — 대시보드 접근 미검증 |
| Google | OAuth client 생성, consent screen, client ID/secret의 Supabase 등록, redirect URI 일치 | 일부 확인 — 계정·Cloud 프로젝트는 있으나 MFA에서 Credentials 확인 중단 |
| Kakao | 개발자 앱, REST API key/client secret, Supabase 등록, redirect URI, 사업자 전환과 이메일 동의 권한 | 미확인 — 대시보드 로그인 미검증 |
| 저장소/로컬 | 공개 키와 서버 비밀 키의 분리 주입, `.env.example` 변수명 | 확인 가능한 자격 증명 없음; `.env.example`도 비어 있음 |

셋 중 하나라도 미확인이면 해당 공급자를 `준비 완료`로 문서화하지 않는다. 특히 Kakao 이메일 동의는
사업자 상태에 의존하므로, 키가 존재한다는 사실만으로 준비 완료로 판정하지 않는다.
