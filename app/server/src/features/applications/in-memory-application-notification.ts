import type { ApplicationNotificationEvent, ApplicationNotificationPort } from './application.types';

/**
 * 발행만 한다 — 실제 발송(Kakao 등)은 notifications 담당(2026-09-05 기준 담당 미정)의 몫이다
 * (features/applications/review/teamlead-public-api-panels-2026-09-03.md "손잡이 · 알림").
 * notifications가 app/에 붙기 전까지는 이 큐를 아무도 소비하지 않는다 — 발행 자체가 실패해도
 * 수락·거절 흐름을 되돌리지 않는다(application.service.ts).
 */
export class InMemoryApplicationNotificationPort implements ApplicationNotificationPort {
  private readonly events: ApplicationNotificationEvent[] = [];

  async publish(event: ApplicationNotificationEvent): Promise<void> {
    this.events.push({ ...event });
  }

  /** 디버그·테스트 전용 조회. 실제 발송 트리거가 아니다. */
  getPublishedEvents(): ApplicationNotificationEvent[] {
    return [...this.events];
  }
}
