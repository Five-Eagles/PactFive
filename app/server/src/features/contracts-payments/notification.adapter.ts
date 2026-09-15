import type { NotificationDeliveryPort } from '../notifications/notification.module';
import type { NotificationTriggerEvent, NotificationTriggerPort } from './notification.port';

/** contracts-payments 사건을 notifications의 영속 전달 포트로 연결한다. */
export class NotificationContractAdapter implements NotificationTriggerPort {
  constructor(private readonly delivery: NotificationDeliveryPort) {}

  async publishPaymentCompleted(event: Extract<NotificationTriggerEvent, { type: 'PAYMENT_COMPLETED' }>) {
    await this.delivery.deliverNotificationEventSafely({
      eventId: `contract:payment-completed:${event.paymentId}`,
      type: event.type,
      projectId: event.projectId,
      projectTitle: event.projectTitle,
      occurredAt: event.occurredAt,
      paymentId: event.paymentId,
      freelancerId: event.freelancerId,
    });
  }

  async publishReviewRequested(event: Extract<NotificationTriggerEvent, { type: 'REVIEW_REQUESTED' }>) {
    await this.delivery.deliverNotificationEventSafely({
      eventId: `contract:review-requested:${event.contractId}`,
      type: event.type,
      projectId: event.projectId,
      projectTitle: event.projectTitle,
      occurredAt: event.occurredAt,
      contractId: event.contractId,
      clientId: event.clientId,
      freelancerId: event.freelancerId,
    });
  }

  async publishDeliveryRequested(event: Extract<NotificationTriggerEvent, { type: 'DELIVERY_REQUESTED' }>) {
    await this.delivery.deliverNotificationEventSafely({
      eventId: `contract:delivery-requested:${event.contractId}`,
      type: event.type,
      projectId: event.projectId,
      projectTitle: event.projectTitle,
      occurredAt: event.occurredAt,
      contractId: event.contractId,
      clientId: event.clientId,
    });
  }

  async publishDeliveryApproved(event: Extract<NotificationTriggerEvent, { type: 'DELIVERY_APPROVED' }>) {
    await this.delivery.deliverNotificationEventSafely({
      eventId: `contract:delivery-approved:${event.contractId}`,
      type: event.type,
      projectId: event.projectId,
      projectTitle: event.projectTitle,
      occurredAt: event.occurredAt,
      contractId: event.contractId,
      freelancerId: event.freelancerId,
    });
  }
}
