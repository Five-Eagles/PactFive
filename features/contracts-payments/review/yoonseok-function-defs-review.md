# 함수별 필수 정의 확인 요청 — 최윤석 (applications)

| | |
|---|---|
| 받는 사람 | 최윤석 · applications · notifications |
| 보내는 사람 | 조준영 · contracts-payments |
| 날짜 | 2026-08-25 |
| 정본 | PRD v6.4 §5.4 · ERD v1.4 · `features/contracts-payments/spec.md` |
| 목적 | 지원 수락·복원이 맞물리는 **필수 정의사항**을 예/아니오로 확정 |

`completeProjectTransaction`과 `markPaymentPending`은 applications 범위가 아닙니다. 해당 없음으로 두고, **`startProjectTransaction`·`restorePreContractProject`만** 답해 주세요.

---

## 해당 없음

| 함수 | 이유 |
|---|---|
| `completeProjectTransaction` | 납품 승인·정산 후 거래 완료. 조준영 → 유동우 |
| `markPaymentPending` | PG 직전 결제 시작 통보. 조준영 → 유동우 |

---

## 1. `startProjectTransaction`

반드시 확정: **호출 주체, 수락된 지원 ID, 프로젝트 시작 상태**

최윤석이 이 함수를 구현하거나 호출하지 않습니다. 다만 **수락된 지원 ID가 프로젝트에 심긴 뒤에만** 조준영이 계약 흐름에 들어갑니다.

### 현재 초안

| 항목 | 초안 |
|---|---|
| 호출 주체 | 조준영 → 유동우. 최윤석은 호출하지 않음 |
| 수락된 지원 ID | 최윤석 `acceptProjectApplication` 성공 시 `projects.accepted_application_id`에 기록. 조준영 start 요청에는 applicationId를 다시 실지 않음 |
| 프로젝트 시작 상태 | 수락 직후 `CLOSED` + `CONTRACT_PENDING`. 그 다음 조준영 서명·결제 후 `IN_PROGRESS` |
| 호출 순서 | ① accept 성공 → ② 나머지 지원 거절 → ③ 알림. 이 세 단계가 끝난 뒤에만 금액합의/`start` 흐름 |

### 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| A1 | `acceptProjectApplication` 성공 → 나머지 거절 → 알림이 끝난 뒤에야 조준영이 계약 흐름에 들어가는 것을 Mock에 반영하는가 | | | |
| A2 | 수락된 지원 ID는 C-01이 `acceptedApplicationId`를 심는 것으로 충분하고, start 요청에 applicationId를 **다시 실지 않아도** 되는가 | | | |
| A3 | 수락 전에는 `acceptedApplicationId`가 null이며, 그 상태에서는 조준영이 계약 흐름을 시작하지 않는다고 가정해도 되는가 | | | |
| A4 | 한 프로젝트의 수락 지원은 최대 1건(`acceptedApplicationId` 1개)인가 | | | |

---

## 2. `restorePreContractProject`

반드시 확정: **복원 대상 상태, 합의·계약 취소와의 관계** (지원 도메인에 닿는 부분)

### 현재 초안

| 항목 | 초안 |
|---|---|
| 복원 대상 상태 | 유동우가 `transactionStatus → NONE`. 모집은 조건부 `OPEN`. **거절된 지원을 되살리지 않음** |
| 합의·계약 취소와의 관계 | 합의 거절·계약 무효는 조준영 테이블. restore는 프로젝트 상태만. 지원 일괄 거절은 유동우가 최윤석에게 `rejectPendingApplications`를 **재요청**할 수 있음 (D-43) |
| 대기 지원이 남은 복원 | HTTP 200, `reopened: false`, `notReopenedReason: PENDING_APPLICATIONS_REMAIN`. 재모집 버튼 금지 |
| 재개 성공 | `reopened: true`이면 새 지원은 기존과 같은 `PENDING` 규칙 |

### 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| B1 | restore가 이미 자동 거절된 지원자를 되살리지 않는 전제를 applications Mock이 지키는가 | | | |
| B2 | `PENDING_APPLICATIONS_REMAIN`일 때 유동우의 `rejectPendingApplications` 재요청을 Mock이 다시 받을 수 있는가 | | | |
| B3 | 재개된 프로젝트(`reopened: true`, 모집 `OPEN`)의 새 지원은 기존과 같은 `PENDING` 규칙인가 | | | |
| B4 | 프로젝트 취소(`cancelProject`)와 합의 최종 거절(restore)을 지원 거절 사유에서 구분하는가 (`PROJECT_CANCELED` vs `AGREEMENT_DECLINED` 등) | | | |

---

## 기존 확인 3문항 (동일, 미회신이면 여기서 답해도 됩니다)

| # | 질문 | 예 | 아니오 | 메모 |
|---|---|---|---|---|
| 1 | accept 성공 → 나머지 거절 → 알림 후에 `start` 흐름 | | | A1과 같음 |
| 2 | restore 중 `rejectPendingApplications` 재요청 수신 | | | B2와 같음 |
| 3 | 재개 후 새 지원 = 기존 `PENDING` | | | B3와 같음 |

---

회신 후 조준영 spec의 최윤석 확인 항목을 닫습니다. 결제·완료 함수는 유동우 문서에서만 다룹니다.
