export const NOTIFICATION_TYPES = [
  "APPLICATION_SUBMITTED", "APPLICATION_ACCEPTED", "APPLICATION_REJECTED",
  "APPLICATION_AUTO_REJECTED", "PROJECT_RECRUITMENT_CLOSED", "PROJECT_CANCELED",
  "AGREEMENT_ACCEPTED", "AGREEMENT_REJECTED", "CONTRACT_SIGNED", "PAYMENT_COMPLETED",
  "DELIVERY_REQUESTED", "DELIVERY_APPROVED", "REVIEW_REQUESTED",
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
export type NotificationItem = {
  id: string; type: NotificationType; title: string; body: string; linkUrl: string;
  resourceType: string | null; resourceId: string | null;
  readAt: string | null; createdAt: string;
};
export type NotificationRecord = NotificationItem & { recipientId: string; dedupeKey: string };
export type NotificationListResponse = { items: NotificationItem[]; unreadCount: number; limit: 100 };
export type NotificationUnreadCountResponse = { unreadCount: number };
export type ReadNotificationResponse = { item: NotificationItem; unreadCount: number };
export type ReadAllNotificationsResponse = { updatedCount: number; unreadCount: number };
export type NotificationAuthContext = { userId: string; isActive: boolean } | null;
type EventBase = { eventId: string; projectId: string; projectTitle: string; occurredAt: string };
export type NotificationEventInput = EventBase & (
  | { type: "APPLICATION_SUBMITTED"; applicationId: string; clientId: string }
  | { type: "APPLICATION_ACCEPTED" | "APPLICATION_REJECTED" | "APPLICATION_AUTO_REJECTED";
      applicationId: string; freelancerId: string }
  | { type: "PROJECT_RECRUITMENT_CLOSED"; closureEventId: string; recipientIds: string[] }
  | { type: "PROJECT_CANCELED"; closureEventId: string; pendingFreelancerIds: string[];
      acceptedFreelancerId: string | null }
);
export type PublishNotificationResponse = { createdCount: number; duplicateCount: number };
export type SafeNotificationDeliveryResponse =
  | ({ status: "delivered" } & PublishNotificationResponse)
  | { status: "retry_required" };
/** UI receives an authenticated transport, never a public recipient selector. */
export interface NotificationApi {
  getNotificationList(): Promise<NotificationListResponse>;
  getUnreadCount(): Promise<NotificationUnreadCountResponse>;
  markNotificationRead(id: string): Promise<ReadNotificationResponse>;
  markAllNotificationsRead(): Promise<ReadAllNotificationsResponse>;
}
