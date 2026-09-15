import { Link } from 'react-router-dom';

/**
 * 원본: features/notifications/prototype/web/NotificationBell.tsx (오민혁, PR #75/#90).
 *
 * 원본은 독립 preview라 router가 없어 `<a>`를 썼다. app/web은 AppShell·HomeHeader가 이미
 * `NavLink`/`Link`로 내비게이션을 하므로, 이 벨도 같은 헤더 안에서 `<a>`로 전체 새로고침을
 * 일으키면 메모리에만 있는 Access Token이 날아간다(useAuth.ts restore() 주석 참고) —
 * `Link`로 바꿔 클라이언트 라우팅을 유지한다(2026-09-09).
 */

export function NotificationBellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4M12 2V1" />
    </svg>
  );
}

/** null은 모름/숨김을 뜻한다 — 모르는 세션 개수를 0으로 보여주지 않는다. */
export function NotificationBell({
  unreadCount,
  href = '/notifications',
}: {
  unreadCount: number | null;
  href?: string;
}) {
  const known = unreadCount !== null && Number.isSafeInteger(unreadCount) && unreadCount >= 0;
  const label = known ? `알림, 안 읽은 알림 ${unreadCount}개` : '알림, 안 읽은 알림 수 확인 필요';
  return (
    <Link className="ntf-bell" to={href} aria-label={label} data-testid="notification-bell">
      <NotificationBellIcon />
      <span className="ntf-badge" aria-hidden="true">
        {known ? (unreadCount! > 99 ? '99+' : unreadCount) : '—'}
      </span>
    </Link>
  );
}
