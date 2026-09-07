import { createHash } from "node:crypto";
import {
  PRICING_ANALYSIS_CURRENCY,
  PRICING_ANALYSIS_INPUT_SCHEMA_VERSION,
  PRICING_ANALYSIS_LIMITS,
  PRICING_ANALYSIS_PROMPT_VERSION,
  PRICING_ANALYSIS_RESULT_LIMITS,
  PRICING_ANALYSIS_SCHEMA_VERSION,
  PRICING_APPLICATION_INPUT_SCHEMA_VERSION,
  isPricingAnalysisCategory,
  isValidPricingIdempotencyKey,
} from "./pricing-analysis.constants";
import type { PricingAnalysisRepository } from "./pricing-analysis.repository";
import type { PricingAnalysisRateLimitPort } from "./pricing-analysis-rate-limit.port";
import {
  PricingAnalyzerError,
  type PricingAnalyzerPort,
} from "./pricing-analyzer.port";
import {
  ProjectBudgetApplicationError,
  type ProjectBudgetApplicationPort,
} from "./project-budget-application.port";
import {
  PricingAnalysisApiError,
  type ApplyPricingAnalysisInput,
  type ApplyPricingAnalysisResponse,
  type CreatePricingAnalysisInput,
  type CreatePricingAnalysisResult,
  type PricingAnalysisActor,
  type PricingAnalysisFailureCode,
  type PricingAnalysisInputSnapshot,
  type PricingAnalysisPublicFailure,
  type PricingAnalysisRecommendation,
  type PricingAnalysisResponse,
  type PricingAnalysisRow,
  type PricingAnalysisValidationDetail,
} from "./pricing-analysis.types";

const CREATE_FIELDS = new Set(["title", "description", "category"]);
const APPLY_FIELDS = new Set(["projectId", "expectedBudgetAmount", "expectedProjectVersion"]);
const RECOMMENDATION_FIELDS = new Set(["recommendedAmount", "currency", "breakdown"]);
const BREAKDOWN_ITEM_FIELDS = new Set(["name", "description", "amount", "rationale"]);
const PUBLIC_FAILURE_FIELDS = new Set(["code", "message", "retryable"]);
const STORED_FAILURE_CODES = new Set<PricingAnalysisFailureCode>([
  "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "INVALID_PROVIDER_RESPONSE",
]);
const APPLICATION_RESPONSE_FIELDS = new Set([
  "pricingAnalysisId", "projectId", "budgetAmount", "currency", "appliedAt",
  "processedAt", "changed", "projectVersion",
]);

export type PricingAnalysisServiceDeps = {
  repository: PricingAnalysisRepository;
  analyzer: PricingAnalyzerPort;
  rateLimit?: PricingAnalysisRateLimitPort;
  projectBudgetApplication?: ProjectBudgetApplicationPort;
  now: () => string;
  nextAnalysisId: () => string;
};

function requireClient(actor: PricingAnalysisActor | undefined): string {
  if (!actor?.userId) {
    throw new PricingAnalysisApiError("AUTH_REQUIRED", "로그인이 필요합니다.");
  }
  if (actor.role !== "CLIENT") {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_ROLE_REQUIRED",
      "의뢰인 계정만 AI 단가 분석을 이용할 수 있습니다.",
    );
  }
  return actor.userId;
}

function ownKeys(value: unknown): string[] {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value)
    : [];
}

export function validatePricingAnalysisInput(
  input: CreatePricingAnalysisInput,
): PricingAnalysisValidationDetail[] {
  const details: PricingAnalysisValidationDetail[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return [{ field: "body", reason: "invalid" }];
  }
  for (const field of ownKeys(input)) {
    if (!CREATE_FIELDS.has(field)) details.push({ field, reason: "invalid" });
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (!title) details.push({ field: "title", reason: "required" });
  else if (title.length < PRICING_ANALYSIS_LIMITS.titleMin) {
    details.push({ field: "title", reason: "too_short" });
  } else if (title.length > PRICING_ANALYSIS_LIMITS.titleMax) {
    details.push({ field: "title", reason: "too_long" });
  }
  if (!description) details.push({ field: "description", reason: "required" });
  else if (description.length < PRICING_ANALYSIS_LIMITS.descriptionMin) {
    details.push({ field: "description", reason: "too_short" });
  } else if (description.length > PRICING_ANALYSIS_LIMITS.descriptionMax) {
    details.push({ field: "description", reason: "too_long" });
  }
  return details;
}

export function normalizePricingAnalysisInput(
  input: CreatePricingAnalysisInput,
): PricingAnalysisInputSnapshot {
  return {
    title: (input.title as string).trim(),
    description: (input.description as string).trim(),
    category: input.category as PricingAnalysisInputSnapshot["category"],
  };
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function fingerprintPricingAnalysisInput(
  requesterId: string,
  input: PricingAnalysisInputSnapshot,
  inputSchemaVersion = PRICING_ANALYSIS_INPUT_SCHEMA_VERSION,
): string {
  return hash({
    operation: "CREATE_PRICING_ANALYSIS",
    requesterId,
    schemaVersion: inputSchemaVersion,
    input: {
      category: input.category,
      description: input.description,
      title: input.title,
    },
  });
}

export function fingerprintPricingAnalysisApplication(
  requesterId: string,
  analysisId: string,
  projectId: string,
  expectedBudgetAmount: number,
  expectedProjectVersion: number | null,
): string {
  return hash({
    operation: "APPLY_PRICING_ANALYSIS",
    requesterId,
    analysisId,
    schemaVersion: PRICING_APPLICATION_INPUT_SCHEMA_VERSION,
    body: { expectedBudgetAmount, expectedProjectVersion, projectId },
  });
}

function cloneRecommendation(result: PricingAnalysisRecommendation): PricingAnalysisRecommendation {
  return {
    recommendedAmount: result.recommendedAmount,
    currency: result.currency,
    breakdown: result.breakdown.map((item) => ({
      name: item.name.trim(),
      description: item.description.trim(),
      amount: item.amount,
      rationale: item.rationale.trim(),
    })),
  };
}

export function validatePricingRecommendation(
  value: unknown,
): value is PricingAnalysisRecommendation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (ownKeys(value).some((field) => !RECOMMENDATION_FIELDS.has(field))) return false;
  const result = value as Partial<PricingAnalysisRecommendation>;
  if (
    result.currency !== PRICING_ANALYSIS_CURRENCY ||
    typeof result.recommendedAmount !== "number" ||
    !Number.isSafeInteger(result.recommendedAmount) ||
    result.recommendedAmount < 1 ||
    result.recommendedAmount > PRICING_ANALYSIS_RESULT_LIMITS.amountMax ||
    !Array.isArray(result.breakdown) ||
    result.breakdown.length < PRICING_ANALYSIS_RESULT_LIMITS.breakdownMin ||
    result.breakdown.length > PRICING_ANALYSIS_RESULT_LIMITS.breakdownMax
  ) {
    return false;
  }
  let sum = 0;
  for (const item of result.breakdown) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      ownKeys(item).some((field) => !BREAKDOWN_ITEM_FIELDS.has(field)) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.trim().length > PRICING_ANALYSIS_RESULT_LIMITS.nameMax ||
      typeof item.description !== "string" ||
      !item.description.trim() ||
      item.description.trim().length > PRICING_ANALYSIS_RESULT_LIMITS.descriptionMax ||
      typeof item.rationale !== "string" ||
      !item.rationale.trim() ||
      item.rationale.trim().length > PRICING_ANALYSIS_RESULT_LIMITS.rationaleMax ||
      typeof item.amount !== "number" ||
      !Number.isSafeInteger(item.amount) ||
      item.amount < 1 ||
      item.amount > PRICING_ANALYSIS_RESULT_LIMITS.amountMax
    ) {
      return false;
    }
    sum += item.amount;
    if (!Number.isSafeInteger(sum) || sum > PRICING_ANALYSIS_RESULT_LIMITS.amountMax) return false;
  }
  return sum === result.recommendedAmount;
}

async function requireAvailableRateLimit(
  rateLimit: PricingAnalysisRateLimitPort | undefined,
  input: {
    requesterId: string;
    idempotencyKey: string;
    requestFingerprint: string;
  },
): Promise<void> {
  if (!rateLimit) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_RATE_LIMIT_UNAVAILABLE",
      "안전한 호출 제한 기능을 사용할 수 없습니다.",
    );
  }
  let decision: unknown;
  try {
    decision = await rateLimit.consumeNewAnalysis(input);
  } catch {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_RATE_LIMIT_UNAVAILABLE",
      "안전한 호출 제한 기능을 사용할 수 없습니다.",
    );
  }
  if (decision === "IDEMPOTENCY_KEY_REUSED") {
    throw new PricingAnalysisApiError(
      "IDEMPOTENCY_KEY_REUSED",
      "같은 Idempotency-Key로 다른 요청을 보낼 수 없습니다.",
    );
  }
  if (decision === "LIMITED") {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_RATE_LIMITED",
      "분석 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  if (decision !== "ALLOWED") {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_RATE_LIMIT_UNAVAILABLE",
      "안전한 호출 제한 기능을 사용할 수 없습니다.",
    );
  }
}

function publicFailure(code: PricingAnalysisFailureCode): PricingAnalysisPublicFailure {
  if (code === "PROVIDER_TIMEOUT") {
    return {
      code: "PRICING_ANALYSIS_TIMEOUT",
      message: "분석 시간이 초과되었습니다. 새 요청으로 다시 시도해 주세요.",
      retryable: true,
    };
  }
  if (code === "INVALID_PROVIDER_RESPONSE") {
    return {
      code: "PRICING_ANALYSIS_INVALID_RESULT",
      message: "분석 결과를 검증하지 못했습니다. 새 요청으로 다시 시도해 주세요.",
      retryable: true,
    };
  }
  return {
    code: "PRICING_ANALYSIS_PROVIDER_FAILED",
    message: "분석 서비스를 일시적으로 사용할 수 없습니다. 새 요청으로 다시 시도해 주세요.",
    retryable: true,
  };
}

function publicFailureHttpStatus(failure: PricingAnalysisPublicFailure): 502 | 504 {
  return failure.code === "PRICING_ANALYSIS_TIMEOUT" ? 504 : 502;
}

function storedPublicFailure(row: PricingAnalysisRow): PricingAnalysisPublicFailure {
  const value = row.failureSnapshot;
  if (
    !row.failureCode ||
    !STORED_FAILURE_CODES.has(row.failureCode) ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ownKeys(value).some((field) => !PUBLIC_FAILURE_FIELDS.has(field)) ||
    ![
      "PRICING_ANALYSIS_PROVIDER_FAILED",
      "PRICING_ANALYSIS_TIMEOUT",
      "PRICING_ANALYSIS_INVALID_RESULT",
    ].includes(value.code) ||
    typeof value.message !== "string" ||
    !value.message ||
    value.message.length > 500 ||
    typeof value.retryable !== "boolean" ||
    (row.failureHttpStatus !== 502 && row.failureHttpStatus !== 504)
  ) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_STORAGE_FAILED",
      "저장된 단가 분석 실패 상태가 올바르지 않습니다.",
    );
  }
  return { code: value.code, message: value.message, retryable: value.retryable };
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Number.isFinite(Date.parse(value));
}

function validateStoredRowBase(row: PricingAnalysisRow): void {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    typeof row.analysisId !== "string" ||
    !/^pra_[A-Za-z0-9_-]+$/.test(row.analysisId) ||
    typeof row.requesterId !== "string" ||
    !row.requesterId ||
    !isValidPricingIdempotencyKey(row.idempotencyKey) ||
    typeof row.requestFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(row.requestFingerprint) ||
    row.inputSchemaVersion !== PRICING_ANALYSIS_INPUT_SCHEMA_VERSION ||
    !row.inputSnapshot ||
    ownKeys(row.inputSnapshot).length !== CREATE_FIELDS.size ||
    ownKeys(row.inputSnapshot).some((field) => !CREATE_FIELDS.has(field)) ||
    validatePricingAnalysisInput(row.inputSnapshot).length > 0 ||
    !isPricingAnalysisCategory(row.inputSnapshot.category) ||
    row.inputSnapshot.title !== row.inputSnapshot.title.trim() ||
    row.inputSnapshot.description !== row.inputSnapshot.description.trim() ||
    fingerprintPricingAnalysisInput(
      row.requesterId,
      row.inputSnapshot,
      row.inputSchemaVersion,
    ) !== row.requestFingerprint ||
    typeof row.model !== "string" ||
    !row.model.trim() ||
    typeof row.promptVersion !== "string" ||
    !row.promptVersion ||
    typeof row.schemaVersion !== "string" ||
    !row.schemaVersion ||
    !validTimestamp(row.createdAt)
  ) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_STORAGE_FAILED",
      "저장된 단가 분석 상태가 올바르지 않습니다.",
    );
  }
}

function assertChronologicalTimestamps(
  createdAt: string,
  reviewedAt: string | null,
  appliedAt: string | null,
): void {
  const created = Date.parse(createdAt);
  const reviewed = reviewedAt === null ? null : Date.parse(reviewedAt);
  const applied = appliedAt === null ? null : Date.parse(appliedAt);
  if (
    (reviewed !== null && (!Number.isFinite(reviewed) || reviewed < created)) ||
    (applied !== null && (!Number.isFinite(applied) || reviewed === null || applied < reviewed))
  ) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_STORAGE_FAILED",
      "저장된 단가 분석 시각이 올바르지 않습니다.",
    );
  }
}

export function toPricingAnalysisResponse(row: PricingAnalysisRow): PricingAnalysisResponse {
  validateStoredRowBase(row);
  assertChronologicalTimestamps(row.createdAt, row.reviewedAt, row.appliedAt);
  const base = {
    pricingAnalysisId: row.analysisId,
    inputSnapshot: {
      title: row.inputSnapshot.title,
      description: row.inputSnapshot.description,
      category: row.inputSnapshot.category,
    },
    createdAt: row.createdAt,
    appliedAt: row.appliedAt,
  };
  if (row.reviewStatus === "PENDING") {
    if (
      row.result !== null ||
      row.failureCode !== null ||
      row.failureSnapshot !== null ||
      row.failureHttpStatus !== null ||
      row.reviewedAt !== null ||
      row.projectId !== null ||
      row.appliedAt !== null
    ) {
      throw new PricingAnalysisApiError(
        "PRICING_ANALYSIS_STORAGE_FAILED",
        "저장된 단가 분석 대기 상태가 올바르지 않습니다.",
      );
    }
    return { ...base, reviewStatus: "PENDING", result: null, failure: null, reviewedAt: null };
  }
  if (
    row.reviewStatus === "APPROVED" &&
    row.result &&
    row.reviewedAt &&
    validatePricingRecommendation(row.result) &&
    row.failureCode === null &&
    row.failureSnapshot === null &&
    row.failureHttpStatus === null &&
    ((row.projectId === null && row.appliedAt === null) ||
      (typeof row.projectId === "string" &&
        /^prj_[A-Za-z0-9_-]+$/.test(row.projectId) &&
        validTimestamp(row.appliedAt)))
  ) {
    return {
      ...base,
      reviewStatus: "APPROVED",
      result: cloneRecommendation(row.result),
      failure: null,
      reviewedAt: row.reviewedAt,
    };
  }
  if (
    row.reviewStatus === "REJECTED" &&
    row.result === null &&
    row.failureCode &&
    row.failureSnapshot &&
    row.failureHttpStatus &&
    row.reviewedAt &&
    row.projectId === null &&
    row.appliedAt === null
  ) {
    return {
      ...base,
      reviewStatus: "REJECTED",
      result: null,
      failure: storedPublicFailure(row),
      reviewedAt: row.reviewedAt,
    };
  }
  throw new PricingAnalysisApiError(
    "PRICING_ANALYSIS_STORAGE_FAILED",
    "저장된 단가 분석 상태가 올바르지 않습니다.",
  );
}

function terminalApiError(row: PricingAnalysisRow): PricingAnalysisApiError {
  const failure = storedPublicFailure(row);
  const error = new PricingAnalysisApiError(failure.code, failure.message, {
    analysis: toPricingAnalysisResponse(row),
  }, row.failureHttpStatus ?? undefined);
  return error;
}

function replayCreate(row: PricingAnalysisRow): CreatePricingAnalysisResult {
  if (row.reviewStatus === "REJECTED") throw terminalApiError(row);
  return {
    httpStatus: row.reviewStatus === "PENDING" ? 202 : 200,
    body: toPricingAnalysisResponse(row),
  };
}

async function replayTerminalAfterLostCas(
  deps: PricingAnalysisServiceDeps,
  analysisId: string,
  requesterId: string,
  idempotencyKey: string,
  requestFingerprint: string,
): Promise<CreatePricingAnalysisResult> {
  const latest = await analysisStorage(() => deps.repository.findById(analysisId));
  if (
    !latest ||
    latest.analysisId !== analysisId ||
    latest.requesterId !== requesterId ||
    latest.idempotencyKey !== idempotencyKey ||
    latest.requestFingerprint !== requestFingerprint ||
    latest.reviewStatus === "PENDING"
  ) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_STORAGE_FAILED",
      "단가 분석의 최종 상태를 확정하지 못했습니다.",
    );
  }
  return replayCreate(latest);
}

function classifyAnalyzerFailure(error: unknown): PricingAnalysisFailureCode {
  if (error instanceof PricingAnalyzerError && error.kind === "TIMEOUT") {
    return "PROVIDER_TIMEOUT";
  }
  if (error instanceof PricingAnalyzerError && error.kind === "INVALID_RESPONSE") {
    return "INVALID_PROVIDER_RESPONSE";
  }
  return "PROVIDER_UNAVAILABLE";
}

function validateCreateKey(value: string | undefined): string {
  if (!isValidPricingIdempotencyKey(value)) {
    throw new PricingAnalysisApiError(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Idempotency-Key는 공백 없는 printable ASCII 8~100자여야 합니다.",
      { fields: [{ field: "idempotencyKey", reason: "invalid" }] },
    );
  }
  return value;
}

async function analysisStorage<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_STORAGE_FAILED",
      "단가 분석을 저장하거나 조회하지 못했습니다.",
    );
  }
}

export async function createPricingAnalysis(
  deps: PricingAnalysisServiceDeps,
  actor: PricingAnalysisActor | undefined,
  input: CreatePricingAnalysisInput,
  idempotencyKey: string | undefined,
): Promise<CreatePricingAnalysisResult> {
  const requesterId = requireClient(actor);
  const key = validateCreateKey(idempotencyKey);
  const validation = validatePricingAnalysisInput(input);
  if (validation.length > 0) {
    throw new PricingAnalysisApiError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", {
      fields: validation,
    });
  }
  if (!isPricingAnalysisCategory(input.category)) {
    throw new PricingAnalysisApiError("INVALID_CATEGORY", "지원하지 않는 프로젝트 카테고리입니다.", {
      fields: [{ field: "category", reason: input.category ? "invalid" : "required" }],
    });
  }
  const snapshot = normalizePricingAnalysisInput(input);
  const fingerprint = fingerprintPricingAnalysisInput(requesterId, snapshot);
  // 저장된 terminal 결과는 현재 analyzer 설정과 무관하게 정확히 재생할 수 있어야 한다.
  const replay = await analysisStorage(() =>
    deps.repository.findByIdempotency(requesterId, key),
  );
  if (replay) {
    if (replay.requesterId !== requesterId || replay.idempotencyKey !== key) {
      throw new PricingAnalysisApiError(
        "PRICING_ANALYSIS_STORAGE_FAILED",
        "저장된 단가 분석 멱등 범위가 올바르지 않습니다.",
      );
    }
    if (replay.requestFingerprint !== fingerprint) {
      throw new PricingAnalysisApiError(
        "IDEMPOTENCY_KEY_REUSED",
        "같은 Idempotency-Key로 다른 요청을 보낼 수 없습니다.",
      );
    }
    return replayCreate(replay);
  }

  // 새 분석에만 설정을 요구한다. 설정 부재 시 PENDING이나 mock 결과를 만들지 않는다.
  if (
    deps.analyzer.configured !== true ||
    typeof deps.analyzer.model !== "string" ||
    !deps.analyzer.model.trim()
  ) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYZER_UNAVAILABLE",
      "단가 분석 기능을 사용할 수 없습니다.",
    );
  }

  // exact replay는 비용을 만들지 않으므로 한도를 다시 소비하지 않는다.
  await requireAvailableRateLimit(deps.rateLimit, {
    requesterId,
    idempotencyKey: key,
    requestFingerprint: fingerprint,
  });

  const analysisId = deps.nextAnalysisId();
  const pending: PricingAnalysisRow = {
    analysisId,
    requesterId,
    inputSnapshot: snapshot,
    requestFingerprint: fingerprint,
    inputSchemaVersion: PRICING_ANALYSIS_INPUT_SCHEMA_VERSION,
    idempotencyKey: key,
    reviewStatus: "PENDING",
    result: null,
    failureCode: null,
    failureSnapshot: null,
    failureHttpStatus: null,
    model: deps.analyzer.model,
    promptVersion: PRICING_ANALYSIS_PROMPT_VERSION,
    schemaVersion: PRICING_ANALYSIS_SCHEMA_VERSION,
    projectId: null,
    createdAt: deps.now(),
    reviewedAt: null,
    appliedAt: null,
  };
  const reservation = await analysisStorage(() => deps.repository.reservePending(pending));
  const reservationValue = reservation as { kind?: unknown; row?: unknown };
  if (reservationValue.kind === "existing") {
    const existingRow = reservationValue.row;
    if (!existingRow || typeof existingRow !== "object" || Array.isArray(existingRow)) {
      throw new PricingAnalysisApiError(
        "PRICING_ANALYSIS_STORAGE_FAILED",
        "저장된 단가 분석 예약 결과가 올바르지 않습니다.",
      );
    }
    const typedExistingRow = existingRow as PricingAnalysisRow;
    if (
      typedExistingRow.requesterId !== requesterId ||
      typedExistingRow.idempotencyKey !== key
    ) {
      throw new PricingAnalysisApiError(
        "PRICING_ANALYSIS_STORAGE_FAILED",
        "저장된 단가 분석 멱등 범위가 올바르지 않습니다.",
      );
    }
    if (typedExistingRow.requestFingerprint !== fingerprint) {
      throw new PricingAnalysisApiError(
        "IDEMPOTENCY_KEY_REUSED",
        "같은 Idempotency-Key로 다른 요청을 보낼 수 없습니다.",
      );
    }
    return replayCreate(typedExistingRow);
  }
  if (reservationValue.kind !== "inserted") {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_STORAGE_FAILED",
      "단가 분석 요청을 예약하지 못했습니다.",
    );
  }

  let untrusted: unknown;
  try {
    untrusted = await deps.analyzer.analyze({ ...snapshot });
    if (!validatePricingRecommendation(untrusted)) throw new PricingAnalyzerError("INVALID_RESPONSE");
  } catch (error) {
    const failureCode = classifyAnalyzerFailure(error);
    const failureSnapshot = publicFailure(failureCode);
    const failureHttpStatus = publicFailureHttpStatus(failureSnapshot);
    const changed = await analysisStorage(() =>
      deps.repository.markRejectedIfPending(
        analysisId,
        failureCode,
        failureSnapshot,
        failureHttpStatus,
        deps.now(),
      ),
    );
    if (changed === false) {
      return replayTerminalAfterLostCas(deps, analysisId, requesterId, key, fingerprint);
    }
    if (changed !== true) {
      throw new PricingAnalysisApiError(
        "PRICING_ANALYSIS_STORAGE_FAILED",
        "분석 실패 상태를 확정하지 못했습니다.",
      );
    }
    const rejected = await analysisStorage(() => deps.repository.findById(analysisId));
    if (
      !rejected ||
      rejected.analysisId !== analysisId ||
      rejected.requesterId !== requesterId ||
      rejected.requestFingerprint !== fingerprint ||
      rejected.idempotencyKey !== key ||
      rejected.reviewStatus !== "REJECTED"
    ) {
      throw new PricingAnalysisApiError(
        "PRICING_ANALYSIS_STORAGE_FAILED",
        "분석 실패 상태를 찾을 수 없습니다.",
      );
    }
    throw terminalApiError(rejected);
  }

  const changed = await analysisStorage(() =>
    deps.repository.markApprovedIfPending(
      analysisId,
      cloneRecommendation(untrusted as PricingAnalysisRecommendation),
      deps.now(),
    ),
  );
  if (changed === false) {
    return replayTerminalAfterLostCas(deps, analysisId, requesterId, key, fingerprint);
  }
  if (changed !== true) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_STORAGE_FAILED",
      "분석 결과 상태를 확정하지 못했습니다.",
    );
  }
  const approved = await analysisStorage(() => deps.repository.findById(analysisId));
  if (
    !approved ||
    approved.analysisId !== analysisId ||
    approved.requesterId !== requesterId ||
    approved.requestFingerprint !== fingerprint ||
    approved.idempotencyKey !== key ||
    approved.reviewStatus !== "APPROVED"
  ) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_STORAGE_FAILED",
      "분석 결과를 찾을 수 없습니다.",
    );
  }
  return { httpStatus: 201, body: toPricingAnalysisResponse(approved) };
}

function validateAnalysisId(analysisId: string): void {
  if (!/^pra_[A-Za-z0-9_-]+$/.test(analysisId)) {
    throw new PricingAnalysisApiError(
      "INVALID_PRICING_ANALYSIS_ID",
      "단가 분석 식별자 형식이 올바르지 않습니다.",
    );
  }
}

export async function getPricingAnalysis(
  deps: PricingAnalysisServiceDeps,
  actor: PricingAnalysisActor | undefined,
  analysisId: string,
): Promise<PricingAnalysisResponse> {
  const requesterId = requireClient(actor);
  validateAnalysisId(analysisId);
  const row = await analysisStorage(() => deps.repository.findById(analysisId));
  if (!row || row.analysisId !== analysisId || row.requesterId !== requesterId) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_NOT_FOUND",
      "단가 분석을 찾을 수 없습니다.",
    );
  }
  return toPricingAnalysisResponse(row);
}

function mapProjectApplicationError(error: ProjectBudgetApplicationError): PricingAnalysisApiError {
  switch (error.code as string) {
    case "PROJECT_NOT_FOUND":
      return new PricingAnalysisApiError("PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
    case "PROJECT_FORBIDDEN":
      return new PricingAnalysisApiError("PROJECT_FORBIDDEN", "프로젝트에 대한 권한이 없습니다.");
    case "IDEMPOTENCY_KEY_REUSED":
      return new PricingAnalysisApiError("IDEMPOTENCY_KEY_REUSED", "같은 Idempotency-Key로 다른 요청을 보낼 수 없습니다.");
    case "PRICING_ANALYSIS_ALREADY_APPLIED":
      return new PricingAnalysisApiError("PRICING_ANALYSIS_ALREADY_APPLIED", "이미 사용된 단가 분석입니다.");
    case "PROJECT_EDIT_LOCKED":
      return new PricingAnalysisApiError("PROJECT_EDIT_LOCKED", "지원자가 있어 프로젝트 예산을 변경할 수 없습니다.");
    case "PROJECT_EDIT_CLOSED":
      return new PricingAnalysisApiError("PROJECT_EDIT_CLOSED", "현재 프로젝트 상태에서는 예산을 변경할 수 없습니다.");
    case "PROJECT_VERSION_CONFLICT":
      return new PricingAnalysisApiError("PROJECT_VERSION_CONFLICT", "프로젝트가 변경되었습니다. 최신 상태를 확인해 주세요.");
    case "PROJECT_BUDGET_CONFLICT":
      return new PricingAnalysisApiError("PROJECT_BUDGET_CONFLICT", "프로젝트 예산이 변경되었습니다. 최신 금액을 확인해 주세요.");
    case "STORAGE_FAILED":
    default:
      return new PricingAnalysisApiError(
        "PRICING_APPLICATION_STORAGE_FAILED",
        "프로젝트 예산 반영 transaction을 저장하지 못했습니다.",
      );
  }
}

function validApplicationResponse(
  value: unknown,
  expected: {
    analysisId: string;
    projectId: string;
    recommendedAmount: number;
  },
): value is ApplyPricingAnalysisResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<ApplyPricingAnalysisResponse>;
  return ownKeys(value).length === APPLICATION_RESPONSE_FIELDS.size &&
    ownKeys(value).every((field) => APPLICATION_RESPONSE_FIELDS.has(field)) &&
    result.pricingAnalysisId === expected.analysisId &&
    result.projectId === expected.projectId &&
    result.budgetAmount === expected.recommendedAmount &&
    result.currency === PRICING_ANALYSIS_CURRENCY &&
    typeof result.appliedAt === "string" && Number.isFinite(Date.parse(result.appliedAt)) &&
    typeof result.processedAt === "string" && Number.isFinite(Date.parse(result.processedAt)) &&
    result.changed === true &&
    typeof result.projectVersion === "number" &&
    Number.isSafeInteger(result.projectVersion) && result.projectVersion >= 0;
}

function cloneApplicationResponse(
  result: ApplyPricingAnalysisResponse,
): ApplyPricingAnalysisResponse {
  return {
    pricingAnalysisId: result.pricingAnalysisId,
    projectId: result.projectId,
    budgetAmount: result.budgetAmount,
    currency: result.currency,
    appliedAt: result.appliedAt,
    processedAt: result.processedAt,
    changed: true,
    projectVersion: result.projectVersion,
  };
}

function normalizeApplyInput(input: ApplyPricingAnalysisInput): {
  projectId: string;
  expectedBudgetAmount: number;
  expectedProjectVersion: number | null;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PricingAnalysisApiError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.");
  }
  const unknown = ownKeys(input).filter((field) => !APPLY_FIELDS.has(field));
  if (unknown.length > 0) {
    throw new PricingAnalysisApiError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", {
      fields: unknown.map((field) => ({ field, reason: "invalid" as const })),
    });
  }
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  if (!/^prj_[A-Za-z0-9_-]+$/.test(projectId)) {
    throw new PricingAnalysisApiError("INVALID_PROJECT_ID", "프로젝트 식별자 형식이 올바르지 않습니다.");
  }
  if (
    typeof input.expectedBudgetAmount !== "number" ||
    !Number.isInteger(input.expectedBudgetAmount) ||
    input.expectedBudgetAmount < 1 ||
    input.expectedBudgetAmount > PRICING_ANALYSIS_RESULT_LIMITS.amountMax
  ) {
    throw new PricingAnalysisApiError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", {
      fields: [{ field: "expectedBudgetAmount", reason: "invalid" }],
    });
  }
  if (
    input.expectedProjectVersion !== undefined &&
    (!Number.isInteger(input.expectedProjectVersion) || (input.expectedProjectVersion as number) < 0)
  ) {
    throw new PricingAnalysisApiError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", {
      fields: [{ field: "expectedProjectVersion", reason: "invalid" }],
    });
  }
  return {
    projectId,
    expectedBudgetAmount: input.expectedBudgetAmount,
    expectedProjectVersion:
      input.expectedProjectVersion === undefined
        ? null
        : (input.expectedProjectVersion as number),
  };
}

export async function applyPricingAnalysis(
  deps: PricingAnalysisServiceDeps,
  actor: PricingAnalysisActor | undefined,
  analysisId: string,
  input: ApplyPricingAnalysisInput,
  idempotencyKey: string | undefined,
): Promise<ApplyPricingAnalysisResponse> {
  const requesterId = requireClient(actor);
  validateAnalysisId(analysisId);
  const normalized = normalizeApplyInput(input);
  const expectedKey = `pricing-apply-${analysisId}`;
  if (!isValidPricingIdempotencyKey(idempotencyKey) || idempotencyKey !== expectedKey) {
    throw new PricingAnalysisApiError(
      "IDEMPOTENCY_KEY_REQUIRED",
      `Idempotency-Key는 ${expectedKey}여야 합니다.`,
      { fields: [{ field: "idempotencyKey", reason: "invalid" }] },
    );
  }
  const row = await analysisStorage(() => deps.repository.findById(analysisId));
  if (!row || row.analysisId !== analysisId || row.requesterId !== requesterId) {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_NOT_FOUND",
      "단가 분석을 찾을 수 없습니다.",
    );
  }
  let publicAnalysis: PricingAnalysisResponse;
  try {
    publicAnalysis = toPricingAnalysisResponse(row);
  } catch (error) {
    if (error instanceof PricingAnalysisApiError) throw error;
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_STORAGE_FAILED",
      "저장된 단가 분석 상태가 올바르지 않습니다.",
    );
  }
  if (publicAnalysis.reviewStatus !== "APPROVED") {
    throw new PricingAnalysisApiError(
      "PRICING_ANALYSIS_NOT_APPROVED",
      "승인된 분석 결과만 프로젝트에 반영할 수 있습니다.",
    );
  }
  if (!deps.projectBudgetApplication) {
    throw new PricingAnalysisApiError(
      "PRICING_APPLICATION_UNAVAILABLE",
      "안전한 예산 반영 기능을 사용할 수 없습니다.",
    );
  }
  const processedAt = deps.now();
  const requestFingerprint = fingerprintPricingAnalysisApplication(
    requesterId,
    analysisId,
    normalized.projectId,
    normalized.expectedBudgetAmount,
    normalized.expectedProjectVersion,
  );
  let application: unknown;
  try {
    application = await deps.projectBudgetApplication.applyPricingAnalysisBudget({
      analysisId,
      projectId: normalized.projectId,
      requesterId,
      recommendedAmount: publicAnalysis.result.recommendedAmount,
      expectedBudgetAmount: normalized.expectedBudgetAmount,
      expectedProjectVersion: normalized.expectedProjectVersion,
      idempotencyKey,
      requestFingerprint,
      appliedAt: processedAt,
      processedAt,
    });
  } catch (error) {
    if (error instanceof ProjectBudgetApplicationError) throw mapProjectApplicationError(error);
    throw new PricingAnalysisApiError(
      "PRICING_APPLICATION_STORAGE_FAILED",
      "프로젝트 예산 반영 transaction을 저장하지 못했습니다.",
    );
  }
  if (!validApplicationResponse(application, {
    analysisId,
    projectId: normalized.projectId,
    recommendedAmount: publicAnalysis.result.recommendedAmount,
  })) {
    throw new PricingAnalysisApiError(
      "PRICING_APPLICATION_STORAGE_FAILED",
      "프로젝트 예산 반영 결과를 확인하지 못했습니다.",
    );
  }
  return cloneApplicationResponse(application);
}
