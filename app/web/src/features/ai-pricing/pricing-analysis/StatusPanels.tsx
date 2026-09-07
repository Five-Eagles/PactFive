import { Button, Notice } from '../../../shared/ui/primitives';

/**
 * `PricingAnalysisPage.tsx`(오민혁)의 제출 중·실패·거절·충돌 상태를 재해석했다 — 문구는
 * design/high-fi.html "필수 요소 목록"의 "상태 및 복구 · 정확한 텍스트" 절을 그대로 쓴다.
 */

export function SubmittingPanel() {
  return (
    <div className="card" role="status" aria-live="polite">
      <h2 tabIndex={-1}>분석 요청을 처리하고 있습니다</h2>
      <p>이 페이지가 열려 있는 동안 입력 내용은 그대로 보존됩니다.</p>
    </div>
  );
}

/** 등록 맥락에서 동기 분석 자체가 실패했을 때(202 폴링 실패·5xx 등). */
export function AnalysisFailurePanel({
  onRetry,
  onUseDirectInput,
}: {
  onRetry: () => void;
  onUseDirectInput?: () => void;
}) {
  return (
    <div className="card" role="alert">
      <h2 tabIndex={-1}>분석 요청을 완료하지 못했습니다</h2>
      <div className="btn-row">
        <Button variant="primary" onClick={onRetry}>
          다시 시도
        </Button>
        {onUseDirectInput ? (
          <Button variant="secondary" onClick={onUseDirectInput}>
            직접 예산 입력하기
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** reviewStatus REJECTED — 제안 불가. 입력 부족으로 단정하지 않는다. */
export function RejectedPanel({ onRetry, onReviewInput }: { onRetry: () => void; onReviewInput: () => void }) {
  return (
    <div className="card" role="alert">
      <h2 tabIndex={-1}>분석 결과를 안전하게 제공하지 못했습니다</h2>
      <div className="btn-row">
        <Button variant="primary" onClick={onRetry}>
          다시 시도
        </Button>
        <Button variant="secondary" onClick={onReviewInput}>
          입력 다시 확인하기
        </Button>
      </div>
    </div>
  );
}

/** 기존 프로젝트 반영이 409로 막혔을 때 — 이 요청으로는 새로 바뀌지 않았다. */
export function ApplyConflictPanel({
  onViewLatestProject,
  onBackToResult,
}: {
  onViewLatestProject: () => void;
  onBackToResult: () => void;
}) {
  return (
    <div className="card" role="alert">
      <h2 tabIndex={-1}>프로젝트의 최신 상태를 확인해야 합니다</h2>
      <Notice tone="warning">이 요청으로 프로젝트 예산을 새로 변경하지 않았습니다.</Notice>
      <div className="btn-row">
        <Button variant="primary" onClick={onViewLatestProject}>
          프로젝트 최신 상태 보기
        </Button>
        <Button variant="secondary" onClick={onBackToResult}>
          분석 결과로 돌아가기
        </Button>
      </div>
    </div>
  );
}

/** 기존 프로젝트 반영이 500/503으로 실패했을 때 — 변경 여부를 단정하지 않는다. */
export function ApplyFailurePanel({
  onViewLatestProject,
  onRetryApply,
}: {
  onViewLatestProject: () => void;
  onRetryApply: () => void;
}) {
  return (
    <div className="card" role="alert">
      <h2 tabIndex={-1}>프로젝트 예산을 반영하지 못했습니다</h2>
      <div className="btn-row">
        <Button variant="secondary" onClick={onViewLatestProject}>
          프로젝트 최신 상태 보기
        </Button>
        <Button variant="primary" onClick={onRetryApply}>
          반영 다시 시도
        </Button>
      </div>
    </div>
  );
}

/** 등록 맥락 — 추천 예산을 반영하지 않고 직접 입력을 선택한 뒤의 안내. */
export function DeclinedNotice() {
  return <Notice tone="info">아직 프로젝트 예산에 반영되지 않았습니다.</Notice>;
}
