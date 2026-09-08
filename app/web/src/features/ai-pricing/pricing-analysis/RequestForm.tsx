import { useRef, type FormEvent } from 'react';
import { Button, Field } from '../../../shared/ui/primitives';
import {
  PRICING_ANALYSIS_CATEGORIES,
  PRICING_ANALYSIS_CATEGORY_LABELS,
  PRICING_ANALYSIS_LIMITS,
  isPricingAnalysisCategory,
} from '../pricing-analysis.constants';
import type { CreatePricingAnalysisInput } from '../pricing-analysis.types';

/**
 * `features/ai-pricing/prototype/web/PricingAnalysisForm.tsx`(오민혁)를 재해석했다 —
 * 문구·필드·검증 규칙은 design/high-fi.html "필수 요소 목록"의 "기본 상태 · 정확한 텍스트"를
 * 그대로 옮기되, 마크업은 시안 자체 클래스(`pricing-card` 등) 대신 shared/ui 공용 컴포넌트
 * (`Field`·`Button`)로 다시 짰다(app/web/AGENTS.md "재해석해서 일관되게 다시 짠다").
 */

export type PricingAnalysisDraft = CreatePricingAnalysisInput;
export type PricingAnalysisDraftErrors = Partial<Record<keyof PricingAnalysisDraft, string>>;

export function validatePricingAnalysisDraft(draft: PricingAnalysisDraft): PricingAnalysisDraftErrors {
  const errors: PricingAnalysisDraftErrors = {};
  const titleLength = draft.title.trim().length;
  const descriptionLength = draft.description.trim().length;
  if (titleLength < PRICING_ANALYSIS_LIMITS.titleMin) {
    errors.title = `제목을 ${PRICING_ANALYSIS_LIMITS.titleMin}자 이상 입력해 주세요.`;
  } else if (titleLength > PRICING_ANALYSIS_LIMITS.titleMax) {
    errors.title = `제목은 ${PRICING_ANALYSIS_LIMITS.titleMax}자까지 입력할 수 있습니다.`;
  }
  if (descriptionLength < PRICING_ANALYSIS_LIMITS.descriptionMin) {
    errors.description = `설명을 ${PRICING_ANALYSIS_LIMITS.descriptionMin}자 이상 입력해 주세요.`;
  } else if (descriptionLength > PRICING_ANALYSIS_LIMITS.descriptionMax) {
    errors.description = `설명은 ${PRICING_ANALYSIS_LIMITS.descriptionMax}자까지 입력할 수 있습니다.`;
  }
  if (!isPricingAnalysisCategory(draft.category)) {
    errors.category = '카테고리를 선택해 주세요.';
  }
  return errors;
}

type Props = {
  draft: PricingAnalysisDraft;
  errors: PricingAnalysisDraftErrors;
  disabled?: boolean;
  onChange: (draft: PricingAnalysisDraft) => void;
  onSubmit: () => void;
  onUseDirectInput?: () => void;
};

export function RequestForm({ draft, errors, disabled = false, onChange, onSubmit, onUseDirectInput }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const errorEntries = (
    [
      ['pricing-title', errors.title],
      ['pricing-category', errors.category],
      ['pricing-description', errors.description],
    ] as Array<[string, string | undefined]>
  ).filter((entry): entry is [string, string] => Boolean(entry[1]));

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
    const focusSummary = () => formRef.current?.querySelector<HTMLElement>('#pricing-error-summary')?.focus();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focusSummary);
    else setTimeout(focusSummary, 0);
  }

  return (
    <form ref={formRef} className="card" onSubmit={submit} noValidate aria-labelledby="request-title">
      <h2 id="request-title" tabIndex={-1}>
        분석에 사용할 프로젝트 정보
      </h2>
      <p role="note">
        <strong>추천 금액은 확정된 예산이 아닙니다.</strong> 결과에서 산정 내역을 확인하고 직접 선택합니다.
      </p>

      {errorEntries.length > 0 ? (
        <p id="pricing-error-summary" className="field-error" role="alert" tabIndex={-1}>
          입력한 내용을 확인해 주세요 — {errorEntries.map(([, message]) => message).join(' ')}
        </p>
      ) : null}

      <Field
        label="프로젝트 제목"
        id="pricing-title"
        required
        state={errors.title ? 'error' : 'default'}
        helperText="핵심 결과물이 드러나는 이름을 적어주세요."
        errorMessage={errors.title}
      >
        <input
          id="pricing-title"
          className="field"
          value={draft.title}
          minLength={PRICING_ANALYSIS_LIMITS.titleMin}
          maxLength={PRICING_ANALYSIS_LIMITS.titleMax}
          required
          disabled={disabled}
          aria-invalid={Boolean(errors.title)}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="예: 쇼핑몰 주문 관리 웹 개발"
        />
      </Field>

      <Field
        label="카테고리"
        id="pricing-category"
        required
        state={errors.category ? 'error' : 'default'}
        helperText="현재 앱에서 사용하는 6개 분야 중 하나를 선택합니다."
        errorMessage={errors.category}
      >
        <select
          id="pricing-category"
          className="field"
          value={draft.category}
          required
          disabled={disabled}
          aria-invalid={Boolean(errors.category)}
          onChange={(event) => onChange({ ...draft, category: event.target.value as PricingAnalysisDraft['category'] })}
        >
          <option value="">선택해 주세요</option>
          {PRICING_ANALYSIS_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {PRICING_ANALYSIS_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="프로젝트 설명"
        id="pricing-description"
        required
        state={errors.description ? 'error' : 'default'}
        helperText="구체적인 범위일수록 항목별 근거를 이해하기 쉽습니다."
        errorMessage={errors.description}
      >
        <textarea
          id="pricing-description"
          className="field"
          value={draft.description}
          minLength={PRICING_ANALYSIS_LIMITS.descriptionMin}
          maxLength={PRICING_ANALYSIS_LIMITS.descriptionMax}
          required
          disabled={disabled}
          rows={6}
          aria-invalid={Boolean(errors.description)}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          placeholder="필요한 기능, 결과물, 일정과 제외 범위를 구체적으로 적어주세요."
        />
      </Field>

      <div className="btn-row">
        <Button variant="primary" type="submit" loading={disabled}>
          {disabled ? '분석 중…' : '분석 요청하기'}
        </Button>
        {onUseDirectInput ? (
          <Button variant="secondary" type="button" disabled={disabled} onClick={onUseDirectInput}>
            예산 직접 입력하기
          </Button>
        ) : null}
      </div>
    </form>
  );
}
