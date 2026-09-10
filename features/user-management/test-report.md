# user-management 테스트 결과

담당자: 오민혁

## 2026-09-10 담당 원본 로그인 동기화·프로필 인계

기준: develop `38ab13c`에서 시작한 `fix/owner-qa-handoff`. 수정은 `features/user-management/`
내부만이며 app, 배포, 공유 DB/API, 운영 계정, 기존 feedback 상태는 변경하지 않았다.

- [x] `npx tsx features/user-management/prototype/run.tsx` — **106 PASS / 0 FAIL**
  (기존 101개 + 공유 상태 저장소 구독 회귀 5개).
- [x] `npx tsc -p features/user-management/prototype/tsconfig.json` — strict PASS.
- [x] `npm run preview:build` — PASS (102 modules, 기존 화면 빌드 회귀).
- [x] `git diff --check` — PASS. app/공유 문서/package manifest·lockfile diff 없음.
- [x] `npx tsx features/user-management/prototype/tests/auth-hook.integration.ts` —
  **12 PASS / 0 FAIL**, React 18 마운트 훅 2~3개를 함께 렌더해 검증.
- [ ] app 적용 후 실제 브라우저/배포 회귀 — **미실행**, 팀장 통합 후 필요.
- [ ] `/profile` 이름·이메일 화면 검증 — **BLOCKED**, 원본에도 독립 프로필 화면/상세 API가 없다.

마운트 훅 테스트는 선택 실행이다. 기본 의존성을 늘리지 않기 위해 `react-test-renderer@18.3.1`
설치가 있을 때만 별도 명령을 사용한다. 이번 실행에서는
`npm install --no-save --package-lock=false --ignore-scripts react-test-renderer@18.3.1`로 임시
준비했으며 package manifest/lockfile을 변경하지 않았다. 실제 브라우저/HTTP 측정이 아니라
합성 fetch 응답(외부 네트워크 없음)과 React 구독/상태 전이 검증이다. 성공 응답 fixture에서
`authenticated` 필드가 빠진 최초 실행 실패 1건은 fixture를 계약대로 보정한 뒤 재실행해 해소했다.

| 규칙/회귀 | 실제 확인 범위 | 결과 |
|---|---|---|
| R12/R14 소비자 상태 공유 | 로그인 성공 즉시 헤더/폼 갱신, 늦게 마운트한 소비자 최신 상태, 구독 해제, 안정적 snapshot | PASS |
| R14 초기/동시 복원 | 새 소비자 마운트에 불필요한 refresh 없음, 동시 restore 2개가 refresh+context 각 1회 공유 | PASS |
| R12/R17 계정 전환 | 제출 중 이전 토큰 제거, 새 역할/이메일로 동시 전환, 이전 restore 응답 무시 | PASS |
| R16 오류 구분 | refresh 503은 retryable+기존 메모리 토큰 유지, 잘못된 로그인 401은 원래 안내 문구 | PASS |
| R17 로그아웃 경쟁 | 즉시 비인증 게시, 지연 성공/실패가 새 로그인을 지우지 않음, 늦은 로그인 성공은 로그아웃 뒤 복원 금지 | PASS |
| R17 외부 무효화 | clearAccessTokenInMemory가 모든 소비자와 토큰을 비움 | PASS |
| SSR 격리 | 서버 snapshot은 비인증이며 브라우저 공유 세션을 반환하지 않음 | PASS (저장소 단위) |
| PC-01~PC-08 | 기존 내부 프로필 완성도 24개 회귀 | PASS; 실제 DB/화면 검증 아님 |

UX §6: 새 화면·디자인·문구·레이아웃은 변경하지 않았다. 상태 이해 항목은 폼/헤더의 같은
로그인 상태 게시로 보완했고, 복구 가능성은 503 재시도·로그아웃 실패 안내 회귀로 확인했다.
나머지 기존 인증 시안의 SSR 필수 요소·반응형/reduced-motion 계약 검사는 기본 106개에 포함된다.
실제 시각/키보드/모바일 QA는 이번 훅 테스트로 대신하지 않는다. cross-tab 경쟁, 실제 쿠키
응답 순서와 서버측 무효화는 기존 팀 승인/통합 검증 범위로 남는다.

팀장용 파일 매핑·원본 프로필 누락 정정·통합 회귀:
`change-requests/0001-profile-completion-integration.md`의 2026-09-10 후속 절.

## 2026-09-08 사용자 평점 캐시·인증 식별자 후속

검증 범위는 `features/user-management/**`다. 기존 77개에 평점 소비 18개와 ID 생성 6개를
추가했다. app·DB·worker·공급자 실연동은 검증하지 않았고 피드백 상태도 임의 종결하지 않았다.

- [x] `npx tsx features/user-management/prototype/run.tsx` — **101 PASS / 0 FAIL**
- [x] `npx tsc -p features/user-management/prototype/tsconfig.json` — strict PASS
- [x] `npm run preview:build` — PASS (102 modules, 기존 화면 회귀 빌드)
- [x] `git diff --check` — PASS

| 규칙 | 확인 방법 | 결과 |
|---|---|---|
| UR-01 | 이벤트 불량 ID/별점/날짜 차단, 윤년 UTC, 기존 긴 ID, reader에 대상 전달 | PASS |
| UR-02 | 공개 합계 대체, 0건 초기화, 2자리 정확 반올림과 count 상한 | PASS |
| UR-03 | 중복·역순 재집계, 소비자 2개 동시/지연 집계, 다른 사용자 병렬 실행 | PASS |
| UR-04 | unknown/탈퇴/owner mismatch 차단, 같은 잠금의 탈퇴 후 재수신 거부 | PASS |
| UR-05 | 비정상 sum/count, reader·잠금·commit 실패, rollback/재전달 성공, 내부 오류 비노출 | PASS |
| UR-06 | 입력·조회 복제, transaction 재사용 금지, callback 실패 rollback, 전달 객체 변경 격리 | PASS |
| ID-01 | prefix/30자/alphabet, 48bit 시각·80bit 난수 왕복, 경계 오류, 동일 밀리초 2048건 중복 없음 | PASS |
| ID-02 | 기본 생성기로 가입 확인·세션 발급, 기존 36자 사용자 ID 보존 | PASS |

신규 테스트: `prototype/tests/user-rating.test.ts`, `prototype/tests/auth-record-id.test.ts`.
ULID 중복 표본 검사는 무충돌의 수학적/운영 보장이 아니며 DB PK 제약은 유지한다. Mock 직렬화는
공유 인스턴스 내부 보장뿐이다. 실제 DB row lock/최신 snapshot, reviews 공개 후 durable 전달,
worker retry/dead-letter, app 생성기 변경/기존 데이터 영향은 통합 후 검증해야 한다.
새 UI가 없어 신규 디자인/브라우저 QA는 해당 없음이며 기존 SSR 계약은 회귀 검사에 포함했다.

## 2026-09-08 프로필 완성도 포트 증분

기준: `origin/develop ec1c01f`를 동기화한 `feature/user-management` 작업 트리.
변경 범위는 user-management의 내부 조회 포트·Mock·문서·테스트이며 기존 인증/화면은 변경하지 않았다.

- [x] `npx tsx features/user-management/prototype/run.tsx` — **77 PASS / 0 FAIL**
  (기존 인증·UI 53개 + 신규 프로필 24개; 아래 규칙별 값 조합을 포함한 테스트 묶음 수)
- [x] `npx tsc -p features/user-management/prototype/tsconfig.json` — strict PASS
- [x] `npm run preview:build` — PASS
- [x] applications 실제 prototype Mock에 새 포트를 주입한 별도 로컬 계약 smoke — 6개 시나리오 PASS
  (완성 eligibility, 미완성 eligibility/누락 코드, 미완성 POST 409, 복구 뒤 POST 201,
  저장소 장애의 eligibility 503, 저장소 장애의 POST 503). 네트워크·외부 저장 없이 메모리로 실행했다.

| 규칙 | 확인 방법 | 결과 |
|---|---|---|
| PC-01 | 전달 ID/36자 호환, 한 호출당 snapshot 1회, 사용자·프로필 소유자 일치, 계정별 격리 | PASS |
| PC-02 | 회사명 1~100자/공백, enum 6종/폐기 값, 기타 잔존값, 선택 필드 없는 완성 프로필 | PASS |
| PC-03 | 카테고리·경력 0/32767 및 범위·비유한 수, 활성 기술/빈 연결/40자 ID/비활성 | PASS |
| PC-04 | 두 역할 프로필 없음, 복수 누락 코드 순서, 오래된 완성 시각이 있어도 미완성 | PASS |
| PC-05 | 기존 UTC 시각/초 정규화/윤년, NULL·잘못된 날짜·UTC 아닌 값·자동 날짜 보정 거부 | PASS |
| PC-06 | unknown/탈퇴/잘못된 역할·ID, 저장소 동기/비동기 실패, 불량 snapshot·혼합 기술/희소 배열 | PASS |
| PC-07 | 동결 snapshot 무변경, seed/조회 중첩 복제, 응답 비공유, 기술 제거·복구·탈퇴 최신 조회 | PASS |
| PC-08 | applications `createApplicationApiMock(at, { profiles: createProfileCompletionPort(repository) })` 주입 및 409/503/201 smoke | 로컬 PASS; app/실DB는 미검증 |

새 테스트 원본: `prototype/tests/profile-completion.test.ts`.
이번 변경은 서버 내부 포트이므로 신규 화면·디자인·브라우저 레이아웃 QA는 해당 없음이다.
기존 화면의 SSR/디자인 계약 테스트는 53개 회귀 검사에서 유지했다.

**미완료/통합 조건:** 운영 DB snapshot adapter, 프로필 저장과 completed_at 갱신/백필,
실제 지원 트랜잭션 동시성, profile 화면/복귀 동선, app 연결은 이번에 구현·검증하지 않았다.
project-management의 2상태 실패 매핑, ETC 잔존 문서, 기존 인증 ID 36자와 DB varchar(30) 차이는
`change-requests/0001-profile-completion-integration.md`에서 별도로 요청한다. 기존 인증 피드백의
상태를 이번 작업에서 임의로 닫지 않았으며, 통합/배포 완료를 의미하지 않는다.

## 2026-09-04 인증·UI 검증 (이전 기록)

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
