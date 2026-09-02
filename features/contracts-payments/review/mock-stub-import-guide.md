# 계약 연동 Mock 스텁 — import 안내

| | |
|---|---|
| 받는 사람 | 유동우 (project-management) · 최윤석 (applications) |
| 보내는 사람 | 조준영 (contracts-payments) |
| 날짜 | 2026-08-26 |
| 정본 | `features/contracts-payments/api-contract.md` · `prototype/` |

4함수 Mock 스텁을 붙였습니다. 정본은 API 계약 문서이고, Mock은 그 계약의 스탠드인입니다.
`features/{기능}/prototype/` 기준 상대 경로입니다. **`prototype/index.ts`만 import**하세요.

```ts
import {
  createProjectTransactionMock,
  MOCK_INTERNAL_SERVICE_TOKEN,
  DomainContractError,
  isDomainContractError,
} from "../../contracts-payments/prototype";
import type { ProjectTransactionPort } from "../../contracts-payments/prototype";
```

검증: 리포 루트에서 `npx tsx features/contracts-payments/prototype/run.tsx` → PASS 60.

---

## 공통

- 브라우저 공개 API가 아닙니다. 서버 간 `/internal/v1/projects/:projectId/...` 입니다.
- 함수명이 정본입니다 (D-48). REST 경로는 Mock용입니다.
- 헤더: `Authorization: Bearer mock-internal-service-token` (`MOCK_INTERNAL_SERVICE_TOKEN`).
  **비밀이 아닙니다.** 값이 다르면 Mock이 `422 VALIDATION_ERROR`로 거부합니다.
- 4xx는 `DomainContractError`를 throw합니다. `err.body.error.code`로 구분합니다.
- 멱등: 같은 `idempotencyKey`면 최초 응답을 그대로 줍니다. 키에서 ID를 파싱하지 않습니다.

### 시드로 성공·실패 재현

`createProjectTransactionMock()`을 호출할 때마다 새 저장소입니다. 테스트마다 한 번씩 만드세요.

| projectId | 상태 | 재현 |
|---|---|---|
| `prj_alive` | `CONTRACT_PENDING`, 수락 지원 `app_123`, version 7 | 조회·markPaymentPending·start 성공 |
| `prj_seq` | 위와 같음 (해피패스 전용, 전이가 쌓임) | mark → start → complete 순서 |
| `prj_restore` | `CONTRACT_PENDING`, 마감 남음, 대기 지원 0 | restore 재개 (`reopened: true`) |
| `prj_deleted` | 소프트 삭제 | 조회 404 `PROJECT_NOT_FOUND` |
| `prj_canceled` | `CANCELED` | 전이 409 `PROJECT_TRANSITION_CONFLICT` |
| `prj_null_accept` | `CONTRACT_PENDING`인데 `acceptedApplicationId` null | start 409 |
| `prj_in_progress` | `IN_PROGRESS`, version 8 | complete 성공 (호출자가 I-30을 지킨 경우) |
| `prj_completed` | `COMPLETED`, version 9 | complete 멱등 200 |
| `prj_deadline` | 마감 지남 | restore `notReopenedReason: DEADLINE_PASSED` |
| `prj_pending_apps` | 대기 지원 2 | restore `PENDING_APPLICATIONS_REMAIN`, 거래는 `NONE` |

공통 필드: `clientId: usr_client_a`, 모집 `CLOSED`, 마감 `2026-09-16T14:59:59Z` (`prj_deadline`만 과거).

---

## 유동우님께 (4함수 제공자)

이 Mock은 **조준영이 호출을 붙이기 위한 스탠드인**입니다. 실제 구현은 project-management 쪽에 두시면 됩니다. 타입만 맞춰 주시면 포트를 갈아끼울 수 있습니다.

```ts
import {
  createProjectTransactionMock,
  type ProjectTransactionPort,
} from "../../contracts-payments/prototype";

const port: ProjectTransactionPort = createProjectTransactionMock();
const ctx = await port.getProjectNegotiationContext("prj_alive");
```

구현하실 다섯 메서드:

| 메서드 | 핵심 |
|---|---|
| `getProjectNegotiationContext` | start/complete/mark 전 조회 |
| `markPaymentPending` | 본문 `contractId` 필수. 상태·버전 안 바꿈. 시각 최초값 |
| `startProjectTransaction` | `expectedProjectVersion` 필수. 본문에 `acceptedApplicationId` 없음 |
| `completeProjectTransaction` | `IN_PROGRESS`만 검사. I-30은 조준영이 호출 전에 지킴 |
| `restorePreContractProject` | `notReopenedReason`. `recruitment_start_at` 안 건드림 |

호출 예 (start):

```ts
await port.startProjectTransaction("prj_alive", {
  requestId: "req_start_01",
  idempotencyKey: "transaction-start-ctr_123",
  occurredAt: "2026-08-25T05:01:00Z",
  expectedProjectVersion: 7,
});
```

markPaymentPending 본문에는 `contractId`가 있어야 합니다. 없으면 422입니다.

오류 코드는 이 다섯만 씁니다: `PROJECT_NOT_FOUND` · `PROJECT_TRANSITION_CONFLICT` · `PROJECT_VERSION_CONFLICT` · `PROJECT_ALREADY_RESTORED` · `VALIDATION_ERROR`.

---

## 최윤석님께 (지원 수락 선행)

네 함수를 **호출하거나 구현하지 않습니다.** 수락이 끝난 뒤에만 조준영이 계약 흐름에 들어갑니다.

순서는 다음과 같습니다. 3번까지가 applications입니다.

1. `acceptProjectApplication` 성공 → `projects.accepted_application_id`에 기록 (`app_123`에 해당)
2. 나머지 지원 거절
3. 알림
4. 그 다음 조준영 금액합의·서명 → `markPaymentPending` → start

시드 `prj_alive`는 1~3이 끝난 상태(`CONTRACT_PENDING` + `acceptedApplicationId: app_123`)다.
최윤석 2026-08-26 회신으로 이 순서는 확정이다.

restore 때 알아 두실 것:

- 이미 거절된 지원자를 되살리지 않습니다.
- 대기 지원이 남으면 (`prj_pending_apps`) HTTP 200, `reopened: false`, `notReopenedReason: PENDING_APPLICATIONS_REMAIN`. 유동우가 `rejectPendingApplications`를 다시 보낼 수 있습니다.
- 재개 성공(`prj_restore`) 후 새 지원은 기존 `PENDING` 규칙입니다.
- 거절 사유는 `PROJECT_CANCELED`(프로젝트 취소)와 `AGREEMENT_DECLINED`(합의 결렬)를 구분합니다.

---

## 호출 서비스 (조준영 쪽, 참고)

I-30 때문에 complete는 납품 `APPROVED` ∧ 정산 `RELEASED`가 아니면 **포트를 부르지 않습니다.** 다른 도메인이 이 가드를 쓸 필요는 없습니다.

```ts
import { completeProjectTransactionIfSettled } from "../../contracts-payments/prototype/server/project-transaction.service";
```

---

질문이면 `features/contracts-payments/api-contract.md`를 우선해 주세요. Mock과 계약이 다르면 계약이 이깁니다.
