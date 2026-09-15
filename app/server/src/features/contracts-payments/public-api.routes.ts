import { Router, type RequestHandler } from 'express';
import { createPublicApiController, requirePgConfigured } from './public-api.controller';
import type { createPublicApiService } from './public-api.service';

/**
 * contracts-payments 공개 API + 인바운드 라우트. api-contract.md "공개 API 초안" 절이 정본.
 *
 * `/internal/v1/...`의 대부분은 이 기능이 서빙하지 않는다 — project-management가 서빙하고
 * 이 기능은 순수 호출자다 (express-app.ts "contracts-payments — 이제 내부 계약의 호출자다"
 * 참고). 예외가 `POST /internal/v1/projects/:projectId/invalidate-agreement` 하나다 —
 * 이건 반대 방향(유동우 → 조준영)이라 이 기능이 직접 서빙한다(api-contract.md 규칙 15·25,
 * 2026-09-07 팀장 반영에서 신규 추가). 사용자 토큰이 아니라 서버 간 토큰으로 보호한다.
 */
export function createPublicApiRouter(
  service: ReturnType<typeof createPublicApiService>,
  middleware: {
    requireAuth: RequestHandler;
    requireServiceToken: RequestHandler;
    paymentGatewayConfigured: boolean;
  },
): Router {
  const router = Router();
  const controller = createPublicApiController(service);
  const { requireAuth, requireServiceToken } = middleware;
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
    '/api/v1/projects/:projectId/negotiation-offers/:offerId/counter',
    requireAuth,
    controller.counterOffer,
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
  router.get('/api/v1/payments/:paymentId/settlement', requireAuth, controller.getSettlement);
  router.post('/api/v1/payments/confirm', requireAuth, requirePg, controller.confirmPayment);

  router.get('/api/v1/projects/:projectId/cancellation', requireAuth, controller.getCancellation);

  // 납품 Increment (spec.md 규칙 23) — 네이밍 예시 2경로는 폐기, 4경로 그대로 쓴다.
  router.get('/api/v1/contracts/:contractId/delivery', requireAuth, controller.getDelivery);
  router.post(
    '/api/v1/contracts/:contractId/deliveries/upload-prepare',
    requireAuth,
    controller.prepareDeliveryUpload,
  );
  router.post(
    '/api/v1/contracts/:contractId/deliveries/request',
    requireAuth,
    controller.requestDelivery,
  );
  router.post(
    '/api/v1/contracts/:contractId/deliveries/approve',
    requireAuth,
    controller.approveDelivery,
  );

  // 인바운드(유동우 → 조준영) — 서버 간 토큰으로 보호한다(사용자 토큰 거부, J1과 같은 원칙).
  router.post(
    '/internal/v1/projects/:projectId/invalidate-agreement',
    requireServiceToken,
    controller.invalidateAgreement,
  );

  return router;
}
