import { useRef, type FormEvent, type MouseEvent } from "react";
import {
  PRICING_ANALYSIS_CATEGORIES,
  PRICING_ANALYSIS_CATEGORY_LABELS,
  PRICING_ANALYSIS_LIMITS,
  isPricingAnalysisCategory,
  type PricingAnalysisCategory,
} from "../server/pricing-analysis.constants";

export type PricingAnalysisDraft = {
  title: string;
  description: string;
  category: PricingAnalysisCategory | "";
};

export type PricingAnalysisDraftErrors = Partial<Record<keyof PricingAnalysisDraft, string>>;

export function validatePricingAnalysisDraft(
  draft: PricingAnalysisDraft,
): PricingAnalysisDraftErrors {
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
    errors.category = "카테고리를 선택해 주세요.";
  }
  return errors;
}

type PricingAnalysisFormProps = {
  draft: PricingAnalysisDraft;
  errors: PricingAnalysisDraftErrors;
  disabled?: boolean;
  submitLabel?: string;
  onChange: (draft: PricingAnalysisDraft) => void;
  onSubmit: () => void;
  onUseDirectInput?: () => void;
  onBack?: () => void;
  backLabel?: string;
};

export function PricingAnalysisForm({
  draft,
  errors,
  disabled = false,
  submitLabel = "분석 요청하기",
  onChange,
  onSubmit,
  onUseDirectInput,
  onBack,
  backLabel = "프로젝트 등록으로 돌아가기",
}: PricingAnalysisFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const errorEntries = [
    ["pricing-title", errors.title],
    ["pricing-category", errors.category],
    ["pricing-description", errors.description],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  function focusField(event: MouseEvent<HTMLAnchorElement>, fieldId: string): void {
    event.preventDefault();
    formRef.current?.querySelector<HTMLElement>(`#${fieldId}`)?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
    // Parent validation updates `errors` in the next React render. Move focus on the
    // following frame so the complete summary is announced on the first invalid submit.
    const focusErrorSummary = () =>
      formRef.current?.querySelector<HTMLElement>("#pricing-error-summary")?.focus();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(focusErrorSummary);
    } else {
      setTimeout(focusErrorSummary, 0);
    }
  }

  return (
    <form ref={formRef} className="pricing-card pricing-form" onSubmit={submit} noValidate>
      <div className="pricing-card__head">
        <div>
          <p className="pricing-eyebrow">프로젝트 정보</p>
          <h2>분석에 사용할 프로젝트 정보</h2>
        </div>
        <span className="pricing-badge pricing-badge--neutral">참고용 분석</span>
      </div>

      <div className="pricing-form__guidance" role="note">
        <strong>추천 금액은 확정된 예산이 아닙니다.</strong>
        <p>결과에서 산정 내역을 확인하고 직접 선택합니다.</p>
      </div>

      {errorEntries.length > 0 ? (
        <div
          id="pricing-error-summary"
          className="pricing-error-summary"
          role="alert"
          tabIndex={-1}
        >
          <strong>입력한 내용을 확인해 주세요</strong>
          <ul>
            {errorEntries.map(([fieldId, message]) => (
              <li key={fieldId}>
                <a href={`#${fieldId}`} onClick={(event) => focusField(event, fieldId)}>
                  {message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="pricing-field" data-invalid={Boolean(errors.title)}>
        <label htmlFor="pricing-title">프로젝트 제목</label>
        <input
          id="pricing-title"
          name="title"
          value={draft.title}
          minLength={PRICING_ANALYSIS_LIMITS.titleMin}
          maxLength={PRICING_ANALYSIS_LIMITS.titleMax}
          required
          disabled={disabled}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "pricing-title-error pricing-title-help" : "pricing-title-help"}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="예: 쇼핑몰 주문 관리 웹 개발"
        />
        <div className="pricing-field__meta">
          <p id="pricing-title-help">핵심 결과물이 드러나는 이름을 적어주세요.</p>
          <span>{draft.title.length}/{PRICING_ANALYSIS_LIMITS.titleMax}</span>
        </div>
        {errors.title ? <p id="pricing-title-error" className="pricing-field__error">{errors.title}</p> : null}
      </div>

      <div className="pricing-field" data-invalid={Boolean(errors.category)}>
        <label htmlFor="pricing-category">카테고리</label>
        <select
          id="pricing-category"
          name="category"
          value={draft.category}
          required
          disabled={disabled}
          aria-invalid={Boolean(errors.category)}
          aria-describedby={errors.category ? "pricing-category-error pricing-category-help" : "pricing-category-help"}
          onChange={(event) =>
            onChange({ ...draft, category: event.target.value as PricingAnalysisDraft["category"] })
          }
        >
          <option value="">선택해 주세요</option>
          {PRICING_ANALYSIS_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {PRICING_ANALYSIS_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        <p id="pricing-category-help" className="pricing-field__help">현재 앱에서 사용하는 6개 분야 중 하나를 선택합니다.</p>
        {errors.category ? <p id="pricing-category-error" className="pricing-field__error">{errors.category}</p> : null}
      </div>

      <div className="pricing-field" data-invalid={Boolean(errors.description)}>
        <label htmlFor="pricing-description">프로젝트 설명</label>
        <textarea
          id="pricing-description"
          name="description"
          value={draft.description}
          minLength={PRICING_ANALYSIS_LIMITS.descriptionMin}
          maxLength={PRICING_ANALYSIS_LIMITS.descriptionMax}
          required
          disabled={disabled}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? "pricing-description-error pricing-description-help" : "pricing-description-help"}
          onChange={(event) => onChange({ ...draft, description: event.target.value })}
          placeholder="필요한 기능, 결과물, 일정과 제외 범위를 구체적으로 적어주세요."
        />
        <div className="pricing-field__meta">
          <p id="pricing-description-help">구체적인 범위일수록 항목별 근거를 이해하기 쉽습니다.</p>
          <span>{draft.description.length}/{PRICING_ANALYSIS_LIMITS.descriptionMax}</span>
        </div>
        {errors.description ? <p id="pricing-description-error" className="pricing-field__error">{errors.description}</p> : null}
      </div>

      <div className="pricing-actions">
        <button className="pricing-button pricing-button--primary" type="submit" disabled={disabled}>
          {disabled ? "분석 중…" : submitLabel}
        </button>
        {onUseDirectInput ? (
          <button className="pricing-button pricing-button--secondary" type="button" onClick={onUseDirectInput} disabled={disabled}>
            예산 직접 입력하기
          </button>
        ) : null}
        {onBack ? (
          <button className="pricing-button pricing-button--quiet" type="button" onClick={onBack} disabled={disabled}>
            {backLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
