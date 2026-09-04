import { Button, Money, Notice } from '../../../shared/ui/primitives';
import type { PricingAnalysisResponse } from '../pricing-analysis.types';

/**
 * `features/ai-pricing/prototype/web/PricingAnalysisReport.tsx`(오민혁)를 재해석했다 — 텍스트는
 * design/high-fi.html "필수 요소 목록"의 "결과 상태"·"등록 결과"·"기존 프로젝트 결과" 절을
 * 그대로 옮기고, 마크업은 shared/ui 공용 컴포넌트로 다시 짰다.
 */

type Props = {
  analysis: PricingAnalysisResponse;
  /** 있으면 "기존 프로젝트 결과" 비교 UI(현재/추천/변경 금액)를 보여준다. */
  currentBudgetAmount?: number;
  applying?: boolean;
  applied?: boolean;
  onUseRecommendation?: () => void;
  onUseDirectInput?: () => void;
  onApply?: () => void;
  onDecline?: () => void;
};

export function ResultReport({
  analysis,
  currentBudgetAmount,
  applying = false,
  applied = false,
  onUseRecommendation,
  onUseDirectInput,
  onApply,
  onDecline,
}: Props) {
  const recommendation = analysis.result;
  if (!recommendation) return null;
  const hasComparison = typeof currentBudgetAmount === 'number';
  const budgetDelta = hasComparison ? recommendation.recommendedAmount - currentBudgetAmount : 0;

  return (
    <article className="card" aria-labelledby="result-title">
      <h2 id="result-title" tabIndex={-1}>
        추천 예산
      </h2>
      <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
        <Money amount={recommendation.recommendedAmount} />
      </p>

      {hasComparison ? (
        <>
          <div className="kv">
            <span className="kv__k">현재 예산</span>
            <span>
              <Money amount={currentBudgetAmount} />
            </span>
          </div>
          <div className="kv">
            <span className="kv__k">추천 예산</span>
            <span>
              <Money amount={recommendation.recommendedAmount} />
            </span>
          </div>
          <div className="kv">
            <span className="kv__k">변경 금액</span>
            <span>
              {budgetDelta === 0 ? (
                <Money amount={0} />
              ) : (
                <>
                  {budgetDelta > 0 ? '+' : '−'}
                  <Money amount={Math.abs(budgetDelta)} />
                </>
              )}
            </span>
          </div>
          <p>
            {applied
              ? '현재 프로젝트 예산에 이 권장 금액이 반영되었습니다.'
              : '반영을 선택하기 전까지 현재 예산은 유지됩니다.'}
          </p>
        </>
      ) : null}

      <p>
        {applied
          ? '이 금액은 프로젝트 예산에 반영된 추천안입니다. 산정 내역을 다시 확인할 수 있습니다.'
          : '이 금액은 추천안입니다. 산정 내역을 확인한 뒤 적용 여부를 선택하세요.'}
      </p>

      <div className="kv">
        <span className="kv__k">입력 출처</span>
        <span>프로젝트 정보 직접 입력</span>
      </div>
      <div className="kv">
        <span className="kv__k">분석 완료 시각</span>
        <span>{analysis.reviewedAt ?? '검증 중'}</span>
      </div>
      <div className="kv">
        <span className="kv__k">통화</span>
        <span>{recommendation.currency}</span>
      </div>

      <section aria-labelledby="breakdown-title">
        <h3 id="breakdown-title">
          산정 내역 — 항목 합계 <Money amount={recommendation.recommendedAmount} />
        </h3>
        <ul>
          {recommendation.breakdown.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <strong>{item.name}</strong> — <Money amount={item.amount} />
              <p>{item.description}</p>
              <p>{item.rationale}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="input-title">
        <h3 id="input-title">분석에 사용한 입력</h3>
        <div className="kv">
          <span className="kv__k">프로젝트 제목</span>
          <span>{analysis.inputSnapshot.title}</span>
        </div>
        <div className="kv">
          <span className="kv__k">프로젝트 설명</span>
          <span>{analysis.inputSnapshot.description}</span>
        </div>
        <div className="kv">
          <span className="kv__k">카테고리</span>
          <span>{analysis.inputSnapshot.category}</span>
        </div>
      </section>

      <Notice tone="info">
        이 금액은 입력한 정보에 따른 참고용 추천입니다. 실제 계약 금액은 범위와 일정 협의에 따라 달라질 수 있습니다.
      </Notice>

      <div className="btn-row">
        {onUseRecommendation ? (
          <Button variant="primary" onClick={onUseRecommendation}>
            이 추천 예산 사용하기
          </Button>
        ) : null}
        {onUseRecommendation && onUseDirectInput ? (
          <Button variant="secondary" onClick={onUseDirectInput}>
            직접 예산 입력하기
          </Button>
        ) : null}
        {onApply ? (
          <Button variant="primary" onClick={onApply} disabled={applying || applied} loading={applying}>
            {applied ? '프로젝트 예산에 반영됨' : '프로젝트 예산에 반영'}
          </Button>
        ) : null}
        {onApply && onDecline ? (
          <Button variant="quiet" onClick={onDecline} disabled={applying}>
            반영하지 않기
          </Button>
        ) : null}
      </div>
    </article>
  );
}
