import type {
  DeliveryApprovedEvent,
  DeliveryRequestedEvent,
  NotificationTriggerEvent,
  NotificationTriggerPort,
  PaymentCompletedEvent,
  ReviewRequestedEvent,
} from "../server/notification.port";

export type NotificationTriggerMock = NotificationTriggerPort & {
  getPublished(): NotificationTriggerEvent[];
};

export type NotificationTriggerMockOptions = {
  throwOnPublish?: boolean;
};

/** 배열에만 쌓는다. 발송하지 않는다. */
export function createNotificationTriggerMock(
  options: NotificationTriggerMockOptions = {},
): NotificationTriggerMock {
  const published: NotificationTriggerEvent[] = [];

  async function record(event: NotificationTriggerEvent): Promise<void> {
    if (options.throwOnPublish) {
      throw new Error("notification trigger failed");
    }
    published.push({ ...event });
  }

  return {
    getPublished() {
      return published.map((event) => ({ ...event }));
    },
    async publishPaymentCompleted(event: PaymentCompletedEvent) {
      await record(event);
    },
    async publishReviewRequested(event: ReviewRequestedEvent) {
      await record(event);
    },
    async publishDeliveryRequested(event: DeliveryRequestedEvent) {
      await record(event);
    },
    async publishDeliveryApproved(event: DeliveryApprovedEvent) {
      await record(event);
    },
  };
}
