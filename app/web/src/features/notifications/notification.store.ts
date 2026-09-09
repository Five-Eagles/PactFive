import type { NotificationApi, NotificationItem, NotificationListResponse } from './notifications.types';
import { NotificationClientError } from './api/notifications';

/** 원본: features/notifications/prototype/web/notification.store.ts (오민혁, PR #75/#90). */

export type NotificationSnapshot = {
  items: NotificationItem[];
  unreadCount: number | null;
  status: 'loading' | 'ready' | 'error' | 'session-expired';
  hasLoaded: boolean;
  isRefreshing: boolean;
  pendingNotificationId: string | null;
  isMarkingAllRead: boolean;
  errorMessage: string | null;
  message: string;
  /** 서버가 확정한 전체 읽음 결과다 — readAt을 임의로 만들어내지 않는다. */
  confirmedReadIds: string[];
};

export function createNotificationStore(
  api: NotificationApi,
  sessionKey: string | null,
  initialData?: NotificationListResponse,
) {
  const initial = sessionKey ? initialData : undefined;
  let state: NotificationSnapshot = {
    items: initial?.items.map((entry) => ({ ...entry })) ?? [],
    unreadCount: initial?.unreadCount ?? null,
    status: !sessionKey ? 'session-expired' : initial ? 'ready' : 'loading',
    hasLoaded: !!initial,
    isRefreshing: false,
    pendingNotificationId: null,
    isMarkingAllRead: false,
    errorMessage: null,
    message: '',
    confirmedReadIds: [],
  };
  const listeners = new Set<() => void>();
  let active = true;
  let started = false;
  let busy = false;
  let generation = 0;
  function set(next: Partial<NotificationSnapshot>) {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener());
  }
  const valid = (current: number) => active && current === generation;
  function fail(error: unknown) {
    if (error instanceof NotificationClientError && error.status === 401) {
      generation++;
      set({
        items: [],
        unreadCount: null,
        status: 'session-expired',
        hasLoaded: false,
        errorMessage: null,
        message: '세션이 만료되었습니다. 다시 로그인해 주세요.',
        confirmedReadIds: [],
        isRefreshing: false,
        pendingNotificationId: null,
        isMarkingAllRead: false,
      });
      busy = false;
      return;
    }
    set({
      status: state.hasLoaded ? 'ready' : 'error',
      errorMessage: error instanceof NotificationClientError ? error.message : '알림을 처리하지 못했습니다. 다시 시도해 주세요.',
    });
  }
  function applyList(data: NotificationListResponse) {
    set({
      items: data.items.map((entry) => ({ ...entry })),
      unreadCount: data.unreadCount,
      status: 'ready',
      hasLoaded: true,
      confirmedReadIds: [],
    });
  }
  // 한 번에 하나만 — 먼저 시작한 읽기/개수 요청이 나중에 끝난 변경을 덮어쓰지 않는다.
  async function operate(kind: 'refresh' | 'read' | 'all', id?: string): Promise<void> {
    if (!active || !sessionKey || busy || state.status === 'session-expired') return;
    if (
      kind === 'read' &&
      (!id ||
        !state.items.some((entry) => entry.id === id && entry.readAt === null) ||
        state.confirmedReadIds.includes(id))
    )
      return;
    if (kind === 'all' && !state.unreadCount) return;
    busy = true;
    const current = generation;
    set({
      errorMessage: null,
      message: '',
      isRefreshing: kind === 'refresh',
      pendingNotificationId: kind === 'read' ? id! : null,
      isMarkingAllRead: kind === 'all',
    });
    try {
      if (kind === 'refresh') {
        const result = await api.getNotificationList();
        if (!valid(current)) return;
        applyList(result);
        set({ message: '알림 목록을 새로고침했습니다.' });
      } else if (kind === 'read') {
        const result = await api.markNotificationRead(id!);
        if (!valid(current)) return;
        set({
          items: state.items.map((entry) => (entry.id === id ? { ...result.item } : entry)),
          unreadCount: result.unreadCount,
          message: '알림을 읽음 처리했습니다.',
        });
      } else {
        const result = await api.markAllNotificationsRead();
        if (!valid(current)) return;
        set({
          unreadCount: result.unreadCount,
          confirmedReadIds: state.items.map((entry) => entry.id),
          message: `${result.updatedCount}개의 알림을 읽음 처리했습니다.`,
        });
        // 이 조회는 변경 뒤에 순서대로 실행되며, 그 사이 새로 도착한 미읽음 알림도 포함할 수 있다.
        const fresh = await api.getNotificationList();
        if (!valid(current)) return;
        applyList(fresh);
      }
    } catch (error) {
      if (valid(current)) fail(error);
    } finally {
      if (valid(current)) {
        busy = false;
        set({ isRefreshing: false, pendingNotificationId: null, isMarkingAllRead: false });
      }
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async start(): Promise<void> {
      if (started) return;
      active = true;
      started = true;
      await operate('refresh');
    },
    dispose() {
      active = false;
      started = false;
      generation++;
      busy = false;
    },
    refresh: () => operate('refresh'),
    markRead: (id: string) => operate('read', id),
    markAllRead: () => operate('all'),
  };
}
export type NotificationStore = ReturnType<typeof createNotificationStore>;
