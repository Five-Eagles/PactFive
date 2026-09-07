import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../../shared/http';
import { applyPricingAnalysis, createPricingAnalysis, fetchPricingAnalysis } from './api/pricing-analysis';
import type {
  ApplyPricingAnalysisResponse,
  CreatePricingAnalysisInput,
  PricingAnalysisResponse,
} from './pricing-analysis.types';

/**
 * `features/ai-pricing/prototype/web/usePricingAnalysis.ts`(오민혁)를 재해석한 것 —
 * 상태 기계·멱등키 회전·PENDING 폴링 로직은 그대로 옮기되, 자체 fetch 클라이언트
 * (`api/pricing-analysis.ts`의 예전 버전)는 버리고 `shared/http.ts` + `ApiError`로 바꿨다
 * (app/web/AGENTS.md "재해석해서 일관되게 다시 짠다").
 */

export type PricingAnalysisUiStatus =
  | 'idle'
  | 'submitting'
  | 'ready'
  | 'rejected'
  | 'conflict'
  | 'error'
  | 'applying'
  | 'applied';

export type PricingAnalysisFailureOperation = 'analysis' | 'apply';

function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `pricing-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function shouldRotateCreateKey(
  result: PricingAnalysisResponse | null,
  error: ApiError | null,
): boolean {
  if (error) {
    if (error.code === 'IDEMPOTENCY_KEY_REUSED') return true;
    const details = error.body as { error?: { details?: { analysis?: PricingAnalysisResponse } } } | undefined;
    return details?.error?.details?.analysis?.reviewStatus === 'REJECTED';
  }
  return result?.reviewStatus === 'REJECTED';
}

const PENDING_POLL_POLICY = {
  initialDelayMs: 400,
  maxDelayMs: 1_600,
  maxAttempts: 5,
  deadlineMs: 5_000,
} as const;

function pendingPollDelay(attempt: number): number {
  return Math.min(PENDING_POLL_POLICY.initialDelayMs * 2 ** Math.max(0, attempt), PENDING_POLL_POLICY.maxDelayMs);
}

function canContinuePolling(attempt: number, elapsedMs: number): boolean {
  return (
    attempt < PENDING_POLL_POLICY.maxAttempts &&
    elapsedMs + pendingPollDelay(attempt) <= PENDING_POLL_POLICY.deadlineMs
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 202(PENDING) 응답을 받았을 때만 쓴다 — 새 분석 POST는 다시 부르지 않고, 단건 GET만
 * 간격을 늘려가며(400ms→800ms→1.6s…) 재조회한다. 최대 5회 또는 전체 5초를 넘기면 멈춘다
 * (design/high-fi.html "필수 요소 목록" 표의 "제출 중" 행).
 */
async function pollPendingAnalysis(
  analysisId: string,
  onResult: (result: PricingAnalysisResponse) => void,
): Promise<PricingAnalysisResponse | null> {
  const startedAt = Date.now();
  let last: PricingAnalysisResponse | null = null;
  for (let attempt = 0; canContinuePolling(attempt, Date.now() - startedAt); attempt += 1) {
    await wait(pendingPollDelay(attempt));
    last = await fetchPricingAnalysis(analysisId);
    onResult(last);
    if (last.reviewStatus !== 'PENDING') return last;
  }
  return last;
}

function statusForAnalysis(analysis: PricingAnalysisResponse): PricingAnalysisUiStatus {
  if (analysis.appliedAt) return 'applied';
  if (analysis.reviewStatus === 'APPROVED') return 'ready';
  if (analysis.reviewStatus === 'REJECTED') return 'rejected';
  return 'submitting';
}

export function usePricingAnalysis() {
  const [status, setStatus] = useState<PricingAnalysisUiStatus>('idle');
  const [analysis, setAnalysis] = useState<PricingAnalysisResponse | null>(null);
  const [application, setApplication] = useState<ApplyPricingAnalysisResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failureOperation, setFailureOperation] = useState<PricingAnalysisFailureOperation | null>(null);
  const lastInput = useRef<CreatePricingAnalysisInput | null>(null);
  const lastCreateKey = useRef<string | null>(null);
  const needsNewCreateKey = useRef(false);
  const activeRequest = useRef(0);

  useEffect(() => () => {
    activeRequest.current += 1;
  }, []);

  const runAnalysis = useCallback(async (input: CreatePricingAnalysisInput, idempotencyKey: string) => {
    lastInput.current = { ...input };
    lastCreateKey.current = idempotencyKey;
    needsNewCreateKey.current = false;
    const requestId = ++activeRequest.current;
    setStatus('submitting');
    setErrorMessage(null);
    setFailureOperation(null);
    setApplication(null);
    try {
      let result = await createPricingAnalysis(input, idempotencyKey);
      if (requestId !== activeRequest.current) return null;
      setAnalysis(result);
      if (result.reviewStatus === 'PENDING') {
        const polled = await pollPendingAnalysis(result.pricingAnalysisId, (next) => {
          if (requestId === activeRequest.current) setAnalysis(next);
        });
        if (requestId !== activeRequest.current) return null;
        if (!polled || polled.reviewStatus === 'PENDING') {
          setErrorMessage('분석이 계속 처리 중입니다. 잠시 후 저장된 분석 상태를 다시 확인해 주세요.');
          setFailureOperation('analysis');
          setStatus('error');
          return polled;
        }
        result = polled;
      }
      if (shouldRotateCreateKey(result, null)) needsNewCreateKey.current = true;
      setStatus(statusForAnalysis(result));
      return result;
    } catch (error) {
      if (requestId !== activeRequest.current) return null;
      const apiError = error instanceof ApiError ? error : null;
      setFailureOperation('analysis');
      needsNewCreateKey.current = shouldRotateCreateKey(null, apiError);
      setErrorMessage(apiError?.message ?? '분석 요청을 처리하지 못했습니다.');
      if (apiError?.code === 'IDEMPOTENCY_KEY_REUSED') {
        setStatus('conflict');
      } else {
        const details = apiError?.body as { error?: { details?: { analysis?: PricingAnalysisResponse } } } | undefined;
        const rejectedAnalysis = details?.error?.details?.analysis;
        if (rejectedAnalysis?.reviewStatus === 'REJECTED') {
          setAnalysis(rejectedAnalysis);
          setStatus('rejected');
        } else {
          setStatus('error');
        }
      }
      return null;
    }
  }, []);

  const analyze = useCallback(
    (input: CreatePricingAnalysisInput) => {
      setAnalysis(null);
      return runAnalysis(input, newIdempotencyKey());
    },
    [runAnalysis],
  );

  const retry = useCallback(() => {
    if (!lastInput.current) return Promise.resolve(null);
    const key =
      needsNewCreateKey.current || !lastCreateKey.current ? newIdempotencyKey() : lastCreateKey.current;
    return runAnalysis({ ...lastInput.current }, key);
  }, [runAnalysis]);

  const load = useCallback(async (analysisId: string) => {
    const requestId = ++activeRequest.current;
    setStatus('submitting');
    setErrorMessage(null);
    setFailureOperation(null);
    try {
      const result = await fetchPricingAnalysis(analysisId);
      if (requestId !== activeRequest.current) return null;
      setAnalysis(result);
      if (result.reviewStatus === 'PENDING') {
        setErrorMessage('분석이 계속 처리 중입니다. 잠시 후 저장된 분석 상태를 다시 확인해 주세요.');
        setFailureOperation('analysis');
        setStatus('error');
      } else {
        setStatus(statusForAnalysis(result));
      }
      return result;
    } catch (error) {
      if (requestId !== activeRequest.current) return null;
      setErrorMessage(error instanceof ApiError ? error.message : '분석 결과를 불러오지 못했습니다.');
      setFailureOperation('analysis');
      setStatus('error');
      return null;
    }
  }, []);

  const apply = useCallback(
    async (projectId: string, expectedBudgetAmount: number, expectedProjectVersion?: number) => {
      if (!analysis?.result) return null;
      const expectedAnalysisId = analysis.pricingAnalysisId;
      const requestId = ++activeRequest.current;
      setStatus('applying');
      setErrorMessage(null);
      setFailureOperation(null);
      try {
        const result = await applyPricingAnalysis(
          expectedAnalysisId,
          projectId,
          expectedBudgetAmount,
          expectedProjectVersion,
        );
        if (requestId !== activeRequest.current) return null;
        setApplication(result);
        setAnalysis((current) => (current ? { ...current, appliedAt: result.appliedAt } : current));
        setStatus('applied');
        return result;
      } catch (error) {
        if (requestId !== activeRequest.current) return null;
        const apiError = error instanceof ApiError ? error : null;
        setErrorMessage(apiError?.message ?? '프로젝트 예산에 반영하지 못했습니다.');
        setFailureOperation('apply');
        // 승인 보고서(analysis)는 그대로 둔다 — 실패해도 결과 화면으로 돌아갈 수 있어야 한다.
        setStatus(apiError && (apiError.status === 409 || apiError.code === 'IDEMPOTENCY_KEY_REUSED') ? 'conflict' : 'error');
        return null;
      }
    },
    [analysis],
  );

  return { status, analysis, application, errorMessage, failureOperation, analyze, retry, load, apply };
}
