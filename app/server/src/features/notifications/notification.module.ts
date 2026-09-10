import type { NotificationRepository } from './notification.repository';
import { createNotificationRouter, type NotificationAuthResolver } from './notification.routes';
import { NotificationService } from './notification.service';
import type { NotificationEventInput, SafeNotificationDeliveryResponse } from './notification.types';

/**
 * 원본: features/notifications/prototype/server/notification.module.ts (오민혁, PR #75/#90).
 * 원천 도메인은 저장소나 공개 HTTP 생성 경로 대신 이 내부 전달 접점만 사용한다.
 */
export type NotificationDeliveryPort = {
  deliverNotificationEventSafely(input: NotificationEventInput): Promise<SafeNotificationDeliveryResponse>;
};

export type NotificationModuleOptions = {
  repository: NotificationRepository;
  resolveAuth: NotificationAuthResolver;
  clock?: () => string;
};

/**
 * 담당자 통합 초안: DB·실인증을 필수 주입하고 조회 라우터와 생성 포트를 같은 저장소에 연결한다.
 * Mock 기본값, 앱 listen, 원천 이벤트 보강, scheduler, durable queue는 제공하지 않는다.
 *
 * 2026-09-09 통합 범위 — express-app.ts는 이 모듈의 router만 마운트한다. `delivery`
 * (원천 사건 생성 접점)는 applications/project-management/contracts-payments가 정규화된
 * eventId/수신자 스냅샷을 아직 만들지 않아(change-requests/CR-0001-notifications-integration.md
 * §3·§4) 이번 반영에서 어디에도 연결하지 않는다 — 조회/읽음 4종 API만 실제로 쓰인다.
 * feedback_loop/2026-09-09/notifications.md 참고.
 */
export function createNotificationModule(options: NotificationModuleOptions) {
  const service = new NotificationService(options.repository, options.clock);
  const delivery: NotificationDeliveryPort = {
    // 호출자가 구조 분해하거나 콜백으로 넘겨도 서비스의 this가 유실되지 않는다.
    deliverNotificationEventSafely: (input) => service.deliverNotificationEventSafely(input),
  };
  return { router: createNotificationRouter(service, options.resolveAuth), delivery };
}
