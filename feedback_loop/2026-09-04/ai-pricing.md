# ai-pricing 피드백 — 2026-09-04 통합 (Step 2 CR 6건 + app/ 서버·웹 반영)

반영 커밋(prototype 기준): `a9881bd` (origin/feature/ai-pricing)
sync-log.md 기록: 없음 — 이 통합은 develop 직속 브랜치에서 진행했다(오늘 오전 ERD/PRD 정정과
같은 브랜치). 다음 sync-log 갱신 때 함께 반영한다.

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — [충돌] ai-pricing ↔ project-management: "예산 반영" 경로를 두 도메인이 각자 설계했다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- ai-pricing Step 2(`api-contract.md`)는 `ProjectBudgetApplicationPort`(오민혁 설계, apply
  시 project-management를 부르는 outbound port)를 새로 정의했다.
- project-management는 이미 같은 일을 하는 "계약 함수 7"
  `applyPricingAnalysisBudget`(spec.md 규칙 40, `project-contract.service.ts`)을 갖고 있고,
  `/internal/v1/projects/:projectId/apply-pricing-budget`로 노출돼 있었다.
- 두 설계는 서로 몰랐다 — 그런데 멱등키 형식이 우연히 똑같다
  (`pricing-apply-{analysisId}`, `project-transaction.port.ts`의 `IDEMPOTENCY_KEY.applyPricingBudget`
  vs ai-pricing `pricing-analysis.service.ts`의 `expectedKey`).

**어떻게 채웠는지**
- 팀장이 사용자(RW)에게 AskUserQuestion으로 확인 후, project-management의 기존 계약 함수를
  재사용하는 쪽으로 정했다. `app/server/src/features/ai-pricing/
  project-budget-application.adapter.ts`가 `projectContractService.applyPricingAnalysisBudget`에
  위임하고, 성공하면 ai-pricing 자신의 `pricing_analyses.applied_at` CAS만 이어서 수행한다
  (contracts-payments의 `project-management.adapter.ts`와 같은 delegate 패턴 — 폴더 간
  직접 import 없음).
- CR-0003(유동우가 2026-08-26에 이미 제기)이 정확히 이 방향(읽기 전용
  `getPricingAnalysisRecommendation`)을 제안해 뒀었다 — 그 CR을 이번에 확정했다
  (`features/project-management/change-requests/0003-*.md` 상태를 "반영 완료"로 변경).

**왜 그렇게 채웠는지 (근거)**
- project-management 쪽이 이미 완성·테스트된 검증(권한·잠금·버전 충돌)과 자기 멱등 저장소를
  갖고 있어, ai-pricing이 같은 검증을 다시 구현하면 두 곳에 같은 규칙이 갈라진다(오늘 오전
  배치 아키텍처 논의에서와 같은 "과설계 피하기" 원칙).
- 다만 대조 과정에서 project-management 쪽에 없는 검증 2건(`PROJECT_EDIT_CLOSED`, 예산
  conflict)을 발견해 CR-0012로 새로 열었다 — 아래 항목 2 참고.

**담당자 메모**
- (오민혁 확인 요청: 이 설계 변경이 Step 2 spec의 `ProjectBudgetApplicationPort` 절과
  달라졌다 — `api-contract.md`를 이 통합에 맞춰 갱신할지, 아니면 prototype 전용 설계로 남길지
  결정 필요)

---

## 항목 2 — [충돌] project-management 계약 함수 7에 검증 2건이 빠져 있다

본문 위치: `features/project-management/change-requests/0012-*.md` 참조 (팀장이 새로 제기)

상태: 미확인

---

## 항목 3 — CR-AP-003을 saga/outbox가 아니라 단일 DB transaction으로 단순화해 채택했다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- ai-pricing의 CR-AP-003(`change-requests/0003-pricing-application-idempotency-atomicity.md`)은
  프로젝트 예산 반영의 교차 도메인 원자성을 saga/보상 트랜잭션에 준하는 설계로 제안했다.

**어떻게 채웠는지**
- ERD E-33·E-36, PRD D-93, `schema.prisma` `[PRISMA-GAP-6]`에 이미 기록했다 — 두 도메인이
  같은 Postgres DB를 쓰므로 saga 없이 단일 DB transaction(지금은 Prisma 미도입이라
  in-memory 순차 쓰기 + 뮤텍스로 흉내)으로 단순화했다.

**왜 그렇게 채웠는지 (근거)**
- 오늘 오후 회의 예정 안건이었던 "배치/Outbox 아키텍처 도입" 논의와 같은 원칙 — 지금
  규모(5인·22일, 단일 Postgres)에서 saga/outbox는 과설계다.

**담당자 메모**
- (오민혁 확인 요청 — CR-AP-003 원안과 달라진 점 인지 바람)

---

## 항목 4 — 화면은 shared/ui 공용 컴포넌트로 재해석했고, design/_tokens.css의 `pricing-*` 클래스는 쓰지 않았다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `design/high-fi.html`·`prototype/web/*.tsx`는 자체 클래스 체계(`pricing-card`,
  `pricing-button--primary` 등)를 쓴다. app/web/AGENTS.md의 "재해석 원칙"과 다른 기능들의
  선례(2026-08-28 CR)에 따라, 화면 구조와 문구는 시안 그대로 옮기되 마크업은 `shared/ui`
  공용 컴포넌트(`Button`·`Field`·`Notice`·`kv`·`card`)로 다시 짰다.

**어떻게 채웠는지**
- `app/web/src/features/ai-pricing/pricing-analysis/{RequestForm,ResultReport,StatusPanels}.tsx`,
  `NewPricingAnalysisPage.tsx`, `PricingAnalysisApplyPage.tsx`.
- design/high-fi.html "필수 요소 목록"에 있는 정확한 문구는 전부 그대로 옮겼다. `npm run
  check:design` 같은 클래스 대조 검증은 이번 반영에서 돌리지 않았다(시간 제약) — 다른
  기능들처럼 shared/ui 기존 클래스만 썼기 때문에 새 클래스 불일치는 없을 것으로 보이지만,
  실제 화면을 브라우저로 열어 시안과 픽셀 단위로 대조하지는 못했다.

**왜 그렇게 채웠는지 (근거)**
- 시간 제약 하의 팀장 판단. 구조·문구·상태 흐름(요청→제출중→결과→반영/거절→오류복구)의
  정확성을 CSS 픽셀 정합보다 우선했다.

**담당자 메모**
- (오민혁 확인 요청 — 실제 화면을 열어 시안과 대조 부탁)

---

## 항목 5 — 등록 퍼널·프로젝트 상세 화면에서 이 기능으로 들어오는 진입 버튼이 아직 없다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- 화면 자체(`/pricing-analyses/new`, `/pricing-analyses/:id/apply`)는 붙었고 `NOT_INTEGRATED_
  ROUTES`에서 뺐다. 하지만 `ProjectRegisterForm.tsx`(등록 Step 2)·`ProjectDetailPage.tsx`(예산
  영역)에 "AI 단가 분석으로 이동" 링크는 아직 추가하지 않았다 — project-management의 이미
  테스트된 등록/상세 컴포넌트를 오늘 시간 안에 안전하게 건드릴 확신이 없었다.

**어떻게 채웠는지**
- `PricingAnalysisApplyPage`는 `projectId`·`currentBudgetAmount`·`expectedProjectVersion`을
  쿼리스트링으로 받는 계약을 정했다 — `pricing-analysis.routes.tsx`의
  `PRICING_ANALYSIS_ROUTES.apply(pricingAnalysisId, {...})`가 그 URL을 만든다. 상세 화면에
  이 함수로 만든 링크 하나만 추가하면 연결된다.

**왜 그렇게 채웠는지 (근거)**
- 다른 기능 소유자의 이미 동작하는 코드를 리뷰 없이 고치는 위험보다, 계약(쿼리스트링 모양)을
  명확히 남기고 연결은 후속 작업으로 미루는 쪽을 택했다.

**담당자 메모**
- (유동우 확인 요청 — `ProjectRegisterForm.tsx`·`ProjectDetailPage.tsx`에 링크 추가 부탁,
  또는 팀장에게 다음 통합 때 맡겨도 됨)
