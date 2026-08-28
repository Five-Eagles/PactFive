/**
 * engagement 도메인 타입
 *
 * 원본: features/engagement/prototype/server/bookmark.types.ts (3e4977e)
 *
 * `bookmarks` 테이블 한 개와, 프로젝트에서 읽어 오는 카드 데이터가 전부다.
 * project-management 의 타입을 직접 import 하지 않는다 — 담당자가 같아도 경계는
 * 유지한다 (PRD §4.0). 필요한 모양은 `bookmark.port.ts` 에 이쪽 기준으로 다시 선언한다.
 */

/* ─────────────── 저장 데이터 ─────────────── */

/** ERD `bookmarks` 컬럼을 그대로 옮긴다 */
export type BookmarkRecord = {
  bookmarkId: string;
  freelancerId: string;
  projectId: string;
  createdAt: string;
};

/* ─────────────── 인증 ─────────────── */

export type UserRole = 'CLIENT' | 'FREELANCER';

/** shared/require-auth.ts · shared/optional-auth.ts 가 주입한다. 비로그인은 null */
export type AuthContext = { userId: string; role: UserRole };

/* ─────────────── 응답 ─────────────── */

/**
 * 토글 응답.
 *
 * `bookmarked` 는 **이 호출이 끝난 뒤의 상태**다. "무엇을 했는가"가 아니라
 * "지금 어떤 상태인가"를 준다 — 화면이 아이콘을 그것 하나로 확정할 수 있게.
 */
export type BookmarkToggleResponse = {
  projectId: string;
  bookmarked: boolean;
  /** 추가 응답에만 있다. 최초 저장 시각이고 재호출해도 갱신하지 않는다 (규칙 3) */
  bookmarkedAt?: string;
  /** 이번 호출로 실제로 바뀌었는가. 이미 그 상태였으면 false */
  changed: boolean;
};

/** 프로젝트 카드. 거래 상태가 없다 — 애초에 받지 않는다 (규칙 27) */
export type BookmarkedProject = {
  projectId: string;
  title: string;
  category: { category: string; displayName: string };
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  recruitmentStatus: 'SCHEDULED' | 'OPEN' | 'CLOSED';
  skills: { skillId: string; displayName: string }[];
  applicationCount: number;
};

export type BookmarkItem = {
  bookmarkId: string;
  /** 정렬 기준. 프로젝트 등록 시각이 아니다 (규칙 10) */
  bookmarkedAt: string;
  project: BookmarkedProject;
  /** 서버가 판정한다. 화면이 모집 상태로 다시 계산하지 않는다 (규칙 14) */
  canApply: boolean;
};

export type BookmarkListResponse = {
  items: BookmarkItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type BookmarkListQuery = {
  page?: number;
  pageSize?: number;
};

/**
 * 추천 응답.
 *
 * **목록 껍데기(`page`·`totalCount`)를 쓰지 않는다.** 페이지를 넘길 수 없는 고정 4건이라,
 * 넘길 수 없는 값을 내려보내면 화면이 페이지네이션을 붙이려 든다.
 * **순위값도 없다** (규칙 28). 순서만으로 표현한다.
 */
export type RecommendationResponse = {
  items: BookmarkedProject[];
};

/* ─────────────── 오류 ─────────────── */

export type EngagementErrorCode =
  | 'AUTH_REQUIRED'
  | 'BOOKMARK_ROLE_REQUIRED'
  | 'PROJECT_NOT_FOUND'
  | 'VALIDATION_ERROR';

export type ErrorBody = {
  error: { code: EngagementErrorCode; message: string; details: unknown };
};

export class EngagementError extends Error {
  readonly status: number;
  readonly body: ErrorBody;

  constructor(status: number, code: EngagementErrorCode, message: string, details: unknown = null) {
    super(message);
    this.name = 'EngagementError';
    this.status = status;
    this.body = { error: { code, message, details } };
  }
}

export function isEngagementError(e: unknown): e is EngagementError {
  return e instanceof EngagementError;
}

/**
 * 저장소가 UNIQUE 위반일 때 던진다.
 *
 * 서비스가 이것을 잡아 **성공으로 바꾼다** (규칙 1). 오류로 내보내지 않는다 —
 * 사용자가 원한 결과("저장된 상태")가 이미 이뤄져 있기 때문이다.
 */
export class BookmarkAlreadyExistsError extends Error {
  constructor(
    readonly freelancerId: string,
    readonly projectId: string,
  ) {
    super(`bookmark already exists: ${freelancerId} / ${projectId}`);
    this.name = 'BookmarkAlreadyExistsError';
  }
}

export const BOOKMARK_PAGE_SIZE = 10;
/** 규칙 22 — 파라미터로 조정하지 않는다 */
export const RECOMMENDATION_COUNT = 4;
