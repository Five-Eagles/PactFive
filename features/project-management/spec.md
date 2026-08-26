# project-management — SPEC

## 목적

의뢰인이 등록한 프로젝트라는 게시물의 일생을 관리한다. 등록·조회·수정·삭제·모집 마감·취소·재모집까지가 이 기능의 범위이고, 지원서·계약·결제·알림은 다른 기능이 담당하되 계약 함수로만 연결된다.

## 범위

- **포함**: 프로젝트 등록(3단계) · 목록·검색·필터 · 상세 조회 · 수정(조건부 잠금) · 소프트 삭제 · 모집 마감 · 취소 · 재모집 · 다른 도메인에 제공하는 상태 변경 계약 8종
- **제외**: 북마크·추천(`features/engagement/`) · 지원서 접수와 알림 발송(최윤석) · 금액 합의·계약·결제(조준영) · 인증과 AI 단가 분석(오민혁)

## 관련 엔티티 (근거: `docs/domain/erd.md`)

### `projects`

`id` · `client_id` · `title` · `description` · `category` · `budget_amount` ·
`recruitment_start_at` · `recruitment_deadline_at` · `recruitment_status` · `transaction_status` ·
`application_count` · `pending_application_count` · `recruitment_closed_at` · `canceled_at` ·
`deadline_notified_at` · `accepted_application_id` · `payment_pending_at` · `project_version` ·
`created_at` · `updated_at` · `deleted_at`

### `project_skills`

`project_id` · `skill_id` · `created_at`. 복합 PK `(project_id, skill_id)`.

### 읽기만 하는 것

`skills`(오민혁) — 기술 표시명과 `is_custom` 판정.
`applications`(최윤석) — `pending_application_count`의 원본. **캐시와 어긋나면 원본이 옳다.**

---

## 상태 모델 — 규칙보다 먼저 읽을 것

이 기능의 모든 규칙이 여기서 나온다.

```text
recruitment_status      SCHEDULED · OPEN · CLOSED          모집 축 (공개)
transaction_status      NONE · CONTRACT_PENDING ·
                        IN_PROGRESS · COMPLETED · CANCELED  거래 축 (비공개)
```

**두 축은 별개이며 하나로 합치지 않는다.** `projects`에 `status`라는 단일 컬럼은 존재하지 않는다.

---

## 규칙

### 등록

1. 등록은 3단계로 입력받되 **서버에는 마지막 단계에서 한 번만 저장한다.** 중간 단계를 서버에 임시 저장하지 않는다.
2. 등록 요청에 `title`(5~100자) · `description`(20~5000자) · `category` · `budget_amount`(1 이상) · `recruitment_deadline_at` · `skillIds`(1~10개)가 모두 있어야 한다. 하나라도 없거나 범위를 벗어나면 `422`.
3. `recruitment_deadline_at`은 **현재 시각보다 뒤**여야 하고, **현재 시각 + 1일 이상**이어야 하며, **`created_at` + 365일 이내**여야 한다. 각각 다른 오류 코드로 구분한다.
4. `recruitment_start_at`이 비어 있으면 즉시 모집(`OPEN`)으로, 미래 시각이면 `SCHEDULED`로 생성한다. 두 경우 모두 `transaction_status`는 `NONE`이다.
5. `skillIds`에는 **공식 기술만** 넣을 수 있다. `skills.is_custom = true`인 기술이 하나라도 포함되면 `422`.
6. 등록은 **의뢰인 역할만** 가능하다. 프리랜서가 요청하면 `403`.
7. 프로필이 완성되지 않은 의뢰인은 등록할 수 없다. 완성 여부는 컬럼을 직접 읽지 않고 user-management의 판정을 호출해 확인한다.
8. 요청에 `pricingAnalysisId`가 있으면 **프로젝트 생성과 같은 트랜잭션에서** 그 분석을 이 프로젝트에 연결하고, **분석에 저장된 추천 금액을 `budget_amount`로 덮어쓴다.** 클라이언트가 보낸 금액은 표시용으로만 받고 신뢰하지 않는다. 연결에 실패하면 `409`이고 **프로젝트 생성까지 되돌린다.**

### 조회

9. 공개 목록·상세 응답에는 `transaction_status` 키 자체를 **포함하지 않는다.** `null`로 내려보내지도 않는다.
10. 목록은 기본적으로 **마감된 프로젝트를 제외한다.** 필터로 명시했을 때만 포함한다.
11. `deleted_at`이 채워진 프로젝트는 목록·상세·검색 어디에도 나타나지 않는다.
12. 목록 응답은 `{ items, page, pageSize, totalCount, totalPages }` 형태를 쓴다. `pageSize`는 1~50, `page`는 1~1000으로 제한한다.
13. 상세 응답에는 서버가 계산한 `editableFields` · `availableActions`가 포함된다. 클라이언트가 잠금 규칙을 다시 계산하지 않게 한다.
14. `SCHEDULED` 프로젝트는 `recruitment_start_at`이 지나면 조회 시점에 `OPEN`으로 보이고, `OPEN` 프로젝트는 `recruitment_deadline_at`이 지나면 `CLOSED`로 보인다.

### 수정

15. **대기 중인 지원이 1건이라도 있으면 `budget_amount`와 모집 일정을 수정할 수 없다.** 판정은 `pending_application_count`로 하고, 이 값을 읽지 못하면 **잠금을 유지한다.** 0으로 간주하지 않는다.
16. 모집이 마감됐거나 거래가 시작된 프로젝트는 어떤 필드도 수정할 수 없다 → `409`.
17. 수정은 **등록한 의뢰인만** 가능하다 → 아니면 `403`.
18. 일반 필드 수정으로는 `project_version`이 올라가지 않는다.

### 삭제

19. 삭제는 `deleted_at`을 채우는 **소프트 삭제**다. 행을 물리적으로 지우지 않는다.
20. **대기 중인 지원이 1건 이상이거나** 거래가 진행 중이면 삭제할 수 없다 → `409`.
21. 이미 삭제된 프로젝트를 다시 삭제하면 **성공(`204`)으로 처리한다.**

### 모집 마감

22. 의뢰인은 `OPEN`과 `SCHEDULED` 프로젝트를 수동으로 마감할 수 있다. 둘 다 `CLOSED`가 된다.
23. 마감이 확정되면 대기 중인 지원을 일괄 거절하도록 applications에 요청하고, 그 요청에 이번 마감 사건의 식별자를 함께 보낸다. **후처리가 실패해도 마감은 되돌리지 않는다.**
24. 이미 마감된 프로젝트를 다시 마감하면 **성공으로 처리하고** 상태를 바꾸지 않는다.
25. 마감 시각이 지난 사실은 `deadline_notified_at`에 기록한다. 이 값이 이미 있으면 후처리를 다시 요청하지 않는다.

### 취소

26. 의뢰인은 거래가 `NONE` 또는 `CONTRACT_PENDING`인 프로젝트를 취소할 수 있다. `transaction_status`가 `CANCELED`, `recruitment_status`가 `CLOSED`가 된다.
27. **`payment_pending_at`이 채워져 있으면 취소할 수 없다** → `409`. 결제가 시작된 뒤의 취소를 막는 경계다.
28. 거래가 `IN_PROGRESS` 이상이면 취소할 수 없다 → `409`.
29. 취소가 확정되면 대기 지원 일괄 거절(applications)과 합의·계약 무효화(contracts-payments)를 요청한다. **하나라도 실패하면 `202`로 응답하고 어느 것이 실패했는지 함께 내려준다.**
30. 이미 취소된 프로젝트를 다시 취소하면 **성공으로 처리한다.**
31. `CANCELED`가 된 프로젝트는 다른 거래 상태로 되돌아가지 않는다.

### 재모집

32. 협상이 끝나 `CLOSED + NONE`이 된 프로젝트는 의뢰인이 새 마감일을 넣어 다시 모집할 수 있다.
33. 재모집이 성공하면 **`recruitment_start_at`을 현재 시각으로 갱신하고**, 새 마감일이 그 값 + 365일 이내인지를 **갱신 후 값 기준으로** 검증한다.
34. 대기 중인 지원이 남아 있으면 재모집할 수 없다 → `409`.
35. 이미 `OPEN`인 프로젝트에 재모집을 요청하면 **성공으로 처리하고 아무것도 바꾸지 않는다.** 모집 기간이 늘어나서는 안 된다.

### 다른 도메인에 제공하는 계약

36. `acceptProjectApplication` — 지원 수락. `OPEN + NONE` → `CLOSED + CONTRACT_PENDING`. **같은 지원서로 다시 호출하면 성공으로 처리한다.** "같은 지원서인가"를 상태 조건보다 **먼저** 판정한다.
37. `startProjectTransaction` — 계약 체결·결제 완료 후. `CONTRACT_PENDING` → `IN_PROGRESS`. 취소된 프로젝트면 `409`.
38. `completeProjectTransaction` — 납품 승인·정산 완료 후. `IN_PROGRESS` → `COMPLETED`.
39. `restorePreContractProject` — 최종 거절 후 복원. `transaction_status`를 `NONE`으로 되돌린다. 마감일이 남아 있고 대기 지원이 0건이면 `OPEN`으로, 그 외에는 마감 상태를 유지하며 **왜 재개하지 못했는지 사유를 함께 내려준다.**
40. `applyPricingAnalysisBudget` — AI 추천 예산 반영. 클라이언트가 보낸 금액을 믿지 않고 **분석에 저장된 추천 금액을 사용한다.** 대기 중 지원이 있으면 `409`.
41. `markPaymentPending` — 결제 시작 통보. `payment_pending_at`만 기록하고 **두 상태 축을 바꾸지 않으며 `project_version`도 올리지 않는다.**
42. `getProjectNegotiationContext` — 협상 진입 판정용 조회. 공개 상세에 없는 `transaction_status`와 `accepted_application_id`를 포함한다.
43. 위 계약은 전부 **같은 요청이 두 번 들어와도 한 번만 처리한다.** 중복 방지 키로 판정하고, 이전에 처리된 요청이면 최초 결과를 그대로 돌려준다.
44. 상태 축이 실제로 바뀐 계약 호출에서만 `project_version`을 1 올린다.
45. 요청에 기대 버전이 들어 있고 현재 값과 다르면 `409`로 거절한다.

### 불변식 — 코드가 지켜야 하는 것

46. `transaction_status`가 `NONE`이 아니면 `recruitment_status`는 반드시 `CLOSED`다.
47. 한 프로젝트에서 수락된 지원은 최대 1건이다.
48. 프로젝트는 요구 기술을 최소 1개 갖는다.

---

## 다른 기능에 요구하는 것

| 무엇 | 담당 | 없으면 |
|---|---|---|
| `pending_application_count` 갱신 (지원 생성·거절·수락 시) | 최윤석 | 규칙 15·20·34의 판정이 불가능 |
| 대기 지원 일괄 거절 + 알림 | 최윤석 | 규칙 23·29의 후처리가 안 됨 |
| 합의·계약 무효화 | 조준영 | 규칙 29의 후처리가 안 됨 |
| 프로필 완성 판정 | 오민혁 | 규칙 7을 확인할 수 없음 |
| 지원 생성 직전 모집 상태 `OPEN` 확인 | 최윤석 | 마감된 프로젝트에 대기 지원이 남음 |

## ORM만으로 보장되지 않는 것

`CHECK` 제약은 Prisma 스키마 파일에 적을 수 없어 마이그레이션 SQL을 직접 손봐야 한다. 아래는 그 대상이며, 빠지면 잘못된 데이터가 조용히 들어간다.

| 불변식 | 규칙 |
|---|---|
| 거래 ≠ `NONE` ⇒ 모집 = `CLOSED` | 46 |
| 마감 시각 > 시작 시각 | 3 |
| 마감 시각 ≤ 모집 회차 시작 + 365일 | 3 · 33 |
| `title` 5~100자 · `description` 20~5000자 · `budget_amount` > 0 | 2 |

**규칙 46·47·48은 DB가 전부 막아주지 않으므로 `prototype/run.tsx`에서 반드시 확인한다.**

## 확정된 것 — contracts-payments · 팀장 합의 (2026-08-25)

| # | 규칙 |
|---|---|
| 49 | 계약 8종의 주소는 공개 주소(`/api/v1`)가 아닌 **내부 주소(`/internal/v1`)** 에 둔다. 사용자 로그인 토큰으로는 접근할 수 없다. **팀장이 프로젝트 전체 규약으로 잠정 확정** (Q-10) |
| 50 | 규칙 39에서 재개하지 못한 사유를 `notReopenedReason`(`DEADLINE_PASSED` / `PENDING_APPLICATIONS_REMAIN`)으로 함께 내려준다 |
| 51 | 규칙 37·38 호출 시 기대 버전을 **항상** 함께 받는다. 없으면 `422` |

## 확정된 것 — ai-pricing 합의 (2026-08-25)

| # | 규칙 |
|---|---|
| 52 | 규칙 8의 분석 연결은 ai-pricing이 제공하는 **`claimPricingAnalysisForCreatedProject(transaction, input)`** 를 등록 트랜잭션 안에서 호출해 처리한다. 함수가 스스로 트랜잭션을 열거나 닫지 않는다 |
| 53 | 그 호출에 `analysisId` · `projectId` · `requesterId`를 보낸다. **요청자와 분석 생성자가 다르면 갱신 대상이 없으므로 실패한다** — 남의 분석을 자기 프로젝트에 붙일 수 없다 |
| 54 | 개발용 인증은 `Bearer pactfive-mock-client-01`(의뢰인) · `Bearer pactfive-mock-freelancer-01`(프리랜서) 두 값만 허용한다. **Mock 어댑터에서만 통하고 실제 인증 환경에서는 거부한다** |

### 규칙 8의 처리 순서 — FK 때문에 정해집니다

`pricing_analyses.project_id`가 `projects.id`를 참조하므로 **프로젝트 행이 먼저 있어야 연결할 수 있다.** 순서를 바꿀 수 없다.

```text
1. 프로젝트 insert        budget_amount 는 요청값으로 임시 기록
2. claim 호출             분석을 이 프로젝트에 연결하고 추천 금액을 받는다
3. budget_amount update   받은 추천 금액으로 덮어쓴다
4. 실패하면 전체 rollback  프로젝트도 생성되지 않는다
```

**1~3은 한 트랜잭션이라 중간 값이 밖으로 보이지 않는다.** 2에서 실패하면 1도 없던 일이 된다.

> ai-pricing이 돌려주는 실패 사유는 그쪽 도메인 코드다. 이 문서의 API는 그것을 `409 PRICING_ANALYSIS_NOT_APPLICABLE`로 바꿔 응답한다 — 클라이언트에게는 이쪽 오류 코드 체계만 노출한다.

## 확정된 것 — applications 관련 (2026-08-25 등록 · 무응답 확정)

팀 방침에 따라 **먼저 등록한 쪽의 권장안으로 확정**한다. 최윤석 담당 영역과 맞물리는 항목이며, 사후 검토와 재이슈는 열려 있다.

| # | 규칙 |
|---|---|
| 55 | 규칙 36의 판정 순서 — **"같은 지원서인가"를 상태 조건보다 먼저** 본다. 순서가 반대면 정상 재시도가 `409`를 받고 화면에 사실과 다른 안내가 뜬다 (D-41) |
| 56 | `pending_application_count`는 **지원 생성 시 +1 · 거절 시 −1 · 수락 시 −1**, 각각 그 상태를 바꾸는 트랜잭션 안에서 함께 갱신한다 |
| 57 | 규칙 23·29의 일괄 거절 요청은 `closureEventId` · `reason`(`RECRUITMENT_CLOSED` / `PROJECT_CANCELED`) · `occurredAt`을 보내고, `rejectedCount` · `alreadyProcessed` · `result`(`DONE` / `NOT_NEEDED` / `FAILED`)를 받는다 |

> `reason`을 나눈 것은 **알림 문구가 다르기 때문**이다. 마감이면 "모집이 마감되었습니다", 취소면 "프로젝트가 취소되었습니다"가 나가야 한다.
> `result` 세 값은 contracts-payments가 무효화 응답에 쓰기로 한 것과 같은 형태다 (D-89).

**미확정 항목은 없다.** 위 세 건은 `prototype/server/ports/external.port.ts`의 `ApplicationsPort` 뒤에 두어, 최윤석 담당의 실제 형태가 다르면 어댑터 한 곳만 교체한다 (ADR-0009).

## 크기 기준

현재 한 파일로 유지한다. 등록부터 재모집까지가 같은 엔티티의 생애주기라 나눠도 서로를 읽어야 한다.

## 비고

원본 근거는 `docs/domain/reference/prd-v6.4.md`이며, 이 문서는 그중 project-management 범위를 구현 단위로 옮긴 것이다. 값이 어긋나면 원본이 옳다.
