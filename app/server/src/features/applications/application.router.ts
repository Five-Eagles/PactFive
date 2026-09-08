import { Router, type Request, type RequestHandler, type Response } from 'express';
import { createApplicationController } from './application.controller';
import type { ApplicationServiceDeps } from './application.service';
import type { ApplicationStatus, CreateApplicationBody, ListQuery } from './application.types';

/**
 * applications 공개 API — PR #83로 5종에서 8종으로 늘었다(eligibility·단건 GET·operation
 * 상태 조회 신규). Express에 붙이는 형태는 pricing-analysis.router.ts와 같다.
 * 인증 컨텍스트는 `req.user`(requireAuth가 채움)에서 가져온다.
 */

const APPLICATION_STATUSES = new Set<ApplicationStatus>(['PENDING', 'ACCEPTED', 'REJECTED']);

function toActor(req: Request): string | undefined {
  return req.user?.userId;
}

function readIdempotencyKey(req: Request): string | undefined {
  const raw = req.header('Idempotency-Key');
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function readListQuery(req: Request): ListQuery {
  const page = Number(req.query.page);
  const pageSize = Number(req.query.pageSize);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  return {
    page: Number.isFinite(page) ? page : undefined,
    pageSize: Number.isFinite(pageSize) ? pageSize : undefined,
    status: status && APPLICATION_STATUSES.has(status as ApplicationStatus) ? (status as ApplicationStatus) : undefined,
  };
}

export function createApplicationRouter(
  deps: ApplicationServiceDeps,
  middleware: { requireAuth: RequestHandler },
): Router {
  const router = Router();
  const controller = createApplicationController(deps);
  const { requireAuth } = middleware;

  router.get(
    '/api/v1/projects/:projectId/application-eligibility',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.eligibility(req.params.projectId, toActor(req));
      res.status(httpStatus).json(body);
    },
  );

  router.post(
    '/api/v1/projects/:projectId/applications',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.create(
        req.params.projectId,
        toActor(req),
        req.body as CreateApplicationBody,
        readIdempotencyKey(req),
      );
      res.status(httpStatus).json(body);
    },
  );

  router.get(
    '/api/v1/projects/:projectId/applications',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.listForProject(
        req.params.projectId,
        toActor(req),
        readListQuery(req),
      );
      res.status(httpStatus).json(body);
    },
  );

  router.get('/api/v1/applications/me', requireAuth, async (req: Request, res: Response) => {
    const { httpStatus, body } = await controller.listMine(toActor(req), readListQuery(req));
    res.status(httpStatus).json(body);
  });

  router.get('/api/v1/applications/:applicationId', requireAuth, async (req: Request, res: Response) => {
    const { httpStatus, body } = await controller.getOne(req.params.applicationId, toActor(req));
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

  router.get(
    '/api/v1/application-operations/:operationId',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.getOperation(req.params.operationId, toActor(req));
      res.status(httpStatus).json(body);
    },
  );

  return router;
}
