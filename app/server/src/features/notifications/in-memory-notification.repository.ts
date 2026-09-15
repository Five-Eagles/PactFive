import type { NotificationRecord, ReadAllNotificationsResponse } from './notification.types';
import type { NotificationRepository } from './notification.repository';

/**
 * 원본: features/notifications/prototype/mock/notification-repository.mock.ts (오민혁, PR #75/#90).
 * mock 인증(authProviderMode === 'mock') 개발 모드용 — 휘발성. 다른 기능과 같은
 * `isPrismaConfigured(authProviderMode)` 게이트로 express-app.ts가 이거나 PrismaNotificationRepository를 고른다.
 */
export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly records = new Map<string, NotificationRecord>();
  private readonly dedupeKeys = new Set<string>();

  private unreadCount(recipientId: string): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.recipientId === recipientId && record.readAt === null) count += 1;
    }
    return count;
  }

  findNotificationListByRecipient(
    recipientId: string,
  ): Promise<{ records: NotificationRecord[]; unreadCount: number }> {
    const records = [...this.records.values()]
      .filter((record) => record.recipientId === recipientId)
      .sort((left, right) => {
        const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
        if (timeDifference !== 0) return timeDifference;
        return left.id < right.id ? 1 : left.id > right.id ? -1 : 0;
      })
      .slice(0, 100)
      .map((record) => ({ ...record }));
    return Promise.resolve({ records, unreadCount: this.unreadCount(recipientId) });
  }

  countUnreadByRecipient(recipientId: string): Promise<number> {
    return Promise.resolve(this.unreadCount(recipientId));
  }

  markReadByRecipient(
    recipientId: string,
    notificationId: string,
    readAt: string,
  ): Promise<{ record: NotificationRecord; unreadCount: number } | null> {
    const record = this.records.get(notificationId);
    if (!record || record.recipientId !== recipientId) return Promise.resolve(null);
    if (record.readAt === null) record.readAt = readAt;
    return Promise.resolve({ record: { ...record }, unreadCount: this.unreadCount(recipientId) });
  }

  markAllReadByRecipient(recipientId: string, readAt: string): Promise<ReadAllNotificationsResponse> {
    let updatedCount = 0;
    for (const record of this.records.values()) {
      if (record.recipientId === recipientId && record.readAt === null) {
        record.readAt = readAt;
        updatedCount += 1;
      }
    }
    return Promise.resolve({ updatedCount, unreadCount: this.unreadCount(recipientId) });
  }

  insertIfAbsent(record: NotificationRecord): Promise<'created' | 'duplicate'> {
    if (this.dedupeKeys.has(record.dedupeKey)) return Promise.resolve('duplicate');
    if (this.records.has(record.id)) return Promise.reject(new Error('알림 ID가 중복되었습니다.'));
    this.records.set(record.id, { ...record });
    this.dedupeKeys.add(record.dedupeKey);
    return Promise.resolve('created');
  }
}
