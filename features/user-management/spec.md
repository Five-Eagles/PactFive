# user-management — SPEC

## 문서 상태

- 작성 기준일: 2026-08-25
- 작업 단계: Step 1 — 기능 정의와 외부 연동 준비 상태 확인
- 상태 표기:
  - **FACT**: 저장소 정본이나 확인 작업으로 검증된 내용
  - **ASSUMPTION**: 다음 설계를 진행하기 위한 작업 가설. 팀 확인 전에는 확정 정책이 아님
  - **OPEN**: 확인 또는 결정이 필요해 구현 근거로 사용할 수 없는 내용

이 문서에는 자격 증명의 존재 여부와 준비 상태만 기록한다. API 키, Client Secret, 토큰 등의 실제
값은 기록하거나 커밋하지 않는다.

## 목적

PactFive 사용자가 이메일 또는 Google/Kakao 계정으로 가입·로그인하고, 선택한 역할에 맞는 인증
컨텍스트와 세션을 안전하게 유지하도록 한다. 인증이 필요한 화면에서 로그인으로 이동한 사용자는
인증 성공 후 원래 화면으로 복귀한다.

## 범위

### 포함

- **FACT**: 이메일+비밀번호 회원가입과 로그인
- **FACT**: Supabase Auth를 통한 Google·Kakao OAuth 가입과 로그인
- **FACT**: `CLIENT` 또는 `FREELANCER` 역할 선택과 인증 컨텍스트 제공
- **FACT**: Access Token 전달, 세션 복원, Refresh Token 갱신, 현재 세션 로그아웃의 기대 동작
- **FACT**: 탈퇴 계정과 소셜 전용 계정의 이메일 로그인 제한
- **FACT**: 로그인 유도 전 경로를 `returnTo`로 보존하고 인증 성공 후 복귀
- **ASSUMPTION**: 웹 인증 화면의 초기 라우트 계약(`/login`, `/sign-up`, `/auth/callback`)

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
5. **OPEN**: Supabase Auth가 관리하는 세션과 PactFive `auth_sessions` 행을 생성·갱신하는 정확한
   책임 경계는 아직 API 계약과 구현으로 확정되지 않았다. 아래 세션 규칙은 ERD가 요구하는 결과를
   정의하며, Supabase 내부 구현을 복제하라는 뜻이 아니다.
6. **OPEN**: Supabase Auth가 이메일 비밀번호 해시를 소유하므로 PactFive 앱은 공급자 해시를 읽거나
   복제하면 안 된다. ERD의 `users.password_hash`를 Supabase 방식에서 어떤 값으로 유지할지와
   소셜 전용 여부를 어떤 앱 소유 정보로 판정할지는 구현 전에 ERD·API 계약과 함께 확정한다.

## 관련 엔티티 (근거: `docs/domain/erd.md`)

### `users`

이 기능에서 사용하는 필드는 다음과 같다. 필드명은 ERD v1.4 표기를 그대로 사용한다.

| 컬럼 | 사용 목적 |
|---|---|
| `id` | PactFive 사용자 식별자 |
| `email` | 이메일 로그인 식별자 및 소셜 계정 연동 키 |
| `password_hash` | ERD상 이메일 비밀번호 사용 가능 여부. Supabase 방식의 저장·판정 책임은 OPEN이며 공급자 해시 복제 금지 |
| `name` | 회원가입 시 생성할 사용자 이름 |
| `role` | `CLIENT` 또는 `FREELANCER` 권한 컨텍스트 |
| `oauth_provider` | `GOOGLE` 또는 `KAKAO` |
| `oauth_subject` | OAuth 공급자 사용자 식별자 |
| `last_login_at` | 마지막 로그인 성공 시각 |
| `deleted_at` | 탈퇴 계정 로그인 차단 판정 |

### `auth_sessions`

| 컬럼 | 사용 목적 |
|---|---|
| `id` | PactFive 세션 식별자 |
| `user_id` | 세션 소유 사용자 |
| `refresh_token_hash` | 현재 Refresh Token의 해시. 원문 저장 금지 |
| `previous_token_hash` | rotation 직전 토큰 해시와 재사용 탐지 기준 |
| `device_label` | 현재 기기 표시용 설명 |
| `issued_at`, `expires_at`, `last_used_at` | 발급·만료·최근 사용 시각 |
| `revoked_at`, `revoked_reason` | 세션 폐기 시각과 사유 |
| `created_at` | 세션 행 생성 시각 |

`revoked_reason` 값은 ERD의 `LOGOUT`, `LOGOUT_ALL`, `REUSE_DETECTED`, `PASSWORD_CHANGED`,
`USER_WITHDRAWN`를 따른다. 이 단계에서 새 값을 추가하지 않는다.

## 업무 규칙

### 가입과 역할

1. **[FACT] 이메일 회원가입** — 사용자가 유효한 `email`, 비밀번호, `name`, `role`을 제출하면
   인증 공급자 계정과 PactFive `users` 행을 만들고 `role`에는 `CLIENT` 또는 `FREELANCER` 중
   하나만 저장한다. 비밀번호 원문은 PactFive DB와 로그에 저장하지 않는다.
2. **[FACT] 활성 이메일 중복 방지** — 같은 `email`을 가진 활성 사용자(`deleted_at IS NULL`)가
   이미 있으면 새 이메일 계정을 만들지 않는다. 계정 존재 여부를 과도하게 노출하지 않는 정확한
   오류 문구와 상태 코드는 `api-contract.md`에서 확정한다.
3. **[FACT] 역할 불변** — 회원가입 완료 후 `users.role`은 변경할 수 없다. 역할 전환 API와
   화면을 만들지 않으며, 다른 역할이 필요하면 팀 정책에 따른 별도 계정 흐름을 사용한다.
4. **[ASSUMPTION] OAuth 최초 가입의 역할 선택** — 처음 보는 `oauth_provider` +
   `oauth_subject`로 가입할 때도 계정 생성 완료 전에 `CLIENT` 또는 `FREELANCER`를 반드시 선택한다.
   OAuth 왕복 동안 선택 값을 위·변조되지 않게 보존하는 방식은 API 계약에서 정한다.

### 이메일 로그인

5. **[FACT] 동일한 인증 실패 응답** — 존재하지 않는 `email`, 틀린 비밀번호,
   `deleted_at IS NOT NULL`인 탈퇴 계정, `password_hash IS NULL`인 소셜 전용 계정은 모두 이메일
   로그인을 거부한다. 네 경우는 계정 상태를 추측할 수 없도록 같은 401 응답과 같은 사용자 메시지로
   처리한다.
6. **[FACT] 앱 레이어 상태 검사** — Supabase Auth가 인증에 성공했더라도 PactFive 앱 레이어는
   연결된 `users` 행의 `deleted_at`과 로그인 방식에 필요한 필드를 확인한 뒤에만 인증 성공을
   확정한다. 검사에 실패하면 공급자 세션을 폐기하고 인증 컨텍스트를 만들지 않는다.
7. **[FACT] 로그인 성공 기록** — 모든 앱 레이어 검사를 통과한 경우에만 `last_login_at`을 현재
   시각으로 갱신하고 인증 컨텍스트와 세션을 반환한다.

### Google/Kakao OAuth

8. **[FACT] 공급자 제한** — 이 기능이 허용하는 `oauth_provider`는 ERD의 `GOOGLE`, `KAKAO`뿐이다.
   OAuth 시작·콜백은 `AuthProvider` 포트를 거치며 UI·서비스가 Supabase SDK를 직접 호출하지 않는다.
9. **[FACT] OAuth 사용자 매핑** — OAuth 콜백이 성공하면 검증된 공급자 식별자를
   `oauth_provider` + `oauth_subject` 조합으로 매핑한다. 기존 사용자는 연결된 `users` 행으로
   로그인하고, 최초 사용자는 역할 선택과 필수 가입 정보를 완료한 후 행을 생성한다.
10. **[FACT] OAuth 후 탈퇴 계정 차단** — OAuth 공급자 인증이 성공해도 연결된 `users.deleted_at`이
    채워져 있으면 PactFive 로그인을 거부하고 생성된 공급자 세션을 폐기한다.
11. **[OPEN] 동일 이메일 계정 연결 정책** — OAuth가 반환한 `email`이 기존 이메일 계정과 같을 때
    자동 연결할지, 재인증을 요구할지, 중복 가입을 거부할지는 아직 확정되지 않았다. 이 결정 전에는
    이메일만으로 OAuth 계정을 자동 연결하지 않는다.

### 인증 컨텍스트와 세션

12. **[FACT] 인증 컨텍스트** — 앱이 인증 완료 상태를 공개하려면 최소한 PactFive `userId`,
    `email`, `role`, 로그인 여부, Access Token 만료 상태를 한 컨텍스트에서 제공한다. 권한 판정에는
    OAuth 공급자 프로필의 역할값이 아니라 `users.role`을 사용한다.
13. **[FACT] 보호 API 호출** — 인증 컨텍스트가 있는 사용자가 보호 API를 호출할 때 Access Token을
    `Authorization: Bearer <token>`으로 전달한다. Refresh Token 원문을 Authorization 헤더,
    애플리케이션 로그 또는 PactFive DB에 넣지 않는다.
14. **[ASSUMPTION] 앱 시작 시 세션 복원** — 앱을 다시 열거나 새로고침하면 `AuthProvider`가 공급자
    세션을 복원한 뒤 PactFive 사용자 상태를 다시 검증한다. 검증이 끝나기 전에는 인증됨으로
    간주하지 않는다.
15. **[FACT] Refresh Token rotation 결과** — 세션을 갱신할 때 `auth_sessions.refresh_token_hash`를
    새 해시로 교체하고 기존 해시는 `previous_token_hash`로 옮긴다. 직전 토큰 재사용을 감지하면
    해당 세션을 즉시 폐기하고 `revoked_reason`을 `REUSE_DETECTED`로 기록한다.
16. **[ASSUMPTION] 자동 갱신 실패 처리** — Access Token 만료 전 또는 보호 API의 인증 만료 응답 후
    `AuthProvider`를 통해 세션 갱신을 한 번 시도한다. 갱신 토큰이 만료·폐기됐거나 갱신이 실패하면
    로컬 인증 컨텍스트를 비우고 로그인 화면으로 이동하며 현재 경로를 `returnTo`로 보존한다.
17. **[FACT] 현재 세션 로그아웃** — 사용자가 로그아웃하면 공급자 로그아웃을 수행하고 현재
    `auth_sessions` 행의 `revoked_at`과 `revoked_reason='LOGOUT'`을 기록한 뒤 로컬 인증 컨텍스트를
    비운다. 로그아웃 완료 후 보호 화면을 인증된 상태로 계속 표시하지 않는다.
18. **[OPEN] Refresh Token 보관 책임** — ERD는 Refresh Token 원문을 HttpOnly 쿠키로만 전달하도록
    요구하지만 ADR-0008은 Supabase 클라이언트 SDK의 자동 갱신을 전제로 한다. 브라우저 SDK 세션
    저장 방식, 서버의 쿠키 발급 주체, `auth_sessions` 동기화 방법은 구현 전에 팀장이 확정해야 한다.

### `returnTo` 복귀

19. **[FACT] 원래 화면 복귀** — 비로그인 사용자가 인증이 필요한 화면에 접근하면 로그인 화면으로
    이동하면서 원래의 앱 내부 경로를 `returnTo`에 보존하고, 로그인 또는 가입 성공 후 그 경로로
    한 번만 복귀한다. PRD의 확정 예시는 `?returnTo=/projects/new`다.
20. **[ASSUMPTION] 안전한 복귀 경로** — `returnTo`는 `/`로 시작하는 동일 출처의 상대 경로만
    허용한다. 스킴이 있는 URL, `//`로 시작하는 URL, 제어 문자가 포함된 값, 파싱에 실패한 값은
    폐기하고 `/`로 이동한다.
21. **[ASSUMPTION] OAuth 왕복 보존** — OAuth 리다이렉트 중에는 `returnTo`를 서명되거나 서버에서
    검증 가능한 OAuth state/세션에 보존한다. 콜백 요청의 임의 쿼리값만 신뢰해 외부 URL로
    이동하지 않는다.

## 웹 라우트 목록

현재 `app/web`에는 라우터 구현이 없으므로 아래 경로는 오늘의 디자인·API 계약을 맞추기 위한
**ASSUMPTION**이다. 팀이 경로를 확정하기 전에는 `app/`에 반영하지 않는다.

| 라우트 | 상태 | 책임 |
|---|---|---|
| `/login` | ASSUMPTION | 이메일 로그인, Google/Kakao 로그인 시작, `returnTo` 수신 |
| `/sign-up` | ASSUMPTION | 이메일/OAuth 가입, `CLIENT`/`FREELANCER` 역할 선택, `returnTo` 수신 |
| `/auth/callback` | ASSUMPTION | OAuth 콜백 검증, 앱 사용자 검사, 안전한 `returnTo` 복귀 |
| `/` | ASSUMPTION | 유효한 `returnTo`가 없을 때의 안전한 기본 복귀 경로 |

로그아웃과 토큰 갱신은 페이지 라우트가 아니라 인증 액션으로 정의한다. `/projects/new` 등 보호
화면은 각 기능 담당자가 소유하며, user-management는 해당 경로를 새로 만들지 않고 인증 유도와
복귀 계약만 제공한다.

## 외부 계정·키 준비 상태

2026-08-25 확인 기준이다. “미확인”은 준비되지 않았다고 단정하는 의미가 아니라, 현재 세션과
저장소에서 실제 연동 가능 상태를 검증하지 못했다는 뜻이다.

| 대상 | 상태 | 확인된 내용 | 다음 확인 |
|---|---|---|---|
| Supabase | OPEN — 미확인 | 대시보드 로그인 상태가 아니어서 프로젝트, Auth provider 설정, URL/키 발급 여부를 검증하지 못함 | 프로젝트 접근, Site URL/redirect URL, Email/Google/Kakao provider 설정 확인 |
| Google Cloud | OPEN — MFA 차단 | Google 계정과 Cloud 프로젝트 존재는 확인. MFA 때문에 Credentials 화면 진입이 중단되어 OAuth Client 준비 여부는 미검증 | MFA 완료 후 OAuth consent screen, Web client, redirect URI 확인 |
| Kakao Developers | OPEN — 미확인 | 대시보드 로그인 상태가 아니어서 앱, REST API 키, Client Secret, Redirect URI, 비즈니스 상태를 검증하지 못함 | 앱 접근, Kakao Login 활성화, Redirect URI, 비즈니스 전환과 이메일 동의 항목 확인 |
| 저장소·로컬 환경·GitHub | FACT — 값 없음 | 사용할 수 있는 Supabase/Google/Kakao 자격 증명 값이 확인되지 않음. 루트 `.env.example`도 현재 비어 있음 | 비밀값은 배포/로컬 secret 저장소에 주입하고 `.env.example`에는 변수명과 설명만 추가 |

### 준비 완료 판정 기준

다음 항목을 실제 값 노출 없이 모두 “확인됨”으로 바꿔야 라이브 OAuth 구현을 시작할 수 있다.

- **OPEN**: Supabase 프로젝트 접근과 Auth의 이메일 로그인이 활성화돼 있다.
- **OPEN**: Google/Kakao provider가 Supabase Auth에 연결돼 있다.
- **OPEN**: 로컬·프리뷰·배포 환경별 Site URL과 Redirect URI가 공급자/Supabase 양쪽에서 일치한다.
- **OPEN**: 브라우저에 노출 가능한 공개 키와 서버 전용 비밀 키의 저장 위치·접근 주체가 분리돼 있다.
- **OPEN**: Kakao 앱의 비즈니스 전환 여부와 이메일 동의 항목 사용 가능 여부가 확인됐다.
- **OPEN**: 실제 계정으로 Google/Kakao 로그인 왕복과 로그아웃을 각각 한 번 이상 검증했다.

## 구현 전에 닫아야 할 OPEN 항목

1. 기존 이메일 계정과 동일 이메일 OAuth 계정의 안전한 연결 정책
2. OAuth 최초 가입에서 역할과 `returnTo`를 보존하는 정확한 state/서버 세션 형식
3. Supabase 세션과 `auth_sessions`의 생성·rotation·폐기 동기화 책임
4. Refresh Token을 HttpOnly 쿠키로만 전달한다는 ERD 계약과 브라우저 SDK 자동 갱신의 정합 방식
5. `/login`, `/sign-up`, `/auth/callback`, 기본 복귀 `/`의 팀 확정
6. Supabase·Google·Kakao 계정/프로젝트/앱/키/Redirect URI의 실제 준비 상태

## 추적 근거

- `docs/decisions/0008-auth-method-supabase-auth.md`
- `docs/decisions/0009-external-vendor-interface-layer.md`
- `docs/domain/erd.md` — `users`, `auth_sessions`, `oauth_provider`, `user_role`
- `docs/domain/reference/prd-v6.4.md` — 로그인 유도 후 원래 화면 복귀와 `returnTo` 예시
- `docs/naming-convention.md` — 역할·DTO·외부 벤더 포트/어댑터·환경 변수 규칙
- `sdd-framework/feature-workflow.md`

## 비고

이 문서는 오늘의 SPEC 단계 산출물이다. API 계약, 인터랙티브 HTML, Mock, 구현 초안,
`test-report.md`는 후속 단계에서 이 규칙 번호를 기준으로 작성한다.
