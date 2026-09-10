/**
 * notifications 도메인 타입 — 웹 전용 사본.
 *
 * app/server의 `notification.types.ts`가 정본이다. app/web과 app/server는 별도 배포 패키지라
 * (ADR-0007) 여기서는 웹이 실제로 소비하는 필드만 옮겨 적었다(user-management/auth.types.ts와
 * 같은 패턴). API 계약이 바뀌면 두 파일을 함께 갱신한다.
 */
export const NOTIFICATION_TYPES = [
  'APPLICATION_SUBMITTED',
  'APPLICATION_ACCEPTED',
  'APPLICATION_REJECTED',
  'APPLICATION_AUTO_REJECTED',
  'PROJECT_RECRUITMENT_CLOSED',
  'PROJECT_CANCELED',
  'AGREEMENT_ACCEPTED',
  'AGREEMENT_REJECTED',
  'CONTRACT_SIGNED',
  'PAYMENT_COMPLETED',
  'DELIVERY_REQUESTED',
  'DELIVERY_APPROVED',
  'REVIEW_REQUESTED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  linkUrl: string;
  resourceType: string | null;
  resourceId: string | null;
  readAt: string | null;
  createdAt: string;
};
export type NotificationListResponse = { items: NotificationItem[]; unreadCount: number; limit: 100 };
export type NotificationUnreadCountResponse = { unreadCount: number };
export type ReadNotificationResponse = { item: NotificationItem; unreadCount: number };
export type ReadAllNotificationsResponse = { updatedCount: number; unreadCount: number };

/** UI receives an authenticated transport, never a public recipient selector. */
export interface NotificationApi {
  getNotificationList(): Promise<NotificationListResponse>;
  getUnreadCount(): Promise<NotificationUnreadCountResponse>;
  markNotificationRead(id: string): Promise<ReadNotificationResponse>;
  markAllNotificationsRead(): Promise<ReadAllNotificationsResponse>;
}
