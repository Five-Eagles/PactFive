import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, Notice } from '../../shared/ui/primitives';
import { useApplicationEligibility, useCreateApplication } from './useApplications';
import { APPLICATION_ROUTES } from './application.routes';
import type { CreateApplicationInput, EligibilityBlockedReason } from './application.types';

/**
 * 지원하기(규칙 10) — `features/applications/prototype/web/ApplicationPanel.tsx`의 "apply"
 * 뷰를 실제 제출 흐름으로 재해석했다. 시안은 정적 목업(view prop으로 상태만 스위칭)이라
 * 폼 상태·검증·제출 결과 분기는 이 화면에서 새로 짰다(app/web/AGENTS.md "재해석해서
 * 일관되게 다시 짠다").
 *
 * 지원 가능 여부(`canApply`)는 project-management가 정한다 — 최종 판정은 언제나 제출 시
 * 서버가 한다(`PROJECT_TRANSITION_CONFLICT` 등). 2026-09-07 PR #83 이식으로
 * `GET .../application-eligibility`가 생겨서, 폼을 그리기 전에 먼저 물어보고 지원할 수
 * 없는 게 뻔한 경우(이미 지원함·모집 마감·마감 기한 지남·프로젝트 취소)는 폼 대신 안내만
 * 보여준다 — 제출 후 409를 받고서야 아는 것보다 UX가 낫다. eligibility 조회 자체가
 * 실패하면(네트워크 등) 막지 않고 폼을 그대로 보여준다 — 최종 판정은 어차피 서버가 한다.
 */

const BLOCKED_REASON_LABEL: Partial<Record<EligibilityBlockedReason, string>> = {
  ALREADY_APPLIED: '이미 지원한 프로젝트입니다.',
  PROJECT_CANCELED: '프로젝트가 취소되었습니다.',
  RECRUITMENT_NOT_OPEN: '모집이 마감되었습니다.',
  DEADLINE_PASSED: '모집 마감 기한이 지났습니다.',
};

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
  const eligibility = useApplicationEligibility(projectId);
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

  if (eligibility.loading) {
    return (
      <PageBody>
        <article className="panel" aria-busy="true">
          <div className="panel-head">
            <h2 className="title">지원하기</h2>
          </div>
          <p className="helper">지원 가능 여부를 확인하는 중입니다.</p>
          <div className="skeleton" />
        </article>
      </PageBody>
    );
  }

  if (eligibility.data && !eligibility.data.canApply && status !== 'submitted') {
    const reason = eligibility.data.blockedReasons[0];
    const message = (reason && BLOCKED_REASON_LABEL[reason]) ?? '지금은 지원할 수 없습니다.';
    return (
      <PageBody>
        <article className="panel">
          <div className="panel-head">
            <h2 className="title">지원하기</h2>
            <span className="badge warning">지원 불가</span>
          </div>
          <Notice tone="warning">{message}</Notice>
          {eligibility.data.blockedReasons.includes('ALREADY_APPLIED') && (
            <div className="btn-row">
              <Button variant="primary" onClick={() => navigate(APPLICATION_ROUTES.mine)}>
                내 지원 현황 보기
              </Button>
            </div>
          )}
        </article>
      </PageBody>
    );
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
