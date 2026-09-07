/**
 * 새 분석 생성에만 소비되는 사용자별 rate-limit 경계다.
 * 구현체는 여러 서버 인스턴스에서도 원자적으로 한도를 판정해야 한다.
 */
export type PricingAnalysisRateLimitDecision =
  | "ALLOWED"
  | "LIMITED"
  | "IDEMPOTENCY_KEY_REUSED";

export interface PricingAnalysisRateLimitPort {
  consumeNewAnalysis(input: {
    requesterId: string;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<PricingAnalysisRateLimitDecision>;
}
