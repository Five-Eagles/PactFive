import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field } from '../../shared/ui/primitives';
import { ApiError } from '../../shared/http';
import { registerProject } from './api/project';
import { PROJECT_ROUTES } from './project.routes';
import { CATEGORY_OPTIONS, SKILL_OPTIONS } from './project.types';

/**
 * SCR-B03 · B04 · B05 — 프로젝트 등록 3단계
 *
 * 원본: features/project-management/prototype/web/ProjectRegisterForm.tsx (3e4977e)
 * 문구는 `design/high-fi-register.html` 의 "필수 요소 목록" 20개를 그대로 쓴다.
 * 그 목록은 PRD §14.5 정본을 옮긴 것이라 한 글자라도 바꾸면 정본과 갈라진다.
 *
 * **세 단계를 한 컴포넌트에 둔다.** 규칙 1 이 "서버에는 마지막 단계에서 한 번만 저장한다"이므로
 * 단계 사이 상태가 한 곳에 있어야 한다. 파일을 나누면 중간 상태를 어딘가에 올려두게 되고,
 * 그게 서버 임시 저장으로 번진다.
 */

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

/** `<input type="date">` 는 `2026-09-20` 을 준다. 서버는 ISO 시각을 기대한다 */
function toIsoOrEmpty(date: string): string {
  return date ? new Date(`${date}T23:59:59Z`).toISOString() : '';
}

export function ProjectRegisterForm() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
      setError(
        failure instanceof ApiError ? failure.message : '프로젝트를 등록하지 못했습니다.',
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <div className="page__head">
        <h1>프로젝트 등록</h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* 세 단계를 모두 렌더링하고 현재 단계만 보인다.
            입력값이 단계를 오갈 때 사라지지 않게 한다 (§11 "입력 보존"). */}

        {/* ═══ SCR-B03 ═══ */}
        <section hidden={step !== 1} aria-labelledby="step1-heading">
          <h2 id="step1-heading">기본 정보</h2>

          <Field
            id="title"
            label="프로젝트 제목"
            required
            helperText="5자 이상 100자 이하로 입력해 주세요."
          >
            <input
              id="title"
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
              rows={6}
              value={draft.description}
              placeholder="어떤 작업이 필요한지 구체적으로 적어 주세요."
              onChange={(event) => set('description', event.target.value)}
            />
          </Field>

          <Field id="category" label="카테고리" required>
            <select
              id="category"
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

          <Button variant="primary" onClick={() => setStep(2)}>
            다음
          </Button>
        </section>

        {/* ═══ SCR-B04 ═══ */}
        <section hidden={step !== 2} aria-labelledby="step2-heading">
          <h2 id="step2-heading">일정과 예산</h2>

          <Field id="startAt" label="모집 시작일 (선택)">
            <input
              id="startAt"
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
              type="text"
              inputMode="numeric"
              value={draft.budgetAmount}
              placeholder="예) 5,000,000"
              onChange={(event) => set('budgetAmount', event.target.value)}
            />
          </Field>

          <Button variant="quiet" onClick={() => setStep(1)}>
            이전
          </Button>
          <Button variant="primary" onClick={() => setStep(3)}>
            다음
          </Button>
        </section>

        {/* ═══ SCR-B05 ═══ */}
        <section hidden={step !== 3} aria-labelledby="step3-heading">
          <h2 id="step3-heading">기술과 확인</h2>

          <Field
            id="skills"
            label="필요한 기술"
            required
            helperText="최소 1개, 최대 10개까지 선택할 수 있습니다."
          >
            <div id="skills">
              {SKILL_OPTIONS.map((skill) => (
                <label key={skill.value} style={{ marginRight: 12 }}>
                  <input
                    type="checkbox"
                    checked={draft.skillIds.includes(skill.value)}
                    onChange={() => toggleSkill(skill.value)}
                  />{' '}
                  {skill.label}
                </label>
              ))}
            </div>
          </Field>

          {/* 도메인 패턴 ProjectBriefSummary — 등록 전 마지막 확인 */}
          <h3>입력한 내용을 확인해 주세요</h3>
          <dl>
            <dt>프로젝트 제목</dt>
            <dd>
              {draft.title || '—'}{' '}
              <Button variant="quiet" size="sm" onClick={() => setStep(1)}>
                수정
              </Button>
            </dd>
            <dt>예산</dt>
            <dd>{draft.budgetAmount || '—'}</dd>
            <dt>모집 마감일</dt>
            <dd>{draft.recruitmentDeadlineAt || '—'}</dd>
          </dl>

          {error && (
            <p className="error-line" role="alert">
              {error}
            </p>
          )}

          <Button variant="quiet" onClick={() => setStep(2)}>
            이전
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            등록하기
          </Button>
        </section>
      </form>
    </main>
  );
}
