import { Router, type Request, type RequestHandler, type Response } from 'express';
import { createReviewController } from './review.controller';
import type { ReviewServiceDeps } from './review.service';
import type { CreateReviewInput } from './review.types';

/**
 * reviews 공개 API 3종을 Express에 붙인다 — applications/application.router.ts와 같은 형태.
 * PATCH/PUT/DELETE는 등록하지 않는다(api-contract.md 규칙 4) — Express가 등록되지 않은
 * 메서드는 404로 떨어뜨리므로, 405 METHOD_NOT_ALLOWED가 필요하면 이 라우터 등록 순서
 * (다른 405 핸들러가 없다) 아래에서 별도로 처리해야 하지만, 이번 반영 범위에서는 미사용
 * 경로에 대한 404가 이미 안전한 기본값이라 별도 405 라우트를 추가하지 않는다.
 */

function toActor(req: Request): string | undefined {
  return req.user?.userId;
}

function readIdempotencyKey(req: Request): string | undefined {
  const raw = req.header('Idempotency-Key');
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export function createReviewRouter(
  deps: ReviewServiceDeps,
  middleware: { requireAuth: RequestHandler },
): Router {
  const router = Router();
  const controller = createReviewController(deps);
  const { requireAuth } = middleware;

  router.post('/api/v1/projects/:projectId/reviews', requireAuth, async (req: Request, res: Response) => {
    const { httpStatus, body } = await controller.createReview(
      req.params.projectId,
      toActor(req),
      req.body as CreateReviewInput,
      readIdempotencyKey(req),
    );
    res.status(httpStatus).json(body);
  });

  router.get('/api/v1/projects/:projectId/reviews', requireAuth, async (req: Request, res: Response) => {
    const { httpStatus, body } = await controller.listProjectReviews(req.params.projectId, toActor(req));
    res.status(httpStatus).json(body);
  });

  router.get(
    '/api/v1/users/:userId/review-summary',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.getReviewSummary(req.params.userId, toActor(req));
      res.status(httpStatus).json(body);
    },
  );

  return router;
}
