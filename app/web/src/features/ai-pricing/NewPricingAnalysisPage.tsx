import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { isPricingAnalysisCategory } from './pricing-analysis.constants';
import { usePricingAnalysis } from './usePricingAnalysis';
import {
  RequestForm,
  validatePricingAnalysisDraft,
  type PricingAnalysisDraft,
  type PricingAnalysisDraftErrors,
} from './pricing-analysis/RequestForm';
import { ResultReport } from './pricing-analysis/ResultReport';
import {
  AnalysisFailurePanel,
  DeclinedNotice,
  RejectedPanel,
  SubmittingPanel,
} from './pricing-analysis/StatusPanels';

/**
 * 프로젝트 등록 Step 2 맥락 — design/high-fi.html의 `data-registration-only` 패널들
 * (`request` → `submitting` → `result`(등록 결과 CTA) → `registration-used`/`registration-manual`).
 *
 * 등록 3단계 퍼널(`ProjectRegisterForm.tsx`, project-management)과의 실제 연결 — 2026-09-05 반영.
 * `ProjectRegisterForm`이 "AI 추천 예산 받기" 버튼으로 현재 Step 1 입력(title/description/category)을
 * 쿼리 파라미터로 실어 이 라우트로 보내면 여기서 그대로 초안을 미리 채운다. "이 추천 예산
 * 사용하기"를 고르면 `registerHref`(project-management 소유, App.tsx가 끼워준다)로
 * `recommendedBudget`·`pricingAnalysisId`를 실어 돌아간다 — 두 기능 폴더는 서로 import하지
 * 않으므로 실제 주소 문자열은 App.tsx에서만 조립한다(app/web/AGENTS.md "폴더 간 접점").
 */
export type NewPricingAnalysisPageProps = {
  registerHref?: string;
};

export function NewPricingAnalysisPage({ registerHref }: NewPricingAnalysisPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status, analysis, errorMessage, analyze, retry } = usePricingAnalysis();
  const [draft, setDraft] = useState<PricingAnalysisDraft>(() => {
    const category = searchParams.get('category') ?? '';
    return {
      title: searchParams.get('title') ?? '',
      description: searchParams.get('description') ?? '',
      category: isPricingAnalysisCategory(category) ? category : '',
    };
  });
  const [errors, setErrors] = useState<PricingAnalysisDraftErrors>({});
  const [decision, setDecision] = useState<'used' | 'manual' | null>(null);

  function handleSubmit() {
    const nextErrors = validatePricingAnalysisDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    void analyze(draft);
  }

  function useRecommendation() {
    setDecision('used');
    if (!registerHref || !analysis?.result) return;
    const params = new URLSearchParams({
      recommendedBudget: String(analysis.result.recommendedAmount),
      pricingAnalysisId: analysis.pricingAnalysisId,
    });
    navigate(`${registerHref}?${params.toString()}`);
  }

  return (
    <PageBody>
      <p>프로젝트 정보를 확인하고 추천 예산을 요청하세요.</p>

      {status === 'idle' || status === 'error' || status === 'rejected' ? (
        <>
          {status === 'error' && errorMessage ? (
            <AnalysisFailurePanel onRetry={() => void retry()} onUseDirectInput={() => navigate(-1)} />
          ) : status === 'rejected' ? (
            <RejectedPanel
              onRetry={() => void retry()}
              onReviewInput={() => setErrors(validatePricingAnalysisDraft(draft))}
            />
          ) : null}
          <RequestForm
            draft={draft}
            errors={errors}
            onChange={setDraft}
            onSubmit={handleSubmit}
            onUseDirectInput={() => navigate(-1)}
          />
        </>
      ) : null}

      {status === 'submitting' ? <SubmittingPanel /> : null}

      {status === 'ready' && analysis?.result && !decision ? (
        <ResultReport
          analysis={analysis}
          onUseRecommendation={useRecommendation}
          onUseDirectInput={() => setDecision('manual')}
        />
      ) : null}

      {/* registerHref가 없을 때(이 라우트가 등록 폼 밖에서 독립적으로 열렸을 때)만 이 안내가
          보인다 — 정상 흐름이면 useRecommendation()이 곧바로 등록 폼으로 돌려보낸다. */}
      {decision === 'used' && analysis?.result && !registerHref ? (
        <div className="card">
          <h2>추천 예산을 선택했습니다</h2>
          <p>
            분석 ID <code>{analysis.pricingAnalysisId}</code>를 프로젝트 등록 화면으로 가져가 예산 칸에
            반영해 주세요.
          </p>
        </div>
      ) : null}

      {decision === 'manual' ? (
        <div className="card">
          <h2>직접 예산 입력을 선택했습니다</h2>
          <DeclinedNotice />
        </div>
      ) : null}
    </PageBody>
  );
}
