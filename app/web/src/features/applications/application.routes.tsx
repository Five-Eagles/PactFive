import { Route } from 'react-router-dom';
import { ApplyPage } from './ApplyPage';
import { ManageApplicantsPage } from './ManageApplicantsPage';
import { MyApplicationsPage } from './MyApplicationsPage';

/**
 * applications 라우트 정의 + 경로 상수 — ai-pricing/pricing-analysis.routes.tsx와 같은 선례
 * (api-contract.md는 API 경로만 고정하지 화면 URL은 정하지 않는다. 화면 URL은 이번 반영에서
 * 처음 정한다).
 */
export const APPLICATION_ROUTES = {
  apply: (projectId: string) => `/projects/${projectId}/apply`,
  manage: (projectId: string) => `/projects/${projectId}/applicants`,
  mine: '/applications/me',
} as const;

export function applicationRoutes() {
  return (
    <>
      <Route path="/projects/:projectId/apply" element={<ApplyPage />} />
      <Route path="/projects/:projectId/applicants" element={<ManageApplicantsPage />} />
      <Route path={APPLICATION_ROUTES.mine} element={<MyApplicationsPage />} />
    </>
  );
}
