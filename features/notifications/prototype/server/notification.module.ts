import type { NotificationRepository } from "./notification.repository";
import { createNotificationRouter, type NotificationAuthResolver } from "./notification.routes";
import { NotificationService } from "./notification.service";
import type { NotificationEventInput, SafeNotificationDeliveryResponse } from "./notification.types";

/** 원천 도메인은 저장소나 공개 HTTP 생성 경로 대신 이 내부 전달 접점만 사용한다. */
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
 */
export function createNotificationModule(options: NotificationModuleOptions) {
  const service = new NotificationService(options.repository, options.clock);
  const delivery: NotificationDeliveryPort = {
    // 호출자가 구조 분해하거나 콜백으로 넘겨도 서비스의 this가 유실되지 않는다.
    deliverNotificationEventSafely: (input) => service.deliverNotificationEventSafely(input),
  };
  return { router: createNotificationRouter(service, options.resolveAuth), delivery };
}
