import { formatKrwLabel } from "./payment.view-model";
import type { DeliveryStatus, GetSettlementResponse } from "../server/public-api.types";

export type SettlementUiState =
  | "WAITING_PAYMENT"
  | "WAITING_DELIVERY"
  | "WAITING_APPROVAL"
  | "ELIGIBLE"
  | "PROCESSING"
  | "RELEASE_SYNCING"
  | "COMPLETION_SYNCING"
  | "RELEASED"
  | "FAILED"
  | "REVIEW_REQUIRED"
  | "PROJECT_CANCELED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "LOAD_FAILED"
  | "STALE";

export type SettlementViewerRole = "CLIENT" | "FREELANCER";

export type SettlementLoadError = Extract<
  SettlementUiState,
  "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED" | "STALE"
>;

export type SettlementClientOverlay = Extract<
  SettlementUiState,
  "PROCESSING" | "RELEASE_SYNCING" | "FAILED"
>;

export type SettlementPrimaryAction =
  | "VIEW_DELIVERY"
  | "VIEW_PAYMENT"
  | "VIEW_PROJECT"
  | "WRITE_REVIEW"
  | null;

export type SettlementTimelineItem = {
  id: "payment" | "approval" | "settlement" | "complete";
  label: string;
  statusLabel: string;
  done: boolean;
};

export type SettlementDetailViewModel = {
  paymentId: string | null;
  contractId: string;
  projectId: string;
  uiState: SettlementUiState;
  viewerRole: SettlementViewerRole;
  environment: "SANDBOX";
  isSimulation: boolean;
  projectTitle: string;
  paymentAmount: number;
  platformFeeAmount: number;
  settlementAmount: number;
  primaryAmount: number;
  primaryAmountLabel: string;
  paymentAmountLabel: string;
  platformFeeRateLabel: string;
  platformFeeAmountLabel: string;
  settlementAmountLabel: string;
  timeline: SettlementTimelineItem[];
  blockedReasonLabel: string | null;
  primaryAction: SettlementPrimaryAction;
};

export type SettlementViewerSession = {
  actorUserId: string;
  clientId: string;
};

export type DeriveSettlementUiStateInput = {
  loadError?: SettlementLoadError | null;
  overlay?: SettlementClientOverlay | null;
  paymentStatus?: GetSettlementResponse["paymentStatus"] | null;
  deliveryStatus?: DeliveryStatus | null;
  projectTransactionStatus?: GetSettlementResponse["projectTransactionStatus"] | string | null;
  canceledAt?: string | null;
  amountMismatch?: boolean;
};

const LOAD_ERRORS: ReadonlySet<string> = new Set([
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

export function amountsMismatch(
  paymentAmount: number,
  platformFeeAmount: number,
  settlementAmount: number,
): boolean {
  return platformFeeAmount + settlementAmount !== paymentAmount;
}

function feeRateLabel(bps: number): string {
  return `${(bps / 100).toLocaleString("ko-KR")}%`;
}

/** 조회 오류·취소를 최우선한다. 금액은 다시 나누지 않는다. */
export function deriveSettlementUiState(input: DeriveSettlementUiStateInput): SettlementUiState {
  if (input.loadError && LOAD_ERRORS.has(input.loadError)) return input.loadError;
  if (input.projectTransactionStatus === "CANCELED" || Boolean(input.canceledAt)) {
    return "PROJECT_CANCELED";
  }
  if (input.amountMismatch) return "REVIEW_REQUIRED";
  const released = input.paymentStatus === "RELEASED";
  if (released && input.projectTransactionStatus === "COMPLETED") return "RELEASED";
  if (released) return "COMPLETION_SYNCING";
  if (input.overlay === "FAILED") return "FAILED";
  if (input.overlay === "PROCESSING") return "PROCESSING";
  if (input.overlay === "RELEASE_SYNCING") return "RELEASE_SYNCING";
  if (input.deliveryStatus === "APPROVED" && input.paymentStatus === "PAID") return "ELIGIBLE";
  if (input.deliveryStatus === "DELIVERY_REQUESTED") return "WAITING_APPROVAL";
  if (input.paymentStatus === "PAID") return "WAITING_DELIVERY";
  return "WAITING_PAYMENT";
}

function primaryActionFor(uiState: SettlementUiState): SettlementPrimaryAction {
  if (uiState === "WAITING_PAYMENT") return "VIEW_PAYMENT";
  if (
    uiState === "WAITING_DELIVERY" ||
    uiState === "WAITING_APPROVAL" ||
    uiState === "ELIGIBLE"
  ) {
    return "VIEW_DELIVERY";
  }
  if (uiState === "RELEASED") return "WRITE_REVIEW";
  if (LOAD_ERRORS.has(uiState) || uiState === "PROJECT_CANCELED" || uiState === "REVIEW_REQUIRED") {
    return "VIEW_PROJECT";
  }
  return "VIEW_PROJECT";
}

function viewerRoleOf(session: SettlementViewerSession): SettlementViewerRole {
  return session.actorUserId === session.clientId ? "CLIENT" : "FREELANCER";
}

function blockedReasonFor(uiState: SettlementUiState): string | null {
  if (uiState === "WAITING_PAYMENT") return "결제 완료가 필요합니다";
  if (uiState === "WAITING_DELIVERY") return "납품 요청을 기다리고 있습니다";
  if (uiState === "WAITING_APPROVAL") return "납품 승인이 필요합니다";
  if (uiState === "REVIEW_REQUIRED") return "정산 금액 확인이 필요합니다";
  return null;
}

function timelineFor(input: {
  paymentStatus?: GetSettlementResponse["paymentStatus"] | null;
  deliveryStatus?: DeliveryStatus | null;
  uiState: SettlementUiState;
}): SettlementTimelineItem[] {
  const paid =
    input.paymentStatus === "PAID" || input.paymentStatus === "RELEASED";
  const approved = input.deliveryStatus === "APPROVED";
  const settled = input.uiState === "RELEASED" || input.uiState === "COMPLETION_SYNCING";
  const completed = input.uiState === "RELEASED";
  return [
    {
      id: "payment",
      label: "결제",
      statusLabel: paid ? "결제 승인 완료" : "대기",
      done: paid,
    },
    {
      id: "approval",
      label: "납품 승인",
      statusLabel: approved ? "납품 승인 완료" : "대기",
      done: approved,
    },
    {
      id: "settlement",
      label: "정산 시뮬레이션",
      statusLabel: settled ? "Sandbox 정산 시뮬레이션 완료" : "대기",
      done: settled,
    },
    {
      id: "complete",
      label: "거래 완료",
      statusLabel: completed ? "거래 완료" : "대기",
      done: completed,
    },
  ];
}

/** GET settlement DTO를 화면 ViewModel로 바꾼다. 수수료 공식은 넣지 않는다. */
export function toSettlementViewModel(
  dto: GetSettlementResponse | null,
  session: SettlementViewerSession,
  loadError: SettlementLoadError | null = null,
  overlay: SettlementClientOverlay | null = null,
): SettlementDetailViewModel {
  const viewerRole = viewerRoleOf(session);
  const mismatch =
    dto != null &&
    amountsMismatch(dto.paymentAmount, dto.platformFeeAmount, dto.settlementAmount);
  const uiState = deriveSettlementUiState({
    loadError,
    overlay,
    paymentStatus: dto?.paymentStatus ?? null,
    deliveryStatus: dto?.deliveryStatus ?? null,
    projectTransactionStatus: dto?.projectTransactionStatus,
    canceledAt: dto?.canceledAt,
    amountMismatch: mismatch,
  });
  const hideSensitive = loadError === "FORBIDDEN" || loadError === "NOT_FOUND";
  const paymentAmount = hideSensitive || dto == null ? 0 : dto.paymentAmount;
  const platformFeeAmount = hideSensitive || dto == null ? 0 : dto.platformFeeAmount;
  const settlementAmount = hideSensitive || dto == null ? 0 : dto.settlementAmount;
  const primaryAmount = viewerRole === "FREELANCER" ? settlementAmount : paymentAmount;
  const rateBps = hideSensitive || dto == null ? 0 : dto.platformFeeRateBps;

  return {
    paymentId: hideSensitive ? null : (dto?.paymentId ?? null),
    contractId: hideSensitive ? "" : (dto?.contractId ?? ""),
    projectId: hideSensitive ? "" : (dto?.projectId ?? ""),
    uiState,
    viewerRole,
    environment: "SANDBOX",
    isSimulation: true,
    projectTitle: hideSensitive ? "" : (dto?.projectTitle ?? ""),
    paymentAmount,
    platformFeeAmount,
    settlementAmount,
    primaryAmount,
    primaryAmountLabel: hideSensitive ? "" : formatKrwLabel(primaryAmount),
    paymentAmountLabel: hideSensitive ? "" : formatKrwLabel(paymentAmount),
    platformFeeRateLabel: hideSensitive ? "" : feeRateLabel(rateBps),
    platformFeeAmountLabel: hideSensitive ? "" : formatKrwLabel(platformFeeAmount),
    settlementAmountLabel: hideSensitive ? "" : formatKrwLabel(settlementAmount),
    timeline: hideSensitive
      ? []
      : timelineFor({
          paymentStatus: dto?.paymentStatus,
          deliveryStatus: dto?.deliveryStatus,
          uiState,
        }),
    blockedReasonLabel: hideSensitive ? null : blockedReasonFor(uiState),
    primaryAction: primaryActionFor(uiState),
  };
}
