import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../shared/http';
import {
  acceptApplication as acceptApplicationRequest,
  createApplication as createApplicationRequest,
  fetchMyApplications,
  fetchProjectApplications,
  rejectApplication as rejectApplicationRequest,
} from './api/application';
import type {
  ApplicationItem,
  CreateApplicationInput,
  CreateApplicationResponse,
} from './application.types';

/**
 * applications 조회·행동 훅 — `project-management/useProject.ts`와 같은 자세(AsyncState,
 * 별도 데이터 패칭 라이브러리 없음). ai-pricing의 폴링은 이 기능에 해당하지 않는다 —
 * 지원 생성·수락·거절은 즉시 완결되는 요청이라 상태 기계가 더 단순하다.
 */

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

const IDLE = { data: null, loading: true, error: null } as const;

function toMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function newIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `application-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 지원자 관리(SCR — 의뢰인) 목록. 수락·거절 뒤 `reload`로 다시 읽는다. */
export function useProjectApplications(projectId: string) {
  const [state, setState] = useState<AsyncState<ApplicationItem[]>>(IDLE);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchProjectApplications(projectId)
      .then((response) => setState({ data: response.items, loading: false, error: null }))
      .catch((error: unknown) =>
        setState({ data: null, loading: false, error: toMessage(error, '지원자 목록을 불러오지 못했습니다.') }),
      );
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

/** 내 지원 현황(프리랜서) 목록. */
export function useMyApplications() {
  const [state, setState] = useState<AsyncState<ApplicationItem[]>>(IDLE);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchMyApplications()
      .then((response) => setState({ data: response.items, loading: false, error: null }))
      .catch((error: unknown) =>
        setState({ data: null, loading: false, error: toMessage(error, '내 지원 현황을 불러오지 못했습니다.') }),
      );
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

export type CreateApplicationStatus = 'idle' | 'submitting' | 'submitted' | 'conflict' | 'error';

/** 지원하기 제출 훅. 멱등키는 제출마다 새로 발급한다(중복 클릭 대비, api-contract.md). */
export function useCreateApplication(projectId: string) {
  const [status, setStatus] = useState<CreateApplicationStatus>('idle');
  const [result, setResult] = useState<CreateApplicationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = useCallback(
    async (input: CreateApplicationInput) => {
      setStatus('submitting');
      setErrorMessage(null);
      try {
        const response = await createApplicationRequest(projectId, input, newIdempotencyKey());
        setResult(response);
        setStatus('submitted');
        return response;
      } catch (error) {
        const apiError = error instanceof ApiError ? error : null;
        setErrorMessage(apiError?.message ?? '지원하지 못했습니다.');
        setStatus(apiError?.code === 'APPLICATION_ALREADY_EXISTS' ? 'conflict' : 'error');
        return null;
      }
    },
    [projectId],
  );

  return { status, result, errorMessage, submit };
}

/** 수락·거절 — 관리 화면(`ManageApplicantsPage`)에서 쓴다. 성공하면 호출부가 목록을 reload한다. */
export function useApplicationDecision() {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const accept = useCallback(async (applicationId: string) => {
    setPendingId(applicationId);
    setErrorMessage(null);
    try {
      const result = await acceptApplicationRequest(applicationId);
      return result;
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : '수락하지 못했습니다.',
      );
      return null;
    } finally {
      setPendingId(null);
    }
  }, []);

  const reject = useCallback(async (applicationId: string) => {
    setPendingId(applicationId);
    setErrorMessage(null);
    try {
      const result = await rejectApplicationRequest(applicationId);
      return result;
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError ? error.message : '거절하지 못했습니다.',
      );
      return null;
    } finally {
      setPendingId(null);
    }
  }, []);

  return { pendingId, errorMessage, accept, reject };
}
