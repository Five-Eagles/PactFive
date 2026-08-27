---
title: "user-management 인증 경계 팀 통합 요청"
status: "제안"
requested_by: "오민혁"
date: "2026-08-25"
affected_docs:
  - docs/decisions/0011-supabase-auth-account-session-boundaries.md
  - docs/domain/erd.md
  - docs/domain/reference/erd-v1.5.dbml
  - docs/domain/reference/erd-v1.5.html
  - docs/domain/AGENTS.md
  - docs/domain/api-spec/user-auth-pricing.md
  - app/server/AGENTS.md
  - app/web/AGENTS.md
  - docs/naming-convention.md
  - .env.example
  - sync-log.md
affected_features:
  - user-management
  - sample-login
---

# user-management 인증 경계 팀 통합 요청

| 항목 | 내용 |
|---|---|
| 상태 | 제안 — 팀장 검토·승인 전 |
| 요청일 | 2026-08-25 |
| 원본 | `features/user-management/spec.md`, `features/user-management/api-contract.md` |
| 관련 ADR | ADR-0007, ADR-0008, ADR-0009 |

이 파일은 팀장 전용인 `docs/decisions/`, `docs/domain/`, `app/`을 기능 브랜치에서 직접 수정하지 않고
통합 변경을 요청하기 위한 문서다. 아래 내용은 승인 전까지 팀 공통 정본이 아니다.

## 승인 범위와 현재 판정

현재 판정은 **조건부 승인 요청 준비 완료**다. 승인자는 아래 네 핵심 정책과 그 보안 전제인 Confirm
Email을 함께 검토한다. Confirm Email은 별도의 다섯 번째 제품 기능 결정이 아니라, 검증된 동일 이메일
자동 연결을 안전하게 채택하기 위한 파생 운영 조건이다.

| 검토 단위 | 승인 요청 내용 | 현재 상태 |
|---|---|---|
| 계정 연결 | Supabase가 검증해 같은 UUID로 반환한 동일 이메일 identity만 자동 연결 | 검토 준비 |
| OAuth 앱 상태 | Supabase `state`·PKCE와 PactFive 역할·`returnTo` intent 분리 | 검토 준비 |
| 세션 동기화 | Supabase 토큰 정본 + `AuthSessionService` 조정 + `auth_sessions` 즉시 폐기 게이트 | 검토 준비 |
| 브라우저 세션 | BFF HttpOnly Refresh Token + 메모리 Access Token | 검토 준비 |
| 파생 운영 조건 | 운영 Confirm Email 활성화, manual identity linking 비활성화 | 설정 readback 필요 |
| 별도 수치 선택 | 앱 세션 최초 절대 수명 7일(`604800`초) | 승인 또는 대체값 필요 |
| 통합 차단 선택 | 서로 다른 탭의 인증 성공 응답 교차를 막는 서버측 흐름 조정 | 방식 선택·계약 갱신 필요 |
| 장애 폐기 경계 | 로그아웃 DB 장애에도 토큰 폐기를 수렴시키는 durable tombstone/outbox | 설계·저장소 승인 필요 |

이 문서 승인은 구현 완료, Supabase/Google/Kakao 키 준비 완료, 운영 배포 승인을 뜻하지 않는다. 승인
후 팀장 소유 정본과 migration 계획을 반영한 뒤 별도의 구현·통합 테스트 게이트를 통과해야 한다.

## 공식 근거 최종 대조

| 확인 항목 | 대조 결과 | 근거 |
|---|---|---|
| 동일 이메일 | Supabase가 검증된 동일 이메일 identity를 자동 연결하며, 미확인 identity는 보안상 별도 처리한다. 앱은 이메일 문자열 병합을 하지 않는다. | [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) |
| 세션 매핑·폐기 | JWT의 `session_id`로 공급자 세션을 식별한다. 로그아웃 뒤 JWT는 만료까지 남을 수 있어 앱의 활성 세션 검사가 필요하다. | [User Sessions](https://supabase.com/docs/guides/auth/sessions) |
| Refresh 경합 | reuse interval과 parent-token 복구가 있으므로 직전 fingerprint 일치만으로 탈취를 확정하지 않는다. | [User Sessions](https://supabase.com/docs/guides/auth/sessions) |
| OAuth code 교환 | PKCE verifier는 공급자 흐름과 함께 일회용으로 보존·검증한다. | [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow) |
| 이메일 가입 | Confirm Email 사용 시 가입 요청에서 세션이 없을 수 있고, 확인 링크/템플릿을 앱 경계에 맞춰야 한다. | [signUp](https://supabase.com/docs/reference/javascript/auth-signup), [Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates) |
| 운영 URL | Site URL과 허용 Redirect URL을 실제 HTTPS 경로로 제한한다. | [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) |

## 요청 요약

다음 네 가지 user-management 결정을 팀 공통 정책으로 승인해 달라고 요청한다.

1. 동일 이메일 계정은 Supabase가 소유권을 검증해 같은 `auth.users.id`에 자동 연결한 결과만
   신뢰한다. PactFive가 이메일 문자열로 identity를 직접 병합하지 않는다.
2. Supabase가 OAuth `state`·PKCE를 소유하고, 역할·안전한 `returnTo`는 별도의 10분짜리 인증 암호화
   HttpOnly intent 쿠키에 보존한다.
3. Supabase Auth를 토큰·재사용 판정의 정본으로, `AuthSessionService`를 동기화 조정자로,
   `auth_sessions`를 앱 Refresh 허용·기기·폐기·감사 투영으로 둔다.
4. 서버/BFF가 Refresh Token HttpOnly 쿠키와 갱신을 독점한다. 브라우저는 Access Token을 메모리에만
   두며 Supabase 세션 지속·자동 갱신을 사용하지 않는다.

운영의 동일 이메일 자동 연결 전제를 지키기 위해 Confirm Email을 켜고, 가입은 세션 없는 202로
응답한 뒤 사용자가 확인 화면에서 명시적으로 POST 검증할 때 사용자와 세션을 만든다. 확인 전 이름·
역할은 수정 가능한 일반 metadata가 아니라 서버가 인증 암호화한 일회용 `EmailRegistrationIntent`로
보존한다.

## ADR-0011 초안

권장 파일명:
`docs/decisions/0011-supabase-auth-account-session-boundaries.md`

권장 제목: **ADR-0011: Supabase Auth 계정 연결·OAuth intent·세션 책임 경계**

### 배경

ADR-0008은 Supabase Auth 채택을, ADR-0009는 외부 벤더 포트/어댑터를 확정했다. 그러나 실제 구현에
필요한 계정 연결 기준, OAuth 앱 상태, Supabase 세션과 앱 세션의 책임, HttpOnly 쿠키와 SDK의
관계는 정해지지 않았다. 기존 문구를 그대로 구현하면 다음 충돌이 생긴다.

- `oauth_provider + oauth_subject`는 한 Supabase 사용자에 복수 identity가 연결되는 모델을 안정적으로
  표현하지 못한다.
- 앱 데이터를 OAuth `state`에 섞으면 Supabase의 state·PKCE 책임과 충돌한다.
- Supabase와 `auth_sessions`가 rotation·재사용을 독립 판정하면 두 정본이 갈린다.
- 브라우저 SDK의 Refresh Token 접근은 HttpOnly-only 계약과 양립하지 않는다.
- `previous_token_hash` 일치 즉시 폐기는 Supabase의 정상 reuse interval·parent-token 복구를 공격으로
  오판할 수 있다.

### 검토 대안과 결정

| 영역 | 기각 | 채택 |
|---|---|---|
| 동일 이메일 | 공급자 subject 정본, 앱의 문자열 기반 수동 연결 | Supabase 검증 자동 연결 + `auth_user_id` |
| OAuth 앱 상태 | Supabase `state`에 역할·`returnTo` 삽입, 신규 DB/cache | 별도 보호된 10분 intent 쿠키 |
| 세션 | Supabase만 사용해 감사행 제거, 두 계층 독립 판정 | Supabase 토큰 정본 + 앱 세션 투영/게이트 |
| Refresh 보관 | 브라우저 SDK 지속·자동 갱신, 모든 토큰 쿠키화 | BFF HttpOnly Refresh + 메모리 Access Token |

#### 사용자와 identity

- `users.auth_user_id`를 Supabase `auth.users.id`와의 유일한 로그인 매핑 정본으로 사용한다.
- 검증된 동일 이메일을 Supabase가 같은 UUID로 연결한 경우 같은 PactFive 사용자로 처리한다.
- PactFive는 OAuth 이메일 문자열만으로 identity를 직접 연결하거나 수동 `linkIdentity`를 노출하지
  않는다. 다른 이메일 계정 병합은 MVP 범위 밖이다.
- 정상 런타임의 활성 사용자는 모두 `auth_user_id`를 가진다. 과거 데이터는 일회성 backfill 후
  `NOT NULL`로 잠그며 OAuth 콜백에서 즉석 연결하지 않는다.
- `oauth_provider`·`oauth_subject`는 첫 가입 출처로 유지할지 제거할지 ERD 마이그레이션에서 정하되
  로그인 정본으로 사용하지 않는다.
- Supabase가 비밀번호 해시와 이메일 로그인 방식 판정을 소유한다. PactFive는 공급자 해시를 읽거나
  복제하지 않고 `users.password_hash IS NULL`을 OAuth-only 판정에 사용하지 않는다. ERD v1.5에서는
  사용하지 않는 `users.password_hash` 제거를 요청한다.
- 운영 Confirm Email을 켜고 manual identity linking은 끈다. 미확인 이메일 선점 뒤 같은 이메일
  OAuth가 들어오는 경우를 계정 탈취 회귀 테스트로 고정한다.

#### OAuth intent

- Supabase SDK가 OAuth `state`, authorization code, PKCE 상태를 만들고 검증한다.
- `__Host-pactfiveOAuthIntent`에는 `version`, 고엔트로피 `nonce`, `oauthProvider`, 선택 역할,
  검증된 `returnTo`, 불투명 `providerFlowState`, `issuedAt`, `expiresAt`을 인증 암호화해 최대 10분
  보존한다.
- 쿠키는 `Secure; HttpOnly; SameSite=Lax; Path=/`, `Domain` 미지정이다.
- 한 브라우저의 최신 시도 한 건만 유효하다. 성공·실패 콜백 모두 쿠키를 지운다.
- 역할은 신규 사용자에만 쓰고 기존 역할을 바꾸지 않는다. `returnTo`는 시작과 콜백에서 같은
  동일 출처 허용 목록으로 검증하며 임의 콜백 값을 신뢰하지 않는다.
- Supabase `redirectTo`는 BFF의 `GET /api/v1/auth/oauth-callbacks`로 고정한다. BFF가 code 교환·앱
  사용자 검사·세션 생성을 마친 뒤 안전한 `returnTo`로 302하며 웹 `/auth/callback`은 만들지 않는다.
- 이미 유효한 PactFive Refresh 쿠키가 있으면 OAuth 시작을 `409 AUTH_CONTEXT_CONFLICT`로 거부한다.
  MVP 계정 전환은 현재 세션을 로그아웃한 뒤 새 흐름을 시작하는 방식만 허용한다.

### 교차 탭 인증 경합 — 통합 전 승인 선택

로컬 프로토타입은 같은 탭의 로그인·OAuth 시작·Refresh·로그아웃을 공용 mutation queue로 직렬화하고,
이미 발급된 OAuth intent는 저장소의 원자 nonce 소비로 callback과 이메일 인증 흐름 중 한 건만 이기게
한다. 그러나 요청이 시작될 때 아직 Refresh/OAuth intent 쿠키가 없고 서로 다른 탭의 응답이 교차하면
브라우저 메모리 잠금과 요청 시점 쿠키만으로는 계정 전환을 완전히 원자화할 수 없다. 예를 들어 탭 A의
OAuth 시작 응답이 늦는 사이 탭 B의 이메일 로그인이 완료된 뒤, 탭 A 응답이 새 intent 쿠키를 덮을 수
있다. 이 상태에서 live 어댑터를 활성화하지 않는다.

승인자는 실제 통합 전에 아래 중 한 방식을 선택하고 API 계약·ADR·통합 테스트를 함께 갱신한다.

| 대안 | 핵심 | 고려점 |
|---|---|---|
| 서버측 브라우저 인증 흐름 잠금/세대 번호 | 서버가 브라우저 흐름 ID의 최신 세대만 성공·쿠키 발급하도록 조건부 확정 | 교차 탭 전체 인증 액션을 포괄하지만 영속 상태·만료·복구 계약이 추가됨 |
| OAuth same-site 2단계 확정 | 공급자 callback은 일회용 결과만 만들고, 원래 사이트의 활성 세션·흐름을 재검사한 POST에서 최종 쿠키 발급 | OAuth 경계는 선명하지만 이메일 확인·복구·로그아웃 경합은 별도 세대 정책이 필요할 수 있음 |

현재 작성자는 두 대안 중 하나를 임의 승인하지 않는다. 선택 전에는 Mock/로컬 검증만 유효하며
Supabase·Google·Kakao live 왕복을 완료 상태로 표시하지 않는다.

#### 세션 책임

| 주체 | 책임 |
|---|---|
| Supabase Auth | Access/Refresh Token 발급·검증·rotation, 재사용 최종 판정, 공급자 세션 폐기 |
| `supabase-auth.adapter.ts` | 요청 단위 SDK 호출, 공급자 결과와 `error.code`의 도메인 변환 |
| `AuthSessionService` | 로그인·OAuth·이메일 확인·Refresh·로그아웃 순서와 보상 처리의 유일한 조정자 |
| `AuthSessionRepository` | `auth_sessions` 생성, CAS rotation, 폐기·감사 기록 |
| controller | Refresh/OAuth intent 쿠키와 no-store 응답 |
| 브라우저 | 메모리 Access Token, PactFive API 호출, Refresh 요청 single-flight |

- `auth_sessions.provider_session_id`를 Supabase JWT `session_id`와의 논리 매핑으로 사용한다.
- 모든 보호 API는 JWT 검증 뒤 같은 `provider_session_id`의 미폐기·미만료 `auth_sessions` 행을
  확인한다. 이 게이트로 로그아웃 직후 공급자 JWT의 잔여 유효 시간과 무관하게 401을 반환한다.
- 앱 사용자 검사와 세션 행 생성이 모두 성공한 뒤에만 토큰·쿠키를 노출한다. 실패하면 공급자 현재
  세션을 폐기한다.
- Refresh Token 원문은 서버 전용 키의 HMAC-SHA-256 fingerprint만 DB에 기록한다.
- 공급자가 새 Refresh Token을 반환한 때만 기대한 현재 fingerprint를 조건으로
  `current → previous`, `new → current`를 CAS 갱신한다. 정상 parent-token 복구로 현재 활성 토큰을
  돌려주면 no-op으로 수렴한다.
- `previous_token_hash` 일치만으로 재사용을 확정하지 않는다. 어댑터가 해당 공급자 세션과 상관 가능한
  `refresh_token_already_used`를 받은 경우에만 `REUSE_DETECTED`로 폐기한다.
  `refresh_token_not_found`는 재사용 확정 근거가 아니다.
- 로그아웃은 Origin 검증 뒤 Refresh cookie fingerprint로 로컬 `auth_sessions` 조건부 폐기와 쿠키/
  인증 컨텍스트 제거를 먼저 완료한다. Bearer Token은 선택 사항이므로 Access Token이 먼저 만료돼도
  HttpOnly 쿠키를 제거할 수 있다. 공급자 현재 세션 폐기는 안전하게 상관 가능한 자격 증명으로만
  best effort 수행하고, 공급자 지연·실패가 로컬 로그아웃을 되돌리지 않는다.

#### 서버/BFF 쿠키

- Refresh Token은 `__Host-pactfiveRefreshToken`에만 둔다.
- 운영 속성은 `Secure; HttpOnly; SameSite=Strict; Path=/`, `Domain` 미지정이며 `Max-Age`는 앱 세션의
  남은 절대 수명이다.
- Access Token은 응답 본문으로 전달하고 브라우저 메모리에만 둔다.
- 브라우저 Supabase 세션 지속·자동 갱신·URL 세션 감지는 사용하지 않는다.
- 서버 Supabase client는 요청 단위로 만들고 `autoRefreshToken: false`, `persistSession: false`,
  `detectSessionInUrl: false`로 명시적 인증 작업만 수행한다.
- 가입·가입 복구·재전송·이메일 확인·로그인·OAuth 시작·Refresh·로그아웃의 동일 출처 `POST | DELETE`는
  `credentials: include`, 허용 Origin 정확 비교, `Cache-Control: private, no-store`를 사용한다.
  공급자 OAuth `GET` 콜백은 Origin 대신 PKCE와 일회용 OAuth intent로 보호한다.
- 최초 앱 세션 절대 수명은 7일(`AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800`)을 제안한다. Refresh로
  연장하지 않으며 승인자가 대체값을 선택하면 관련 계약과 환경 변수 예시를 한 번에 바꾼다.

### 기존 ADR과의 관계

- ADR-0008의 Supabase Auth 채택과 ADR-0009의 포트/어댑터 결정은 유지한다. ADR-0011은 이를
  대체하지 않고 세션 소유와 동기화 방식을 구체화한다.
- 기존 확정 ADR 본문은 수정하지 않는다. 이후 이 정책이 바뀌면 ADR-0011을 편집하지 않고 새 ADR로
  대체한다.

### 위험

- 기존 사용자·세션에 UUID 필드를 곧바로 `NOT NULL`로 추가할 수 없다. 단계적 migration이 필요하다.
- 서버리스 동시 Refresh는 공급자와 DB 사이의 일시적 불일치를 만들 수 있어 브라우저 single-flight,
  DB CAS, parent-token 복구 통합 테스트가 필요하다.
- OAuth intent 키 rotation·로그 마스킹과 한 브라우저 한 흐름 제약을 구현해야 한다.
- Access Token은 영속화하지 않아도 실행 중 JavaScript에 있으므로 XSS 방어가 필요하다.
- 모든 보호 API의 활성 세션 조회가 요청 비용과 장애 전파를 늘릴 수 있어 인덱스와 관측 지표가
  필요하다. 보안을 약화하는 캐시 우회는 별도 승인 없이 도입하지 않는다.
- 로그아웃 시 `auth_sessions` 저장소가 실패하면 브라우저 쿠키 제거만으로 서버측 토큰 폐기를 증명할
  수 없다. live 통합 전 Refresh fingerprint 기반 durable revocation tombstone/outbox 또는 동등한
  별도 장애 경계를 정하고, 재처리 완료·절대 만료까지의 관측과 운영 대응을 승인한다.

## ERD 통합 요청

v1.4 고정판을 손으로 덮어쓰지 말고 `erd-v1.5.dbml`을 만든 뒤 HTML을 DBML에서 다시 export하는 방식을
권장한다.

### 필드

| 테이블 | 필드 | 목표 제약 | 비고 |
|---|---|---|---|
| `users` | `auth_user_id uuid` | `UNIQUE NOT NULL` | `auth.users.id` 논리 참조, 물리 FK 없음 |
| `auth_sessions` | `provider_session_id uuid` | 활성 행 `NOT NULL`, 값이 있으면 `UNIQUE` | JWT `session_id` 논리 참조. 과거 폐기 감사행은 NULL 허용 |
| `users` | `password_hash` | 제거 | Supabase 소유 비밀번호 해시를 앱 DB로 복제하거나 로그인 분기에 사용하지 않음 |

기존 데이터 migration은 `nullable 추가 → 검증·backfill/기존 세션 재로그인 처리 → UNIQUE 검증 →
NOT NULL` 순서로 한다. 신규 데이터는 첫 배포부터 값을 필수로 쓴다.

### Migration·rollback 승인 조건

1. `users.auth_user_id`는 먼저 nullable로 추가하고, 활성 사용자 수·Supabase 사용자 매칭 수·중복/미매칭
   수를 배포 전후 보고한다. 검증된 이메일과 UUID가 일대일인 행만 backfill하고 충돌 행은 자동 병합하지
   않는다.
2. 조건부 unique index를 먼저 만들고 신규 쓰기를 이중 검증한 뒤, 미매칭/중복이 0일 때만 `NOT NULL`로
   잠근다. `users.password_hash` 제거는 새 코드가 해당 필드를 읽지 않는 것이 확인된 다음 배포에서 한다.
3. 과거 `auth_sessions.provider_session_id`는 신뢰할 수 있게 backfill할 근거가 없으면 가짜 UUID를
   넣지 않는다. 기존 활성 세션을 폐기하고 재로그인을 요청한다. `revoked_at IS NULL`인 활성 행에는
   `provider_session_id IS NOT NULL` CHECK를 적용하고, 값이 있는 행에는 부분 UNIQUE index를 적용한다.
   과거 폐기 감사행은 NULL을 허용해 보존한다.
4. `NOT NULL` 전 rollback은 신규 쓰기 중단 → 새 index/column 제거 → 구버전 코드 재배포 순서다.
   cutover 후 rollback은 검증된 백업 복원과 구버전 코드 재배포가 필요하므로 팀장 승인과 점검 시간을
   별도로 잡는다. 각 단계에서 사용자·세션 수와 오류율을 확인하고 다음 단계로 진행한다.

### 불변식

- I-39: 공급자가 새 Refresh Token을 반환한 경우에만 CAS rotation한다. 정상 parent-token 복구로 현재
  활성 토큰이 반환되면 행을 바꾸지 않고 수렴한다.
- I-40: `previous_token_hash` 일치만으로 폐기하지 않는다. 해당 행과 상관 가능한 Supabase
  `refresh_token_already_used`에만 `REUSE_DETECTED`를 기록한다.
  `refresh_token_not_found`는 `AUTH_SESSION_INVALID`로 분류한다.

`docs/domain/erd.md`, `docs/domain/AGENTS.md`, 필요한 정본 포인터를 v1.5로 함께 갱신한다. SVG/HTML
다이어그램은 손편집하지 않는다.

## 서버 지침 통합 요청

`app/server/AGENTS.md`의 “Access/Refresh Token 발급·자동 재발급은 Supabase 클라이언트 SDK가
처리한다”를 다음 의미로 바꾼다.

> Supabase Auth는 토큰 발급·검증·rotation의 공급자 정본이다. 브라우저 Supabase 세션 지속과 자동
> 갱신은 사용하지 않는다. 서버/BFF의 `AuthSessionService`가 요청 단위 어댑터로 로그인·OAuth code
> 교환·이메일 확인·Refresh·로그아웃을 조정하고, Refresh Token은 HttpOnly 쿠키에만 둔다.

## Confirm Email 운영 게이트

- Email provider와 신규 가입 허용을 켠다.
- Confirm Email을 켠다. Management API readback에서는 `mailer_autoconfirm=false`여야 한다.
- 운영 Site URL과 정확한 HTTPS Redirect URL을 등록하고 wildcard를 사용하지 않는다.
- Confirm signup 템플릿은 기본 세션 fragment 대신 앱 소유 확인 화면에 `TokenHash`를 전달한다.
- 이메일 링크의 GET은 상태를 바꾸지 않는다. 화면에서 사용자가 확인 버튼을 누를 때
  `POST /api/v1/auth/email-confirmations`가 고정 `type='email'`로 `verifyOtp`를 호출한다.
- 가입 요청의 Supabase 사용자 UUID·정규화 이메일·이름·역할·검증된 `returnTo`·nonce·발급/만료 시각은
  애플리케이션 소유 `RegistrationIntentRepository`에 저장한다. 공급자 `app_metadata`나 일반
  `user_metadata` 원문을 권한 근거로 신뢰하지 않으며, 확인 성공 때 공급자 UUID·이메일과 일치하는
  intent로만 `users`를 만든다. 저장 실패 시 공급자 어댑터가 이 요청에서 새로 만든 사용자임을 신뢰할
  수 있게 보장하는 경우에만 미확인 공급자 사용자를 보상 삭제한다. Supabase 공개 `signUp` 응답만으로는
  신규 생성 여부를 판정하지 않으므로 소유권 검증을 생략하거나 기존 계정을 삭제하지 않는다.
- intent direct-completion TTL은 발급·정상 재전송부터 24시간이며 최신 nonce만 유효하다. 별도 30일
  recovery proof 만료를 같은 서명에 넣어 “PactFive가 시작한 가입” 증거로만 사용한다. 재전송은 유효
  intent의 만료를 회전할 수 있지만, intent가 없거나 만료되면 이메일만으로 이름·역할·`returnTo`를
  복원하지 않고 전체 가입 폼 재제출을 요구한다.
- 공급자 이메일 확인은 성공했지만 앱 사용자/세션 반영이 실패하면 유효한 intent를 즉시 지우지 않는다.
  다음 이메일 로그인에서 공급자 이메일과 intent를 다시 검증해 사용자·세션 생성을 멱등 완료한 뒤
  제거한다. 24시간 TTL 뒤에도 원 intent의 인증 태그·UUID·이메일·nonce와 30일 proof가 유효하면 정상
  이메일 로그인에서 공급자 세션을 폐기하고 Token이 없는 10분짜리 서버 서명
  `__Host-pactfiveRegistrationRecovery` 쿠키와 `409 REGISTRATION_COMPLETION_REQUIRED`를 반환한다.
  사용자는 `POST /api/v1/auth/registration-completions`에서 복구 쿠키와 이메일·비밀번호로 원 가입과
  소유권을 모두 증명하고 새 이름·역할·`returnTo`를 제출한다. 직접 Supabase 가입처럼 PactFive 서명
  증거가 없거나 30일이 지난 계정은 자동 생성하지 않고 감사 가능한 수동 지원으로 보낸다. 확인된
  공급자 UUID에 앱 사용자가 없을 때만 생성하며 기존 역할은 바꾸지 않는다.
- 확인 화면은 no-referrer/no-store, 제3자 리소스 없음, token hash 주소·로그 제거를 적용한다.
- 운영 전 custom SMTP, 링크 추적 비활성화, SPF/DKIM/DMARC, OTP 만료 1시간 이하를 확인한다.

## API 통합 순서

기능 원본에는 가입 202, 재전송 202, 이메일 확인 POST, 미확인 로그인 403, 고립 계정 가입 완료 POST를
반영했다. 팀장은 구현 검토 뒤 `docs/domain/api-spec/user-auth-pricing.md`에 반영한다.

현재 `docs/domain/api-spec/openapi.yaml`과 네 기능 그룹 문서는 모두 비어 있다. 저장소 지침상 네 그룹이
모두 최신일 때만 통합 OpenAPI를 만들므로 이번 요청으로 `openapi.yaml`을 단독 생성하지 않는다.

## 승인 후 필수 테스트 매트릭스

| 시나리오 | 기대 결과 |
|---|---|
| 확인된 기존 이메일 + 같은 이메일 Google/Kakao | Supabase가 같은 UUID로 연결한 경우에만 기존 사용자 로그인, 역할 불변 |
| 미확인 이메일 선점 뒤 같은 이메일 OAuth | 계정 탈취 없이 공급자 정책대로 안전 처리, 앱 문자열 병합 없음 |
| 같은 이메일이 다른 `auth_user_id`에 연결됨 | 일반 403, 공급자 세션 폐기, 계정 존재 정보 비노출 |
| 같은 UUID OAuth 동시 콜백 2건 | unique/CAS로 사용자·세션 중복 생성 없음 |
| 외부·`//`·fragment·제어문자 `returnTo` | 시작 단계 422, 콜백 재검증 실패 시 `/` |
| 이미 로그인한 브라우저의 OAuth 시작 | token/code 소비 전 409 `AUTH_CONTEXT_CONFLICT` |
| 이메일 확인 성공 후 앱 DB 실패 | 쿠키/토큰 없음, 다음 로그인에서 유효 intent로 멱등 복구 |
| intent 만료·위변조·재전송 | 이메일만으로 역할을 복원하지 않고 전체 가입 재제출 또는 소유권 재증명 복구 |
| 확인된 고립 계정 + 만료 intent | 로그인 409 후 registration-completions로만 사용자·세션 생성 |
| 직접 Supabase 가입 / 타 UUID intent 복사 | PactFive 서명·UUID·nonce 불일치로 자동 생성 차단 |
| 복구 쿠키 10분 / recovery proof 30일 경계 | 경계 전만 복구, 경계 후 쿠키 제거·수동 지원 |
| 최초 OAuth 역할 누락 / 기존 사용자 role 전달 | 신규 생성 거부 / 기존 저장 역할 유지 |
| Origin 누락·불일치 | 모든 동일 출처 인증 변경 요청을 상태 변경 전에 403 |
| Refresh 동시 요청·reuse interval·parent 복구 | 정상 재시도를 탈취로 오판하지 않고 한 활성 토큰으로 수렴 |
| 상관 가능한 `refresh_token_already_used` | 해당 앱 세션 `REUSE_DETECTED` 폐기 |
| 로그아웃 직후 미만료 Access Token 재사용 | 활성 `auth_sessions` 검사로 즉시 401 |
| Access Token 만료 + 유효 Refresh 쿠키 로그아웃 | 로컬 세션 멱등 폐기, HttpOnly 쿠키 제거, 204 |
| 공급자 로그아웃 timeout/5xx | 로컬 폐기·쿠키 제거 유지, 204 결과를 되돌리지 않고 감사 기록 |
| 공급자/DB 일시 장애 | `AUTH_PROVIDER_UNAVAILABLE`/`AUTH_SESSION_SYNC_FAILED`, 영구 로그아웃으로 가장하지 않음 |
| 7일 TTL 직전/직후 | 직전은 정상, 직후는 로컬 세션 폐기·쿠키 제거·401 |
| 배포 환경 Mock 토큰 | 두 고정 Mock 토큰 모두 항상 401, Authorization 원문 로그 없음 |

## 이번 요청과 별개로 남는 OPEN

- 앱 세션 절대 수명 제안값 7일을 승인하거나 대체값을 지정해야 한다.
- `RegistrationIntentRepository`/OAuth intent의 환경 변수 이름·키 rotation·성공 후 조건부 제거와
  만료 정리 절차는 구현 상세 검토에서 확정한다. 운영 구현은 별도 `pending_registrations` 테이블
  또는 동등한 durable 저장소를 사용하되 공급자 metadata를 권한 근거로 되돌리지 않는다.
- `/login`, `/sign-up`, `/auth/confirm`, `/terms`, `/privacy` 라우트의 팀 공통 소유자를 확정해야 한다.
- 실제 Google/Kakao 왕복과 Refresh 동시성 테스트는 키·Redirect URL과 구현이 준비된 뒤 수행한다.

## 승인 후 완료 조건

- [ ] ADR-0011을 `제안`에서 팀 승인 상태로 전환
- [ ] ERD v1.5 DBML/HTML과 요약 포인터 동기화
- [ ] 단계적 migration과 기존 세션 처리 확정
- [ ] `app/server/AGENTS.md`의 SDK 책임 문구 정정
- [ ] Confirm Email·URL·템플릿·SMTP 설정 readback 및 테스트 메일 검증
- [ ] 기능 구현 검토 뒤 공유 API 문서와 sync-log 반영

## 검토자 결정 기록

아래는 승인자가 직접 표시한다. 작성자가 미리 승인 상태로 바꾸지 않는다.

- [ ] **승인** — 네 핵심 정책과 Confirm Email 파생 조건을 ADR-0011/ERD/API 정본에 반영한다.
- [ ] **수정 요청** — 아래 의견 반영 후 재검토한다.
- [ ] **보류** — 외부 설정 또는 추가 증거가 준비될 때까지 정본 반영을 중단한다.

앱 세션 절대 수명:

- [ ] 제안값 7일(`604800`초) 승인
- [ ] 대체값: `________________`초

검토자: `________________`  검토일: `________________`

의견:

>
