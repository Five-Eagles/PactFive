import type { Request, Response } from 'express';
import { isProjectContractError } from './project.types';
import type {
  ContractEnvelope,
  ProjectTransactionPort,
  RestoreReason,
} from './project-transaction.port';

/**
 * 내부 계약 API 컨트롤러 (`/internal/v1/projects/:projectId/...`).
 *
 * 2026-08-27 통합에서는 같은 경로를 contracts-payments 폴더의
 * `project-transaction.controller.ts` 가 서빙했다. api-contract.md 가 정한 대로
 * **이 경로의 구현자는 project-management** 이므로 이번 통합에서 여기로 옮겼다
 * (feedback_loop/2026-08-28/project-management.md 항목 1). 경로와 요청/응답 형태는
 * 그대로다 — "되돌리기 비싼 것"을 이관하면서 바꾸지 않았다.
 *
 * 인증은 `shared/require-service-token.ts` 다 (spec.md 규칙 49 · api-contract J1) —
 * 사용자 로그인 토큰으로는 접근할 수 없다.
 */

function sendDomainError(res: Response, error: unknown): void {
  if (isProjectContractError(error)) {
    res.status(error.status).json(error.body);
    return;
  }
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: '예상하지 못한 오류입니다.', details: null } });
}

function sendValidationError(res: Response, field: string): void {
  res.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: '요청 값이 올바르지 않습니다.',
      details: [{ field, reason: 'required' }],
    },
  });
}

/**
 * 공통 봉투를 읽는다. 세 필드가 모두 있어야 한다 (api-contract.md "공통 봉투").
 * `expectedProjectVersion` 의 필수 여부는 함수마다 달라 서비스가 판정한다 (규칙 51).
 */
function readEnvelope(body: Record<string, unknown>): ContractEnvelope | { missing: string } {
  const { requestId, idempotencyKey, occurredAt, expectedProjectVersion, actorUserId } = body;
  if (typeof requestId !== 'string' || !requestId) return { missing: 'requestId' };
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) return { missing: 'idempotencyKey' };
  if (typeof occurredAt !== 'string' || !occurredAt) return { missing: 'occurredAt' };
  return {
    requestId,
    idempotencyKey,
    occurredAt,
    expectedProjectVersion:
      expectedProjectVersion === undefined ? undefined : Number(expectedProjectVersion),
    actorUserId: typeof actorUserId === 'string' ? actorUserId : undefined,
  };
}

function isMissing(v: ContractEnvelope | { missing: string }): v is { missing: string } {
  return 'missing' in v;
}

export function createProjectContractController(port: ProjectTransactionPort) {
  return {
    /** GET /internal/v1/projects/:projectId/negotiation-context */
    async getNegotiationContext(req: Request, res: Response): Promise<void> {
      try {
        res.status(200).json(await port.getProjectNegotiationContext(req.params.projectId));
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** POST /internal/v1/projects/:projectId/accept-application */
    async acceptApplication(req: Request, res: Response): Promise<void> {
      const body = req.body as Record<string, unknown>;
      const envelope = readEnvelope(body);
      if (isMissing(envelope)) return sendValidationError(res, envelope.missing);
      if (typeof body.applicationId !== 'string' || !body.applicationId) {
        return sendValidationError(res, 'applicationId');
      }
      try {
        const result = await port.acceptProjectApplication(req.params.projectId, {
          ...envelope,
          applicationId: body.applicationId,
          actorUserId: envelope.actorUserId ?? '',
        });
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** POST /internal/v1/projects/:projectId/mark-payment-pending */
    async markPaymentPending(req: Request, res: Response): Promise<void> {
      const body = req.body as Record<string, unknown>;
      const envelope = readEnvelope(body);
      if (isMissing(envelope)) return sendValidationError(res, envelope.missing);
      if (typeof body.contractId !== 'string' || !body.contractId) {
        return sendValidationError(res, 'contractId');
      }
      try {
        const result = await port.markPaymentPending(req.params.projectId, {
          ...envelope,
          contractId: body.contractId,
        });
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** POST /internal/v1/projects/:projectId/start-transaction */
    async startTransaction(req: Request, res: Response): Promise<void> {
      const body = req.body as Record<string, unknown>;
      const envelope = readEnvelope(body);
      if (isMissing(envelope)) return sendValidationError(res, envelope.missing);
      if (typeof body.contractId !== 'string' || !body.contractId) {
        return sendValidationError(res, 'contractId');
      }
      try {
        // expectedProjectVersion 누락은 서비스가 422 로 끊는다 (규칙 51) — 여기서
        // 기본값을 채우면 그 검사가 무력해진다. 타입만 맞추고 값은 그대로 넘긴다.
        const result = await port.startProjectTransaction(req.params.projectId, {
          ...envelope,
          contractId: body.contractId,
          expectedProjectVersion: envelope.expectedProjectVersion as number,
        });
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** POST /internal/v1/projects/:projectId/complete-transaction */
    async completeTransaction(req: Request, res: Response): Promise<void> {
      const body = req.body as Record<string, unknown>;
      const envelope = readEnvelope(body);
      if (isMissing(envelope)) return sendValidationError(res, envelope.missing);
      if (typeof body.contractId !== 'string' || !body.contractId) {
        return sendValidationError(res, 'contractId');
      }
      try {
        const result = await port.completeProjectTransaction(req.params.projectId, {
          ...envelope,
          contractId: body.contractId,
          expectedProjectVersion: envelope.expectedProjectVersion as number,
        });
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** POST /internal/v1/projects/:projectId/restore-pre-contract */
    async restorePreContract(req: Request, res: Response): Promise<void> {
      const body = req.body as Record<string, unknown>;
      const envelope = readEnvelope(body);
      if (isMissing(envelope)) return sendValidationError(res, envelope.missing);
      if (typeof body.negotiationId !== 'string' || !body.negotiationId) {
        return sendValidationError(res, 'negotiationId');
      }
      if (body.reason !== 'FREELANCER_REJECTED' && body.reason !== 'CLIENT_REJECTED') {
        return sendValidationError(res, 'reason');
      }
      try {
        const result = await port.restorePreContractProject(req.params.projectId, {
          ...envelope,
          negotiationId: body.negotiationId,
          offerId: typeof body.offerId === 'string' ? body.offerId : undefined,
          reason: body.reason as RestoreReason,
        });
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    /** POST /internal/v1/projects/:projectId/apply-pricing-budget */
    async applyPricingBudget(req: Request, res: Response): Promise<void> {
      const body = req.body as Record<string, unknown>;
      const envelope = readEnvelope(body);
      if (isMissing(envelope)) return sendValidationError(res, envelope.missing);
      if (typeof body.pricingAnalysisId !== 'string' || !body.pricingAnalysisId) {
        return sendValidationError(res, 'pricingAnalysisId');
      }
      try {
        const result = await port.applyPricingAnalysisBudget(req.params.projectId, {
          ...envelope,
          pricingAnalysisId: body.pricingAnalysisId,
          actorUserId: envelope.actorUserId ?? '',
        });
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  };
}
