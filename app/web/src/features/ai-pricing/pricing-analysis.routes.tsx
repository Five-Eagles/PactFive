import { Route } from 'react-router-dom';
import { NewPricingAnalysisPage } from './NewPricingAnalysisPage';
import { PricingAnalysisApplyPage } from './PricingAnalysisApplyPage';

/**
 * ai-pricing 라우트 정의 + 경로 상수. api-contract.md는 API 경로만 고정하지 — 화면 URL은
 * 이번 반영에서 처음 정했다(contracts-payments의 CONTRACT_ROUTES와 같은 선례).
 */
export const PRICING_ANALYSIS_ROUTES = {
  /** 프로젝트 등록 Step 2 맥락 — 아직 프로젝트가 없다. */
  new: '/pricing-analyses/new',
  /** 이미 등록된 프로젝트에 반영하는 맥락. */
  apply: (
    pricingAnalysisId: string,
    query: { projectId: string; currentBudgetAmount: number; expectedProjectVersion?: number },
  ) => {
    const params = new URLSearchParams({
      projectId: query.projectId,
      currentBudgetAmount: String(query.currentBudgetAmount),
    });
    if (query.expectedProjectVersion !== undefined) {
      params.set('expectedProjectVersion', String(query.expectedProjectVersion));
    }
    return `/pricing-analyses/${pricingAnalysisId}/apply?${params.toString()}`;
  },
} as const;

export type PricingAnalysisRouteProps = {
  /** project-management의 PROJECT_ROUTES.detail — 폴더 간 접점은 App.tsx에서만 잇는다. */
  projectDetailHref: (projectId: string) => string;
  /** project-management 소유 — 등록 폼(3단계 퍼널) 경로. "이 추천 예산 사용하기"를 누르면
   * 여기로 돌아간다(2026-09-05, 폴더 간 접점은 App.tsx에서만 잇는다). */
  registerHref?: string;
};

export function pricingAnalysisRoutes({ projectDetailHref, registerHref }: PricingAnalysisRouteProps) {
  return (
    <>
      <Route path="/pricing-analyses/new" element={<NewPricingAnalysisPage registerHref={registerHref} />} />
      <Route
        path="/pricing-analyses/:pricingAnalysisId/apply"
        element={<PricingAnalysisApplyPage projectDetailHref={projectDetailHref} />}
      />
    </>
  );
}
