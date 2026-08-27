import { Router, type RequestHandler } from 'express';
import { createProjectTransactionController } from './project-transaction.controller';
import type { ProjectTransactionPort } from './project-transaction.port';
import type { ProjectTransactionCallLogRepository } from './project-transaction.repository';

/**
 * project-transaction 내부 API 라우트 — 팀장이 새로 작성 (원본에 controller/repository/routes가
 * 없었다). 경로는 `features/contracts-payments/api-contract.md`가 이미 고정한
 * `/internal/v1/projects/:projectId/...`를 그대로 쓴다 (엔드포인트 경로 변경은 "되돌리기 비싼 것"
 * 이라 임의로 새 경로를 만들지 않았다 — `sdd-framework/integration-workflow.md`).
 *
 * `requireServiceToken`은 호출부(app.ts)에서 주입한다 — 이 라우트는 브라우저·사용자 인증
 * (`shared/require-auth.ts`)이 아니라 서버 간 인증을 쓴다 (api-contract.md 규칙 1, J1).
 */
export function createContractsPaymentsRouter(
  port: ProjectTransactionPort,
  callLog: ProjectTransactionCallLogRepository,
  requireServiceToken: RequestHandler,
): Router {
  const router = Router();
  const controller = createProjectTransactionController(port, callLog);

  router.get(
    '/internal/v1/projects/:projectId/negotiation-context',
    requireServiceToken,
    controller.getNegotiationContext,
  );
  router.post(
    '/internal/v1/projects/:projectId/mark-payment-pending',
    requireServiceToken,
    controller.markPaymentPending,
  );
  router.post(
    '/internal/v1/projects/:projectId/start-transaction',
    requireServiceToken,
    controller.startTransaction,
  );
  router.post(
    '/internal/v1/projects/:projectId/complete-transaction',
    requireServiceToken,
    controller.completeTransaction,
  );
  router.post(
    '/internal/v1/projects/:projectId/restore-pre-contract',
    requireServiceToken,
    controller.restorePreContract,
  );

  return router;
}
