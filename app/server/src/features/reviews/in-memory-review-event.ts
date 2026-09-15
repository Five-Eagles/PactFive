import type { ReviewCreatedEvent, ReviewEventPort } from './review.types';

/** 발행만 하고 발송은 notifications 담당(미정)에게 미룬다 — applications의
 * InMemoryApplicationNotificationPort와 같은 원칙. */
export class InMemoryReviewEventPort implements ReviewEventPort {
  private events: ReviewCreatedEvent[] = [];

  async publishReviewCreated(event: ReviewCreatedEvent): Promise<void> {
    this.events.push({ ...event });
  }

  getPublishedEvents(): ReviewCreatedEvent[] {
    return [...this.events];
  }
}
