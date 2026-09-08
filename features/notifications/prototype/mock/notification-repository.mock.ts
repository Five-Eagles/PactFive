import type { NotificationRepository } from "../server/notification.repository";
import type { NotificationRecord, ReadAllNotificationsResponse } from "../server/notification.types";

/** 휘발성 Mock. 각 메서드는 await 없는 동기 critical section 뒤 Promise를 반환한다. */
export class InMemoryNotificationRepository implements NotificationRepository {
  private readonly records = new Map<string, NotificationRecord>();
  private readonly dedupeKeys = new Set<string>();
  private insertionsUntilFailure: number | null = null;

  constructor(seed: NotificationRecord[] = []) {
    for (const record of seed) {
      if (this.records.has(record.id) || this.dedupeKeys.has(record.dedupeKey)) throw new Error("중복 Mock seed입니다.");
      this.records.set(record.id, { ...record });
      this.dedupeKeys.add(record.dedupeKey);
    }
  }

  private unreadCount(recipientId: string): number {
    let count = 0;
    for (const record of this.records.values()) {
      if (record.recipientId === recipientId && record.readAt === null) count += 1;
    }
    return count;
  }

  findNotificationListByRecipient(recipientId: string): Promise<{ records: NotificationRecord[]; unreadCount: number }> {
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

  markReadByRecipient(recipientId: string, notificationId: string, readAt: string): Promise<{
    record: NotificationRecord; unreadCount: number;
  } | null> {
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

  insertIfAbsent(record: NotificationRecord): Promise<"created" | "duplicate"> {
    if (this.dedupeKeys.has(record.dedupeKey)) return Promise.resolve("duplicate");
    if (this.insertionsUntilFailure === 0) {
      this.insertionsUntilFailure = null;
      return Promise.reject(new Error("Mock 저장 실패입니다."));
    }
    if (this.records.has(record.id)) return Promise.reject(new Error("알림 ID가 중복되었습니다."));
    this.records.set(record.id, { ...record });
    this.dedupeKeys.add(record.dedupeKey);
    if (this.insertionsUntilFailure !== null) this.insertionsUntilFailure -= 1;
    return Promise.resolve("created");
  }

  /** 테스트 전용: N건을 새로 저장한 뒤 다음 신규 INSERT 한 번만 실패한다. */
  failNextInsert(afterSuccessfulInsertions = 0): void {
    if (!Number.isSafeInteger(afterSuccessfulInsertions) || afterSuccessfulInsertions < 0) throw new Error("잘못된 실패 시드입니다.");
    this.insertionsUntilFailure = afterSuccessfulInsertions;
  }

  /** 테스트 전용 사본. 공개 API가 아니다. */
  snapshot(): NotificationRecord[] {
    return [...this.records.values()].map((record) => ({ ...record }));
  }
}
