import { Prisma, type PrismaClient } from '../../generated/prisma/client';
import type { NotificationRecord, ReadAllNotificationsResponse } from './notification.types';
import type { NotificationRepository } from './notification.repository';

function toRecord(row: {
  id: string;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  linkUrl: string;
  resourceType: string | null;
  resourceId: string | null;
  dedupeKey: string;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRecord {
  return {
    id: row.id,
    recipientId: row.recipientId,
    type: row.type as NotificationRecord['type'],
    title: row.title,
    body: row.body,
    linkUrl: row.linkUrl,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    dedupeKey: row.dedupeKey,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * NotificationRepository의 Prisma(Supabase Postgres) 구현 — 2026-09-09, PR #90(오민혁) 통합.
 * `schema.prisma`의 `Notification.dedupeKey` UNIQUE 제약을 `insertIfAbsent`의 중복 판정에 그대로
 * 쓴다(다른 6기능 Prisma 이식 트랙과 같은 P2002 패턴 — engagement/prisma-bookmark.repository.ts
 * 참고). `unreadCount`는 항상 최근 100건이 아니라 전체 recipientId 기준으로 별도 계산한다
 * (api-contract.md "unreadCount는 100건 밖 포함 전체 미읽음 수다").
 */
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findNotificationListByRecipient(
    recipientId: string,
  ): Promise<{ records: NotificationRecord[]; unreadCount: number }> {
    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { recipientId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
      this.prisma.notification.count({ where: { recipientId, readAt: null } }),
    ]);
    return { records: rows.map(toRecord), unreadCount };
  }

  async countUnreadByRecipient(recipientId: string): Promise<number> {
    return this.prisma.notification.count({ where: { recipientId, readAt: null } });
  }

  async markReadByRecipient(
    recipientId: string,
    notificationId: string,
    readAt: string,
  ): Promise<{ record: NotificationRecord; unreadCount: number } | null> {
    // 최초 읽음 시각만 반영한다 — 이미 읽은 행은 조건에 걸려 업데이트되지 않고(원래 시각 보존),
    // 존재/소유 여부는 뒤의 findFirst가 별도로 판정한다("반복 성공" 계약, api-contract.md).
    await this.prisma.notification.updateMany({
      where: { id: notificationId, recipientId, readAt: null },
      data: { readAt: new Date(readAt) },
    });
    const row = await this.prisma.notification.findFirst({ where: { id: notificationId, recipientId } });
    if (!row) return null;
    const unreadCount = await this.prisma.notification.count({ where: { recipientId, readAt: null } });
    return { record: toRecord(row), unreadCount };
  }

  async markAllReadByRecipient(recipientId: string, readAt: string): Promise<ReadAllNotificationsResponse> {
    // 단일 UPDATE 문이라 DB가 이미 원자적으로 실행한다(auth.service.ts rotateSession의
    // compare-and-swap updateMany와 같은 원칙) — 별도 $transaction 래핑이 필요 없다.
    const { count } = await this.prisma.notification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date(readAt) },
    });
    return { updatedCount: count, unreadCount: 0 };
  }

  async insertIfAbsent(record: NotificationRecord): Promise<'created' | 'duplicate'> {
    try {
      await this.prisma.notification.create({
        data: {
          id: record.id,
          recipientId: record.recipientId,
          type: record.type,
          title: record.title,
          body: record.body,
          linkUrl: record.linkUrl,
          resourceType: record.resourceType,
          resourceId: record.resourceId,
          dedupeKey: record.dedupeKey,
          readAt: record.readAt ? new Date(record.readAt) : null,
          createdAt: new Date(record.createdAt),
        },
      });
      return 'created';
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'duplicate';
      throw error;
    }
  }
}
