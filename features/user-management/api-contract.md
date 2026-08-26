# user-management — API 계약

> 상태: **작업 가설**. 구현 후 팀장 통합 단계에서 확정한다. 단, 동일 이메일 연결, OAuth intent,
> 세션 동기화 책임, 서버/BFF 쿠키 방식은 2026-08-25 user-management **DECISION**으로 잠갔다.
> Base URL은 `/api/v1`이며, 아래의 `/auth`는 인증 도메인 네임스페이스다. 그 아래 리소스 경로는
> 복수 명사와 kebab-case를 쓴다.

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
  인증 쿠키를 만들거나 바꾸는 동일 출처 `POST | DELETE` 요청은 허용 Origin을 문자열로 정확히
  비교하고, 누락되거나 다른 Origin이면 상태 변경 전에 거부한다. 공급자에서 돌아오는 OAuth `GET`
  콜백은 cross-site navigation이므로 Origin 대신 PKCE와 일회용 OAuth intent를 검증한다. 모든 인증
  응답에는 `Cache-Control: private, no-store`를 설정한다.
- 브라우저 Supabase Auth SDK의 세션 지속과 자동 갱신은 사용하지 않는다. 서버의
  `supabase-auth.adapter.ts`만 요청 단위 SDK 인스턴스로 명시적 로그인·PKCE code 교환·Refresh·
  현재 세션 로그아웃을 수행한다.
- Refresh Token fingerprint와 rotation 감사 정보는 ERD의 `auth_sessions`에 기록한다. 토큰 자체의
  발급·교환·검증·재사용 최종 판정과 공급자 세션 폐기는 Supabase Auth가 담당한다.
- 모든 보호 API는 JWT 서명·만료와 앱 사용자를 검증한 뒤 JWT `session_id`와 같은
  `auth_sessions.provider_session_id` 행이 미폐기이고 `expires_at > now()`인지도 확인한다. 따라서
  공급자 JWT가 아직 만료되지 않았어도 앱 세션 로그아웃·폐기 직후에는 401로 차단한다.
- 앱 세션의 최초 절대 수명은 승인 제안값 7일이다. `AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800`으로
  두고 `expires_at`을 만들며 Refresh로 연장하지 않는다. 승인자가 다른 값을 선택하면 SPEC·이 계약·
  환경 변수 예시를 같은 변경으로 갱신한다.
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

### 확정된 세션 동기화 책임

| 주체 | 책임 |
|---|---|
| controller | Refresh/OAuth intent 쿠키 읽기·설정·삭제와 HTTP 응답 |
| `AuthSessionService` | 공급자 호출, 사용자 검사, `auth_sessions` 변경 순서와 실패 보상의 유일한 조정자 |
| `AuthSessionRepository` | `auth_sessions` 생성·조건부 rotation·폐기 |
| `supabase-auth.adapter.ts` | Supabase SDK 호출과 공급자 결과·오류의 도메인 타입 변환 |
| 브라우저 | Access Token 메모리 보관, 같은 탭 인증 mutation 직렬화, epoch별 Refresh single-flight와 로그아웃 epoch. Refresh Token·Supabase 세션은 소유하지 않음 |

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
  version: 1;
  nonce: string;
  authUserId: string;
  normalizedEmail: string;
  name: string;
  role: UserRole;
  returnTo: string;
  issuedAt: string;
  expiresAt: string;
  recoveryProofExpiresAt: string;
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

`signUp`이 사용자 UUID를 반환하면 서버 어댑터가 위 값을 인증 암호화해 서버만 쓸 수 있는
`app_metadata.pactfive_registration_intent`에 넣는다. 저장 실패 시 이 요청에서 새로 만든 미확인
공급자 사용자를 보상 삭제하고 503으로 종료한다. 확인 링크의 token hash와 intent 원문은 API 응답에
반환하지 않는다. 일반 `user_metadata.name`·`user_metadata.role`은
사용자가 수정할 수 있으므로 권한·역할 정본으로 신뢰하지 않는다. 이메일 확인 때 공급자가 검증한
이메일·Supabase 사용자 UUID와 intent의 `normalizedEmail`·`authUserId`, 만료, nonce, 인증 태그를
모두 검사하고 검증된 intent의 이름·역할과 다시 검증한 `returnTo`만 가입 완료에 사용한다. 직접
Supabase `signUp`을 호출해 인증 태그가 유효한 PactFive intent가 없는 사용자는 자기복구 endpoint로도
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
- 503 `AUTH_REGISTRATION_SYNC_FAILED` — 새 미확인 공급자 사용자에 서버 소유 intent를 연결하지 못했다.
  이 요청에서 새로 만든 공급자 사용자만 보상 삭제하고 토큰·쿠키를 반환하지 않는다.
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

공급자 확인 성공, 보호된 `EmailRegistrationIntent` 검증, `auth_user_id`가 같은 `users` 생성 또는
멱등 일치 검사, `auth_sessions` 생성이 모두 끝난 뒤에만 토큰과 쿠키를 노출한다. 앱 반영이 실패하면
공급자 현재 세션을 폐기하고 쿠키를 설정하지 않는다. 확인은 성공했지만 앱 반영이 실패한 경우에도
보호된 intent를 즉시 지우지 않는다. 다음 이메일 로그인에서 검증된 공급자 이메일과 아직 유효한
intent를 다시 확인해 `users`·`auth_sessions` 생성을 멱등 완료한 뒤에만 intent를 제거한다. 이미 확인된
사용자의 일반 로그인은 이 endpoint가 아니라 `POST /auth/sessions`를 사용한다.

에러:

- 400 `EMAIL_CONFIRMATION_INVALID` — token hash가 누락됐거나 형식이 유효하지 않다.
- 410 `EMAIL_CONFIRMATION_EXPIRED` — token hash가 만료됐거나 이미 소비됐다. 두 경우 모두 같은
  사용자 메시지를 사용한다.
- 409 `AUTH_CONTEXT_CONFLICT` — 이미 로그인된 브라우저에서 다른 가입 확인을 시도했다. token hash를
  소비하지 않는다.
- 403 `EMAIL_CONFIRMATION_NOT_AVAILABLE` — 대응하는 PactFive 가입 정보가 없거나 탈퇴·UUID·활성
  이메일 충돌이 있다. 계정 상태를 세분화해 노출하지 않는다.
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

Supabase 이메일 로그인이 성공했는데 대응하는 PactFive `users`가 없으면 보호된 intent를 확인한다.
24시간 intent가 유효하면 사용자·세션 생성을 멱등 완료한다. 24시간 TTL은 지났지만 인증 태그·
`authUserId`·이메일·nonce가 맞고 30일 recovery proof 기간 안이면, 공급자 현재 세션을 폐기하고
10분짜리 `__Host-pactfiveRegistrationRecovery` 쿠키를 설정한 뒤 토큰 없이
`409 REGISTRATION_COMPLETION_REQUIRED`를 반환한다. 이 쿠키는 `version`, `authUserId`,
`normalizedEmail`, 원 intent nonce, 발급/만료 시각만 인증 암호화하며 공급자 Token을 담지 않는다.
속성은 `Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=600`, `Domain` 미지정이다. 사용자는 같은
이메일의 소유권을 비밀번호로 다시 증명하면서 이름·역할을 선택하는 아래 가입 복구 endpoint로
이동한다. PactFive 서명 증거가 없거나 위변조됐거나 30일이 지났다면 공급자 세션을 폐기하고
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
- 403 `REGISTRATION_NOT_AVAILABLE` — PactFive가 시작한 가입이라는 서명 증거가 없거나 30일 recovery
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
수행하고, 공급자 이메일 확인 완료, 쿠키와 같은 `auth.users.id`·정규화 이메일, 원 intent의 유효한
서명과 30일 recovery proof 기간, 활성 이메일 충돌 부재, 해당 UUID의 PactFive 사용자 부재를 다시
검증한다. 모든 조건이 맞을 때만 `users`와 `auth_sessions`를 만들고 일반 로그인과 같은 200 응답·
Refresh 쿠키를 반환하며 복구 쿠키를 제거한다. 이미 앱 사용자가 있으면 이름·역할을 절대 바꾸지
않는다. 중간 실패에서는 공급자 세션을 폐기하고 일반 Refresh 쿠키를 반환하지 않는다.

에러:

- 401 `INVALID_CREDENTIALS` — 이메일 또는 비밀번호가 올바르지 않다.
- 403 `EMAIL_VERIFICATION_REQUIRED` — 공급자 이메일 확인이 완료되지 않았다.
- 403 `REGISTRATION_RECOVERY_INVALID` — 복구 쿠키 또는 원 PactFive intent의 서명·UUID·이메일·nonce가
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

`providerFlowState`는 Supabase SDK가 만들고 검증하는 PKCE code verifier 등 code 교환용 불투명
저장 상태다. PactFive는 이를 생성 규칙으로 재구현하거나 해석하지 않는다. 시작 요청에서 SDK가 만든
값을 암호화 OAuth intent 쿠키에 보존하고, 콜백 요청에서는 그 쿠키를 검증·복호화해 새 요청 단위 SDK
저장소에 복원한 뒤 code를 교환한다. `returnTo`는 한 번 URL decode한 뒤에도 단일 `/`로 시작하는 상대
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
공급자가 반환한 Access Token의 `session_id`는 행의 `provider_session_id`와 반드시 일치해야 한다.
`previous_token_hash` 일치만으로 재사용을 판정하지 않는다. Supabase가 정상 reuse interval 또는
parent-token 복구로 성공하면, 입력이 현재 fingerprint였을 때만 CAS rotation하고 입력이 직전
fingerprint였으며 반환값이 이미 저장된 현재 토큰이면 활성 상태와 기대 current fingerprint를
조건으로 `last_used_at`만 CAS 갱신한 뒤 쿠키를 재발급한다. 이 조건부 touch가 로그아웃/선행 rotation
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
   사용한다. Bearer가 누락·만료됐거나 두 세션이 다르면 자격 증명을 섞어 공급자를 호출하지 않고
   불일치만 감사한다. 서버가 쿠키 세션에 안전하게 연결된 공급자 자격 증명으로 폐기할 수 있으면
   best effort로 수행한다.
3. Origin 검증 뒤의 모든 인증 결과에서 Refresh 쿠키를
   `Max-Age=0; Secure; HttpOnly; SameSite=Strict; Path=/`로 제거하고 OAuth intent·가입 복구 쿠키도
   함께 제거한다. 브라우저는 로그아웃 호출 즉시 인증 epoch를 증가시키고, 이전 epoch에서 늦게 끝난
   로그인·Restore·Refresh 결과를 메모리 토큰이나 인증 UI에 다시 게시하지 않는다.

응답 204: 본문 없음. 쿠키 누락, 알 수 없는 fingerprint, Bearer 누락·만료·불일치, 이미 로그아웃된
세션도 204로 통일해 계정·세션 존재 여부를 노출하지 않는다. 공급자 폐기 지연·실패도 로컬 결과를
되돌리지 않고 비밀값 없는 감사 기록과 제한된 재시도 대상으로 남긴다. 이후 모든 보호 API의 활성
세션 검사가 잔여 JWT를 즉시 차단한다.

에러:

- 403 `ORIGIN_NOT_ALLOWED` — Origin이 누락됐거나 허용 Origin과 정확히 일치하지 않는다. 이 경우에는
  CSRF 로그아웃을 막기 위해 세션·쿠키를 바꾸지 않는다.
- 503 `AUTH_LOGOUT_SYNC_FAILED` — 로컬 `auth_sessions` 조회·폐기를 확정하지 못했다. 브라우저의
  메모리 컨텍스트와 세 인증 쿠키는 제거하지만 서버측 즉시 폐기는 보장하지 못하므로, 운영 구현은
  fingerprint 기반 durable revocation tombstone/outbox 또는 동등한 장애 복구 경계를 갖춰야 한다.

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
- 브라우저에는 Supabase Auth 세션 클라이언트를 두지 않는다. 서버 어댑터의 일반 요청용 SDK는
  `autoRefreshToken: false`, `persistSession: false`, `detectSessionInUrl: false`로 두고, OAuth에는
  요청 단위 PKCE 저장소로 보호된 intent의 `providerFlowState`를 사용한다.
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

## 통합 전 미확정 — 교차 탭 인증 성공 경합

같은 탭의 로그인·OAuth 시작·Refresh·로그아웃은 브라우저의 공용 인증 mutation queue와 Refresh
single-flight를 사용하고, 이미 발급된 OAuth intent는 서버 저장소의 원자 nonce 소비로 한 흐름만
성공시킨다. 다만 서로 다른 탭에서 요청이 시작될 때 아직 Refresh/OAuth intent 쿠키가 없고 성공
응답이 교차 도착하는 경우는 요청 시점 쿠키만으로 원자화할 수 없다.

서버측 브라우저 흐름 잠금/세대 번호 또는 OAuth callback 결과의 same-site 2단계 확정 방식 중 하나를
ADR에서 승인하고 이 계약에 반영하기 전에는 live Supabase/Google/Kakao 어댑터를 활성화하지 않는다.
현재 Mock 결과는 이미 발급된 intent 이후 경합과 같은 탭 직렬화만 증명한다.

## 외부 계정·키 준비 상태 (구현 전 게이트)

2026-08-25 현재 저장소 문서만으로는 다음 항목이 **확인되지 않았다**. 실제 비밀값을 이 문서나
커밋에 기록하지 않고, 담당자가 대시보드에서 존재·활성 여부만 확인해야 한다.

| 대상 | 확인할 항목 | 현재 판정 |
|---|---|---|
| Supabase | 프로젝트 생성, Auth 활성화, 앱 URL/허용 redirect URL, 이메일 확인 정책, 서버·웹용 키 주입 | 일부 확인 — PactFive 프로젝트·DB 연결 정보는 담당자가 제공했으나 Auth 설정과 키 주입은 미검증 |
| Google | OAuth client 생성, consent screen, client ID/secret의 Supabase 등록, redirect URI 일치 | 일부 확인 — 계정·Cloud 프로젝트는 있으나 MFA에서 Credentials 확인 중단 |
| Kakao | 개발자 앱, REST API key/client secret, Supabase 등록, redirect URI, 사업자 전환과 이메일 동의 권한 | 일부 확인 — 앱의 비즈니스 인증 자료 업로드 완료, 심사 결과·로그인 provider·redirect 설정은 미검증 |
| 저장소/로컬 | 공개 키와 서버 비밀 키의 분리 주입, `.env.example` 변수명 | 확인 가능한 자격 증명 없음; `.env.example`도 비어 있음 |

셋 중 하나라도 미확인이면 해당 공급자를 `준비 완료`로 문서화하지 않는다. 특히 Kakao 이메일 동의는
사업자 상태에 의존하므로, 키가 존재한다는 사실만으로 준비 완료로 판정하지 않는다.
