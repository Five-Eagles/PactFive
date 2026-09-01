import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, EmptyState, Field, Notice } from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { updateProject } from './api/project';
import { useProject, isClientDetail } from './useProject';
import { PROJECT_ROUTES } from './project.routes';
import type { UpdateProjectRequest } from './project.types';

/**
 * SCR-B06 — 프로젝트 수정
 *
 * 구조·문구 정본: `features/project-management/design/high-fi-manage.html`
 * ("필수 요소 목록" 5개: 제목/라벨 2개/버튼 2개 — 예산·마감일 라벨은 조건부라 목록에서 뺐다).
 *
 * sync-log.md 2026-08-27/28 비고에 "SCR-B06·B10 미반영 — 다음 통합 대상"으로 남아 있던 것을
 * 오늘 반영한다. 서버 엔드포인트(`PATCH /api/v1/projects/:projectId`)·API 클라이언트
 * (`api/project.ts`의 `updateProject`)·타입(`UpdateProjectRequest`)은 이미 1차 반영에서
 * 갖춰져 있었다 — 화면만 없었다.
 *
 * **잠금을 여기서 계산하지 않는다.** 서버가 `ClientProjectDetail.editableFields`로 내려준
 * 목록을 그대로 따른다(spec.md 규칙 13·15). 원본 `prototype/web/ProjectManage.tsx`의
 * `ProjectEditForm`과 같은 방식이다.
 *
 * feedback_loop 참고: api-contract.md의 PATCH 요청 필드 목록은 `recruitmentStartAt`·
 * `recruitmentDeadlineAt`도 포함하지만, 1차 반영에서 `UpdateProjectRequest` 타입과
 * 원본 `ProjectEditForm`이 이미 title·description·budgetAmount로 범위를 좁혀 두었다 —
 * 이 화면도 그 범위를 그대로 따른다. 마감일 수정을 이 화면에 열지는 담당자 확인이 필요해
 * `feedback_loop/2026-08-29/project-management.md`에 남겼다.
 */
export function ProjectEditPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, loading, error } = useProject(projectId ?? '');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 서버 데이터가 도착하면 그 값으로 폼을 채운다 — 값이 오기 전에는 빈 폼을 보여주지 않는다.
  useEffect(() => {
    if (project && isClientDetail(project)) {
      setTitle(project.title);
      setDescription(project.description);
      setBudgetAmount(String(project.budgetAmount));
    }
  }, [project]);

  if (!projectId) {
    return (
      <PageBody narrow>
        <EmptyState title="잘못된 주소입니다" body="프로젝트를 다시 선택해 주세요." />
      </PageBody>
    );
  }
  // 아래 handleSubmit(함수 선언문)은 TS가 상단 가드의 좁힘을 물려받지 않으므로 별도로 확정해 둔다.
  const id = projectId;

  if (loading) {
    return (
      <PageBody narrow>
        <p className="status-line" role="status">
          불러오는 중입니다…
        </p>
      </PageBody>
    );
  }

  if (error || !project || !isClientDetail(project)) {
    return (
      <PageBody narrow>
        <EmptyState
          title="프로젝트를 수정할 수 없습니다"
          body={error ?? '이 프로젝트를 수정할 권한이 없습니다.'}
        />
      </PageBody>
    );
  }

  const canEdit = (field: string) => project.editableFields.includes(field);
  const locked = project.pendingApplicationCount > 0 && !canEdit('budgetAmount');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    // 바꿀 필드만 보낸다 — 잠긴 필드를 실어 보내면 서버가 잠금 판정에 걸린다
    // (api/project.ts updateProject 주석, spec.md 규칙 15).
    const patch: UpdateProjectRequest = { title, description };
    if (canEdit('budgetAmount')) {
      patch.budgetAmount = Number(budgetAmount.replace(/,/g, '').trim());
    }

    try {
      await updateProject(id, patch);
      navigate(PROJECT_ROUTES.manage);
    } catch (failure) {
      // 실패해도 입력을 지우지 않는다 (ux-philosophy §6 "작업 보호").
      setSubmitError(failure instanceof ApiError ? failure.message : '프로젝트를 수정하지 못했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <PageBody narrow>
      <h1 className="h3">프로젝트 수정</h1>

      {locked && (
        <Notice tone="warning">
          지원자 {project.pendingApplicationCount}명이 있어 예산과 일정은 변경할 수 없습니다.
        </Notice>
      )}
      {submitError && <Notice tone="danger">{submitError}</Notice>}

      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <Field id="edit-title" label="프로젝트 제목" required>
          <input
            id="edit-title"
            className="field"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </Field>

        <Field id="edit-description" label="프로젝트 설명" required>
          <textarea
            id="edit-description"
            className="field"
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            required
          />
        </Field>

        <Field
          id="edit-budget"
          label="예산"
          state={canEdit('budgetAmount') ? 'default' : 'readOnly'}
          helperText={canEdit('budgetAmount') ? undefined : '지원자가 있어 변경할 수 없습니다'}
        >
          <input
            id="edit-budget"
            className="field"
            type="text"
            value={budgetAmount}
            readOnly={!canEdit('budgetAmount')}
            onChange={(event) => setBudgetAmount(event.target.value)}
          />
        </Field>

        <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="quiet" onClick={() => navigate(PROJECT_ROUTES.manage)}>
            취소
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            저장
          </Button>
        </div>
      </form>
    </PageBody>
  );
}
