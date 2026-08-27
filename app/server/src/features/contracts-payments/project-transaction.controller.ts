import type { Request, Response } from 'express';
import type { ProjectTransactionPort } from './project-transaction.port';
import { isDomainContractError } from './project-transaction.types';
import type {
  CompleteProjectTransactionInput,
  MarkPaymentPendingInput,
  RestorePreContractProjectInput,
  StartProjectTransactionInput,
} from './project-transaction.types';
import type {
  ProjectTransactionCallLogRepository,
  ProjectTransactionOperation,
} from './project-transaction.repository';

/**
 * project-transaction 내부 API 컨트롤러 — 팀장이 새로 작성했다 (원본 프로토타입에 없음).
 *
 * spec.md·api-contract.md에 정의된 경로·요청/응답 형태를 그대로 따른다(엔드포인트 경로는 이미
 * 조준영·유동우 사이에 합의된 FACT라 바꾸지 않았다). 다만 이 라우트의 "진짜 구현자"는
 * project-management(유동우)이고 조준영은 원래 **호출자**다(api-contract.md "유동우 Mock이
 * 구현, 조준영 Mock이 호출"). project-management가 아직 app/server에 통합되지 않아, 통합을
 * 멈추지 않기 위해 이번 반영에서는 contracts-payments가 이 라우트를 잠정적으로 직접 서빙한다
 * (`in-memory-project-transaction.adapter.ts`가 project-management 서버 역할을 대신한다).
 * project-management 통합 시 이 컨트롤러/라우트를 그쪽 폴더로 옮기는 걸 검토해야 한다 —
 * feedback_loop에 기록했다.
 *
 * 인증: api-contract.md 규칙 1(J1)이 "서버 간 토큰. 브라우저·사용자 토큰 거부"를 명시해
 * `shared/require-service-token.ts`로 보호한다 — user-management의 `requireAuth`(사용자 Access
 * Token)를 쓰지 않는다.
 */

function requireEnvelopeFields(
  body: Record<string, unknown>,
): { requestId: string; idempotencyKey: string; occurredAt: string } | null {
  const { requestId, idempotencyKey, occurredAt } = body;
  if (typeof requestId !== 'string' || !requestId) return null;
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) return null;
  if (typeof occurredAt !== 'string' || !occurredAt) return null;
  return { requestId, idempotencyKey, occurredAt };
}

function sendValidationError(res: Response, field: string, reason = 'required'): void {
  res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: '요청 값이 올바르지 않습니다.', details: [{ field, reason }] } });
}

function sendDomainError(res: Response, error: unknown): void {
  if (isDomainContractError(error)) {
    res.status(error.httpStatus).json(error.body);
    return;
  }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '예상하지 못한 오류입니다.', details: null } });
}

export function createProjectTransactionController(
  port: ProjectTransactionPort,
  callLog: ProjectTransactionCallLogRepository,
) {
  async function withCallLog<T>(
    projectId: string,
    operation: ProjectTransactionOperation,
    idempotencyKey: string,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await run();
      await callLog.record({
        projectId,
        operation,
        idempotencyKey,
        requestedAt: new Date(),
        succeeded: true,
        errorCode: null,
      });
      return result;
    } catch (error) {
      await callLog.record({
        projectId,
        operation,
        idempotencyKey,
        requestedAt: new Date(),
        succeeded: false,
        errorCode: isDomainContractError(error) ? error.body.error.code : 'UNKNOWN',
      });
      throw error;
    }
  }

  return {
    getNegotiationContext: async (req: Request, res: Response) => {
      try {
        const result = await port.getProjectNegotiationContext(req.params.projectId);
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    markPaymentPending: async (req: Request, res: Response) => {
      const envelope = requireEnvelopeFields(req.body ?? {});
      if (!envelope) return sendValidationError(res, 'requestId');
      if (typeof req.body?.contractId !== 'string' || !req.body.contractId) {
        return sendValidationError(res, 'contractId');
      }
      const input: MarkPaymentPendingInput = {
        ...envelope,
        expectedProjectVersion: req.body.expectedProjectVersion,
        contractId: req.body.contractId,
      };
      try {
        const result = await withCallLog(req.params.projectId, 'MARK_PAYMENT_PENDING', envelope.idempotencyKey, () =>
          port.markPaymentPending(req.params.projectId, input),
        );
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    startTransaction: async (req: Request, res: Response) => {
      const envelope = requireEnvelopeFields(req.body ?? {});
      if (!envelope) return sendValidationError(res, 'requestId');
      if (typeof req.body?.expectedProjectVersion !== 'number') {
        return sendValidationError(res, 'expectedProjectVersion');
      }
      // 규칙 2: 조준영 서버가 실제로 계약(SIGNED)·결제(PAID) 완료와 acceptedApplicationId 일치를
      // 대조하는 건 contracts/agreements 데이터가 있어야 한다 — Prisma 스키마가 비어 있는 지금은
      // 그 캐일러측 가드(`startProjectTransactionIfAccepted`, project-transaction.service.ts)를
      // 아직 걸 수 없다. 스키마가 채워지면 여기서 그 함수를 쓰도록 바꾼다 (feedback_loop 기록).
      const input: StartProjectTransactionInput = { ...envelope, expectedProjectVersion: req.body.expectedProjectVersion };
      try {
        const result = await withCallLog(req.params.projectId, 'START_TRANSACTION', envelope.idempotencyKey, () =>
          port.startProjectTransaction(req.params.projectId, input),
        );
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    completeTransaction: async (req: Request, res: Response) => {
      const envelope = requireEnvelopeFields(req.body ?? {});
      if (!envelope) return sendValidationError(res, 'requestId');
      if (typeof req.body?.expectedProjectVersion !== 'number') {
        return sendValidationError(res, 'expectedProjectVersion');
      }
      // I-30(납품 APPROVED ∧ 정산 RELEASED)도 위와 같은 이유로 호출자측에서 아직 못 지킨다.
      const input: CompleteProjectTransactionInput = { ...envelope, expectedProjectVersion: req.body.expectedProjectVersion };
      try {
        const result = await withCallLog(req.params.projectId, 'COMPLETE_TRANSACTION', envelope.idempotencyKey, () =>
          port.completeProjectTransaction(req.params.projectId, input),
        );
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },

    restorePreContract: async (req: Request, res: Response) => {
      const envelope = requireEnvelopeFields(req.body ?? {});
      if (!envelope) return sendValidationError(res, 'requestId');
      const { negotiationId, actorUserId, reason, offerId } = req.body ?? {};
      const details: Array<{ field: string; reason: string }> = [];
      if (typeof negotiationId !== 'string' || !negotiationId) details.push({ field: 'negotiationId', reason: 'required' });
      if (typeof actorUserId !== 'string' || !actorUserId) details.push({ field: 'actorUserId', reason: 'required' });
      if (reason !== 'FREELANCER_REJECTED' && reason !== 'CLIENT_REJECTED') details.push({ field: 'reason', reason: 'invalid' });
      if (details.length > 0) {
        res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: '요청 값이 올바르지 않습니다.', details } });
        return;
      }
      const input: RestorePreContractProjectInput = {
        ...envelope,
        negotiationId,
        offerId: typeof offerId === 'string' ? offerId : undefined,
        actorUserId,
        reason,
      };
      try {
        const result = await withCallLog(req.params.projectId, 'RESTORE_PRE_CONTRACT', envelope.idempotencyKey, () =>
          port.restorePreContractProject(req.params.projectId, input),
        );
        res.status(200).json(result);
      } catch (error) {
        sendDomainError(res, error);
      }
    },
  };
}
