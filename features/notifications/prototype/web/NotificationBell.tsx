export function NotificationBellIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4M12 2V1" /></svg>;
}
/** null means unknown/hidden; never present an unknown session count as zero. */
export function NotificationBell({ unreadCount, href = "#notification-heading" }: { unreadCount: number | null; href?: string }) {
  const known = unreadCount !== null && Number.isSafeInteger(unreadCount) && unreadCount >= 0;
  const label = known ? `알림, 안 읽은 알림 ${unreadCount}개` : "알림, 안 읽은 알림 수 확인 필요";
  return <a className="ntf-bell" href={href} aria-label={label} data-testid="notification-bell"><NotificationBellIcon /><span className="ntf-badge" aria-hidden="true">{known ? unreadCount! > 99 ? "99+" : unreadCount : "—"}</span></a>;
}
export const NotificationBellBadge = NotificationBell;
