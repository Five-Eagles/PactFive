import type { BookmarkRecord } from './bookmark.types';

/**
 * bookmarks 저장소 인터페이스.
 *
 * 원본에서는 `prototype/mock/bookmark.mock.ts` 안에 Mock 구현과 같이 있었다.
 * app/ 에서는 인터페이스와 구현을 분리한다 (project-management 와 같은 배치).
 */
export interface BookmarkRepository {
  find(freelancerId: string, projectId: string): BookmarkRecord | null;
  /** 이미 있으면 BookmarkAlreadyExistsError 를 던진다 (규칙 32 의 UNIQUE) */
  insert(record: BookmarkRecord): BookmarkRecord;
  /** 지운 건수. 없었으면 0 — 오류가 아니다 (규칙 2) */
  remove(freelancerId: string, projectId: string): number;
  /** 최근 저장순 (규칙 10) */
  findByFreelancer(freelancerId: string): BookmarkRecord[];
  countByFreelancer(freelancerId: string): number;
}
