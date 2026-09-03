import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import {
  Button,
  EmptyState,
  Notice,
  PermissionAwareActions,
  RecruitmentBadge,
  ReopenBadge,
  TransactionBadge,
  type ActionSpec,
} from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { cancelProject, closeRecruitment, deleteProject } from './api/project';
import { useMyProjects } from './useProject';
import { PROJECT_ROUTES } from './project.routes';
import { ReopenRecruitmentDialog } from './ReopenRecruitmentDialog';
import { DestructiveActionSummary, type DestructiveActionId } from './DestructiveActionSummary';
import type { ClientProjectDetail } from './project.types';

/**
 * SCR-B07 — 내 프로젝트 (관리)
 *
 * 구조 정본: `features/project-management/design/high-fi-manage.html` SCR-B07
 *
 * 시안 구조: 제목 줄(`.h3` + 등록 버튼) → `.card` 하나 안에 `.row` 목록.
 * 각 행은 `.row__main`(제목 + 한 줄 요약) · `.row__badges` · `.row__acts` 3분할이다.
 * 1차 반영은 프로젝트마다 카드를 하나씩 쌓았는데, 시안은 한 카드 안의 행 목록이다 —
 * 관리 화면은 여러 건을 위아래로 훑는 곳이라 카드 경계가 매 건 끼면 시선이 끊긴다.
 *
 * **잠금을 여기서 계산하지 않는다.** 서버가 준 `availableActions` 를 그대로 따른다 (규칙 13).
 *
 * `수정`(SCR-B06)은 `ProjectEditPage`로 이동, `다시 모집하기`(SCR-B10)는
 * `ReopenRecruitmentDialog` 오버레이로 연결한다(2026-08-29 반영 — sync-log.md 비고에
 * "다음 통합 대상"으로 남아 있던 것).
 *
 * `모집 마감`·`프로젝트 취소`·`삭제` 는 누르는 즉시 실행하지 않는다. 셋 다
 * `DestructiveActionSummary` 확인 다이얼로그를 거친다(CR-0006 결함 1, 2026-09-02 반영 —
 * `design/high-fi-manage.html`의 "확인 다이얼로그 3종"이 셋 다 요구한다). 확인까지는
 * 서버를 부르지 않고, 그만두면 아무 일도 일어나지 않는다.
 */

/** 서버 행동 코드 → 화면 문구. 코드가 그대로 노출되면 안 된다 */
const ACTION_LABELS: Record<string, string> = {
  EDIT: '수정',
  CLOSE_RECRUITMENT: '모집 마감',
  CANCEL: '프로젝트 취소',
  DELETE: '삭제',
  REOPEN_RECRUITMENT: '다시 모집하기',
};

const KNOWN_ACTIONS = ['EDIT', 'CLOSE_RECRUITMENT', 'CANCEL', 'DELETE', 'REOPEN_RECRUITMENT'];

/** 확인 단계를 거쳐야 하는 행동 (CR-0006 결함 1). 되돌릴 수 있는 EDIT·REOPEN_RECRUITMENT 는 뺀다 */
const DESTRUCTIVE = new Set<string>(['CLOSE_RECRUITMENT', 'CANCEL', 'DELETE']);

/** 왜 막혔는지. 버튼만 사라지면 사용자는 이유를 알 수 없다 */
function blockedReason(action: string, project: ClientProjectDetail): string | undefined {
  if (action === 'DELETE' && project.pendingApplicationCount > 0) {
    return `지원자 ${project.pendingApplicationCount}명이 있어 삭제할 수 없습니다`;
  }
  if (action === 'EDIT' && project.recruitmentStatus === 'CLOSED') {
    return '모집이 마감되어 수정할 수 없습니다';
  }
  if (action === 'CANCEL' && project.transactionStatus === 'IN_PROGRESS') {
    return '거래가 진행 중이라 취소할 수 없습니다';
  }
  return undefined;
}

/** 시안의 `.row__sub` — "5,000,000원 · 지원 3건 · 마감 5일 전" */
function summaryOf(project: ClientProjectDetail): string {
  const parts = [`${project.budgetAmount.toLocaleString('ko-KR')}원`];
  parts.push(`지원 ${project.pendingApplicationCount}건`);

  if (project.transactionStatus === 'CONTRACT_PENDING') {
    parts.push('선정된 프리랜서와 금액 합의 중');
  } else if (project.canceledAt !== null) {
    parts.push('취소된 프로젝트입니다');
  } else if (project.availableActions.includes('REOPEN_RECRUITMENT')) {
    parts.push('협상이 끝났으나 마감일이 지났습니다');
  } else {
    const days = Math.ceil(
      (new Date(project.recruitmentDeadlineAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    parts.push(days <= 0 ? '오늘 마감' : `마감 ${days}일 전`);
  }
  return parts.join(' · ');
}

export type ProjectManagePageProps = {
  /** 로그인한 의뢰인의 id. 없으면 목록을 부를 수 없다 */
  clientId: string | null;
};

export function ProjectManagePage({ clientId }: ProjectManagePageProps) {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useMyProjects(clientId);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reopenTarget, setReopenTarget] = useState<ClientProjectDetail | null>(null);
  // 확인을 기다리는 파괴적 행동. null 이면 다이얼로그가 없다 (CR-0006 결함 1).
  const [pendingAction, setPendingAction] = useState<{
    actionId: DestructiveActionId;
    project: ClientProjectDetail;
  } | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

  async function run(action: () => Promise<string | null>) {
    setNotice(null);
    setActionError(null);
    try {
      const message = await action();
      if (message) setNotice(message);
      reload();
    } catch (failure) {
      setActionError(failure instanceof ApiError ? failure.message : '요청을 처리하지 못했습니다.');
    }
  }

  function requestDestructive(actionId: DestructiveActionId, project: ClientProjectDetail) {
    setNotice(null);
    setActionError(null);
    setPendingAction({ actionId, project });
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    const { actionId, project } = pendingAction;
    setConfirmSubmitting(true);
    await run(async () => {
      if (actionId === 'CLOSE_RECRUITMENT') {
        const result = await closeRecruitment(project.projectId);
        return `모집을 마감했습니다. 대기 중이던 지원 ${result.rejectedApplicationCount}건을 정리했습니다.`;
      }
      if (actionId === 'CANCEL') {
        const result = await cancelProject(project.projectId);
        // 규칙 29 — 후처리가 실패했으면 "전부 정리됐다"고 말하지 않는다.
        const failed = Object.entries(result.postActions)
          .filter(([, outcome]) => outcome === 'FAILED')
          .map(([name]) => (name === 'applicationRejection' ? '지원자 정리' : '합의·계약 무효화'));
        return failed.length > 0
          ? `프로젝트를 취소했습니다. 다만 ${failed.join(' · ')}이(가) 끝나지 않아 다시 시도 중입니다.`
          : '프로젝트를 취소했습니다.';
      }
      // DELETE
      await deleteProject(project.projectId);
      return '프로젝트를 삭제했습니다.';
    });
    setConfirmSubmitting(false);
    setPendingAction(null);
  }

  function actionSpecs(project: ClientProjectDetail): ActionSpec[] {
    return KNOWN_ACTIONS.map((id) => ({
      id,
      label: ACTION_LABELS[id],
      available: project.availableActions.includes(
        id as ClientProjectDetail['availableActions'][number],
      ),
      blockedReason: blockedReason(id, project),
      variant: id === 'DELETE' || id === 'CANCEL' ? 'danger' : 'secondary',
      onClick: () => {
        // 되돌릴 수 없는(또는 대기 지원을 그 자리에서 정리하는) 행동은 확인을 먼저 거친다.
        if (DESTRUCTIVE.has(id)) {
          requestDestructive(id as DestructiveActionId, project);
          return;
        }
        if (id === 'EDIT') {
          navigate(PROJECT_ROUTES.edit(project.projectId));
        }
        if (id === 'REOPEN_RECRUITMENT') {
          setNotice(null);
          setActionError(null);
          setReopenTarget(project);
        }
      },
    }));
  }

  if (!clientId) {
    return (
      <PageBody>
        <EmptyState title="로그인이 필요합니다" body="의뢰인 계정으로 로그인해 주세요." />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <h1 className="h3" style={{ margin: 0 }}>
          내 프로젝트
        </h1>
        <Link to={PROJECT_ROUTES.register}>
          <Button variant="primary">프로젝트 등록</Button>
        </Link>
      </div>

      {notice && <Notice tone="info">{notice}</Notice>}
      {(error || actionError) && (
        <p className="status-line error-line" role="alert">
          {actionError ?? error}
        </p>
      )}

      {loading && (
        <p className="status-line" role="status">
          불러오는 중입니다…
        </p>
      )}

      {!loading && !error && data && data.length === 0 && (
        <EmptyState
          title="등록한 프로젝트가 없습니다"
          body="첫 프로젝트를 등록하고 프리랜서를 만나보세요."
          action={
            <Link to={PROJECT_ROUTES.register}>
              <Button variant="primary">프로젝트 등록</Button>
            </Link>
          }
        />
      )}

      {data && data.length > 0 && (
        <>
          <div className="card">
            {data.map((project) => (
              <div key={project.projectId} className="row">
                <div className="row__main">
                  <h3>
                    <Link to={PROJECT_ROUTES.detail(project.projectId)}>{project.title}</Link>
                  </h3>
                  <span className="row__sub">{summaryOf(project)}</span>
                </div>

                <div className="row__badges">
                  <RecruitmentBadge status={project.recruitmentStatus} />
                  <TransactionBadge status={project.transactionStatus} />
                  {project.availableActions.includes('REOPEN_RECRUITMENT') && <ReopenBadge />}
                </div>

                <PermissionAwareActions actions={actionSpecs(project)} />
              </div>
            ))}
          </div>

          <p className="helper">
            거래 상태 배지(계약 대기 · 작업 중 · 완료 · 취소됨)는 <strong>이 화면에만</strong>{' '}
            나옵니다. 공개 목록·상세에는 나오지 않습니다.
          </p>
        </>
      )}

      {reopenTarget && (
        <ReopenRecruitmentDialog
          projectId={reopenTarget.projectId}
          projectTitle={reopenTarget.title}
          previousDeadlineAt={reopenTarget.recruitmentDeadlineAt}
          onDismiss={() => setReopenTarget(null)}
          onReopened={(message) => {
            setReopenTarget(null);
            setNotice(message);
            reload();
          }}
        />
      )}

      {pendingAction && (
        <DestructiveActionSummary
          actionId={pendingAction.actionId}
          projectTitle={pendingAction.project.title}
          pendingApplicationCount={pendingAction.project.pendingApplicationCount}
          hasContract={pendingAction.project.transactionStatus === 'CONTRACT_PENDING'}
          pending={confirmSubmitting}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void confirmPendingAction()}
        />
      )}
    </PageBody>
  );
}
