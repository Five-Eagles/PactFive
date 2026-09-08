import type { ProjectTransactionPort } from './project-transaction.port';
import type { PaymentGateway } from './payment.port';
import { isPaymentGatewayError } from './payment.port';
import { DomainContractError } from './project-transaction.types';
import type {
  ContractsPaymentsRepository,
  AgreementRow,
  ContractRow,
  DeliveryRow,
} from './in-memory-contracts-payments.repository';
import type { NotificationTriggerPort } from './notification.port';
import { ignoreNotificationFailure } from './notification.port';
import { withActiveProjectGuard } from './project-guard';
import { splitSettlementAmounts } from './settlement-fee';
import type {
  TransactionLifecycleCoordinator,
  TransactionLifecycleSnapshot,
  TransactionLifecycleSnapshotReader,
} from './transaction-lifecycle.coordinator';
import {
  PublicApiError,
  type AcceptNegotiationOfferInput,
  type ApproveDeliveryInput,
  type AuthContext,
  type ConfirmPaymentInput,
  type ConfirmPaymentResponse,
  type CounterNegotiationOfferInput,
  type CurrentNegotiationOfferResponse,
  type GetCancellationResponse,
  type GetContractResponse,
  type GetDeliveryResponse,
  type GetPaymentResponse,
  type GetSettlementResponse,
  type InvalidateAgreementInput,
  type InvalidateAgreementResponse,
  type NegotiationOfferView,
  type PrepareDeliveryUploadInput,
  type PrepareDeliveryUploadResponse,
  type PreparePaymentInput,
  type PreparePaymentResponse,
  type ProposeNegotiationOfferInput,
  type RejectNegotiationOfferInput,
  type RequestDeliveryInput,
  type SignContractResponse,
} from './public-api.types';

/**
 * 공개 API 서비스(합의·서명·결제·납품·정산 조회·취소 조회) + 인바운드
 * `invalidateAgreement`(유동우 → 조준영).
 *
 * 원본: features/contracts-payments/prototype/mock/public-api.mock.ts (28471d6, #80)의 판정
 * 로직을 그대로 옮기되, 저장소는 시드값 없는 `ContractsPaymentsRepository`를 쓰고 내부 계약
 * 4함수는 실제 `ProjectTransactionPort`(project-management 어댑터, express-app.ts 조립)를 부른다.
 * 2026-09-07 팀장 반영에서 재제안(AGR-02/03)·납품(DLV-01)·정산 조회(SET-01 v2)·취소 조회
 * (CAN-01 v2)·교차 생명주기 Coordinator(규칙 26)를 추가했다 — sync-log.md 2026-09-03(67207c8)
 * 이후 develop에 쌓인 #53·#66·#58·#80 4개 PR 분량.
 *
 * **알려진 범위 제한 (2026-09-03, 팀장, 그대로 유지)**: `acceptedApplicationId`가 실제로 어떤
 * 사용자(프리랜서)의 지원인지는 이 서비스가 조회할 방법이 없다 — applications 기능이 수락
 * 지원서의 프리랜서 id를 이 컨텍스트에 아직 주지 않는다. 그래서 `acceptNegotiationOffer`를
 * 처음 호출한 의뢰인이 아닌 사용자를 그 거래의 프리랜서로 확정해 계약 행에 기록한다.
 * 마찬가지로 `projects.title`을 이 서비스가 조회할 방법이 없어 `projectTitleSnapshot`/
 * `projectTitle` 필드는 계속 빈 문자열이다 — negotiation-context 응답에 필드가 추가되면 채운다.
 * feedback_loop/2026-09-07/contracts-payments.md 참고.
 */

export type PublicApiServiceDeps = {
  repo: ContractsPaymentsRepository;
  projectPort: ProjectTransactionPort;
  /**
   * 없으면(PG_SECRET_KEY 미설정) `requirePgConfigured` 미들웨어가 503으로 먼저 끊어
   * preparePayment·confirmPayment까지 오지 않는다. 그래도 null을 허용해 두는 것은
   * 방어적 이중 검사다 — 조립 지점(express-app.ts) 실수로 미들웨어가 빠져도 500으로는 끊긴다.
   */
  paymentGateway: PaymentGateway | null;
  notifications: NotificationTriggerPort;
  /** 교차 생명주기 Coordinator(spec.md 규칙 26) — express-app.ts가 같은 repo로 스냅샷 리더를 물려 조립한다. */
  coordinator: TransactionLifecycleCoordinator;
  now: () => string;
  randomId: (prefix: string) => string;
  /** PaymentPanel과 같은 공식(규칙 19) — 원 미만 버림. */
  platformFeeRate?: number;
};

/** @deprecated PublicApiServiceDeps를 쓴다. 이전 이름과의 호환용. */
export type PreparePaymentDeps = PublicApiServiceDeps;

function latestOffer(row: AgreementRow) {
  return row.offers[row.offers.length - 1];
}

function toOfferView(offer: AgreementRow['offers'][number]): NegotiationOfferView {
  return {
    offerId: offer.offerId,
    round: offer.round,
    amount: offer.amount,
    currency: 'KRW',
    offeredByUserId: offer.offeredByUserId,
  };
}

function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

function laterDate(start: string, end: string): string {
  return end < start ? start : end;
}

/**
 * 교차 생명주기 Coordinator용 스냅샷 리더. `snapshots.read(projectId)`가 호출될 때마다
 * 계약·결제·납품을 이 저장소에서 다시 읽는다(Coordinator는 복사본을 저장하지 않는다).
 */
export function createContractsPaymentsSnapshotReader(
  repo: ContractsPaymentsRepository,
): TransactionLifecycleSnapshotReader {
  return {
    async read(projectId: string): Promise<TransactionLifecycleSnapshot> {
      const contract = repo.findContractByProjectId(projectId);
      if (!contract) {
        throw new Error(`contracts-payments snapshot: no contract for project ${projectId}`);
      }
      const payment = repo.findPaymentByContractId(contract.contractId);
      const delivery = repo.findDeliveryByContractId(contract.contractId);
      return {
        projectId,
        contractId: contract.contractId,
        contractApplicationId: contract.agreementId,
        freelancerId: contract.freelancerId,
        contractStatus: contract.status,
        paymentStatus: payment?.status ?? null,
        deliveryStatus: delivery?.status ?? null,
      };
    },
  };
}

export function createPublicApiService({
  repo,
  projectPort,
  paymentGateway,
  notifications,
  coordinator,
  now,
  randomId,
  platformFeeRate = 0.1,
}: PublicApiServiceDeps) {
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

  function toCurrent(projectId: string, ctx: Awaited<ReturnType<typeof requireParty>>): CurrentNegotiationOfferResponse {
    const agreement = repo.findAgreementByProjectId(projectId);
    const contract = repo.findContractByProjectId(projectId);
    const offer = agreement ? latestOffer(agreement) : undefined;
    // 합의가 REJECTED일 때만 restore 결과(재개 여부)를 채운다(api-contract.md GET .../current).
    const reopened = agreement?.status === 'REJECTED' ? ctx.recruitmentStatus === 'OPEN' : null;
    return {
      projectId,
      agreementId: agreement?.agreementId ?? null,
      agreementStatus: agreement?.status ?? null,
      offer: offer ? toOfferView(offer) : null,
      offers: agreement ? agreement.offers.map(toOfferView) : [],
      contractId: contract?.contractId ?? null,
      contractStatus: contract?.status ?? null,
      projectTitle: contract?.projectTitleSnapshot ?? '',
      recruitmentStatus: ctx.recruitmentStatus,
      transactionStatus: ctx.transactionStatus,
      canceledAt: ctx.canceledAt,
      applicationId: agreement?.applicationId ?? ctx.acceptedApplicationId,
      reopened,
      notReopenedReason: null,
    };
  }

  /** 계약당 1건. 없으면 초기 IN_PROGRESS로 만든다(spec.md 규칙 23). GET·업로드·요청 모두 이걸 거친다. */
  function ensureDeliveryForContract(contractId: string): DeliveryRow {
    const existing = repo.findDeliveryByContractId(contractId);
    if (existing) return existing;
    const row: DeliveryRow = {
      deliveryId: randomId('dlv'),
      contractId,
      status: 'IN_PROGRESS',
      version: 1,
      message: null,
      requestedAt: null,
      approvedAt: null,
      objectKey: null,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
    };
    repo.saveDelivery(row);
    return row;
  }

  return {
    async getCurrentNegotiationOffer(
      projectId: string,
      auth: AuthContext | null,
    ): Promise<CurrentNegotiationOfferResponse> {
      const ctx = await requireParty(projectId, auth);
      return toCurrent(projectId, ctx);
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
      return toCurrent(projectId, ctx);
    },

    /** AGR-02. 최신 offer 수신자만. 새 round = 최신 + 1. 합의는 PROPOSED 유지(spec.md 규칙 10). */
    async counterNegotiationOffer(
      projectId: string,
      offerId: string,
      auth: AuthContext | null,
      input: CounterNegotiationOfferInput,
    ): Promise<CurrentNegotiationOfferResponse> {
      const ctx = await requireParty(projectId, auth);
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
      if (agreement.status !== 'PROPOSED') {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      // 작성자 재응답은 403(api-contract.md 규칙 26절).
      if (auth!.userId === offer.offeredByUserId) {
        throw new PublicApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
      }
      if (!input.amount || input.currency !== 'KRW') {
        throw new DomainContractError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
          { field: 'amount', reason: 'required' },
        ]);
      }
      agreement.offers.push({
        offerId: randomId('ofr'),
        round: offer.round + 1,
        amount: input.amount,
        offeredByUserId: auth!.userId,
        rejectedReason: null,
      });
      agreement.agreedAmount = input.amount;
      repo.saveAgreement(agreement);
      return toCurrent(projectId, ctx);
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
      // 위 파일 상단 주석 참고 — 최신 offer 발신자가 아닌 사용자만 수락할 수 있다(최신 수신자).
      if (auth!.userId === offer.offeredByUserId) {
        throw new PublicApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
      }
      if (agreement.status === 'ACCEPTED') {
        const current = toCurrent(projectId, ctx);
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

      // 규칙 11: 의뢰인이 아닌 첫 accept 호출자를 프리랜서로 확정한다(파일 상단 주석).
      const freelancerId = auth!.userId === ctx.clientId ? offer.offeredByUserId : auth!.userId;
      const workStartDate = utcDate(now());
      const workEndDate = laterDate(workStartDate, utcDate(ctx.recruitmentDeadlineAt));
      const contractId = randomId('ctr');
      repo.saveContract({
        contractId,
        agreementId: agreement.agreementId,
        projectId,
        clientId: ctx.clientId,
        freelancerId,
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
      const current = toCurrent(projectId, ctx);
      repo.setIdempotent('accept', idemKey, current);
      return current;
    },

    async rejectNegotiationOffer(
      projectId: string,
      offerId: string,
      auth: AuthContext | null,
      input: RejectNegotiationOfferInput,
    ): Promise<CurrentNegotiationOfferResponse> {
      await requireParty(projectId, auth);
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
      if (auth!.userId === offer.offeredByUserId) {
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
      const refreshedCtx = await projectPort.getProjectNegotiationContext(projectId);
      const current = toCurrent(projectId, refreshedCtx);
      repo.setIdempotent('reject', idemKey, current);
      return current;
    },

    async getContract(contractId: string, auth: AuthContext | null): Promise<GetContractResponse> {
      const row = await requireContractParty(contractId, auth);
      const ctx = await projectPort.getProjectNegotiationContext(row.projectId);
      const payment = repo.findPaymentByContractId(contractId);
      return {
        contractId: row.contractId,
        projectId: row.projectId,
        status: row.status,
        termsSnapshot: row.termsSnapshot,
        workStartDate: row.workStartDate,
        workEndDate: row.workEndDate,
        clientSignedAt: row.clientSignedAt,
        freelancerSignedAt: row.freelancerSignedAt,
        signedAt: row.signedAt,
        transactionStatus: ctx.transactionStatus,
        canceledAt: ctx.canceledAt,
        paymentStatus: payment && payment.status !== 'RELEASED' ? payment.status : payment ? 'PAID' : null,
      };
    },

    /** F01: 잠금 후 재조회, 취소 커밋 이후 신규 서명 거부(spec.md 규칙 12·13). */
    async signContract(contractId: string, auth: AuthContext | null): Promise<SignContractResponse> {
      const row = await requireContractParty(contractId, auth);
      return withActiveProjectGuard(row.projectId, async () => {
        const fresh = repo.findContractById(contractId)!;
        const ctx = await projectPort.getProjectNegotiationContext(fresh.projectId);
        if (ctx.canceledAt || fresh.status === 'CANCELED') {
          throw new DomainContractError('PROJECT_TRANSITION_CONFLICT', '프로젝트가 취소되었습니다.');
        }
        const idemKey = `contract-sign-${contractId}-${auth!.userId}`;
        const cached = repo.getIdempotent<SignContractResponse>('sign', idemKey);
        if (cached) return { ...cached, alreadyProcessed: true };
        if (fresh.status !== 'DRAFT' && fresh.status !== 'SIGNING') {
          throw new DomainContractError(
            'PROJECT_TRANSITION_CONFLICT',
            '프로젝트 상태가 변경되어 처리할 수 없습니다.',
          );
        }
        const signedAt = now();
        if (auth!.userId === fresh.clientId) {
          if (!fresh.clientSignedAt) fresh.clientSignedAt = signedAt;
        } else if (!fresh.freelancerSignedAt) {
          fresh.freelancerSignedAt = signedAt;
        }
        repo.recordSignature({ contractId, signerId: auth!.userId, signedAt });
        const bothSigned = Boolean(fresh.clientSignedAt && fresh.freelancerSignedAt);
        if (bothSigned) {
          fresh.status = 'SIGNED';
          fresh.signedAt = signedAt;
        } else {
          fresh.status = 'SIGNING';
        }
        repo.saveContract(fresh);
        const response: SignContractResponse = {
          contractId: fresh.contractId,
          status: fresh.status === 'SIGNED' ? 'SIGNED' : 'SIGNING',
          clientSignedAt: fresh.clientSignedAt,
          freelancerSignedAt: fresh.freelancerSignedAt,
          signedAt: fresh.signedAt,
          alreadyProcessed: false,
        };
        repo.setIdempotent('sign', idemKey, response);
        // 교차 생명주기 Coordinator(규칙 26) — SIGNED∧PAID일 때만 start를 부른다.
        if (bothSigned) {
          await coordinator.onContractSigned({
            eventId: randomId('evt_signed'),
            projectId: fresh.projectId,
            occurredAt: signedAt,
          });
        }
        return response;
      });
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

      const platformFeeRateBps = Math.round(platformFeeRate * 10_000);
      const { platformFeeAmount, settlementAmount } = splitSettlementAmounts(
        row.agreedAmount,
        platformFeeRateBps,
      );
      const paymentId = existing?.paymentId ?? randomId('pay');
      const orderId = randomId('ord');
      repo.savePayment({
        paymentId,
        contractId: row.contractId,
        orderId,
        amount: row.agreedAmount,
        platformFeeRateBps,
        platformFeeAmount,
        settlementAmount,
        status: 'READY',
        // 서버 시크릿이 아니다 (api-contract.md) — 프론트에 그대로 내려준다.
        clientKey: process.env.PG_CLIENT_KEY ?? '',
        paymentKey: null,
        failedAt: null,
        failureCode: null,
        releasedAt: null,
      });
      return { paymentId, orderId, amount: row.agreedAmount, clientKey: process.env.PG_CLIENT_KEY ?? '' };
    },

    async getPayment(paymentId: string, auth: AuthContext | null): Promise<GetPaymentResponse> {
      const row = repo.findPaymentById(paymentId);
      if (!row) throw new DomainContractError('PROJECT_NOT_FOUND', '결제를 찾을 수 없습니다.');
      const contract = await requireContractParty(row.contractId, auth);
      const ctx = await projectPort.getProjectNegotiationContext(contract.projectId);
      const projectTransactionStatus =
        ctx.transactionStatus === 'IN_PROGRESS' || ctx.transactionStatus === 'CANCELED'
          ? ctx.transactionStatus
          : 'CONTRACT_PENDING';
      return {
        paymentId: row.paymentId,
        contractId: row.contractId,
        orderId: row.orderId,
        amount: row.amount,
        currency: 'KRW',
        platformFeeAmount: row.platformFeeAmount,
        settlementAmount: row.settlementAmount,
        status: row.status === 'RELEASED' ? 'PAID' : row.status,
        projectTitle: contract.projectTitleSnapshot,
        projectTransactionStatus,
        environment: 'SANDBOX',
      };
    },

    /** 규칙 9 — 성공 시 PAID 확정 후 교차 생명주기 Coordinator(규칙 26)가 start를 재평가한다. */
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
      const contract = await requireContractParty(row.contractId, auth);
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

        // 교차 생명주기 Coordinator(규칙 26) — SIGNED∧PAID일 때만 start를 부른다. 실패해도
        // PAID 원장은 유지하고(규칙 7), 재시도는 다음 사건(재confirm 폴링 등) 때 다시 평가한다.
        await coordinator.onPaymentPaid({
          eventId: randomId('evt_paid'),
          projectId: contract.projectId,
          occurredAt: now(),
        });
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

    // -----------------------------------------------------------------------
    // 정산 조회 (SET-01 v2, spec.md 규칙 24) — 사용자 API는 GET only.
    // -----------------------------------------------------------------------

    async getSettlement(paymentId: string, auth: AuthContext | null): Promise<GetSettlementResponse> {
      const row = repo.findPaymentById(paymentId);
      if (!row) throw new DomainContractError('PROJECT_NOT_FOUND', '결제를 찾을 수 없습니다.');
      const contract = await requireContractParty(row.contractId, auth);
      const ctx = await projectPort.getProjectNegotiationContext(contract.projectId);
      const delivery = repo.findDeliveryByContractId(row.contractId);
      const projectTransactionStatus: GetSettlementResponse['projectTransactionStatus'] =
        ctx.transactionStatus === 'IN_PROGRESS' ||
        ctx.transactionStatus === 'COMPLETED' ||
        ctx.transactionStatus === 'CANCELED'
          ? ctx.transactionStatus
          : 'CONTRACT_PENDING';
      return {
        paymentId: row.paymentId,
        contractId: row.contractId,
        projectId: contract.projectId,
        projectTitle: contract.projectTitleSnapshot,
        environment: 'SANDBOX',
        provider: 'MANUAL_SIMULATION',
        currency: 'KRW',
        paymentAmount: row.amount,
        platformFeeRateBps: row.platformFeeRateBps,
        platformFeeAmount: row.platformFeeAmount,
        settlementAmount: row.settlementAmount,
        paymentStatus: row.status,
        deliveryStatus: delivery?.status ?? null,
        projectTransactionStatus,
        canceledAt: ctx.canceledAt,
        releasedAt: row.releasedAt,
      };
    },

    /**
     * 브라우저 경로가 아니다(spec.md 규칙 24) — HTTP 라우트로 노출하지 않는다. Sandbox 정산
     * 실행은 지급 버튼이 없어, 이 함수를 직접 호출해야만(내부/테스트) RELEASED로 넘어간다.
     * `APPROVED ∧ RELEASED`가 되면 교차 생명주기 Coordinator(규칙 26)가 complete를 재평가한다.
     */
    async simulateSettlementResult(
      paymentId: string,
      result: 'SUCCESS' | 'FAILURE' | 'UNKNOWN',
    ): Promise<void> {
      const row = repo.findPaymentById(paymentId);
      if (!row) throw new DomainContractError('PROJECT_NOT_FOUND', '결제를 찾을 수 없습니다.');
      if (row.status !== 'PAID') return; // F04: 진입은 PAID∧APPROVED∧IN_PROGRESS.
      if (result === 'SUCCESS') {
        row.status = 'RELEASED';
        row.releasedAt = now();
        repo.savePayment(row);
        const contract = repo.findContractById(row.contractId);
        if (contract) {
          await coordinator.onPaymentReleased({
            eventId: randomId('evt_released'),
            projectId: contract.projectId,
            occurredAt: row.releasedAt,
          });
        }
      }
      // FAILURE → PAID 유지. UNKNOWN → PROCESSING(새 지급 없음, 여기서는 상태를 바꾸지 않는다).
    },

    // -----------------------------------------------------------------------
    // 취소 조회 (CAN-01 v2, spec.md 규칙 25)
    // -----------------------------------------------------------------------

    async getCancellation(
      projectId: string,
      auth: AuthContext | null,
    ): Promise<GetCancellationResponse> {
      const ctx = await requireParty(projectId, auth);
      const agreement = repo.findAgreementByProjectId(projectId);
      const contract = repo.findContractByProjectId(projectId);
      const invalidation = repo.findLatestInvalidationByProjectId(projectId);
      return {
        projectId,
        projectTitle: contract?.projectTitleSnapshot ?? '',
        recruitmentStatus: ctx.recruitmentStatus,
        transactionStatus: ctx.transactionStatus,
        paymentPendingAt: ctx.paymentPendingAt,
        canceledAt: ctx.canceledAt,
        acceptedApplicationId: ctx.acceptedApplicationId,
        agreementStatus: agreement?.status ?? null,
        contractStatus: contract?.status ?? null,
        hasSignatureAudit: contract ? repo.hasSignatureAudit(contract.contractId) : false,
        postActions: ctx.canceledAt
          ? {
              // 지원 일괄 거절은 최윤석(applications) 몫이다 — 이 조회는 항상 NOT_NEEDED로 둔다.
              applicationRejection: 'NOT_NEEDED',
              contractInvalidation: invalidation?.contractInvalidation ?? 'NOT_NEEDED',
              // 발송은 최윤석(notifications) — 이 조회는 발송하지 않으므로 항상 NOT_NEEDED.
              notification: 'NOT_NEEDED',
            }
          : null,
      };
    },

    /**
     * 인바운드 — 유동우(project-management) → 조준영.
     * `POST /internal/v1/projects/:projectId/invalidate-agreement` (spec.md 규칙 15·25).
     * F01: 무효화도 withActiveProjectGuard로 잠근다. restore 호출 없음(합의 REJECTED·계약
     * CANCELED는 여기서 직접 정한다).
     */
    async invalidateAgreement(
      projectId: string,
      input: InvalidateAgreementInput,
    ): Promise<InvalidateAgreementResponse> {
      const cancellationId = input.cancellationId ?? input.cancellationEventId;
      if (!cancellationId) {
        throw new DomainContractError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
          { field: 'cancellationId', reason: 'required' },
        ]);
      }
      const idemKey = `invalidate-${cancellationId}`;
      const cached = repo.getIdempotent<InvalidateAgreementResponse>('invalidate', idemKey);
      if (cached) return { ...cached, alreadyProcessed: true, changed: false };

      return withActiveProjectGuard(projectId, async () => {
        const ctx = await projectPort.getProjectNegotiationContext(projectId);
        if (ctx.paymentPendingAt) {
          throw new DomainContractError(
            'PROJECT_CANCEL_AFTER_PAYMENT',
            '결제가 시작된 이후에는 취소할 수 없습니다.',
          );
        }
        if (ctx.transactionStatus !== 'NONE' && ctx.transactionStatus !== 'CONTRACT_PENDING') {
          throw new DomainContractError(
            'PROJECT_TRANSITION_CONFLICT',
            '프로젝트 상태가 변경되어 처리할 수 없습니다.',
          );
        }

        const agreement = repo.findAgreementByProjectId(projectId);
        const contract = repo.findContractByProjectId(projectId);
        let agreementStatus: 'REJECTED' | null = null;
        let contractStatus: 'CANCELED' | null = null;
        let changed = false;
        let result: 'DONE' | 'NOT_NEEDED' = 'NOT_NEEDED';

        if (agreement && agreement.status !== 'REJECTED') {
          agreement.status = 'REJECTED';
          agreement.respondedAt = agreement.respondedAt ?? now();
          repo.saveAgreement(agreement);
          agreementStatus = 'REJECTED';
          changed = true;
          result = 'DONE';
        } else if (agreement) {
          agreementStatus = 'REJECTED';
        }
        // PAID 이후 계약 취소는 제외(규칙 25) — paymentPendingAt 없음을 위에서 이미 확인했다.
        if (contract && contract.status !== 'CANCELED') {
          contract.status = 'CANCELED';
          repo.saveContract(contract);
          contractStatus = 'CANCELED';
          changed = true;
          result = 'DONE';
        } else if (contract) {
          contractStatus = 'CANCELED';
        }

        const response: InvalidateAgreementResponse = {
          alreadyProcessed: false,
          result,
          state: result,
          projectId,
          agreementStatus,
          contractStatus,
          signaturesPreserved: true,
          changed,
        };
        repo.setIdempotent('invalidate', idemKey, response);
        repo.saveInvalidation({
          cancellationId,
          projectId,
          contractInvalidation: contract ? 'DONE' : 'NOT_NEEDED',
        });
        return response;
      });
    },

    // -----------------------------------------------------------------------
    // 납품 (DLV-01, spec.md 규칙 23)
    // -----------------------------------------------------------------------

    async getDelivery(contractId: string, auth: AuthContext | null): Promise<GetDeliveryResponse> {
      const contract = await requireContractParty(contractId, auth);
      return assembleDeliveryResponse(contractId, contract, auth!);
    },

    async prepareDeliveryUpload(
      contractId: string,
      auth: AuthContext | null,
      input: PrepareDeliveryUploadInput,
    ): Promise<PrepareDeliveryUploadResponse> {
      const contract = await requireContractParty(contractId, auth);
      if (auth!.userId !== contract.freelancerId) {
        throw new PublicApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
      }
      if (!/^[0-9a-f]{64}$/.test(input.sha256)) {
        throw new DomainContractError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
          { field: 'sha256', reason: 'INVALID_FORMAT' },
        ]);
      }
      ensureDeliveryForContract(contractId);
      const objectKey = `deliveries/${contractId}/${randomId('obj')}`;
      return {
        uploadId: randomId('upl'),
        // 실저장소·실AV는 스텁이다(spec.md 규칙 23) — PactFive API가 직접 서빙하지 않는 자리표시자.
        uploadUrl: `https://uploads.invalid/${objectKey}`,
        objectKey,
        expiresAt: new Date(Date.parse(now()) + 15 * 60_000).toISOString(),
      };
    },

    /** `Idempotency-Key` 필수. 같은 키·다른 본문은 409(spec.md 규칙 23). */
    async requestDelivery(
      contractId: string,
      auth: AuthContext | null,
      input: RequestDeliveryInput,
    ): Promise<GetDeliveryResponse & { alreadyProcessed: boolean }> {
      const contract = await requireContractParty(contractId, auth);
      if (auth!.userId !== contract.freelancerId) {
        throw new PublicApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
      }
      const cached = repo.getIdempotent<{ input: RequestDeliveryInput; response: GetDeliveryResponse }>(
        'delivery-request',
        input.idempotencyKey,
      );
      if (cached) {
        if (JSON.stringify(cached.input) !== JSON.stringify(input)) {
          throw new DomainContractError(
            'PROJECT_TRANSITION_CONFLICT',
            '같은 Idempotency-Key로 다른 요청을 보낼 수 없습니다.',
          );
        }
        return { ...cached.response, alreadyProcessed: true };
      }
      if (!input.objectKey || !input.uploadId || !input.message) {
        throw new DomainContractError('VALIDATION_ERROR', '업로드가 완료되지 않았습니다.', [
          { field: 'objectKey', reason: 'required' },
        ]);
      }
      const delivery = ensureDeliveryForContract(contractId);
      if (delivery.status !== 'IN_PROGRESS') {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      delivery.status = 'DELIVERY_REQUESTED';
      delivery.message = input.message;
      delivery.requestedAt = now();
      delivery.objectKey = input.objectKey;
      delivery.fileName = delivery.fileName ?? 'delivery.zip';
      delivery.mimeType = delivery.mimeType ?? 'application/octet-stream';
      delivery.sizeBytes = delivery.sizeBytes ?? 0;
      delivery.version += 1;
      repo.saveDelivery(delivery);

      await ignoreNotificationFailure(() =>
        notifications.publishDeliveryRequested({
          type: 'DELIVERY_REQUESTED',
          projectId: contract.projectId,
          clientId: contract.clientId,
          occurredAt: delivery.requestedAt!,
        }),
      );

      const response = await assembleDeliveryResponse(contractId, contract, auth!);
      repo.setIdempotent('delivery-request', input.idempotencyKey, { input, response });
      return { ...response, alreadyProcessed: false };
    },

    /**
     * 의뢰인. `DELIVERY_REQUESTED`만. F03: 이 호출은 Payment를 잠그지 않는다 — Delivery+outbox만
     * 커밋하고, 정산 evaluate는 별 호출이다(spec.md 규칙 23).
     */
    async approveDelivery(
      contractId: string,
      auth: AuthContext | null,
      input: ApproveDeliveryInput,
    ): Promise<GetDeliveryResponse & { alreadyProcessed: boolean }> {
      const contract = await requireContractParty(contractId, auth);
      if (auth!.userId !== contract.clientId) {
        throw new PublicApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
      }
      const cached = repo.getIdempotent<GetDeliveryResponse>('delivery-approve', input.idempotencyKey);
      if (cached) return { ...cached, alreadyProcessed: true };

      const delivery = ensureDeliveryForContract(contractId);
      if (delivery.status === 'APPROVED') {
        const response = await assembleDeliveryResponse(contractId, contract, auth!);
        repo.setIdempotent('delivery-approve', input.idempotencyKey, response);
        return { ...response, alreadyProcessed: true };
      }
      if (delivery.status !== 'DELIVERY_REQUESTED') {
        throw new DomainContractError(
          'PROJECT_TRANSITION_CONFLICT',
          '프로젝트 상태가 변경되어 처리할 수 없습니다.',
        );
      }
      if (input.expectedVersion !== undefined && input.expectedVersion !== delivery.version) {
        throw new DomainContractError('PROJECT_VERSION_CONFLICT', '납품 정보가 변경되었습니다.');
      }
      delivery.status = 'APPROVED';
      delivery.approvedAt = now();
      delivery.version += 1;
      repo.saveDelivery(delivery);

      await ignoreNotificationFailure(() =>
        notifications.publishDeliveryApproved({
          type: 'DELIVERY_APPROVED',
          projectId: contract.projectId,
          freelancerId: contract.freelancerId,
          occurredAt: delivery.approvedAt!,
        }),
      );
      // 교차 생명주기 Coordinator(규칙 26) — APPROVED∧RELEASED일 때만 complete를 부른다.
      // 지금은 RELEASED가 지급 버튼 없이 simulateSettlementResult로만 일어나므로(규칙 24),
      // 대부분은 여기서 idle로 끝나고 실제 completed는 정산 시뮬레이션 이후에 일어난다.
      await coordinator.onDeliveryApproved({
        eventId: randomId('evt_approved'),
        projectId: contract.projectId,
        occurredAt: delivery.approvedAt!,
      });

      const response = await assembleDeliveryResponse(contractId, contract, auth!);
      repo.setIdempotent('delivery-approve', input.idempotencyKey, response);
      return { ...response, alreadyProcessed: false };
    },
  };

  /** getDelivery·requestDelivery·approveDelivery가 공유하는 응답 조립 헬퍼. */
  async function assembleDeliveryResponse(
    contractId: string,
    contract: ContractRow,
    auth: AuthContext,
  ): Promise<GetDeliveryResponse> {
    const ctx = await projectPort.getProjectNegotiationContext(contract.projectId);
    const payment = repo.findPaymentByContractId(contractId);
    const delivery = ensureDeliveryForContract(contractId);
    const isClient = auth.userId === contract.clientId;
    const isFreelancer = auth.userId === contract.freelancerId;
    return {
      contractId,
      projectId: contract.projectId,
      projectTitle: contract.projectTitleSnapshot,
      transactionStatus: ctx.transactionStatus,
      canceledAt: ctx.canceledAt,
      contractStatus: contract.status,
      agreedAmount: contract.agreedAmount,
      delivery: {
        deliveryId: delivery.deliveryId,
        status: delivery.status,
        version: delivery.version,
        message: delivery.message,
        requestedAt: delivery.requestedAt,
        approvedAt: delivery.approvedAt,
        file:
          delivery.fileName && delivery.mimeType && delivery.sizeBytes !== null
            ? { fileName: delivery.fileName, mimeType: delivery.mimeType, sizeBytes: delivery.sizeBytes }
            : null,
      },
      paymentStatus: payment?.status ?? 'READY',
      downloadUrl: delivery.status === 'APPROVED' && isClient ? `/api/v1/contracts/${contractId}/delivery/download` : null,
      canRequestDelivery: isFreelancer && delivery.status === 'IN_PROGRESS',
      canApprove: isClient && delivery.status === 'DELIVERY_REQUESTED',
      canDownload: delivery.status === 'APPROVED' && (isClient || isFreelancer),
      canReview: ctx.transactionStatus === 'COMPLETED',
    };
  }
}
