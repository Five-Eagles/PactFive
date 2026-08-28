import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  DeadlineIndicator,
  EmptyState,
  Money,
  PermissionAwareActions,
  RecruitmentBadge,
  type ActionSpec,
} from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { cancelProject, closeRecruitment, deleteProject } from './api/project';
import { useMyProjects } from './useProject';
import { PROJECT_ROUTES } from './project.routes';
import type { ClientProjectDetail } from './project.types';

/**
 * SCR-B07 — 내 프로젝트 (관리)
 *
 * 원본: features/project-management/prototype/web/ProjectManage.tsx (3e4977e)
 * 문구는 `design/high-fi-manage.html` 의 "필수 요소 목록" 14개를 그대로 쓴다.
 *
 * **잠금을 여기서 계산하지 않는다.** 서버가 준 `editableFields` · `availableActions` 를
 * 그대로 따른다 (규칙 13). 화면이 다시 계산하면 규칙이 두 곳에 생긴다.
 *
 * 원본의 `ProjectEditForm`(SCR-B06)·`ReopenRecruitmentDialog`(SCR-B10)는 이번 반영에 넣지
 * 않았다 — feedback_loop/2026-08-28/project-management.md 항목 5.
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

export type ProjectManagePageProps = {
  /** 로그인한 의뢰인의 id. 없으면 목록을 부를 수 없다 */
  clientId: string | null;
};

export function ProjectManagePage({ clientId }: ProjectManagePageProps) {
  const { data, loading, error, reload } = useMyProjects(clientId);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(action: () => Promise<string | null>) {
    setNotice(null);
    setActionError(null);
    try {
      const message = await action();
      if (message) setNotice(message);
      reload();
    } catch (failure) {
      setActionError(
        failure instanceof ApiError ? failure.message : '요청을 처리하지 못했습니다.',
      );
    }
  }

  function actionSpecs(project: ClientProjectDetail): ActionSpec[] {
    return KNOWN_ACTIONS.map((id) => ({
      id,
      label: ACTION_LABELS[id],
      available: project.availableActions.includes(id as ClientProjectDetail['availableActions'][number]),
      blockedReason: blockedReason(id, project),
      variant: id === 'DELETE' || id === 'CANCEL' ? 'danger' : 'secondary',
      onClick: () => {
        if (id === 'CLOSE_RECRUITMENT') {
          void run(async () => {
            const result = await closeRecruitment(project.projectId);
            return `모집을 마감했습니다. 대기 중이던 지원 ${result.rejectedApplicationCount}건을 정리했습니다.`;
          });
        }
        if (id === 'CANCEL') {
          void run(async () => {
            const result = await cancelProject(project.projectId);
            // 규칙 29 — 후처리가 실패했으면 "전부 정리됐다"고 말하지 않는다.
            const failed = Object.entries(result.postActions)
              .filter(([, outcome]) => outcome === 'FAILED')
              .map(([name]) =>
                name === 'applicationRejection' ? '지원자 정리' : '합의·계약 무효화',
              );
            return failed.length > 0
              ? `프로젝트를 취소했습니다. 다만 ${failed.join(' · ')}이(가) 끝나지 않아 다시 시도 중입니다.`
              : '프로젝트를 취소했습니다.';
          });
        }
        if (id === 'DELETE') {
          void run(async () => {
            await deleteProject(project.projectId);
            return '프로젝트를 삭제했습니다.';
          });
        }
        // EDIT · REOPEN_RECRUITMENT 는 별도 화면이 필요해 이번 반영 범위 밖이다.
      },
    }));
  }

  if (!clientId) {
    return (
      <main className="page">
        <EmptyState title="로그인이 필요합니다" body="의뢰인 계정으로 로그인해 주세요." />
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page__head">
        <h1>내 프로젝트</h1>
        <Link to={PROJECT_ROUTES.register}>
          <Button variant="primary">프로젝트 등록</Button>
        </Link>
      </div>

      {notice && (
        <p className="status-line" role="status">
          {notice}
        </p>
      )}
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

      {!loading && data && data.length === 0 && (
        <EmptyState
          title="등록한 프로젝트가 없습니다"
          body="프로젝트를 등록하면 지원자를 받을 수 있습니다."
          action={
            <Link to={PROJECT_ROUTES.register}>
              <Button variant="primary">프로젝트 등록</Button>
            </Link>
          }
        />
      )}

      {data && data.length > 0 && (
        <ul className="list">
          {data.map((project) => (
            <li key={project.projectId} className="card">
              <h3>
                <Link to={PROJECT_ROUTES.detail(project.projectId)}>{project.title}</Link>
              </h3>
              <RecruitmentBadge status={project.recruitmentStatus} />
              <p className="card__meta">
                <Money amount={project.budgetAmount} />
              </p>
              <p className="card__meta">
                <DeadlineIndicator deadlineAt={project.recruitmentDeadlineAt} />
              </p>
              <p className="card__meta">대기 중인 지원 {project.pendingApplicationCount}건</p>
              <PermissionAwareActions actions={actionSpecs(project)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
