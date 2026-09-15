import { Route } from 'react-router-dom';
import type { NotificationApi } from './notifications.types';
import type { NotificationInitialSnapshot } from './useNotifications';
import { NotificationListPage } from './NotificationListPage';

/**
 * notifications 라우트 정의 + 경로 상수 — ai-pricing의 `pricing-analysis.routes.tsx`와 같은 선례.
 * `NOT_INTEGRATED_ROUTES`(App.tsx)에 있던 `/notifications` 항목을 여기로 옮긴다(2026-09-09).
 */
export const NOTIFICATION_ROUTES = {
  list: '/notifications',
} as const;

export function notificationRoutes({
  api,
  sessionKey,
  initialSnapshot,
}: {
  api: NotificationApi;
  sessionKey: string | null;
  initialSnapshot?: NotificationInitialSnapshot;
}) {
  return (
    <Route
      path={NOTIFICATION_ROUTES.list}
      element={<NotificationListPage api={api} sessionKey={sessionKey} initialSnapshot={initialSnapshot} />}
    />
  );
}
