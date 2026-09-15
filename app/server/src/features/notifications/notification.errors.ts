/** 원본: features/notifications/prototype/server/notification.errors.ts (오민혁, PR #75/#90). */
export type NotificationErrorCode = 'UNAUTHORIZED' | 'VALIDATION_ERROR' | 'NOTIFICATION_NOT_FOUND' | 'INTERNAL_ERROR';

export class NotificationApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 500,
    readonly code: NotificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationApiError';
  }
}

export function invalidNotificationInput(): NotificationApiError {
  return new NotificationApiError(400, 'VALIDATION_ERROR', '요청 값이 올바르지 않습니다.');
}

export function notificationStorageError(): NotificationApiError {
  return new NotificationApiError(500, 'INTERNAL_ERROR', '알림을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}
