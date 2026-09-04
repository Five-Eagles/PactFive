import type { PricingAnalysisResponse } from "../server/pricing-analysis.types";

function won(amount: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

type PricingAnalysisReportProps = {
  analysis: PricingAnalysisResponse;
  currentBudgetAmount?: number;
  applying?: boolean;
  applied?: boolean;
  onUseRecommendation?: () => void;
  onUseDirectInput?: () => void;
  onApply?: () => void;
  onDecline?: () => void;
  onAnalyzeAgain?: () => void;
};

export function PricingAnalysisReport({
  analysis,
  currentBudgetAmount,
  applying = false,
  applied = false,
  onUseRecommendation,
  onUseDirectInput,
  onApply,
  onDecline,
  onAnalyzeAgain,
}: PricingAnalysisReportProps) {
  const recommendation = analysis.result;
  if (!recommendation) return null;
  const budgetDelta =
    typeof currentBudgetAmount === "number"
      ? recommendation.recommendedAmount - currentBudgetAmount
      : null;

  return (
    <article className="pricing-report" aria-labelledby="pricing-report-title">
      <header className="pricing-report__head">
        <div>
          <p className="pricing-eyebrow">분석 완료</p>
          <h2 id="pricing-report-title" tabIndex={-1}>추천 예산</h2>
          <p className="pricing-report__amount">{won(recommendation.recommendedAmount)}</p>
        </div>
        <span className={`pricing-badge ${applied ? "pricing-badge--success" : "pricing-badge--info"}`}>
          {applied ? "예산 반영 완료" : "검증된 결과"}
        </span>
      </header>

      {typeof currentBudgetAmount === "number" ? (
        <>
          <dl className="pricing-comparison" aria-label="예산 변경 전후">
            <div><dt>현재 예산</dt><dd>{won(currentBudgetAmount)}</dd></div>
            <div><dt>권장 예산</dt><dd>{won(recommendation.recommendedAmount)}</dd></div>
            <div>
              <dt>변경 금액</dt>
              <dd>
                {budgetDelta === null || budgetDelta === 0
                  ? won(0)
                  : `${budgetDelta > 0 ? "+" : "−"}${won(Math.abs(budgetDelta))}`}
              </dd>
            </div>
          </dl>
          <p className="pricing-comparison__note">
            {applied
              ? "현재 프로젝트 예산에 이 권장 금액이 반영되었습니다."
              : "반영을 선택하기 전까지 현재 예산은 유지됩니다."}
          </p>
        </>
      ) : null}

      <p className="pricing-report__summary">
        {applied
          ? "이 금액은 프로젝트 예산에 반영된 추천안입니다. 산정 내역을 다시 확인할 수 있습니다."
          : "이 금액은 추천안입니다. 산정 내역을 확인한 뒤 적용 여부를 선택하세요."}
      </p>
      <dl className="pricing-input-snapshot" aria-label="분석 결과 메타데이터">
        <div><dt>입력 출처</dt><dd>프로젝트 정보 직접 입력</dd></div>
        <div><dt>분석 완료 시각</dt><dd>{analysis.reviewedAt ?? "검증 중"}</dd></div>
        <div><dt>통화</dt><dd>{recommendation.currency}</dd></div>
      </dl>
      <section aria-labelledby="pricing-breakdown-title">
        <div className="pricing-section-title">
          <h3 id="pricing-breakdown-title">산정 내역</h3>
          <span>항목 합계 {won(recommendation.recommendedAmount)}</span>
        </div>
        <ul className="pricing-breakdown">
          {recommendation.breakdown.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <div>
                <span className="pricing-sr-only">항목명</span><strong>{item.name}</strong>
                <p><span className="pricing-sr-only">설명</span>{item.description}</p>
              </div>
              <b><span className="pricing-sr-only">추천 금액</span>{won(item.amount)}</b>
              <p className="pricing-breakdown__rationale"><span className="pricing-sr-only">산정 이유</span>{item.rationale}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="pricing-evidence" aria-labelledby="pricing-input-title">
        <h3 id="pricing-input-title">분석에 사용한 입력</h3>
        <dl className="pricing-input-detail">
          <div><dt>프로젝트 제목</dt><dd>{analysis.inputSnapshot.title}</dd></div>
          <div><dt>프로젝트 설명</dt><dd>{analysis.inputSnapshot.description}</dd></div>
          <div><dt>카테고리</dt><dd>{analysis.inputSnapshot.category}</dd></div>
        </dl>
      </section>

      <section className="pricing-evidence" aria-labelledby="pricing-assumptions-title">
        <h3 id="pricing-assumptions-title">분석 기준과 한계</h3>
        <ul>
          <li>입력한 제목, 설명, 카테고리를 생성 시점의 불변 사본으로 분석했습니다.</li>
          <li>외부 유료 서비스, 상세 일정과 협의 후 변경되는 범위는 별도일 수 있습니다.</li>
        </ul>
        <p>
          이 금액은 입력한 정보에 따른 참고용 추천입니다. 실제 계약 금액은 범위와 일정 협의에 따라 달라질 수 있습니다.
        </p>
      </section>

      <div className="pricing-actions">
        {onUseRecommendation ? (
          <button className="pricing-button pricing-button--primary" type="button" onClick={onUseRecommendation}>
            이 추천 예산 사용하기
          </button>
        ) : null}
        {onUseRecommendation && onUseDirectInput ? (
          <button className="pricing-button pricing-button--secondary" type="button" onClick={onUseDirectInput}>
            직접 예산 입력하기
          </button>
        ) : null}
        {onApply ? (
          <button className="pricing-button pricing-button--primary" type="button" onClick={onApply} disabled={applying || applied}>
            {applied ? "프로젝트 예산에 반영됨" : applying ? "안전하게 반영 중…" : "프로젝트 예산에 반영"}
          </button>
        ) : null}
        {onApply && onDecline ? (
          <button className="pricing-button pricing-button--quiet" type="button" onClick={onDecline} disabled={applying}>
            반영하지 않기
          </button>
        ) : null}
        {onAnalyzeAgain ? (
          <button className="pricing-button pricing-button--secondary" type="button" onClick={onAnalyzeAgain} disabled={applying}>
            조건 바꿔 다시 분석
          </button>
        ) : null}
      </div>
    </article>
  );
}
