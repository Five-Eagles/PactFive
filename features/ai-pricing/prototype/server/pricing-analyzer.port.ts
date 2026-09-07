import type { PricingAnalysisInputSnapshot } from "./pricing-analysis.types";

export type PricingAnalyzerErrorKind = "TIMEOUT" | "UNAVAILABLE" | "INVALID_RESPONSE";

/** 공급자 원문이나 요청 비밀을 보관하지 않는 안전한 경계 오류다. */
export class PricingAnalyzerError extends Error {
  constructor(public readonly kind: PricingAnalyzerErrorKind) {
    super("단가 분석 공급자 호출에 실패했습니다.");
    this.name = "PricingAnalyzerError";
  }
}

/** 서비스 계층에는 OpenAI 요청/응답 타입을 노출하지 않는다. */
export interface PricingAnalyzerPort {
  readonly model: string;
  readonly configured: boolean;
  analyze(input: PricingAnalysisInputSnapshot): Promise<unknown>;
}
