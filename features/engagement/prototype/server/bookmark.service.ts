/**
 * engagement 서비스 — 공개 API 4종
 *
 * ## 이 파일이 지키는 세 가지
 *
 * 1. **몇 번을 불러도 결과가 같다** — 추가는 "1건 있는 상태로 만든다",
 *    제거는 "0건인 상태로 만든다" (규칙 1·2). 토글 UI 는 더블클릭과 재시도가 잦다.
 * 2. **프로젝트를 읽기만 한다** — 포트를 거치고 직접 import 하지 않는다 (PRD §4.0).
 * 3. **거래 상태를 다루지 않는다** — 포트가 애초에 주지 않아서 실수로 내보낼 수 없다 (규칙 27).
 */

import {
  BookmarkAlreadyExistsError,
  BOOKMARK_PAGE_SIZE,
  EngagementError,
  RECOMMENDATION_COUNT,
  type AuthContext,
  type BookmarkedProject,
  type BookmarkItem,
  type BookmarkListQuery,
  type BookmarkListResponse,
  type BookmarkToggleResponse,
  type EngagementErrorCode,
  type RecommendationReason,
  type RecommendedItem,
  type RecommendationResponse,
} from "./bookmark.types";
import type { EngagementPorts, ProjectCardData } from "./ports/project-read.port";
import type { BookmarkRepository } from "../mock/bookmark.mock";

export type EngagementServiceDeps = {
  repo: BookmarkRepository;
  ports: EngagementPorts;
  now: () => string;
  newBookmarkId: () => string;
};

export type Responded<T> = { status: number; body: T };

export function createEngagementService(deps: EngagementServiceDeps) {
  const { repo, ports, now, newBookmarkId } = deps;

  /* ═══════════ 공통 ═══════════ */

  function fail(status: number, code: EngagementErrorCode, message: string, details: unknown = null): never {
    throw new EngagementError(status, code, message, details);
  }

  /** 규칙 5 — 비로그인 401, 의뢰인 403. 두 경우를 하나로 뭉치지 않는다 */
  async function requireFreelancer(auth: AuthContext | null): Promise<AuthContext> {
    if (!auth) fail(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
    // 역할 판정은 user-management 가 한다. users.role 을 직접 읽지 않는다 (규칙 33).
    const role = await ports.userRead.getUserRole(auth.userId);
    if (role !== "FREELANCER") {
      fail(403, "BOOKMARK_ROLE_REQUIRED", "프리랜서만 저장할 수 있습니다.", { role });
    }
    return auth;
  }

  /** 규칙 6·25 — 없거나 삭제된 프로젝트는 404 */
  async function mustFindProject(projectId: string): Promise<ProjectCardData> {
    const found = await ports.projectRead.getProjectCardData(projectId);
    if (!found) fail(404, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.", { projectId });
    return found;
  }

  function toBookmarkedProject(p: ProjectCardData): BookmarkedProject {
    // createdAt 을 빼고 내보낸다. 추천 정렬에만 쓰는 값이라 화면에 필요 없다.
    const { createdAt: _createdAt, ...rest } = p;
    return rest;
  }

  /* ═══════════ 1. 북마크 추가 (규칙 1·3·7) ═══════════ */

  async function addBookmark(
    auth: AuthContext | null,
    projectId: string,
  ): Promise<Responded<BookmarkToggleResponse>> {
    const me = await requireFreelancer(auth);
    // 마감·거래 중·취소된 프로젝트도 저장할 수 있다 (규칙 7).
    // 여기서 보는 것은 "존재하는가"뿐이다.
    await mustFindProject(projectId);

    const at = now();

    try {
      const created = repo.insert({
        bookmarkId: newBookmarkId(),
        freelancerId: me.userId,
        projectId,
        createdAt: at,
      });
      return {
        status: 200,
        body: { projectId, bookmarked: true, bookmarkedAt: created.createdAt, changed: true },
      };
    } catch (e) {
      if (!(e instanceof BookmarkAlreadyExistsError)) throw e;

      // 이미 있다. **오류가 아니다** (규칙 1).
      //
      // 미리 조회해서 막지 않고 여기서 잡는 이유: 조회와 삽입 사이의 틈을 없앨 수 없다.
      // 더블클릭한 두 요청이 둘 다 조회를 통과한 뒤 둘 다 삽입을 시도한다.
      // UNIQUE 제약이 그 틈을 막고, 진 쪽이 여기로 온다.
      const existing = repo.find(me.userId, projectId);
      return {
        status: 200,
        body: {
          projectId,
          bookmarked: true,
          // 최초 시각을 그대로 준다. 갱신하면 "최근 저장순"에서 순서가 튄다 (규칙 3).
          bookmarkedAt: existing?.createdAt ?? at,
          changed: false,
        },
      };
    }
  }

  /* ═══════════ 2. 북마크 제거 (규칙 2·4) ═══════════ */

  async function removeBookmark(
    auth: AuthContext | null,
    projectId: string,
  ): Promise<Responded<BookmarkToggleResponse>> {
    const me = await requireFreelancer(auth);
    await mustFindProject(projectId);

    // 규칙 4 — 행을 실제로 지운다. 프로젝트와 달리 소프트 삭제하지 않는다.
    const removed = repo.remove(me.userId, projectId);

    // 규칙 2 — 없었어도 성공이다. 사용자가 원한 결과가 이미 이뤄져 있다.
    return { status: 200, body: { projectId, bookmarked: false, changed: removed > 0 } };
  }

  /* ═══════════ 3. 내 북마크 목록 (규칙 9~15) ═══════════ */

  async function listBookmarks(
    auth: AuthContext | null,
    query: BookmarkListQuery = {},
  ): Promise<Responded<BookmarkListResponse>> {
    const me = await requireFreelancer(auth);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? BOOKMARK_PAGE_SIZE;
    if (page < 1 || page > 1000) fail(422, "VALIDATION_ERROR", "page 는 1~1000 입니다.", { field: "page" });
    if (pageSize < 1 || pageSize > 50) {
      fail(422, "VALIDATION_ERROR", "pageSize 는 1~50 입니다.", { field: "pageSize" });
    }

    // 규칙 9 — 토큰 주인 것만 읽는다. 다른 사람을 가리킬 방법이 애초에 없다.
    // 규칙 10 — 저장소가 최근 저장순으로 준다.
    const mine = repo.findByFreelancer(me.userId);

    // 규칙 12 — 삭제된 프로젝트는 목록에서 빠진다. 북마크 행은 남는다.
    //
    // **거른 뒤에 페이지를 자른다.** 순서를 바꾸면 삭제분이 낀 페이지만 항목이
    // 모자라 보인다 — 10개를 자른 뒤 거르면 8개짜리 페이지가 생긴다.
    const cards = await ports.projectRead.getProjectCardDataBulk(mine.map((b) => b.projectId));
    const alive = mine.filter((b) => cards.has(b.projectId));

    const totalCount = alive.length;
    const start = (page - 1) * pageSize;

    const items: BookmarkItem[] = alive.slice(start, start + pageSize).map((b) => {
      const project = cards.get(b.projectId)!;
      return {
        bookmarkId: b.bookmarkId,
        bookmarkedAt: b.createdAt,
        project: toBookmarkedProject(project),
        // 규칙 14 — 마감된 것은 남기되 지원만 막는다. 화면이 다시 계산하지 않게 서버가 준다.
        canApply: project.recruitmentStatus === "OPEN",
      };
    });

    // 규칙 15 — 비어 있어도 오류가 아니다. 빈 목록을 그대로 준다.
    return {
      status: 200,
      body: { items, page, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize) },
    };
  }

  /* ═══════════ 4. 추천 프로젝트 (규칙 16~26) ═══════════ */

  /**
   * 규칙 20 — 세 단계. 낮은 숫자가 먼저다.
   *
   * 후보는 이미 "카테고리가 같거나 기술이 겹치는" 것만 들어온다.
   * 여기서는 그중 어느 쪽인지만 가른다.
   */
  function tierOf(candidate: ProjectCardData, category: string, skillIds: string[]): number {
    const sameCategory = candidate.category.category === category;
    const sharesSkill = candidate.skills.some((s) => skillIds.includes(s.skillId));
    if (sameCategory && sharesSkill) return 1;
    if (sameCategory) return 2;
    return 3;
  }

  /**
   * 순위를 사유로 바꾼다.
   *
   * **숫자를 내보내지 않는다** (규칙 28). 1·2·3 은 정렬에만 쓰고,
   * 밖으로는 무엇이 겹쳤는지만 말한다. 나중에 우선순위를 바꿔도
   * 화면이 숫자에 기대고 있지 않아서 깨지지 않는다.
   */
  const REASON_BY_TIER: Record<number, RecommendationReason> = {
    1: "SAME_CATEGORY_AND_SKILL",
    2: "SAME_CATEGORY",
    3: "SHARED_SKILL",
  };

  async function getRecommendations(projectId: string): Promise<Responded<RecommendationResponse>> {
    // 규칙 16 — 로그인이 필요 없다.
    // 규칙 25 — 없거나 삭제된 프로젝트면 404.
    const base = await mustFindProject(projectId);

    const skillIds = base.skills.map((s) => s.skillId);
    const candidates = await ports.projectRead.findRecommendationCandidates({
      excludeProjectId: projectId,
      category: base.category.category,
      skillIds,
    });

    const ranked = [...candidates].sort((a, b) => {
      const ta = tierOf(a, base.category.category, skillIds);
      const tb = tierOf(b, base.category.category, skillIds);
      if (ta !== tb) return ta - tb;
      // 규칙 21 — 같은 순위 안에서는 최근 등록순.
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // 규칙 22·23 — 4건 고정. 적으면 있는 만큼. 채우려고 조건을 완화하지 않는다.
    // 규칙 24 — 0건이어도 오류가 아니다. 섹션을 감추는 것은 화면의 일이다.
    // 규칙 28 — 순위값을 응답에 넣지 않는다. 순서로만 표현한다.
    return {
      status: 200,
      body: {
        items: ranked.slice(0, RECOMMENDATION_COUNT).map((c): RecommendedItem => {
          const tier = tierOf(c, base.category.category, skillIds);
          return {
            ...toBookmarkedProject(c),
            reason: REASON_BY_TIER[tier]!,
            matchedSkills: c.skills.filter((s) => skillIds.includes(s.skillId)).map((s) => s.displayName),
          };
        }),
      },
    };
  }

  return { addBookmark, removeBookmark, listBookmarks, getRecommendations };
}
