import type {
  ContractStatus,
  DeliveryPaymentStatus,
  DeliveryStatus,
  GetDeliveryResponse,
} from "../server/public-api.types";

export type DeliveryUiState =
  | "WORK_IN_PROGRESS"
  | "READY_TO_DELIVER"
  | "WAITING_REVIEW"
  | "ACTION_REQUIRED"
  | "SETTLEMENT_PENDING"
  | "COMPLETED"
  | "PROJECT_CANCELED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "LOAD_FAILED"
  | "STALE";

export type DeliveryViewerRole = "CLIENT" | "FREELANCER";

export type DeliveryLoadError = Extract<
  DeliveryUiState,
  "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED" | "STALE"
>;

export type DeliveryDetailViewModel = {
  contractId: string;
  deliveryId: string | null;
  version: number | null;
  uiState: DeliveryUiState;
  viewerRole: DeliveryViewerRole;
  project: { id: string; title: string; transactionStatus: string };
  contract: { id: string; status: string; amount: number };
  counterpart: { displayName: string };
  delivery: {
    status: DeliveryStatus | null;
    message: string | null;
    requestedAt: string | null;
    approvedAt: string | null;
    file: { fileName: string; mimeType: string; sizeBytes: number } | null;
  };
  payment: { status: "PAID" | "RELEASED" | "OTHER"; settlementLabel: string };
  progress: {
    contractDone: boolean;
    paymentDone: boolean;
    requested: boolean;
    approved: boolean;
    released: boolean;
  };
  permissions: {
    canRequestDelivery: boolean;
    canApprove: boolean;
    canDownload: boolean;
    canReview: boolean;
  };
};

export type DeliveryViewerSession = {
  actorUserId: string;
  clientId: string;
  counterpartDisplayName?: string;
};

export type DeriveDeliveryUiStateInput = {
  loadError?: DeliveryLoadError | null;
  transactionStatus?: string | null;
  canceledAt?: string | null;
  deliveryStatus?: DeliveryStatus | null;
  paymentStatus?: DeliveryPaymentStatus | null;
  contractStatus?: ContractStatus | null;
  hasDelivery: boolean;
  viewerRole: DeliveryViewerRole;
};

const COUNTERPART_FIXTURE: Record<DeliveryViewerRole, string> = {
  CLIENT: "김프리",
  FREELANCER: "김의뢰",
};

function paymentBucket(
  status: DeliveryPaymentStatus | null | undefined,
): "PAID" | "RELEASED" | "OTHER" {
  if (status === "RELEASED") return "RELEASED";
  if (status === "PAID") return "PAID";
  return "OTHER";
}

function settlementLabel(status: "PAID" | "RELEASED" | "OTHER"): string {
  if (status === "RELEASED") return "정산 완료";
  if (status === "PAID") return "결제 완료";
  return "결제 전";
}

/** 설계서 §5.1 + 오류 우선. APPROVED+PAID는 완료가 아니다. */
export function deriveDeliveryUiState(input: DeriveDeliveryUiStateInput): DeliveryUiState {
  if (input.loadError) return input.loadError;
  if (input.transactionStatus === "CANCELED" || Boolean(input.canceledAt)) {
    return "PROJECT_CANCELED";
  }
  const approved = input.deliveryStatus === "APPROVED";
  const released = input.paymentStatus === "RELEASED";
  if (input.transactionStatus === "COMPLETED" || (approved && released)) {
    return "COMPLETED";
  }
  if (approved) return "SETTLEMENT_PENDING";
  if (input.deliveryStatus === "DELIVERY_REQUESTED") {
    return input.viewerRole === "CLIENT" ? "ACTION_REQUIRED" : "WAITING_REVIEW";
  }
  const ready =
    (input.deliveryStatus == null || input.deliveryStatus === "IN_PROGRESS") &&
    input.viewerRole === "FREELANCER" &&
    input.contractStatus === "SIGNED" &&
    (input.paymentStatus === "PAID" || input.paymentStatus === "RELEASED") &&
    input.transactionStatus === "IN_PROGRESS";
  if (ready) return "READY_TO_DELIVER";
  return "WORK_IN_PROGRESS";
}

function permissionsFor(
  uiState: DeliveryUiState,
  hasFile: boolean,
): DeliveryDetailViewModel["permissions"] {
  const canDownload =
    hasFile &&
    (uiState === "WAITING_REVIEW" ||
      uiState === "ACTION_REQUIRED" ||
      uiState === "SETTLEMENT_PENDING" ||
      uiState === "COMPLETED" ||
      uiState === "PROJECT_CANCELED");
  return {
    canRequestDelivery: uiState === "READY_TO_DELIVER",
    canApprove: uiState === "ACTION_REQUIRED",
    canDownload,
    canReview: uiState === "COMPLETED",
  };
}

function viewerRoleOf(session: DeliveryViewerSession): DeliveryViewerRole {
  return session.actorUserId === session.clientId ? "CLIENT" : "FREELANCER";
}

/** GET delivery DTO + 세션을 화면 ViewModel로 바꾼다. URL은 넣지 않는다. */
export function toDeliveryViewModel(
  dto: GetDeliveryResponse | null,
  session: DeliveryViewerSession,
  loadError: DeliveryLoadError | null = null,
): DeliveryDetailViewModel {
  const viewerRole = viewerRoleOf(session);
  const uiState = deriveDeliveryUiState({
    loadError,
    transactionStatus: dto?.transactionStatus,
    canceledAt: dto?.canceledAt,
    deliveryStatus: dto?.delivery?.status ?? null,
    paymentStatus: dto?.paymentStatus,
    contractStatus: dto?.contractStatus,
    hasDelivery: dto?.delivery != null,
    viewerRole,
  });
  const counterpartName =
    session.counterpartDisplayName ?? COUNTERPART_FIXTURE[viewerRole];
  const hideSensitive = loadError === "FORBIDDEN" || loadError === "NOT_FOUND";
  const emptyDelivery = {
    status: null as DeliveryStatus | null,
    message: null as string | null,
    requestedAt: null as string | null,
    approvedAt: null as string | null,
    file: null as DeliveryDetailViewModel["delivery"]["file"],
  };

  if (hideSensitive || dto == null) {
    const pay = paymentBucket(dto?.paymentStatus);
    return {
      contractId: dto?.contractId ?? "",
      deliveryId: null,
      version: null,
      uiState,
      viewerRole,
      project: { id: dto?.projectId ?? "", title: "", transactionStatus: "" },
      contract: { id: dto?.contractId ?? "", status: "", amount: 0 },
      counterpart: { displayName: counterpartName },
      delivery: emptyDelivery,
      payment: { status: pay, settlementLabel: hideSensitive ? "" : settlementLabel(pay) },
      progress: {
        contractDone: false,
        paymentDone: false,
        requested: false,
        approved: false,
        released: false,
      },
      permissions: permissionsFor(uiState, false),
    };
  }

  const file = dto.delivery?.file ?? null;
  const pay = paymentBucket(dto.paymentStatus);
  const requested =
    dto.delivery?.status === "DELIVERY_REQUESTED" || dto.delivery?.status === "APPROVED";
  const approved = dto.delivery?.status === "APPROVED";
  return {
    contractId: dto.contractId,
    deliveryId: dto.delivery?.deliveryId ?? null,
    version: dto.delivery?.version ?? null,
    uiState,
    viewerRole,
    project: {
      id: dto.projectId,
      title: dto.projectTitle,
      transactionStatus: dto.transactionStatus,
    },
    contract: {
      id: dto.contractId,
      status: dto.contractStatus,
      amount: dto.agreedAmount,
    },
    counterpart: { displayName: counterpartName },
    delivery: {
      status: dto.delivery?.status ?? null,
      message: dto.delivery?.message ?? null,
      requestedAt: dto.delivery?.requestedAt ?? null,
      approvedAt: dto.delivery?.approvedAt ?? null,
      file,
    },
    payment: { status: pay, settlementLabel: settlementLabel(pay) },
    progress: {
      contractDone: dto.contractStatus === "SIGNED",
      paymentDone: pay === "PAID" || pay === "RELEASED",
      requested,
      approved,
      released: pay === "RELEASED",
    },
    permissions: permissionsFor(uiState, file != null),
  };
}
