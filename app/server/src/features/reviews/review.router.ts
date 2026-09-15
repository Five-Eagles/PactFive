import { Router, type Request, type RequestHandler, type Response } from 'express';
import { createReviewController } from './review.controller';
import type { ReviewServiceDeps } from './review.service';
import type { CreateReviewInput } from './review.types';

/**
 * reviews 공개 API 5종을 Express에 붙인다 — applications/application.router.ts와 같은 형태.
 *
 * 2026-09-09 — 조준영 이식 지시서 §3. 3종(`reviews/me`·`users/:userId/rating`·
 * `users/:userId/reviews`) 신설, `review-summary`→`rating` 경로 변경.
 * `/reviews/me`를 `/reviews`(목록)보다 먼저 등록한다 — 더 구체적인 경로를 앞에 두는 편이
 * 경로 혼동이 없다(지시서 원문).
 *
 * PATCH/PUT/DELETE는 수정·삭제 API가 아니므로(api-contract.md 규칙 4) 405 METHOD_NOT_ALLOWED
 * 를 명시한다(R-02 / T25).
 */

function toActor(req: Request): string | undefined {
  return req.user?.userId;
}

function readIdempotencyKey(req: Request): string | undefined {
  const raw = req.header('Idempotency-Key');
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function readPageParams(req: Request): { page?: number; pageSize?: number } {
  const page = Number(req.query.page);
  const pageSize = Number(req.query.pageSize);
  return {
    page: Number.isFinite(page) ? page : undefined,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
  };
}

function methodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    error: { code: 'METHOD_NOT_ALLOWED', message: '허용되지 않은 메서드입니다.' },
  });
}

export function createReviewRouter(
  deps: ReviewServiceDeps,
  middleware: { requireAuth: RequestHandler },
): Router {
  const router = Router();
  const controller = createReviewController(deps);
  const { requireAuth } = middleware;

  // R-02 — 미지원 메서드는 404가 아니라 405.
  router.patch('/api/v1/projects/:projectId/reviews', methodNotAllowed);
  router.put('/api/v1/projects/:projectId/reviews', methodNotAllowed);
  router.delete('/api/v1/projects/:projectId/reviews', methodNotAllowed);
  router.patch('/api/v1/projects/:projectId/reviews/me', methodNotAllowed);
  router.put('/api/v1/projects/:projectId/reviews/me', methodNotAllowed);
  router.delete('/api/v1/projects/:projectId/reviews/me', methodNotAllowed);

  router.post('/api/v1/projects/:projectId/reviews', requireAuth, async (req: Request, res: Response) => {
    const { httpStatus, body } = await controller.createReview(
      req.params.projectId,
      toActor(req),
      req.body as CreateReviewInput,
      readIdempotencyKey(req),
    );
    res.status(httpStatus).json(body);
  });

  router.get(
    '/api/v1/projects/:projectId/reviews/me',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.getMyProjectReview(req.params.projectId, toActor(req));
      res.status(httpStatus).json(body);
    },
  );

  router.get('/api/v1/projects/:projectId/reviews', requireAuth, async (req: Request, res: Response) => {
    const { httpStatus, body } = await controller.listProjectReviews(req.params.projectId, toActor(req));
    res.status(httpStatus).json(body);
  });

  router.get('/api/v1/users/:userId/rating', requireAuth, async (req: Request, res: Response) => {
    const { httpStatus, body } = await controller.getUserRating(req.params.userId, toActor(req));
    res.status(httpStatus).json(body);
  });

  router.get('/api/v1/users/:userId/reviews', requireAuth, async (req: Request, res: Response) => {
    const { page, pageSize } = readPageParams(req);
    const { httpStatus, body } = await controller.listUserReviews(
      req.params.userId,
      toActor(req),
      page,
      pageSize,
    );
    res.status(httpStatus).json(body);
  });

  return router;
}
