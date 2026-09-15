import { Route } from 'react-router-dom';
import { ReviewPage } from './ReviewPage';

/**
 * reviews 라우트 정의 + 경로 상수 — applications/application.routes.tsx와 같은 선례
 * (api-contract.md는 API 경로만 고정하지 화면 URL은 정하지 않는다).
 *
 * 2026-09-09 — 단수 `/review`를 복수 `/reviews`로 바꿨다(이식 지시서 §3, applications
 * 지시서 3-3과 짝). applications의 「완료됨」 배지 CTA가 이 경로로 가는 프리랜서의 유일한
 * 리뷰 진입 경로다 — 두 곳이 어긋나면 CTA가 404였다.
 */
export const REVIEW_ROUTES = {
  project: (projectId: string) => `/projects/${projectId}/reviews`,
} as const;

export function reviewRoutes() {
  return <Route path="/projects/:projectId/reviews" element={<ReviewPage />} />;
}
