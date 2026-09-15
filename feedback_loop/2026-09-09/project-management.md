# 2026-09-09 — CR-0012 · CR-AP-003 · CR-CP-001 app/ 반영 (팀장)

브랜치 `feature/teamlead-cr-port-2026-09-09`. 최종 통합일 작업 2번째 단위.

## 무엇을 했나

1. **CR-0012** (유동우가 이미 `app/server`에 직접 커밋해 둔 것을 cherry-pick, 충돌 없음) —
   `applyPricingAnalysisBudget`에 `PROJECT_EDIT_CLOSED`·`PROJECT_BUDGET_CONFLICT` 검증 추가.
   같은 커밋에서 규칙 14 판정(`effectiveRecruitmentStatus`)·규칙 16 판정(`isEditClosed`)을
   `recruitment-status.ts` 순수 함수로 추출(세 번째 사본 방지).
2. **CR-AP-003** — `getProjectNegotiationContext`가 저장값 대신 규칙 14 보정값을 반환하도록
   변경. `acceptProjectApplication`의 OPEN 판정도 같은 보정값으로 통일. `updateProject`가
   일정 변경 시 저장값 `recruitmentStatus`를 재계산. `app/web/src/shared/date.ts`를
   시작일/마감일용 함수로 분리(부수적으로 마감일 함수 자체의 9시간 오차도 같이 고쳤다 — 아래
   "발견" 참고).
3. **CR-CP-001** — `NegotiationContext`에 `title` 추가, contracts-payments가 계약 스냅샷에
   실제 제목을 찍도록 변경.

CR 문서 3건 모두 "반영 완료"로 상태 갱신함(각 CR 파일에 닫음 노트 작성).

## 담당자별 영향 · 후속 조치

**유동우 (project-management)** — 영향 없음, 후속 조치 없음. CR-0012는 본인이 이미
app/server에 직접 반영해 둔 것을 그대로 가져왔을 뿐이다. CR-AP-003·CP-001은 본인이 만든
`project-contract.service.ts`의 계약 함수 내부 로직만 바꿨고 함수 시그니처(입력)는 그대로다 —
prototype 쪽 코드는 이번에 건드리지 않았다(app/만 CR 이행). **확인 필요**: prototype
(`features/project-management/prototype/server/`)에도 같은 변경을 반영할지는 본인 판단 —
지금 app과 prototype이 이 두 CR 범위에서 갈라져 있다.

**조준영 (applications)** — 영향 없음, 후속 조치 없음. `ProjectApplicationContextPort`로
받는 `recruitmentStatus` 값이 조용히 정확해진다(구조적 타입이라 코드 변경 없이 통과). 재현
경로 3(모집 시작된 예약 프로젝트에 지원 수락 불가)도 같이 닫혔다.

**조준영 (contracts-payments)** — 영향 없음, 후속 조치 없음. `projectTitleSnapshot`/
`projectTitle`이 이제 실제 제목으로 채워진다 — 지금까지 빈 문자열이라 화면이 「프로젝트」로
가리던 4곳(공개 GET)이 실제 제목을 보여주게 된다(개선이지 결함 아님).

**최윤석 (reviews)** — 영향 없음. `project-review-context.adapter.ts`는 `transactionStatus`만
쓰고 `recruitmentStatus`·`title`은 안 본다.

## 발견 — 마감일도 9시간 밀려 있었다

CR-AP-003은 시작일만 문제 삼았지만, 확인해 보니 원래 마감일 변환 함수(`T23:59:59Z` 리터럴)도
PRD §13.1 시각 예시(`2026-08-31T14:59:59Z`, KST 23:59:59 기준)와 어긋나 있었다. 달력일
자체는 안 밀려서(마감일은 시:분:초만 어긋났다) 지금까지 드러나지 않은 결함이다. 이번에 같이
고쳤다 — `toIsoDeadlineOrEmpty`가 이제 `T23:59:59+09:00`으로 변환한다.

## 검증

- `app/server`, `app/web` tsc 통과
- `app/web` vite build 통과
- `app/server/tests/project-pricing-registration.test.ts` 8/8 통과 (CR-0012 회귀분)
