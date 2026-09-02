# 접점 계약 확정 요청 — 최윤석 (applications · notifications)

| | |
|---|---|
| 받는 사람 | 최윤석 · applications · notifications |
| 보내는 사람 | 조준영 · contracts-payments |
| 날짜 | 2026-09-02 |
| 정본 | `review/yoonseok-ports-contract.md` §3 · `review/mock-stub-import-guide.md` 알림·손잡이 절 |
| 목적 | **맞출 계약**을 예/아니오로 확정. 구현 요청이 아니다 |

조준영은 `publish*`만 호출한다. 발송·Kakao·`create*Notification`·지원 수락은 최윤석이다.
`features/applications/` · `features/notifications/`는 조준영이 채우지 않는다.
A1–A4는 2026-08-26 예. 칸은 회신 후 채운다.

---

## Discord

조준영(contracts-payments)입니다. 알림 포트·수락 손잡이 계약을 호출 순서까지 고정했습니다. 구현 요청이 아니라 **맞출 계약 확정**입니다. (1) `PAYMENT_COMPLETED`는 `PAID` 직후, 수신 프리랜서. (2) `REVIEW_REQUESTED`는 `COMPLETED` 직후 양쪽 1회. 공개·`REVIEW_CREATED`가 아닙니다. (3) 조준영 `publish*`, 최윤석 `createPaymentCompletedNotification` · `createReviewRequestedNotification`. (4) 수락 → `CONTRACT_PENDING` + `acceptedApplicationId` → `proposeNegotiationOffer` → … → `PAID` → `publishPaymentCompleted` → `COMPLETED` → `publishReviewRequested`. (5) import는 `prototype/index.ts`만 (`createPublicApiMock` · `AcceptedApplicationHandoff` · `NotificationTriggerPort`). (6) 납품 2종은 시그니처만, Increment 1에서 호출하지 않습니다. 정본: `features/contracts-payments/review/yoonseok-ports-confirm-2026-09-02.md`.

---

## 해당 없음

`features/applications/` · `features/notifications/` 채우기, Kakao 키, 납품 Increment 호출.
`completeProjectTransaction` · `markPaymentPending` 구현 — 조준영 → 유동우.

---

## 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| Y1 | `PAYMENT_COMPLETED` = `PAID` 직후, 수신 프리랜서 | | | |
| Y3 | `REVIEW_REQUESTED` = `COMPLETED` 직후 양쪽 1회. 공개·`REVIEW_CREATED` 아님 | | | |
| Y4 | 조준영 `publish*`, 최윤석 `createPaymentCompletedNotification` · `createReviewRequestedNotification` | | | 함수명 |
| S1 | §3 호출 순서(수락 → 손잡이 → propose → … → `PAID` → `publishPaymentCompleted` → `COMPLETED` → `publishReviewRequested`)를 구현 때 따를 것인가 | | | |
| S2 | import는 `prototype/index.ts`의 `createPublicApiMock` · `AcceptedApplicationHandoff` · `NotificationTriggerPort`만인가 | | | |
| S3 | 납품 2종(`publishDeliveryRequested` · `publishDeliveryApproved`)은 시그니처만, Increment 1에서 호출하지 않는가 | | | |

회신 후 spec에 최윤석 확인 한 줄을 닫는다. 발송 구현은 최윤석이다.
