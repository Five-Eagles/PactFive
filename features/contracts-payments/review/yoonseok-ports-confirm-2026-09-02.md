# 접점 계약 확정 — 팀장 (notifications) · 조준영 (applications)

| | |
|---|---|
| 받는 사람 | 팀장 · notifications / 조준영 · applications |
| 보내는 사람 | 조준영 · contracts-payments |
| 날짜 | 2026-09-02 |
| 갱신 | 2026-09-03 담당 이관. 알림=팀장, 지원=조준영 |
| 정본 | `review/yoonseok-ports-contract.md` §3 · `review/mock-stub-import-guide.md` 알림·손잡이 절 |
| 목적 | **맞출 계약**을 예/아니오로 확정. 구현 요청이 아니다 |

조준영은 `publish*`만 호출한다. 발송·Kakao·`create*Notification`은 **팀장**(notifications)이다.
지원 수락은 **조준영** (`features/applications/`). `features/notifications/`는 조준영이 채우지 않는다.
A1–A4는 2026-08-26 예. applications 칸은 2026-09-03 조준영 확정. 알림 칸은 팀장 회신 후.

---

## Discord (팀장 · 알림)

조준영(contracts-payments)입니다. 알림 발송은 팀장님 담당입니다. 구현 요청이 아니라 **맞출 계약 확정**입니다. (1) `PAYMENT_COMPLETED`는 `PAID` 직후, 수신 프리랜서. (2) `REVIEW_REQUESTED`는 `COMPLETED` 직후 양쪽 1회. 공개·`REVIEW_CREATED`가 아닙니다. (3) 조준영 `publish*`, 팀장 `createPaymentCompletedNotification` · `createReviewRequestedNotification`. (4) 납품 2종은 시그니처만, Increment 1에서 호출하지 않습니다. (5) 포트 throw여도 `PAID`·`COMPLETED`는 유지합니다. 정본: `features/contracts-payments/review/yoonseok-ports-confirm-2026-09-02.md`.

---

## 해당 없음

`features/notifications/` 채우기, Kakao 키, 납품 Increment 호출, `app/` 수정.
`completeProjectTransaction` · `markPaymentPending` 구현 — 조준영 → 유동우.
applications 손잡이·S1·S2는 조준영이 2026-09-03 예로 닫았다. 팀장 Discord에 넣지 않는다.

---

## 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| Y1 | `PAYMENT_COMPLETED` = `PAID` 직후, 수신 프리랜서 | | | 팀장 |
| Y3 | `REVIEW_REQUESTED` = `COMPLETED` 직후 양쪽 1회. 공개·`REVIEW_CREATED` 아님 | | | 팀장 |
| Y4 | 조준영 `publish*`, 팀장 `createPaymentCompletedNotification` · `createReviewRequestedNotification` | | | 팀장 · 함수명 |
| Y5 | 알림 실패는 결제·완료를 되돌리지 않는가 | | | 팀장 · PRD 확정 |
| S1 | §3 호출 순서(수락 → 손잡이 → propose → … → `PAID` → `publishPaymentCompleted` → `COMPLETED` → `publishReviewRequested`)를 구현 때 따를 것인가 | 예 | | 조준영 2026-09-03 |
| S2 | import는 `prototype/index.ts`의 `createPublicApiMock` · `AcceptedApplicationHandoff` · `NotificationTriggerPort`만인가 | 예 | | 조준영 2026-09-03 |
| S3 | 납품 2종(`publishDeliveryRequested` · `publishDeliveryApproved`)은 시그니처만, Increment 1에서 호출하지 않는가 | | | 팀장 |

알림 칸은 팀장 회신 후 spec에 한 줄. 발송 구현은 팀장이다. applications 칸은 닫혔다.
