# 함수별 필수 정의 확인 요청 — 유동우 (project-management)

| | |
|---|---|
| 받는 사람 | 유동우 · project-management (4함수 제공자) |
| 보내는 사람 | 조준영 · contracts-payments |
| 날짜 | 2026-08-25 |
| 정본 | PRD v6.4 §5.4 · ERD v1.4 · `features/contracts-payments/spec.md` |
| 목적 | 아래 네 함수의 **필수 정의사항**을 예/아니오로 확정 |

이미 회신(2026-08-25)에서 「예」로 닫힌 항목은 다시 묻지 않습니다. 멱등 키 2개, `markPaymentPending` 버전 비증가, D-43 응답(`200` + 모집 재개만 보류).

조준영이 동의한 함께 정할 3건은 구현 측 재확인만 받습니다. `/internal/v1/...`, restore `notReopenedReason`, `start`/`complete`의 `expectedProjectVersion` 필수.

응답은 각 표의 예/아니오와 대안 메모만 채워 주시면 됩니다.

---

## 참고 — 다시 묻지 않는 합의

| 항목 | 상태 |
|---|---|
| `transaction-start-{contractId}` / `transaction-complete-{contractId}` | 유동우 예 |
| `markPaymentPending`은 `projectVersion` 비증가 | 유동우 예 |
| D-43: `200` + `reopened: false` + `transactionStatus: NONE` | 유동우 예 |
| 내부 주소 5개는 유동우가 만듦 | 유동우 예 |
| 경로 `/internal/v1/projects/:projectId/...` (공개 `/api/v1` 아님) | 조준영 동의, 재확인 |
| restore `notReopenedReason`: `null` / `DEADLINE_PASSED` / `PENDING_APPLICATIONS_REMAIN` | 조준영 동의, 재확인 |
| `start`/`complete`에 `expectedProjectVersion` 필수 | 조준영 동의, 재확인 |

재확인 3건에 이견이 있으면 맨 아래 메모에만 적어 주세요.

---

## 1. `startProjectTransaction`

반드시 확정: **호출 주체, 수락된 지원 ID, 프로젝트 시작 상태**

### 현재 초안

| 항목 | 초안 |
|---|---|
| 호출 주체 | 조준영 → 유동우. 계약 `SIGNED` **그리고** 결제 `PAID` 직후 1회 |
| 수락된 지원 ID | 요청 본문에는 넣지 않음. 최윤석 `acceptProjectApplication`이 심은 `projects.accepted_application_id`를 조회(`getProjectNegotiationContext`)로만 확인 |
| 프로젝트 시작 상태 | 실행 전 `CONTRACT_PENDING` → 실행 후 `IN_PROGRESS` (모집 `CLOSED` 유지) |

### 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| S1 | 호출 주체는 조준영 서버만이고, 브라우저·의뢰인 직접 호출은 거부하는가 | | | |
| S2 | start 요청에 `acceptedApplicationId`를 **넣지 않고** `projects.accepted_application_id`만 믿는가 | | | |
| S3 | 넣지 않는다면, 조회 응답의 `acceptedApplicationId`가 null이면 start를 409로 거부하는가 | | | |
| S4 | 허용 시작 상태는 `CONTRACT_PENDING`뿐이며, 성공 후는 반드시 `IN_PROGRESS`인가 | | | |

---

## 2. `completeProjectTransaction`

반드시 확정: **완료 조건, 완료 권한, 중복 완료 처리**

### 현재 초안

| 항목 | 초안 |
|---|---|
| 완료 조건 | 호출자(조준영)가 납품 `APPROVED` ∧ 정산 `RELEASED`를 지킴. 유동우는 `transactionStatus == IN_PROGRESS`만 검사 (I-30은 호출 시점 검증) |
| 완료 권한 | 내부 계약만. `/internal/v1/...` . 사용자 로그인 토큰 불가 |
| 중복 완료 | 이미 `COMPLETED`면 **200** (`changed: false`, `alreadyProcessed: true`). `CANCELED`면 409 |

### 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| C1 | 유동우 구현은 납품·정산 테이블을 읽지 않고 `IN_PROGRESS`만 보고 전이하는가 | | | |
| C2 | 완료 호출은 조준영 서버만 가능하고, 의뢰인/프리랜서 공개 API로는 열지 않는가 | | | |
| C3 | 이미 `COMPLETED`인 재호출은 200 멱등 성공인가 | | | |
| C4 | `CANCELED`에서의 complete는 409 `PROJECT_TRANSITION_CONFLICT`인가 | | | |

---

## 3. `restorePreContractProject`

반드시 확정: **복원 대상 상태, 합의·계약 취소와의 관계**

### 현재 초안

| 항목 | 초안 |
|---|---|
| 복원 대상 상태 | `transactionStatus → NONE`. 마감 남고 대기 지원 0이면 `recruitmentStatus → OPEN`. 그 외 모집은 `CLOSED` 유지. 제목·설명·첨부는 보존 |
| 합의·계약 취소와의 관계 | 이 함수는 **합의·계약을 취소하지 않음** (조준영 도메인). 프로젝트 취소 때 쓰는 `invalidateAgreementAndContract`(유동우→조준영)와 **반대 방향·다른 사건**. restore와 섞지 않음 |

### 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| R1 | 복원이 건드리는 `projects` 필드는 `transactionStatus`와 (조건부) `recruitmentStatus`뿐인가 | | | |
| R2 | restore 성공이 합의 `REJECTED`·계약 `CANCELED`를 **대신하지 않는가** (조준영이 자기 테이블에서 처리) | | | |
| R3 | 의뢰인 프로젝트 취소(`cancelProject`)와 restore를 같은 경로로 처리하지 않는가 | | | |
| R4 | 이미 자동 거절된 지원자를 restore가 되살리지 않는가 | | | |

---

## 4. `markPaymentPending`

반드시 확정: **결제 대기 전환 조건, 결제 식별정보 포함 여부**

### 현재 초안

| 항목 | 초안 |
|---|---|
| 결제 대기 전환 조건 | `CONTRACT_PENDING`이고 `canceledAt == null`. PG 요청 **직전**. 거래/모집 상태는 바꾸지 않고 `paymentPendingAt`만 기록 |
| 결제 식별정보 | 요청 본문에 `paymentId`/`contractId` **없음**. 멱등 키만 `payment-pending-{contractId}` |

### 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| P1 | 허용 조건은 `CONTRACT_PENDING` + 미취소뿐인가 (`SIGNED`/`PAID`는 호출자가 나중에 지킴) | | | |
| P2 | 요청 본문에 결제·계약 ID를 **넣지 않고** 멱등 키의 `contractId`만으로 충분한가 | | | |
| P3 | 본문에 `contractId`를 명시 필드로 추가해야 하는가 (아니오가 초안과 같음) | | | |
| P4 | 이미 `paymentPendingAt`이 있으면 200 멱등이고, 시각은 최초값을 유지하는가 | | | |

---

## 함께 정할 3건 — 구현 측 재확인 (조준영 동의 완료)

| # | 내용 | 예 | 아니오 | 메모 |
|---|---|---|---|---|
| J1 | 내부 경로 `/internal/v1/projects/:projectId/{negotiation-context,mark-payment-pending,start-transaction,complete-transaction,restore-pre-contract}` | | | |
| J2 | restore 응답 `notReopenedReason`: `null` / `DEADLINE_PASSED` / `PENDING_APPLICATIONS_REMAIN` | | | |
| J3 | `start`와 `complete`만 `expectedProjectVersion` 필수 | | | |

---

회신 후 spec·API 계약을 확정본으로 고칩니다. ERD `project_version` 주석 정정(C-01~C-07 vs 상태 전이만)은 김락원 담당으로 change-request에 남깁니다.
