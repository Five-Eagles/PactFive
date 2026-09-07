import { Badge, Notice, Button } from './ui';
import type { GetCancellationResponse, PostActionResult } from './contract.types';

/**
 * 취소 조회 패널 — CAN-01 v2(spec.md 규칙 15·25). 이 화면도 조회 전용이다 — 취소 자체는
 * project-management의 취소 액션이 트리거하고, 이 기능은 그 결과(후속 조치 처리 현황)만
 * 보여준다. `postActions`가 null이면 아직 취소되지 않은 프로젝트다.
 */
export type CancellationPanelView = 'loading' | 'loadFailed' | 'notCanceled' | 'canceled';

export type CancellationPanelProps = {
  view?: CancellationPanelView;
  data?: GetCancellationResponse | null;
  onRetry?: () => void;
};

const ACTION_LABEL: Record<PostActionResult, { tone: 'success' | 'warning' | 'danger'; label: string }> = {
  DONE: { tone: 'success', label: '완료' },
  NOT_NEEDED: { tone: 'success', label: '해당 없음' },
  FAILED: { tone: 'danger', label: '실패' },
};

export function CancellationPanel({ view = 'loading', data, onRetry }: CancellationPanelProps) {
  if (view === 'loading') {
    return (
      <article className="panel" aria-busy="true">
        <div className="panel-head">
          <h2 className="title">취소</h2>
        </div>
        <p className="helper">취소 정보를 불러오는 중입니다.</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </article>
    );
  }

  if (view === 'loadFailed') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">취소</h2>
        </div>
        <Notice tone="danger">취소 정보를 불러오지 못했습니다</Notice>
        <p className="status-copy">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        <div className="btn-row">
          <Button variant="primary" onClick={onRetry}>
            다시 시도
          </Button>
        </div>
      </article>
    );
  }

  if (!data) return null;

  if (view === 'notCanceled') {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">취소</h2>
          <Badge tone="neutral" label="취소되지 않음" />
        </div>
        <p className="status-copy">
          <strong>{data.projectTitle || '프로젝트'}</strong>는 취소되지 않았습니다.
        </p>
      </article>
    );
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2 className="title">취소</h2>
        <Badge tone="danger" label="취소됨" />
      </div>
      <p className="status-copy">
        <strong>{data.projectTitle || '프로젝트'}</strong>가{' '}
        {data.canceledAt ? new Date(data.canceledAt).toLocaleString('ko-KR') : '알 수 없는 시각'}에
        취소되었습니다.
      </p>
      {data.postActions ? (
        <dl className="facts">
          <dt>다른 지원 반려</dt>
          <dd>
            <Badge {...ACTION_LABEL[data.postActions.applicationRejection]} />
          </dd>
          <dt>계약 무효화</dt>
          <dd>
            <Badge {...ACTION_LABEL[data.postActions.contractInvalidation]} />
          </dd>
          <dt>알림 발송</dt>
          <dd>
            <Badge {...ACTION_LABEL[data.postActions.notification]} />
          </dd>
        </dl>
      ) : (
        <p className="helper">후속 조치 정보가 없습니다.</p>
      )}
      {data.hasSignatureAudit ? (
        <p className="helper">서명 이력이 감사 로그에 보존되어 있습니다.</p>
      ) : null}
    </article>
  );
}
