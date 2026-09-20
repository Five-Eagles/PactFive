import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { NotificationApi, NotificationListResponse } from './notifications.types';
import { createNotificationStore } from './notification.store';

/** 원본: features/notifications/prototype/web/use-notifications.ts (오민혁, PR #75/#90). */

export type NotificationInitialSnapshot = { sessionKey: string; data: NotificationListResponse };

/** 서버 push 인프라 없이도 지원·수락 사건을 빠르게 반영하기 위한 보수적 주기다. */
const NOTIFICATION_POLL_INTERVAL_MS = 15_000;

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
    if (!sessionKey) return () => store.dispose();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void store.refresh();
    };
    const interval = window.setInterval(refreshWhenVisible, NOTIFICATION_POLL_INTERVAL_MS);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      store.dispose();
    };
  }, [store, sessionKey]);
  return { snapshot, refresh: store.refresh, markRead: store.markRead, markAllRead: store.markAllRead };
}
