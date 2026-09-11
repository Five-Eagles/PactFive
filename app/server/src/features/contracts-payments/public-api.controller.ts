import type { Request, Response } from 'express';
import { isDomainContractError } from './project-transaction.types';
import { isPublicApiError, type AuthContext } from './public-api.types';
import type { createPublicApiService } from './public-api.service';

/**
 * 공개 API 7종 컨트롤러 — HTTP 경계 변환만 한다 (project-management의 project.controller.ts와
 * 같은 원칙). 비즈니스 판단은 public-api.service.ts에 있다.
 */

type PublicApiService = ReturnType<typeof createPublicApiService>;

function toAuth(req: Request): AuthContext | null {
  return req.user ? { userId: req.user.userId, role: req.user.role } : null;
}

function sendError(res: Response, error: unknown): void {
  if (isDomainContractError(error)) {
    res.status(error.httpStatus).json(error.body);
    return;
  }
  if (isPublicApiError(error)) {
    res.status(error.httpStatus).json(error.body);
    return;
  }
  // 2026-09-10 추가 — project-management/project.controller.ts와 동일한 이유(그쪽 주석
  // 참고): 로깅 없이 500만 던지면 서버 콘솔에 흔적이 안 남는다.
  console.error('[contracts-payments] 예상하지 못한 오류:', error);
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: '예상하지 못한 오류입니다.', details: null } });
}

export function createPublicApiController(service: PublicApiService) {
  return {
    async getCurrentOffer(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getCurrentNegotiationOffer(req.params.projectId, toAuth(req));
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async proposeOffer(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await service.proposeNegotiationOffer(req.params.projectId, toAuth(req), {
          amount: Number(body.amount),
          currency: 'KRW',
        });
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async counterOffer(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await service.counterNegotiationOffer(
          req.params.projectId,
          req.params.offerId,
          toAuth(req),
          {
            amount: Number(body.amount),
            currency: 'KRW',
            expectedRound: Number(body.expectedRound),
          },
        );
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async acceptOffer(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await service.acceptNegotiationOffer(
          req.params.projectId,
          req.params.offerId,
          toAuth(req),
          { expectedRound: Number(body.expectedRound) },
        );
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async rejectOffer(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await service.rejectNegotiationOffer(
          req.params.projectId,
          req.params.offerId,
          toAuth(req),
          {
            reasonCode: String(body.reasonCode ?? ''),
            reason: typeof body.reason === 'string' ? body.reason : undefined,
          },
        );
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async getContract(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getContract(req.params.contractId, toAuth(req));
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async signContract(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.signContract(req.params.contractId, toAuth(req));
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async preparePayment(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await service.preparePayment(toAuth(req), {
          contractId: String(body.contractId ?? ''),
        });
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async getPayment(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getPayment(req.params.paymentId, toAuth(req));
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async confirmPayment(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await service.confirmPayment(toAuth(req), {
          orderId: String(body.orderId ?? ''),
          amount: Number(body.amount),
          paymentKey: String(body.paymentKey ?? ''),
        });
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async getSettlement(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getSettlement(req.params.paymentId, toAuth(req));
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async getCancellation(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getCancellation(req.params.projectId, toAuth(req));
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async getDelivery(req: Request, res: Response): Promise<void> {
      try {
        const result = await service.getDelivery(req.params.contractId, toAuth(req));
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async prepareDeliveryUpload(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await service.prepareDeliveryUpload(req.params.contractId, toAuth(req), {
          fileName: String(body.fileName ?? ''),
          contentType: String(body.contentType ?? ''),
          size: Number(body.size),
          sha256: String(body.sha256 ?? ''),
        });
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async requestDelivery(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const idempotencyKey = String(req.header('Idempotency-Key') ?? body.idempotencyKey ?? '');
        if (!idempotencyKey) {
          res.status(422).json({
            error: { code: 'VALIDATION_ERROR', message: 'Idempotency-Key가 필요합니다.', details: null },
          });
          return;
        }
        const result = await service.requestDelivery(req.params.contractId, toAuth(req), {
          objectKey: String(body.objectKey ?? ''),
          uploadId: String(body.uploadId ?? ''),
          message: String(body.message ?? ''),
          idempotencyKey,
        });
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    async approveDelivery(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const idempotencyKey = String(req.header('Idempotency-Key') ?? body.idempotencyKey ?? '');
        if (!idempotencyKey) {
          res.status(422).json({
            error: { code: 'VALIDATION_ERROR', message: 'Idempotency-Key가 필요합니다.', details: null },
          });
          return;
        }
        const result = await service.approveDelivery(req.params.contractId, toAuth(req), {
          expectedVersion:
            typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
          idempotencyKey,
        });
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },

    /** 인바운드 — 유동우(project-management) → 조준영. requireServiceToken으로 보호한다. */
    async invalidateAgreement(req: Request, res: Response): Promise<void> {
      try {
        const body = req.body as Record<string, unknown>;
        const result = await service.invalidateAgreement(req.params.projectId, {
          cancellationId: typeof body.cancellationId === 'string' ? body.cancellationId : undefined,
          cancellationEventId:
            typeof body.cancellationEventId === 'string' ? body.cancellationEventId : undefined,
          actorUserId: String(body.actorUserId ?? ''),
          reason: 'PROJECT_CANCELED',
          projectCanceledAt:
            typeof body.projectCanceledAt === 'string' ? body.projectCanceledAt : undefined,
          requestId: String(body.requestId ?? ''),
          idempotencyKey: String(body.idempotencyKey ?? ''),
          occurredAt: typeof body.occurredAt === 'string' ? body.occurredAt : undefined,
        });
        res.status(200).json(result);
      } catch (error) {
        sendError(res, error);
      }
    },
  };
}

/**
 * `PG_SECRET_KEY`가 없을 때 결제 준비·확정을 503으로 먼저 끊는다
 * (`app/server/src/shared/require-service-token.ts`의 fail-closed 패턴과 같다).
 * PaymentPanel의 "연동 준비 중"(키 없음) 화면이 이 응답을 받는다.
 */
export function requirePgConfigured(configured: boolean) {
  return (_req: Request, res: Response, next: () => void) => {
    if (!configured) {
      res.status(503).json({
        error: {
          code: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
          message: '결제 연동이 설정되지 않았습니다.',
          details: null,
        },
      });
      return;
    }
    next();
  };
}
