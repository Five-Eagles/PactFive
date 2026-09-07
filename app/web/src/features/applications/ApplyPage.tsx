import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, Notice } from '../../shared/ui/primitives';
import { useCreateApplication } from './useApplications';
import { APPLICATION_ROUTES } from './application.routes';
import type { CreateApplicationInput } from './application.types';

/**
 * 지원하기(규칙 10) — `features/applications/prototype/web/ApplicationPanel.tsx`의 "apply"
 * 뷰를 실제 제출 흐름으로 재해석했다. 시안은 정적 목업(view prop으로 상태만 스위칭)이라
 * 폼 상태·검증·제출 결과 분기는 이 화면에서 새로 짰다(app/web/AGENTS.md "재해석해서
 * 일관되게 다시 짠다").
 *
 * 지원 가능 여부(`canApply`)는 project-management가 정한다 — 여기서는 모집 마감을
 * 다시 판정하지 않고, 서버가 `PROJECT_TRANSITION_CONFLICT`로 거절하면 그 문구를 그대로 보여준다.
 */

type Draft = { coverLetter: string; expectedAmount: string; expectedDurationDays: string };

function toInput(draft: Draft): CreateApplicationInput | null {
  const expectedAmount = Number(draft.expectedAmount);
  const expectedDurationDays = Number(draft.expectedDurationDays);
  if (!draft.coverLetter.trim() || !Number.isInteger(expectedAmount) || expectedAmount <= 0) return null;
  if (!Number.isInteger(expectedDurationDays) || expectedDurationDays <= 0) return null;
  return { coverLetter: draft.coverLetter, expectedAmount, expectedDurationDays };
}

export function ApplyPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { status, errorMessage, submit } = useCreateApplication(projectId);
  const [draft, setDraft] = useState<Draft>({ coverLetter: '', expectedAmount: '', expectedDurationDays: '' });
  const [validationError, setValidationError] = useState<string | null>(null);

  function handleSubmit() {
    const input = toInput(draft);
    if (!input) {
      setValidationError('자기소개, 희망 금액, 예상기간을 모두 올바르게 입력해 주세요.');
      return;
    }
    setValidationError(null);
    void submit(input);
  }

  if (status === 'submitted') {
    return (
      <PageBody>
        <article className="panel">
          <div className="panel-head">
            <h2 className="title">지원 완료</h2>
            <span className="badge info">대기</span>
          </div>
          <p className="status-copy">지원서가 의뢰인에게 전달됐습니다. 결과는 내 지원 현황에서 확인할 수 있습니다.</p>
          <div className="btn-row">
            <Button variant="primary" onClick={() => navigate(APPLICATION_ROUTES.mine)}>
              내 지원 현황 보기
            </Button>
          </div>
        </article>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          handleSubmit();
        }}
      >
        <div className="panel-head">
          <h2 className="title">지원하기</h2>
          <span className="badge info">모집 중</span>
        </div>
        <p className="status-copy">
          모집 중인 프로젝트에만 지원할 수 있습니다. 제출하면 같은 프로젝트에는 다시 넣을 수 없습니다.
        </p>

        {status === 'conflict' && <Notice tone="warning">이미 지원한 프로젝트입니다.</Notice>}
        {status === 'error' && errorMessage && <Notice tone="danger">{errorMessage}</Notice>}
        {validationError && <Notice tone="danger">{validationError}</Notice>}

        <div className="field-row">
          <label className="label" htmlFor="cover">
            자기소개
          </label>
          <textarea
            className="field"
            id="cover"
            name="coverLetter"
            placeholder="자기소개"
            value={draft.coverLetter}
            onChange={(event) => setDraft((prev) => ({ ...prev, coverLetter: event.target.value }))}
          />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="amount">
            희망 금액
          </label>
          <input
            className="field"
            id="amount"
            name="expectedAmount"
            placeholder="희망 금액"
            inputMode="numeric"
            value={draft.expectedAmount}
            onChange={(event) => setDraft((prev) => ({ ...prev, expectedAmount: event.target.value }))}
          />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="days">
            예상기간
          </label>
          <input
            className="field"
            id="days"
            name="expectedDurationDays"
            placeholder="예상기간"
            inputMode="numeric"
            value={draft.expectedDurationDays}
            onChange={(event) => setDraft((prev) => ({ ...prev, expectedDurationDays: event.target.value }))}
          />
        </div>
        <div className="btn-row">
          <Button type="submit" variant="primary" loading={status === 'submitting'}>
            지원하기
          </Button>
        </div>
      </form>
    </PageBody>
  );
}
