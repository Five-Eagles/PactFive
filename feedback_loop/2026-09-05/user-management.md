# user-management 피드백 — 2026-09-05 회원가입·이메일 확인 app/web 이식

반영 커밋: 로컬 전용, 브랜치 `feat/applications-reviews-integration`(develop 기준
`feature/applications`·`feature/reviews`·`feature/contracts-payments`를 이미 merge한 브랜치에
이어서 작업). **아직 push도 develop 반영도 안 됨** — 팀장이 확인 후 직접 push·PR·merge 진행 필요.
sync-log.md 기록: 없음 — 이 브랜치가 develop에 실제로 merge된 뒤 기록한다.

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — 회원가입(`/sign-up`)·이메일 확인(`/auth/confirm`) 화면을 마저 이식했다 (확인만 필요)

상태: 미확인

**Fact — 무엇을 했는지**
- 2026-08-27 1차 반영은 `/login`만 포함했다 — 회원가입·이메일 확인 화면은 그때 통합 범위
  밖이었다(`auth.routes.tsx`에 남아 있던 원래 주석 참고). 화면 진입 경로 자체가 없어서
  회원가입 페이지가 열리지 않는 상태였다("통합이 안 됨"이 아니라 "이 화면만 아직 이식되지
  않음" — 서버 API와 프로토타입 화면 코드는 이미 존재했다).
- `app/web/src/features/user-management/`에 `SignUpForm.tsx`(신규, 회원가입+가입 복구 겸용)·
  `EmailConfirmationPage.tsx`(신규) 2화면을 이식하고, `auth.routes.tsx`에 `/sign-up`·
  `/auth/confirm` 라우트를 추가했다(`AUTH_ROUTES.confirm` 신설).
- `useAuth.ts`에 `register`·`completeRegistration`·`confirmEmail` 콜백과 `restoreOnMount`
  옵션(가입 화면은 마운트 시 자동 세션 복원을 하면 안 된다)을 추가하고, `startOAuth`에 회원가입
  중 소셜 로그인을 위한 선택적 `role` 인자를 더했다. `api/auth.ts`에 대응하는 API 함수 3종을
  추가했다.
- `auth.types.ts`에 `RegisterInput`·`RegisterResponse`·`CompleteRegistrationInput`을 추가했다.

**어떻게 채웠는지 — 재해석한 부분**
- 원본 프로토타입은 자체 `AuthFrame`/`AuthNotice` 컴포넌트와 `AuthApiError` 클래스를 썼다.
  `LoginForm.tsx`가 이미 `shared/ui`(`PageBody`·`Field`·`Button`·`Notice`)와 app/web 공통
  `ApiError`(`shared/http.ts`)로 재해석해 둔 선례를 그대로 따라 두 화면도 재작성했다 —
  상태 기계·검증·오류 분류 로직은 그대로 옮기고, 표시 레이어만 다시 짰다.
- **줄인 것 1** — 역할 선택 UI를 2-카드 그리드에서 라디오 스타일 버튼으로 단순화했다(문구는
  그대로).
- **줄인 것 2** — 원본은 `AuthApiError.retryAfterSeconds`(서버 `Retry-After` 헤더 파싱값)로 429
  응답에 카운트다운을 보여준다. `shared/http.ts`의 `ApiError`는 이 헤더를 파싱하지 않는다
  (다른 기능도 이 값을 쓴 적이 없다) — 그래서 카운트다운 없이 고정 안내 문구만 보여준다.
  코드 주석으로 남겨뒀다. 필요해지면 `shared/http.ts`에 헤더 파싱을 추가하고 이어받으면 된다.
- 검증: `app/server`·`app/web` 양쪽 `tsc --noEmit` 통과, `app/web` `vite build` 통과
  (128 modules, 339.63 kB → 이후 ai-pricing 항목 2 반영으로 340.91 kB).

**담당자 메모 (확인만 해주면 됨 — 재작업 아님)**
- 위 두 가지 "줄인 것"이 실제 사용에 문제가 없는지만 봐주세요. 특히 429 카운트다운 생략은
  스팸성 재시도를 막는 UX 안전장치가 하나 빠진 것이라, QA 중 문제가 보이면 알려주세요.
  이상 없으면 상태를 `반영완료`로 바꿔주세요.

---

## 항목 2 — ai-pricing ↔ 프로젝트 등록 폼(3단계 퍼널) 왕복 연결 (확인만 필요)

상태: 미확인

**Fact — 무엇을 했는지**
- `feedback_loop/2026-09-04/ai-pricing.md`에 남아 있던 미연결 항목("등록 3단계 퍼널과의 실제
  연결은 아직 붙지 않았다")을 이번에 이었다. project-management(`ProjectRegisterForm.tsx`)와
  ai-pricing(`NewPricingAnalysisPage.tsx`)은 서로 import하지 않으므로, 기존
  `applyHref`/`applicantsHref`와 같은 슬롯 패턴을 재사용했다.
- `ProjectRegisterForm`(Step 2)에 "AI 추천 예산 받기" 버튼을 추가했다 — 누르면 현재까지 입력한
  title/description/category를 쿼리 파라미터로 실어 `pricingAnalysisHref`(App.tsx가 끼우는
  ai-pricing 소유 함수)로 이동한다.
- `NewPricingAnalysisPage`가 그 쿼리 파라미터로 분석 요청 초안을 미리 채운다. "이 추천 예산
  사용하기"를 고르면(`registerHref` prop, project-management 소유) `recommendedBudget`·
  `pricingAnalysisId` 쿼리 파라미터를 실어 등록 폼으로 돌아간다.
- `ProjectRegisterForm`은 마운트 시 이 두 파라미터를 읽어 예산 칸을 채우고 Step 2로 이동한 뒤
  안내 문구(`분석 ID ...를 반영했습니다`)를 보여주고, 쿼리를 지운다(새로고침 시 중복 적용
  방지). Step 1/2 다른 입력값은 기존 `useDraft`(sessionStorage)가 이미 보존하므로 별도 처리가
  필요 없었다.
- 카테고리 값 호환은 사전에 확인했다 — `PRICING_ANALYSIS_CATEGORIES`(ai-pricing)와
  `CATEGORY_OPTIONS`(project-management)의 값 문자열이 완전히 같아 번역 계층 없이 그대로
  주고받는다(두 기능이 각자 상수를 중복 보유하는 것은 "폴더 간 접점" 원칙대로다).

**담당자 메모 (확인만 해주면 됨 — 재작업 아님)**
- 두 기능 폴더가 서로 import하지 않고 슬롯으로만 이어졌는지, 그리고 쿼리 파라미터 이름
  (`recommendedBudget`·`pricingAnalysisId`·`title`·`description`·`category`)이 이후 다른
  화면에서 재사용해도 괜찮은 규칙인지만 봐주세요. 이상 없으면 상태를 `반영완료`로 바꿔주세요.

---

## 항목 3 — 이번 통합 범위에서 제외한 항목들 (참고용, 결정 요청 아님)

상태: 참고

이번 "미통합 화면 전수조사"에서 함께 검토했지만, "구현은 됐는데 안 이어진 것"이 아니라 성격이
달라 이번 반영 범위에서 뺀 항목들이다. 착오로 빠뜨린 게 아니라는 걸 남겨둔다.

- **notifications** — 프로토타입 코드 자체가 없다(`.gitkeep`만 있음). 이식할 대상이 없다.
- **experts 화면** — PRD 화면 목록에 없다. 만들지 말지부터 팀이 정해야 하는 제품 범위 결정
  사항이다.
- **계정 탈퇴(account withdrawal)** — `api-contract.md`에 "구현돼 있지 않다 / PROVISIONAL,
  팀 리뷰 필요"라고 명시돼 있다. 서버 자체가 잠정 상태라 웹을 먼저 이을 수 없다.
- **ProjectBrowsePage 카테고리 필터 칩** — 2026-08-28부터 별도로 추적 중인 화면 작업이다(이번
  전수조사보다 범위가 크다).
- **home.css 디자인 토큰 이름 불일치** — 팀 차원의 디자인 시스템 통일 작업으로 별도 추적 중이다.

---
