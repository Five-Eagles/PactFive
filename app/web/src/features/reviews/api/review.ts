import { http } from '../../../shared/http';
import type {
  CreateReviewInput,
  CreateReviewResponse,
  GetReviewSummaryResponse,
  ListProjectReviewsResponse,
} from '../review.types';

/**
 * reviews 공개 API 3종. 전부 `shared/http.ts`를 거친다(app/web/AGENTS.md "폴더 간 접점").
 * 경로는 `features/reviews/api-contract.md`가 고정한 값 그대로다.
 */

export function createReview(
  projectId: string,
  input: CreateReviewInput,
  idempotencyKey: string,
): Promise<CreateReviewResponse> {
  return http.post<CreateReviewResponse>(`/v1/projects/${encodeURIComponent(projectId)}/reviews`, input, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function fetchProjectReviews(projectId: string): Promise<ListProjectReviewsResponse> {
  return http.get<ListProjectReviewsResponse>(`/v1/projects/${encodeURIComponent(projectId)}/reviews`);
}

export function fetchReviewSummary(userId: string): Promise<GetReviewSummaryResponse> {
  return http.get<GetReviewSummaryResponse>(`/v1/users/${encodeURIComponent(userId)}/review-summary`);
}
