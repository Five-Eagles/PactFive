/** 조준영이 발행한다. 발송·Kakao는 최윤석이 구현한다. */

export type PaymentCompletedEvent = {
  type: "PAYMENT_COMPLETED";
  projectId: string;
  paymentId: string;
  freelancerId: string;
  occurredAt: string;
};

/** COMPLETED 직후 양쪽 1회. 리뷰 공개·REVIEW_CREATED와 다르다. */
export type ReviewRequestedEvent = {
  type: "REVIEW_REQUESTED";
  projectId: string;
  clientId: string;
  freelancerId: string;
  occurredAt: string;
};

/** 납품 Increment 전엔 호출하지 않는다. 시그니처만 고정. */
export type DeliveryRequestedEvent = {
  type: "DELIVERY_REQUESTED";
  projectId: string;
  clientId: string;
  occurredAt: string;
};

/** 납품 Increment 전엔 호출하지 않는다. 시그니처만 고정. */
export type DeliveryApprovedEvent = {
  type: "DELIVERY_APPROVED";
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

/** 알림 실패는 PAID·COMPLETED를 되돌리지 않는다 (PRD §5.6). */
export async function ignoreNotificationFailure(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch {
    // 발송은 최윤석. 발행 throw도 본 작업을 막지 않는다.
  }
}
