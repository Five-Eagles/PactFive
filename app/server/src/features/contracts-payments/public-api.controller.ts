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
