import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
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
 * 등록 3단계 퍼널(`ProjectRegisterForm.tsx`, project-management)과의 실제 연결(전달받은 초안을
 * 미리 채우고, "이 추천 예산 사용하기" 선택 후 그 폼으로 값을 들고 돌아가는 것)은 아직 붙지
 * 않았다 — 두 기능 폴더는 서로 import하지 않으므로 project-management 쪽에 진입 버튼을 추가하는
 * 작업이 별도로 필요하다. 지금은 이 라우트 자체가 독립적으로 동작하는 것까지가 이번 통합
 * 범위다(feedback_loop/2026-09-04/ai-pricing.md 참고).
 */
export function NewPricingAnalysisPage() {
  const navigate = useNavigate();
  const { status, analysis, errorMessage, analyze, retry } = usePricingAnalysis();
  const [draft, setDraft] = useState<PricingAnalysisDraft>({ title: '', description: '', category: '' });
  const [errors, setErrors] = useState<PricingAnalysisDraftErrors>({});
  const [decision, setDecision] = useState<'used' | 'manual' | null>(null);

  function handleSubmit() {
    const nextErrors = validatePricingAnalysisDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    void analyze(draft);
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
          onUseRecommendation={() => setDecision('used')}
          onUseDirectInput={() => setDecision('manual')}
        />
      ) : null}

      {decision === 'used' && analysis?.result ? (
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
