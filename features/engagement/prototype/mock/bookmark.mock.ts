/**
 * bookmarks 저장소 Mock
 *
 * ## UNIQUE 제약을 흉내 내는 것이 이 파일의 핵심이다
 *
 * ERD v1.4 에 `uq_bookmarks_pair` 가 이미 있다. 실제 DB 에서 중복 삽입은
 * 제약 위반으로 실패한다. Mock 이 그걸 흉내 내지 않으면 **서비스가 그 경로를
 * 한 번도 타지 않은 채 통과한다** — 그리고 실제 DB 에 붙는 순간 깨진다.
 *
 * 그래서 `insert` 는 조용히 무시하지 않고 `BookmarkAlreadyExistsError` 를 던진다.
 * 성공으로 바꾸는 것은 서비스의 일이다 (spec.md 규칙 1).
 */

import {
  BookmarkAlreadyExistsError,
  type BookmarkRecord,
} from "../server/bookmark.types";

export interface BookmarkRepository {
  find(freelancerId: string, projectId: string): BookmarkRecord | null;
  /** 이미 있으면 BookmarkAlreadyExistsError 를 던진다 */
  insert(record: BookmarkRecord): BookmarkRecord;
  /** 지운 건수. 없었으면 0 — 오류가 아니다 (규칙 2) */
  remove(freelancerId: string, projectId: string): number;
  /** 최근 저장순 (규칙 10) */
  findByFreelancer(freelancerId: string): BookmarkRecord[];
  countByFreelancer(freelancerId: string): number;
}

export type MockClock = { now(): string };

export function createFixedClock(iso: string): MockClock {
  return { now: () => iso };
}

export const systemClock: MockClock = { now: () => new Date().toISOString() };

/* ─────────────── 시드 ─────────────── */

const FREELANCER = "usr_free_1";
const OTHER_FREELANCER = "usr_free_2";

/**
 * 저장 시각이 서로 다르다. 정렬을 검증하려면 같은 값이면 안 된다.
 * `prj_deleted` 를 일부러 넣었다 — 규칙 12(목록에서만 빠지고 행은 남는다)를
 * 확인하려면 삭제된 프로젝트를 가리키는 북마크가 있어야 한다.
 */
export const BOOKMARK_SEEDS: BookmarkRecord[] = [
  { bookmarkId: "bkm_001", freelancerId: FREELANCER, projectId: "prj_open_free", createdAt: "2026-08-25T10:00:00Z" },
  { bookmarkId: "bkm_002", freelancerId: FREELANCER, projectId: "prj_closed", createdAt: "2026-08-24T09:00:00Z" },
  { bookmarkId: "bkm_003", freelancerId: FREELANCER, projectId: "prj_deleted", createdAt: "2026-08-23T08:00:00Z" },
  { bookmarkId: "bkm_004", freelancerId: FREELANCER, projectId: "prj_scheduled", createdAt: "2026-08-22T07:00:00Z" },
  { bookmarkId: "bkm_005", freelancerId: OTHER_FREELANCER, projectId: "prj_open_free", createdAt: "2026-08-26T11:00:00Z" },
];

export function cloneBookmarkSeeds(): BookmarkRecord[] {
  return BOOKMARK_SEEDS.map((b) => ({ ...b }));
}

/* ─────────────── 구현 ─────────────── */

export function createBookmarkRepositoryMock(
  clock: MockClock = systemClock,
  seeds: BookmarkRecord[] = cloneBookmarkSeeds(),
): BookmarkRepository {
  // 키를 `freelancerId::projectId` 로 잡는 것 자체가 UNIQUE 제약이다.
  const rows = new Map<string, BookmarkRecord>(
    seeds.map((b) => [`${b.freelancerId}::${b.projectId}`, b]),
  );
  void clock;

  const key = (f: string, p: string) => `${f}::${p}`;

  return {
    find(freelancerId, projectId) {
      return rows.get(key(freelancerId, projectId)) ?? null;
    },

    insert(record) {
      const k = key(record.freelancerId, record.projectId);
      if (rows.has(k)) {
        // 실제 DB 의 UNIQUE 위반과 같은 자리에서 실패해야 한다.
        // 여기서 조용히 덮어쓰면 서비스의 중복 처리 경로가 검증되지 않는다.
        throw new BookmarkAlreadyExistsError(record.freelancerId, record.projectId);
      }
      rows.set(k, record);
      return record;
    },

    remove(freelancerId, projectId) {
      return rows.delete(key(freelancerId, projectId)) ? 1 : 0;
    },

    findByFreelancer(freelancerId) {
      return [...rows.values()]
        .filter((b) => b.freelancerId === freelancerId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    countByFreelancer(freelancerId) {
      return [...rows.values()].filter((b) => b.freelancerId === freelancerId).length;
    },
  };
}

/** 실제 DB 는 id 를 스스로 만든다. 테스트에서 값을 예측할 수 있게 주입받는다 */
export function createIdGenerator(prefix = "bkm_new"): () => string {
  let n = 0;
  return () => `${prefix}_${++n}`;
}
