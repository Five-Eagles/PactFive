import type {
  ApplyPricingAnalysisResponse,
  CreatePricingAnalysisInput,
  PricingAnalysisApiErrorBody,
  PricingAnalysisApiErrorCode,
  PricingAnalysisResponse,
} from "../../server/pricing-analysis.types";
import {
  PRICING_ANALYSIS_CURRENCY,
  PRICING_ANALYSIS_LIMITS,
  PRICING_ANALYSIS_RESULT_LIMITS,
  isPricingAnalysisCategory,
} from "../../server/pricing-analysis.constants";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type PricingAnalysisAccessTokenProvider = () =>
  | string
  | null
  | Promise<string | null>;

let accessTokenProvider: PricingAnalysisAccessTokenProvider = () => null;

/** 앱 시작 시 기존 인증 세션의 access-token provider를 연결한다. */
export function setPricingAnalysisAccessTokenProvider(
  provider: PricingAnalysisAccessTokenProvider,
): void {
  accessTokenProvider = provider;
}

export class PricingAnalysisClientError extends Error {
  constructor(
    public readonly code: PricingAnalysisApiErrorCode | "UNKNOWN_ERROR",
    message: string,
    public readonly httpStatus: number,
    public readonly details: PricingAnalysisApiErrorBody["error"]["details"] = null,
  ) {
    super(message);
    this.name = "PricingAnalysisClientError";
  }
}

type JsonRecord = Record<string, unknown>;
type SuccessValidator<T> = (payload: unknown, httpStatus: number) => payload is T;

const ANALYSIS_FIELDS = new Set([
  "pricingAnalysisId", "reviewStatus", "inputSnapshot", "result", "failure",
  "createdAt", "reviewedAt", "appliedAt",
]);
const INPUT_FIELDS = new Set(["title", "description", "category"]);
const RECOMMENDATION_FIELDS = new Set(["recommendedAmount", "currency", "breakdown"]);
const BREAKDOWN_FIELDS = new Set(["name", "description", "amount", "rationale"]);
const FAILURE_FIELDS = new Set(["code", "message", "retryable"]);
const APPLICATION_FIELDS = new Set([
  "pricingAnalysisId", "projectId", "budgetAmount", "currency", "appliedAt",
  "processedAt", "changed", "projectVersion",
]);
const API_ERROR_BODY_FIELDS = new Set(["error"]);
const API_ERROR_FIELDS = new Set(["code", "message", "details"]);
const API_ERROR_DETAIL_FIELDS = new Set(["fields", "analysis"]);
const VALIDATION_DETAIL_FIELDS = new Set(["field", "reason"]);
const API_ERROR_CODES = new Set<PricingAnalysisApiErrorCode>([
  "MALFORMED_JSON", "INVALID_PRICING_ANALYSIS_ID", "INVALID_PROJECT_ID", "AUTH_REQUIRED",
  "PRICING_ANALYSIS_ROLE_REQUIRED", "VALIDATION_ERROR", "INVALID_CATEGORY",
  "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_KEY_REUSED", "PRICING_ANALYSIS_NOT_FOUND",
  "PRICING_ANALYSIS_TIMEOUT", "PRICING_ANALYSIS_PROVIDER_FAILED",
  "PRICING_ANALYSIS_INVALID_RESULT", "PRICING_ANALYZER_UNAVAILABLE",
  "PRICING_ANALYSIS_RATE_LIMITED", "PRICING_ANALYSIS_RATE_LIMIT_UNAVAILABLE",
  "PRICING_ANALYSIS_STORAGE_FAILED", "PROJECT_NOT_FOUND", "PROJECT_FORBIDDEN",
  "PRICING_ANALYSIS_NOT_APPROVED", "PRICING_ANALYSIS_ALREADY_APPLIED", "PROJECT_EDIT_LOCKED",
  "PROJECT_EDIT_CLOSED", "PROJECT_VERSION_CONFLICT", "PROJECT_BUDGET_CONFLICT",
  "PRICING_APPLICATION_UNAVAILABLE", "PRICING_APPLICATION_STORAGE_FAILED",
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: JsonRecord, keys: ReadonlySet<string>): boolean {
  const ownKeys = Object.keys(value);
  return ownKeys.length === keys.size && ownKeys.every((key) => keys.has(key));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function isPositiveAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 1 && value <= PRICING_ANALYSIS_RESULT_LIMITS.amountMax;
}

function isRecommendation(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, RECOMMENDATION_FIELDS)) return false;
  if (
    value.currency !== PRICING_ANALYSIS_CURRENCY ||
    !isPositiveAmount(value.recommendedAmount) ||
    !Array.isArray(value.breakdown) ||
    value.breakdown.length < PRICING_ANALYSIS_RESULT_LIMITS.breakdownMin ||
    value.breakdown.length > PRICING_ANALYSIS_RESULT_LIMITS.breakdownMax
  ) return false;
  let sum = 0;
  for (const item of value.breakdown) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, BREAKDOWN_FIELDS) ||
      typeof item.name !== "string" || !item.name.trim() ||
      item.name.trim().length > PRICING_ANALYSIS_RESULT_LIMITS.nameMax ||
      typeof item.description !== "string" || !item.description.trim() ||
      item.description.trim().length > PRICING_ANALYSIS_RESULT_LIMITS.descriptionMax ||
      typeof item.rationale !== "string" || !item.rationale.trim() ||
      item.rationale.trim().length > PRICING_ANALYSIS_RESULT_LIMITS.rationaleMax ||
      !isPositiveAmount(item.amount)
    ) return false;
    sum += item.amount;
    if (!Number.isSafeInteger(sum) || sum > PRICING_ANALYSIS_RESULT_LIMITS.amountMax) return false;
  }
  return sum === value.recommendedAmount;
}

function isInputSnapshot(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, INPUT_FIELDS)) return false;
  if (typeof value.title !== "string" || typeof value.description !== "string") return false;
  const title = value.title.trim();
  const description = value.description.trim();
  return value.title === title &&
    title.length >= PRICING_ANALYSIS_LIMITS.titleMin &&
    title.length <= PRICING_ANALYSIS_LIMITS.titleMax &&
    value.description === description &&
    description.length >= PRICING_ANALYSIS_LIMITS.descriptionMin &&
    description.length <= PRICING_ANALYSIS_LIMITS.descriptionMax &&
    isPricingAnalysisCategory(value.category);
}

function isPublicFailure(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, FAILURE_FIELDS)) return false;
  return [
    "PRICING_ANALYSIS_PROVIDER_FAILED",
    "PRICING_ANALYSIS_TIMEOUT",
    "PRICING_ANALYSIS_INVALID_RESULT",
  ].includes(String(value.code)) &&
    typeof value.message === "string" && value.message.length > 0 && value.message.length <= 500 &&
    typeof value.retryable === "boolean";
}

export function isPricingAnalysisResponse(payload: unknown): payload is PricingAnalysisResponse {
  if (!isRecord(payload) || !hasExactKeys(payload, ANALYSIS_FIELDS)) return false;
  if (
    typeof payload.pricingAnalysisId !== "string" ||
    !/^pra_[A-Za-z0-9_-]+$/.test(payload.pricingAnalysisId) ||
    !isInputSnapshot(payload.inputSnapshot) ||
    !isTimestamp(payload.createdAt) ||
    !(payload.appliedAt === null || isTimestamp(payload.appliedAt))
  ) return false;
  if (payload.reviewStatus === "PENDING") {
    return payload.result === null && payload.failure === null &&
      payload.reviewedAt === null && payload.appliedAt === null;
  }
  if (payload.reviewStatus === "APPROVED") {
    return isRecommendation(payload.result) && payload.failure === null && isTimestamp(payload.reviewedAt);
  }
  if (payload.reviewStatus === "REJECTED") {
    return payload.result === null && isPublicFailure(payload.failure) &&
      isTimestamp(payload.reviewedAt) && payload.appliedAt === null;
  }
  return false;
}

export function isApplyPricingAnalysisResponse(
  payload: unknown,
): payload is ApplyPricingAnalysisResponse {
  return isRecord(payload) &&
    hasExactKeys(payload, APPLICATION_FIELDS) &&
    typeof payload.pricingAnalysisId === "string" &&
    /^pra_[A-Za-z0-9_-]+$/.test(payload.pricingAnalysisId) &&
    typeof payload.projectId === "string" &&
    /^prj_[A-Za-z0-9_-]+$/.test(payload.projectId) &&
    isPositiveAmount(payload.budgetAmount) &&
    payload.currency === PRICING_ANALYSIS_CURRENCY &&
    isTimestamp(payload.appliedAt) &&
    isTimestamp(payload.processedAt) &&
    payload.changed === true &&
    typeof payload.projectVersion === "number" &&
    Number.isSafeInteger(payload.projectVersion) && payload.projectVersion >= 0;
}

function safeApiError(payload: unknown): {
  code: PricingAnalysisApiErrorCode;
  message: string;
  details: PricingAnalysisApiErrorBody["error"]["details"];
} | null {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, API_ERROR_BODY_FIELDS) ||
    !isRecord(payload.error) ||
    !hasExactKeys(payload.error, API_ERROR_FIELDS)
  ) return null;
  const { code, message, details } = payload.error;
  if (
    typeof code !== "string" ||
    !API_ERROR_CODES.has(code as PricingAnalysisApiErrorCode) ||
    typeof message !== "string" || !message || message.length > 500 ||
    !(details === null || isRecord(details))
  ) return null;
  let safeDetails: PricingAnalysisApiErrorBody["error"]["details"] = null;
  if (isRecord(details)) {
    if (Object.keys(details).some((key) => !API_ERROR_DETAIL_FIELDS.has(key))) return null;
    if (
      "fields" in details &&
      (!Array.isArray(details.fields) ||
        details.fields.length > 20 ||
        details.fields.some((item) =>
          !isRecord(item) ||
          !hasExactKeys(item, VALIDATION_DETAIL_FIELDS) ||
          typeof item.field !== "string" || !item.field || item.field.length > 100 ||
          !["required", "too_short", "too_long", "invalid"].includes(String(item.reason))))
    ) return null;
    if (
      "analysis" in details &&
      (!isPricingAnalysisResponse(details.analysis) ||
        details.analysis.reviewStatus !== "REJECTED" ||
        details.analysis.failure.code !== code)
    ) return null;
    safeDetails = {
      ...("fields" in details ? { fields: details.fields as NonNullable<typeof safeDetails>["fields"] } : {}),
      ...("analysis" in details ? { analysis: details.analysis as PricingAnalysisResponse } : {}),
    };
  }
  return {
    code: code as PricingAnalysisApiErrorCode,
    message,
    details: safeDetails,
  };
}

async function parseResponse<T>(
  response: Response,
  validateSuccess: SuccessValidator<T>,
): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // 응답 원문은 사용자에게 노출하지 않는다.
  }
  if (!response.ok) {
    const error = safeApiError(payload);
    throw new PricingAnalysisClientError(
      error?.code ?? "UNKNOWN_ERROR",
      error?.message ?? "요청을 처리하지 못했습니다.",
      response.status,
      error?.details ?? null,
    );
  }
  if (!validateSuccess(payload, response.status)) {
    throw new PricingAnalysisClientError(
      "UNKNOWN_ERROR",
      "서버 응답을 확인하지 못했습니다.",
      response.status,
    );
  }
  return payload;
}

async function authorizationHeaders(
  provider: PricingAnalysisAccessTokenProvider,
): Promise<Record<string, string>> {
  const token = await provider();
  if (!token) {
    throw new PricingAnalysisClientError("AUTH_REQUIRED", "로그인이 필요합니다.", 401);
  }
  return { Authorization: `Bearer ${token}` };
}

export type PricingAnalysisApiClient = {
  create(
    input: CreatePricingAnalysisInput,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<PricingAnalysisResponse>;
  get(analysisId: string, signal?: AbortSignal): Promise<PricingAnalysisResponse>;
  apply(
    analysisId: string,
    projectId: string,
    expectedBudgetAmount: number,
    expectedProjectVersion?: number,
    signal?: AbortSignal,
  ): Promise<ApplyPricingAnalysisResponse>;
};

export function createPricingAnalysisApiClient(
  fetchImpl: FetchLike = globalThis.fetch.bind(globalThis),
  tokenProvider?: PricingAnalysisAccessTokenProvider,
): PricingAnalysisApiClient {
  // 인스턴스 생성 뒤 앱이 provider를 연결해도 반영되도록 기본 provider는 호출 시점에 읽는다.
  const getToken: PricingAnalysisAccessTokenProvider = tokenProvider ?? (() => accessTokenProvider());
  return {
    async create(input, idempotencyKey, signal) {
      const authHeaders = await authorizationHeaders(getToken);
      const response = await fetchImpl("/api/v1/pricing-analyses", {
        method: "POST",
        credentials: "include",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(input),
        signal,
      });
      return parseResponse<PricingAnalysisResponse>(response, (payload, status): payload is PricingAnalysisResponse =>
        isPricingAnalysisResponse(payload) &&
        ((status === 202 && payload.reviewStatus === "PENDING") ||
          ((status === 200 || status === 201) && payload.reviewStatus === "APPROVED")),
      );
    },
    async get(analysisId, signal) {
      const authHeaders = await authorizationHeaders(getToken);
      const response = await fetchImpl(
        `/api/v1/pricing-analyses/${encodeURIComponent(analysisId)}`,
        { method: "GET", credentials: "include", headers: authHeaders, signal },
      );
      return parseResponse<PricingAnalysisResponse>(response, (payload, status): payload is PricingAnalysisResponse =>
        status === 200 && isPricingAnalysisResponse(payload) &&
        payload.pricingAnalysisId === analysisId,
      );
    },
    async apply(analysisId, projectId, expectedBudgetAmount, expectedProjectVersion, signal) {
      const authHeaders = await authorizationHeaders(getToken);
      const response = await fetchImpl(
        `/api/v1/pricing-analyses/${encodeURIComponent(analysisId)}/apply`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
            "Idempotency-Key": `pricing-apply-${analysisId}`,
          },
          body: JSON.stringify({
            projectId,
            expectedBudgetAmount,
            ...(expectedProjectVersion === undefined ? {} : { expectedProjectVersion }),
          }),
          signal,
        },
      );
      return parseResponse<ApplyPricingAnalysisResponse>(response, (payload, status): payload is ApplyPricingAnalysisResponse =>
        status === 200 && isApplyPricingAnalysisResponse(payload) &&
        payload.pricingAnalysisId === analysisId && payload.projectId === projectId,
      );
    },
  };
}

export const pricingAnalysisApi = createPricingAnalysisApiClient();
