# user-management — SPEC

## 문서 상태

- 작성 기준일: 2026-08-25
- 작업 단계: Step 1 — 기능 정의와 외부 연동 준비 상태 확인
- 상태 표기:
  - **FACT**: 저장소 정본이나 확인 작업으로 검증된 내용
  - **DECISION**: 이 기능의 구현 기준으로 선택한 정책. 팀 공유 정본 반영은 팀장 통합 단계에서 수행
  - **ASSUMPTION**: 다음 설계를 진행하기 위한 작업 가설. 팀 확인 전에는 확정 정책이 아님
  - **OPEN**: 확인 또는 결정이 필요해 구현 근거로 사용할 수 없는 내용

자격 증명은 존재 여부와 준비 상태만 기록한다. API 키, Client Secret, 토큰 등의 실제 값은
기록하거나 커밋하지 않는다.

## 목적

PactFive 사용자가 이메일 또는 Google/Kakao 계정으로 가입·로그인하고, 선택한 역할에 맞는 인증
컨텍스트와 세션을 안전하게 유지하도록 한다. 인증이 필요한 화면에서 로그인으로 이동한 사용자는
인증 성공 후 원래 화면으로 복귀한다.

## 범위

### 포함

- **FACT (상위 요구사항)**: 이메일+비밀번호 회원가입과 로그인
- **DECISION**: 가입 확인 메일, 확인 화면의 명시적 POST 검증, 확인 메일 재전송
- **FACT (상위 요구사항)**: Supabase Auth를 통한 Google·Kakao OAuth 가입과 로그인
- **FACT (상위 요구사항)**: `CLIENT` 또는 `FREELANCER` 역할 선택과 인증 컨텍스트 제공
- **FACT (상위 요구사항)**: Access Token 전달, 세션 복원, Refresh Token 갱신, 현재 세션 로그아웃의 기대 동작
- **FACT (상위 요구사항)**: 탈퇴 계정과 OAuth-only 계정의 이메일 로그인 제한
- **FACT (상위 요구사항)**: 로그인 유도 전 경로를 `returnTo`로 보존하고 인증 성공 후 복귀
- **ASSUMPTION**: 웹 인증 화면의 초기 라우트 계약(`/login`, `/sign-up`, `/auth/confirm`)

### 제외

- 프로필 상세 입력·수정, 프로필 완성도 게이트
- 비밀번호 찾기·재설정·변경
- 회원 탈퇴 처리와 진행 중 거래 검사
- 기기/세션 목록 화면, 특정 기기 강제 로그아웃, 전체 기기 로그아웃 UI
- 관리자 기능과 역할 변경 기능
- `app/` 통합 코드, 실제 Supabase/Google/Kakao 대시보드 설정, 배포 환경 변수 주입
- user-management 이외 기능(특히 ai-pricing)의 설계와 구현

## 근거와 제약

1. **FACT**: ADR-0008은 자체 JWT 대신 Supabase Auth를 채택했고, 이메일 인증·Access/Refresh
   Token·Google/Kakao OAuth를 그 인증 계층에 위임한다.
2. **FACT**: ADR-0009에 따라 컨트롤러와 서비스는 Supabase SDK를 직접 호출하지 않는다.
   도메인 인터페이스 `auth.port.ts`의 `AuthProvider`를 사용하고 Supabase 호출은
   `supabase-auth.adapter.ts`에 격리한다.
3. **FACT**: 인증된 API 요청은 `Authorization: Bearer <token>` 헤더로 인증 컨텍스트를 전달한다
   (`docs/domain/erd.md`, PRD §1.4).
4. **FACT**: `users.refresh_token_hash`는 ERD v1.4에서 제거됐다. 기기별 세션과 토큰 rotation 기록의
   정본은 `auth_sessions`다.
5. **DECISION**: Supabase Auth는 Access/Refresh Token의 발급·검증·rotation·재사용 판정·공급자
   세션 폐기의 정본이다. PactFive의 `AuthSessionService`는 공급자 성공 결과와 `auth_sessions`를
   동기화하는 유일한 조정자이고, `auth_sessions`는 앱의 Refresh 허용 여부와 기기·폐기·감사 이력을
   기록한다. Supabase JWT의 `session_id`와 PactFive 세션을 안정적으로 잇는 매핑을 사용하며,
   PactFive가 자체 토큰을 발급하거나 Supabase 내부 세션 테이블을 복제하지 않는다.
6. **TEAM SYNC**: Supabase Auth가 이메일 비밀번호 해시와 로그인 방식 판정을 소유하므로 PactFive는
   공급자 해시를 읽거나 복제하지 않는다. OAuth-only 계정의 이메일+비밀번호 로그인은 Supabase의
   일반 인증 실패로 처리하고 앱이 `password_hash IS NULL`을 별도로 판정하지 않는다. ERD v1.5에서는
   사용하지 않는 `users.password_hash` 제거를 승인받아야 한다.
7. **DECISION**: 브라우저는 Supabase Auth 세션을 소유하지 않는다. Refresh Token은 서버가 발급하는
   HttpOnly 쿠키로만 전달하고, 브라우저는 메모리의 Access Token과 PactFive Refresh API만 사용한다.
8. **TEAM SYNC**: ERD v1.4 I-39의 매 요청 무조건 rotation과 I-40의 “`previous_token_hash` 일치 즉시
   `REUSE_DETECTED`”는 Supabase의 정상 reuse interval·parent-token 복구와 충돌한다. 이 기능은 새
   토큰 반환 때만 CAS rotation하고, 해당 세션에 상관 가능한 `refresh_token_already_used`만
   `REUSE_DETECTED`로 반영한다. 팀장 통합 전에 ERD I-39/I-40과 `app/server/AGENTS.md`의 브라우저
   SDK 자동 갱신 문구를 새 ADR과 함께 동기화해야 한다.

## 관련 엔티티 (근거: `docs/domain/erd.md`)

### `users`

이 기능에서 사용하는 필드는 다음과 같다. 필드명은 ERD v1.4 표기를 그대로 사용한다.

| 컬럼 | 사용 목적 |
|---|---|
| `id` | PactFive 사용자 식별자 |
| `email` | 이메일 로그인 식별자 및 소셜 계정 연동 키 |
| `password_hash` | 현재 ERD의 레거시 필드. Supabase가 해시와 로그인 방식을 소유하므로 새 구현은 의존하지 않고 ERD v1.5 제거 승인 요청 |
| `name` | 회원가입 시 생성할 사용자 이름 |
| `role` | `CLIENT` 또는 `FREELANCER` 권한 컨텍스트 |
| `oauth_provider` | 현재 ERD의 첫 OAuth 가입 공급자 기록. Supabase 사용자 매핑의 정본으로 사용하지 않음 |
| `oauth_subject` | 현재 ERD의 첫 OAuth 가입 공급자 식별자 기록. Supabase 사용자 매핑의 정본으로 사용하지 않음 |
| `last_login_at` | 마지막 로그인 성공 시각 |
| `deleted_at` | 탈퇴 계정 로그인 차단 판정 |

### `auth_sessions`

| 컬럼 | 사용 목적 |
|---|---|
| `id` | PactFive 세션 식별자 |
| `user_id` | 세션 소유 사용자 |
| `refresh_token_hash` | 현재 Refresh Token의 해시. 원문 저장 금지 |
| `previous_token_hash` | rotation 직전 토큰 해시. 공급자 정상 재시도 복구와 감사 대조에 사용하며 이 값만으로 탈취를 확정하지 않음 |
| `device_label` | 현재 기기 표시용 설명 |
| `issued_at`, `expires_at`, `last_used_at` | 발급·만료·최근 사용 시각 |
| `revoked_at`, `revoked_reason` | 세션 폐기 시각과 사유 |
| `created_at` | 세션 행 생성 시각 |

`revoked_reason` 값은 ERD의 `LOGOUT`, `LOGOUT_ALL`, `REUSE_DETECTED`, `PASSWORD_CHANGED`,
`USER_WITHDRAWN`를 따른다. 이 단계에서 새 값을 추가하지 않는다.

### 팀 공유 ERD에 필요한 Supabase 매핑

아래 두 필드는 오늘 결정의 구현에 필요하지만 현재 ERD v1.4에는 없다. 팀장 통합 전 새 ADR과 ERD
변경으로 승인하며, 그 전에는 `app/` 스키마를 임의로 바꾸지 않는다.

| 대상 | 필요한 필드 | 목적 |
|---|---|---|
| `users` | `auth_user_id uuid UNIQUE NOT NULL` | Supabase `auth.users.id`와 PactFive 사용자의 안정적인 1:1 매핑 |
| `auth_sessions` | `provider_session_id uuid` | 활성 행은 필수, 값이 있는 전체 행은 UNIQUE. 과거 폐기 감사행은 NULL 허용 |

Supabase가 같은 사용자의 Google·Kakao identity를 복수로 연결할 수 있으므로 `auth_user_id`를 사용자
매핑의 정본으로 쓴다. 기존 `oauth_provider`·`oauth_subject`는 첫 가입 출처 기록으로만 유지할지
폐기할지 팀장 ERD 변경에서 결정한다.

## 업무 규칙

### 가입과 역할

1. **[DECISION] 이메일 회원가입 접수와 확인** — 사용자가 유효한 `email`, 비밀번호, `name`, `role`,
   안전하게 검증된 `returnTo`를 제출하면 서버는 Supabase Confirm Email 가입을 요청한다. 가입 요청 단계에서는 PactFive `users`·
   `auth_sessions`, 세션·쿠키·Access Token을 만들지 않고 `202 EMAIL_VERIFICATION_REQUIRED`로 끝낸다.
   서버는 Supabase 사용자 UUID·정규화한 이메일·이름·역할·`returnTo`·nonce·발급/만료 시각을 인증 암호화한 일회용
   `EmailRegistrationIntent`만 공급자 사용자의 서버 소유 `app_metadata`에 연결하며, 수정 가능한 일반
   `user_metadata`의 역할 원문을 권한 근거로 신뢰하지 않는다. intent 저장 실패 시 이 요청에서 새로
   만든 미확인 공급자 사용자를 보상 삭제한다. 확인 화면에서 사용자가 명시적으로 token hash 검증을 요청하고
   검증된 공급자 이메일·보호된 intent·앱 사용자·세션 동기화가 모두 성공한 뒤에만 `users.role`에
   `CLIENT` 또는 `FREELANCER` 하나를 저장하고 로그인 상태를 만든다. 비밀번호 원문은 PactFive DB와
   로그에 저장하지 않는다. 공급자 확인 성공 뒤 앱 사용자·세션 반영만 실패하면 유효한 intent를 즉시
   지우지 않고, 다음 이메일 로그인에서 같은 검사를 거쳐 멱등 완료한 뒤 제거한다. intent TTL은 발급·
   정상 재전송부터 24시간이며 한 공급자 사용자에 최신 nonce 한 건만 유효하다. 별도 30일 recovery
   proof 만료를 함께 봉인해 24시간 이후에는 “PactFive가 시작한 가입”이라는 증거로만 사용하고, 오래된
   이름·역할·`returnTo`는 복원하지 않는다. 확인 대기 계정의 만료 intent는 전체 가입 폼을 다시 제출할
   때만 새 값으로 교체하고, 이메일만 받는 재전송 API가 값을 추측하지 않는다.
   공급자 이메일 확인은 끝났지만 앱 사용자 생성 실패 뒤 24시간 intent가 만료된 경우, 정상 이메일
   로그인과 인증 태그·UUID·이메일·nonce·30일 proof를 모두 검증한다. 성공하면 공급자 세션을 폐기하고
   공급자 Token이 없는 10분짜리 `__Host-pactfiveRegistrationRecovery` HttpOnly 쿠키와
   `409 REGISTRATION_COMPLETION_REQUIRED`를 반환한다. 사용자는 `/sign-up` 복구 모드에서 이메일·
   비밀번호로 소유권을 다시 증명하고 이름·역할·`returnTo`를 제출한다.
   `POST /api/v1/auth/registration-completions`는 복구 쿠키와 원 PactFive intent 서명, 확인된 공급자
   UUID가 모두 일치하고 앱 사용자가 없는 경우에만 사용자·세션을 만든다. 직접 Supabase 가입처럼
   PactFive 서명 증거가 없거나 30일이 지난 계정은 자동 생성하지 않고 수동 지원으로 보내며, 기존
   사용자의 이름·역할은 바꾸지 않는다.
2. **[FACT] 활성 이메일 중복 방지** — 같은 `email`을 가진 활성 사용자(`deleted_at IS NULL`)가
   이미 있으면 새 이메일 계정을 만들거나 기존 이름·역할·비밀번호를 바꾸지 않는다. 신규·기존·확인
   대기 이메일의 형식이 유효한 가입 요청과 재전송 요청은 각각 같은 202 응답을 사용해 계정 존재
   여부를 노출하지 않는다.
3. **[FACT] 역할 불변** — 회원가입 완료 후 `users.role`은 변경할 수 없다. 역할 전환 API와
   화면을 만들지 않으며, 다른 역할이 필요하면 팀 정책에 따른 별도 계정 흐름을 사용한다.
4. **[DECISION] OAuth 최초 가입의 역할 선택** — 처음 보는 Supabase `auth.users.id`로 가입할 때도
   계정 생성 완료 전에 `CLIENT` 또는 `FREELANCER`를 반드시 선택한다.
   선택 값은 콜백 쿼리나 공급자 `user_metadata`가 아니라 서버가 보호하는 OAuth intent에 보존한다.
   기존 사용자의 콜백에서는 intent의 역할을 무시하고 저장된 `users.role`을 유지한다.

### 이메일 로그인

5. **[DECISION] 동일한 인증 실패 응답** — 존재하지 않는 `email`, 틀린 비밀번호, OAuth-only 계정에
   대한 이메일+비밀번호 시도는 Supabase의 일반 인증 실패로 처리한다. `deleted_at IS NOT NULL`인
   탈퇴 계정은 공급자 인증 뒤 앱 레이어에서 거부하되, 모두 계정 상태를 추측할 수 없도록 같은 401
   응답과 같은 사용자 메시지를 사용한다. PactFive가 공급자 비밀번호 해시나 `users.password_hash`를
   읽어 로그인 방식을 판정하지 않는다. 이메일과 비밀번호는 맞지만 확인만 끝나지 않은 경우는 토큰·쿠키 없이
   `403 EMAIL_VERIFICATION_REQUIRED`를 반환해 재전송 동작으로 연결한다.
6. **[DECISION] 앱 레이어 상태 검사** — Supabase Auth가 인증에 성공했더라도 PactFive 앱 레이어는
   연결된 `users` 행의 `auth_user_id`와 `deleted_at`을 확인한 뒤에만 인증 성공을
   확정한다. 검사에 실패하면 공급자 세션을 폐기하고 인증 컨텍스트를 만들지 않는다.
7. **[DECISION] 로그인 성공 기록** — 모든 앱 레이어 검사를 통과한 경우에만 `last_login_at`을 현재
   시각으로 갱신하고 인증 컨텍스트와 세션을 반환한다.

### Google/Kakao OAuth

8. **[FACT] 공급자 제한** — 이 기능이 허용하는 `oauth_provider`는 ERD의 `GOOGLE`, `KAKAO`뿐이다.
   OAuth 시작·콜백은 `AuthProvider` 포트를 거치며 UI·서비스가 Supabase SDK를 직접 호출하지 않는다.
9. **[DECISION] OAuth 사용자 매핑** — 콜백에서 검증한 Supabase `auth.users.id`를
   `users.auth_user_id`와 매핑한다. `oauth_provider` + `oauth_subject`는 첫 가입 출처 정보이지 로그인
   매핑의 정본이 아니다. 최초 사용자는 아래 동일 이메일 정책과 역할 선택을 모두 통과한 뒤에만
   `users` 행을 생성한다.
10. **[FACT] OAuth 후 탈퇴 계정 차단** — OAuth 공급자 인증이 성공해도 연결된 `users.deleted_at`이
    채워져 있으면 PactFive 로그인을 거부하고 생성된 공급자 세션을 폐기한다.
11. **[DECISION] 동일 이메일 계정 연결 정책** — Supabase Auth의 **검증된 동일 이메일 자동 연결**을
    채택한다. PactFive가 OAuth 응답의 이메일 문자열만 보고 identity를 직접 연결하거나 Supabase의
    수동 `linkIdentity` 흐름을 노출하지 않는다.
    - PactFive는 Supabase가 동일 이메일 identity를 같은 `auth.users.id`로 연결해 반환한 결과만
      신뢰한다. Supabase의 Confirm Email을 끄면 미확인 이메일도 암묵적으로 확인 처리되므로 운영
      환경에서는 Confirm Email을 켜고 manual identity linking을 끈다. 미확인 이메일 선점 뒤 OAuth
      로그인 시 기존 미확인 identity가 안전하게 처리되는지 통합 테스트한다.
    - 기존 `auth_user_id`가 콜백의 Supabase 사용자 UUID와 같으면 공급자가 Google인지 Kakao인지와
      관계없이 같은 PactFive 사용자로 로그인하고 저장된 역할을 유지한다.
    - 정상 런타임에서는 모든 사용자가 가입 시점부터 `auth_user_id`를 가져야 한다. 과거 활성 행의
      값이 비어 있다면 일반 OAuth 콜백에서 즉석 연결하지 않고, 팀장이 승인한 일회성 마이그레이션에서
      검증된 이메일을 대조해 조건부 backfill한 뒤 `NOT NULL`로 잠근다.
    - 같은 이메일 행이 다른 `auth_user_id`와 연결됐거나, 이메일이 없거나 검증되지 않았거나, 탈퇴
      행과 충돌하면 연결·가입을 모두 거부하고 공급자 세션을 폐기한다. 오류는 계정 존재 여부를 숨긴다.
    - Supabase가 같은 UUID에 자동 연결한 두 번째 동일 이메일 공급자는 허용한다. 다른 이메일
      identity의 수동 병합은 MVP에서 지원하지 않는다. 동시 콜백은 `auth_user_id` UNIQUE와 조건부
      갱신으로 한 건만 성공시킨다.
    - 이미 유효한 PactFive Refresh 쿠키가 있는 브라우저에서는 OAuth 시작을
      `409 AUTH_CONTEXT_CONFLICT`로 거부한다. MVP는 로그인 중 계정 전환을 지원하지 않으며, 사용자는
      현재 세션을 로그아웃한 뒤 새 흐름을 시작한다.
    - Supabase의 OAuth `redirectTo`는 BFF의 `GET /api/v1/auth/oauth-callbacks`로 고정한다. BFF가 code
      교환·앱 사용자 검사·세션 생성·안전한 복귀를 마친 뒤 웹으로 302 응답하며 웹 라우트가 code를
      직접 교환하지 않는다.

### 인증 컨텍스트와 세션

12. **[FACT] 인증 컨텍스트** — 앱이 인증 완료 상태를 공개하려면 최소한 PactFive `userId`,
    `email`, `role`, 로그인 여부, Access Token 만료 상태를 한 컨텍스트에서 제공한다. 권한 판정에는
    OAuth 공급자 프로필의 역할값이 아니라 `users.role`을 사용한다.
13. **[FACT] 보호 API 호출** — 인증 컨텍스트가 있는 사용자가 보호 API를 호출할 때 Access Token을
    `Authorization: Bearer <token>`으로 전달한다. Refresh Token 원문을 Authorization 헤더,
    애플리케이션 로그 또는 PactFive DB에 넣지 않는다.
14. **[DECISION] 앱 시작 시 세션 복원** — 앱을 다시 열거나 새로고침하면 브라우저가 PactFive
    Refresh API를 한 번 호출하고, 서버가 HttpOnly 쿠키로 Supabase 세션을 갱신한 뒤 PactFive 사용자
    상태를 다시 검증한다. 검증이 끝나기 전에는 인증됨으로 간주하지 않는다.
15. **[DECISION] Refresh Token rotation 결과** — 공급자 갱신 성공 후에만
    `auth_sessions.refresh_token_hash`를 새 HMAC-SHA-256 fingerprint로 교체하고 기존 값을
    `previous_token_hash`로 옮긴다. 행 갱신은 기대한 현재 fingerprint를 조건으로 원자적으로 수행한다.
    공급자가 반환한 Access Token의 `session_id`는 행의 `provider_session_id`와 반드시 같아야 한다.
    `previous_token_hash` 일치만으로 재사용을 확정하지 않으며, Supabase가 정상 reuse interval/
    parent 복구로 성공한 경우 현재 토큰과 행을 수렴시킨다. 어댑터가 해당 공급자 세션에 상관 가능한
    `refresh_token_already_used`를 받은 경우에만 해당 행을 `revoked_reason='REUSE_DETECTED'`로
    폐기한다. `refresh_token_not_found`는 재사용 확정으로 분류하지 않는다.
16. **[DECISION] 자동 갱신 실패 처리** — Access Token 만료 전 또는 보호 API의 인증 만료 응답 후
    브라우저가 PactFive Refresh API로 갱신을 한 번 시도한다. `401 AUTH_SESSION_INVALID`처럼 만료·
    폐기가 확정된 실패만 쿠키와 인증 컨텍스트를 비우고 로그인 화면으로 이동하며 현재 경로를
    `returnTo`로 보존한다. `503 AUTH_PROVIDER_UNAVAILABLE | AUTH_SESSION_SYNC_FAILED`는 기존 쿠키를
    유지하고 보호 작업을 일시 중단한 채 제한된 재시도 상태로 둔다. 일시 장애를 로그아웃으로
    가장하지 않는다.
17. **[DECISION] 현재 세션 로그아웃과 즉시 차단** — 사용자가 로그아웃하면 현재
    요청 Origin을 먼저 검증한다. 그 뒤 Access Token의 누락·만료와 무관하게 Refresh 쿠키 fingerprint로
    식별 가능한 현재 `auth_sessions` 행을 `revoked_reason='LOGOUT'`으로 멱등 폐기하고, 모든 인증 결과에서
    Refresh 쿠키와 로컬 인증 컨텍스트를 제거한다. 유효한 Bearer Token도 있으면 같은
    `provider_session_id`인지 확인해 공급자 현재 세션 폐기에 사용하되, 불일치·공급자 지연·실패가 로컬
    로그아웃을 되돌리지 않는다. 모든 보호 API는 Access Token의 `session_id`와 일치하는 미폐기
    `auth_sessions.provider_session_id`가 있는지 검사하므로, 공급자 JWT의 남은 만료 시간과 관계없이
    로컬 로그아웃 직후 요청을 401로 차단한다.
18. **[DECISION] Refresh Token 보관 책임** — 서버 controller만
    `__Host-pactfiveRefreshToken` 쿠키를 설정·읽기·삭제한다. 운영 속성은 `Secure`, `HttpOnly`,
    `SameSite=Strict`, `Path=/`, `Domain` 미지정이다. Access Token은 응답 본문으로 전달하되 브라우저
    메모리에만 두고 `localStorage`, `sessionStorage`, IndexedDB에 영속화하지 않는다. 브라우저의
    Supabase Auth 자동 갱신·세션 지속은 사용하지 않는다. 쿠키는 세션 쿠키가 되지 않도록
    `auth_sessions.expires_at`까지 남은 시간을 `Max-Age`로 명시하며 Refresh 때 수명을 임의 연장하지
    않는다.

**승인 선택 필요 — 앱 세션 절대 수명**: Supabase 무료 플랜의 기본 세션은 별도 time-box 없이
유지될 수 있으므로 `auth_sessions.expires_at`을 만들 최초 절대 수명을 팀이 선택해야 한다. 제안값은
개발·MVP 공통 7일이며 `AUTH_SESSION_ABSOLUTE_TTL_SECONDS`로 설정하고, 만료 시 로컬 세션을 폐기한 뒤
현재 공급자 세션 로그아웃을 요청한다. 승인자가 다른 값을 선택하면 SPEC·API 계약을 함께 바꾼다.

#### 세션 동기화 책임 경계

| 주체 | 확정 책임 |
|---|---|
| Supabase Auth | 토큰 발급·검증·rotation·재사용 최종 판정·현재 공급자 세션 폐기 |
| `supabase-auth.adapter.ts` | Supabase 호출과 결과·오류의 도메인 타입 변환. 쿠키와 PactFive DB를 직접 다루지 않음 |
| `AuthSessionService` | 로그인·OAuth 콜백·갱신·로그아웃 순서와 보상 처리를 조정하는 유일한 주체 |
| `AuthSessionRepository` | `auth_sessions` 생성, 조건부 rotation, 폐기 기록 |
| controller | Refresh/OAuth intent 쿠키 읽기·설정·삭제, `Cache-Control: private, no-store` 응답 |
| 브라우저 | Access Token 메모리 보관, PactFive API 호출, 갱신 단일화. Refresh Token과 Supabase 세션은 소유하지 않음 |

로그인·OAuth 콜백은 앱 사용자 검사와 `provider_session_id`를 포함한 `auth_sessions` 생성까지
성공한 뒤에만 토큰과 쿠키를
응답한다. 갱신은 Supabase 성공과 `auth_sessions` 조건부 갱신이 모두 끝난 뒤에만 새 쿠키를
설정한다. 공급자 timeout/5xx이면 DB와 쿠키를 바꾸지 않고 실패를 반환한다. 로그아웃은 현재
Refresh 쿠키가 가리키는 `auth_sessions`를 Bearer Token 만료 여부와 무관하게 `LOGOUT`으로 폐기하고
쿠키를 항상 제거한다. 유효한 Bearer Token이 같은 공급자 세션을 가리킬 때만 이를 공급자 현재 세션
폐기에 사용하며, 불일치 또는 공급자 실패는 감사하되 로컬 결과를 되돌리지 않는다.

### `returnTo` 복귀

19. **[FACT] 원래 화면 복귀** — 비로그인 사용자가 인증이 필요한 화면에 접근하면 로그인 화면으로
    이동하면서 원래의 앱 내부 경로를 `returnTo`에 보존하고, 로그인 또는 가입 성공 후 그 경로로
    한 번만 복귀한다. PRD의 확정 예시는 `?returnTo=/projects/new`다.
20. **[DECISION] 안전한 복귀 경로** — `returnTo`는 `/`로 시작하는 동일 출처의 상대 경로만
   허용한다. 스킴이 있는 URL, `//`로 시작하는 URL, 제어 문자가 포함된 값, 파싱에 실패한 값은
   거부한다. API 허용 목록은 시작 시와 콜백 시 모두 다시 검증하고, 콜백 시 더 이상 유효하지 않으면
   외부 URL로 이동하지 않고 `/`를 사용한다.
21. **[DECISION] OAuth 왕복 보존** — 공급자 OAuth `state`와 PKCE는 Supabase가 소유하며 PactFive
    데이터를 넣거나 덮어쓰지 않는다. PactFive는 `oauthProvider`, 선택 역할, 검증된 `returnTo`,
    10분 만료, nonce와 Supabase SDK가 생성한 PKCE 저장 상태를 해석하지 않은 채 인증 암호화한 단기 OAuth intent 쿠키
    `__Host-pactfiveOAuthIntent`에 보존한다. 속성은 `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`,
    `Domain` 미지정이다. 한 브라우저에서 최신 시도 한 건만 유지하고 콜백 성공·실패 모두 쿠키를
    삭제한다. 콜백 쿼리의 임의 역할·`returnTo`는 사용하지 않는다.

### 개발용 Mock 인증

22. **[DECISION] 역할별 고정 토큰** — 실제 Supabase 연동 전 Mock/test 어댑터는 다음 두 비밀이 아닌
    식별자를 정확히 일치 비교해 인증 컨텍스트를 만든다.
    - `Bearer pactfive-mock-client-01` →
      `{ userId: "usr_00000000000000000000000001", role: "CLIENT" }`
    - `Bearer pactfive-mock-freelancer-01` →
      `{ userId: "usr_00000000000000000000000002", role: "FREELANCER" }`
23. **[DECISION] 환경 격리** — 위 값은 JWT·Supabase 자격 증명이 아니며 Mock/test 환경에서만
    허용한다. 실제 Supabase 어댑터와 배포 환경에서는 항상 거부하고 Authorization 원문을 로그에
    남기지 않는다.

## 웹 라우트 목록

현재 `app/web`에는 라우터 구현이 없으므로 아래 경로는 오늘의 디자인·API 계약을 맞추기 위한
**ASSUMPTION**이다. 팀이 경로를 확정하기 전에는 `app/`에 반영하지 않는다.

| 라우트 | 상태 | 책임 |
|---|---|---|
| `/login` | ASSUMPTION | 이메일 로그인, Google/Kakao 로그인 시작, `returnTo` 수신 |
| `/sign-up` | ASSUMPTION | 이메일/OAuth 가입, 고립 계정 복구, `CLIENT`/`FREELANCER` 역할 선택, `returnTo` 수신 |
| `/auth/confirm` | ASSUMPTION | 이메일 링크의 token hash를 주소에서 제거하고, 사용자의 명시적 확인 뒤 서버 POST 검증 |
| `/terms` | ASSUMPTION | 이용약관 읽기 전용 화면. 실제 소유 기능은 팀 통합 시 확정 |
| `/privacy` | ASSUMPTION | 개인정보 처리방침 읽기 전용 화면. 실제 소유 기능은 팀 통합 시 확정 |
| `/` | ASSUMPTION | 유효한 `returnTo`가 없을 때의 안전한 기본 복귀 경로 |

로그아웃과 토큰 갱신은 페이지 라우트가 아니라 인증 액션으로 정의한다. `/projects/new` 등 보호
화면은 각 기능 담당자가 소유하며, user-management는 해당 경로를 새로 만들지 않고 인증 유도와
복귀 계약만 제공한다.

Supabase OAuth callback은 웹 라우트가 아니라 BFF의
`GET /api/v1/auth/oauth-callbacks`가 소유한다. 웹은 BFF의 최종 302 성공·오류 결과만 표시한다.

## 외부 계정·키 준비 상태

2026-08-25 확인 기준이다. “미확인”은 준비되지 않았다고 단정하는 의미가 아니라, 현재 세션과
저장소에서 실제 연동 가능 상태를 검증하지 못했다는 뜻이다.

| 대상 | 상태 | 확인된 내용 | 다음 확인 |
|---|---|---|---|
| Supabase | PARTIAL — 프로젝트 정보 수신 | 담당자가 PactFive 프로젝트와 DB 연결 정보를 제공해 프로젝트 존재는 확인. 비밀값은 문서화하지 않았고 Auth 설정 readback은 아직 없음 | Site URL/redirect URL, Confirm Email, Email/Google/Kakao provider, 공개/서버 키 주입 상태 확인 |
| Google Cloud | OPEN — MFA 차단 | Google 계정과 Cloud 프로젝트 존재는 확인. MFA 때문에 Credentials 화면 진입이 중단되어 OAuth Client 준비 여부는 미검증 | MFA 완료 후 OAuth consent screen, Web client, redirect URI 확인 |
| Kakao Developers | OPEN — 심사·연동 미확인 | 앱의 비즈니스 인증 자료 업로드는 완료. 심사 결과, Kakao Login provider, REST API 키/Client Secret 주입, Redirect URI, 이메일 동의 권한은 아직 readback하지 못함 | 비즈니스 심사 결과와 이메일 동의 권한 확인 후 Supabase provider·Redirect URI 왕복 검증 |
| 저장소·로컬 환경·GitHub | FACT — 값 없음 | 사용할 수 있는 Supabase/Google/Kakao 자격 증명 값이 확인되지 않음. 루트 `.env.example`도 현재 비어 있음 | 비밀값은 배포/로컬 secret 저장소에 주입하고 `.env.example`에는 변수명과 설명만 추가 |

### 준비 완료 판정 기준

다음 항목을 실제 값 노출 없이 모두 “확인됨”으로 바꿔야 라이브 OAuth 구현을 시작할 수 있다.

- **OPEN**: Supabase 프로젝트 접근과 Auth의 이메일 로그인이 활성화돼 있다.
- **OPEN**: Google/Kakao provider가 Supabase Auth에 연결돼 있다.
- **OPEN**: 로컬·프리뷰·배포 환경별 Site URL과 Redirect URI가 공급자/Supabase 양쪽에서 일치한다.
- **OPEN**: 브라우저에 노출 가능한 공개 키와 서버 전용 비밀 키의 저장 위치·접근 주체가 분리돼 있다.
- **OPEN**: Kakao 앱의 비즈니스 전환 여부와 이메일 동의 항목 사용 가능 여부가 확인됐다.
- **OPEN**: 실제 계정으로 Google/Kakao 로그인 왕복과 로그아웃을 각각 한 번 이상 검증했다.

## 오늘 확정한 항목과 남은 OPEN

### DECISION — 2026-08-25

1. 동일 이메일은 Supabase가 검증한 이메일 자동 연결만 허용하고 앱의 문자열 기반 수동 연결은 금지한다.
   Supabase 사용자 UUID를 PactFive 사용자 매핑의 정본으로 사용한다.
2. Supabase의 OAuth `state`·PKCE와 별도로, 역할·`returnTo`는 10분짜리 보호된 OAuth intent
   HttpOnly 쿠키에 보존한다.
3. Supabase는 토큰 정본, `AuthSessionService`는 동기화 조정자, `auth_sessions`는 앱의 Refresh
   허용·기기·폐기·감사 기록으로 책임을 분리한다.
4. 서버/BFF가 Refresh Token 쿠키와 갱신을 독점하고 브라우저 Supabase Auth 세션 지속을 끈다.

### FOLLOW-UP CONTRACT — Confirm Email

- [x] `POST /api/v1/auth/registrations`를 쿠키·토큰·`auth_sessions` 없는 202 응답으로 확정했다.
- [x] 기존/확인 대기 이메일도 같은 202 응답을 사용해 이메일 열거를 막았다.
- [x] 메일 보안 스캐너의 GET 선소비를 막기 위해 확인 화면 뒤
  `POST /api/v1/auth/email-confirmations`에서만 token hash를 소비하도록 계약했다.
- [x] 확인 메일 재전송과 미확인 계정 로그인 오류 계약을 추가했다.
- [x] 24시간 intent TTL과 확인 후 고립 계정의 소유권 재증명 가입 복구 계약을 추가했다.
- [ ] Supabase 프로젝트에서 URL·메일 템플릿·발송 설정을 준비하고 Confirm Email 활성 상태를
  readback한다.

### OPEN — 오늘 범위 밖

5. `/login`, `/sign-up`, `/auth/confirm`, 기본 복귀 `/`와 팀 공통 법적 문서 경로의 팀 확정
6. Supabase·Google·Kakao 계정/프로젝트/앱/키/Redirect URI의 실제 준비 상태
7. 앱 세션 절대 수명 제안값 7일의 승인 또는 대체값 확정
8. 서로 다른 탭에서 인증 성공 응답이 교차하는 경우의 서버측 흐름 잠금·세대 번호 또는 OAuth
   same-site 2단계 확정 방식 선택. 이 항목은 실제 OAuth/세션 통합 전 차단 조건이다.
9. `auth_sessions` 저장소 장애 중 로그아웃 요청을 durable하게 수렴시킬 fingerprint tombstone/outbox
   또는 동등한 별도 폐기 경계. 브라우저 쿠키 삭제만으로 서버측 즉시 폐기를 완료 처리하지 않는다.

### TEAM SYNC — 구현 통합 전 필요

- `change-requests/2026-08-25-user-management-auth-boundaries.md`의 ADR-0011 초안을 팀 공통 정본으로
  승인한다.
- 운영 Supabase Auth의 URL·메일 템플릿·발송 설정을 준비하고 Confirm Email을 활성화한다. 이메일
  확인 전 202와 확인 POST 계약은 이 기능 원본에서 작성 완료했다.
- ERD의 `users.auth_user_id`와 `auth_sessions.provider_session_id` 매핑을 승인하고 마이그레이션
  방향을 확정한다.
- ERD I-39/I-40을 공급자 rotation·재사용 판정과 일치시키고, `app/server/AGENTS.md`의 브라우저 SDK 자동
  갱신 문구를 서버/BFF 방식으로 갱신한다. 이 두 파일은 팀장 전용이므로 이 브랜치에서 수정하지 않는다.

## 추적 근거

- `docs/decisions/0008-auth-method-supabase-auth.md`
- `docs/decisions/0009-external-vendor-interface-layer.md`
- `docs/domain/erd.md` — `users`, `auth_sessions`, `oauth_provider`, `user_role`
- `docs/domain/reference/prd-v6.4.md` — 로그인 유도 후 원래 화면 복귀와 `returnTo` 예시
- `docs/naming-convention.md` — 역할·DTO·외부 벤더 포트/어댑터·환경 변수 규칙
- `sdd-framework/feature-workflow.md`
- [Supabase Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) — 검증된 동일 이메일 자동 연결
- [Supabase User Management](https://supabase.com/docs/guides/auth/managing-user-data) — `auth.users.id`와 앱 사용자 매핑
- [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow) — 코드·verifier 일회성 교환
- [Supabase User sessions](https://supabase.com/docs/guides/auth/sessions) — rotation·reuse interval·parent 복구
- [Supabase JavaScript Auth](https://supabase.com/docs/reference/javascript/auth) — 서버 클라이언트 세션 지속 비활성화
- [Supabase signUp](https://supabase.com/docs/reference/javascript/auth-signup) — Confirm Email 사용 시 세션 없는 가입 응답과 계정 존재 은닉
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp) — token hash의 서버 교환
- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates) — BFF용 TokenHash 링크와 메일 prefetch 주의

## 비고

이 문서는 오늘의 SPEC과 로컬 구현 초안의 정본이다. API 계약, 인터랙티브 high-fi HTML, Q-02용
Mock 인증, 포트/서비스/인메모리 저장소/웹 훅 초안과 `prototype/run.tsx`를 같은 규칙으로 작성했고,
2026-08-26 기준 로컬 자동 검증 35/35와 scoped TypeScript 검사를 통과했다. 정확한 검증 범위와
미검증 항목은 `test-report.md`를 따른다.

실제 `supabase-auth.adapter.ts`는 fail-closed 자리표시자이며 Supabase·Google·Kakao·Postgres·실브라우저
쿠키 통합을 완료하지 않았다. 특히 인증 성공 응답 전 cross-tab 경합 정책과 7일 절대 TTL은 팀 승인
대기 중이므로 이 결과를 라이브 인증 구현 완료나 배포 승인으로 표시하지 않는다.
