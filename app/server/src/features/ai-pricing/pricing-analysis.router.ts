import { Router, type Request, type RequestHandler, type Response } from 'express';
import { createPricingAnalysisController } from './pricing-analysis.controller';
import type { PricingAnalysisServiceDeps } from './pricing-analysis.service';
import type {
  ApplyPricingAnalysisInput,
  CreatePricingAnalysisInput,
  PricingAnalysisActor,
} from './pricing-analysis.types';

/**
 * ai-pricing 공개 API 3종을 Express에 붙인다.
 *
 * `pricing-analysis.routes.ts`(원본 prototype 그대로 옮긴 파일)는 프레임워크 무관 경로
 * 메타데이터일 뿐 Express Router가 아니다 — 다른 기능의 `{도메인}.routes.ts`(project.routes.ts
 * 등)와 이름은 같지만 역할이 다르므로, 실제 Express 배선은 이 파일이 맡는다
 * (project.controller.ts와 같은 "HTTP 경계 변환만 한다" 원칙).
 *
 * 인증 컨텍스트는 `shared/require-auth.ts`가 채운 `req.user`에서 가져온다 — project-management와
 * 같은 방식이다.
 */

function toActor(req: Request): PricingAnalysisActor | undefined {
  return req.user ? { userId: req.user.userId, role: req.user.role } : undefined;
}

function readIdempotencyKey(req: Request): string | undefined {
  const raw = req.header('Idempotency-Key');
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

export function createPricingAnalysisRouter(
  deps: PricingAnalysisServiceDeps,
  middleware: { requireAuth: RequestHandler },
): Router {
  const router = Router();
  const controller = createPricingAnalysisController(deps);
  const { requireAuth } = middleware;

  router.post('/api/v1/pricing-analyses', requireAuth, async (req: Request, res: Response) => {
    const { httpStatus, body } = await controller.create(
      toActor(req),
      req.body as CreatePricingAnalysisInput,
      readIdempotencyKey(req),
    );
    res.status(httpStatus).json(body);
  });

  router.get(
    '/api/v1/pricing-analyses/:pricingAnalysisId',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.get(toActor(req), req.params.pricingAnalysisId);
      res.status(httpStatus).json(body);
    },
  );

  router.post(
    '/api/v1/pricing-analyses/:pricingAnalysisId/apply',
    requireAuth,
    async (req: Request, res: Response) => {
      const { httpStatus, body } = await controller.apply(
        toActor(req),
        req.params.pricingAnalysisId,
        req.body as ApplyPricingAnalysisInput,
        readIdempotencyKey(req),
      );
      res.status(httpStatus).json(body);
    },
  );

  return router;
}
