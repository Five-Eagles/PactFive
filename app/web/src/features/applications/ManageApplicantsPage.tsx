import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, EmptyState, Notice } from '../../shared/ui/primitives';
import { useApplicationDecision, useProjectApplications } from './useApplications';
import type { ApplicationItem } from './application.types';

/**
 * 지원자 관리(규칙 10, 의뢰인) — `features/applications/prototype/web/ApplicationPanel.tsx`의
 * "manage"/"manageEmpty"/"conflict" 뷰를 실제 목록·수락·거절로 재해석했다.
 *
 * 수락 확인 다이얼로그는 `ReopenRecruitmentDialog.tsx`(project-management)와 같은
 * `.overlay-backdrop`/`.dialog` + 마운트 다음 프레임 진입 애니메이션 패턴을 그대로 쓴다
 * (design-tokens.md §13). 거절은 시안대로 확인 없이 바로 진행한다.
 */

const STATUS_LABEL: Record<ApplicationItem['status'], string> = {
  PENDING: '대기',
  ACCEPTED: '수락됨',
  REJECTED: '거절됨',
};

export function ManageApplicantsPage() {
  const { projectId = '' } = useParams();
  const { data, loading, error, reload } = useProjectApplications(projectId);
  const { pendingId, errorMessage, accept, reject } = useApplicationDecision();
  const [confirmTarget, setConfirmTarget] = useState<ApplicationItem | null>(null);
  const [conflict, setConflict] = useState(false);

  async function handleAcceptConfirmed() {
    if (!confirmTarget) return;
    const result = await accept(confirmTarget.applicationId);
    setConfirmTarget(null);
    if (result) {
      reload();
    } else {
      setConflict(true);
    }
  }

  async function handleReject(applicationId: string) {
    const result = await reject(applicationId);
    if (result) reload();
  }

  if (loading) {
    return (
      <PageBody>
        <article className="panel" aria-busy="true">
          <div className="panel-head">
            <h2 className="title">지원자 관리</h2>
          </div>
          <p className="helper">지원자 목록을 불러오는 중입니다.</p>
          <div className="skeleton" />
          <div className="skeleton" />
        </article>
      </PageBody>
    );
  }

  if (error || !data) {
    return (
      <PageBody>
        <article className="panel">
          <div className="panel-head">
            <h2 className="title">지원자 관리</h2>
          </div>
          <Notice tone="danger">{error ?? '지원자 목록을 불러오지 못했습니다.'}</Notice>
          <div className="btn-row">
            <Button variant="primary" onClick={reload}>
              다시 시도
            </Button>
          </div>
        </article>
      </PageBody>
    );
  }

  const pending = data.filter((item) => item.status === 'PENDING');
  const decided = data.filter((item) => item.status !== 'PENDING');

  return (
    <PageBody>
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">지원자 관리</h2>
          <span className="badge info">대기 {pending.length}</span>
        </div>

        {conflict && (
          <Notice tone="warning">다른 지원자가 먼저 수락되었습니다. 목록을 새로 고친 뒤 남은 지원만 확인하세요.</Notice>
        )}
        {errorMessage && <Notice tone="danger">{errorMessage}</Notice>}

        {data.length === 0 ? (
          <EmptyState
            title="아직 지원자가 없습니다"
            body="모집이 열려 있으면 프리랜서가 지원할 수 있습니다."
          />
        ) : (
          <>
            <p className="status-copy">
              <strong>지원자 목록</strong>에서 한 명을 고르면 나머지는 자동으로 거절됩니다. 수락은 되돌릴 수
              없습니다.
            </p>
            {pending.map((item) => (
              <dl className="facts" key={item.applicationId}>
                <dt>지원자</dt>
                <dd>
                  {item.freelancerId ?? '알 수 없음'} · {item.expectedAmount?.toLocaleString('ko-KR')}원 ·{' '}
                  {item.expectedDurationDays}일
                </dd>
                <dt>자기소개</dt>
                <dd>{item.coverLetter}</dd>
                <div className="btn-row">
                  <Button
                    variant="primary"
                    loading={pendingId === item.applicationId}
                    onClick={() => setConfirmTarget(item)}
                  >
                    수락
                  </Button>
                  <Button
                    variant="secondary"
                    loading={pendingId === item.applicationId}
                    onClick={() => void handleReject(item.applicationId)}
                  >
                    거절
                  </Button>
                </div>
              </dl>
            ))}
            {decided.length > 0 && (
              <>
                <h3 className="title" style={{ marginTop: 16 }}>
                  처리된 지원
                </h3>
                {decided.map((item) => (
                  <dl className="facts" key={item.applicationId}>
                    <dt>지원자</dt>
                    <dd>
                      {item.freelancerId ?? '알 수 없음'} · {STATUS_LABEL[item.status]}
                    </dd>
                  </dl>
                ))}
              </>
            )}
          </>
        )}
      </article>

      {confirmTarget && (
        <AcceptConfirmDialog
          target={confirmTarget}
          submitting={pendingId === confirmTarget.applicationId}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => void handleAcceptConfirmed()}
        />
      )}
    </PageBody>
  );
}

function AcceptConfirmDialog({
  target,
  submitting,
  onCancel,
  onConfirm,
}: {
  target: ApplicationItem;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className={`overlay-backdrop${visible ? ' open' : ''}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="accept-title">
        <h2 className="title" id="accept-title">
          이 지원자를 수락할까요?
        </h2>
        <p className="status-copy">
          {target.freelancerId ?? '이 지원자'}를 수락하면 나머지 지원은 거절되고{' '}
          <strong>되돌릴 수 없습니다</strong>.
        </p>
        <div className="btn-row">
          <Button variant="quiet" onClick={onCancel} disabled={submitting}>
            취소
          </Button>
          <Button variant="primary" onClick={onConfirm} loading={submitting}>
            수락 확인
          </Button>
        </div>
      </div>
    </div>
  );
}
