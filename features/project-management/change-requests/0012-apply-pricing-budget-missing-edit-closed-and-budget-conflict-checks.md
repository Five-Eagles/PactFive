# CR-0012 — `applyPricingAnalysisBudget`(규칙 40)에 PROJECT_EDIT_CLOSED·예산 conflict 검증이 없다

| | |
|---|---|
| 제기 | 팀장 · 2026-09-04 (ai-pricing app/ 통합 중 발견) |
| 확인 필요 | 유동우 (project-management) |
| 상태 | 제안 |
| 관련 | `project-contract.service.ts` `applyPricingAnalysisBudget` · CR-0003 · features/ai-pricing/api-contract.md · `app/server/src/features/ai-pricing/project-budget-application.adapter.ts` |

## 요약

ai-pricing Step 2(`POST /api/v1/pricing-analyses/:id/apply`)를 project-management의 계약
함수 7(`applyPricingAnalysisBudget`, 규칙 40)에 위임하도록 오늘 통합했다(팀장 결정,
2026-09-04 — 두 기능이 독립적으로 설계한 "예산 반영" 경로가 같은 멱등키 형식
(`pricing-apply-{analysisId}`)에 우연히 도달해 있었고, project-management 쪽이 이미
완성돼 있어 그걸 재사용하기로 했다).

위임하면서 대조해 보니 project-management 쪽 구현에 ai-pricing이 기대하는 두 가지 검증이
없다.

## 무엇이 빠졌나

`ai-pricing/prototype/server/project-budget-application.port.ts`가 정의한
`ProjectBudgetApplicationErrorCode`에는 있지만 `applyPricingAnalysisBudget`(규칙 40)이
검사하지 않는 것:

| 코드 | ai-pricing이 기대하는 것 | project-management 현재 구현 |
|---|---|---|
| `PROJECT_EDIT_CLOSED` | 모집이 마감됐거나 거래가 시작됐으면 예산 반영을 막는다(`updateProject`의 규칙 16과 같은 검증) | 검사 없음 — 마감·거래 시작 여부와 무관하게 반영된다 |
| `PROJECT_BUDGET_CONFLICT` | 호출자가 알고 있던 `expectedBudgetAmount`가 현재 프로젝트 예산과 다르면 막는다(화면이 보여준 "현재 예산"이 이미 바뀐 경우 보호) | 검사 없음 — `expectedBudgetAmount` 자체를 입력으로 받지 않는다 |

`PROJECT_EDIT_LOCKED`(대기 지원)·`PROJECT_VERSION_CONFLICT`(버전 충돌)는 이미 있다.

## 왜 지금 막지 않았나

`app/server/src/features/ai-pricing/project-budget-application.adapter.ts`는 위임
원칙(예산 쓰기·잠금 검증을 중복 구현하지 않는다)을 지키기 위해 이 두 코드를 스스로
검증하지 않기로 했다 — project-management가 검증하지 않는 것을 어댑터가 대신 검증하면
"검증 로직의 정본이 어디인가"가 다시 두 곳으로 갈라진다. 그래서 지금은 이 두
`ProjectBudgetApplicationErrorCode`가 이 경로에서 발생하지 않는다(타입에는 남아 있다).

## 영향

- 모집이 마감된 프로젝트, 또는 이미 거래(계약/결제)가 시작된 프로젝트에도 예산 반영이
  통과한다 — `updateProject`(A-04)라면 `PROJECT_EDIT_CLOSED`로 막았을 상황이다.
- 화면이 오래된 "현재 예산" 값을 들고 반영을 눌러도 막히지 않는다 — 다른 곳에서 먼저 예산이
  바뀐 걸 모르고 덮어쓸 수 있다.

## 제안

`applyPricingAnalysisBudget`에 두 검증을 추가한다.

1. `PROJECT_EDIT_CLOSED` — `updateProject`가 이미 쓰는
   `effectiveRecruitmentStatus(project, at) === 'CLOSED' || project.transactionStatus !== 'NONE'`
   조건을 그대로 재사용
2. `expectedBudgetAmount`를 `ApplyPricingBudgetInput`에 새 선택 필드로 추가하고, 있으면
   `project.budgetAmount`와 대조해 다르면 `PROJECT_BUDGET_CONFLICT`(또는 기존
   `PROJECT_TRANSITION_CONFLICT`로 통합해도 무방 — 유동우 판단)

`ProjectTransactionPort.applyPricingAnalysisBudget`의 `ApplyPricingBudgetInput` 타입과
`app/server/src/features/ai-pricing/project-budget-application.adapter.ts`의
`delegateErrorCode` 매핑도 같이 맞춰야 한다(어댑터는 코드 문자열만 보고 매핑하므로,
project-management가 새 코드를 던지기 시작하면 어댑터 쪽 if문 두 줄만 추가하면 된다).

## 대안

지금 상태로 둔다 — 두 검증 없이도 정상 흐름(모집 중·거래 전 프로젝트에 반영)은 막히지
않는다. 다만 "확정된 예산을 조용히 덮어쓸 수 있다"는 위험이 남으므로 채택하지 않았다.
