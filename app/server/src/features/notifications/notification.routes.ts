import { json, Router, type Request } from 'express';
import { createNotificationController, handleNotificationError } from './notification.controller';
import { invalidNotificationInput } from './notification.errors';
import { NotificationService, requireNotificationAuth } from './notification.service';
import type { NotificationAuthContext } from './notification.types';

/** 원본: features/notifications/prototype/server/notification.routes.ts (오민혁, PR #75/#90). */

export const NOTIFICATION_API_BASE_PATH = '/api/v1/notifications';
export type NotificationAuthResolver = (request: Request) => NotificationAuthContext | Promise<NotificationAuthContext>;

/** 실제 인증 검증은 조립 지점에서 주입한다. 공개 header의 userId를 읽는 기본 구현은 없다. */
export function createNotificationRouter(service: NotificationService, resolveAuth: NotificationAuthResolver): Router {
  if (typeof resolveAuth !== 'function') throw new Error('NotificationAuthResolver가 필요합니다.');
  const router = Router();
  const controller = createNotificationController(service);
  const parseJson = json({ limit: '4kb', strict: true });

  // 입력 파싱보다 인증이 먼저다. 무인증 요청의 잘못된 query/body도 동일한 401이다.
  router.use(NOTIFICATION_API_BASE_PATH, async (request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    try {
      response.locals.notificationAuth = requireNotificationAuth(await resolveAuth(request));
      // Express route param decoding 오류도 인증 이후 일관된 400으로 처리한다.
      try {
        decodeURIComponent(request.path);
      } catch {
        throw invalidNotificationInput();
      }
      const hasBody = Number(request.headers['content-length'] ?? 0) > 0 || request.headers['transfer-encoding'] !== undefined;
      if (hasBody && !request.is('application/json')) throw invalidNotificationInput();
      parseJson(request, response, (error?: unknown) => next(error ? invalidNotificationInput() : undefined));
    } catch (error) {
      next(error);
    }
  });

  router.get(NOTIFICATION_API_BASE_PATH, controller.getNotificationList);
  router.get(`${NOTIFICATION_API_BASE_PATH}/unread-count`, controller.getUnreadCount);
  router.post(`${NOTIFICATION_API_BASE_PATH}/read-all`, controller.markAllNotificationsRead);
  router.post(`${NOTIFICATION_API_BASE_PATH}/:notificationId/read`, controller.markNotificationRead);
  router.use(handleNotificationError);
  return router;
}
