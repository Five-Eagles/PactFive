import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageBody } from '../../shared/ui/AppShell';
import { Button, Field, Notice } from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { toIsoOrEmpty } from '../../shared/date';
import { registerProject } from './api/project';
import { PROJECT_ROUTES } from './project.routes';
import { CATEGORY_OPTIONS, SKILL_OPTIONS } from './project.types';

/**
 * SCR-B03 · B04 · B05 — 프로젝트 등록 3단계
 *
 * 구조 정본: `features/project-management/design/high-fi-register.html`
 * 문구 정본: 같은 파일의 "필수 요소 목록" 20개 (PRD §14.5). 한 글자도 바꾸지 않는다.
 *
 * 시안 구조: `.steps`(1-2-3 단계 표시) → `.h3` 제목 → `.field-row` 입력들 → `.btn-row`.
 * 1차 반영에서 단계 표시가 빠져 있었다 — 3단계 폼에서 지금 어디인지 알 수 없었다.
 *
 * **세 단계를 한 컴포넌트에 둔다.** 규칙 1 이 "서버에는 마지막 단계에서 한 번만 저장한다"이므로
 * 단계 사이 상태가 한 곳에 있어야 한다. 파일을 나누면 중간 상태를 어딘가에 올려두게 되고,
 * 그게 서버 임시 저장으로 번진다.
 */

type Step = 1 | 2 | 3;

const STEP_LABELS: { step: Step; label: string }[] = [
  { step: 1, label: '기본 정보' },
  { step: 2, label: '일정 · 예산' },
  { step: 3, label: '필요 기술' },
];

type RegisterDraft = {
  title: string;
  description: string;
  category: string;
  recruitmentStartAt: string;
  recruitmentDeadlineAt: string;
  budgetAmount: string;
  skillIds: string[];
};

const EMPTY_DRAFT: RegisterDraft = {
  title: '',
  description: '',
  category: '',
  recruitmentStartAt: '',
  recruitmentDeadlineAt: '',
  budgetAmount: '',
  skillIds: [],
};

/** "5,000,000" 처럼 쉼표를 넣어도 받는다. 숫자가 아니면 NaN 이 되고 서버가 422 로 끊는다 */
function toAmount(raw: string): number {
  return Number(raw.replace(/,/g, '').trim());
}

/** 단계 표시 — 시안의 `.steps` */
function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="steps" aria-label={`등록 단계 ${current} / 3`}>
      {STEP_LABELS.map(({ step, label }, index) => (
        <span key={step} style={{ display: 'contents' }}>
          {index > 0 && <span className="sep" aria-hidden="true" />}
          <span className={`step${step === current ? ' on' : ''}`}>
            <span className="num" aria-hidden="true">
              {step}
            </span>
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}

export function ProjectRegisterForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [draft, setDraft] = useState<RegisterDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof RegisterDraft>(key: K, value: RegisterDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleSkill(id: string) {
    setDraft((current) => ({
      ...current,
      skillIds: current.skillIds.includes(id)
        ? current.skillIds.filter((skill) => skill !== id)
        : [...current.skillIds, id],
    }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const created = await registerProject({
        title: draft.title,
        description: draft.description,
        category: draft.category,
        recruitmentStartAt: toIsoOrEmpty(draft.recruitmentStartAt) || null,
        recruitmentDeadlineAt: toIsoOrEmpty(draft.recruitmentDeadlineAt),
        budgetAmount: toAmount(draft.budgetAmount),
        skillIds: draft.skillIds,
      });
      navigate(PROJECT_ROUTES.detail(created.projectId));
    } catch (failure) {
      // 실패해도 입력을 지우지 않는다 (ux-philosophy §6 "작업 보호") — draft 를 그대로 둔다.
      setError(failure instanceof ApiError ? failure.message : '프로젝트를 등록하지 못했습니다.');
      setSubmitting(false);
    }
  }

  return (
    <PageBody narrow>
      <StepIndicator current={step} />

      <form onSubmit={handleSubmit}>
        {/* 세 단계를 모두 렌더링하고 현재 단계만 보인다.
            입력값이 단계를 오갈 때 사라지지 않게 한다 (§11 "입력 보존"). */}

        {/* ═══ SCR-B03 ═══ */}
        <section hidden={step !== 1} aria-labelledby="step1-heading">
          <h1 id="step1-heading" className="h3">
            프로젝트를 등록합니다
          </h1>

          <Field
            id="title"
            label="프로젝트 제목"
            required
            helperText="5자 이상 100자 이하로 입력해 주세요."
          >
            <input
              id="title"
              className="field"
              type="text"
              value={draft.title}
              placeholder="예) 쇼핑몰 웹사이트 구축"
              onChange={(event) => set('title', event.target.value)}
            />
          </Field>

          <Field
            id="description"
            label="프로젝트 설명"
            required
            helperText="20자 이상 적어 주시면 AI 단가 분석을 더 정확하게 받을 수 있습니다."
          >
            <textarea
              id="description"
              className="field"
              rows={6}
              value={draft.description}
              placeholder="어떤 작업이 필요한지 구체적으로 적어 주세요."
              onChange={(event) => set('description', event.target.value)}
            />
          </Field>

          <Field id="category" label="카테고리" required>
            <select
              id="category"
              className="field"
              value={draft.category}
              onChange={(event) => set('category', event.target.value)}
            >
              <option value="">선택해 주세요</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="btn-row">
            <Button variant="primary" onClick={() => setStep(2)}>
              다음
            </Button>
          </div>
        </section>

        {/* ═══ SCR-B04 ═══ */}
        <section hidden={step !== 2} aria-labelledby="step2-heading">
          <h1 id="step2-heading" className="h3">
            일정과 예산
          </h1>

          <Field id="startAt" label="모집 시작일 (선택)" helperText="비워두면 바로 모집을 시작합니다">
            <input
              id="startAt"
              className="field"
              type="date"
              value={draft.recruitmentStartAt}
              onChange={(event) => set('recruitmentStartAt', event.target.value)}
            />
          </Field>

          <Field
            id="deadlineAt"
            label="모집 마감일"
            required
            helperText="모집 기간은 7일 이상을 권장합니다. 최대 1년까지 설정할 수 있습니다."
          >
            <input
              id="deadlineAt"
              className="field"
              type="date"
              value={draft.recruitmentDeadlineAt}
              onChange={(event) => set('recruitmentDeadlineAt', event.target.value)}
            />
          </Field>

          <Field
            id="budget"
            label="예산"
            required
            helperText="단위는 원입니다. 나중에 지원자가 생기면 변경할 수 없습니다."
          >
            <input
              id="budget"
              className="field"
              type="text"
              inputMode="numeric"
              value={draft.budgetAmount}
              placeholder="예) 5,000,000"
              onChange={(event) => set('budgetAmount', event.target.value)}
            />
          </Field>

          <div className="btn-row">
            <Button variant="quiet" onClick={() => setStep(1)}>
              이전
            </Button>
            <Button variant="primary" onClick={() => setStep(3)}>
              다음
            </Button>
          </div>
        </section>

        {/* ═══ SCR-B05 ═══ */}
        <section hidden={step !== 3} aria-labelledby="step3-heading">
          <h1 id="step3-heading" className="h3">
            필요한 기술과 확인
          </h1>

          <Field
            id="skills"
            label="필요한 기술"
            required
            helperText="최소 1개, 최대 10개까지 선택할 수 있습니다."
          >
            <div id="skills" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {SKILL_OPTIONS.map((skill) => (
                <label key={skill.value} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={draft.skillIds.includes(skill.value)}
                    onChange={() => toggleSkill(skill.value)}
                  />
                  {skill.label}
                </label>
              ))}
            </div>
          </Field>

          {/* 도메인 패턴 ProjectBriefSummary — 등록 전 마지막 확인 */}
          <h2 className="title">입력한 내용을 확인해 주세요</h2>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="kv">
              <span className="kv__k">프로젝트 제목</span>
              <span>
                {draft.title || '—'}{' '}
                <Button variant="quiet" size="sm" onClick={() => setStep(1)}>
                  수정
                </Button>
              </span>
            </div>
            <div className="kv">
              <span className="kv__k">예산</span>
              <span>{draft.budgetAmount || '—'}</span>
            </div>
            <div className="kv">
              <span className="kv__k">모집 마감일</span>
              <span>{draft.recruitmentDeadlineAt || '—'}</span>
            </div>
          </div>

          {error && <Notice tone="danger">{error}</Notice>}

          <div className="btn-row">
            <Button variant="quiet" onClick={() => setStep(2)}>
              이전
            </Button>
            <Button variant="primary" type="submit" loading={submitting}>
              등록하기
            </Button>
          </div>
        </section>
      </form>
    </PageBody>
  );
}
