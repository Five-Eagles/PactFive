import { Prisma } from '../../generated/prisma/client';
import type { PrismaClient } from '../../generated/prisma/client';
import type { BookmarkRepository } from './bookmark.repository';
import { BookmarkAlreadyExistsError, type BookmarkRecord } from './bookmark.types';

/**
 * BookmarkRepository의 Prisma(Supabase Postgres) 구현.
 *
 * 2026-09-08, 6기능 Prisma 이식 트랙(팀장 작업). InMemoryBookmarkRepository와 동작을 최대한
 * 동일하게 맞췄다 — `insert`는 DB의 `uq_bookmarks_pair` UNIQUE 위반(Prisma 오류 코드 P2002)을
 * 잡아 `BookmarkAlreadyExistsError`로 바꾼다. 성공으로 바꾸는 것은 여전히 서비스의 일이다
 * (spec.md 규칙 1) — 여기서는 오류 종류만 통일해서 넘긴다.
 */
export class PrismaBookmarkRepository implements BookmarkRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(freelancerId: string, projectId: string): Promise<BookmarkRecord | null> {
    const row = await this.prisma.bookmark.findUnique({
      where: { uq_bookmarks_pair: { freelancerId, projectId } },
    });
    return row ? toBookmarkRecord(row) : null;
  }

  async insert(record: BookmarkRecord): Promise<BookmarkRecord> {
    try {
      const row = await this.prisma.bookmark.create({
        data: {
          id: record.bookmarkId,
          freelancerId: record.freelancerId,
          projectId: record.projectId,
          createdAt: new Date(record.createdAt),
        },
      });
      return toBookmarkRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BookmarkAlreadyExistsError(record.freelancerId, record.projectId);
      }
      throw error;
    }
  }

  async remove(freelancerId: string, projectId: string): Promise<number> {
    const result = await this.prisma.bookmark.deleteMany({ where: { freelancerId, projectId } });
    return result.count;
  }

  async findByFreelancer(freelancerId: string): Promise<BookmarkRecord[]> {
    const rows = await this.prisma.bookmark.findMany({
      where: { freelancerId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toBookmarkRecord);
  }

  async countByFreelancer(freelancerId: string): Promise<number> {
    return this.prisma.bookmark.count({ where: { freelancerId } });
  }
}

function toBookmarkRecord(row: { id: string; freelancerId: string; projectId: string; createdAt: Date }): BookmarkRecord {
  return {
    bookmarkId: row.id,
    freelancerId: row.freelancerId,
    projectId: row.projectId,
    createdAt: row.createdAt.toISOString(),
  };
}
