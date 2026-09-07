import { Badge, Button, Notice } from './ui';
import type { DeliveryView } from './contract.types';

/**
 * 납품 패널 — DLV-01. `features/contracts-payments/design/delivery.html`에 대응하는 시안이
 * 이번 반영 시점에 새로 추가됐지만(28471d6, #80), design/*.html 자체는 갱신되지 않아
 * `prototype/web/DeliveryPanel.tsx`의 마크업을 보조 근거로 삼아 이 기능의 기존 클래스 표기
 * (panel.css)에 맞춰 새로 짰다(integration-workflow.md "시안이 상호작용 방식까지 정해 주지
 * 않을 수 있다" 절 — feedback_loop에 판단 필요로 남긴다).
 *
 * 순수 표시 컴포넌트다. 파일 선택·업로드·제출은 상위(DeliveryPage)가 처리한다.
 */
export type DeliveryPanelView =
  | 'loading'
  | 'loadFailed'
  | 'canceled'
  | 'freelancerUpload'
  | 'freelancerWaiting'
  | 'clientWaiting'
  | 'clientReview'
  | 'approved';

export type DeliveryPanelProps = {
  view?: DeliveryPanelView;
  projectTitle?: string;
  delivery?: DeliveryView | null;
  downloadUrl?: string | null;
  canReview?: boolean;
  selectedFileName?: string | null;
  message?: string;
  onMessageChange?: (value: string) => void;
  onSelectFile?: (file: File | null) => void;
  onRequestDelivery?: () => void;
  onApprove?: () => void;
  onRetry?: () => void;
  submitting?: boolean;
};

function formatBytes(size: number): string {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

export function DeliveryPanel({
  view = 'loading',
  projectTitle = '프로젝트',
  delivery,
  downloadUrl,
  canReview = false,
  selectedFileName,
  message = '',
  onMessageChange,
  onSelectFile,
  onRequestDelivery,
  onApprove,
  onRetry,
  submitting = false,
}: DeliveryPanelProps) {
  if (view === 'loading') {
    return (
      <article className="panel" aria-busy="true">
        <div className="panel-head">
          <h2 className="title">납품</h2>
        </div>
        <p className="helper">납품 정보를 불러오는 중입니다.</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </article>
    );
  }

  if (view === 'loadFailed') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">납품</h2>
        </div>
        <Notice tone="danger">납품 정보를 불러오지 못했습니다</Notice>
        <p className="status-copy">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        <div className="btn-row">
          <Button variant="primary" onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      </article>
    );
  }

  if (view === 'canceled') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">납품</h2>
          <Badge tone="danger" label="취소됨" />
        </div>
        <Notice tone="danger">프로젝트가 취소되었습니다</Notice>
        <p className="status-copy">이 프로젝트는 더 이상 납품을 진행할 수 없습니다.</p>
      </article>
    );
  }

  if (view === 'approved') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">납품</h2>
          <Badge tone="success" label="승인됨" />
        </div>
        <p className="status-copy">
          납품이 승인되었습니다. <strong>{projectTitle}</strong> 작업 결과물을 내려받을 수
          있습니다.
        </p>
        {delivery?.file ? (
          <dl className="facts">
            <dt>파일명</dt>
            <dd>{delivery.file.fileName}</dd>
            <dt>크기</dt>
            <dd>{formatBytes(delivery.file.sizeBytes)}</dd>
          </dl>
        ) : null}
        <div className="btn-row">
          {downloadUrl ? (
            <Button variant="primary" onClick={() => window.open(downloadUrl, '_blank', 'noopener')}>
              내려받기
            </Button>
          ) : null}
        </div>
        {canReview ? (
          <p className="helper">거래가 완료됐습니다. 프로젝트 상세에서 리뷰를 남길 수 있습니다.</p>
        ) : null}
      </article>
    );
  }

  if (view === 'freelancerWaiting') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">납품</h2>
          <Badge tone="warning" label="승인 대기" />
        </div>
        <p className="status-copy">
          납품 요청을 보냈습니다. <strong>의뢰인의 승인</strong>을 기다리는 중입니다.
        </p>
        {delivery?.file ? (
          <dl className="facts">
            <dt>파일명</dt>
            <dd>{delivery.file.fileName}</dd>
            <dt>전달 메시지</dt>
            <dd>{delivery.message || '—'}</dd>
          </dl>
        ) : null}
      </article>
    );
  }

  if (view === 'clientWaiting') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">납품</h2>
          <Badge tone="neutral" label="작업 중" />
        </div>
        <p className="status-copy">
          프리랜서가 작업 중입니다. <strong>납품 요청</strong>이 오면 승인 여부를 결정할 수
          있습니다.
        </p>
      </article>
    );
  }

  if (view === 'clientReview') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">납품</h2>
          <Badge tone="warning" label="검토 필요" />
        </div>
        <p className="status-copy">
          프리랜서가 납품을 요청했습니다. 파일을 확인한 뒤 <strong>승인</strong>하세요. 승인
          이후 반려·재납품은 지원하지 않습니다.
        </p>
        {delivery?.file ? (
          <dl className="facts">
            <dt>파일명</dt>
            <dd>{delivery.file.fileName}</dd>
            <dt>크기</dt>
            <dd>{formatBytes(delivery.file.sizeBytes)}</dd>
            <dt>전달 메시지</dt>
            <dd>{delivery.message || '—'}</dd>
          </dl>
        ) : null}
        <div className="btn-row">
          <Button variant="primary" disabled={submitting} onClick={onApprove}>
            승인하기
          </Button>
        </div>
      </article>
    );
  }

  // freelancerUpload — 프리랜서가 파일·메시지를 채워 요청을 보낸다.
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        onRequestDelivery?.();
      }}
    >
      <div className="panel-head">
        <h2 className="title">납품</h2>
        <Badge tone="neutral" label="작업 중" />
      </div>
      <p className="status-copy">
        완료된 작업 파일을 올리고 <strong>납품 요청</strong>을 보내세요. 의뢰인이 승인하면
        정산이 진행됩니다.
      </p>
      <div className="field-row">
        <label className="label" htmlFor="delivery-file">
          납품 파일
        </label>
        <input
          className="field"
          id="delivery-file"
          type="file"
          onChange={(event) => onSelectFile?.(event.target.files?.[0] ?? null)}
        />
        <p className="helper">{selectedFileName ? `선택됨: ${selectedFileName}` : '파일을 선택하세요.'}</p>
      </div>
      <div className="field-row">
        <label className="label" htmlFor="delivery-message">
          전달 메시지
        </label>
        <input
          className="field"
          id="delivery-message"
          placeholder="의뢰인에게 전달할 메모"
          value={message}
          onChange={(event) => onMessageChange?.(event.target.value)}
        />
      </div>
      <div className="btn-row">
        <Button variant="primary" type="submit" disabled={submitting || !selectedFileName}>
          납품 요청 보내기
        </Button>
      </div>
    </form>
  );
}
