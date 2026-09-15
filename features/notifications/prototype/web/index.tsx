import { useMemo, useState } from "react";
import { createNotificationApiMock, createNotificationDemoSnapshot, type NotificationDemoScenario } from "../mock/notification-api.mock";
import { NotificationListPage } from "./NotificationListPage";
import { notificationStyles } from "./styles";

export { NotificationListPage, NotificationListView } from "./NotificationListPage";
export { NotificationBell, NotificationBellBadge } from "./NotificationBell";
export { createNotificationHttpApi, NotificationApiError } from "./api/notifications";
export { useNotifications } from "./use-notifications";

/** Common preview entry only. App integration imports NotificationListPage directly. */
export default function NotificationsDemo() {
  const [scenario, setScenario] = useState<NotificationDemoScenario | "loading">("client");
  const demo = useMemo(() => {
    const api = createNotificationApiMock({ scenario: scenario === "loading" ? "client" : scenario, delayMs: 350 });
    if (scenario === "loading") api.getNotificationList = () => new Promise(() => {});
    const sessionKey = scenario === "session" ? null : `synthetic-demo:${scenario}`;
    const initialSnapshot = scenario === "client" || scenario === "freelancer" || scenario === "empty"
      ? { sessionKey: sessionKey!, data: createNotificationDemoSnapshot(scenario) } : undefined;
    return { api, sessionKey, initialSnapshot };
  }, [scenario]);
  return <div className="ntf-root"><style>{notificationStyles}</style>
    <div className="ntf-demo"><strong>화면 시연 · 가상 알림</strong><label htmlFor="notification-demo-scenario">시연 계정 / 상태</label><select id="notification-demo-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as NotificationDemoScenario | "loading")}>
      <option value="client">의뢰인 · 알림 3건</option><option value="freelancer">프리랜서 · 알림 5건</option><option value="empty">알림 없음</option><option value="loading">불러오는 중</option><option value="session">세션 만료</option><option value="error">불러오기 실패</option>
    </select><small>실제 계정과 연결되지 않은 가상 데이터입니다. 상태 전환 시 읽음 기록은 초기화됩니다.</small></div>
    <header className="ntf-demo-header"><div><span className="ntf-brand">Pact<em>Five</em></span><span className="ntf-demo-label">프로토타입 · 알림 센터</span></div></header>
    <NotificationListPage {...demo} />
  </div>;
}
