import { Badge, Money, Notice, Button } from './ui';
import type { GetSettlementResponse } from './contract.types';

/**
 * 정산 조회 패널 — SET-01 v2(spec.md 규칙 24). 사용자 API는 GET only라 이 패널도 조회
 * 전용이다 — 지급 버튼이 없다("Sandbox 결과는 Mock `simulateSettlementResult`"). 시안
 * 갱신 없이 prototype/web/SettlementPanel.tsx를 보조 근거로 이 기능 기존 클래스 표기를
 * 그대로 확장했다(DeliveryPanel과 같은 판단, feedback_loop 기록).
 */
export type SettlementPanelView = 'loading' | 'loadFailed' | 'canceled' | 'ready';

export type SettlementPanelProps = {
  view?: SettlementPanelView;
  data?: GetSettlementResponse | null;
  onRetry?: () => void;
};

const STATUS_LABEL: Record<GetSettlementResponse['paymentStatus'], string> = {
  READY: '결제 대기',
  PENDING: '결제 확인 중',
  PAID: '결제 완료 · 정산 대기',
  FAILED: '결제 실패',
  RELEASED: '정산 완료',
};

export function SettlementPanel({ view = 'loading', data, onRetry }: SettlementPanelProps) {
  if (view === 'loading') {
    return (
      <article className="panel" aria-busy="true">
        <div className="panel-head">
          <h2 className="title">정산</h2>
        </div>
        <p className="helper">정산 정보를 불러오는 중입니다.</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </article>
    );
  }

  if (view === 'loadFailed') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">정산</h2>
        </div>
        <Notice tone="danger">정산 정보를 불러오지 못했습니다</Notice>
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
          <h2 className="title">정산</h2>
          <Badge tone="danger" label="취소됨" />
        </div>
        <Notice tone="danger">프로젝트가 취소되었습니다</Notice>
        <p className="status-copy">이 결제 건은 더 이상 정산되지 않습니다.</p>
      </article>
    );
  }

  if (!data) return null;

  const released = data.paymentStatus === 'RELEASED';

  return (
    <article className="panel">
      <div className="panel-head">
        <h2 className="title">정산</h2>
        <Badge tone={released ? 'success' : 'warning'} label={STATUS_LABEL[data.paymentStatus]} />
      </div>
      <p className="status-copy">
        <strong>{data.projectTitle || '프로젝트'}</strong>의 결제·정산 내역입니다. 정산은
        샌드박스 시뮬레이션이며 실제 지급을 실행하지 않습니다.
      </p>
      <div className="settlement-breakdown">
        <dl className="facts">
          <dt>결제 금액</dt>
          <dd>
            <Money amount={data.paymentAmount} />
          </dd>
          <dt>플랫폼 수수료 ({(data.platformFeeRateBps / 100).toFixed(1)}%)</dt>
          <dd>
            <Money amount={data.platformFeeAmount} />
          </dd>
          <dt>정산 예정 금액</dt>
          <dd>
            <Money amount={data.settlementAmount} />
          </dd>
        </dl>
      </div>
      {released ? (
        <p className="helper success">
          {data.releasedAt ? `${new Date(data.releasedAt).toLocaleString('ko-KR')}에 정산이 완료됐습니다.` : '정산이 완료됐습니다.'}
        </p>
      ) : (
        <p className="helper">
          납품이 승인되면 정산 시뮬레이션 이후 이 화면에 정산 완료로 표시됩니다.
        </p>
      )}
    </article>
  );
}
