# user-management 테스트 결과

담당자: 오민혁

테스트 날짜: 2026-09-04

테스트 기준: `origin/develop` eeb255e 기반 `feature/user-management` 작업 트리

## 자동 검증

- [x] 가입·확인·회원 탈퇴 UI 보완 후 `npx tsx prototype/run.tsx` 통과
  (PASS 개수: 53, FAIL 개수: 0)
- [x] user-management `prototype/` 전체 범위 strict TypeScript 검사 통과 (scoped tsc: PASS)
- [x] `npm run preview:build` 통과 (Vite production preview build)
- [x] `flowId`와 PKCE SDK 저장소 snapshot 복원에 대한 결정적 fake-client 어댑터 테스트 통과
- [x] 설치된 실제 SDK로 Kakao OAuth URL·PKCE snapshot 생성 no-network smoke 통과
- [x] 로컬 브라우저 1280×720에서 로그인·가입·이메일 확인 기본 배치와 가입 복구·입력 오류·접수·
  확인 복구·세션 충돌·로그아웃 실패 후 재시도, 회원 탈퇴 기본·최종 확인·차단 상태의 접근성 트리와
  초점 이동을 확인

53건은 `spec.md` 규칙·포트·live 어댑터 경계 25건, 로그인 필수 텍스트 11건, 가입 UI 3건,
회원 탈퇴 UI 1건, 확인 UI 3건, fragment 2건, route 1건, 웹 API 5건, 디자인 상태·금지 의존성 각 1건으로 구성된다. 이 결과는
Mock 공급자와 인메모리 저장소를 사용한 feature 구현 초안 검증이다. 로컬 브라우저 확인도 정적
high-fi의 배치·상태 전환만 대상으로 했으므로 실제 Supabase Auth, Google/Kakao OAuth, Postgres,
HTTP 쿠키 왕복이나 배포 앱 통합을 통과했다는 의미는 아니다. scoped tsc와 preview build도
`app/`의 실제 인증 라우트 통합 완료를 의미하지 않는다.

## 가입·이메일 확인·회원 탈퇴 UI 검증

- 회원가입은 역할 → OAuth → 이름 → 이메일 → 비밀번호 순서를, 가입 복구는 이메일 → 비밀번호 →
  이름 → 역할 순서를 SSR과 브라우저 접근성 트리에서 확인했다. 복구 모드에는 OAuth가 없다.
- 가입 202는 계정 생성 완료가 아닌 정보성 “가입 요청을 접수했습니다”로 표시한다. 재전송은
  loading/success/error를 분리하고, 실패 뒤에도 이메일·이름·역할을 유지한다.
- 로그인·가입 중 현재 세션이 충돌하면 같은 화면에서 “현재 계정 로그아웃”을 제공한다. 세션 종료가
  실패해도 작성 중인 입력과 로그아웃 재시도 동작을 유지하며, 성공한 뒤에만 충돌 동작을 닫는다.
- 이메일 확인은 fragment token을 pre-React 단계에서 한 번만 메모리로 옮기고 주소에서 제거한다.
  query token은 사용하지 않으며 잘못 붙은 `tokenHash`/`token_hash` query도 주소에서 제거한다. token은
  DOM·로그·브라우저 저장소에 넣지 않는다.
- 페이지 진입만으로 확인 POST를 보내지 않는다. ready 화면의 명시적 “이메일 확인하기” 동작에서만
  요청하며 success·expired·unavailable·recovery·sync-error·context-conflict·rate-limited·retryable
  상태마다 다음 행동을 구분한다. 429 `Retry-After` 동안은 재시도를 비활성화한다.
- 정적 CSS로 1200px shell, 840px 1열 전환, 767px/560px 모바일 규칙, 48px 입력, 44px 버튼,
  3:1 이상 interactive border 토큰, 100ms feedback과 reduced-motion 0ms 대체를 확인했다.
  실제 320px 장치와 200% 확대, 화면 읽기 도구 실사용은 아직 하지 않았다.
- 회원 탈퇴는 영향 확인, 비밀번호 또는 연결된 공급자 1개의 재인증 자리, 최종 확인, 처리 중, 409
  blocker, eligibility 실패, 재인증 만료, 요청 제한, 결과 불명, 로그인 필요, 완료 상태를 SSR과
  interactive high-fi로 확인했다. 최종 확인 진입 시 “탈퇴 그만두기”로 포커스를 보내며, 탈퇴 사유,
  내부 확인 문자열, proof, 멱등 키, blocker 식별 정보는 DOM에 렌더링하지 않는다.
- 탈퇴 화면은 API를 호출하지 않는다. 53번째 검증은 UI 상태·필수 문구·내부 비밀값 비노출만 확인하며
  WD-01~WD-08의 transaction, lock, idempotency/outbox, provider cleanup을 검증하지 않는다.

### ux-philosophy.md §6 자체 점검

| 검증 대상 | 자체 점검 결과 |
|---|---|
| 상태 이해 | 인증 ready·처리·오류 상태와 탈퇴 영향 확인·본인 확인·최종 확인·차단·결과 불명·완료를 제목/notice/버튼 문구로 구분한다. |
| 근거 이해 | 역할 불변, 202가 접수일 뿐 완료가 아님, 링크 방문과 명시적 POST의 차이를 화면에서 설명한다. |
| 작업 보호 | 검증된 `returnTo`와 작성 맥락을 표시하고 일시 장애·입력 오류에서는 값을 보존한다. 비밀번호는 성공 또는 복구 권한 종료 때만 지운다. |
| 복구 가능성 | 확인 메일 재전송·가입 복구·503 재시도와 함께 탈퇴 차단 항목의 안전한 내부 해결 경로, 상태 확인·결과 확인 재시도를 제공한다. |
| 선택권 | 이메일/OAuth 가입과 역할 선택을 제공하고, 탈퇴 최종 단계에서도 강조된 “탈퇴 그만두기”로 즉시 중단할 수 있다. |
| 비파괴성 | 확인 전 사용자·세션을 만들지 않고 탈퇴 화면도 API를 호출하지 않는다. 되돌릴 수 없는 영향과 보존 범위를 최종 실행 전에 다시 보여준다. |
| 접근 가능성 | fieldset/legend, 오류 연결, live status/alert, 44px 이상 조작 영역, focus-visible, reduced-motion과 탈퇴 최종 확인의 취소 초점을 구현했다. 320px·200%·실화면 읽기 도구 검증은 미완료다. |

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 (run.tsx의 테스트 이름, 또는 직접 확인한 방법) | 결과 |
|---|---|---|
| 1 | `R01` — 입력·확인 token 검증, 확인 전 사용자/세션/토큰 미생성, 활성 세션 충돌 선검사, 신뢰 가능한 intent 저장 실패 보상, live `identities` 생성 오판 방지, 고정 `type=email`, 10분/30일 가입 복구·변조·만료·재시도·직접 우회 차단을 확인 | 통과 (Mock·인메모리·fake Supabase) |
| 2 | `R02` — 활성 이메일 중복의 동일 202와 기존 사용자 불변, 확인 대기 intent 탈취 방지, 정상 재전송 nonce/token/24시간 TTL 회전, 만료 intent의 이메일-only 교체 금지를 확인 | 통과 (Mock·인메모리) |
| 3 | `R03` — 기존 사용자의 저장 역할이 두 번째 OAuth 시도에도 바뀌지 않음을 확인 | 통과 (Mock·인메모리) |
| 4 | `R04` — 최초 OAuth 사용자의 역할 필수와 기존 사용자의 intent 역할 무시를 확인 | 통과 (Mock OAuth) |
| 5 | `R05` — 계정 없음·비밀번호 오류·OAuth-only·탈퇴의 동일 401/메시지와 미확인 이메일의 403 분리를 확인 | 통과 (Mock Auth) |
| 6 | `R06` — 공급자 성공 후 앱 사용자 매핑 및 세션 저장 실패 시 공급자 세션 폐기와 로컬 세션 미생성을 확인 | 통과 (Mock·인메모리) |
| 7 | `R07` — 실패 시 `lastLoginAt` 미갱신, 전체 검사와 세션 생성 성공 뒤 갱신을 확인 | 통과 (인메모리) |
| 8 | `R08` — GOOGLE/KAKAO만 허용하고 서비스가 `AuthProvider` 포트를 사용하며 Supabase SDK를 직접 import하지 않음을 확인 | 통과 (Mock·정적 검사·2.112.4 `flowId`/PKCE snapshot fake-client) |
| 9 | `R09` — 공급자 이메일 문자열이 달라도 `authUserId`로 기존 PactFive 사용자를 매핑함을 확인 | 통과 (Mock·인메모리) |
| 10 | `R10` — 탈퇴 사용자 및 유효 이메일이 없는 OAuth 결과 거부와 공급자 세션 폐기를 확인 | 통과 (Mock OAuth) |
| 11 | `R11` — 동일 이메일/다른 UUID와 탈퇴 이메일 충돌, 활성 Refresh 세션 중 이메일/OAuth 계정 전환 차단, 수동 연결 부재, 전달된 OAuth intent와 다른 로그인 간 승자 고정 및 취소 후 실패 시 intent 쿠키 삭제를 확인 | 통과 (Mock·인메모리·controller), 요청 응답 전 cross-tab race 제외 |
| 12 | `R12` — 앱 사용자 ID·저장 역할·로그인 여부·Access Token 만료 상태 제공과 만료 토큰 거부를 확인 | 통과 (Mock·인메모리) |
| 13 | `R13` — 보호 요청 Bearer 헤더와 공개 응답에서 Refresh Token 원문 미노출을 확인 | 통과 (Mock·정적 검사) |
| 14 | `R14` — restore helper와 같은 epoch의 Refresh single-flight, 로그아웃 뒤 새 epoch가 이전 Promise에 합류하지 않음, 완료 전 인증 상태 미공개를 확인. 실제 앱 composition root의 1회 mount는 아직 연결되지 않음 | 부분 통과 (훅·웹 유틸·Mock), 앱 통합 제외 |
| 15 | `R15` — HMAC fingerprint rotation, `provider_session_id` 일치, CAS 실패 후 parent 수렴, Refresh/로그아웃 경합의 조건부 touch 실패, 매핑 소실 정리, 상관 가능한 reuse만 폐기, `not_found` 분리를 확인 | 통과 (Mock·인메모리 CAS) |
| 16 | `R16` — Refresh와 보호 컨텍스트에서 확정 401/공급자 일시 503 분리, 보호 API 401 뒤 1회 Refresh·1회 재시도, `returnTo` 보존, 동시 요청 single-flight, 세션 충돌 및 로그아웃 실패 뒤 로그아웃 재시도 상태 유지를 확인 | 통과 (웹 유틸·Mock) |
| 17 | `R17` — 복수 허용 Origin의 완전 일치와 비허용 Origin 선거부, Refresh 쿠키 기준 멱등 로그아웃, Bearer 없이 로컬 세션 폐기와 Refresh credential 공급자 폐기 요청, 저장소 오류를 명시적 503으로 분류하면서 모든 인증 쿠키 제거, Origin 거부 전 무변경, 동일 탭 mutation 직렬화, 확정 401의 epoch 무효화와 epoch 뒤 지연 Restore/최초 보호 응답/Refresh/재시도/401 결과 미게시·미이동을 확인 | 부분 통과 (Mock·인메모리·controller·웹 유틸), durable 장애 복구 제외 |
| 18 | `R18` — `__Host-` Refresh 쿠키 속성, 브라우저 영속 저장소/Supabase SDK 미사용, Refresh 및 보호 API에서 절대 수명 불연장·7일 제안 TTL 만료·공급자 정리를 확인 | 통과 (제안값·Mock·정적 검사) |
| 19 | `R19` — 이메일 로그인 결과의 안전한 `returnTo` 보존, 한 번만 이동하는 navigator와 앱 restore 성공 시 검증된 로그인 화면 입력만 사용하는 복귀 지점을 확인 | 통과 (Mock·웹 유틸·정적 검사) |
| 20 | `R20` — 서버·웹이 공유하는 허용 규칙으로 외부 URL·이중 슬래시·역슬래시·fragment·제어문자·비허용 경로를 거부하고 `/`로 안전 복귀함을 확인 | 통과 (단위 검사) |
| 21 | `R21` — 공급자 state/앱 intent 분리, 10분 암호화 intent, 변조·재사용·만료·code/PKCE 상태 교차 사용 차단, callback 성공·실패의 intent 쿠키 삭제를 controller 동작으로 확인 | 통과 (Mock OAuth·controller) |
| 22 | `R22` — 두 고정 Bearer의 정확 일치와 역할별 컨텍스트, 실제 Mock middleware 전달을 확인 | 통과 (Mock middleware) |
| 23 | `R23` — production/preview 거부, production Mock composition 시작 차단, Authorization 원문 미기록, 미설정 live adapter fail-closed, 32바이트 미만·목적 간 재사용 키 거부를 확인 | 통과 (Mock·정적 검사) |

회원 탈퇴 `WD-01`~`WD-08`은 PROVISIONAL 서버 설계다. 자동 테스트는 비활성 화면 1건만 포함하며,
상태표·transaction/lock·재인증·idempotency/outbox·개인정보 review gate가 닫힌 뒤 별도 서버 규칙
테스트를 추가한다.

## 아직 안 되는 것 (Known Issues)

- `@supabase/supabase-js` 2.112.4 기반 `supabase-auth.adapter.ts` 구현 초안과 `flowId`·PKCE SDK 저장소
  snapshot의 결정적 fake-client 테스트는 완료했다. 일반·Admin·Refresh·검증 작업은
  `persistSession: false`이며, OAuth 시작·교환만 SDK 제약 때문에 요청 단위 메모리 저장소에서 `true`다.
  실제 Supabase Auth, Google/Kakao 공급자, 실제 Postgres 저장소와는 연결하지 않았다.
- 가입 `RegistrationIntent`는 공급자 `app_metadata`/Admin `listUsers`가 아니라 앱의
  `RegistrationIntentRepository`가 소유하고, Refresh·Access 검증·폐기 포트는 각각
  `ProviderSession`, `VerifiedAccessSession`, 상관 검증 가능한 ACCESS/REFRESH credential로 정합화했다.
  이 변경 후 회귀 테스트와 scoped tsc도 통과했다.
- 실제 HTTP 서버와 실브라우저에서 `Set-Cookie`, `Max-Age`, `Secure`/`HttpOnly`/`SameSite`, Origin,
  `Cache-Control`, BFF 302 redirect 및 탭 간 동작을 검증하지 않았다. UI 자동 검증은 SSR·순수 helper·
  fetch contract 수준이며, 로컬 브라우저 검수도 정적 high-fi 상태 전환까지만 확인했다. 공용 preview의
  default export는 여전히 로그인이라 신규 React 가입·확인·탈퇴 컴포넌트를 실제 mount한 E2E 증거는 아니다.
- **배포 차단 — 앱 통합 미완료**: feature 원본에는 `/sign-up`·`/auth/confirm` 화면, fragment
  bootstrap helper와 `/settings/account/withdrawal` 비활성 UI가 있지만 `app/web`에는 `/login`만
  등록돼 있다. 탈퇴 API·재인증 흐름은 승인 전이라 연결하지 않는다. 가입·확인 두 신규 route와
  React import 전 fragment 캡처를 앱 composition root에서 연결해야 한다. 현재 `AppRoutes`와
  `LoginForm`이 각각 `useAuth()`를 만들어 인증 상태도 하나의 Provider/store로 합쳐야 한다.
  `AppShell` 아래에서는
  `AuthFrame`을 `PageBody` 또는 동등한 `<main>` landmark로 감싸고 전역 header를 중복 렌더하지 않는다.
- **배포 차단 — Vercel 경로·API rewrite**: 2026-09-04 배포 readback에서 `/`는 200이지만 `/login`,
  `/sign-up`, `/projects/new`, `/auth/confirm` 직접 진입은 404이고 `/api/v1/projects`는 502다.
  `app/web/vercel.json`에는 SPA fallback이 없고 `/api/:path*` 대상이
  `REPLACE-WITH-APP-SERVER-VERCEL-DOMAIN` 자리표시자라 실제 server deployment URL로 교체해야 한다.
- **배포 차단 — 서버리스 영속성 없음**: 통합 서버는 여전히 `InMemoryAuthRepository`를 사용한다.
  가입 intent·사용자·세션·nonce가 인스턴스 사이에서 사라질 수 있으므로 승인된 DB schema와
  transaction/CAS를 갖춘 영속 repository 전에는 가입·확인·복구를 운영 활성화할 수 없다.
- 저장소 전체 `npm run check:design`은 user-management가 아닌 applications/contracts-payments/reviews의
  `.success` 클래스 누락과 feature token 사본 표류 때문에 실패한다. 이번 feature의 strict tsc,
  53/53 검증과 preview build는 별도로 통과했다.
- **통합 차단 이슈 — 인증 성공 응답 전 cross-tab race**: 같은 탭의 로그인·OAuth 시작·Refresh·로그아웃은
  공용 mutation queue와 Refresh coordinator로 직렬화하고, OAuth intent 쿠키를 이미 받은 뒤의
  이메일 로그인/확인/복구와 callback 경합은 원자 nonce로 막는다. 그러나 탭 A의 OAuth 시작 요청이
  공급자 응답을 기다리는 사이 탭 B가 로그인하거나, 서로 다른 탭의 로그인·확인·복구·Refresh·로그아웃
  응답이 교차 도착하는 순서는 브라우저별 메모리 잠금만으로 원자 차단하지 못한다. 서버측 브라우저
  인증 흐름 잠금/세대 번호 또는 OAuth의 same-site 2단계 확정 정책이 정해지기 전에는 live 통합을
  승인하면 안 된다.
- 프로토타입은 승인 전 제안값인 앱 세션 절대 수명 7일을 주입해 검증했다. 팀 승인값이 바뀌면
  SPEC·API 계약·설정·테스트를 함께 변경해야 한다.
- 이메일 존재 여부에 따라 내부 경로와 공급자 호출 수가 달라질 수 있어 응답 시간 기반 계정 열거
  위험이 남아 있다. 앱 레이어의 IP/이메일 기준 rate limit, 균등한 응답 시간 정책, 운영 429 및
  `Retry-After` 동작은 구현·검증하지 않았다.
- 실제 Postgres의 `auth_user_id`/`provider_session_id` UNIQUE 제약, OAuth nonce 원자 소비,
  Refresh fingerprint CAS, 동시 가입·OAuth callback·복구 완료 트랜잭션과 rollback은 검증하지 않았다.
  현재 결과는 단일 프로세스 인메모리 저장소의 동작이다.
- 로그아웃에서 로컬 세션 저장소 조회·폐기가 실패하면 브라우저 메모리와 Refresh/OAuth/recovery
  쿠키는 제거하고 503 `AUTH_LOGOUT_SYNC_FAILED`를 반환하지만, 서버 행과 공급자 세션의 즉시 폐기를
  증명할 수 없다. 탈취된 토큰은 저장소 복구 또는 절대 만료 전까지 남을 수 있으므로 live 통합에는
  fingerprint 기반 durable revocation tombstone/outbox 또는 동등한 장애 복구가 필요하다.
- Supabase Confirm Email, 동일 이메일 자동 연결, manual identity linking 비활성화, Google/Kakao
  redirect URI·client 자격 증명·Kakao 이메일 동의 권한의 실제 대시보드 readback을 완료하지 않았다.
- Mock middleware의 실제 배포 composition root 제외와 운영 요청 E2E는 검증하지 않았다. 현재
  production/preview 차단 함수와 fail-closed live adapter는 로컬 경계 검증이며 배포 증거가 아니다.

## 팀장에게 물어봐야 하는 것

- 앱 세션 절대 수명을 제안값 7일로 승인할지, 다른 값으로 정할지 확인이 필요하다.
- 인증 성공 응답 전 cross-tab race를 막을 서버측 흐름 잠금·세션 세대 번호 또는 OAuth same-site
  2단계 확정 정책을 선택하고 실제 인증 통합 전 차단 조건으로 승인해야 한다.
- 이메일 응답 시간 균등화와 IP/이메일별 rate limit 기준, 429 및 `Retry-After` 계약을 확정해야 한다.
- 실제 DB의 UNIQUE·CAS·nonce 소비·가입/복구 트랜잭션 경계와 필요한 마이그레이션을 승인해야 한다.
- 로그아웃 DB 장애 시 사용할 durable revocation tombstone/outbox의 저장 위치·재처리·만료 계약을
  승인해야 한다.
- Supabase·Google·Kakao 설정과 키 주입을 readback한 뒤 live adapter 및 통합 테스트 착수 여부를
  결정해야 한다.
- 확인 서비스의 `REGISTRATION_COMPLETION_REQUIRED`는 confirmation endpoint의 409 계약에 반영했다.
  통합 구현은 로그인에서 검증된 recovery proof·복구 쿠키를 발급받는 경로만 허용해야 한다.
- SPA fallback, 실제 API rewrite 대상, `/sign-up`·`/auth/confirm` 앱 route와 pre-React fragment
  bootstrap, 단일 AuthProvider/store의 통합 순서를 승인해야 한다.
