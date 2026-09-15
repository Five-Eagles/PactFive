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
  // 2026-09-10 추가 — applications/application.controller.ts의 toHttp()와 같은 이유로 같은 날
  // 같이 고친다. 미인식 에러를 여기서 throw하면 pricing-analysis.router.ts에 자체
  // try/catch가 없어 Express async 핸들러 밖으로 새 나가고, 전역 unhandledRejection
  // handler도 없어 서버 프로세스 전체가 죽는다. 이 컨트롤러는 applications와 "같은
  // 형태"(파일 상단 주석 참고)라 같은 취약점을 그대로 갖고 있었다 — 실제로 재현된 건
  // applications 쪽(ApplicationIdempotencyKey.bodyHash 컬럼 길이 초과)이지만, 이 파일도
  // 구조가 같아서 다른 원인으로 같은 크래시가 날 수 있었다.
  console.error("[ai-pricing] 예상하지 못한 오류:", error);
  return {
    httpStatus: 500,
    body: { error: { code: "INTERNAL_ERROR", message: "예상하지 못한 오류입니다.", details: null } },
  };
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
