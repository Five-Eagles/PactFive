import { Router, type Request, type RequestHandler, type Response } from 'express';
import { createApplicationController } from './application.controller';
import type { ApplicationServiceDeps } from './application.service';
import type { CreateApplicationInput } from './application.types';

/**
 * applications 공개 API 5종을 Express에 붙인다 — pricing-analysis.router.ts와 같은 형태.
 * 인증 컨텍스트는 `req.user`(requireAuth가 채움)에서 가져온다.
 */

function toActor(req: Request): string | undefined {
  return req.user?.userId;
}

function readIdempotencyKey(req: Request): string | undefined {
  const raw = req.header('Idempotency-Key');
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export function createApplicationRouter(
  deps: ApplicationServiceDeps,
  middleware: { requireAuth: RequestHandler },
): Router {
  const router = Router();
  const controller = createApplicationController(deps);
  const { requireAuth } = middleware;

  router.post(
    '/api/v1/projects/:projectId/applications',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.create(
        req.params.projectId,
        toActor(req),
        req.body as CreateApplicationInput,
        readIdempotencyKey(req),
      );
      res.status(httpStatus).json(body);
    },
  );

  router.get(
    '/api/v1/projects/:projectId/applications',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.listForProject(req.params.projectId, toActor(req));
      res.status(httpStatus).json(body);
    },
  );

  router.get('/api/v1/applications/me', requireAuth, async (req: Request, res: Response) => {
    const { httpStatus, body } = await controller.listMine(toActor(req));
    res.status(httpStatus).json(body);
  });

  router.post(
    '/api/v1/applications/:applicationId/accept',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.accept(
        req.params.applicationId,
        toActor(req),
        readIdempotencyKey(req),
      );
      res.status(httpStatus).json(body);
    },
  );

  router.post(
    '/api/v1/applications/:applicationId/reject',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.reject(req.params.applicationId, toActor(req));
      res.status(httpStatus).json(body);
    },
  );

  return router;
}
