import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { NotificationApi, NotificationListResponse } from './notifications.types';
import { createNotificationStore } from './notification.store';

/** 원본: features/notifications/prototype/web/use-notifications.ts (오민혁, PR #75/#90). */

export type NotificationInitialSnapshot = { sessionKey: string; data: NotificationListResponse };

export function useNotifications(
  api: NotificationApi,
  sessionKey: string | null,
  initialSnapshot?: NotificationInitialSnapshot,
) {
  // identity가 바뀌면 effect 정리 전에 렌더 중에 깨끗한 store를 고른다.
  const store = useMemo(
    () =>
      createNotificationStore(
        api,
        sessionKey,
        sessionKey && initialSnapshot?.sessionKey === sessionKey ? initialSnapshot.data : undefined,
      ),
    [api, sessionKey],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.start();
    return () => store.dispose();
  }, [store]);
  return { snapshot, refresh: store.refresh, markRead: store.markRead, markAllRead: store.markAllRead };
}
