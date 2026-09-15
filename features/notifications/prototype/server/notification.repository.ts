import type { NotificationRecord, ReadAllNotificationsResponse } from "./notification.types";

/** 각 조회/갱신 결과의 count는 같은 저장소 snapshot에서 계산한다. */
export interface NotificationRepository {
  findNotificationListByRecipient(recipientId: string): Promise<{
    records: NotificationRecord[];
    unreadCount: number;
  }>;
  countUnreadByRecipient(recipientId: string): Promise<number>;
  markReadByRecipient(recipientId: string, notificationId: string, readAt: string): Promise<{
    record: NotificationRecord;
    unreadCount: number;
  } | null>;
  markAllReadByRecipient(recipientId: string, readAt: string): Promise<ReadAllNotificationsResponse>;
  /** dedupeKey unique 검사와 INSERT를 한 원자 작업으로 수행한다. */
  insertIfAbsent(record: NotificationRecord): Promise<"created" | "duplicate">;
}
