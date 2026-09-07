import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../shared/http';
import { createReview as createReviewRequest, fetchProjectReviews } from './api/review';
import type { CreateReviewInput, CreateReviewResponse, ReviewItem } from './review.types';

/** `project-management/useProject.ts`와 같은 자세(AsyncState, 데이터 패칭 라이브러리 없음). */

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
  return `review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 프로젝트의 리뷰 목록(당사자는 본인 미공개분도 포함). */
export function useProjectReviews(projectId: string) {
  const [state, setState] = useState<AsyncState<ReviewItem[]>>(IDLE);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchProjectReviews(projectId)
      .then((response) => setState({ data: response.items, loading: false, error: null }))
      .catch((error: unknown) =>
        setState({ data: null, loading: false, error: toMessage(error, '리뷰를 불러오지 못했습니다.') }),
      );
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

export type CreateReviewStatus = 'idle' | 'submitting' | 'submitted' | 'conflict' | 'error';

/** 리뷰 작성 훅. 규칙 11 — 제출 후에는 수정할 수 없으므로 재시도 없이 결과만 보여준다. */
export function useCreateReview(projectId: string) {
  const [status, setStatus] = useState<CreateReviewStatus>('idle');
  const [result, setResult] = useState<CreateReviewResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);

  const submit = useCallback(
    async (input: CreateReviewInput) => {
      setStatus('submitting');
      setErrorMessage(null);
      setErrorCode(undefined);
      try {
        const response = await createReviewRequest(projectId, input, newIdempotencyKey());
        setResult(response);
        setStatus('submitted');
        return response;
      } catch (error) {
        const apiError = error instanceof ApiError ? error : null;
        setErrorMessage(apiError?.message ?? '리뷰를 작성하지 못했습니다.');
        setErrorCode(apiError?.code);
        setStatus(apiError?.code === 'REVIEW_ALREADY_EXISTS' ? 'conflict' : 'error');
        return null;
      }
    },
    [projectId],
  );

  return { status, result, errorMessage, errorCode, submit };
}
