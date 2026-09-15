import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApplyPricingAnalysisResponse,
  CreatePricingAnalysisInput,
  PricingAnalysisResponse,
} from "../server/pricing-analysis.types";
import {
  PricingAnalysisClientError,
  pricingAnalysisApi,
  type PricingAnalysisApiClient,
} from "./api/pricing-analysis";

export type PricingAnalysisUiStatus =
  | "idle"
  | "loading"
  | "submitting"
  | "ready"
  | "rejected"
  | "conflict"
  | "error"
  | "applying"
  | "applied";

export type PricingAnalysisFailureOperation = "analysis" | "apply";

export type PricingAnalysisApplicationAttempt = {
  projectId: string;
  expectedBudgetAmount: number;
  expectedProjectVersion?: number;
};

function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `pricing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function shouldRotatePricingAnalysisCreateKey(
  outcome: PricingAnalysisResponse | PricingAnalysisClientError | null | undefined,
): boolean {
  if (outcome instanceof PricingAnalysisClientError) {
    return outcome.code === "IDEMPOTENCY_KEY_REUSED" ||
      outcome.details?.analysis?.reviewStatus === "REJECTED";
  }
  return outcome?.reviewStatus === "REJECTED";
}

export function selectPricingAnalysisRetryKey(
  lastKey: string | null,
  needsNewKey: boolean,
  generateKey: () => string = newIdempotencyKey,
): string {
  return needsNewKey || !lastKey ? generateKey() : lastKey;
}

function statusForAnalysis(analysis: PricingAnalysisResponse): PricingAnalysisUiStatus {
  if (analysis.appliedAt) return "applied";
  if (analysis.reviewStatus === "APPROVED") return "ready";
  if (analysis.reviewStatus === "REJECTED") return "rejected";
  return "submitting";
}

export const PENDING_POLL_POLICY = {
  initialDelayMs: 400,
  maxDelayMs: 1_600,
  maxAttempts: 5,
  deadlineMs: 5_000,
} as const;

export function pendingPollDelay(attempt: number): number {
  return Math.min(
    PENDING_POLL_POLICY.initialDelayMs * 2 ** Math.max(0, attempt),
    PENDING_POLL_POLICY.maxDelayMs,
  );
}

export function canContinuePendingPolling(attempt: number, elapsedMs: number): boolean {
  return (
    attempt < PENDING_POLL_POLICY.maxAttempts &&
    elapsedMs + pendingPollDelay(attempt) <= PENDING_POLL_POLICY.deadlineMs
  );
}

function waitForNextPoll(signal: AbortSignal, delayMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("request aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("request aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class PendingPollDeadlineError extends Error {
  constructor() {
    super("pending poll deadline exceeded");
    this.name = "PendingPollDeadlineError";
  }
}

export function getWithinPendingDeadline(
  client: PricingAnalysisApiClient,
  analysisId: string,
  parentSignal: AbortSignal,
  remainingMs: number,
): Promise<PricingAnalysisResponse> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", onParentAbort);
      callback();
    };
    const onParentAbort = () => {
      controller.abort();
      finish(() => reject(new Error("request aborted")));
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish(() => reject(new PendingPollDeadlineError()));
    }, Math.max(0, remainingMs));
    parentSignal.addEventListener("abort", onParentAbort, { once: true });
    if (parentSignal.aborted) {
      onParentAbort();
      return;
    }
    void client.get(analysisId, controller.signal).then(
      (result) => finish(() => resolve(result)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export type PendingPollRuntime = {
  now: () => number;
  wait: (signal: AbortSignal, delayMs: number) => Promise<void>;
  getWithinDeadline: typeof getWithinPendingDeadline;
};

const DEFAULT_PENDING_POLL_RUNTIME: PendingPollRuntime = {
  now: () => Date.now(),
  wait: waitForNextPoll,
  getWithinDeadline: getWithinPendingDeadline,
};

/** 훅과 테스트가 함께 사용하는 PENDING 조회 오케스트레이션. 새 분석 POST는 호출하지 않는다. */
export async function pollPendingAnalysis(
  client: PricingAnalysisApiClient,
  initial: PricingAnalysisResponse & { reviewStatus: "PENDING" },
  signal: AbortSignal,
  onResult: (result: PricingAnalysisResponse) => void = () => undefined,
  runtime: PendingPollRuntime = DEFAULT_PENDING_POLL_RUNTIME,
): Promise<PricingAnalysisResponse> {
  let result: PricingAnalysisResponse = initial;
  const pollingStartedAt = runtime.now();
  for (
    let attempt = 0;
    canContinuePendingPolling(attempt, runtime.now() - pollingStartedAt);
    attempt += 1
  ) {
    await runtime.wait(signal, pendingPollDelay(attempt));
    const remainingMs = PENDING_POLL_POLICY.deadlineMs - (runtime.now() - pollingStartedAt);
    if (remainingMs <= 0) break;
    try {
      result = await runtime.getWithinDeadline(
        client,
        initial.pricingAnalysisId,
        signal,
        remainingMs,
      );
    } catch (error) {
      if (error instanceof PendingPollDeadlineError) break;
      throw error;
    }
    onResult(result);
    if (result.reviewStatus !== "PENDING") break;
  }
  return result;
}

export function usePricingAnalysis(client: PricingAnalysisApiClient = pricingAnalysisApi) {
  const [status, setStatus] = useState<PricingAnalysisUiStatus>("idle");
  const [analysis, setAnalysis] = useState<PricingAnalysisResponse | null>(null);
  const [application, setApplication] = useState<ApplyPricingAnalysisResponse | null>(null);
  const [applicationAttempt, setApplicationAttempt] =
    useState<PricingAnalysisApplicationAttempt | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failureOperation, setFailureOperation] =
    useState<PricingAnalysisFailureOperation | null>(null);
  const lastInput = useRef<CreatePricingAnalysisInput | null>(null);
  const lastCreateKey = useRef<string | null>(null);
  const retryNeedsNewCreateKey = useRef(false);
  const activeRequest = useRef(0);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => () => abortController.current?.abort(), []);

  const beginRequest = useCallback(() => {
    activeRequest.current += 1;
    abortController.current?.abort();
    abortController.current = new AbortController();
    return { requestId: activeRequest.current, signal: abortController.current.signal };
  }, []);

  const runAnalysis = useCallback(
    async (input: CreatePricingAnalysisInput, idempotencyKey: string) => {
      lastInput.current = { ...input };
      lastCreateKey.current = idempotencyKey;
      retryNeedsNewCreateKey.current = false;
      const { requestId, signal } = beginRequest();
      setStatus("submitting");
      setErrorMessage(null);
      setFailureOperation(null);
      setApplication(null);
      try {
        let result = await client.create(input, idempotencyKey, signal);
        if (requestId !== activeRequest.current) return null;
        setAnalysis(result);
        if (result.reviewStatus === "PENDING") {
          result = await pollPendingAnalysis(client, result, signal, (next) => {
            if (requestId === activeRequest.current) setAnalysis(next);
          });
          if (requestId !== activeRequest.current) return null;
          if (result.reviewStatus === "PENDING") {
            setErrorMessage(
              "분석이 계속 처리 중입니다. 잠시 후 저장된 분석 상태를 다시 확인해 주세요.",
            );
            setFailureOperation("analysis");
            setStatus("error");
            return result;
          }
        }
        if (shouldRotatePricingAnalysisCreateKey(result)) retryNeedsNewCreateKey.current = true;
        setStatus(statusForAnalysis(result));
        return result;
      } catch (error) {
        if (requestId !== activeRequest.current || signal.aborted) return null;
        const clientError = error instanceof PricingAnalysisClientError ? error : null;
        setFailureOperation("analysis");
        retryNeedsNewCreateKey.current = shouldRotatePricingAnalysisCreateKey(clientError);
        setErrorMessage(clientError?.message ?? "분석 요청을 처리하지 못했습니다.");
        if (clientError?.code === "IDEMPOTENCY_KEY_REUSED") setStatus("conflict");
        else if (clientError?.details?.analysis?.reviewStatus === "REJECTED") {
          setAnalysis(clientError.details.analysis);
          setStatus("rejected");
        }
        else setStatus("error");
        return null;
      }
    },
    [beginRequest, client],
  );

  const analyze = useCallback(
    (input: CreatePricingAnalysisInput) => {
      setAnalysis(null);
      return runAnalysis(input, newIdempotencyKey());
    },
    [runAnalysis],
  );

  const retry = useCallback(async () => {
    if (!lastInput.current) return null;
    // 확정된 REJECTED/키 충돌만 새 분석이다. 응답 유실·모호한 5xx는 같은 키로 exact replay한다.
    const key = selectPricingAnalysisRetryKey(
      lastCreateKey.current,
      retryNeedsNewCreateKey.current,
    );
    return runAnalysis({ ...lastInput.current }, key);
  }, [runAnalysis]);

  const load = useCallback(
    async (analysisId: string) => {
      const { requestId, signal } = beginRequest();
      setStatus("loading");
      setErrorMessage(null);
      setFailureOperation(null);
      try {
        const result = await client.get(analysisId, signal);
        if (requestId !== activeRequest.current) return null;
        setAnalysis(result);
        if (result.reviewStatus === "PENDING") {
          setErrorMessage(
            "분석이 계속 처리 중입니다. 잠시 후 저장된 분석 상태를 다시 확인해 주세요.",
          );
          setFailureOperation("analysis");
          setStatus("error");
        } else {
          if (shouldRotatePricingAnalysisCreateKey(result)) retryNeedsNewCreateKey.current = true;
          setStatus(statusForAnalysis(result));
        }
        return result;
      } catch (error) {
        if (requestId !== activeRequest.current || signal.aborted) return null;
        setErrorMessage(
          error instanceof PricingAnalysisClientError
            ? error.message
            : "분석 결과를 불러오지 못했습니다.",
        );
        setFailureOperation("analysis");
        setStatus("error");
        return null;
      }
    },
    [beginRequest, client],
  );

  const apply = useCallback(
    async (
      projectId: string,
      expectedBudgetAmount: number,
      expectedProjectVersion?: number,
    ) => {
      if (!analysis?.result) return null;
      const expectedAnalysisId = analysis.pricingAnalysisId;
      const expectedRecommendedAmount = analysis.result.recommendedAmount;
      setApplicationAttempt({ projectId, expectedBudgetAmount, expectedProjectVersion });
      const { requestId, signal } = beginRequest();
      setStatus("applying");
      setErrorMessage(null);
      setFailureOperation(null);
      try {
        const result = await client.apply(
          expectedAnalysisId,
          projectId,
          expectedBudgetAmount,
          expectedProjectVersion,
          signal,
        );
        if (requestId !== activeRequest.current) return null;
        if (
          result.pricingAnalysisId !== expectedAnalysisId ||
          result.projectId !== projectId ||
          result.budgetAmount !== expectedRecommendedAmount
        ) {
          throw new PricingAnalysisClientError(
            "UNKNOWN_ERROR",
            "프로젝트 예산 반영 결과를 확인하지 못했습니다.",
            502,
          );
        }
        setApplication(result);
        setAnalysis((current) =>
          current
            ? { ...current, appliedAt: result.appliedAt }
            : current,
        );
        setStatus("applied");
        return result;
      } catch (error) {
        if (requestId !== activeRequest.current || signal.aborted) return null;
        setErrorMessage(
          error instanceof PricingAnalysisClientError
            ? error.message
            : "프로젝트 예산에 반영하지 못했습니다.",
        );
        setFailureOperation("apply");
        // 승인 보고서는 그대로 보존한다.
        setStatus(
          error instanceof PricingAnalysisClientError &&
            (error.httpStatus === 409 || error.code === "IDEMPOTENCY_KEY_REUSED")
            ? "conflict"
            : "error",
        );
        return null;
      }
    },
    [analysis, beginRequest, client],
  );

  return {
    status,
    analysis,
    application,
    applicationAttempt,
    errorMessage,
    failureOperation,
    analyze,
    retry,
    load,
    apply,
  };
}
