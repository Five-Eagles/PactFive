import "./preview.css";
import { useState } from "react";
import { PricingAnalysisPage } from "./PricingAnalysisPage";

export { PricingAnalysisForm, validatePricingAnalysisDraft } from "./PricingAnalysisForm";
export type { PricingAnalysisDraft, PricingAnalysisDraftErrors } from "./PricingAnalysisForm";
export { PricingAnalysisPage } from "./PricingAnalysisPage";
export type {
  PricingAnalysisExistingProjectContext,
  PricingAnalysisPageProps,
  PricingAnalysisRegistrationContext,
} from "./PricingAnalysisPage";
export { PricingAnalysisReport } from "./PricingAnalysisReport";
export {
  PENDING_POLL_POLICY,
  canContinuePendingPolling,
  pendingPollDelay,
  usePricingAnalysis,
} from "./usePricingAnalysis";
export type { PricingAnalysisUiStatus } from "./usePricingAnalysis";
export { setPricingAnalysisAccessTokenProvider } from "./api/pricing-analysis";
export type { PricingAnalysisAccessTokenProvider } from "./api/pricing-analysis";

/** preview:dev 기본 화면. 앱 셸은 팀장 통합 단계에서 조립한다. */
export default function AiPricingPreview() {
  const [handoffMessage, setHandoffMessage] = useState<string | null>(null);
  return (
    <>
      <PricingAnalysisPage
        context={{
          kind: "registration",
          onUseRecommendation: ({ pricingAnalysisId }) =>
            setHandoffMessage(`추천 분석 ${pricingAnalysisId}을 프로젝트 등록으로 전달합니다.`),
          onUseDirectInput: () => setHandoffMessage("직접 예산 입력 단계로 이동합니다."),
          onBack: () => setHandoffMessage("프로젝트 등록 화면으로 돌아갑니다."),
        }}
      />
      {handoffMessage ? <p className="pricing-preview-handoff" role="status">{handoffMessage}</p> : null}
    </>
  );
}
