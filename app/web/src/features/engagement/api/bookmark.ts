import { http } from '../../../shared/http';
import type {
  BookmarkIdsResponse,
  BookmarkListResponse,
  BookmarkToggleResponse,
  RecommendationResponse,
} from '../bookmark.types';

/**
 * engagement API 호출 함수. 전부 `shared/http.ts` 를 거친다.
 * 경로는 `features/engagement/api-contract.md` 가 고정한 값 그대로다.
 */

/**
 * 북마크 추가.
 *
 * **`POST` 가 아니라 `PUT` 이다** — "새로 만든다"가 아니라 "저장된 상태로 만든다"이기 때문이다.
 * 이미 저장돼 있어도 200 이고, 구분이 필요하면 `changed` 를 본다 (api-contract.md).
 */
export function addBookmark(projectId: string): Promise<BookmarkToggleResponse> {
  return http.put<BookmarkToggleResponse>(`/v1/projects/${projectId}/bookmarks`);
}

/** 북마크 제거. 없었어도 성공이다 (규칙 2) */
export function removeBookmark(projectId: string): Promise<BookmarkToggleResponse> {
  return http.delete<BookmarkToggleResponse>(`/v1/projects/${projectId}/bookmarks`);
}

/** 내 북마크 목록. 경로에 사용자 id 가 없다 — 토큰 주인 것만 나온다 (규칙 9) */
export function fetchMyBookmarks(page = 1): Promise<BookmarkListResponse> {
  return http.get<BookmarkListResponse>('/v1/bookmarks', { query: { page } });
}

/**
 * 저장한 프로젝트 id 목록 (CR-0008).
 *
 * 프로젝트 카드마다 북마크 여부를 대조하는 데 쓴다. `PublicProjectItem` 에는
 * `isBookmarked` 가 없어 화면이 직접 대조해야 한다.
 */
export function fetchBookmarkedProjectIds(): Promise<BookmarkIdsResponse> {
  return http.get<BookmarkIdsResponse>('/v1/bookmarks/ids');
}

/** 추천 프로젝트. 비로그인도 볼 수 있다 (규칙 16) */
export function fetchRecommendations(projectId: string): Promise<RecommendationResponse> {
  return http.get<RecommendationResponse>(`/v1/projects/${projectId}/recommendations`, {
    skipAuth: true,
  });
}
