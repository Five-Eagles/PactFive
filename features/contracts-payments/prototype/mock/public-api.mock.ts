import { createProjectTransactionMock, MOCK_NOW } from "./project-transaction.mock";
import {
  createPaymentRecordMock,
  MOCK_PAYMENT_ID,
  type PreparePaymentResponse,
} from "./payment-record.mock";
import type { ConfirmPaymentInput, ConfirmPaymentResponse } from "../server/payment.port";
import {
  DomainContractError,
  type NotReopenedReason,
  type ProjectNegotiationContextResponse,
} from "../server/project-transaction.types";
import type { ContractStatus } from "../server/contract.types";
import {
  PublicApiError,
  type AcceptNegotiationOfferInput,
  type CurrentNegotiationOfferResponse,
  type GetContractResponse,
  type GetPaymentResponse,
  type InvalidateAgreementInput,
  type InvalidateAgreementResponse,
  type ProposeNegotiationOfferInput,
  type RejectNegotiationOfferInput,
  type SignContractResponse,
} from "../server/public-api.types";

export { MOCK_PAYMENT_ID };

export const MOCK_CLIENT_USER_ID = "usr_client_a";
export const MOCK_FREELANCER_USER_ID = "usr_freelancer_b";
export const MOCK_OUTSIDER_USER_ID = "usr_outsider";
export const MOCK_PROJECT_TITLE = "브랜드 사이트 리뉴얼";
export const MOCK_OFFER_AMOUNT = 100_000;

type OfferRow = {
  offerId: string;
  round: number;
  amount: number;
  offeredByUserId: string;
  rejectedReason: string | null;
};

type AgreementRow = {
  agreementId: string;
  projectId: string;
  applicationId: string;
  proposedByUserId: string;
  status: "PROPOSED" | "ACCEPTED" | "REJECTED";
  agreedAmount: number;
  respondedAt: string | null;
  offers: OfferRow[];
};

type ContractRow = {
  contractId: string;
  agreementId: string;
  projectId: string;
  clientId: string;
  freelancerId: string;
  agreedAmount: number;
  projectTitleSnapshot: string;
  workStartDate: string;
  workEndDate: string;
  termsSnapshot: GetContractResponse["termsSnapshot"];
  status: ContractStatus;
  clientSignedAt: string | null;
  freelancerSignedAt: string | null;
  signedAt: string | null;
};

type SignatureAudit = {
  contractId: string;
  signerId: string;
  signedAt: string;
};

function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

function laterDate(start: string, end: string): string {
  return end < start ? start : end;
}

/** Increment 1 공개 API 스탠드인. 프로젝트 4함수 Mock을 거절·무효화에 재사용한다. */
export function createPublicApiMock(nowIso: string = MOCK_NOW) {
  const projects = createProjectTransactionMock(nowIso);
  const payments = createPaymentRecordMock();
  const paymentProjectIds = new Map<string, string>();
  const agreements = new Map<string, AgreementRow>();
  const contracts = new Map<string, ContractRow>();
  const audits: SignatureAudit[] = [];
  const acceptIdempotency = new Map<string, CurrentNegotiationOfferResponse>();
  const rejectIdempotency = new Map<string, CurrentNegotiationOfferResponse>();
  const restoreByProject = new Map<
    string,
    { reopened: boolean; notReopenedReason: NotReopenedReason | null }
  >();
  const signIdempotency = new Map<string, SignContractResponse>();
  const invalidateIdempotency = new Map<string, InvalidateAgreementResponse>();

  // GET payment 시드. 준비 API와 같은 결제 행 저장소를 쓴다.
  const seededPayment = payments.preparePayment();
  paymentProjectIds.set(seededPayment.paymentId, "prj_alive");

  async function requireParty(projectId: string, actorUserId: string | undefined) {
    if (!actorUserId) {
      throw new PublicApiError("AUTH_REQUIRED", "로그인이 필요합니다.");
    }
    const ctx = await projects.getProjectNegotiationContext(projectId);
    if (actorUserId !== ctx.clientId && actorUserId !== MOCK_FREELANCER_USER_ID) {
      throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
    }
    return ctx;
  }

  function agreementFor(projectId: string): AgreementRow | undefined {
    return [...agreements.values()].find((row) => row.projectId === projectId);
  }

  function latestOffer(row: AgreementRow): OfferRow {
    return row.offers[row.offers.length - 1];
  }

  function toCurrent(
    projectId: string,
    ctx: ProjectNegotiationContextResponse,
  ): CurrentNegotiationOfferResponse {
    const agreement = agreementFor(projectId);
    const contract = [...contracts.values()].find((row) => row.projectId === projectId);
    const offer = agreement ? latestOffer(agreement) : undefined;
    const rejected = agreement?.status === "REJECTED";
    const restore = restoreByProject.get(projectId);
    // REJECTED만 restore 결과를 채운다. prj_restore는 재개, prj_deadline은 종료.
    const reopened = rejected ? (restore?.reopened ?? ctx.recruitmentStatus === "OPEN") : null;
    const notReopenedReason = rejected ? (restore?.notReopenedReason ?? null) : null;
    return {
      projectId,
      agreementId: agreement?.agreementId ?? null,
      agreementStatus: agreement?.status ?? null,
      offer: offer
        ? {
            offerId: offer.offerId,
            round: offer.round,
            amount: offer.amount,
            currency: "KRW",
            offeredByUserId: offer.offeredByUserId,
          }
        : null,
      contractId: contract?.contractId ?? null,
      contractStatus: contract?.status ?? null,
      projectTitle: MOCK_PROJECT_TITLE,
      recruitmentStatus: ctx.recruitmentStatus,
      transactionStatus: ctx.transactionStatus,
      canceledAt: ctx.canceledAt,
      applicationId: agreement?.applicationId ?? ctx.acceptedApplicationId,
      reopened,
      notReopenedReason,
    };
  }

  function toSignResponse(row: ContractRow, alreadyProcessed: boolean): SignContractResponse {
    if (row.status !== "SIGNING" && row.status !== "SIGNED") {
      throw new DomainContractError(
        "PROJECT_TRANSITION_CONFLICT",
        "프로젝트 상태가 변경되어 처리할 수 없습니다.",
      );
    }
    return {
      contractId: row.contractId,
      status: row.status,
      clientSignedAt: row.clientSignedAt,
      freelancerSignedAt: row.freelancerSignedAt,
      signedAt: row.signedAt,
      alreadyProcessed,
    };
  }

  return {
    projects,

    async getCurrentNegotiationOffer(
      projectId: string,
      actorUserId: string,
    ): Promise<CurrentNegotiationOfferResponse> {
      const ctx = await requireParty(projectId, actorUserId);
      return toCurrent(projectId, ctx);
    },

    async proposeNegotiationOffer(
      projectId: string,
      actorUserId: string,
      input: ProposeNegotiationOfferInput,
    ): Promise<CurrentNegotiationOfferResponse> {
      const ctx = await requireParty(projectId, actorUserId);
      if (actorUserId !== ctx.clientId) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      if (!input.amount || input.currency !== "KRW") {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "amount", reason: "required" },
        ]);
      }
      if (ctx.transactionStatus !== "CONTRACT_PENDING" || !ctx.acceptedApplicationId) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      if (agreementFor(projectId)) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      const agreementId = `agr_${projectId}`;
      const offer: OfferRow = {
        offerId: `ofr_${projectId}_1`,
        round: 1,
        amount: input.amount,
        offeredByUserId: actorUserId,
        rejectedReason: null,
      };
      agreements.set(agreementId, {
        agreementId,
        projectId,
        applicationId: ctx.acceptedApplicationId,
        proposedByUserId: actorUserId,
        status: "PROPOSED",
        agreedAmount: input.amount,
        respondedAt: null,
        offers: [offer],
      });
      return toCurrent(projectId, ctx);
    },

    async acceptNegotiationOffer(
      projectId: string,
      offerId: string,
      actorUserId: string,
      input: AcceptNegotiationOfferInput,
    ): Promise<CurrentNegotiationOfferResponse> {
      const ctx = await requireParty(projectId, actorUserId);
      const idemKey = `negotiation-accept-${offerId}`;
      const cached = acceptIdempotency.get(idemKey);
      if (cached) return { ...cached };
      const agreement = agreementFor(projectId);
      if (!agreement) {
        throw new DomainContractError("PROJECT_NOT_FOUND", "합의를 찾을 수 없습니다.");
      }
      const offer = latestOffer(agreement);
      if (offer.offerId !== offerId || input.expectedRound !== offer.round) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.",
        );
      }
      if (actorUserId !== MOCK_FREELANCER_USER_ID) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      if (agreement.status === "ACCEPTED") {
        const current = toCurrent(projectId, ctx);
        acceptIdempotency.set(idemKey, current);
        return current;
      }
      if (agreement.status !== "PROPOSED") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      agreement.status = "ACCEPTED";
      agreement.respondedAt = nowIso;
      agreement.agreedAmount = offer.amount;
      const workStartDate = utcDate(nowIso);
      const workEndDate = laterDate(workStartDate, utcDate(ctx.recruitmentDeadlineAt));
      const contractId = `ctr_${projectId}`;
      contracts.set(contractId, {
        contractId,
        agreementId: agreement.agreementId,
        projectId,
        clientId: ctx.clientId,
        freelancerId: MOCK_FREELANCER_USER_ID,
        agreedAmount: offer.amount,
        projectTitleSnapshot: MOCK_PROJECT_TITLE,
        workStartDate,
        workEndDate,
        termsSnapshot: {
          schemaVersion: 1,
          amount: offer.amount,
          currency: "KRW",
          projectTitle: MOCK_PROJECT_TITLE,
        },
        status: "DRAFT",
        clientSignedAt: null,
        freelancerSignedAt: null,
        signedAt: null,
      });
      const current = toCurrent(projectId, ctx);
      acceptIdempotency.set(idemKey, current);
      return current;
    },

    async rejectNegotiationOffer(
      projectId: string,
      offerId: string,
      actorUserId: string,
      input: RejectNegotiationOfferInput,
    ): Promise<CurrentNegotiationOfferResponse> {
      await requireParty(projectId, actorUserId);
      const agreement = agreementFor(projectId);
      if (!agreement) {
        throw new DomainContractError("PROJECT_NOT_FOUND", "합의를 찾을 수 없습니다.");
      }
      const idemKey = `negotiation-reject-${agreement.agreementId}`;
      const cached = rejectIdempotency.get(idemKey);
      if (cached) return { ...cached };
      const offer = latestOffer(agreement);
      if (offer.offerId !== offerId) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      if (actorUserId !== MOCK_FREELANCER_USER_ID) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      if (!input.reasonCode) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "reasonCode", reason: "required" },
        ]);
      }
      agreement.status = "REJECTED";
      agreement.respondedAt = nowIso;
      offer.rejectedReason = input.reason ?? input.reasonCode;
      const restored = await projects.restorePreContractProject(projectId, {
        negotiationId: agreement.agreementId,
        offerId,
        actorUserId,
        reason: "FREELANCER_REJECTED",
        requestId: `req_reject_${offerId}`,
        idempotencyKey: idemKey,
        occurredAt: nowIso,
      });
      restoreByProject.set(projectId, {
        reopened: restored.reopened,
        notReopenedReason: restored.notReopenedReason,
      });
      const ctx = await projects.getProjectNegotiationContext(projectId);
      const current = toCurrent(projectId, ctx);
      rejectIdempotency.set(idemKey, current);
      return current;
    },

    async getContract(contractId: string, actorUserId: string): Promise<GetContractResponse> {
      const row = contracts.get(contractId);
      if (!row) {
        throw new DomainContractError("PROJECT_NOT_FOUND", "계약을 찾을 수 없습니다.");
      }
      await requireParty(row.projectId, actorUserId);
      return {
        contractId: row.contractId,
        status: row.status,
        termsSnapshot: row.termsSnapshot,
        clientSignedAt: row.clientSignedAt,
        freelancerSignedAt: row.freelancerSignedAt,
        signedAt: row.signedAt,
      };
    },

    async getPayment(paymentId: string, actorUserId: string): Promise<GetPaymentResponse> {
      // 없는 결제는 당사자 검사 전에 404.
      const row = payments.getPayment(paymentId);
      const projectId = paymentProjectIds.get(paymentId) ?? "prj_alive";
      await requireParty(projectId, actorUserId);
      return row;
    },

    async preparePayment(
      projectId: string,
      actorUserId: string,
    ): Promise<PreparePaymentResponse> {
      // 당사자만 결제 행을 준비한다.
      await requireParty(projectId, actorUserId);
      const prepared = payments.preparePayment();
      paymentProjectIds.set(prepared.paymentId, projectId);
      return prepared;
    },

    async confirmPayment(
      actorUserId: string,
      input: ConfirmPaymentInput,
    ): Promise<ConfirmPaymentResponse> {
      // 시드 결제 행의 프로젝트로 당사자를 가린다.
      const row = payments.getPayment(MOCK_PAYMENT_ID);
      const projectId = paymentProjectIds.get(row.paymentId) ?? "prj_alive";
      await requireParty(projectId, actorUserId);
      return payments.confirmPayment(input);
    },

    async signContract(contractId: string, actorUserId: string): Promise<SignContractResponse> {
      const row = contracts.get(contractId);
      if (!row) {
        throw new DomainContractError("PROJECT_NOT_FOUND", "계약을 찾을 수 없습니다.");
      }
      const ctx = await requireParty(row.projectId, actorUserId);
      if (ctx.canceledAt || row.status === "CANCELED") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트가 취소되었습니다.",
        );
      }
      if (actorUserId !== row.clientId && actorUserId !== row.freelancerId) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      const idemKey = `contract-sign-${contractId}-${actorUserId}`;
      const cached = signIdempotency.get(idemKey);
      if (cached) return { ...cached, alreadyProcessed: true };
      if (row.status !== "DRAFT" && row.status !== "SIGNING") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      if (actorUserId === row.clientId) {
        if (!row.clientSignedAt) row.clientSignedAt = nowIso;
      } else if (!row.freelancerSignedAt) {
        row.freelancerSignedAt = nowIso;
      }
      audits.push({ contractId, signerId: actorUserId, signedAt: nowIso });
      if (row.clientSignedAt && row.freelancerSignedAt) {
        row.status = "SIGNED";
        row.signedAt = nowIso;
      } else {
        row.status = "SIGNING";
      }
      const response = toSignResponse(row, false);
      signIdempotency.set(idemKey, response);
      return response;
    },

    async invalidateAgreementAndContract(
      projectId: string,
      input: InvalidateAgreementInput,
    ): Promise<InvalidateAgreementResponse> {
      if (!input.cancellationId || !input.actorUserId || !input.projectCanceledAt) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "cancellationId", reason: "required" },
        ]);
      }
      const cached = invalidateIdempotency.get(input.cancellationId);
      if (cached) return { ...cached, alreadyProcessed: true };
      try {
        await projects.getProjectNegotiationContext(projectId);
      } catch (err) {
        if (err instanceof DomainContractError && err.body.error.code === "PROJECT_NOT_FOUND") {
          throw err;
        }
        throw err;
      }
      const agreement = agreementFor(projectId);
      const contract = [...contracts.values()].find((row) => row.projectId === projectId);
      if (!agreement && !contract) {
        const none: InvalidateAgreementResponse = { alreadyProcessed: false, result: "NOT_NEEDED" };
        invalidateIdempotency.set(input.cancellationId, none);
        return none;
      }
      if (agreement) agreement.status = "REJECTED";
      if (contract) contract.status = "CANCELED";
      const done: InvalidateAgreementResponse = { alreadyProcessed: false, result: "DONE" };
      invalidateIdempotency.set(input.cancellationId, done);
      return done;
    },

    getSignatureAudits(): SignatureAudit[] {
      return [...audits];
    },
  };
}
