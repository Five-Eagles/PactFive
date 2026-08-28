/**
 * engagement 화면이 서버에서 받는 모양.
 *
 * project-management 의 타입을 import 하지 않는다 — 담당자가 같아도, 화면이 같은 카드를
 * 그리더라도 경계는 유지한다 (PRD §4.0 · app/web/AGENTS.md "폴더 간 접점").
 *
 * **`transactionStatus` 가 없다.** 서버가 애초에 보내지 않는다 (spec.md 규칙 27).
 */

export type RecruitmentStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED';

/** 북마크·추천 카드가 쓰는 프로젝트 정보 */
export type BookmarkedProject = {
  projectId: string;
  title: string;
  category: { category: string; displayName: string };
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  recruitmentStatus: RecruitmentStatus;
  skills: { skillId: string; displayName: string }[];
  applicationCount: number;
};

export type BookmarkToggleResponse = {
  projectId: string;
  /** 이 호출이 끝난 뒤의 상태. "무엇을 했는가"가 아니라 "지금 어떤 상태인가"다 */
  bookmarked: boolean;
  bookmarkedAt?: string;
  changed: boolean;
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

/** 페이지 껍데기를 쓰지 않는다 — 고정 4건이라 넘길 페이지가 없다 (규칙 22) */
export type RecommendationResponse = {
  items: BookmarkedProject[];
};
