import { Router, type RequestHandler } from 'express';
import { createPublicApiController, requirePgConfigured } from './public-api.controller';
import type { createPublicApiService } from './public-api.service';

/**
 * contracts-payments 공개 API 7종 라우트. api-contract.md "공개 API 초안" 절이 정본.
 *
 * `/internal/v1/...` 는 이 기능이 서빙하지 않는다 — project-management가 서빙하고
 * 이 기능은 순수 호출자다 (app.ts "contracts-payments — 이제 내부 계약의 호출자다" 참고).
 */
export function createPublicApiRouter(
  service: ReturnType<typeof createPublicApiService>,
  middleware: {
    requireAuth: RequestHandler;
    paymentGatewayConfigured: boolean;
  },
): Router {
  const router = Router();
  const controller = createPublicApiController(service);
  const { requireAuth } = middleware;
  const requirePg = requirePgConfigured(middleware.paymentGatewayConfigured);

  router.post(
    '/api/v1/projects/:projectId/negotiation-offers',
    requireAuth,
    controller.proposeOffer,
  );
  router.get(
    '/api/v1/projects/:projectId/negotiation-offers/current',
    requireAuth,
    controller.getCurrentOffer,
  );
  router.post(
    '/api/v1/projects/:projectId/negotiation-offers/:offerId/accept',
    requireAuth,
    controller.acceptOffer,
  );
  router.post(
    '/api/v1/projects/:projectId/negotiation-offers/:offerId/reject',
    requireAuth,
    controller.rejectOffer,
  );

  router.get('/api/v1/contracts/:contractId', requireAuth, controller.getContract);
  router.post('/api/v1/contracts/:contractId/sign', requireAuth, controller.signContract);

  router.post('/api/v1/payments', requireAuth, requirePg, controller.preparePayment);
  router.get('/api/v1/payments/:paymentId', requireAuth, controller.getPayment);
  router.post('/api/v1/payments/confirm', requireAuth, requirePg, controller.confirmPayment);

  return router;
}
