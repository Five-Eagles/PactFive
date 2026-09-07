import type { ProjectTransactionPort } from './project-transaction.port';
import type { PaymentGateway } from './payment.port';
import { isPaymentGatewayError } from './payment.port';
import { DomainContractError } from './project-transaction.types';
import type {
  ContractsPaymentsRepository,
  AgreementRow,
  ContractRow,
} from './in-memory-contracts-payments.repository';
import {
  PublicApiError,
  type AcceptNegotiationOfferInput,
  type AuthContext,
  type ConfirmPaymentInput,
  type ConfirmPaymentResponse,
  type CurrentNegotiationOfferResponse,
  type GetContractResponse,
  type GetPaymentResponse,
  type PreparePaymentInput,
  type PreparePaymentResponse,
  type ProposeNegotiationOfferInput,
  type RejectNegotiationOfferInput,
  type SignContractResponse,
} from './public-api.types';

/**
 * 공개 API 7종(합의·서명·결제) 서비스.
 *
 * 원본: features/contracts-payments/prototype/mock/public-api.mock.ts (67207c8)의 판정 로직을
 * 그대로 옮기되, 저장소는 시드값 없는 `ContractsPaymentsRepository`를 쓰고 내부 계약 4함수는
 * 실제 `ProjectTransactionPort`(project-management 어댑터, app.ts 조립)를 부른다.
 *
 * **알려진 범위 제한 (2026-09-03, 팀장)**: `acceptedApplicationId`가 실제로 어떤 사용자(프리랜서)의
 * 지원인지는 이 서비스가 조회할 방법이 없다 — applications 기능이 아직 app/에 통합되지 않았다
 * (App.tsx의 NOT_INTEGRATED_ROUTES 참고). 그래서 "프리랜서 본인 검증"을 지원서 단위로 하지
 * 못하고, `acceptNegotiationOffer`를 처음 호출한 의뢰인이 아닌 사용자를 그 거래의 프리랜서로
 * 확정해 계약 행에 기록한다 — 이후의 서명·결제 조회는 그렇게 확정된 두 당사자만 허용한다.
 * 진짜 위험(제3자가 먼저 accept를 채가는 것)은 남아 있다 — applications 기능이 붙으면
 * `getProjectNegotiationContext`에 프리랜서 id를 추가하거나 이 서비스가 그 포트를 호출해
 * 대조하도록 바꿔야 한다. feedback_loop/2026-09-03/contracts-payments.md 참고.
 */

export type PreparePaymentDeps = {
  repo: ContractsPaymentsRepository;
  projectPort: ProjectTransactionPort;
  /**
   * 없으면(PG_SECRET_KEY 미설정) `requirePgConfigured` 미들웨어가 503으로 먼저 끊어
   * preparePayment·confirmPayment까지 오지 않는다. 그래도 null을 허용해 두는 것은
   * 방어적 이중 검사다 — 조립 지점(app.ts) 실수로 미들웨어가 빠져도 500으로는 끊긴다.
   */
  paymentGateway: PaymentGateway | null;
  now: () => string;
  randomId: (prefix: string) => string;
  /** PaymentPanel과 같은 공식(규칙 19) — 원 미만 버림. */
  platformFeeRate?: number;
};

function latestOffer(row: AgreementRow) {
  return row.offers[row.offers.length - 1];
}

function toCurrent(
  repo: ContractsPaymentsRepository,
  projectId: string,
): CurrentNegotiationOfferResponse {
  const agreement = repo.findAgreementByProjectId(projectId);
  const contract = repo.findContractByProjectId(projectId);
  const offer = agreement ? latestOffer(agreement) : undefined;
  return {
    projectId,
    agreementId: agreement?.agreementId ?? null,
    agreementStatus: agreement?.status ?? null,
    offer: offer
      ? {
          offerId: offer.offerId,
          round: offer.round,
          amount: offer.amount,
          currency: 'KRW',
          offeredByUserId: offer.offeredByUserId,
        }
      : null,
    contractId: contract?.contractId ?? null,
    contractStatus: contract?.status ?? null,
  };
}

function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

function laterDate(start: string, end: string): string {
  return end < start ? start : end;
}

export function createPublicApiService({
  repo,
  projectPort,
  paymentGateway,
  now,
  randomId,
  platformFeeRate = 0.1,
}: PreparePaymentDeps) {
  async function requireParty(projectId: string, auth: AuthContext | null) {
    if (!auth) throw new PublicApiError('AUTH_REQUIRED', '로그인이 필요합니다.');
    const ctx = await projectPort.getProjectNegotiationContext(projectId);
    return ctx;
  }

  async function requireContractParty(contractId: string, auth: AuthContext | null): Promise<ContractRow> {
    if (!auth) throw new PublicApiError('AUTH_REQUIRED', '로그인이 필요합니다.');
    const row = repo.findContractById(contractId);
    if (!row) throw new DomainContractError('PROJECT_NOT_FOUND', '계약을 찾을 수 없습니다.');
    if (auth.userId !== row.clientId && auth.userId !== row.freelancerId) {
      throw new PublicApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
    }
    return row;
  }

  return {
    async getCurrentNegotiationOffer(
      projectId: string,
      auth: AuthContext | null,
    ): Promise<CurrentNegotiationOfferResponse> {
      await requireParty(projectId, auth);
      return toCurrent(repo, projectId);
    },

    async proposeNegotiationOffer(
      projectId: string,
      auth: AuthContext | null,
      input: ProposeNegotiationOfferInput,
    ): Promise<CurrentNegotiationOfferResponse> {
      const ctx = await requireParty(projectId, auth);
      if (auth!.userId !== ctx.clientId) {
        throw new PublicApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
      }
      if (!input.amount || input.currency !== 'KRW') {
        throw new DomainContractError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
          { field: 'amount', reason: 'required' },
        ]);
      }
      if (ctx.transactionStatus !== 'CONTRACT_PENDING' || !ctx.acceptedApplicationId) {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      if (repo.findAgreementByProjectId(projectId)) {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      const agreementId = randomId('agr');
      const offer = {
        offerId: randomId('ofr'),
        round: 1,
        amount: input.amount,
        offeredByUserId: auth!.userId,
        rejectedReason: null,
      };
      repo.saveAgreement({
        agreementId,
        projectId,
        applicationId: ctx.acceptedApplicationId,
        proposedByUserId: auth!.userId,
        status: 'PROPOSED',
        agreedAmount: input.amount,
        respondedAt: null,
        offers: [offer],
      });
      return toCurrent(repo, projectId);
    },

    async acceptNegotiationOffer(
      projectId: string,
      offerId: string,
      auth: AuthContext | null,
      input: AcceptNegotiationOfferInput,
    ): Promise<CurrentNegotiationOfferResponse> {
      const ctx = await requireParty(projectId, auth);
      const idemKey = `negotiation-accept-${offerId}`;
      const cached = repo.getIdempotent<CurrentNegotiationOfferResponse>('accept', idemKey);
      if (cached) return { ...cached };

      const agreement = repo.findAgreementByProjectId(projectId);
      if (!agreement) {
        throw new DomainContractError('PROJECT_NOT_FOUND', '합의를 찾을 수 없습니다.');
      }
      const offer = latestOffer(agreement);
      if (offer.offerId !== offerId || input.expectedRound !== offer.round) {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.',
        );
      }
      // 위 파일 상단 주석 참고 — 의뢰인이 아닌 사용자를 이 거래의 프리랜서로 확정한다.
      if (auth!.userId === ctx.clientId) {
        throw new PublicApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
      }
      if (agreement.status === 'ACCEPTED') {
        const current = toCurrent(repo, projectId);
        repo.setIdempotent('accept', idemKey, current);
        return current;
      }
      if (agreement.status !== 'PROPOSED') {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      agreement.status = 'ACCEPTED';
      agreement.respondedAt = now();
      agreement.agreedAmount = offer.amount;
      repo.saveAgreement(agreement);

      const workStartDate = utcDate(now());
      const workEndDate = laterDate(workStartDate, utcDate(ctx.recruitmentDeadlineAt));
      const contractId = randomId('ctr');
      repo.saveContract({
        contractId,
        agreementId: agreement.agreementId,
        projectId,
        clientId: ctx.clientId,
        freelancerId: auth!.userId,
        agreedAmount: offer.amount,
        // project-management이 아직 프로젝트 제목을 이 컨텍스트에 주지 않는다 — 계약 열람
        // 시 항상 project-management API로 다시 읽어야 하는 부담을 피하려고 지금은 자리표시자를
        // 둔다. 실제 제목이 필요해지면 negotiation-context 응답에 필드 추가를 요청한다.
        projectTitleSnapshot: '',
        workStartDate,
        workEndDate,
        termsSnapshot: {
          schemaVersion: 1,
          amount: offer.amount,
          currency: 'KRW',
          projectTitle: '',
        },
        status: 'DRAFT',
        clientSignedAt: null,
        freelancerSignedAt: null,
        signedAt: null,
      });
      const current = toCurrent(repo, projectId);
      repo.setIdempotent('accept', idemKey, current);
      return current;
    },

    async rejectNegotiationOffer(
      projectId: string,
      offerId: string,
      auth: AuthContext | null,
      input: RejectNegotiationOfferInput,
    ): Promise<CurrentNegotiationOfferResponse> {
      const ctx = await requireParty(projectId, auth);
      const agreement = repo.findAgreementByProjectId(projectId);
      if (!agreement) {
        throw new DomainContractError('PROJECT_NOT_FOUND', '합의를 찾을 수 없습니다.');
      }
      const idemKey = `negotiation-reject-${agreement.agreementId}`;
      const cached = repo.getIdempotent<CurrentNegotiationOfferResponse>('reject', idemKey);
      if (cached) return { ...cached };

      const offer = latestOffer(agreement);
      if (offer.offerId !== offerId) {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      if (auth!.userId === ctx.clientId) {
        throw new PublicApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
      }
      if (!input.reasonCode) {
        throw new DomainContractError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
          { field: 'reasonCode', reason: 'required' },
        ]);
      }
      agreement.status = 'REJECTED';
      agreement.respondedAt = now();
      offer.rejectedReason = input.reason ?? input.reasonCode;
      repo.saveAgreement(agreement);

      // 규칙 5 — 거절은 복원을 부른다 (CR-0002: acceptedApplicationId·paymentPendingAt도 비운다).
      await projectPort.restorePreContractProject(projectId, {
        negotiationId: agreement.agreementId,
        offerId,
        actorUserId: auth!.userId,
        reason: 'FREELANCER_REJECTED',
        requestId: randomId('req_reject'),
        idempotencyKey: idemKey,
        occurredAt: now(),
      });
      const current = toCurrent(repo, projectId);
      repo.setIdempotent('reject', idemKey, current);
      return current;
    },

    async getContract(contractId: string, auth: AuthContext | null): Promise<GetContractResponse> {
      const row = await requireContractParty(contractId, auth);
      return {
        contractId: row.contractId,
        status: row.status,
        termsSnapshot: row.termsSnapshot,
        clientSignedAt: row.clientSignedAt,
        freelancerSignedAt: row.freelancerSignedAt,
        signedAt: row.signedAt,
      };
    },

    async signContract(contractId: string, auth: AuthContext | null): Promise<SignContractResponse> {
      const row = await requireContractParty(contractId, auth);
      const ctx = await projectPort.getProjectNegotiationContext(row.projectId);
      if (ctx.canceledAt || row.status === 'CANCELED') {
        throw new DomainContractError('PROJECT_TRANSITION_CONFLICT', '프로젝트가 취소되었습니다.');
      }
      const idemKey = `contract-sign-${contractId}-${auth!.userId}`;
      const cached = repo.getIdempotent<SignContractResponse>('sign', idemKey);
      if (cached) return { ...cached, alreadyProcessed: true };
      if (row.status !== 'DRAFT' && row.status !== 'SIGNING') {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      const signedAt = now();
      if (auth!.userId === row.clientId) {
        if (!row.clientSignedAt) row.clientSignedAt = signedAt;
      } else if (!row.freelancerSignedAt) {
        row.freelancerSignedAt = signedAt;
      }
      repo.recordSignature({ contractId, signerId: auth!.userId, signedAt });
      if (row.clientSignedAt && row.freelancerSignedAt) {
        row.status = 'SIGNED';
        row.signedAt = signedAt;
      } else {
        row.status = 'SIGNING';
      }
      repo.saveContract(row);
      const response: SignContractResponse = {
        contractId: row.contractId,
        status: row.status === 'SIGNED' ? 'SIGNED' : 'SIGNING',
        clientSignedAt: row.clientSignedAt,
        freelancerSignedAt: row.freelancerSignedAt,
        signedAt: row.signedAt,
        alreadyProcessed: false,
      };
      repo.setIdempotent('sign', idemKey, response);
      return response;
    },

    /** 규칙 6 — 준비 직전에 project-management의 mark-payment-pending을 부른다. */
    async preparePayment(
      auth: AuthContext | null,
      input: PreparePaymentInput,
    ): Promise<PreparePaymentResponse> {
      const row = await requireContractParty(input.contractId, auth);
      if (row.status !== 'SIGNED') {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      const existing = repo.findPaymentByContractId(input.contractId);
      if (existing && (existing.status === 'READY' || existing.status === 'PAID')) {
        return {
          paymentId: existing.paymentId,
          orderId: existing.orderId,
          amount: existing.amount,
          clientKey: existing.clientKey,
        };
      }
      if (existing && existing.status === 'PENDING') {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }

      if (!paymentGateway) {
        throw new Error('PaymentGateway가 설정되지 않았습니다 (PG_SECRET_KEY 미설정).');
      }

      await projectPort.markPaymentPending(row.projectId, {
        contractId: row.contractId,
        requestId: randomId('req_pay_pending'),
        idempotencyKey: `payment-pending-${row.contractId}`,
        occurredAt: now(),
      });

      const platformFeeAmount = Math.floor(row.agreedAmount * platformFeeRate);
      const settlementAmount = row.agreedAmount - platformFeeAmount;
      const paymentId = existing?.paymentId ?? randomId('pay');
      const orderId = randomId('ord');
      repo.savePayment({
        paymentId,
        contractId: row.contractId,
        orderId,
        amount: row.agreedAmount,
        platformFeeAmount,
        settlementAmount,
        status: 'READY',
        // 서버 시크릿이 아니다 (api-contract.md) — 프론트에 그대로 내려준다.
        clientKey: process.env.PG_CLIENT_KEY ?? '',
        paymentKey: null,
        failedAt: null,
        failureCode: null,
      });
      return { paymentId, orderId, amount: row.agreedAmount, clientKey: process.env.PG_CLIENT_KEY ?? '' };
    },

    async getPayment(paymentId: string, auth: AuthContext | null): Promise<GetPaymentResponse> {
      const row = repo.findPaymentById(paymentId);
      if (!row) throw new DomainContractError('PROJECT_NOT_FOUND', '결제를 찾을 수 없습니다.');
      await requireContractParty(row.contractId, auth);
      return { paymentId: row.paymentId, orderId: row.orderId, amount: row.amount, status: row.status };
    },

    /** 규칙 9 — 성공 시 PAID 확정 후 규칙 3 start-transaction. */
    async confirmPayment(
      auth: AuthContext | null,
      input: ConfirmPaymentInput,
    ): Promise<ConfirmPaymentResponse> {
      const row = repo.findPaymentByOrderId(input.orderId);

      if (!row) {
        throw new DomainContractError('PROJECT_NOT_FOUND', '결제를 찾을 수 없습니다.');
      }
      if (!paymentGateway) {
        throw new Error('PaymentGateway가 설정되지 않았습니다 (PG_SECRET_KEY 미설정).');
      }
      await requireContractParty(row.contractId, auth);
      if (row.status !== 'READY' && row.status !== 'PENDING') {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      if (input.amount !== row.amount) {
        throw new DomainContractError('VALIDATION_ERROR', '결제 금액이 계약 금액과 다릅니다.', [
          { field: 'amount', reason: 'PAYMENT_AMOUNT_MISMATCH' },
        ]);
      }
      row.status = 'PENDING';
      repo.savePayment(row);
      try {
        const paid = await paymentGateway.confirmPayment(input);
        row.status = 'PAID';
        row.paymentKey = paid.paymentKey;
        row.failedAt = null;
        row.failureCode = null;
        repo.savePayment(row);

        const contract = repo.findContractById(row.contractId);
        if (contract) {
          // I-30은 호출자가 지킨다 — 여기서는 PAID 직후 start만 부른다 (규칙 3).
          await projectPort.startProjectTransaction(contract.projectId, {
            contractId: contract.contractId,
            requestId: randomId('req_start'),
            idempotencyKey: `transaction-start-${contract.contractId}`,
            occurredAt: now(),
            expectedProjectVersion: (await projectPort.getProjectNegotiationContext(contract.projectId))
              .projectVersion,
          });
        }
        return paid;
      } catch (err) {
        if (isPaymentGatewayError(err)) {
          row.status = 'FAILED';
          row.failureCode = err.code;
          repo.savePayment(row);
        }
        throw err;
      }
    },
  };
}
