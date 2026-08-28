import { Route } from 'react-router-dom';
import { MyBookmarksPage } from './MyBookmarksPage';

/**
 * engagement 라우트 정의 + 경로 상수.
 *
 * 화면이 하나뿐이다 — `BookmarkButton` 과 `RecommendationSection` 은 독립 화면이 아니라
 * project-management 화면 안에 붙는 조각이라 라우트를 갖지 않는다. 두 조각을 그쪽 화면에
 * 끼우는 것은 조립 지점인 `App.tsx` 의 일이다.
 */
export const ENGAGEMENT_ROUTES = {
  myBookmarks: '/my/bookmarks',
} as const;

export type EngagementRouteProps = {
  isFreelancer: boolean;
  browseHref: string;
  detailHref: (projectId: string) => string;
};

export function engagementRoutes({ isFreelancer, browseHref, detailHref }: EngagementRouteProps) {
  return (
    <Route
      path={ENGAGEMENT_ROUTES.myBookmarks}
      element={
        <MyBookmarksPage
          isFreelancer={isFreelancer}
          browseHref={browseHref}
          detailHref={detailHref}
        />
      }
    />
  );
}
