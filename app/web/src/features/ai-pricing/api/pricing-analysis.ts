import { http } from '../../../shared/http';
import type {
  ApplyPricingAnalysisResponse,
  CreatePricingAnalysisInput,
  PricingAnalysisResponse,
} from '../pricing-analysis.types';

/**
 * ai-pricing 공개 API 3종. 전부 `shared/http.ts`를 거친다(app/web/AGENTS.md "폴더 간 접점").
 * 경로는 `features/ai-pricing/api-contract.md`가 고정한 값 그대로다(`/api` 접두사는
 * `shared/http.ts`의 base URL이 이미 붙인다).
 *
 * `Idempotency-Key`는 이 기능에서 처음 필요해진 클라이언트 발급 헤더다 — 다른 기능은 서버가
 * 리소스 ID에서 멱등키를 유도해 헤더가 필요 없었다(`shared/http.ts`의 RequestOptions.headers
 * 참고, 2026-09-04 추가).
 */

export function createPricingAnalysis(
  input: CreatePricingAnalysisInput,
  idempotencyKey: string,
): Promise<PricingAnalysisResponse> {
  return http.post<PricingAnalysisResponse>('/v1/pricing-analyses', input, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function fetchPricingAnalysis(analysisId: string): Promise<PricingAnalysisResponse> {
  return http.get<PricingAnalysisResponse>(
    `/v1/pricing-analyses/${encodeURIComponent(analysisId)}`,
  );
}

export function applyPricingAnalysis(
  analysisId: string,
  projectId: string,
  expectedBudgetAmount: number,
  expectedProjectVersion?: number,
): Promise<ApplyPricingAnalysisResponse> {
  return http.post<ApplyPricingAnalysisResponse>(
    `/v1/pricing-analyses/${encodeURIComponent(analysisId)}/apply`,
    {
      projectId,
      expectedBudgetAmount,
      ...(expectedProjectVersion === undefined ? {} : { expectedProjectVersion }),
    },
    {
      // api-contract.md — 예산 반영은 분석 ID에서 유도되는 고정 키라 클라이언트가 회전시키지
      // 않는다(재시도해도 같은 요청으로 취급돼야 한다).
      headers: { 'Idempotency-Key': `pricing-apply-${analysisId}` },
    },
  );
}
