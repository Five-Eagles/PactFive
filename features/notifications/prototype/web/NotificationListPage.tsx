import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { NotificationApi, NotificationType } from "../server/notification.types";
import { isNotificationProjectLink } from "./api/notifications";
import { NotificationBell, NotificationBellIcon } from "./NotificationBell";
import type { NotificationSnapshot } from "./notification.store";
import { notificationStyles } from "./styles";
import { useNotifications, type NotificationInitialSnapshot } from "./use-notifications";

export type NotificationListPageProps = { api: NotificationApi; sessionKey: string | null; initialSnapshot?: NotificationInitialSnapshot };
export function NotificationListPage({ api, sessionKey, initialSnapshot }: NotificationListPageProps) {
  const { snapshot, refresh, markRead, markAllRead } = useNotifications(api, sessionKey, initialSnapshot);
  return <NotificationListView snapshot={snapshot} onRefresh={refresh} onMarkRead={markRead} onMarkAllRead={markAllRead} />;
}
export type NotificationListViewProps = {
  snapshot: NotificationSnapshot;
  onRefresh?: () => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
};
const category: Record<NotificationType, string> = {
  APPLICATION_SUBMITTED: "지원", APPLICATION_ACCEPTED: "지원", APPLICATION_REJECTED: "지원",
  APPLICATION_AUTO_REJECTED: "지원", PROJECT_RECRUITMENT_CLOSED: "모집", PROJECT_CANCELED: "프로젝트",
  AGREEMENT_ACCEPTED: "금액 합의", AGREEMENT_REJECTED: "금액 합의", CONTRACT_SIGNED: "계약",
  PAYMENT_COMPLETED: "결제", DELIVERY_REQUESTED: "납품", DELIVERY_APPROVED: "납품", REVIEW_REQUESTED: "후기",
};
export function formatNotificationTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}
export function NotificationListView({ snapshot, onRefresh, onMarkRead, onMarkAllRead }: NotificationListViewProps) {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [interacted, setInteracted] = useState(false);
  const filterRef = useRef<HTMLButtonElement>(null);
  const refreshRef = useRef<HTMLButtonElement>(null);
  const rowLinks = useRef(new Map<string, HTMLAnchorElement>());
  const pendingFocus = useRef<{ button: HTMLButtonElement; id?: string; refresh?: boolean } | null>(null);
  const busy = snapshot.isRefreshing || snapshot.isMarkingAllRead || snapshot.pendingNotificationId !== null;
  const sessionExpired = snapshot.status === "session-expired";
  const isRead = (id: string, readAt: string | null) => readAt !== null || snapshot.confirmedReadIds.includes(id);
  const visible = sessionExpired ? [] : snapshot.items.filter((entry) => filter === "all" || !isRead(entry.id, entry.readAt));
  useEffect(() => {
    if (busy || !pendingFocus.current) return;
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    // Only restore focus when the user has not deliberately moved elsewhere during the request.
    if (document.activeElement === pending.button || document.activeElement === document.body) {
      const target = pending.refresh ? refreshRef.current
        : filter === "all" && pending.id ? rowLinks.current.get(pending.id) : filterRef.current;
      target?.focus();
    }
  }, [busy, filter, snapshot.items]);
  const refresh = (event: MouseEvent<HTMLButtonElement>) => {
    setInteracted(true);
    pendingFocus.current = { button: event.currentTarget, refresh: true };
    onRefresh?.();
  };
  return <div className="ntf-root" data-testid="notification-page">
    <style>{notificationStyles}</style>
    <main className="ntf-page">
      <p className="ntf-crumb">내 활동 / 알림</p>
      <div className="ntf-heading"><div><h1 id="notification-heading" tabIndex={-1}>알림</h1><p className="ntf-intro">프로젝트의 새로운 소식을 확인하세요.</p></div><NotificationBell unreadCount={sessionExpired ? null : snapshot.unreadCount} /></div>
      <div className="ntf-layout">
        <aside className="ntf-sidebar" aria-label="알림 요약"><h2>전체 안 읽은 알림</h2><p className="ntf-stat" data-testid="notification-unread-count">{sessionExpired ? "—" : snapshot.unreadCount ?? "—"}<span>개</span></p><p>읽음 처리한 알림도 목록에 남아 있어요.</p></aside>
        <section aria-label="알림 목록">
          <div className="ntf-toolbar"><div className="ntf-filters" role="group" aria-label="알림 필터">
            <button className="ntf-button" type="button" aria-pressed={filter === "all"} onClick={() => { setInteracted(true); setFilter("all"); }} data-testid="notification-filter-all">전체</button>
            <button ref={filterRef} className="ntf-button" type="button" aria-pressed={filter === "unread"} onClick={() => { setInteracted(true); setFilter("unread"); }} data-testid="notification-filter-unread">안 읽음</button>
          </div><div className="ntf-actions"><button ref={refreshRef} className="ntf-button" type="button" disabled={busy || sessionExpired} onClick={refresh} data-testid="notification-refresh">{snapshot.isRefreshing ? "새로고침 중…" : "새로고침"}</button><button className="ntf-button ntf-primary" type="button" disabled={busy || sessionExpired || !snapshot.unreadCount} onClick={(event) => { setInteracted(true); pendingFocus.current = { button: event.currentTarget }; onMarkAllRead?.(); }} data-testid="notification-read-all">{snapshot.isMarkingAllRead ? "읽음 처리 중…" : "모두 읽음"}</button></div></div>
          <p className="ntf-helper">최근 100건을 보여드려요. 안 읽음 수는 전체 알림 기준입니다.</p>
          <p className="ntf-message" role="status" aria-live="polite" aria-atomic="true">{snapshot.message}</p>
          {snapshot.errorMessage && !sessionExpired && <div className="ntf-error" role="alert"><span>{snapshot.errorMessage}</span><button type="button" className="ntf-button" disabled={busy} onClick={refresh}>다시 시도</button></div>}
          <div aria-busy={busy || snapshot.status === "loading"}>
            {sessionExpired ? <div className="ntf-status" data-testid="notification-session"><div className="ntf-symbol"><NotificationBellIcon /></div><h2>다시 로그인해 주세요</h2><p>로그인 상태를 확인할 수 없어 알림을 숨겼습니다.</p><a className="ntf-button ntf-primary" href="/login?returnTo=%2Fnotifications">로그인</a></div>
              : (snapshot.status === "loading" || snapshot.isRefreshing) && !snapshot.hasLoaded ? <div className="ntf-status" role="status" data-testid="notification-loading"><div className="ntf-symbol"><NotificationBellIcon /></div><h2>알림을 불러오고 있습니다.</h2><p>잠시만 기다려 주세요.</p></div>
                : snapshot.status === "error" && !snapshot.hasLoaded ? <div className="ntf-status" data-testid="notification-error"><h2>알림을 불러오지 못했습니다</h2><p>연결을 확인한 뒤 위의 다시 시도를 눌러 주세요.</p></div>
                  : !visible.length ? <div className="ntf-status" data-testid="notification-empty"><div className="ntf-symbol"><NotificationBellIcon /></div><h2>{filter === "unread" ? "최근 100건에 안 읽은 알림이 없어요" : "아직 도착한 알림이 없어요"}</h2><p>{filter === "unread" ? "전체 목록에서 지난 알림을 다시 확인할 수 있어요." : "프로젝트의 새로운 소식이 생기면 이곳에 알려드릴게요."}</p>{filter === "unread" && <button className="ntf-button" type="button" onClick={() => setFilter("all")}>전체 알림 보기</button>}</div>
                    : <ul className={`ntf-feed${interacted ? "" : " ntf-enter"}`} data-testid="notification-list">{visible.map((entry, index) => {
                      const read = isRead(entry.id, entry.readAt);
                      return <li key={entry.id} className={`ntf-row${read ? "" : " ntf-unread"}`} style={{ "--ntf-order": index } as CSSProperties} data-notification-id={entry.id}>
                        <span className="ntf-symbol" aria-hidden="true"><NotificationBellIcon /></span><div><div className="ntf-row-top"><span>{category[entry.type]}</span><span className={read ? "ntf-read-state" : "ntf-unread-label"}>{read ? "읽음" : "안 읽음"}</span></div><h2>{entry.title}</h2><p>{entry.body}</p><div className="ntf-row-footer"><time dateTime={entry.createdAt}>{formatNotificationTime(entry.createdAt)} (한국 시간)</time><div className="ntf-row-actions"><button type="button" className="ntf-button" disabled={read || busy} aria-label={`${entry.title}: ${read ? "읽음" : "읽음 처리"}`} onClick={(event) => { setInteracted(true); pendingFocus.current = { button: event.currentTarget, id: entry.id }; onMarkRead?.(entry.id); }} data-testid={`notification-read-${entry.id}`}>{snapshot.pendingNotificationId === entry.id ? "처리 중…" : read ? "읽음" : "읽음 처리"}</button>{isNotificationProjectLink(entry.linkUrl) && <a ref={(node) => { if (node) rowLinks.current.set(entry.id, node); else rowLinks.current.delete(entry.id); }} className="ntf-link" href={entry.linkUrl} aria-label={`${entry.title}: 프로젝트 보기`}>프로젝트 보기 <span aria-hidden="true">→</span></a>}</div></div></div>
                      </li>;
                    })}</ul>}
          </div>
          <p className="ntf-helper">전체 읽음은 목록 밖의 안 읽은 알림까지 포함합니다.</p>
        </section>
      </div>
    </main>
  </div>;
}
export default NotificationListPage;
