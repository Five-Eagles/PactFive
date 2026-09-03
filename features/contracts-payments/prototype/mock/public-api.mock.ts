import { createProjectTransactionMock, MOCK_NOW } from "./project-transaction.mock";
import { createPaymentRecordMock, MOCK_PAYMENT_ID } from "./payment-record.mock";
import {
  DomainContractError,
  type NotReopenedReason,
  type ProjectNegotiationContextResponse,
} from "../server/project-transaction.types";
import type { ContractStatus } from "../server/contract.types";
import { completeProjectTransactionIfSettled } from "../server/project-transaction.service";
import { ignoreNotificationFailure, type NotificationTriggerPort } from "../server/notification.port";
import {
  PublicApiError,
  type AcceptNegotiationOfferInput,
  type ApproveDeliveryInput,
  type CurrentNegotiationOfferResponse,
  type DeliveryPaymentStatus,
  type DeliveryStatus,
  type GetContractResponse,
  type GetDeliveryResponse,
  type GetPaymentResponse,
  type InvalidateAgreementInput,
  type InvalidateAgreementResponse,
  type ProposeNegotiationOfferInput,
  type RejectNegotiationOfferInput,
  type RequestDeliveryInput,
  type SignContractResponse,
} from "../server/public-api.types";

export { MOCK_PAYMENT_ID };

export const MOCK_CLIENT_USER_ID = "usr_client_a";
export const MOCK_FREELANCER_USER_ID = "usr_freelancer_b";
export const MOCK_OUTSIDER_USER_ID = "usr_outsider";
export const MOCK_PROJECT_TITLE = "브랜드 사이트 리뉴얼";
export const MOCK_OFFER_AMOUNT = 100_000;
export const MOCK_DELIVERY_CONTRACT_IN_PROGRESS = "ctr_prj_in_progress";
export const MOCK_DELIVERY_CONTRACT_COMPLETED = "ctr_prj_completed";
export const MOCK_DELIVERY_CONTRACT_CANCELED = "ctr_prj_canceled";
export const MOCK_DELIVERY_FILE_NAME = "final-deliverable.zip";
export const MOCK_DELIVERY_MESSAGE = "작업 산출물을 첨부했습니다.";

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

type DeliveryContractSeed = {
  contractId: string;
  projectId: string;
  status: ContractStatus;
  agreedAmount: number;
  paymentStatus: DeliveryPaymentStatus;
};

type DeliveryRow = {
  deliveryId: string;
  contractId: string;
  status: DeliveryStatus;
  version: number;
  message: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  objectKey: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type PublicApiMockOptions = {
  notifications?: NotificationTriggerPort;
};

function utcDate(iso: string): string {
  return iso.slice(0, 10);
}

function laterDate(start: string, end: string): string {
  return end < start ? start : end;
}

/** 공개 API 스탠드인. 프로젝트 4함수 Mock을 거절·무효화·납품 완료에 재사용한다. */
export function createPublicApiMock(
  nowIso: string = MOCK_NOW,
  options: PublicApiMockOptions = {},
) {
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
  const deliveryContracts = new Map<string, DeliveryContractSeed>();
  const deliveries = new Map<string, DeliveryRow>();
  const requestIdempotency = new Map<string, GetDeliveryResponse>();
  const approveIdempotency = new Map<string, GetDeliveryResponse>();
  const preparedUploads = new Map<string, { objectKey: string; ready: boolean }>();

  // GET payment 시드. 준비 API와 같은 결제 행 저장소를 쓴다.
  const seededPayment = payments.preparePayment();
  paymentProjectIds.set(seededPayment.paymentId, "prj_alive");

  function seedDeliveryContract(
    contractId: string,
    projectId: string,
    paymentStatus: DeliveryPaymentStatus,
    delivery?: Omit<DeliveryRow, "contractId">,
  ) {
    deliveryContracts.set(contractId, {
      contractId,
      projectId,
      status: "SIGNED",
      agreedAmount: MOCK_OFFER_AMOUNT,
      paymentStatus,
    });
    if (delivery) {
      deliveries.set(contractId, { ...delivery, contractId });
    }
  }

  seedDeliveryContract(MOCK_DELIVERY_CONTRACT_IN_PROGRESS, "prj_in_progress", "PAID");
  seedDeliveryContract(MOCK_DELIVERY_CONTRACT_CANCELED, "prj_canceled", "PAID");
  seedDeliveryContract(MOCK_DELIVERY_CONTRACT_COMPLETED, "prj_completed", "RELEASED", {
    deliveryId: "dlv_prj_completed",
    status: "APPROVED",
    version: 1,
    message: MOCK_DELIVERY_MESSAGE,
    requestedAt: nowIso,
    approvedAt: nowIso,
    objectKey: "obj_completed",
    fileName: MOCK_DELIVERY_FILE_NAME,
    mimeType: "application/zip",
    sizeBytes: 1_048_576,
  });

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

  async function requireDeliveryContract(contractId: string, actorUserId: string) {
    const seed = deliveryContracts.get(contractId);
    if (!seed) {
      throw new DomainContractError("PROJECT_NOT_FOUND", "계약을 찾을 수 없습니다.");
    }
    const ctx = await requireParty(seed.projectId, actorUserId);
    return { seed, ctx };
  }

  function toDeliveryResponse(
    seed: DeliveryContractSeed,
    ctx: ProjectNegotiationContextResponse,
    actorUserId: string,
  ): GetDeliveryResponse {
    const row = deliveries.get(seed.contractId) ?? null;
    const isClient = actorUserId === ctx.clientId;
    const file =
      row?.fileName && row.mimeType != null && row.sizeBytes != null
        ? { fileName: row.fileName, mimeType: row.mimeType, sizeBytes: row.sizeBytes }
        : null;
    const approved = row?.status === "APPROVED";
    const requested = row?.status === "DELIVERY_REQUESTED";
    const released = seed.paymentStatus === "RELEASED";
    const inProgress = ctx.transactionStatus === "IN_PROGRESS";
    const signed = seed.status === "SIGNED";
    const paid = seed.paymentStatus === "PAID" || released;
    return {
      contractId: seed.contractId,
      projectId: seed.projectId,
      projectTitle: MOCK_PROJECT_TITLE,
      transactionStatus: ctx.transactionStatus,
      canceledAt: ctx.canceledAt,
      contractStatus: seed.status,
      agreedAmount: seed.agreedAmount,
      delivery: row
        ? {
            deliveryId: row.deliveryId,
            status: row.status,
            version: row.version,
            message: row.message,
            requestedAt: row.requestedAt,
            approvedAt: row.approvedAt,
            file,
          }
        : null,
      paymentStatus: seed.paymentStatus,
      downloadUrl: file ? `https://download.example/${row?.deliveryId}?exp=short` : null,
      canRequestDelivery: !row && !isClient && signed && paid && inProgress && !ctx.canceledAt,
      canApprove: Boolean(requested && isClient && !ctx.canceledAt),
      canDownload: Boolean(file),
      canReview: ctx.transactionStatus === "COMPLETED" || (approved && released),
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

    async getDelivery(contractId: string, actorUserId: string): Promise<GetDeliveryResponse> {
      const { seed, ctx } = await requireDeliveryContract(contractId, actorUserId);
      return toDeliveryResponse(seed, ctx, actorUserId);
    },

    async prepareDeliveryUpload(
      contractId: string,
      actorUserId: string,
    ): Promise<{ uploadUrl: string; objectKey: string; expiresAt: string }> {
      const { seed, ctx } = await requireDeliveryContract(contractId, actorUserId);
      if (actorUserId === ctx.clientId) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      if (deliveries.has(contractId) || ctx.transactionStatus !== "IN_PROGRESS" || ctx.canceledAt) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      const objectKey = `obj_${contractId}_${nowIso}`;
      preparedUploads.set(objectKey, { objectKey, ready: true });
      return {
        uploadUrl: `https://upload.example/${objectKey}`,
        objectKey,
        expiresAt: nowIso,
      };
    },

    async requestDelivery(
      contractId: string,
      actorUserId: string,
      input: RequestDeliveryInput,
    ): Promise<GetDeliveryResponse> {
      const { seed, ctx } = await requireDeliveryContract(contractId, actorUserId);
      const idemKey = `delivery-request-${contractId}`;
      const cached = requestIdempotency.get(idemKey);
      if (cached) return { ...cached };
      if (actorUserId === ctx.clientId) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      if (!input.objectKey || !input.message?.trim()) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: input.objectKey ? "message" : "objectKey", reason: "required" },
        ]);
      }
      if (!preparedUploads.get(input.objectKey)?.ready) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "objectKey", reason: "not_ready" },
        ]);
      }
      if (deliveries.has(contractId) || ctx.transactionStatus !== "IN_PROGRESS" || ctx.canceledAt) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      deliveries.set(contractId, {
        deliveryId: `dlv_${contractId}`,
        contractId,
        status: "DELIVERY_REQUESTED",
        version: 1,
        message: input.message.trim(),
        requestedAt: nowIso,
        approvedAt: null,
        objectKey: input.objectKey,
        fileName: MOCK_DELIVERY_FILE_NAME,
        mimeType: "application/zip",
        sizeBytes: 1_048_576,
      });
      const current = toDeliveryResponse(seed, ctx, actorUserId);
      requestIdempotency.set(idemKey, current);
      const notifications = options.notifications;
      if (notifications) {
        await ignoreNotificationFailure(() =>
          notifications.publishDeliveryRequested({
            type: "DELIVERY_REQUESTED",
            projectId: seed.projectId,
            clientId: ctx.clientId,
            occurredAt: nowIso,
          }),
        );
      }
      return current;
    },

    async approveDelivery(
      contractId: string,
      actorUserId: string,
      input: ApproveDeliveryInput = {},
    ): Promise<GetDeliveryResponse> {
      const { seed, ctx } = await requireDeliveryContract(contractId, actorUserId);
      const idemKey = `delivery-approve-${contractId}`;
      const cached = approveIdempotency.get(idemKey);
      if (cached) return { ...cached };
      if (actorUserId !== ctx.clientId) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      const row = deliveries.get(contractId);
      if (!row || row.status === "IN_PROGRESS") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      if (input.expectedVersion != null && input.expectedVersion !== row.version) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.",
        );
      }
      if (row.status !== "APPROVED") {
        row.status = "APPROVED";
        row.approvedAt = nowIso;
      }
      if (seed.paymentStatus === "RELEASED") {
        await completeProjectTransactionIfSettled(
          projects,
          seed.projectId,
          {
            contractId,
            requestId: `req_complete_${contractId}`,
            idempotencyKey: `transaction-complete-${contractId}`,
            occurredAt: nowIso,
            expectedProjectVersion: ctx.projectVersion,
          },
          "APPROVED",
          "RELEASED",
          options.notifications
            ? { notifications: options.notifications, freelancerId: MOCK_FREELANCER_USER_ID }
            : undefined,
        );
      }
      const latest = await projects.getProjectNegotiationContext(seed.projectId);
      const current = toDeliveryResponse(seed, latest, actorUserId);
      approveIdempotency.set(idemKey, current);
      const notifications = options.notifications;
      if (notifications) {
        await ignoreNotificationFailure(() =>
          notifications.publishDeliveryApproved({
            type: "DELIVERY_APPROVED",
            projectId: seed.projectId,
            freelancerId: MOCK_FREELANCER_USER_ID,
            occurredAt: nowIso,
          }),
        );
      }
      return current;
    },
  };
}
