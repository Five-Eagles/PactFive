import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { NotificationApi, NotificationListResponse } from "../server/notification.types";
import { createNotificationStore } from "./notification.store";

export type NotificationInitialSnapshot = { sessionKey: string; data: NotificationListResponse };
export function useNotifications(api: NotificationApi, sessionKey: string | null, initialSnapshot?: NotificationInitialSnapshot) {
  // Identity changes choose a clean store during render, before any effect cleanup.
  const store = useMemo(() => createNotificationStore(api, sessionKey,
    sessionKey && initialSnapshot?.sessionKey === sessionKey ? initialSnapshot.data : undefined), [api, sessionKey]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    void store.start();
    return () => store.dispose();
  }, [store]);
  return { snapshot, refresh: store.refresh, markRead: store.markRead, markAllRead: store.markAllRead };
}
