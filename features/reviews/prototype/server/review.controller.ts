import { isReviewApiError, type CreateReviewInput } from "./review.types";
import {
  createReview,
  getReviewSummary,
  listProjectReviews,
  type ReviewServiceDeps,
} from "./review.service";

type HttpResult = { httpStatus: number; body: unknown };

function toHttp(err: unknown): HttpResult {
  if (isReviewApiError(err)) return { httpStatus: err.httpStatus, body: err.body };
  throw err;
}

/** HTTP 초안. 조립은 팀장 통합 시 bootstrap에서 한다. */
export function createReviewController(deps: ReviewServiceDeps) {
  return {
    async createReview(
      projectId: string,
      actorUserId: string | undefined,
      input: CreateReviewInput,
      idempotencyKey: string | undefined,
    ): Promise<HttpResult> {
      try {
        const result = await createReview(deps, projectId, actorUserId, input, idempotencyKey);
        return { httpStatus: result.httpStatus, body: result.body };
      } catch (err) {
        return toHttp(err);
      }
    },
    async listProjectReviews(projectId: string, actorUserId: string | undefined): Promise<HttpResult> {
      try {
        return { httpStatus: 200, body: await listProjectReviews(deps, projectId, actorUserId) };
      } catch (err) {
        return toHttp(err);
      }
    },
    async getReviewSummary(userId: string, actorUserId: string | undefined): Promise<HttpResult> {
      try {
        return { httpStatus: 200, body: await getReviewSummary(deps, userId, actorUserId) };
      } catch (err) {
        return toHttp(err);
      }
    },
  };
}
