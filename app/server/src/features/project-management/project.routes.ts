import { Router, type RequestHandler } from 'express';
import { createProjectController } from './project.controller';
import { createProjectContractController } from './project-contract.controller';
import type { ProjectService } from './project.service';
import type { ProjectTransactionPort } from './project-transaction.port';

/**
 * project-management 라우트.
 *
 * 두 묶음이 한 파일에 있다. 경로 접두사가 다르고 인증도 다르지만, 같은 도메인의 라우트
 * 정의를 두 파일로 쪼개면 조립 지점(express-app.ts)에서 등록을 빠뜨리기 쉽다.
 *
 * | 묶음 | 경로 | 인증 |
 * |---|---|---|
 * | 공개 API 9종 | `/api/v1/...` | 사용자 Access Token (`requireAuth` / `optionalAuth`) |
 * | 내부 계약 7종 | `/internal/v1/...` | 서비스 토큰 (`requireServiceToken`) — 규칙 49 |
 *
 * 미들웨어는 전부 호출부(express-app.ts)에서 주입한다.
 */
export function createProjectManagementRouter(
  service: ProjectService,
  contractPort: ProjectTransactionPort,
  middleware: {
    requireAuth: RequestHandler;
    optionalAuth: RequestHandler;
    requireServiceToken: RequestHandler;
  },
  /**
   * 마감 스윕 (notifications CR-0001 §4). 없으면 그 경로를 열지 않는다 —
   * 아직 안 붙은 것을 501 로 알리는 대신 **경로 자체를 만들지 않는다.**
   */
  deadlineSweep?: { sweepDeadlines(): Promise<unknown> },
): Router {
  const router = Router();
  const controller = createProjectController(service);
  const contract = createProjectContractController(contractPort);
  const { requireAuth, optionalAuth, requireServiceToken } = middleware;

  /* ─────────────── 공개 API ─────────────── */

  // A-02 목록·검색은 누구나 본다. A-03 상세는 비로그인도 보되 등록 의뢰인이면 더 많이 받는다
  // (규칙 9·13) — 그래서 requireAuth 가 아니라 optionalAuth 다.
  router.get('/api/v1/projects', controller.list);
  router.get('/api/v1/projects/:projectId', optionalAuth, controller.get);

  router.post('/api/v1/projects', requireAuth, controller.create);
  router.patch('/api/v1/projects/:projectId', requireAuth, controller.update);
  router.delete('/api/v1/projects/:projectId', requireAuth, controller.remove);
  router.post(
    '/api/v1/projects/:projectId/close-recruitment',
    requireAuth,
    controller.closeRecruitment,
  );
  router.post('/api/v1/projects/:projectId/cancel', requireAuth, controller.cancel);
  router.post(
    '/api/v1/projects/:projectId/reopen-recruitment',
    requireAuth,
    controller.reopenRecruitment,
  );
  router.get('/api/v1/clients/:clientId/projects', requireAuth, controller.listMine);

  /* ─────────────── 내부 계약 (규칙 49) ─────────────── */

  router.get(
    '/internal/v1/projects/:projectId/negotiation-context',
    requireServiceToken,
    contract.getNegotiationContext,
  );
  /**
   * 마감일이 지난 프로젝트를 실제로 마감한다 (notifications CR-0001 §4).
   *
   * **밖에서 주기적으로 두드려야 한다.** 서버 안에 타이머를 두지 않는 이유는
   * `deadline-sweep.service.ts` 주석 참고 — 요청이 올 때만 깨는 배포 형태라
   * 프로세스 내부 타이머는 로컬에서만 돌고 배포하면 조용히 안 돈다.
   *
   * 여러 번 불러도 안전하다. 마감 처리가 이미 멱등이다 (규칙 24).
   */
  if (deadlineSweep) {
    router.post('/internal/v1/projects/sweep-deadlines', requireServiceToken, async (_req, res) => {
      try {
        res.status(200).json(await deadlineSweep.sweepDeadlines());
      } catch (error) {
        res.status(500).json({
          error: {
            code: 'DEADLINE_SWEEP_FAILED',
            message: error instanceof Error ? error.message : '알 수 없는 오류',
            details: null,
          },
        });
      }
    });
  }

  router.post(
    '/internal/v1/projects/:projectId/accept-application',
    requireServiceToken,
    contract.acceptApplication,
  );
  router.post(
    '/internal/v1/projects/:projectId/mark-payment-pending',
    requireServiceToken,
    contract.markPaymentPending,
  );
  router.post(
    '/internal/v1/projects/:projectId/start-transaction',
    requireServiceToken,
    contract.startTransaction,
  );
  router.post(
    '/internal/v1/projects/:projectId/complete-transaction',
    requireServiceToken,
    contract.completeTransaction,
  );
  router.post(
    '/internal/v1/projects/:projectId/restore-pre-contract',
    requireServiceToken,
    contract.restorePreContract,
  );
  router.post(
    '/internal/v1/projects/:projectId/apply-pricing-budget',
    requireServiceToken,
    contract.applyPricingBudget,
  );

  // cancelProject 는 내부 주소를 열지 않는다 — 의뢰인 요청이라 A-07 공개 API 로만 들어온다
  // (api-contract.md "cancelProject — 내부 주소를 열지 않는다").

  return router;
}
