export const PRICING_ANALYSIS_CATEGORIES = [
  "WEB_DEVELOPMENT",
  "MOBILE_APP",
  "DESIGN",
  "DATA_AI",
  "PLANNING",
  "MARKETING",
] as const;

export type PricingAnalysisCategory = (typeof PRICING_ANALYSIS_CATEGORIES)[number];

export const PRICING_ANALYSIS_CATEGORY_LABELS: Record<PricingAnalysisCategory, string> = {
  WEB_DEVELOPMENT: "웹 개발",
  MOBILE_APP: "모바일 앱",
  DESIGN: "디자인",
  DATA_AI: "데이터·AI",
  PLANNING: "기획",
  MARKETING: "마케팅",
};

// 현재 앱 런타임의 6종을 정본으로 사용한다. PRD/ERD의 APP_DEVELOPMENT·ETC와의
// 불일치는 통합 전에 문서에서 해소해야 하며, 여기서 별도 별칭을 조용히 허용하지 않는다.
const CATEGORY_SET = new Set<string>(PRICING_ANALYSIS_CATEGORIES);

export function isPricingAnalysisCategory(value: unknown): value is PricingAnalysisCategory {
  return typeof value === "string" && CATEGORY_SET.has(value);
}

export const PRICING_ANALYSIS_LIMITS = {
  titleMin: 5,
  titleMax: 100,
  descriptionMin: 20,
  descriptionMax: 5_000,
  idempotencyKeyMin: 8,
  idempotencyKeyMax: 100,
} as const;

export const PRICING_ANALYSIS_RESULT_LIMITS = {
  breakdownMin: 1,
  breakdownMax: 20,
  nameMax: 100,
  descriptionMax: 500,
  rationaleMax: 1_000,
  amountMax: 2_147_483_647,
  maxOutputTokens: 2_000,
} as const;

export function isValidPricingIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^[\x21-\x7E]{8,100}$/.test(value);
}

export const PRICING_ANALYSIS_PROMPT_VERSION = "pricing-analysis-v1";
// 제안된 input_fingerprint_schema_version varchar(20)에 맞춘 영속 코드다.
export const PRICING_ANALYSIS_INPUT_SCHEMA_VERSION = "pricing-input-v1";
export const PRICING_APPLICATION_INPUT_SCHEMA_VERSION = "pricing-analysis-application-v1";
// 현재 ERD의 result_schema_version varchar(20)에 맞춘다.
export const PRICING_ANALYSIS_SCHEMA_VERSION = "pricing-result-v1";
export const PRICING_ANALYSIS_CURRENCY = "KRW" as const;
