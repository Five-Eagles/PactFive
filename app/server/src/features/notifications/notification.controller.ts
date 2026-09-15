import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { invalidNotificationInput, NotificationApiError, notificationStorageError } from './notification.errors';
import { NotificationService, requireNotificationAuth } from './notification.service';
import type { NotificationAuthContext } from './notification.types';

/** 원본: features/notifications/prototype/server/notification.controller.ts (오민혁, PR #75/#90). */

/** API 계약: query 없음, body 없음 또는 빈 객체만 허용한다. */
function requireEmptyPublicInput(request: Request): void {
  // query parser가 __proto__ 같은 키를 버려도 원래 요청은 계약 위반이다.
  const queryIndex = request.originalUrl.indexOf('?');
  if (
    (queryIndex !== -1 && request.originalUrl.length > queryIndex + 1) ||
    Object.keys(request.query).length !== 0
  )
    throw invalidNotificationInput();
  const body: unknown = request.body;
  if (
    body !== undefined &&
    (body === null || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 0)
  ) {
    throw invalidNotificationInput();
  }
}

export function createNotificationController(service: NotificationService) {
  function handle(operation: (auth: NotificationAuthContext, request: Request) => Promise<unknown>): RequestHandler {
    return async (request, response, next) => {
      response.setHeader('Cache-Control', 'no-store');
      try {
        const auth = requireNotificationAuth(response.locals.notificationAuth);
        requireEmptyPublicInput(request);
        response.status(200).json(await operation(auth, request));
      } catch (error) {
        next(error);
      }
    };
  }

  return {
    getNotificationList: handle((auth) => service.getNotificationList(auth)),
    getUnreadCount: handle((auth) => service.getUnreadCount(auth)),
    markNotificationRead: handle((auth, request) =>
      service.markNotificationRead(auth, String(request.params.notificationId)),
    ),
    markAllNotificationsRead: handle((auth) => service.markAllNotificationsRead(auth)),
  };
}

export const handleNotificationError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  response.setHeader('Cache-Control', 'no-store');
  const failure = error instanceof NotificationApiError ? error : notificationStorageError();
  response.status(failure.status).json({ error: { code: failure.code, message: failure.message } });
};
