# user-management — API 계약

> 상태: **작업 가설**. 구현 후 팀장 통합 단계에서 확정한다. 단, 동일 이메일 연결, OAuth intent,
> 세션 동기화 책임, 서버/BFF 쿠키 방식은 2026-08-25 user-management **DECISION**으로 잠갔다.
> 2026-08-26에는 8월 27일 구현 범위에 맞춰 가입 intent 저장 책임과 실제 Supabase SDK가 표현 가능한
> Refresh·Access 검증·세션 폐기 포트 계약을 정합화했다.
> **회원 탈퇴 절은 PROVISIONAL / TEAM REVIEW REQUIRED다.** ERD I-31/E-13을 구체화한 기능 담당자
> 제안일 뿐이며, 관련 도메인·팀장·개인정보 검토 전에는 구현 또는 배포 계약으로 사용할 수 없다.
> Base URL은 `/api/v1`이며, 아래의 `/auth`는 인증 도메인 네임스페이스다. 그 아래 리소스 경로는
> 복수 명사와 kebab-case를 쓴다. 회원 탈퇴 제안은 인증 세션 삭제가 아니라 현재 PactFive 사용자
> 리소스의 상태 전이이므로 `/users/current`를 사용한다.

## 공통 규약

- JSON 요청은 `Content-Type: application/json; charset=utf-8`를 사용한다.
- 인증이 필요한 요청은 `Authorization: Bearer <accessToken>`을 사용한다. 검증 후 미들웨어가
  `req.user = { userId, role }`을 주입한다.
- Access Token은 응답 본문으로 전달하고 브라우저 메모리에만 둔다. `localStorage`,
  `sessionStorage`, IndexedDB에 인증 토큰을 저장하지 않는다.
- Refresh Token 원문은 응답 본문·DB·로그에 넣지 않고
  `__Host-pactfiveRefreshToken` 쿠키로만 전달한다. 운영 속성은 `Secure; HttpOnly;
  SameSite=Strict; Path=/; Max-Age=<authSessionRemainingSeconds>`이며 `Domain`을 지정하지 않는다.
  `Max-Age`는 `auth_sessions.expires_at`까지 남은 시간이고 Refresh 때 수명을 임의 연장하지 않는다.
- 웹은 인증 API를 브라우저 기준 동일 출처의 `/api/v1`으로 호출하고 `credentials: 'include'`를
  사용한다. 가입·가입 복구·확인 메일 재전송·이메일 확인·로그인·OAuth 시작·Refresh·로그아웃처럼 세션 또는
  인증 쿠키를 만들거나 바꾸는 `POST | DELETE` 요청은 환경에 설정된 허용 Origin 목록의 각 완전한
  문자열과 정확히 비교한다. wildcard·접두사·접미사 비교는 허용하지 않으며, Origin이 누락되거나
  목록의 어느 값과도 일치하지 않으면 상태 변경 전에 거부한다. 공급자에서 돌아오는 OAuth `GET`
  콜백은 cross-site navigation이므로 Origin 대신 PKCE와 일회용 OAuth intent를 검증한다. 모든 인증
  응답에는 `Cache-Control: private, no-store`를 설정한다.
- 운영 배포는 웹 Origin에서 `/api`를 서버로 rewrite/BFF 하거나 웹·API를 같은 schemeful site의
  커스텀 도메인에 둔다. 서로 다른 `*.vercel.app` 프로젝트를 직접 연결하면 `SameSite=Strict`
  Refresh 쿠키 전제와 맞지 않으므로 허용하지 않는다. 직접 API host를 설정하는 방식을 채택하면
  base URL에 `/api`를 포함해 아래 `/v1/...` 클라이언트 경로가 서버 `/api/v1/...`와 정확히
  일치해야 한다. 다른 cross-site 쿠키 정책은 CSRF 경계를 다시 설계하는 팀 change request 없이는
  도입하지 않는다.
- 브라우저 Supabase Auth SDK의 세션 지속과 자동 갱신은 사용하지 않는다. 서버의
  `supabase-auth.adapter.ts`만 요청 단위 SDK 인스턴스로 명시적 로그인·PKCE code 교환·Refresh·
  현재 세션 로그아웃을 수행한다. 모든 클라이언트는 `autoRefreshToken: false`,
  `detectSessionInUrl: false`이며 전역 또는 파일 영속 저장소를 공유하지 않는다. 일반·Admin·Refresh·
  검증 작업은 `persistSession: false`다. OAuth 시작·교환만 Supabase SDK가 주입 PKCE 저장소를 사용하도록
  요청 단위 메모리 저장소에서 `true`이며, 이 저장소는 작업 종료 뒤 남지 않는다.
- Refresh Token fingerprint와 rotation 감사 정보는 ERD의 `auth_sessions`에 기록한다. 토큰 자체의
  발급·교환·검증·재사용 최종 판정과 공급자 세션 폐기는 Supabase Auth가 담당한다.
- 모든 보호 API는 JWT 서명·만료와 앱 사용자를 검증한 뒤 JWT `session_id`와 같은
  `auth_sessions.provider_session_id` 행이 미폐기이고 `expires_at > now()`인지도 확인한다. 따라서
  공급자 JWT가 아직 만료되지 않았어도 앱 세션 로그아웃·폐기 직후에는 401로 차단한다.
- 앱 세션의 최초 절대 수명은 승인 제안값 7일이다. `AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800`으로
  두고 `expires_at`을 만들며 Refresh로 연장하지 않는다. 승인자가 다른 값을 선택하면 SPEC·이 계약·
  환경 변수 예시를 같은 변경으로 갱신한다.
- 오류 응답 형식은 다음과 같다.

  이 envelope는 user-management의 작업 계약이다. `docs/naming-convention.md`의 프로젝트 공통 오류
  형식이 확정되기 전에는 다른 기능의 전역 표준으로 간주하지 않으며, 공통화는 팀장과 관련 기능
  담당자의 change request 승인 뒤 별도 변경으로 수행한다.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "입력값을 확인해 주세요.",
    "details": [{ "field": "email", "reason": "must be a valid email" }]
  }
}
```

### 확정된 세션 동기화 책임

| 주체 | 책임 |
|---|---|
| controller | Refresh/OAuth intent 쿠키 읽기·설정·삭제와 HTTP 응답 |
| `AuthSessionService` | 공급자 호출, 사용자 검사, `auth_sessions` 변경 순서와 실패 보상의 유일한 조정자 |
| `AuthSessionRepository` | `auth_sessions` 생성·조건부 rotation·폐기 |
| `RegistrationIntentRepository` | 앱 소유 가입 이름·역할·`returnTo` 저장, UUID/email 조회, `authUserId + nonce` 조건부 제거 |
| `supabase-auth.adapter.ts` | Supabase SDK 호출과 공급자 결과·오류의 도메인 타입 변환 |
| 브라우저 | Access Token 메모리 보관, 같은 탭 인증 mutation 직렬화, epoch별 Refresh single-flight와 로그아웃 epoch. Refresh Token·Supabase 세션은 소유하지 않음 |
| 보호 API 인증 미들웨어 | composition root가 주입한 `AccessTokenVerifier`로 공급자 토큰과 활성 로컬 세션을 모두 검증하고 `{ userId, role }`만 주입. 다른 기능은 Supabase SDK나 Refresh Token을 직접 참조하지 않음 |

ADR-0007의 독립 배포 구조에서 필드 계약 정본은 이 `api-contract.md`다. 통합 앱의 TypeScript
사본 중에는 `app/server` DTO를 기준으로 두고 `app/web`에는 실제 소비 필드만 임시로 중복한다.
요청·응답 필드가 바뀌면 서버·웹 DTO를 같은 변경에서 함께 갱신한다. 공용 타입 패키지는 불일치가
반복될 때 change request로 재검토한다.

이메일 가입 요청은 Confirm Email 활성화로 공급자 세션이 발급되지 않으므로 `users`·`auth_sessions`를
만들지 않고 Refresh 쿠키·Access Token을 반환하지 않는다. 이메일 확인 완료·로그인·OAuth 콜백은
Supabase 세션 발급, 앱 사용자 검사, `auth_sessions` 생성이 모두 성공한 뒤에만 토큰을 노출한다.
앱 검사나 DB 기록이 실패하면 공급자 현재 세션을 폐기하고 쿠키를 설정하지 않는다. Refresh는 공급자
교환과 `auth_sessions`의 원자적 조건부 갱신이 모두 성공한 뒤에만 새 쿠키를 설정한다.

팀장 통합 전 ERD에는 `users.auth_user_id uuid UNIQUE NOT NULL`과 `auth_sessions.provider_session_id
uuid`를 추가해야 한다. 후자는 활성 행에서 필수이고 값이 있는 전체 행에서 UNIQUE다. 과거 폐기 감사행은
NULL을 허용한다. 전자는 Supabase `auth.users.id`, 후자는 JWT `session_id`와의 안정적인 매핑 정본이다.

### 개발용 Mock 인증 계약

실제 Supabase 연동 전 Mock/test 어댑터는 아래 고정 문자열을 정확히 일치 비교해 최소 인증 컨텍스트를
만든다. 두 값은 JWT나 운영 비밀이 아니다.

| Authorization | 인증 컨텍스트 |
|---|---|
| `Bearer pactfive-mock-client-01` | `{ userId: 'usr_00000000000000000000000001', role: 'CLIENT' }` |
| `Bearer pactfive-mock-freelancer-01` | `{ userId: 'usr_00000000000000000000000002', role: 'FREELANCER' }` |

Mock/test 환경에서만 허용한다. Supabase 어댑터 또는 배포 환경에서는 항상 거부하고 Authorization
원문을 로그에 남기지 않는다. 이 계약은 Q-02 Mock 연동용이며 실제 인증 구현 완료를 뜻하지 않는다.

## POST /api/v1/auth/registrations

이메일 계정을 만들고 확인 메일 발송을 요청한다. 운영 환경은 Supabase Confirm Email을 필수로
사용하므로 이 요청만으로 로그인 세션을 만들지 않는다.

요청:

```json
{
  "email": "user@example.com",
  "password": "string",
  "name": "홍길동",
  "role": "CLIENT",
  "returnTo": "/projects/new"
}
```

응답 202 (`Set-Cookie`와 Access/Refresh Token 없음):

```json
{
  "status": "EMAIL_VERIFICATION_REQUIRED",
  "message": "가입 가능한 경우 입력한 이메일로 확인 안내를 보냈습니다."
}
```

Supabase `signUp` 결과의 `session`은 반드시 `null`이어야 한다. 서버는 공급자 사용자와 PactFive
가입 정보를 아래 `EmailRegistrationIntent`로 연결해 두되 `users`, `auth_sessions`를 만들거나
`last_login_at`을 갱신하지 않는다. 공급자가 세션을 반환하면 Confirm Email 설정 오류로 보고 그
세션을 폐기한 뒤 503으로 종료한다.

```ts
type EmailRegistrationIntent = {
  nonce: string;
  authUserId: string;
  email: string;
  name: string;
  role: UserRole;
  returnTo: string;
  issuedAt: string;
  expiresAt: string;
  recoveryExpiresAt: string;
};
```

intent TTL은 발급 또는 정상 재전송 시점부터 24시간이다. 확인 메일 token/OTP 만료보다 길게 두어
공급자 확인 직후 앱 DB가 일시 실패해도 다음 로그인에서 복구할 시간을 확보한다. 한 공급자 사용자에는
최신 nonce 한 건만 유효하다. `authUserId`는 `signUp`이 반환한 Supabase 사용자 UUID로 서버가 intent를
봉인할 때 넣는다. `recoveryProofExpiresAt`은 발급·정상 재전송부터 30일이며, 24시간 TTL이 지난 뒤에도
“PactFive가 시작한 가입”임을 증명하는 용도로만 쓴다. 만료 intent의 이름·역할·`returnTo`는 권한
근거로 재사용하지 않는다. 신규 가입 요청에서 기존 **미확인** 공급자 계정에 앱 사용자가 없고 기존
intent가 만료됐다면 새 요청의 전체 이름·역할·`returnTo`로 intent를 교체할 수 있다. 확인된 계정이나
이미 존재하는 앱 사용자의 정보는 가입 요청으로 바꾸지 않는다.

`signUp`이 사용자 UUID를 반환하면 `AuthSessionService`가 위 값을 PactFive 애플리케이션의
`RegistrationIntentRepository`에 저장한다. 공급자 `app_metadata`나 Admin `listUsers` 전체 순회는
가입 intent 저장·조회 경계로 사용하지 않는다. 공개 `signUp` 응답의 `identities`는 기존 미확인
계정에도 존재할 수 있어 신규 생성·소유권 증거로 신뢰하지 않는다. 모든 sessionless 결과에서 같은
비밀번호로 미확인 계정 소유권을 재검증한다. 공급자가 신규 생성을 신뢰성 있게 증명한 경우에만 저장
실패 시 보상 삭제하고, live Supabase처럼 증명할 수 없으면 토큰·앱 사용자 없이 남겨 정상 재접수로
복구한다. 확인 링크의 token hash와 intent 원문은 API 응답에
반환하지 않는다. 일반 `user_metadata.name`·`user_metadata.role`은
사용자가 수정할 수 있으므로 권한·역할 정본으로 신뢰하지 않는다. 이메일 확인 때 공급자가 검증한
이메일·Supabase 사용자 UUID와 저장된 intent의 `email`·`authUserId`, 만료, nonce를 모두 검사하고
일치한 intent의 이름·역할과 다시 검증한 `returnTo`만 가입 완료에 사용한다. 제거는
`authUserId + nonce`가 일치하는 최신 행에만 적용한다. 직접 Supabase `signUp`을 호출해 PactFive 앱
저장소에 대응하는 intent가 없는 사용자는 자기복구 endpoint로도
PactFive 가입을 완료할 수 없다. 이런 계정은 자동 생성하지 않고 감사 가능한 수동 지원 절차로 보낸다.

형식이 유효한 요청은 신규 이메일, 기존 확인 계정, 확인 대기 계정 모두 같은 202 본문을 반환한다.
기존 계정의 이름·역할·비밀번호를 바꾸지 않으며, 이 규칙은 가입 API를 이메일 존재 여부 확인
수단으로 쓰지 못하게 한다. 실제 중복 생성은 `users`의 활성 이메일 유일성 규칙으로 차단한다.

에러:

- 422 `VALIDATION_ERROR` — 이메일 형식, 비밀번호 정책, 이름 또는 역할 값이 유효하지 않다.
- 422 `UNSAFE_RETURN_TO` — `returnTo`가 OAuth 시작과 같은 내부 경로 허용 규칙을 통과하지 못한다.
- 429 `AUTH_RATE_LIMITED` — Supabase의 가입·이메일 발송 제한을 초과했다. 가능하면 `Retry-After`를
  함께 반환하되 계정 존재 여부는 드러내지 않는다.
- 503 `AUTH_CONFIGURATION_INVALID` — Confirm Email이 꺼져 공급자가 가입 즉시 세션을 반환했거나
  이메일 확인 링크 설정이 BFF 계약과 맞지 않는다. 반환된 공급자 세션은 폐기한다.
- 503 `AUTH_REGISTRATION_SYNC_FAILED` — 미확인 공급자 사용자에 앱 소유 intent를 연결하지 못했다.
  신뢰 가능한 신규 생성 신호가 있는 경우에만 보상 삭제하고, 그렇지 않으면 재접수 가능한 미확인
  상태로 남긴다. 어느 경우에도 토큰·쿠키를 반환하지 않는다.
- 503 `AUTH_PROVIDER_UNAVAILABLE` — Supabase Auth 또는 이메일 발송 계층에 연결할 수 없다.

## POST /api/v1/auth/email-confirmation-requests

가입 확인 메일 재전송을 요청한다.

요청:

```json
{ "email": "user@example.com" }
```

응답 202:

```json
{
  "status": "EMAIL_CONFIRMATION_REQUEST_ACCEPTED",
  "message": "확인 가능한 계정이면 이메일을 다시 전송합니다."
}
```

존재하지 않는 이메일, 이미 확인된 이메일, 확인 대기 이메일 모두 같은 202 본문을 반환한다.
어댑터는 유효한 intent가 있는 확인 대기 계정에만 nonce와 24시간 만료를 회전한 뒤 Supabase signup
재전송을 요청한다. intent가 없거나 이미 만료됐다면 이메일만으로 이름·역할·`returnTo`를 추측하거나
복원하지 않고 같은 202로 끝내며, 사용자는 전체 가입 폼을 다시 제출해야 한다. 공급자 원문 응답으로
계정 상태를 노출하지 않는다.

에러:

- 422 `VALIDATION_ERROR` — 이메일 형식이 유효하지 않다.
- 429 `EMAIL_CONFIRMATION_RATE_LIMITED` — 이메일 발송 제한을 초과했다. 가능하면 `Retry-After`를
  함께 반환한다.
- 503 `EMAIL_DELIVERY_NOT_CONFIGURED` — Email provider 또는 SMTP 발송 설정이 준비되지 않았다.
- 503 `AUTH_PROVIDER_UNAVAILABLE` — Supabase Auth에 연결할 수 없다.

## POST /api/v1/auth/email-confirmations

확인 메일을 연 사용자가 화면의 확인 버튼을 눌렀을 때 Supabase 일회용 token hash를 검증하고
PactFive 사용자와 세션을 만든다. 이메일 보안 스캐너의 링크 사전 방문이 가입을 완료하지 않도록
메일 링크의 GET은 확인 화면만 열고, 이 POST만 상태를 변경한다.

요청:

```json
{ "tokenHash": "opaque" }
```

서버는 공급자 `type`을 항상 `email`로 고정해
`verifyOtp({ token_hash: tokenHash, type: 'email' })`를 호출한다. 요청 쿼리나 본문의 임의 `type`은
받지 않는다. 요청의 Origin을 정확히 비교하고, 이미 유효한 PactFive Refresh 쿠키가 있으면 token
hash를 소비하기 전에 `409 AUTH_CONTEXT_CONFLICT`로 거부한다.

응답 200 (`Set-Cookie: __Host-pactfiveRefreshToken=...; Secure; HttpOnly; SameSite=Strict;
Path=/; Max-Age=<authSessionRemainingSeconds>`과 `Cache-Control: private, no-store` 포함):

```json
{
  "accessToken": "string",
  "accessTokenExpiresAt": "2026-08-25T12:00:00Z",
  "returnTo": "/projects/new",
  "user": {
    "userId": "usr_01H8X...",
    "email": "user@example.com",
    "name": "홍길동",
    "role": "CLIENT",
    "profileImageUrl": null
  }
}
```

공급자 확인 성공, 앱 저장소의 `EmailRegistrationIntent` 검증, `auth_user_id`가 같은 `users` 생성 또는
멱등 일치 검사, `auth_sessions` 생성이 모두 끝난 뒤에만 토큰과 쿠키를 노출한다. 앱 반영이 실패하면
공급자 현재 세션을 폐기하고 쿠키를 설정하지 않는다. 확인은 성공했지만 앱 반영이 실패한 경우에도
저장된 intent를 즉시 지우지 않는다. 다음 이메일 로그인에서 검증된 공급자 이메일과 아직 유효한
intent를 다시 확인해 `users`·`auth_sessions` 생성을 멱등 완료한 뒤에만 intent를 제거한다. 이미 확인된
사용자의 일반 로그인은 이 endpoint가 아니라 `POST /auth/sessions`를 사용한다.

에러:

- 400 `EMAIL_CONFIRMATION_INVALID` — token hash가 누락됐거나 형식이 유효하지 않다.
- 410 `EMAIL_CONFIRMATION_EXPIRED` — token hash가 만료됐거나 이미 소비됐다. 두 경우 모두 같은
  사용자 메시지를 사용한다.
- 409 `AUTH_CONTEXT_CONFLICT` — 이미 로그인된 브라우저에서 다른 가입 확인을 시도했다. token hash를
  소비하지 않는다.
- 409 `REGISTRATION_COMPLETION_REQUIRED` — 공급자 이메일 확인은 성공했지만 PactFive의 대응 가입
  intent가 없거나 24시간 TTL이 지났다. 공급자 현재 세션을 폐기하고 Access/Refresh Token이나 복구
  쿠키를 반환하지 않는다. 사용자는 `/sign-up`에서 다시 가입을 시작하거나, 이후 정상 로그인에서
  검증된 recovery proof가 있을 때만 발급되는 가입 복구 쿠키 경로를 사용한다.
- 403 `EMAIL_CONFIRMATION_NOT_AVAILABLE` — 아직 유효한 PactFive 가입 intent는 있지만 탈퇴 사용자,
  공급자 UUID 또는 활성 이메일과 충돌해 확인을 완료할 수 없다. 계정 상태를 세분화해 노출하지 않는다.
- 429 `AUTH_RATE_LIMITED` — 이메일 확인 시도 제한을 초과했다.
- 503 `AUTH_SESSION_SYNC_FAILED` — 공급자 확인 뒤 앱 사용자·`auth_sessions` 반영에 실패했다.
- 503 `AUTH_PROVIDER_UNAVAILABLE` — Supabase Auth에 연결할 수 없다.

Supabase Confirm signup 템플릿은 `{{ .ConfirmationURL }}`의 세션 fragment 흐름을 그대로 쓰지 않고
`{{ .SiteURL }}/auth/confirm#tokenHash={{ .TokenHash }}` 형태의 앱 소유 확인 화면으로 연결한다. fragment는
GET 요청과 서버 access log로 전송되지 않는다. 화면은 `Referrer-Policy: no-referrer`,
`Cache-Control: no-store`를 사용하고 제3자 리소스를 불러오지 않으며, token hash를 메모리로 읽은
즉시 `history.replaceState`로 주소에서 제거하고 브라우저 저장소·로그·분석 도구에 남기지 않는다.
페이지 로드만으로 검증하지 않고 화면의 명시적 확인 동작이 위 POST를 호출한다. Site URL과
`/auth/confirm`은 Supabase 허용 Redirect URL과 실제 웹 라우트가 준비된 뒤 템플릿에 반영한다.

## POST /api/v1/auth/sessions

이메일과 비밀번호로 로그인한다.

요청:

```json
{
  "email": "user@example.com",
  "password": "string",
  "deviceLabel": "Chrome on Windows",
  "returnTo": "/projects/new"
}
```

`returnTo`를 생략하면 `/`를 사용한다. 값이 있으면 OAuth 시작과 같은 내부 경로 허용 규칙으로
검증하며 로그인 성공 응답에도 서버가 확정한 안전한 경로만 반환한다.

이미 유효한 PactFive Refresh 쿠키가 있으면 공급자 로그인을 호출하기 전에
`409 AUTH_CONTEXT_CONFLICT`로 거부한다. MVP 계정 전환은 이메일·OAuth·가입 확인·가입 복구 모두
현재 세션을 로그아웃한 뒤 새 흐름으로만 시작한다.

Supabase 이메일 로그인이 성공했는데 대응하는 PactFive `users`가 없으면 앱 저장소의 intent를 확인한다.
24시간 intent가 유효하면 사용자·세션 생성을 멱등 완료한다. 24시간 TTL은 지났지만 저장된 intent의
`authUserId`·이메일·nonce가 맞고 30일 recovery proof 기간 안이면, 공급자 현재 세션을 폐기하고
10분짜리 `__Host-pactfiveRegistrationRecovery` 쿠키를 설정한 뒤 토큰 없이
`409 REGISTRATION_COMPLETION_REQUIRED`를 반환한다. 이 쿠키는 `version`, `authUserId`,
`normalizedEmail`, 원 intent nonce, 발급/만료 시각만 인증 암호화하며 공급자 Token을 담지 않는다.
속성은 `Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`, `Domain` 미지정이다. 사용자는 같은
이메일의 소유권을 비밀번호로 다시 증명하면서 이름·역할을 선택하는 아래 가입 복구 endpoint로
이동한다. PactFive 앱 저장소의 대응 intent가 없거나 복구 쿠키가 위변조됐거나 30일이 지났다면 공급자 세션을 폐기하고
`403 REGISTRATION_NOT_AVAILABLE`로 종료해 직접 Supabase 가입 우회를 막는다.

응답 200 (`Set-Cookie: __Host-pactfiveRefreshToken=...; Secure; HttpOnly; SameSite=Strict;
Path=/; Max-Age=<authSessionRemainingSeconds>` 포함):

```json
{
  "accessToken": "string",
  "accessTokenExpiresAt": "2026-08-25T12:00:00Z",
  "returnTo": "/projects/new",
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

- 401 `INVALID_CREDENTIALS` — 이메일/비밀번호 불일치, OAuth-only 계정의 이메일 로그인 시도,
  `deleted_at`이 있는 탈퇴 계정을 모두 `이메일 또는 비밀번호가 올바르지 않습니다.`로 응답한다.
  OAuth-only 판정은 Supabase의 일반 인증 실패를 사용하며 PactFive가 공급자 비밀번호 해시를 읽거나
  `users.password_hash`를 검사하지 않는다.
- 403 `EMAIL_VERIFICATION_REQUIRED` — 이메일과 비밀번호는 맞지만 Confirm Email이 완료되지 않았다.
  토큰·쿠키를 반환하지 않고 메일 재전송 동작을 안내한다.
- 409 `REGISTRATION_COMPLETION_REQUIRED` — 이메일 확인은 끝났지만 PactFive 사용자와 유효한 가입
  24시간 intent가 없다. 유효한 recovery proof가 있을 때만 10분 복구 쿠키를 설정하고 가입 복구
  화면을 안내한다.
- 409 `AUTH_CONTEXT_CONFLICT` — 이미 로그인된 브라우저에서 다른 이메일 로그인을 시도했다.
  공급자 자격 증명을 소비하거나 기존 역할·세션을 바꾸지 않는다.
- 403 `REGISTRATION_NOT_AVAILABLE` — PactFive 앱 저장소에 대응하는 가입 intent가 없거나 30일 recovery
  proof 기간이 지났다. 자동 가입을 허용하지 않는다.
- 422 `VALIDATION_ERROR` — 이메일 형식 또는 필수 필드가 유효하지 않다.
- 422 `UNSAFE_RETURN_TO` — 제공된 `returnTo`가 내부 경로 허용 규칙을 통과하지 못한다.
- 429 `AUTH_RATE_LIMITED` — 로그인 시도 제한을 초과했다.
- 503 `AUTH_SESSION_SYNC_FAILED` — 공급자 로그인 뒤 앱 사용자·`auth_sessions` 반영에 실패했다.
  공급자 현재 세션을 폐기하고 토큰·쿠키를 반환하지 않는다.
- 503 `AUTH_PROVIDER_UNAVAILABLE` — Supabase Auth에 연결할 수 없다.

## POST /api/v1/auth/registration-completions

이메일 확인은 완료됐지만 PactFive 사용자 생성에 실패했고 기존 24시간 intent도 만료된 고립 계정을
자기복구한다. 이메일·비밀번호를 다시 받아 Supabase 소유권을 증명하고, 로그인 endpoint가 발급한
`__Host-pactfiveRegistrationRecovery` 쿠키로 PactFive가 시작한 가입임을 별도로 증명한다. 오래된
intent에서 역할이나 이름을 추측하지 않는다.

요청:

```json
{
  "email": "user@example.com",
  "password": "string",
  "name": "홍길동",
  "role": "CLIENT",
  "deviceLabel": "Chrome on Windows",
  "returnTo": "/projects/new"
}
```

서버는 정확한 Origin과 10분 복구 쿠키의 인증 태그·nonce·만료를 확인한 뒤 Supabase 이메일 로그인을
수행하고, 공급자 이메일 확인 완료, 쿠키와 같은 `auth.users.id`·정규화 이메일, 앱 저장소 원 intent의
UUID·이메일·nonce와 30일 recovery proof 기간, 활성 이메일 충돌 부재, 해당 UUID의 PactFive 사용자 부재를 다시
검증한다. 모든 조건이 맞을 때만 `users`와 `auth_sessions`를 만들고 일반 로그인과 같은 200 응답·
Refresh 쿠키를 반환하며 복구 쿠키를 제거한다. 이미 앱 사용자가 있으면 이름·역할을 절대 바꾸지
않는다. 중간 실패에서는 공급자 세션을 폐기하고 일반 Refresh 쿠키를 반환하지 않는다.

에러:

- 401 `INVALID_CREDENTIALS` — 이메일 또는 비밀번호가 올바르지 않다.
- 403 `EMAIL_VERIFICATION_REQUIRED` — 공급자 이메일 확인이 완료되지 않았다.
- 403 `REGISTRATION_RECOVERY_INVALID` — 복구 쿠키 또는 앱 저장소 원 PactFive intent의 UUID·이메일·nonce가
  없거나 일치하지 않는다. 직접 Supabase 가입 계정은 이 오류로 자동 생성을 차단한다.
- 410 `REGISTRATION_RECOVERY_EXPIRED` — 10분 복구 쿠키 또는 30일 recovery proof 기간이 끝났다.
- 409 `REGISTRATION_NOT_AVAILABLE` — 앱 사용자가 이미 있거나 탈퇴·이메일·UUID 충돌로 복구할 수 없다.
  세부 계정 상태는 노출하지 않는다.
- 409 `AUTH_CONTEXT_CONFLICT` — 이미 로그인된 브라우저에서 가입 복구로 계정을 전환하려 했다.
- 422 `VALIDATION_ERROR` — 이메일·비밀번호·이름·역할이 유효하지 않다.
- 422 `UNSAFE_RETURN_TO` — `returnTo`가 내부 경로 허용 규칙을 통과하지 못한다.
- 429 `AUTH_RATE_LIMITED` — 소유권 확인 시도 제한을 초과했다.
- 503 `AUTH_SESSION_SYNC_FAILED` — 공급자 로그인 뒤 사용자·세션 반영에 실패했다.
- 503 `AUTH_PROVIDER_UNAVAILABLE` — Supabase Auth에 연결할 수 없다.

성공과 `REGISTRATION_RECOVERY_INVALID | REGISTRATION_RECOVERY_EXPIRED |
REGISTRATION_NOT_AVAILABLE`에서는 복구 쿠키를 제거한다. 수정 가능한 401/422와 제한된 503 재시도에서는
원래 10분 만료 안에서만 쿠키를 유지한다.

## POST /api/v1/auth/oauth-authorizations

Google 또는 Kakao OAuth 시작 URL을 만든다. 첫 소셜 로그인 때 역할을 정할 수 있도록 `role`을
선택적으로 받으며, 기존 연동 계정에서는 이 값을 무시한다. 이미 유효한 PactFive Refresh 쿠키가
있는 브라우저에서는 계정 전환을 시작하지 않는다. MVP 계정 전환은 로그아웃 후 새 OAuth 흐름으로만
허용한다.

요청:

```json
{
  "oauthProvider": "GOOGLE",
  "role": "CLIENT",
  "returnTo": "/projects/new"
}
```

응답 200 (`Set-Cookie: __Host-pactfiveOAuthIntent=...; Secure; HttpOnly; SameSite=Lax;
Path=/; Max-Age=600`과 `Cache-Control: private, no-store` 포함):

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
- 409 `AUTH_CONTEXT_CONFLICT` — 이미 로그인된 브라우저에서 계정 전환을 시도했다.
- 503 `AUTH_PROVIDER_NOT_READY` — 요청한 공급자의 계정·키·리다이렉트 설정이 확인되지 않았다.

공급자 OAuth `state`와 PKCE는 Supabase가 소유한다. PactFive는 해당 `state`를 덮어쓰거나 역할·
`returnTo`를 넣지 않고, 아래 앱 전용 OAuth intent를 서버 전용 키로 인증 암호화해 HttpOnly 쿠키에
보관한다. 한 브라우저에서는 최신 시도 한 건만 유효하며 새 시작이 이전 intent를 대체한다.

```ts
type OAuthIntent = {
  version: 1;
  nonce: string;
  oauthProvider: OAuthProvider;
  role: UserRole | null;
  returnTo: string;
  providerFlowState: string;
  issuedAt: string;
  expiresAt: string;
};
```

`providerFlowState`는 Supabase SDK 2.112.4가 반환한 `flowId`와 그 flow에 귀속된 PKCE 저장소 snapshot을
묶은 code 교환용 불투명 상태다. PactFive는 verifier 생성·검증 규칙을 재구현하지 않는다. 시작 요청의
요청 단위 메모리 저장소에서 SDK가 만든 snapshot과 `flowId`를 암호화 OAuth intent 쿠키에 보존하고,
콜백 요청에서는 그 쿠키를 검증·복호화해 새 요청 단위 SDK 저장소에 snapshot을 복원한 뒤 같은
`flowId`로 code를 교환한다. `returnTo`는 한 번 URL decode한 뒤에도 단일 `/`로 시작하는 상대
경로여야 하고, scheme/host, `//`, 역슬래시, 제어문자, fragment는 거부한다. 현재 허용 목록은 `/`,
`/projects`, `/projects/new`, `/bookmarks`, `/profile` 및 `/projects/{projectId}`(`prj_` 식별자)다.
목록 밖 값은 422로 거부한다. 웹 라우트 확정 시 이 목록도 함께 검토한다.
콜백에서도 intent의 `returnTo`를 같은 목록으로 다시 검증하며, 그 사이 목록에서 제외됐다면 외부
URL을 사용하지 않고 `/`로 복귀한다.

## GET /api/v1/auth/oauth-callbacks

Supabase가 전달한 일회용 authorization code를 OAuth intent의 PKCE 상태로 교환한다. 성공하면
앱의 활성 `users`를 확인하고 세션을 만든 뒤 intent에 보관한 안전한 `returnTo`로 이동한다.

쿼리 예:

```text
?code=opaque
```

응답 302: `Location: /projects/new`와 `__Host-pactfiveRefreshToken`을 설정하고
`__Host-pactfiveOAuthIntent`를 삭제한다. Access Token을 URL에 넣지 않으며, 이동한 앱은 초기
세션 복원 때 Refresh API를 호출해 Access Token을 메모리에 받는다.

에러:

- 400 `OAUTH_CALLBACK_INVALID` — code가 없거나 공급자가 callback을 거부했다.
- 400 `OAUTH_INTENT_INVALID` — intent 쿠키 누락, 복호화·nonce·10분 만료·공급자/PKCE 상태 검증에
  실패했다.
- 403 `OAUTH_ACCOUNT_NOT_AVAILABLE` — 탈퇴 계정, 연동 충돌, 검증된 이메일 누락 또는 신규 계정의
  역할 누락. 모두 `소셜 로그인을 완료할 수 없습니다.`로 통일한다.
- 503 `AUTH_SESSION_SYNC_FAILED` — 공급자 code 교환 뒤 앱 사용자·`auth_sessions` 반영에 실패했다.
  공급자 현재 세션을 폐기하고 Refresh 쿠키를 설정하지 않는다.
- 503 `AUTH_PROVIDER_NOT_READY` — 해당 Google/Kakao 연동 설정이 준비되지 않았다.

콜백은 성공·실패 모두 OAuth intent 쿠키를 삭제한다. 오류 때는 access/refresh token을 발급하지
않는다. 브라우저 UX에서는 동일 코드를 로그인 화면의 일반 오류 문구로 매핑하되 공급자 원문 오류나
계정 존재 여부는 쿼리 문자열에 싣지 않는다.

동일 이메일 연결은 다음 순서로 판정한다.

1. 콜백의 Supabase 사용자 UUID와 같은 `users.auth_user_id`가 있으면 해당 활성 사용자를 쓴다.
   Supabase가 같은 UUID에 연결한 Google·Kakao identity는 같은 사용자로 취급하고 역할을 바꾸지 않는다.
2. 정상 런타임에서는 모든 활성 사용자가 가입 시점부터 `auth_user_id`를 가져야 한다. 과거 행의 값이
   비어 있다면 OAuth 콜백에서 즉석 연결하지 않고, 승인된 일회성 마이그레이션에서 검증된 이메일로
   조건부 backfill한 뒤 `NOT NULL`로 잠근다.
3. 같은 이메일 행이 다른 `auth_user_id`와 연결됐거나 이메일 누락·미검증·탈퇴 충돌이면 일반
   오류로 거부하고 공급자 현재 세션을 폐기한다.
4. 활성 사용자가 없으면 intent의 역할이 있을 때만 신규 사용자를 만든다. 역할이 없으면 계정을
   만들지 않고 일반 오류로 종료한다.

앱이 이메일 문자열만으로 Supabase identity를 수동 연결하거나 `linkIdentity` API를 노출하지 않는다.
다른 이메일 계정의 수동 병합은 MVP 범위 밖이다. 현재 ERD의 `oauth_provider`·`oauth_subject`는
Supabase 사용자 매핑 정본으로 사용하지 않으며, 첫 가입 출처로 유지할지는 팀장 ERD 변경에서 정한다.

## POST /api/v1/auth/sessions/refresh

`__Host-pactfiveRefreshToken`의 Refresh Token을 서버가 Supabase Auth에서 교환하고 rotation한다.
요청 본문은 없다.

응답 200 (`Set-Cookie`로 `__Host-pactfiveRefreshToken`과 남은 `Max-Age` 교체):

```json
{
  "accessToken": "string",
  "accessTokenExpiresAt": "2026-08-25T13:00:00Z"
}
```

에러:

- 401 `AUTH_SESSION_INVALID` — 쿠키 누락, 만료, 폐기, 공급자 최종 거부 또는 탈퇴 계정. 모두
  `로그인 세션이 유효하지 않습니다.`로 통일하고 쿠키를 제거한다.
- 503 `AUTH_SESSION_SYNC_FAILED` — 공급자 교환은 성공했지만 `auth_sessions`의 조건부 갱신에
  실패했다. 새 쿠키를 설정하지 않으며 다음 요청에서 공급자의 parent-token 복구로 재조정한다.
- 503 `AUTH_PROVIDER_UNAVAILABLE` — Supabase Auth timeout/5xx. DB와 쿠키를 바꾸지 않고 자체
  토큰도 만들지 않는다.

서버는 쿠키 원문을 서버 전용 키의 HMAC-SHA-256 fingerprint로 바꿔 활성
`refresh_token_hash` 또는 `previous_token_hash` 행을 찾는다. 공급자 성공 뒤 기대한 현재
fingerprint를 조건으로 `current → previous`, `new → current`를 원자적으로 반영한다.
`AuthProvider.refreshSession({ refreshToken, expectedProviderSessionId })`은 별도 `outcome`을 만들지
않고 `ProviderSession`을 반환하며, 어댑터는 JWT `session_id`가 기대값과 일치하는지 먼저 검증한다.
공급자가 반환한 Access Token의 `session_id`는 행의 `provider_session_id`와 반드시 일치해야 한다.
`previous_token_hash` 일치만으로 재사용을 판정하지 않는다. Supabase가 정상 reuse interval 또는
parent-token 복구로 성공하면, 서비스가 DB에서 찾은 `CURRENT | PREVIOUS` 후보와 반환된 Refresh Token
fingerprint를 비교한다. CURRENT 입력에 같은 fingerprint가 반환되면 touch, 새 fingerprint가 반환되면
CAS rotation하고, PREVIOUS 입력에는 반환값이 이미 저장된 CURRENT fingerprint일 때만 touch 후 현재
쿠키를 재발급한다. 다른 조합은 동기화 실패로 닫는다. 이 조건부 touch가 로그아웃/선행 rotation
때 실패하면 최신 세션 행을 ID로 다시 읽어 실제 폐기·만료는 401과 공급자 정리로, 정상 선행 rotation은
503 재조정으로 구분한다. 어댑터가
해당 공급자 세션에 상관 가능한 Supabase `refresh_token_already_used`를 받은 경우에만 해당 행을
`REUSE_DETECTED`로 폐기한다. `refresh_token_not_found`는 만료·폐기·불일치 범주의
`AUTH_SESSION_INVALID`로 처리하며 재사용 확정 근거로 쓰지 않는다.

## DELETE /api/v1/auth/sessions/current

현재 브라우저 세션을 멱등 로그아웃한다. `Authorization: Bearer <accessToken>`은 선택 사항이고
`__Host-pactfiveRefreshToken` 쿠키가 현재 세션 식별의 기본 입력이다. Access Token만 먼저 만료돼도
HttpOnly 쿠키 때문에 로그아웃이 막혀서는 안 된다.

서버는 허용 Origin을 먼저 정확히 검증한다. 통과하면 다음 순서로 처리한다.

1. Refresh Token fingerprint로 식별 가능한 활성 `auth_sessions`를
   `revoked_reason=LOGOUT`으로 조건부 폐기한다. 행이 없거나 이미 폐기됐어도 성공으로 수렴한다.
2. Bearer Token이 유효하고 쿠키 세션과 `provider_session_id`가 같으면 현재 Supabase 세션 폐기에
   `revokeSession({ kind: 'ACCESS_TOKEN', providerSessionId, accessToken })`을 사용한다. Bearer가
   누락·만료됐거나 두 세션이 다르면 자격 증명을 섞어 공급자를 호출하지 않고
   불일치만 감사한다. 서버가 쿠키 세션에 안전하게 연결된 공급자 자격 증명으로 폐기할 수 있으면
   `REFRESH_TOKEN` credential을 사용해 같은 `providerSessionId`인지 검증한 뒤 best effort로 수행한다.
3. Origin 검증 뒤의 모든 인증 결과에서 Refresh 쿠키를
   `Max-Age=0; Secure; HttpOnly; SameSite=Strict; Path=/`로 제거하고 OAuth intent·가입 복구 쿠키도
   함께 제거한다. 브라우저는 로그아웃 호출 즉시 인증 epoch를 증가시키고, 이전 epoch에서 늦게 끝난
   로그인·Restore·Refresh 결과를 메모리 토큰이나 인증 UI에 다시 게시하지 않는다.

응답 204: 본문 없음. 쿠키 누락, 알 수 없는 fingerprint, Bearer 누락·만료·불일치, 이미 로그아웃된
세션도 204로 통일해 계정·세션 존재 여부를 노출하지 않는다. 공급자 폐기 지연·실패도 로컬 결과를
되돌리지 않고 비밀값 없는 감사 기록과 제한된 재시도 대상으로 남긴다. 이후 모든 보호 API의 활성
세션 검사가 잔여 JWT를 즉시 차단한다.

에러:

- 403 `ORIGIN_NOT_ALLOWED` — Origin이 누락됐거나 설정된 허용 Origin 목록의 어느 완전한 문자열과도
  정확히 일치하지 않는다. 이 경우에는
  CSRF 로그아웃을 막기 위해 세션·쿠키를 바꾸지 않는다.
- 503 `AUTH_LOGOUT_SYNC_FAILED` — 로컬 `auth_sessions` 조회·폐기를 확정하지 못했다. 브라우저의
  메모리 컨텍스트와 세 인증 쿠키는 제거하지만 서버측 즉시 폐기는 보장하지 못하므로, 운영 구현은
  fingerprint 기반 durable revocation tombstone/outbox 또는 동등한 장애 복구 경계를 갖춰야 한다.

## DELETE /api/v1/users/current — PROVISIONAL / TEAM REVIEW REQUIRED

현재 로그인한 사용자의 PactFive 계정을 탈퇴 상태로 전이한다. 이 endpoint는 ERD I-31/E-13을
구체화한 **잠정안**이며 구현돼 있지 않다. 관리자 강제 탈퇴, 예약·철회, 화면 경로는 범위 밖이다.
관련 도메인의 blocker 상태표, 공유 transaction/lock, 재인증 발급 흐름, idempotency/outbox schema,
Supabase 계정 정리 방식과 개인정보 보존 정책이 승인되기 전에는 이 계약을 활성화하지 않는다.

### 요청과 사전 조건

```http
DELETE /api/v1/users/current HTTP/1.1
Authorization: Bearer <accessToken>
Cookie: __Host-pactfiveRefreshToken=<refreshToken>
Origin: https://<allowed-web-origin>
Idempotency-Key: 018f5a3c-7b11-4a73-9dd4-8c58865fd7d3
Content-Type: application/json; charset=utf-8
```

```json
{
  "confirmation": "WITHDRAW_ACCOUNT",
  "reauthenticationProof": "rpf_opaque_single_use_value"
}
```

- 최초 실행은 유효한 Bearer Token과, 그 JWT `session_id`와 같은 활성
  `auth_sessions.provider_session_id`를 가리키는 Refresh 쿠키를 모두 요구한다. 다른 세션의 두
  자격 증명을 섞거나 `deleted_at IS NOT NULL`인 사용자를 인증하지 않는다.
- 서버는 body나 idempotency 조회보다 먼저 `Origin`을 환경별 허용 목록의 완전한 문자열과 정확히
  비교한다. wildcard·접두사·접미사 비교, 누락된 Origin, 허용되지 않은 Origin은 어떤 사용자·세션·
  쿠키 상태도 바꾸지 않고 403으로 거부한다. 웹은 동일 출처 `/api/v1`과 `credentials: 'include'`를
  사용한다.
- `Idempotency-Key`는 클라이언트가 `crypto.randomUUID()`로 만든 canonical UUID v4를 제안한다.
  userId, email, 시간처럼 추측 가능한 값을 넣지 않는다. 서버는 원문이 아니라 서버 키 HMAC을
  보관한다.
- `confirmation`은 대소문자까지 `WITHDRAW_ACCOUNT`와 같아야 한다. 요청 body에 탈퇴 사유나
  개인정보를 추가하지 않는다.

### 재인증 proof — ASSUMPTION

`reauthenticationProof`는 서버가 인증·암호화한 불투명 값이며 발급 시점부터 5분 동안 한 번의 탈퇴
논리 시도에만 사용한다. 같은 시도의 exact response replay는 새 mutation이 아니므로 아래 제한 안에서
예외적으로 허용한다. proof는 최소한 `userId`, 현재 `providerSessionId`, `purpose=ACCOUNT_WITHDRAWAL`,
`Idempotency-Key` HMAC, `issuedAt`, `expiresAt`, nonce에 결속한다. 서버는 proof 원문이나 비밀번호
원문을 DB·애플리케이션 로그·분석 도구에 남기지 않고, 브라우저도 메모리에만 둔다.

비밀번호 계정은 Supabase를 통한 비밀번호 재검증, OAuth 계정은 연결된 Google/Kakao의 새 PKCE
왕복으로 proof를 얻는 방식을 제안한다. 단순히 기존 Access Token의 만료가 남았다는 사실은
재인증으로 인정하지 않는다. 비밀번호/OAuth별 proof 발급 endpoint, 공급자별 `prompt` 지원 차이,
복수 identity 중 허용할 수단, 5분 TTL은 **OPEN**이며 별도 계약 승인 전 이 DELETE endpoint를
구현하지 않는다. 실패 횟수는 사용자·세션·IP 기준으로 제한하되 원문 자격 증명을 감사 로그에 넣지
않는다.

### 처리 순서와 race 경계 — ASSUMPTION

1. Origin과 요청 형식을 검증한다. 성공 뒤 세션이 이미 폐기된 정확한 network retry만 예외적으로
   복구할 수 있도록, 서명된 proof와 key HMAC이 기존 성공 행과 같고 replay window 안인지 먼저
   확인한다. 세 값이 정확히 일치하면 저장한 202 응답을 그대로 반환한다. 일치하지 않으면 일반
   인증 절차로 진행하고, 삭제된 계정이나 폐기 세션의 존재 여부를 별도로 알려주지 않는다.
2. 최초 실행은 Bearer/Refresh의 사용자·공급자 세션 상관관계와 proof의 목적·대상·기한·key binding을
   검증한다.
3. 서버가 관리하는 withdrawal idempotency 행을 `(userId, keyHmac)`으로 잠그거나 생성한다. 요청
   fingerprint는 endpoint version, 정규화한 `confirmation`, proof HMAC으로 만들며 원문 proof를
   넣지 않는다. 같은 key의 다른 fingerprint는 커밋하지 않는다.
4. `users` 행 또는 팀이 승인한 사용자 advisory lock을 획득한다. 같은 PostgreSQL transaction
   context로 `AccountWithdrawalEligibilityPort`를 호출해 프로젝트·지원/협상·계약·결제·납품의 최신
   상태를 검사한다. 한 도메인이라도 조회에 실패하면 fail-closed 503이고 사용자 상태는 바꾸지 않는다.
5. blocker가 있으면 안전한 코드·개수·앱 내부 해결 경로만 담은 409 결과를 해당 시도의 멱등 결과로
   기록한다. 사용자가 상태를 해결한 뒤에는 새 key로 다시 재인증하고 새 요청을 만든다.
6. eligible이면 같은 transaction에서 `users.deleted_at` 기록과 개인정보 마스킹, OAuth 필드 정리,
   모든 `auth_sessions`의 `USER_WITHDRAWN` 폐기, 사용 완료된 intent 정리, 저장할 202 응답과 공급자
   cleanup outbox 삽입을 수행한 뒤 한 번에 commit한다.
7. commit 뒤 Refresh/OAuth/가입복구 쿠키를 `Max-Age=0`으로 제거하고 브라우저는 인증 epoch를
   증가시켜 Access Token과 늦게 도착한 이전 인증 결과를 버린다. DB commit이 확정되지 않은 503에는
   성공 쿠키 삭제를 적용하지 않는다.

eligibility/provider DB의 일시 장애처럼 commit 전임이 확정된 503은 멱등 claim도 rollback하고 같은
key/proof 재전송을 허용한다. commit 결과가 불명확한 연결 장애에서는 새 요청을 시작하지 않고 같은
key/proof로 조회해, 저장된 성공이 있으면 202를 replay하고 없으면 transaction 전체를 다시 수행한다.

이 transaction 가정은 blocker 테이블이 같은 PostgreSQL에 있고 모든 blocker 생성 mutation이 같은
사용자 lock을 획득하며 `users.deleted_at IS NULL`을 다시 확인할 때만 안전하다. 이 쓰기 경로 중
하나라도 규약에 참여할 수 없으면 check 후 새 거래가 생기는 TOCTOU race가 남으므로 구현을 중단하고
cross-service reservation/saga를 별도로 설계한다. serialization/deadlock retry 때는 eligibility를
항상 다시 계산하고 이전 snapshot을 재사용하지 않는다. 양 당사자가 있는 지원·협상·계약·결제·납품
mutation은 관련 user lock을 정렬된 `userId` 순서로 모두 획득해 교착을 피한 뒤 각 사용자의
`deleted_at`을 확인하는 방식을 제안한다.

### blocker 응답 — ASSUMPTION

I-31은 엔티티 이름만 정하고 상태별 경계를 정하지 않았다. 다음 코드는 `spec.md`의 잠정 진리표와
1:1로 대응하며 각 소유 도메인의 승인이 필요하다.

| blocker code | 잠정 차단 상태 | 제안 해결 경로 |
|---|---|---|
| `OPEN_PROJECT` | 소유 프로젝트가 모집 예정/중이거나 거래가 `CONTRACT_PENDING|IN_PROGRESS` | `/projects/mine` |
| `PENDING_APPLICATION` | `PENDING` 또는 비종결 거래에 연결된 `ACCEPTED` 지원 | `/applications/mine` |
| `ACTIVE_NEGOTIATION` | 응답 전 `PROPOSED` 또는 비종결 거래의 수락 협상 | `/applications/mine` |
| `ACTIVE_CONTRACT` | `DRAFT|SIGNING` 또는 아직 완결되지 않은 `SIGNED` 계약 | `/contracts` |
| `UNSETTLED_PAYMENT` | `READY|PENDING|PAID` 결제 | `/payments` |
| `ACTIVE_DELIVERY` | `IN_PROGRESS|DELIVERY_REQUESTED` 납품 | `/deliveries` |

응답 409 예시:

```json
{
  "error": {
    "code": "ACCOUNT_WITHDRAWAL_BLOCKED",
    "message": "진행 중인 거래를 먼저 정리해 주세요.",
    "details": [
      {
        "code": "UNSETTLED_PAYMENT",
        "count": 1,
        "remediationPath": "/payments"
      }
    ]
  }
}
```

`details`에는 project/application/contract/payment/delivery ID, 제목, 금액, 상대 사용자 정보가 들어가지
않는다. 계정이 양 역할로 관계된 모든 행을 검사하고 현재 `users.role` 하나만으로 검사 범위를 줄이지
않는다.

### 성공, 멱등 재전송, 공급자 cleanup

응답 202 (`Cache-Control: private, no-store`):

```json
{
  "status": "WITHDRAWAL_ACCEPTED",
  "withdrawalRequestId": "uwd_01J7A...",
  "withdrawnAt": "2026-09-04T12:34:56.000Z"
}
```

202는 로컬 탈퇴와 전체 로컬 세션 폐기가 commit됐고 공급자 cleanup이 durable outbox에 접수됐다는
뜻이다. Supabase cleanup 완료를 뜻하지 않으며 응답에 email, provider identity, cleanup 내부 상태를
넣지 않는다.

- 같은 `userId + Idempotency-Key + request fingerprint`의 동시 요청은 행 lock/unique constraint로
  한 건만 실행하고 모두 같은 `withdrawalRequestId`, `withdrawnAt`, status code로 수렴한다.
- **제안값**: 멱등 행은 24시간 보존한다. 첫 성공 뒤 10분 replay window 동안에는 세션이 이미
  폐기됐더라도 같은 key와 같은 서명 proof를 제시한 정확한 요청에만 저장한 202를 재생한다. 이때
  최초 승인 때의 proof HMAC만 비교하므로 proof의 최초 실행용 5분 만료를 늘리거나 새 mutation 권한을
  만들지 않고 provider cleanup도 중복 enqueue하지 않는다. 10분 뒤, 다른 key, 다른 proof/body,
  다른 사용자로 탈퇴 계정에 접근하면 401로 수렴한다. exact replay에도 `Cache-Control: private,
  no-store`와 세 인증 쿠키의 삭제 header를 다시 보낸다.
- 같은 blocker 409 시도를 유효한 동일 proof와 key/fingerprint로 반복하면 보존된 409를 반환한다.
  blocker를 해소했거나 proof가 만료된 뒤에는 새 key에 결속된 새 proof로 새 시도를 시작해야 stale
  409를 재사용하지 않는다.
- 활성 상태의 동일 사용자가 같은 key를 다른 fingerprint에 재사용한 경우에만
  `IDEMPOTENCY_KEY_REUSED` 409를 노출한다. 인증되지 않은 호출에는 해당 key나 계정의 존재를
  알려주지 않는다. 24시간/10분 값과 저장소 schema는 팀 승인 전 **OPEN**이다.
- outbox worker는 `withdrawalRequestId`를 멱등키로 공급자의 모든 세션을 폐기하고 Supabase 사용자를
  삭제하거나 비활성화하며 연결 OAuth identity를 정리한다. payload에는 필요한 최소 `authUserId`만
  보호된 형태로 두고 Access/Refresh Token, email, OAuth subject는 넣지 않는다. 성공하면 민감 payload를
  파기한다. timeout/5xx는 지수 backoff로 재시도하고 한도 초과 시 dead-letter와 운영 경보를 남긴다.
  provider 실패는 이미 commit된 `deleted_at`과 로컬 세션 폐기를 되돌리거나 로그인 가능하게 만들지
  않는다.

### 개인정보와 재가입 — FACT + OPEN

E-13에 따라 성공 transaction에서 `name`, `profile_image_url`, `bio`를 중립 값/`NULL`로 마스킹하고
`oauth_provider`, `oauth_subject`는 `NULL`로 만든다. user-management가 소유한 미완료 가입·복구 intent와
불필요한 프로필 직접 식별자도 삭제 또는 가명처리한다. 계약 snapshot, 결제·정산, 납품, 리뷰 등
법적·거래 이력과 FK의 과거 `userId`는 임의 변경하지 않는다.

E-13은 email 원문을 감사 목적으로 남기고 `WHERE deleted_at IS NULL` 부분 UNIQUE로 같은 이메일의
새 가입을 허용한다. 재가입은 반드시 새 `userId`이며 과거 거래·리뷰·평점과 연결하지 않는다.
email 원문, `auth_user_id`, 계약 당사자 snapshot, PG `raw_response`, IP/user-agent의 보존 법적 근거,
접근 권한, 보존 기간과 최종 파기/가명처리는 개인정보·법무 승인 전 **OPEN**이다. 특히 현재 ERD에
새로 존재하는 `auth_user_id`를 탈퇴 시 유지·NULL·tombstone 중 어떻게 처리할지와 Supabase 사용자
삭제/비활성화 선택은 같은 결정으로 확정해야 한다.

### 에러

- 401 `AUTH_REQUIRED` — 최초 실행의 토큰/세션 누락·만료·불일치, 탈퇴 계정, replay window가 지난
  재전송 또는 exact replay로 검증되지 않은 호출. 모두 `로그인이 필요합니다.`로 통일한다.
- 403 `ORIGIN_NOT_ALLOWED` — Origin 누락 또는 exact allowlist 불일치. 상태·쿠키를 바꾸지 않는다.
- 403 `REAUTHENTICATION_REQUIRED` — proof 누락·변조·만료, purpose/user/session/key 불일치.
- 409 `ACCOUNT_WITHDRAWAL_BLOCKED` — 잠정 진리표의 진행 중 상태가 하나 이상 존재한다.
- 409 `IDEMPOTENCY_KEY_REUSED` — 인증된 동일 사용자가 같은 key를 다른 request fingerprint에 사용했다.
- 422 `VALIDATION_ERROR` — confirmation 또는 `Idempotency-Key` 형식 오류.
- 429 `AUTH_RATE_LIMITED` — 재인증 proof 검증 실패가 제한을 초과했다. `Retry-After`를 포함한다.
- 503 `ACCOUNT_WITHDRAWAL_ELIGIBILITY_UNAVAILABLE` — blocker 전체를 최신 상태로 확정하지 못했다.
- 503 `ACCOUNT_WITHDRAWAL_SYNC_FAILED` — 로컬 transaction의 commit을 확정하지 못했다. partial success를
  응답하지 않으며 클라이언트는 같은 key/proof로 재전송해 저장 결과를 확인한다.

provider cleanup 실패는 로컬 commit 뒤의 비동기 장애이므로 DELETE 응답을 503으로 바꾸거나 계정을
되살리지 않는다. 운영 경보/outbox 재처리 상태로만 다룬다.

## GET /api/v1/auth/contexts/current

현재 Bearer token의 PactFive 사용자 컨텍스트를 반환한다.

응답 200:

```json
{
  "userId": "usr_01H8X...",
  "email": "user@example.com",
  "name": "홍길동",
  "role": "CLIENT",
  "profileImageUrl": null,
  "authenticated": true,
  "accessTokenExpiresAt": "2026-08-27T01:00:00.000Z"
}
```

에러:

- 401 `AUTH_REQUIRED` — 토큰 누락·형식 오류·만료, 대응하는 활성 `auth_sessions` 부재·폐기,
  존재하지 않는 사용자 또는 탈퇴 계정.
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

type RegisterRequest = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  returnTo: string;
};
type RegisterInput = RegisterRequest;
type RegisterResponse = {
  status: 'EMAIL_VERIFICATION_REQUIRED';
  message: string;
};

type AuthenticatedSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  returnTo: string;
  user: UserAuthSummary;
};

type ConfirmEmailRequest = { tokenHash: string };
type ConfirmEmailInput = ConfirmEmailRequest;
type ConfirmEmailResponse = AuthenticatedSessionResponse;

type RequestEmailConfirmationRequest = { email: string };
type RequestEmailConfirmationInput = RequestEmailConfirmationRequest;
type RequestEmailConfirmationResponse = {
  status: 'EMAIL_CONFIRMATION_REQUEST_ACCEPTED';
  message: string;
};

type CreateAuthSessionRequest = {
  email: string;
  password: string;
  deviceLabel?: string;
  returnTo?: string;
};
type CreateAuthSessionInput = CreateAuthSessionRequest;
type CreateAuthSessionResponse = AuthenticatedSessionResponse;

type CompleteRegistrationRequest = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  deviceLabel?: string;
  returnTo: string;
};
type CompleteRegistrationInput = CompleteRegistrationRequest;
type CompleteRegistrationResponse = AuthenticatedSessionResponse;

type CreateOAuthAuthorizationRequest = {
  oauthProvider: OAuthProvider;
  role?: UserRole;
  returnTo: string;
};
type CreateOAuthAuthorizationInput = CreateOAuthAuthorizationRequest;
type CreateOAuthAuthorizationResponse = { authorizationUrl: string; expiresAt: string };

type RefreshAuthSessionInput = { refreshToken: string };
type RefreshAuthSessionResponse = { accessToken: string; accessTokenExpiresAt: string };

// PROVISIONAL / TEAM REVIEW REQUIRED — account withdrawal
type AccountWithdrawalBlockerCode =
  | 'OPEN_PROJECT'
  | 'PENDING_APPLICATION'
  | 'ACTIVE_NEGOTIATION'
  | 'ACTIVE_CONTRACT'
  | 'UNSETTLED_PAYMENT'
  | 'ACTIVE_DELIVERY';

type DeleteCurrentUserRequest = {
  confirmation: 'WITHDRAW_ACCOUNT';
  reauthenticationProof: string;
};
type DeleteCurrentUserResponse = {
  status: 'WITHDRAWAL_ACCEPTED';
  withdrawalRequestId: string;
  withdrawnAt: string;
};
type AccountWithdrawalBlocker = {
  code: AccountWithdrawalBlockerCode;
  count: number;
  remediationPath: string | null;
};
type AccountWithdrawalBlockedResponse = {
  error: {
    code: 'ACCOUNT_WITHDRAWAL_BLOCKED';
    message: string;
    details: AccountWithdrawalBlocker[];
  };
};

// 서버 내부에서 복호화·검증한 claim이며 HTTP 응답 DTO가 아니다.
type AccountWithdrawalReauthenticationClaims = {
  userId: string;
  providerSessionId: string;
  purpose: 'ACCOUNT_WITHDRAWAL';
  idempotencyKeyHmac: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
};

type GetCurrentAuthContextResponse = UserAuthSummary & {
  authenticated: true;
  accessTokenExpiresAt: string;
};

type ErrorDetail = { field: string; reason: string };
type ErrorResponse = {
  error: { code: string; message: string; details: ErrorDetail[] | null };
};
```

`RefreshAuthSessionInput.refreshToken`은 쿠키에서 controller가 읽어 service에 넘기는 서버 내부
입력이다. HTTP 요청 body DTO가 아니다.

`DeleteCurrentUserRequest.reauthenticationProof`는 불투명 값이고, `Idempotency-Key`는 body DTO가
아닌 필수 HTTP header다. 위 회원 탈퇴 DTO는 관련 review gate가 닫히기 전까지 배포 패키지에
복사하거나 공개 SDK로 생성하지 않는다.

## 회원 탈퇴 포트 제안 — PROVISIONAL / TEAM REVIEW REQUIRED

다음 signature는 책임 경계를 검토하기 위한 제안이며 현재 코드나 팀 공통 타입이 아니다.

```ts
declare const accountWithdrawalTransaction: unique symbol;
type AccountWithdrawalTransactionContext = {
  readonly [accountWithdrawalTransaction]: never;
};

type AccountWithdrawalEligibility = {
  eligible: boolean;
  blockers: AccountWithdrawalBlocker[];
  checkedAt: string;
};

interface AccountWithdrawalUnitOfWork {
  execute<T>(
    work: (transaction: AccountWithdrawalTransactionContext) => Promise<T>,
  ): Promise<T>;
}

interface AccountWithdrawalEligibilityPort {
  checkWithinTransaction(input: {
    userId: string;
    checkedAt: string;
    transaction: AccountWithdrawalTransactionContext;
  }): Promise<AccountWithdrawalEligibility>;
}

type AccountWithdrawalProviderCleanupCommand = {
  withdrawalRequestId: string;
  authUserId: string;
};

interface AccountWithdrawalProviderCleanupPort {
  cleanupAccount(
    command: AccountWithdrawalProviderCleanupCommand,
  ): Promise<'COMPLETED' | 'ALREADY_COMPLETED'>;
}
```

- `AccountWithdrawalEligibilityPort` 구현은 composition root에서 각 소유 도메인의 read adapter를
  조합한다. user-management service가 `projects`, `applications`, `agreements`/`negotiation_offer`,
  `contracts`, `payments`, `deliveries`를 직접 import하거나 임의 update하지 않는다.
- `eligible`은 정확히 `blockers.length === 0`과 같아야 한다. blocker code/count는 중복을 합치고,
  `checkedAt`은 서버 transaction 시각이다. 리소스 ID나 PII는 포트 반환과 로그에 넣지 않는다.
- `AccountWithdrawalUnitOfWork`의 opaque transaction은 사용자 마스킹·세션 폐기·멱등 결과·outbox와
  eligibility query를 같은 PostgreSQL transaction에 묶는다. 먼저 사용자 단위 lock을 잡고, blocker를
  만들 수 있는 모든 타 도메인 mutation도 같은 lock을 잡는 것이 승인 조건이다.
- 타 도메인이 별도 DB/서비스여서 같은 transaction과 lock을 공유할 수 있으면 위 signature를 그대로
  채택하지 않는다. 각 도메인의 withdrawal reservation을 먼저 확보하고 만료/해제/재시도를 다루는
  saga 계약을 승인한 뒤 API 계약을 다시 쓴다.
- `AccountWithdrawalProviderCleanupPort`는 outbox worker만 호출한다. 현재 요청의 credential 하나를
  폐기하는 `AuthProvider.revokeSession`과 달리 관리자 권한으로 공급자 전체 세션과 계정/identity를
  정리해야 하므로 기존 포트를 조용히 확장하지 않는다. Supabase 사용자를 삭제할지 비활성화할지는
  **OPEN**이다.
- outbox에는 `withdrawalRequestId`, 암호화하거나 동등하게 보호한 최소 `authUserId`, attempt 수,
  `nextAttemptAt`만 둔다. `(eventType, withdrawalRequestId)` unique로 중복 발행을 막고, worker 성공 뒤
  provider 식별 payload를 파기한다. outbox table/보존 기간/retry 한도/dead-letter 소유자는 팀 승인
  대상이다.

### 승인 전 OPEN

- `DELETE /users/current` body를 운영 proxy가 보존하는지 검증하고, 그렇지 않으면 같은 의미의
  `POST /account-withdrawal-requests` command resource로 바꿀지 결정한다.
- 비밀번호/OAuth 재인증 proof 발급 endpoint와 공급자별 강제 재인증 UX, 최초 실행 TTL 5분과 성공
  replay 10분을 승인한다.
- `spec.md`의 blocker 진리표와 모든 blocker 생성 mutation의 공유 lock 참여를 각 도메인이 승인한다.
- 단일 PostgreSQL unit-of-work를 쓸지 cross-service reservation/saga를 쓸지 결정한다.
- withdrawal idempotency/outbox schema, 24시간 보존, retry/dead-letter/운영 경보 소유자를 확정한다.
- Supabase 사용자 delete/disable 및 identity 정리 순서와 `auth_user_id` 처리 정책을 확정한다.
- E-13의 email 원문 보존을 포함한 개인정보별 근거·기간·접근 통제·최종 파기 정책을 승인한다.
- `docs/domain/erd.md` 변경 요약의 회원 탈퇴 E-12와 reference DBML/HTML의 E-13 번호 불일치를 팀 공통
  정본에서 해소한다. 이 기능 문서는 내용 근거로 I-31/E-13을 사용한다.

## Supabase 포트/어댑터 경계

```ts
type VerifiedAccessSession = Omit<ProviderSession, 'refreshToken'>;
type ProviderSessionCredential =
  | { kind: 'ACCESS_TOKEN'; providerSessionId: string; accessToken: string }
  | { kind: 'REFRESH_TOKEN'; providerSessionId: string; refreshToken: string };

interface AuthProvider {
  refreshSession(input: {
    refreshToken: string;
    expectedProviderSessionId: string;
  }): Promise<ProviderSession>;
  verifyAccessToken(accessToken: string): Promise<VerifiedAccessSession>;
  revokeSession(credential: ProviderSessionCredential): Promise<void>;
}
```

- controller/service는 `AuthProvider`를 정의한 `auth.port.ts`만 참조한다.
- `supabase-auth.adapter.ts`만 Supabase SDK와 공급자별 오류·세션 자료구조를 안다.
- 브라우저에는 Supabase Auth 세션 클라이언트를 두지 않는다. 서버 어댑터의 일반 요청용 SDK는
  `autoRefreshToken: false`, `persistSession: false`, `detectSessionInUrl: false`로 두고, OAuth에는
  SDK가 주입 저장소를 실제 사용하도록 `persistSession: true`인 요청 단위 메모리 저장소를 사용한다.
  이 값은 브라우저·파일·전역 세션 지속을 뜻하지 않으며 시작·교환 작업이 끝나면 폐기된다. Admin
  클라이언트는 일반 요청과 같은 비영속 옵션을 적용한다.
- 가입 intent는 `AuthProvider` 책임이 아니다. `AuthSessionService`가
  `RegistrationIntentRepository`에서 UUID/email로 조회하고 `authUserId + nonce` 조건으로 제거한다.
- `refreshSession`의 `expectedProviderSessionId`는 supplied Refresh Token이 다른 세션으로 바뀌는 것을
  차단한다. rotation·parent 복구 판정은 어댑터가 임의 `outcome`으로 추측하지 않고 서비스가 DB
  fingerprint와 반환된 `ProviderSession.refreshToken`을 비교해 결정한다.
- `verifyAccessToken`은 Refresh Token이 없는 `VerifiedAccessSession`만 반환한다. `revokeSession`은
  ACCESS 또는 REFRESH credential과 기대 `providerSessionId`의 상관관계를 확인한 뒤 해당 Supabase
  세션을 폐기하며 자격 증명 종류를 섞지 않는다.
- 구체 어댑터 연결은 composition root에서만 한다. Google/Kakao 키나 Supabase 키를 service,
  DTO, 응답, 로그에 넣지 않는다.
- PactFive service는 `users.deleted_at`, 역할, OAuth 연결 충돌과 안전한 `returnTo`를 판정한다.
  이메일 비밀번호 수단의 존재 여부는 Supabase 인증 결과를 사용하고 공급자 해시를 앱 규칙으로
  복제하지 않는다.
- `AuthSessionService`만 공급자 세션 결과와 `auth_sessions` 변경을 조정한다. `auth_sessions`는
  공급자 발급 토큰의 fingerprint·Refresh 허용·기기·rotation 감사 기록이지 자체 JWT 발급소나
  독립적인 재사용 판정기가 아니다.
- 로그인·가입 복구·갱신은 Supabase `auth.users.id`/JWT `session_id`와 각각
  `users.auth_user_id`/활성 `auth_sessions.provider_session_id`가 일치할 때만 성공한다. 로그아웃은
  Refresh fingerprint로 찾은 로컬 세션과 쿠키 제거를 우선하며, 유효한 Bearer의 `session_id`가 같은
  경우에만 공급자 폐기에 함께 사용한다. 두 매핑 필드는 현재 ERD에 없으므로 팀장 통합 전 스키마
  승인이 필요하다.
- ERD I-39의 매 요청 무조건 rotation과 I-40의 `previous_token_hash` 일치 즉시 폐기는 Supabase의
  정상 reuse interval·parent-token 복구와 충돌한다. 팀장 통합 전에 새 토큰 반환 때만 CAS rotation,
  해당 세션의 `refresh_token_already_used`일 때만 `REUSE_DETECTED`로 정본을 갱신해야 한다.
- Supabase가 소유한 비밀번호 해시는 PactFive DB로 복사하지 않고 로그인 분기에도 사용하지 않는다.
  ERD v1.5에서 사용되지 않는 `users.password_hash`를 제거하는 변경을 승인받으며, 그 전까지 해당
  필드를 새 구현의 의존성으로 추가하지 않는다.

2026-08-26 현재 8월 27일 범위의 `@supabase/supabase-js` 2.112.4 기반 live 어댑터 구현 초안과
`flowId`·PKCE SDK 저장소 snapshot의 시작→콜백 복원 결정적 fake-client 테스트를 완료했다. Supabase
대시보드 readback, 실제 Google/Kakao 브라우저 왕복과 Postgres 저장소 E2E는 계속 **OPEN**이며, 이
로컬 구현 초안을 라이브 통합 완료로 간주하지 않는다.

## 통합 전 미확정 — 교차 탭 인증 성공 경합

같은 탭의 로그인·OAuth 시작·Refresh·로그아웃은 브라우저의 공용 인증 mutation queue와 Refresh
single-flight를 사용하고, 이미 발급된 OAuth intent는 서버 저장소의 원자 nonce 소비로 한 흐름만
성공시킨다. 다만 서로 다른 탭에서 요청이 시작될 때 아직 Refresh/OAuth intent 쿠키가 없고 성공
응답이 교차 도착하는 경우는 요청 시점 쿠키만으로 원자화할 수 없다.

서버측 브라우저 흐름 잠금/세대 번호 또는 OAuth callback 결과의 same-site 2단계 확정 방식 중 하나를
ADR에서 승인하고 이 계약에 반영하기 전에는 live Supabase/Google/Kakao 어댑터를 활성화하지 않는다.
현재 Mock 결과는 이미 발급된 intent 이후 경합과 같은 탭 직렬화만 증명한다.

## 외부 계정·키 준비 상태 (구현 전 게이트)

2026-08-26 현재 저장소 문서만으로는 다음 항목이 **확인되지 않았다**. 실제 비밀값을 이 문서나
커밋에 기록하지 않고, 담당자가 대시보드에서 존재·활성 여부만 확인해야 한다.

| 대상 | 확인할 항목 | 현재 판정 |
|---|---|---|
| Supabase | 프로젝트 생성, Auth 활성화, 앱 URL/허용 redirect URL, 이메일 확인 정책, 서버·웹용 키 주입 | 일부 확인 — PactFive 프로젝트·DB 연결 정보는 담당자가 제공했으나 Auth 설정과 키 주입은 미검증 |
| Google | OAuth client 생성, consent screen, client ID/secret의 Supabase 등록, redirect URI 일치 | 일부 확인 — 계정·Cloud 프로젝트는 있으나 MFA에서 Credentials 확인 중단 |
| Kakao | 개발자 앱, REST API key/client secret, Supabase 등록, redirect URI, 사업자 전환과 이메일 동의 권한 | 일부 확인 — 앱의 비즈니스 인증 자료 업로드 완료, 심사 결과·로그인 provider·redirect 설정은 미검증 |
| 저장소/로컬 | 공개 키와 서버 비밀 키의 분리 주입, `.env.example` 변수명 | 확인 가능한 자격 증명 없음; `.env.example`도 비어 있음 |

셋 중 하나라도 미확인이면 해당 공급자를 `준비 완료`로 문서화하지 않는다. 특히 Kakao 이메일 동의는
사업자 상태에 의존하므로, 키가 존재한다는 사실만으로 준비 완료로 판정하지 않는다.
