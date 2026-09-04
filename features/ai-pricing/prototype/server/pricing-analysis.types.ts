import type { PricingAnalysisCategory } from "./pricing-analysis.constants";

export type PricingAnalysisReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

/** project-management가 연 트랜잭션을 그대로 전달한다. ai-pricing은 열거나 commit하지 않는다. */
export type TransactionContext = { readonly id: string };

export type ClaimPricingAnalysisInput = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};

export type ClaimPricingAnalysisResult = {
  recommendedAmount: number;
};

export type PricingRecommendationQuery = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};

export type PricingAnalysisContractErrorCode =
  | "PRICING_ANALYSIS_NOT_CLAIMABLE"
  | "PRICING_ANALYSIS_NOT_APPLICABLE";

export class PricingAnalysisContractError extends Error {
  constructor(
    public readonly code: PricingAnalysisContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PricingAnalysisContractError";
  }
}

export type PricingAnalysisActor = {
  userId?: string;
  role?: string;
};

export type PricingAnalysisInputSnapshot = {
  title: string;
  description: string;
  category: PricingAnalysisCategory;
};

export type CreatePricingAnalysisInput = {
  title: unknown;
  description: unknown;
  category: unknown;
};

export type PricingAnalysisBreakdownItem = {
  name: string;
  description: string;
  amount: number;
  rationale: string;
};

export type PricingAnalysisRecommendation = {
  recommendedAmount: number;
  currency: "KRW";
  breakdown: PricingAnalysisBreakdownItem[];
};

export type PricingAnalysisFailureCode =
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_PROVIDER_RESPONSE";

export type PricingAnalysisPublicFailure = {
  code:
    | "PRICING_ANALYSIS_PROVIDER_FAILED"
    | "PRICING_ANALYSIS_TIMEOUT"
    | "PRICING_ANALYSIS_INVALID_RESULT";
  message: string;
  retryable: boolean;
};

export type PricingAnalysisRow = {
  analysisId: string;
  requesterId: string;
  inputSnapshot: PricingAnalysisInputSnapshot;
  requestFingerprint: string;
  /** requestFingerprint를 재검증할 때 사용할 create-input 정규화/해시 스키마 버전. */
  inputSchemaVersion: string;
  idempotencyKey: string;
  reviewStatus: PricingAnalysisReviewStatus;
  /**
   * 현 ERD는 결과 컬럼을 NOT NULL로 두면서 PENDING/REJECTED 행 저장을 요구한다.
   * Step 2 프로토타입은 실제 상태 전이를 표현하기 위해 결과를 nullable로 둔다.
   * 통합 전 ERD를 상태별 조건부 제약으로 정정해야 한다.
   */
  result: PricingAnalysisRecommendation | null;
  failureCode: PricingAnalysisFailureCode | null;
  /** 최초 terminal 오류 응답을 이후 문구 변경과 무관하게 exact replay하기 위한 불변 사본. */
  failureSnapshot: PricingAnalysisPublicFailure | null;
  failureHttpStatus: 502 | 504 | null;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  projectId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  appliedAt: string | null;
};

type PricingAnalysisResponseBase = {
  pricingAnalysisId: string;
  inputSnapshot: PricingAnalysisInputSnapshot;
  createdAt: string;
  reviewedAt: string | null;
  appliedAt: string | null;
};

export type PricingAnalysisResponse =
  | (PricingAnalysisResponseBase & {
      reviewStatus: "PENDING";
      result: null;
      failure: null;
      reviewedAt: null;
    })
  | (PricingAnalysisResponseBase & {
      reviewStatus: "APPROVED";
      result: PricingAnalysisRecommendation;
      failure: null;
      reviewedAt: string;
    })
  | (PricingAnalysisResponseBase & {
      reviewStatus: "REJECTED";
      result: null;
      failure: PricingAnalysisPublicFailure;
      reviewedAt: string;
    });

export type CreatePricingAnalysisResult = {
  httpStatus: 200 | 201 | 202;
  body: PricingAnalysisResponse;
};

export type ApplyPricingAnalysisInput = {
  projectId: unknown;
  expectedBudgetAmount: unknown;
  expectedProjectVersion?: unknown;
};

export type ApplyPricingAnalysisResponse = {
  pricingAnalysisId: string;
  projectId: string;
  budgetAmount: number;
  currency: "KRW";
  appliedAt: string;
  processedAt: string;
  changed: true;
  projectVersion: number;
};

export type PricingAnalysisValidationDetail = {
  field: string;
  reason: "required" | "too_short" | "too_long" | "invalid";
};

export type PricingAnalysisApiErrorCode =
  | "MALFORMED_JSON"
  | "INVALID_PRICING_ANALYSIS_ID"
  | "INVALID_PROJECT_ID"
  | "AUTH_REQUIRED"
  | "PRICING_ANALYSIS_ROLE_REQUIRED"
  | "VALIDATION_ERROR"
  | "INVALID_CATEGORY"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "PRICING_ANALYSIS_NOT_FOUND"
  | "PRICING_ANALYSIS_TIMEOUT"
  | "PRICING_ANALYSIS_PROVIDER_FAILED"
  | "PRICING_ANALYSIS_INVALID_RESULT"
  | "PRICING_ANALYZER_UNAVAILABLE"
  | "PRICING_ANALYSIS_RATE_LIMITED"
  | "PRICING_ANALYSIS_RATE_LIMIT_UNAVAILABLE"
  | "PRICING_ANALYSIS_STORAGE_FAILED"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_FORBIDDEN"
  | "PRICING_ANALYSIS_NOT_APPROVED"
  | "PRICING_ANALYSIS_ALREADY_APPLIED"
  | "PROJECT_EDIT_LOCKED"
  | "PROJECT_EDIT_CLOSED"
  | "PROJECT_VERSION_CONFLICT"
  | "PROJECT_BUDGET_CONFLICT"
  | "PRICING_APPLICATION_UNAVAILABLE"
  | "PRICING_APPLICATION_STORAGE_FAILED";

export type PricingAnalysisApiErrorBody = {
  error: {
    code: PricingAnalysisApiErrorCode;
    message: string;
    details: null | {
      fields?: PricingAnalysisValidationDetail[];
      analysis?: PricingAnalysisResponse;
    };
  };
};

const HTTP_BY_API_ERROR: Record<
  PricingAnalysisApiErrorCode,
  400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504
> = {
  MALFORMED_JSON: 400,
  INVALID_PRICING_ANALYSIS_ID: 400,
  INVALID_PROJECT_ID: 400,
  AUTH_REQUIRED: 401,
  PRICING_ANALYSIS_ROLE_REQUIRED: 403,
  VALIDATION_ERROR: 422,
  INVALID_CATEGORY: 422,
  IDEMPOTENCY_KEY_REQUIRED: 422,
  IDEMPOTENCY_KEY_REUSED: 409,
  PRICING_ANALYSIS_NOT_FOUND: 404,
  PRICING_ANALYSIS_TIMEOUT: 504,
  PRICING_ANALYSIS_PROVIDER_FAILED: 502,
  PRICING_ANALYSIS_INVALID_RESULT: 502,
  PRICING_ANALYZER_UNAVAILABLE: 503,
  PRICING_ANALYSIS_RATE_LIMITED: 429,
  PRICING_ANALYSIS_RATE_LIMIT_UNAVAILABLE: 503,
  PRICING_ANALYSIS_STORAGE_FAILED: 500,
  PROJECT_NOT_FOUND: 404,
  PROJECT_FORBIDDEN: 403,
  PRICING_ANALYSIS_NOT_APPROVED: 409,
  PRICING_ANALYSIS_ALREADY_APPLIED: 409,
  PROJECT_EDIT_LOCKED: 409,
  PROJECT_EDIT_CLOSED: 409,
  PROJECT_VERSION_CONFLICT: 409,
  PROJECT_BUDGET_CONFLICT: 409,
  PRICING_APPLICATION_UNAVAILABLE: 503,
  PRICING_APPLICATION_STORAGE_FAILED: 500,
};

export class PricingAnalysisApiError extends Error {
  readonly httpStatus: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 502 | 503 | 504;
  readonly body: PricingAnalysisApiErrorBody;

  constructor(
    code: PricingAnalysisApiErrorCode,
    message: string,
    details: PricingAnalysisApiErrorBody["error"]["details"] = null,
    replayHttpStatus?: 502 | 504,
  ) {
    super(message);
    this.name = "PricingAnalysisApiError";
    this.httpStatus = replayHttpStatus ?? HTTP_BY_API_ERROR[code];
    this.body = { error: { code, message, details } };
  }
}

export function isPricingAnalysisApiError(error: unknown): error is PricingAnalysisApiError {
  return error instanceof PricingAnalysisApiError;
}
