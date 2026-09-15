/**
 * app/server/src/features/ai-pricing/pricing-analysis.constants.ts 의 프론트 쪽 사본이다.
 * 기능 폴더끼리 import하지 않으므로(app/web/AGENTS.md "폴더 간 접점") 화면이 필요로 하는
 * 값(카테고리 6종·라벨·글자수 제한)만 그대로 복제한다 — 다른 기능(project-management의
 * project.types.ts 등)도 같은 방식이다.
 */
export const PRICING_ANALYSIS_CATEGORIES = [
  'WEB_DEVELOPMENT',
  'MOBILE_APP',
  'DESIGN',
  'DATA_AI',
  'PLANNING',
  'MARKETING',
] as const;

export type PricingAnalysisCategory = (typeof PRICING_ANALYSIS_CATEGORIES)[number];

export const PRICING_ANALYSIS_CATEGORY_LABELS: Record<PricingAnalysisCategory, string> = {
  WEB_DEVELOPMENT: '웹 개발',
  MOBILE_APP: '모바일 앱',
  DESIGN: '디자인',
  DATA_AI: '데이터·AI',
  PLANNING: '기획',
  MARKETING: '마케팅',
};

const CATEGORY_SET = new Set<string>(PRICING_ANALYSIS_CATEGORIES);

export function isPricingAnalysisCategory(value: unknown): value is PricingAnalysisCategory {
  return typeof value === 'string' && CATEGORY_SET.has(value);
}

export const PRICING_ANALYSIS_LIMITS = {
  titleMin: 5,
  titleMax: 100,
  descriptionMin: 20,
  descriptionMax: 5_000,
} as const;
