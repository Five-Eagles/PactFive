import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { EmptyState } from '../../shared/ui/primitives';
import { usePricingAnalysis } from './usePricingAnalysis';
import { ResultReport } from './pricing-analysis/ResultReport';
import { ApplyConflictPanel, ApplyFailurePanel, DeclinedNotice, SubmittingPanel } from './pricing-analysis/StatusPanels';

/**
 * 이미 등록된 프로젝트에 분석 결과를 반영하는 맥락 — design/high-fi.html의
 * `data-existing-only` 패널들("기존 프로젝트 결과" 비교 UI, 반영/미반영 CTA, 409/500 복구).
 *
 * `currentBudgetAmount`·`expectedProjectVersion`은 이 화면이 스스로 조회하지 않고 쿼리스트링으로
 * 받는다 — 프로젝트 상세 화면(`ProjectDetailPage.tsx`, project-management)이 이미 알고 있는
 * 값을 다시 두 번째 API 호출로 가져오면 그 사이 값이 바뀔 여지가 생긴다. 상세 화면에 "AI로 예산
 * 재분석" 진입 링크를 붙이는 작업은 아직이다(feedback_loop/2026-09-04/ai-pricing.md 참고) —
 * 지금은 이 라우트가 그 값들을 받았을 때 올바르게 동작하는 것까지가 이번 통합 범위다.
 *
 * `projectDetailHref`는 project-management의 `PROJECT_ROUTES.detail`을 이 컴포넌트가 직접
 * import하지 않기 위한 슬롯이다(app/web/AGENTS.md "폴더 간 접점") — engagement의
 * `RecommendationSection`이 `detailHref`를 받는 것과 같은 패턴. `pricing-analysis.routes.tsx`를
 * 통해 App.tsx가 실제 값을 채운다.
 */
export function PricingAnalysisApplyPage({
  projectDetailHref,
}: {
  projectDetailHref: (projectId: string) => string;
}) {
  const { pricingAnalysisId } = useParams<{ pricingAnalysisId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { status, analysis, application, errorMessage, load, apply } = usePricingAnalysis();

  const projectId = searchParams.get('projectId');
  const currentBudgetAmount = Number(searchParams.get('currentBudgetAmount'));
  const expectedProjectVersionRaw = searchParams.get('expectedProjectVersion');
  const expectedProjectVersion = expectedProjectVersionRaw ? Number(expectedProjectVersionRaw) : undefined;

  useEffect(() => {
    if (pricingAnalysisId) void load(pricingAnalysisId);
  }, [pricingAnalysisId, load]);

  if (!pricingAnalysisId || !projectId || !Number.isFinite(currentBudgetAmount)) {
    return (
      <PageBody>
        <EmptyState
          title="예산 반영에 필요한 정보가 없습니다"
          body="프로젝트 상세 화면에서 다시 시도해 주세요."
        />
      </PageBody>
    );
  }

  const viewProject = () => navigate(projectDetailHref(projectId));

  return (
    <PageBody>
      {status === 'submitting' ? <SubmittingPanel /> : null}

      {status === 'conflict' ? (
        <ApplyConflictPanel onViewLatestProject={viewProject} onBackToResult={() => window.location.reload()} />
      ) : null}

      {status === 'error' && errorMessage ? (
        <ApplyFailurePanel
          onViewLatestProject={viewProject}
          onRetryApply={() => void apply(projectId, currentBudgetAmount, expectedProjectVersion)}
        />
      ) : null}

      {(status === 'ready' || status === 'applying' || status === 'applied') && analysis?.result ? (
        <>
          <ResultReport
            analysis={analysis}
            currentBudgetAmount={currentBudgetAmount}
            applying={status === 'applying'}
            applied={status === 'applied'}
            onApply={() => void apply(projectId, currentBudgetAmount, expectedProjectVersion)}
            onDecline={viewProject}
          />
          {status === 'ready' ? <DeclinedNotice /> : null}
        </>
      ) : null}

      {status === 'applied' && application ? (
        <div className="card">
          <h2>프로젝트 예산에 반영했습니다</h2>
        </div>
      ) : null}
    </PageBody>
  );
}
