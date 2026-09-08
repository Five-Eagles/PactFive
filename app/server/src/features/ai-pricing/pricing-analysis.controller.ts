import {
  applyPricingAnalysis,
  createPricingAnalysis,
  getPricingAnalysis,
  type PricingAnalysisServiceDeps,
} from "./pricing-analysis.service";
import {
  PricingAnalysisApiError,
  isPricingAnalysisApiError,
  type ApplyPricingAnalysisInput,
  type CreatePricingAnalysisInput,
  type PricingAnalysisActor,
} from "./pricing-analysis.types";

export type PricingAnalysisHttpResult = { httpStatus: number; body: unknown };

/** Express JSON parser의 SyntaxError를 이 안전한 공용 계약으로 매핑할 때도 같은 코드를 사용한다. */
export function parsePricingAnalysisJsonBody(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new PricingAnalysisApiError("MALFORMED_JSON", "JSON 요청 본문이 올바르지 않습니다.");
  }
}

function toHttp(error: unknown): PricingAnalysisHttpResult {
  if (isPricingAnalysisApiError(error)) {
    return { httpStatus: error.httpStatus, body: error.body };
  }
  throw error;
}

/** HTTP 프레임워크와 무관한 controller 초안이다. */
export function createPricingAnalysisController(deps: PricingAnalysisServiceDeps) {
  return {
    async create(
      actor: PricingAnalysisActor | undefined,
      input: CreatePricingAnalysisInput,
      idempotencyKey: string | undefined,
    ): Promise<PricingAnalysisHttpResult> {
      try {
        const result = await createPricingAnalysis(deps, actor, input, idempotencyKey);
        return { httpStatus: result.httpStatus, body: result.body };
      } catch (error) {
        return toHttp(error);
      }
    },
    async get(
      actor: PricingAnalysisActor | undefined,
      analysisId: string,
    ): Promise<PricingAnalysisHttpResult> {
      try {
        return { httpStatus: 200, body: await getPricingAnalysis(deps, actor, analysisId) };
      } catch (error) {
        return toHttp(error);
      }
    },
    async apply(
      actor: PricingAnalysisActor | undefined,
      analysisId: string,
      input: ApplyPricingAnalysisInput,
      idempotencyKey: string | undefined,
    ): Promise<PricingAnalysisHttpResult> {
      try {
        return {
          httpStatus: 200,
          body: await applyPricingAnalysis(deps, actor, analysisId, input, idempotencyKey),
        };
      } catch (error) {
        return toHttp(error);
      }
    },
  };
}
