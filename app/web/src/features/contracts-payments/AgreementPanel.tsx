import { useState } from 'react';
import { Badge, Button, Money, Notice } from './ui';
import type { NegotiationOfferView } from './contract.types';

/**
 * 금액 합의 패널. 앱 셸 없이 상태 분기만 둔다. 문구는 design/agreement.html과 같다.
 *
 * 원본: features/contracts-payments/prototype/web/AgreementPanel.tsx (28471d6, #80)의
 * 재제안(AGR-02)·이력(AGR-03) 부분을 이 기능의 기존 클래스 표기(panel.css)에 맞춰 다시
 * 구현했다 — 프로토타입 컴포넌트를 그대로 옮기지 않고, 이 파일이 이미 쓰던 패턴(Badge·Button·
 * Money·Notice, `.panel`/`.facts`/`.btn-row`/`.dialog` 클래스)을 그대로 확장했다.
 * 순수 표시 컴포넌트다 — 데이터 패칭·제출 핸들러는 상위(AgreementPage)가 props로 준다.
 */
export type AgreementView =
  | 'create'
  | 'loading'
  | 'loadFailed'
  | 'stale'
  | 'canceled'
  | 'proposed'
  | 'respond'
  | 'rejected';

export type AgreementPanelProps = {
  view?: AgreementView;
  amount?: number;
  projectTitle?: string;
  /** AGR-03. round 오름차순, 최신보다 작은 round는 「대체됨」으로 표시한다. */
  history?: NegotiationOfferView[];
  reopened?: boolean | null;
  amountInput?: string;
  amountError?: string | null;
  onAmountChange?: (value: string) => void;
  onPropose?: () => void;
  onAccept?: () => void;
  onReject?: (reasonCode: string) => void;
  /** AGR-02 재제안. */
  onCounter?: (amount: number) => void;
  onRetry?: () => void;
  submitting?: boolean;
};

const DEFAULT_TITLE = '쇼핑몰 웹사이트 구축';
const DEFAULT_AMOUNT = 1_000_000;

/** round 1만 「최초 제안」. 그 외는 「N회 수정」이다(AGR-03). */
function historyLabelForRound(round: number): string {
  return round === 1 ? '최초 제안' : `${round - 1}회 수정`;
}

function OfferHistory({ history, latestRound }: { history: NegotiationOfferView[]; latestRound: number }) {
  if (history.length < 2) return null;
  return (
    <div className="offer-history">
      <p className="helper">이전 제안 이력</p>
      <ul className="history-list">
        {history
          .slice()
          .sort((a, b) => a.round - b.round)
          .map((row) => (
            <li key={row.offerId} className={row.round < latestRound ? 'history-row superseded' : 'history-row'}>
              <span className="history-label">{historyLabelForRound(row.round)}</span>
              <Money amount={row.amount} />
              {row.round < latestRound ? <Badge tone="neutral" label="이후 제안으로 대체됨" /> : null}
            </li>
          ))}
      </ul>
    </div>
  );
}

export function AgreementPanel({
  view = 'create',
  amount = DEFAULT_AMOUNT,
  projectTitle = DEFAULT_TITLE,
  history = [],
  reopened,
  amountInput,
  amountError,
  onAmountChange,
  onPropose,
  onAccept,
  onReject,
  onCounter,
  onRetry,
  submitting = false,
}: AgreementPanelProps) {
  if (view === 'loading') {
    return (
      <article className="panel" aria-busy="true">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
        </div>
        <p className="helper">합의 내용을 불러오는 중입니다.</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </article>
    );
  }

  if (view === 'loadFailed') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
        </div>
        <Notice tone="danger">합의 내용을 불러오지 못했습니다</Notice>
        <p className="status-copy">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        <div className="btn-row">
          <Button variant="primary" onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      </article>
    );
  }

  if (view === 'stale') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
        </div>
        <Notice tone="warning">내용이 바뀌었습니다</Notice>
        <p className="status-copy">
          다른 당사자가 먼저 응답했거나 프로젝트가 바뀌었습니다. 최신 내용을 확인한 뒤 이어서
          진행하세요.
        </p>
        <div className="btn-row">
          <Button variant="primary" onClick={onRetry}>
            다시 불러오기
          </Button>
        </div>
      </article>
    );
  }

  if (view === 'canceled') {
    // 취소 뒤에는 제안·수락·거절을 숨긴다 (규칙 17).
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
          <Badge tone="danger" label="취소됨" />
        </div>
        <Notice tone="danger">프로젝트가 취소되었습니다</Notice>
        <p className="status-copy">
          이 프로젝트는 더 이상 조건을 바꿀 수 없습니다. 새로운 거래가 필요하면 의뢰인이 다시
          모집해야 합니다.
        </p>
      </article>
    );
  }

  if (view === 'rejected') {
    // AGR-02/03 최종 거절 이후 — 재개 여부는 서버가 restore에서 이미 판정해 둔 값이다.
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
          <Badge tone="danger" label="거절됨" />
        </div>
        <Notice tone={reopened ? 'warning' : 'danger'}>
          {reopened ? '거절되어 모집이 다시 열렸습니다' : '거절되어 거래가 끝났습니다'}
        </Notice>
        <p className="status-copy">
          {reopened
            ? '이 지원자와의 합의는 끝났습니다. 프로젝트는 다시 지원을 받을 수 있는 상태입니다.'
            : '마감이 지났거나 다른 지원이 대기 중이라 모집이 자동으로 다시 열리지 않았습니다.'}
        </p>
        <OfferHistory history={history} latestRound={history[history.length - 1]?.round ?? 0} />
      </article>
    );
  }

  if (view === 'proposed') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
          <Badge tone="warning" label="응답 대기" />
        </div>
        <p className="status-copy">
          의뢰인이 금액을 제안했습니다. <strong>프리랜서의 수락 또는 거절</strong>을 기다리는
          중입니다.
        </p>
        <dl className="facts">
          <dt>프로젝트 제목</dt>
          <dd>{projectTitle}</dd>
          <dt>합의 금액</dt>
          <dd>
            <Money amount={amount} />
          </dd>
        </dl>
        <p className="helper">지금은 바꿀 수 없습니다. 프리랜서가 응답하면 다음 단계로 갑니다.</p>
        <OfferHistory history={history} latestRound={history[history.length - 1]?.round ?? 0} />
      </article>
    );
  }

  if (view === 'respond') {
    return (
      <AgreementRespondPanel
        projectTitle={projectTitle}
        amount={amount}
        history={history}
        onAccept={onAccept}
        onReject={onReject}
        onCounter={onCounter}
        submitting={submitting}
      />
    );
  }

  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        onPropose?.();
      }}
    >
      <div className="panel-head">
        <h2 className="title">금액 합의</h2>
        <Badge tone="neutral" label="제안 전" />
      </div>
      <p className="status-copy">
        아직 제안이 없습니다. <strong>의뢰인이 금액을 제안</strong>하면 프리랜서가 수락하거나
        거절합니다.
      </p>
      <dl className="facts">
        <dt>프로젝트 제목</dt>
        <dd>{projectTitle}</dd>
      </dl>
      <div className="field-row">
        <label className="label" htmlFor="agreement-amount">
          합의 금액
        </label>
        <input
          className={amountError ? 'field error' : 'field'}
          id="agreement-amount"
          name="amount"
          inputMode="numeric"
          placeholder="금액"
          value={amountInput ?? ''}
          aria-invalid={amountError ? 'true' : undefined}
          onChange={(event) => onAmountChange?.(event.target.value)}
        />
        <p className={amountError ? 'helper error' : 'helper'}>
          {amountError ?? '단위는 원입니다. 제안한 금액이 계약과 결제의 근거가 됩니다.'}
        </p>
      </div>
      <div className="btn-row">
        <Button variant="primary" type="submit" disabled={submitting}>
          제안하기
        </Button>
      </div>
    </form>
  );
}

/** 거절은 확인 다이얼로그 뒤에만 진행한다 (design-tokens.md §8 DestructiveActionSummary와 같은 원칙). */
function AgreementRespondPanel({
  projectTitle,
  amount,
  history,
  onAccept,
  onReject,
  onCounter,
  submitting,
}: {
  projectTitle: string;
  amount: number;
  history: NegotiationOfferView[];
  onAccept?: () => void;
  onReject?: (reasonCode: string) => void;
  onCounter?: (amount: number) => void;
  submitting: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterInput, setCounterInput] = useState('');
  const [counterError, setCounterError] = useState<string | null>(null);

  function submitCounter() {
    const counterAmount = Number(counterInput.replace(/[^0-9]/g, ''));
    if (!counterAmount || counterAmount <= 0) {
      setCounterError('금액을 입력해 주세요.');
      return;
    }
    setCounterError(null);
    setCounterOpen(false);
    onCounter?.(counterAmount);
  }

  return (
    <>
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
          <Badge tone="warning" label="응답 대기" />
        </div>
        <p className="status-copy">
          의뢰인이 아래 금액을 제안했습니다. <strong>수락·재제안·거절</strong> 중 하나를 고를 수
          있습니다. 거절하면 이 거래는 끝납니다.
        </p>
        <dl className="facts">
          <dt>프로젝트 제목</dt>
          <dd>{projectTitle}</dd>
          <dt>합의 금액</dt>
          <dd>
            <Money amount={amount} />
          </dd>
        </dl>
        <OfferHistory history={history} latestRound={history[history.length - 1]?.round ?? 0} />
        {counterOpen ? (
          <div className="field-row">
            <label className="label" htmlFor="agreement-counter-amount">
              재제안 금액
            </label>
            <input
              className={counterError ? 'field error' : 'field'}
              id="agreement-counter-amount"
              inputMode="numeric"
              placeholder="금액"
              value={counterInput}
              aria-invalid={counterError ? 'true' : undefined}
              onChange={(event) => {
                setCounterInput(event.target.value);
                setCounterError(null);
              }}
            />
            <p className={counterError ? 'helper error' : 'helper'}>
              {counterError ?? '새 금액을 보내면 상대방이 다시 수락·재제안·거절할 수 있습니다.'}
            </p>
            <div className="btn-row">
              <Button variant="quiet" onClick={() => setCounterOpen(false)}>
                취소
              </Button>
              <Button variant="primary" disabled={submitting} onClick={submitCounter}>
                재제안 보내기
              </Button>
            </div>
          </div>
        ) : (
          <div className="btn-row">
            <Button variant="primary" disabled={submitting} onClick={onAccept}>
              수락하기
            </Button>
            <Button variant="secondary" disabled={submitting} onClick={() => setCounterOpen(true)}>
              재제안하기
            </Button>
            <Button variant="danger" disabled={submitting} onClick={() => setConfirmOpen(true)}>
              거절하기
            </Button>
          </div>
        )}
      </article>
      <div
        className={confirmOpen ? 'overlay-backdrop open' : 'overlay-backdrop'}
        aria-hidden={confirmOpen ? 'false' : 'true'}
        onClick={(event) => {
          if (event.target === event.currentTarget) setConfirmOpen(false);
        }}
      >
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title">
          <h2 className="title" id="reject-title">
            합의를 거절할까요?
          </h2>
          <p className="status-copy">
            거절하면 <strong>이 거래는 끝납니다</strong>. 프로젝트는 합의 전 상태로 돌아가고, 이
            제안은 되돌릴 수 없습니다.
          </p>
          <div className="btn-row">
            <Button variant="quiet" onClick={() => setConfirmOpen(false)}>
              닫기
            </Button>
            <Button
              variant="danger"
              disabled={submitting}
              onClick={() => {
                setConfirmOpen(false);
                onReject?.('CLIENT_OFFER_REJECTED');
              }}
            >
              거절 확인
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
