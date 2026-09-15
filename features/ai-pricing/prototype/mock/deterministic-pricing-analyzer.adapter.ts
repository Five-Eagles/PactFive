import {
  PricingAnalyzerError,
  type PricingAnalyzerPort,
} from "../server/pricing-analyzer.port";
import type {
  PricingAnalysisInputSnapshot,
  PricingAnalysisRecommendation,
} from "../server/pricing-analysis.types";

const DEFAULT_RESULT: PricingAnalysisRecommendation = {
  recommendedAmount: 1_500_000,
  currency: "KRW",
  breakdown: [
    {
      name: "기획 및 설계",
      description: "요구사항 정리와 화면·기술 설계",
      amount: 300_000,
      rationale: "전체 범위의 약 20%를 초기 설계에 배정했습니다.",
    },
    {
      name: "핵심 구현",
      description: "주요 기능 개발과 데이터 연동",
      amount: 900_000,
      rationale: "핵심 개발 난이도와 작업량을 반영했습니다.",
    },
    {
      name: "검증 및 인수",
      description: "테스트, 수정, 전달 문서 작성",
      amount: 300_000,
      rationale: "품질 검증과 인수 대응 범위를 반영했습니다.",
    },
  ],
};

function cloneResult(result: PricingAnalysisRecommendation): PricingAnalysisRecommendation {
  return {
    ...result,
    breakdown: result.breakdown.map((item) => ({ ...item })),
  };
}

type QueuedOutcome = PricingAnalysisRecommendation | PricingAnalyzerError;

/** 키와 네트워크 없이 결정적으로 동작하는 테스트용 analyzer다. */
export class DeterministicPricingAnalyzer implements PricingAnalyzerPort {
  readonly model = "mock-pricing-model-v1";
  readonly configured = true;
  private readonly calls: PricingAnalysisInputSnapshot[] = [];
  private readonly outcomes: QueuedOutcome[] = [];

  constructor(private defaultResult: PricingAnalysisRecommendation = DEFAULT_RESULT) {}

  enqueueResult(result: PricingAnalysisRecommendation): void {
    this.outcomes.push(cloneResult(result));
  }

  enqueueError(kind: PricingAnalyzerError["kind"]): void {
    this.outcomes.push(new PricingAnalyzerError(kind));
  }

  setDefaultResult(result: PricingAnalysisRecommendation): void {
    this.defaultResult = cloneResult(result);
  }

  async analyze(
    input: PricingAnalysisInputSnapshot,
  ): Promise<PricingAnalysisRecommendation> {
    this.calls.push({ ...input });
    const outcome = this.outcomes.shift() ?? this.defaultResult;
    if (outcome instanceof PricingAnalyzerError) throw outcome;
    return cloneResult(outcome);
  }

  getCalls(): PricingAnalysisInputSnapshot[] {
    return this.calls.map((input) => ({ ...input }));
  }
}

export function createDeterministicRecommendation(): PricingAnalysisRecommendation {
  return cloneResult(DEFAULT_RESULT);
}
