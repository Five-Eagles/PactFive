import { useEffect, useMemo, useState } from "react";
import type { PricingAnalysisResponse } from "../server/pricing-analysis.types";
import {
  PricingAnalysisForm,
  validatePricingAnalysisDraft,
  type PricingAnalysisDraft,
  type PricingAnalysisDraftErrors,
} from "./PricingAnalysisForm";
import { PricingAnalysisReport } from "./PricingAnalysisReport";
import { usePricingAnalysis, type PricingAnalysisUiStatus } from "./usePricingAnalysis";
import type { PricingAnalysisApiClient } from "./api/pricing-analysis";

export type PricingAnalysisRegistrationContext = {
  kind: "registration";
  onUseRecommendation: (selection: {
    pricingAnalysisId: string;
    recommendedAmount: number;
  }) => void;
  onUseDirectInput: () => void;
  onBack: () => void;
};

export type PricingAnalysisExistingProjectContext = {
  kind: "existing-project";
  projectId: string;
  projectVersion?: number;
  currentBudgetAmount: number;
  onApplied: (budgetAmount: number) => void;
  onBack: () => void;
};

export type PricingAnalysisPageProps = {
  context: PricingAnalysisRegistrationContext | PricingAnalysisExistingProjectContext;
  initialDraft?: Partial<PricingAnalysisDraft>;
  client?: PricingAnalysisApiClient;
  /** 프리뷰와 SSR 계약 검증에서 네트워크 없이 각 상태를 재현한다. */
  previewState?: PricingAnalysisUiStatus;
};

const PREVIEW_ANALYSIS: PricingAnalysisResponse = {
  pricingAnalysisId: "pra_preview_1",
  reviewStatus: "APPROVED",
  inputSnapshot: {
    title: "B2B 주문 관리 웹 서비스 구축",
    description: "관리자와 파트너사가 주문과 재고 현황을 관리하는 반응형 웹 서비스입니다.",
    category: "WEB_DEVELOPMENT",
  },
  result: {
    currency: "KRW",
    recommendedAmount: 1_500_000,
    breakdown: [
      {
        name: "기획 및 설계",
        description: "요구사항과 화면 흐름 정리",
        amount: 300_000,
        rationale: "범위 확정과 기술 설계 작업을 반영했습니다.",
      },
      {
        name: "핵심 구현",
        description: "주문·재고 기능과 반응형 화면 구현",
        amount: 900_000,
        rationale: "핵심 기능의 개발 난이도와 작업량을 반영했습니다.",
      },
      {
        name: "검증 및 인수",
        description: "테스트, 수정과 전달 문서",
        amount: 300_000,
        rationale: "품질 검증과 인수 대응 범위를 반영했습니다.",
      },
    ],
  },
  failure: null,
  createdAt: "2026-09-04T09:00:00.000Z",
  reviewedAt: "2026-09-04T09:00:05.000Z",
  appliedAt: null,
};

function statusCopy(status: PricingAnalysisUiStatus): string {
  const copy: Record<PricingAnalysisUiStatus, string> = {
    idle: "프로젝트 정보를 입력하면 항목별 권장 금액을 분석합니다.",
    loading: "저장된 분석 결과를 불러오는 중입니다.",
    submitting: "입력한 범위를 분석하고 결과를 검증하는 중입니다.",
    ready: "검증된 권장 금액과 항목별 근거가 준비되었습니다.",
    rejected: "분석을 완료하지 못했습니다. 입력한 내용은 그대로 보존했습니다.",
    conflict: "요청 또는 프로젝트 상태가 달라 작업을 계속할 수 없습니다.",
    error: "요청을 처리하지 못했습니다. 입력과 이전 보고서는 그대로 보존했습니다.",
    applying: "프로젝트 예산과 분석 사용 기록을 함께 반영하는 중입니다.",
    applied: "권장 금액을 프로젝트 예산에 반영했습니다.",
  };
  return copy[status];
}

function focusPageTarget(id: string): void {
  if (typeof document === "undefined") return;
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ block: "start" });
  target.focus({ preventScroll: true });
}

export function pricingFocusTargetForStatus(status: PricingAnalysisUiStatus): string | null {
  if (status === "loading") return "pricing-loading-title";
  if (status === "submitting") return "pricing-submitting-title";
  if (status === "ready") return "pricing-report-title";
  if (status === "applying") return "pricing-applying-title";
  if (status === "applied") return "pricing-applied-title";
  if (status === "rejected" || status === "conflict" || status === "error") {
    return "pricing-status-title";
  }
  return null;
}

export function PricingAnalysisPage({
  context,
  initialDraft,
  client,
  previewState,
}: PricingAnalysisPageProps) {
  const [draft, setDraft] = useState<PricingAnalysisDraft>({
    title: initialDraft?.title ?? "",
    description: initialDraft?.description ?? "",
    category: initialDraft?.category ?? "",
  });
  const [errors, setErrors] = useState<PricingAnalysisDraftErrors>({});
  const workflow = usePricingAnalysis(client);
  const status = previewState ?? workflow.status;
  const previewNeedsResult =
    status === "ready" ||
    status === "applying" ||
    status === "applied" ||
    status === "conflict" ||
    status === "error";
  const analysis = workflow.analysis ?? (previewNeedsResult ? {
    ...PREVIEW_ANALYSIS,
    appliedAt: status === "applied" ? "2026-09-04T09:05:00.000Z" : null,
  } : null);

  const liveMessage = useMemo(
    () => workflow.errorMessage ?? statusCopy(status),
    [status, workflow.errorMessage],
  );

  useEffect(() => {
    const target = pricingFocusTargetForStatus(status);
    if (target) focusPageTarget(target);
  }, [status]);

  function updateDraft(next: PricingAnalysisDraft): void {
    setDraft(next);
    setErrors((current) => {
      const nextErrors = { ...current };
      if (next.title !== draft.title) delete nextErrors.title;
      if (next.description !== draft.description) delete nextErrors.description;
      if (next.category !== draft.category) delete nextErrors.category;
      return nextErrors;
    });
  }

  function submit(): void {
    const nextErrors = validatePricingAnalysisDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !draft.category) return;
    void workflow.analyze({
      title: draft.title,
      description: draft.description,
      category: draft.category,
    });
  }

  const isBusy = status === "submitting" || status === "applying" || status === "loading";
  const registration = context.kind === "registration" ? context : null;
  const existingProject = context.kind === "existing-project" ? context : null;
  const failedApply = workflow.failureOperation === "apply" || Boolean(
    previewState &&
    workflow.failureOperation === null &&
    existingProject &&
    analysis?.result &&
    (status === "error" || status === "conflict"),
  );
  const showApplyActions = Boolean(
    existingProject && (status === "ready" || status === "applying"),
  );

  async function applyRecommendation(retryLastAttempt = false): Promise<void> {
    if (!existingProject) return;
    const lastAttempt = workflow.applicationAttempt;
    const expectedBudgetAmount =
      retryLastAttempt && lastAttempt?.projectId === existingProject.projectId
        ? lastAttempt.expectedBudgetAmount
        : existingProject.currentBudgetAmount;
    const expectedProjectVersion =
      retryLastAttempt && lastAttempt?.projectId === existingProject.projectId
        ? lastAttempt.expectedProjectVersion
        : existingProject.projectVersion;
    const result = await workflow.apply(
      existingProject.projectId,
      expectedBudgetAmount,
      expectedProjectVersion,
    );
    if (result) existingProject.onApplied(result.budgetAmount);
  }

  return (
    <div className="pricing-shell">
      <main className="pricing-page">
      <header className="pricing-hero">
        <p className="pricing-eyebrow">AI PRICING · STEP 2</p>
        <h1>AI 단가 분석</h1>
        <p>
          프로젝트 정보를 확인하고 추천 예산을 요청하세요. 결과를 검토한 뒤 직접 적용 여부를 선택합니다.
        </p>
      </header>

      <div className="pricing-live" aria-live="polite" aria-atomic="true">
        {liveMessage}
      </div>

      {status === "loading" ? (
        <section className="pricing-card" aria-busy="true" aria-label="분석 결과 불러오는 중">
          <h2 id="pricing-loading-title" tabIndex={-1}>분석 결과를 불러오는 중입니다</h2>
          <div className="pricing-skeleton" />
          <div className="pricing-skeleton pricing-skeleton--short" />
          <p>저장된 분석의 최신 상태를 확인하고 있습니다.</p>
        </section>
      ) : status === "applied" ? null : (
        <PricingAnalysisForm
          draft={draft}
          errors={errors}
          disabled={isBusy}
          onChange={updateDraft}
          onSubmit={submit}
          onUseDirectInput={registration?.onUseDirectInput}
          onBack={context.onBack}
          backLabel={existingProject ? "프로젝트로 돌아가기" : "프로젝트 등록으로 돌아가기"}
        />
      )}

      {status === "submitting" ? (
        <section className="pricing-notice pricing-notice--info" role="status" aria-busy="true">
          <h2 id="pricing-submitting-title" tabIndex={-1}>분석 요청을 처리하고 있습니다</h2>
          <p>이 페이지가 열려 있는 동안 입력 내용은 그대로 보존됩니다.</p>
        </section>
      ) : null}

      {status === "applying" ? (
        <section className="pricing-notice pricing-notice--info" role="status" aria-busy="true">
          <h2 id="pricing-applying-title" tabIndex={-1}>프로젝트 예산에 반영하고 있습니다</h2>
          <p>완료될 때까지 반영 버튼을 다시 누르지 않아도 됩니다. 현재 프로젝트 정보는 그대로 유지됩니다.</p>
        </section>
      ) : null}

      {status === "rejected" ? (
        <section className="pricing-notice pricing-notice--danger" role="alert">
          <h2 id="pricing-status-title" tabIndex={-1}>분석 결과를 안전하게 제공하지 못했습니다</h2>
          <p>{workflow.errorMessage ?? "입력한 내용은 그대로 보존했습니다. 새 요청으로 다시 시도해 주세요."}</p>
          <div className="pricing-actions">
            <button className="pricing-button pricing-button--primary" type="button" onClick={() => void workflow.retry()}>다시 시도</button>
            <button className="pricing-button pricing-button--secondary" type="button" onClick={() => focusPageTarget("pricing-title")}>입력 다시 확인하기</button>
            {registration ? <button className="pricing-button pricing-button--secondary" type="button" onClick={registration.onUseDirectInput}>직접 예산 입력하기</button> : null}
          </div>
        </section>
      ) : null}

      {status === "conflict" ? (
        <section className="pricing-notice pricing-notice--warning" role="alert">
          <h2 id="pricing-status-title" tabIndex={-1}>
            {failedApply ? "프로젝트의 최신 상태를 확인해야 합니다" : "분석 요청을 다시 확인해야 합니다"}
          </h2>
          <p>{workflow.errorMessage ?? (failedApply
            ? "이 요청으로 프로젝트 예산을 새로 변경하지 않았습니다."
            : "분석 요청이 다른 요청과 충돌했습니다. 입력은 그대로 보존했습니다.")}</p>
          {failedApply && existingProject ? (
            <div className="pricing-actions">
              <button className="pricing-button pricing-button--primary" type="button" onClick={existingProject.onBack}>프로젝트 최신 상태 보기</button>
              {analysis?.result ? <button className="pricing-button pricing-button--secondary" type="button" onClick={() => focusPageTarget("pricing-report-title")}>분석 결과로 돌아가기</button> : null}
            </div>
          ) : (
            <div className="pricing-actions">
              <button className="pricing-button pricing-button--primary" type="button" onClick={() => void workflow.retry()}>새 요청으로 다시 시도</button>
              <button className="pricing-button pricing-button--secondary" type="button" onClick={() => focusPageTarget("pricing-title")}>입력 다시 확인하기</button>
              {registration ? <button className="pricing-button pricing-button--secondary" type="button" onClick={registration.onUseDirectInput}>직접 예산 입력하기</button> : null}
            </div>
          )}
        </section>
      ) : null}

      {status === "error" ? (
        <section className="pricing-notice pricing-notice--danger" role="alert">
          <h2 id="pricing-status-title" tabIndex={-1}>{failedApply ? "프로젝트 예산을 반영하지 못했습니다" : "분석 요청을 완료하지 못했습니다"}</h2>
          <p>{workflow.errorMessage ?? (failedApply
            ? "이 반영 시도의 결과를 확인하지 못했습니다. 최신 상태를 확인하거나 같은 반영 요청으로 다시 시도하세요."
            : "잠시 후 다시 시도하거나 예산을 직접 입력하세요. 이 페이지가 열려 있는 동안 입력 내용은 보존됩니다.")}</p>
          {analysis?.reviewStatus === "PENDING" ? (
            <button className="pricing-button pricing-button--secondary" type="button" onClick={() => void workflow.load(analysis.pricingAnalysisId)}>
              이 분석 상태 다시 확인
            </button>
          ) : failedApply && existingProject && analysis?.result ? (
            <div className="pricing-actions">
              <button className="pricing-button pricing-button--primary" type="button" onClick={existingProject.onBack}>프로젝트 최신 상태 보기</button>
              <button
                className="pricing-button pricing-button--secondary"
                type="button"
                onClick={() => void applyRecommendation(true)}
              >
                반영 다시 시도
              </button>
            </div>
          ) : (
            <div className="pricing-actions">
              <button className="pricing-button pricing-button--primary" type="button" onClick={() => void workflow.retry()}>다시 시도</button>
              <button className="pricing-button pricing-button--secondary" type="button" onClick={() => focusPageTarget("pricing-title")}>입력 다시 확인하기</button>
              {registration ? <button className="pricing-button pricing-button--secondary" type="button" onClick={registration.onUseDirectInput}>직접 예산 입력하기</button> : null}
            </div>
          )}
        </section>
      ) : null}

      {analysis?.result ? (
        <PricingAnalysisReport
          analysis={analysis}
          currentBudgetAmount={status === "applied" ? undefined : existingProject?.currentBudgetAmount}
          applying={status === "applying"}
          applied={status === "applied"}
          onUseRecommendation={registration ? () => {
            registration.onUseRecommendation({
              pricingAnalysisId: analysis.pricingAnalysisId,
              recommendedAmount: analysis.result!.recommendedAmount,
            });
          } : undefined}
          onUseDirectInput={registration?.onUseDirectInput}
          onApply={showApplyActions ? () => void applyRecommendation(false) : undefined}
          onDecline={showApplyActions ? existingProject?.onBack : undefined}
          onAnalyzeAgain={status === "applied" ? undefined : () => {
              setErrors({});
              focusPageTarget("pricing-title");
            }}
        />
      ) : null}

      {analysis?.result && registration && status !== "applied" ? (
        <p className="pricing-unapplied-note">아직 프로젝트 예산에 반영되지 않았습니다.</p>
      ) : null}

      {status === "applied" && existingProject && analysis?.result ? (
        <section className="pricing-notice pricing-notice--success" role="status">
          <h2 id="pricing-applied-title" tabIndex={-1}>프로젝트 예산에 반영했습니다</h2>
          <p>프로젝트의 현재 예산이 권장 금액으로 변경되었습니다.</p>
          <dl className="pricing-applied-summary">
            <div>
              <dt>변경 전</dt>
              <dd>
                {workflow.applicationAttempt?.projectId === existingProject.projectId
                  ? `${new Intl.NumberFormat("ko-KR").format(workflow.applicationAttempt.expectedBudgetAmount)}원`
                  : "이 화면에서 확인할 수 없음"}
              </dd>
            </div>
            <div><dt>변경 후</dt><dd>{new Intl.NumberFormat("ko-KR").format(analysis.result.recommendedAmount)}원</dd></div>
            <div><dt>반영 시각</dt><dd>{analysis.appliedAt ?? "확인할 수 없음"}</dd></div>
          </dl>
          <div className="pricing-actions">
            <button className="pricing-button pricing-button--primary" type="button" onClick={existingProject.onBack}>프로젝트 최신 상태 보기</button>
            <button className="pricing-button pricing-button--secondary" type="button" onClick={() => focusPageTarget("pricing-report-title")}>분석 결과 다시 보기</button>
          </div>
        </section>
      ) : null}
      </main>
    </div>
  );
}
