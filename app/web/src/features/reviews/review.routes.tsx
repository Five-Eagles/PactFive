import { Route } from 'react-router-dom';
import { ReviewPage } from './ReviewPage';

/**
 * reviews 라우트 정의 + 경로 상수 — applications/application.routes.tsx와 같은 선례
 * (api-contract.md는 API 경로만 고정하지 화면 URL은 정하지 않는다).
 */
export const REVIEW_ROUTES = {
  project: (projectId: string) => `/projects/${projectId}/review`,
} as const;

export function reviewRoutes() {
  return <Route path="/projects/:projectId/review" element={<ReviewPage />} />;
}
