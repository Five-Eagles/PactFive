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
  type ProjectTransactionStatus,
} from "../server/project-transaction.types";
import type { ContractStatus } from "../server/contract.types";
import {
  completeProjectTransactionIfSettled,
  markPaymentPendingIfAlive,
  startProjectTransactionIfAccepted,
} from "../server/project-transaction.service";
import { createPaymentGatewayMock } from "./payment.mock";
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
  type GetSettlementResponse,
  type GetCancellationResponse,
  type InvalidateAgreementInput,
  type InvalidateAgreementResponse,
  type PaymentProjectTransactionStatus,
  type SettlementProjectTransactionStatus,
  type CounterNegotiationOfferInput,
  type NegotiationOfferView,
  type ProposeNegotiationOfferInput,
  type RejectNegotiationOfferInput,
  type PrepareDeliveryUploadInput,
  type PrepareDeliveryUploadResponse,
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
export const MOCK_DELIVERY_SHA256 =
  "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b";
const MOCK_UPLOAD_EXPIRES_AT = "2026-08-25T05:10:00Z";
const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_DELIVERY_FILE_BYTES = 100 * 1024 * 1024;

type PreparedUpload = {
  uploadId: string;
  objectKey: string;
  actorUserId: string;
  contractId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  ready: boolean;
  scanStatus: "CLEAN" | "PENDING";
};

type IdempotentDelivery = { bodyHash: string; response: GetDeliveryResponse };

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

function toPaymentProjectStatus(
  status: ProjectTransactionStatus,
): PaymentProjectTransactionStatus {
  if (status === "CANCELED") return "CANCELED";
  if (status === "IN_PROGRESS" || status === "COMPLETED") return "IN_PROGRESS";
  return "CONTRACT_PENDING";
}

function toSettlementProjectStatus(
  status: ProjectTransactionStatus,
): SettlementProjectTransactionStatus {
  if (status === "CANCELED") return "CANCELED";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  return "CONTRACT_PENDING";
}

/** 공개 API 스탠드인. 프로젝트 4함수 Mock을 거절·무효화·납품 완료에 재사용한다. */
export function createPublicApiMock(
  nowIso: string = MOCK_NOW,
  options: PublicApiMockOptions = {},
) {
  const projects = createProjectTransactionMock(nowIso);
  const gateway = createPaymentGatewayMock();
  const payments = createPaymentRecordMock(gateway, { notifications: options.notifications });
  const paymentProjectIds = new Map<string, string>();
  const webhookInbox = new Set<string>();
  const agreements = new Map<string, AgreementRow>();
  const contracts = new Map<string, ContractRow>();
  const audits: SignatureAudit[] = [];
  const acceptIdempotency = new Map<string, CurrentNegotiationOfferResponse>();
  const rejectIdempotency = new Map<string, CurrentNegotiationOfferResponse>();
  const counterIdempotency = new Map<string, CurrentNegotiationOfferResponse>();
  const restoreByProject = new Map<
    string,
    { reopened: boolean; notReopenedReason: NotReopenedReason | null }
  >();
  const signIdempotency = new Map<string, SignContractResponse>();
  const invalidateIdempotency = new Map<string, InvalidateAgreementResponse>();
  const invalidateByProject = new Map<string, InvalidateAgreementResponse>();
  const deliveryContracts = new Map<string, DeliveryContractSeed>();
  const deliveries = new Map<string, DeliveryRow>();
  const requestIdempotency = new Map<string, IdempotentDelivery>();
  const approveIdempotency = new Map<string, IdempotentDelivery>();
  const preparedUploads = new Map<string, PreparedUpload>();
  const settlementRequested = new Set<string>();

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

  seedDeliveryContract(MOCK_DELIVERY_CONTRACT_IN_PROGRESS, "prj_in_progress", "PAID", {
    deliveryId: "dlv_prj_in_progress",
    status: "IN_PROGRESS",
    version: 0,
    message: null,
    requestedAt: null,
    approvedAt: null,
    objectKey: null,
    fileName: null,
    mimeType: null,
    sizeBytes: null,
  });
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

  /** 최신 offer 작성자가 의뢰인이면 수신자는 프리랜서, 아니면 의뢰인. */
  function latestRecipientUserId(
    ctx: ProjectNegotiationContextResponse,
    offer: OfferRow,
  ): string {
    return offer.offeredByUserId === ctx.clientId ? MOCK_FREELANCER_USER_ID : ctx.clientId;
  }

  function assertLatestRecipient(
    ctx: ProjectNegotiationContextResponse,
    offer: OfferRow,
    actorUserId: string,
  ): void {
    if (actorUserId !== latestRecipientUserId(ctx, offer)) {
      throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
    }
  }

  function assertNotCanceled(ctx: ProjectNegotiationContextResponse): void {
    if (ctx.transactionStatus === "CANCELED" || ctx.canceledAt) {
      throw new DomainContractError(
        "PROJECT_TRANSITION_CONFLICT",
        "프로젝트 상태가 변경되어 처리할 수 없습니다.",
      );
    }
  }

  function toOfferView(offer: OfferRow): NegotiationOfferView {
    return {
      offerId: offer.offerId,
      round: offer.round,
      amount: offer.amount,
      currency: "KRW",
      offeredByUserId: offer.offeredByUserId,
    };
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
      offers: agreement ? agreement.offers.map(toOfferView) : [],
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

  async function startIfPaid(projectId: string): Promise<void> {
    const contract = [...contracts.values()].find((item) => item.projectId === projectId);
    if (!contract || contract.status !== "SIGNED") return;
    try {
      const ctx = await projects.getProjectNegotiationContext(projectId);
      await startProjectTransactionIfAccepted(
        projects,
        projectId,
        {
          contractId: contract.contractId,
          requestId: `req_start_${contract.contractId}`,
          idempotencyKey: `transaction-start-${contract.contractId}`,
          occurredAt: nowIso,
          expectedProjectVersion: ctx.projectVersion,
        },
        ctx.acceptedApplicationId ?? "",
      );
      const seed = [...deliveryContracts.values()].find((item) => item.projectId === projectId);
      if (seed) ensureDeliveryForContract(seed.contractId);
    } catch {
      // PAID는 유지하고 화면은 PAID_SYNCING으로 둔다.
    }
  }

  function paymentStatusFor(projectId: string): GetContractResponse["paymentStatus"] {
    for (const [paymentId, mappedProjectId] of paymentProjectIds) {
      if (mappedProjectId !== projectId) continue;
      try {
        return payments.getPayment(paymentId).status;
      } catch {
        return null;
      }
    }
    return null;
  }

  async function requireDeliveryContract(contractId: string, actorUserId: string) {
    const seed = deliveryContracts.get(contractId);
    if (!seed) {
      throw new DomainContractError("PROJECT_NOT_FOUND", "계약을 찾을 수 없습니다.");
    }
    const ctx = await requireParty(seed.projectId, actorUserId);
    return { seed, ctx };
  }

  // 계약당 Delivery 1행. 있으면 그대로 반환한다.
  function ensureDeliveryForContract(contractId: string): DeliveryRow {
    const existing = deliveries.get(contractId);
    if (existing) return existing;
    const row: DeliveryRow = {
      deliveryId: `dlv_${contractId}`,
      contractId,
      status: "IN_PROGRESS",
      version: 0,
      message: null,
      requestedAt: null,
      approvedAt: null,
      objectKey: null,
      fileName: null,
      mimeType: null,
      sizeBytes: null,
    };
    deliveries.set(contractId, row);
    return row;
  }

  function deliveryBodyHash(input: unknown): string {
    return JSON.stringify(input);
  }

  // APPROVED+RELEASED일 때만 complete를 재평가한다.
  async function tryCompleteProject(seed: DeliveryContractSeed): Promise<void> {
    const row = deliveries.get(seed.contractId);
    if (row?.status !== "APPROVED" || seed.paymentStatus !== "RELEASED") return;
    const ctx = await projects.getProjectNegotiationContext(seed.projectId);
    if (ctx.transactionStatus !== "IN_PROGRESS") return;
    await completeProjectTransactionIfSettled(
      projects,
      seed.projectId,
      {
        contractId: seed.contractId,
        requestId: `req_complete_${seed.contractId}`,
        idempotencyKey: `project-complete-${seed.projectId}-${row.deliveryId}`,
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
      canRequestDelivery:
        (row == null || row.status === "IN_PROGRESS") &&
        !isClient &&
        signed &&
        paid &&
        inProgress &&
        !ctx.canceledAt,
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

    async counterNegotiationOffer(
      projectId: string,
      offerId: string,
      actorUserId: string,
      input: CounterNegotiationOfferInput,
    ): Promise<CurrentNegotiationOfferResponse> {
      const ctx = await requireParty(projectId, actorUserId);
      const idemKey = `negotiation-counter-${offerId}-${actorUserId}-${input.expectedRound}-${input.amount}`;
      const cached = counterIdempotency.get(idemKey);
      if (cached) return { ...cached };
      assertNotCanceled(ctx);
      if (!input.amount || input.currency !== "KRW") {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "amount", reason: "required" },
        ]);
      }
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
      assertLatestRecipient(ctx, offer, actorUserId);
      if (agreement.status !== "PROPOSED" || ctx.transactionStatus !== "CONTRACT_PENDING") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      const nextRound = offer.round + 1;
      agreement.offers.push({
        offerId: `ofr_${projectId}_${nextRound}`,
        round: nextRound,
        amount: input.amount,
        offeredByUserId: actorUserId,
        rejectedReason: null,
      });
      agreement.agreedAmount = input.amount;
      const current = toCurrent(projectId, ctx);
      counterIdempotency.set(idemKey, current);
      return current;
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
      assertLatestRecipient(ctx, offer, actorUserId);
      assertNotCanceled(ctx);
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
      const ctx = await requireParty(projectId, actorUserId);
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
      assertLatestRecipient(ctx, offer, actorUserId);
      assertNotCanceled(ctx);
      if (!input.reasonCode) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "reasonCode", reason: "required" },
        ]);
      }
      if (agreement.status !== "PROPOSED") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      agreement.status = "REJECTED";
      agreement.respondedAt = nowIso;
      offer.rejectedReason = input.reason ?? input.reasonCode;
      const restored = await projects.restorePreContractProject(projectId, {
        negotiationId: agreement.agreementId,
        offerId,
        actorUserId,
        reason: actorUserId === ctx.clientId ? "CLIENT_REJECTED" : "FREELANCER_REJECTED",
        requestId: `req_reject_${offerId}`,
        idempotencyKey: idemKey,
        occurredAt: nowIso,
      });
      restoreByProject.set(projectId, {
        reopened: restored.reopened,
        notReopenedReason: restored.notReopenedReason,
      });
      const afterRestore = await projects.getProjectNegotiationContext(projectId);
      const current = toCurrent(projectId, afterRestore);
      rejectIdempotency.set(idemKey, current);
      return current;
    },

    async getContract(contractId: string, actorUserId: string): Promise<GetContractResponse> {
      const row = contracts.get(contractId);
      if (!row) {
        throw new DomainContractError("PROJECT_NOT_FOUND", "계약을 찾을 수 없습니다.");
      }
      const ctx = await requireParty(row.projectId, actorUserId);
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
        paymentStatus: paymentStatusFor(row.projectId),
      };
    },

    async getPayment(paymentId: string, actorUserId: string): Promise<GetPaymentResponse> {
      // 없는 결제는 당사자 검사 전에 404.
      const row = payments.getPayment(paymentId);
      const projectId = paymentProjectIds.get(paymentId) ?? "prj_alive";
      const ctx = await requireParty(projectId, actorUserId);
      const contract = [...contracts.values()].find((item) => item.projectId === projectId);
      return {
        paymentId: row.paymentId,
        contractId: contract?.contractId ?? `ctr_${projectId}`,
        orderId: row.orderId,
        amount: row.amount,
        currency: "KRW",
        platformFeeAmount: row.platformFeeAmount,
        settlementAmount: row.settlementAmount,
        status: row.status,
        projectTitle: MOCK_PROJECT_TITLE,
        projectTransactionStatus: toPaymentProjectStatus(ctx.transactionStatus),
        environment: "SANDBOX",
      };
    },

    async getSettlement(paymentId: string, actorUserId: string): Promise<GetSettlementResponse> {
      // 없는 결제는 당사자 검사 전에 404.
      const row = payments.getPayment(paymentId);
      const projectId = paymentProjectIds.get(paymentId) ?? "prj_alive";
      const ctx = await requireParty(projectId, actorUserId);
      const contract = [...contracts.values()].find((item) => item.projectId === projectId);
      const seed = [...deliveryContracts.values()].find((item) => item.projectId === projectId);
      const deliveryRow = seed ? deliveries.get(seed.contractId) ?? null : null;
      const paymentStatus = seed?.paymentStatus ?? row.status;
      return {
        paymentId: row.paymentId,
        contractId: seed?.contractId ?? contract?.contractId ?? `ctr_${projectId}`,
        projectId,
        projectTitle: MOCK_PROJECT_TITLE,
        environment: "SANDBOX",
        provider: "MANUAL_SIMULATION",
        currency: "KRW",
        paymentAmount: row.amount,
        platformFeeRateBps: 1000,
        platformFeeAmount: row.platformFeeAmount,
        settlementAmount: row.settlementAmount,
        paymentStatus,
        deliveryStatus: deliveryRow?.status ?? null,
        projectTransactionStatus: toSettlementProjectStatus(ctx.transactionStatus),
        canceledAt: ctx.canceledAt,
      };
    },

    async getCancellation(
      projectId: string,
      actorUserId: string,
    ): Promise<GetCancellationResponse> {
      // 당사자만 취소 결과를 조립한다. POST cancel은 없다.
      const ctx = await requireParty(projectId, actorUserId);
      const agreement = agreementFor(projectId);
      const contract = [...contracts.values()].find((item) => item.projectId === projectId);
      const hasSignatureAudit = contract
        ? audits.some((item) => item.contractId === contract.contractId)
        : false;
      const canceled = ctx.transactionStatus === "CANCELED" || Boolean(ctx.canceledAt);
      const isClient = actorUserId === ctx.clientId;
      const last = invalidateByProject.get(projectId);
      return {
        projectId,
        projectTitle: MOCK_PROJECT_TITLE,
        recruitmentStatus: ctx.recruitmentStatus,
        transactionStatus: ctx.transactionStatus,
        paymentPendingAt: ctx.paymentPendingAt,
        canceledAt: ctx.canceledAt,
        acceptedApplicationId: ctx.acceptedApplicationId,
        agreementStatus: agreement?.status ?? null,
        contractStatus: contract?.status ?? null,
        hasSignatureAudit,
        postActions:
          canceled && isClient
            ? {
                applicationRejection: "NOT_NEEDED",
                contractInvalidation: last?.result ?? "NOT_NEEDED",
              }
            : null,
      };
    },

    async preparePayment(
      projectId: string,
      actorUserId: string,
    ): Promise<PreparePaymentResponse> {
      if (gateway.isCircuitOpen()) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      const ctx = await requireParty(projectId, actorUserId);
      if (actorUserId !== ctx.clientId) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      const contract = [...contracts.values()].find((item) => item.projectId === projectId);
      if (!contract || contract.status !== "SIGNED") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      await markPaymentPendingIfAlive(projects, projectId, {
        contractId: contract.contractId,
        requestId: `req_pay_pending_${contract.contractId}`,
        idempotencyKey: `payment-pending-${contract.contractId}`,
        occurredAt: nowIso,
      });
      const prepared = payments.preparePayment();
      paymentProjectIds.set(prepared.paymentId, projectId);
      return prepared;
    },

    async confirmPayment(
      actorUserId: string,
      input: ConfirmPaymentInput,
    ): Promise<ConfirmPaymentResponse> {
      const row = payments.getPayment(MOCK_PAYMENT_ID);
      const projectId = paymentProjectIds.get(row.paymentId) ?? "prj_alive";
      await requireParty(projectId, actorUserId);
      const paid = await payments.confirmPayment(input);
      if (paid.status === "PAID") await startIfPaid(projectId);
      return paid;
    },

    async reconcilePendingPayments() {
      const before = payments.getPayment(MOCK_PAYMENT_ID);
      const after = await payments.reconcilePendingPayments();
      const projectId = paymentProjectIds.get(MOCK_PAYMENT_ID) ?? "prj_alive";
      if (after?.status === "PAID" && before.status !== "PAID") await startIfPaid(projectId);
      return after;
    },

    tripPaymentCircuit() {
      gateway.tripCircuit();
    },

    async receivePaymentWebhook(payload: {
      eventType?: string;
      paymentKey?: string;
      orderId?: string;
      status?: string;
      createdAt?: string;
    }) {
      if (!payload.eventType || !payload.paymentKey || !payload.status) {
        return { accepted: true, applied: false };
      }
      const dedupeKey = `${payload.eventType}|${payload.paymentKey}|${payload.status}|${payload.createdAt ?? ""}`;
      if (webhookInbox.has(dedupeKey)) {
        return { accepted: true, applied: false, alreadyProcessed: true };
      }
      webhookInbox.add(dedupeKey);
      let current: { status: string };
      try {
        current = payments.getPayment(MOCK_PAYMENT_ID);
      } catch {
        return { accepted: true, applied: false };
      }
      if (current.status === "PAID") {
        return { accepted: true, applied: false };
      }
      const before = current.status;
      const after = await payments.reconcilePendingPayments();
      const projectId = paymentProjectIds.get(MOCK_PAYMENT_ID) ?? "prj_alive";
      if (after?.status === "PAID" && before !== "PAID") await startIfPaid(projectId);
      return { accepted: true, applied: after?.status !== before };
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
        invalidateByProject.set(projectId, none);
        return none;
      }
      if (agreement) agreement.status = "REJECTED";
      if (contract) contract.status = "CANCELED";
      const done: InvalidateAgreementResponse = { alreadyProcessed: false, result: "DONE" };
      invalidateIdempotency.set(input.cancellationId, done);
      invalidateByProject.set(projectId, done);
      return done;
    },

    getSignatureAudits(): SignatureAudit[] {
      return [...audits];
    },

    async getDelivery(contractId: string, actorUserId: string): Promise<GetDeliveryResponse> {
      const { seed, ctx } = await requireDeliveryContract(contractId, actorUserId);
      if (ctx.transactionStatus === "IN_PROGRESS" && !ctx.canceledAt) {
        ensureDeliveryForContract(contractId);
      }
      return toDeliveryResponse(seed, ctx, actorUserId);
    },

    ensureDeliveryForContract,

    async prepareDeliveryUpload(
      contractId: string,
      actorUserId: string,
      input: PrepareDeliveryUploadInput,
    ): Promise<PrepareDeliveryUploadResponse> {
      const { seed, ctx } = await requireDeliveryContract(contractId, actorUserId);
      if (actorUserId === ctx.clientId) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      const row = ensureDeliveryForContract(contractId);
      if (
        row.status !== "IN_PROGRESS" ||
        ctx.transactionStatus !== "IN_PROGRESS" ||
        ctx.canceledAt ||
        seed.status !== "SIGNED"
      ) {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      if (!input.fileName?.trim() || !input.contentType?.trim()) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: input.fileName?.trim() ? "contentType" : "fileName", reason: "required" },
        ]);
      }
      if (!input.size || input.size <= 0 || input.size > MAX_DELIVERY_FILE_BYTES) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "size", reason: "invalid" },
        ]);
      }
      if (!SHA256_RE.test(input.sha256 ?? "")) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "sha256", reason: "invalid" },
        ]);
      }
      const uploadId = `upl_${contractId}_${preparedUploads.size + 1}`;
      const objectKey = `deliveries/${contractId}/${uploadId}`;
      preparedUploads.set(uploadId, {
        uploadId,
        objectKey,
        actorUserId,
        contractId,
        fileName: input.fileName.trim(),
        mimeType: input.contentType,
        sizeBytes: input.size,
        sha256: input.sha256,
        ready: true,
        scanStatus: "CLEAN",
      });
      return {
        uploadId,
        uploadUrl: `https://upload.example/${objectKey}`,
        objectKey,
        expiresAt: MOCK_UPLOAD_EXPIRES_AT,
      };
    },

    async requestDelivery(
      contractId: string,
      actorUserId: string,
      input: RequestDeliveryInput,
    ): Promise<GetDeliveryResponse> {
      const { seed, ctx } = await requireDeliveryContract(contractId, actorUserId);
      if (actorUserId === ctx.clientId) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      if (!input.idempotencyKey?.trim()) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "idempotencyKey", reason: "required" },
        ]);
      }
      const idemKey = `${contractId}:${input.idempotencyKey}`;
      const bodyHash = deliveryBodyHash({
        objectKey: input.objectKey,
        uploadId: input.uploadId,
        message: input.message,
      });
      const cached = requestIdempotency.get(idemKey);
      if (cached) {
        if (cached.bodyHash !== bodyHash) {
          throw new DomainContractError(
            "PROJECT_TRANSITION_CONFLICT",
            "프로젝트 상태가 변경되어 처리할 수 없습니다.",
          );
        }
        return { ...cached.response, alreadyProcessed: true };
      }
      if (!input.objectKey || !input.uploadId || !input.message?.trim()) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: input.objectKey ? (input.uploadId ? "message" : "uploadId") : "objectKey", reason: "required" },
        ]);
      }
      if (!input.objectKey.startsWith("deliveries/")) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "objectKey", reason: "invalid" },
        ]);
      }
      const prepared = preparedUploads.get(input.uploadId);
      if (
        !prepared ||
        prepared.objectKey !== input.objectKey ||
        prepared.contractId !== contractId ||
        prepared.actorUserId !== actorUserId ||
        !prepared.ready ||
        prepared.scanStatus !== "CLEAN"
      ) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "objectKey", reason: "not_ready" },
        ]);
      }
      const row = ensureDeliveryForContract(contractId);
      if (row.status === "DELIVERY_REQUESTED" || row.status === "APPROVED") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      if (ctx.transactionStatus !== "IN_PROGRESS" || ctx.canceledAt || seed.status !== "SIGNED") {
        throw new DomainContractError(
          "PROJECT_TRANSITION_CONFLICT",
          "프로젝트 상태가 변경되어 처리할 수 없습니다.",
        );
      }
      row.status = "DELIVERY_REQUESTED";
      row.version += 1;
      row.message = input.message.trim();
      row.requestedAt = nowIso;
      row.objectKey = prepared.objectKey;
      row.fileName = prepared.fileName;
      row.mimeType = prepared.mimeType;
      row.sizeBytes = prepared.sizeBytes;
      const current = { ...toDeliveryResponse(seed, ctx, actorUserId), alreadyProcessed: false };
      requestIdempotency.set(idemKey, { bodyHash, response: current });
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
      input: ApproveDeliveryInput,
    ): Promise<GetDeliveryResponse> {
      const { seed, ctx } = await requireDeliveryContract(contractId, actorUserId);
      if (actorUserId !== ctx.clientId) {
        throw new PublicApiError("PROJECT_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
      }
      if (!input.idempotencyKey?.trim()) {
        throw new DomainContractError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
          { field: "idempotencyKey", reason: "required" },
        ]);
      }
      const idemKey = `${contractId}:${input.idempotencyKey}`;
      const bodyHash = deliveryBodyHash({ expectedVersion: input.expectedVersion ?? null });
      const cached = approveIdempotency.get(idemKey);
      if (cached) {
        if (cached.bodyHash !== bodyHash) {
          throw new DomainContractError(
            "PROJECT_TRANSITION_CONFLICT",
            "프로젝트 상태가 변경되어 처리할 수 없습니다.",
          );
        }
        return { ...cached.response, alreadyProcessed: true };
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
      const firstApproval = row.status !== "APPROVED";
      if (firstApproval) {
        row.status = "APPROVED";
        row.approvedAt = nowIso;
        row.version += 1;
        settlementRequested.add(`delivery:${row.deliveryId}:settlement-requested`);
      }
      await tryCompleteProject(seed);
      const latest = await projects.getProjectNegotiationContext(seed.projectId);
      const current = { ...toDeliveryResponse(seed, latest, actorUserId), alreadyProcessed: !firstApproval };
      approveIdempotency.set(idemKey, { bodyHash, response: current });
      if (firstApproval) {
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
      }
      return current;
    },

    async simulateSettlementReleased(contractId: string): Promise<GetDeliveryResponse> {
      const seed = deliveryContracts.get(contractId);
      if (!seed) {
        throw new DomainContractError("PROJECT_NOT_FOUND", "계약을 찾을 수 없습니다.");
      }
      seed.paymentStatus = "RELEASED";
      await tryCompleteProject(seed);
      const ctx = await projects.getProjectNegotiationContext(seed.projectId);
      return toDeliveryResponse(seed, ctx, MOCK_CLIENT_USER_ID);
    },

    async recoverStuckCompletions(): Promise<number> {
      let recovered = 0;
      for (const seed of deliveryContracts.values()) {
        const before = projects.getCallCounts().completeProjectTransaction;
        await tryCompleteProject(seed);
        if (projects.getCallCounts().completeProjectTransaction > before) recovered += 1;
      }
      return recovered;
    },
  };
}
