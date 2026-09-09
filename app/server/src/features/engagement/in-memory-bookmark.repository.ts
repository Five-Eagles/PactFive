import type { BookmarkRepository } from './bookmark.repository';
import { BookmarkAlreadyExistsError, type BookmarkRecord } from './bookmark.types';

/**
 * bookmarks 인메모리 저장소.
 *
 * 원본: features/engagement/prototype/mock/bookmark.mock.ts 의 구현부.
 *
 * ## UNIQUE 제약을 흉내 내는 것이 이 파일의 핵심이다
 *
 * ERD v1.4 에 `uq_bookmarks_pair` 가 있다. 실제 DB 에서 중복 삽입은 제약 위반으로 실패한다.
 * 여기서 조용히 덮어쓰면 **서비스의 중복 처리 경로가 한 번도 실행되지 않은 채 통과하고**,
 * Prisma 구현으로 바꾸는 순간 깨진다. 그래서 키를 `freelancerId::projectId` 로 잡고
 * `insert` 가 `BookmarkAlreadyExistsError` 를 던진다 — 성공으로 바꾸는 것은 서비스의 일이다
 * (spec.md 규칙 1).
 *
 * 2026-09-08 팀장 반영: BookmarkRepository가 Promise 반환으로 바뀌면서, 이미 동기로 계산한
 * 값을 Promise.resolve로 감싸기만 했다 — 내부 로직·자료구조는 그대로다.
 */
export class InMemoryBookmarkRepository implements BookmarkRepository {
  private readonly rows = new Map<string, BookmarkRecord>();

  constructor(seeds: BookmarkRecord[] = []) {
    for (const seed of seeds) this.rows.set(this.key(seed.freelancerId, seed.projectId), { ...seed });
  }

  private key(freelancerId: string, projectId: string): string {
    return `${freelancerId}::${projectId}`;
  }

  async find(freelancerId: string, projectId: string): Promise<BookmarkRecord | null> {
    return this.rows.get(this.key(freelancerId, projectId)) ?? null;
  }

  async insert(record: BookmarkRecord): Promise<BookmarkRecord> {
    const key = this.key(record.freelancerId, record.projectId);
    if (this.rows.has(key)) {
      throw new BookmarkAlreadyExistsError(record.freelancerId, record.projectId);
    }
    this.rows.set(key, record);
    return record;
  }

  async remove(freelancerId: string, projectId: string): Promise<number> {
    return this.rows.delete(this.key(freelancerId, projectId)) ? 1 : 0;
  }

  async findByFreelancer(freelancerId: string): Promise<BookmarkRecord[]> {
    return [...this.rows.values()]
      .filter((b) => b.freelancerId === freelancerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async countByFreelancer(freelancerId: string): Promise<number> {
    return [...this.rows.values()].filter((b) => b.freelancerId === freelancerId).length;
  }
}
