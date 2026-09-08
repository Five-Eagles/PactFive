/**
 * 알림 트리거 포트 — 조준영이 발행하고, 발송·Kakao 연동은 최윤석(notifications)이 구현한다.
 *
 * 원본: features/contracts-payments/prototype/server/notification.port.ts (28471d6, #80).
 * app/에는 아직 notifications 기능의 발행 인바운드가 없어(2026-09-07 기준), 발행은
 * `express-app.ts`가 조립하는 인메모리 어댑터가 로그만 남기고 성공 처리한다 — 실제 발송이
 * 붙기 전까지는 `ignoreNotificationFailure`가 감싸므로 실패해도 본 트랜잭션(결제 확정·거래
 * 완료·납품)을 막지 않는다.
 */

export type PaymentCompletedEvent = {
  type: 'PAYMENT_COMPLETED';
  projectId: string;
  paymentId: string;
  freelancerId: string;
  occurredAt: string;
};

/** COMPLETED 직후 양쪽 1회. 리뷰 공개·REVIEW_CREATED와 다르다. */
export type ReviewRequestedEvent = {
  type: 'REVIEW_REQUESTED';
  projectId: string;
  clientId: string;
  freelancerId: string;
  occurredAt: string;
};

/** 납품 Increment 전엔 호출하지 않는다. 시그니처만 고정. */
export type DeliveryRequestedEvent = {
  type: 'DELIVERY_REQUESTED';
  projectId: string;
  clientId: string;
  occurredAt: string;
};

/** 납품 Increment 전엔 호출하지 않는다. 시그니처만 고정. */
export type DeliveryApprovedEvent = {
  type: 'DELIVERY_APPROVED';
  projectId: string;
  freelancerId: string;
  occurredAt: string;
};

export type NotificationTriggerEvent =
  | PaymentCompletedEvent
  | ReviewRequestedEvent
  | DeliveryRequestedEvent
  | DeliveryApprovedEvent;

export type NotificationTriggerPort = {
  publishPaymentCompleted(event: PaymentCompletedEvent): Promise<void>;
  publishReviewRequested(event: ReviewRequestedEvent): Promise<void>;
  publishDeliveryRequested(event: DeliveryRequestedEvent): Promise<void>;
  publishDeliveryApproved(event: DeliveryApprovedEvent): Promise<void>;
};

/** 알림 실패는 PAID·COMPLETED·APPROVED를 되돌리지 않는다 (PRD §5.6). */
export async function ignoreNotificationFailure(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch {
    // 발송은 최윤석(notifications). 발행 실패도 본 작업을 막지 않는다.
  }
}
