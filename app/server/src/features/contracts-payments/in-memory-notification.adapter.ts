import type { NotificationTriggerEvent, NotificationTriggerPort } from './notification.port';

/**
 * 발행만 한다 — 실제 발송(Kakao 등)은 notifications 담당의 몫이다(applications의
 * in-memory-application-notification.ts와 같은 패턴). notifications가 app/에 실제
 * 인바운드를 붙이기 전까지는 이 큐를 아무도 소비하지 않는다 — 발행 자체가 실패해도
 * 결제 확정·거래 완료·납품 요청/승인 흐름을 되돌리지 않는다(notification.port.ts의
 * `ignoreNotificationFailure`가 감싼다).
 */
export class InMemoryNotificationTriggerAdapter implements NotificationTriggerPort {
  private readonly events: NotificationTriggerEvent[] = [];

  async publishPaymentCompleted(event: Extract<NotificationTriggerEvent, { type: 'PAYMENT_COMPLETED' }>) {
    this.events.push({ ...event });
  }

  async publishReviewRequested(event: Extract<NotificationTriggerEvent, { type: 'REVIEW_REQUESTED' }>) {
    this.events.push({ ...event });
  }

  async publishDeliveryRequested(event: Extract<NotificationTriggerEvent, { type: 'DELIVERY_REQUESTED' }>) {
    this.events.push({ ...event });
  }

  async publishDeliveryApproved(event: Extract<NotificationTriggerEvent, { type: 'DELIVERY_APPROVED' }>) {
    this.events.push({ ...event });
  }

  /** 디버그·테스트 전용 조회. 실제 발송 트리거가 아니다. */
  getPublishedEvents(): NotificationTriggerEvent[] {
    return [...this.events];
  }
}
