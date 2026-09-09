import {
  createReview,
  getMyProjectReview,
  getUserRating,
  listProjectReviews,
  listUserReviews,
  type ReviewServiceDeps,
} from './review.service';
import { isReviewApiError, type CreateReviewInput } from './review.types';

export type ReviewHttpResult = { httpStatus: number; body: unknown };

function toHttp(err: unknown): ReviewHttpResult {
  if (isReviewApiError(err)) return { httpStatus: err.httpStatus, body: err.body };
  throw err;
}

/** HTTP 프레임워크와 무관한 controller — applications/application.controller.ts와 같은 형태. */
export function createReviewController(deps: ReviewServiceDeps) {
  return {
    async createReview(
      projectId: string,
      actorUserId: string | undefined,
      input: CreateReviewInput,
      idempotencyKey: string | undefined,
    ): Promise<ReviewHttpResult> {
      try {
        const result = await createReview(deps, projectId, actorUserId, input, idempotencyKey);
        return { httpStatus: result.httpStatus, body: result.body };
      } catch (err) {
        return toHttp(err);
      }
    },
    async listProjectReviews(projectId: string, actorUserId: string | undefined): Promise<ReviewHttpResult> {
      try {
        return { httpStatus: 200, body: await listProjectReviews(deps, projectId, actorUserId) };
      } catch (err) {
        return toHttp(err);
      }
    },
    async getMyProjectReview(projectId: string, actorUserId: string | undefined): Promise<ReviewHttpResult> {
      try {
        return { httpStatus: 200, body: await getMyProjectReview(deps, projectId, actorUserId) };
      } catch (err) {
        return toHttp(err);
      }
    },
    async getUserRating(userId: string, actorUserId: string | undefined): Promise<ReviewHttpResult> {
      try {
        return { httpStatus: 200, body: await getUserRating(deps, userId, actorUserId) };
      } catch (err) {
        return toHttp(err);
      }
    },
    async listUserReviews(
      userId: string,
      actorUserId: string | undefined,
      page: number | undefined,
      pageSize: number | undefined,
    ): Promise<ReviewHttpResult> {
      try {
        return {
          httpStatus: 200,
          body: await listUserReviews(deps, userId, actorUserId, page, pageSize),
        };
      } catch (err) {
        return toHttp(err);
      }
    },
  };
}
