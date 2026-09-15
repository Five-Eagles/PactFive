import type { NotificationApi, NotificationItem, NotificationListResponse } from "../server/notification.types";
import { NotificationApiError } from "../web/api/notifications";

export type NotificationDemoScenario = "client" | "freelancer" | "empty" | "session" | "error";
/** Synthetic, browser-only examples. Never mount this adapter in the integrated app. */
export function createNotificationDemoSnapshot(scenario: NotificationDemoScenario = "client"): NotificationListResponse {
  const common = { resourceType: "application", readAt: null };
  const items: NotificationItem[] = scenario === "client" ? [
    { ...common, id: "ntf_demo_3", type: "APPLICATION_SUBMITTED", title: "새로운 지원이 도착했습니다", body: "브랜드 웹사이트 프로젝트의 지원 내용을 확인해 주세요.", linkUrl: "/projects/prj_brand", resourceId: "apl_brand", createdAt: "2026-09-07T03:40:00.000Z" },
    { ...common, id: "ntf_demo_2", type: "APPLICATION_SUBMITTED", title: "새로운 지원이 도착했습니다", body: "모바일 서비스 프로젝트의 지원 내용을 확인해 주세요.", linkUrl: "/projects/prj_mobile", resourceId: "apl_mobile", createdAt: "2026-09-07T01:15:00.000Z" },
    { ...common, id: "ntf_demo_1", type: "APPLICATION_SUBMITTED", title: "새로운 지원이 도착했습니다", body: "쇼핑몰 리뉴얼 프로젝트의 지원 내용을 확인해 주세요.", linkUrl: "/projects/prj_shop", resourceId: "apl_shop", createdAt: "2026-09-06T08:30:00.000Z" },
  ] : scenario === "freelancer" ? [
    { ...common, id: "ntf_free_5", type: "APPLICATION_ACCEPTED", title: "지원이 수락되었습니다", body: "브랜드 웹사이트 프로젝트의 지원이 수락되었습니다. 다음 진행 내용을 확인해 주세요.", linkUrl: "/projects/prj_brand", resourceId: "apl_brand", createdAt: "2026-09-07T03:40:00.000Z" },
    { ...common, id: "ntf_free_4", type: "APPLICATION_REJECTED", title: "지원 결과를 확인해 주세요", body: "모바일 서비스 프로젝트의 지원이 수락되지 않았습니다.", linkUrl: "/projects/prj_mobile", resourceId: "apl_mobile", createdAt: "2026-09-07T01:15:00.000Z" },
    { ...common, id: "ntf_free_3", type: "APPLICATION_AUTO_REJECTED", title: "다른 지원자가 선정되었습니다", body: "쇼핑몰 리뉴얼 프로젝트에 다른 지원자가 선정되어 지원이 마감되었습니다.", linkUrl: "/projects/prj_shop", resourceId: "apl_shop", createdAt: "2026-09-06T08:30:00.000Z", readAt: "2026-09-06T09:00:00.000Z" },
    { id: "ntf_free_2", type: "PROJECT_RECRUITMENT_CLOSED", title: "프로젝트 모집이 마감되었습니다", body: "콘텐츠 디자인 프로젝트의 모집이 마감되었습니다. 현재 진행 상황을 확인해 주세요.", linkUrl: "/projects/prj_content", resourceType: "project", resourceId: "prj_content", createdAt: "2026-09-05T08:30:00.000Z", readAt: null },
    { id: "ntf_free_1", type: "PROJECT_CANCELED", title: "프로젝트가 취소되었습니다", body: "서비스 리뉴얼 프로젝트가 취소되었습니다. 자세한 내용을 확인해 주세요.", linkUrl: "/projects/prj_service", resourceType: "project", resourceId: "prj_service", createdAt: "2026-09-04T08:30:00.000Z", readAt: null },
  ] : [];
  return { items, unreadCount: items.filter((entry) => entry.readAt === null).length, limit: 100 };
}

export function createNotificationApiMock(options: { scenario?: NotificationDemoScenario; delayMs?: number } = {}): NotificationApi {
  const scenario = options.scenario ?? "client";
  const snapshot = createNotificationDemoSnapshot(scenario);
  const items = snapshot.items;
  const unreadCount = () => items.filter((entry) => entry.readAt === null).length;
  const clone = (entry: NotificationItem): NotificationItem => ({ ...entry });
  async function beforeRequest() {
    if ((options.delayMs ?? 0) > 0) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (scenario === "session") throw new NotificationApiError(401, "UNAUTHORIZED", "세션이 만료되었습니다. 다시 로그인해 주세요.");
    if (scenario === "error") throw new NotificationApiError(500, "INTERNAL_ERROR", "알림을 불러오지 못했습니다. 다시 시도해 주세요.");
  }
  return {
    async getNotificationList() { await beforeRequest(); return { items: items.slice(0, 100).map(clone), unreadCount: unreadCount(), limit: 100 }; },
    async getUnreadCount() { await beforeRequest(); return { unreadCount: unreadCount() }; },
    async markNotificationRead(id) {
      await beforeRequest();
      const found = items.find((entry) => entry.id === id);
      if (!found) throw new NotificationApiError(404, "NOTIFICATION_NOT_FOUND", "알림을 찾을 수 없습니다.");
      found.readAt ??= new Date().toISOString();
      return { item: clone(found), unreadCount: unreadCount() };
    },
    async markAllNotificationsRead() {
      await beforeRequest();
      const now = new Date().toISOString();
      let updatedCount = 0;
      for (const entry of items) if (entry.readAt === null) { entry.readAt = now; updatedCount++; }
      return { updatedCount, unreadCount: unreadCount() };
    },
  };
}
