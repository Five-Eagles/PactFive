import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, EmptyState, Field, Notice } from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { toIsoOrEmpty } from '../../shared/date';
import { updateProject } from './api/project';
import { useProject, isClientDetail } from './useProject';
import { PROJECT_ROUTES } from './project.routes';
import { MoneyBreakdown } from './MoneyBreakdown';
import type { UpdateProjectRequest } from './project.types';

/**
 * SCR-B06 — 프로젝트 수정
 *
 * 구조·문구 정본: `features/project-management/design/high-fi-manage.html`
 * ("필수 요소 목록" 5개: 제목/라벨 2개/버튼 2개 — 예산·마감일 라벨은 조건부라 목록에서 뺐다).
 *
 * sync-log.md 2026-08-27/28 비고에 "SCR-B06·B10 미반영 — 다음 통합 대상"으로 남아 있던 것을
 * 2026-08-29에 반영했다. 서버 엔드포인트(`PATCH /api/v1/projects/:projectId`)·API 클라이언트
 * (`api/project.ts`의 `updateProject`)·타입(`UpdateProjectRequest`)은 이미 1차 반영에서
 * 갖춰져 있었다 — 화면만 없었다.
 *
 * **잠금을 여기서 계산하지 않는다.** 서버가 `ClientProjectDetail.editableFields`로 내려준
 * 목록을 그대로 따른다(spec.md 규칙 13·15). 원본 `prototype/web/ProjectManage.tsx`의
 * `ProjectEditForm`과 같은 방식이다.
 *
 * ## 모집 일정 칸 (2026-09-03 반영, ef1411e)
 *
 * 2026-08-29 반영은 title·description·budgetAmount 세 필드만 다뤘다.
 * `feedback_loop/2026-08-29/project-management.md` 항목 2에서 담당자가 확인해 준 대로,
 * 규칙 15를 뒤집으면 **대기 지원이 0건일 때 모집 일정도 수정 가능**이고 `editableFields`가
 * 이미 `recruitmentStartAt`·`recruitmentDeadlineAt`를 함께 내려보낸다 — 세 필드로 좁힌 것은
 * 의도적 설계가 아니라 프로토타입의 누락이었다. 서버(`project.controller.ts`의 `update`
 * 핸들러)는 이미 두 필드를 받고 있어 이 화면에 입력만 더한다.
 *
 * 입력 칸 옆에는 `MoneyBreakdown`으로 예산 출처를 보여준다(CR-0006 결함 2) — 이 숫자가
 * 의뢰인이 직접 넣은 값인지 AI 단가 분석이 바꾼 값인지 여기서 구분된다.
 */
export function ProjectEditPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, loading, error } = useProject(projectId ?? '');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [startAt, setStartAt] = useState('');
  const [deadlineAt, setDeadlineAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 서버 데이터가 도착하면 그 값으로 폼을 채운다 — 값이 오기 전에는 빈 폼을 보여주지 않는다.
  useEffect(() => {
    if (project && isClientDetail(project)) {
      setTitle(project.title);
      setDescription(project.description);
      setBudgetAmount(String(project.budgetAmount));
      setStartAt(project.recruitmentStartAt ? project.recruitmentStartAt.slice(0, 10) : '');
      setDeadlineAt(project.recruitmentDeadlineAt.slice(0, 10));
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
    if (canEdit('recruitmentStartAt')) {
      patch.recruitmentStartAt = toIsoOrEmpty(startAt) || null;
    }
    if (canEdit('recruitmentDeadlineAt')) {
      patch.recruitmentDeadlineAt = toIsoOrEmpty(deadlineAt);
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

        {/* 입력 칸 옆에 출처를 붙인다 — 이 숫자가 직접 입력한 값인지 AI가 바꾼 값인지
            여기서 구분된다 (CR-0006 결함 2). */}
        <MoneyBreakdown
          amount={project.budgetAmount}
          source={project.budgetSource}
          sourceAt={project.budgetSourceAt}
          label="현재 예산"
        />

        <Field
          id="edit-start"
          label="모집 시작일 (선택)"
          state={canEdit('recruitmentStartAt') ? 'default' : 'readOnly'}
          helperText={canEdit('recruitmentStartAt') ? '비워두면 바로 모집을 시작합니다' : undefined}
        >
          <input
            id="edit-start"
            className="field"
            type="date"
            value={startAt}
            readOnly={!canEdit('recruitmentStartAt')}
            onChange={(event) => setStartAt(event.target.value)}
          />
        </Field>

        <Field
          id="edit-deadline"
          label="모집 마감일"
          required
          state={canEdit('recruitmentDeadlineAt') ? 'default' : 'readOnly'}
          helperText={
            canEdit('recruitmentDeadlineAt')
              ? '모집 기간은 7일 이상을 권장합니다. 최대 1년까지 설정할 수 있습니다.'
              : `지원자 ${project.pendingApplicationCount}명이 있어 모집 일정은 변경할 수 없습니다.`
          }
        >
          <input
            id="edit-deadline"
            className="field"
            type="date"
            value={deadlineAt}
            readOnly={!canEdit('recruitmentDeadlineAt')}
            onChange={(event) => setDeadlineAt(event.target.value)}
            required
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
