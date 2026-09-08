import type { GetPaymentResponse } from "../server/public-api.types";

export type PaymentUiState =
  | "PAYMENT_AVAILABLE"
  | "WINDOW_OPENING"
  | "CONFIRMING"
  | "PAYMENT_CONFIRMING"
  | "PAID_SYNCING"
  | "PAID"
  | "FAILED_RETRYABLE"
  | "USER_CANCELED"
  | "PROJECT_CANCELED"
  | "CONTRACT_NOT_SIGNED"
  | "ALREADY_PAID"
  | "TEMPORARILY_UNAVAILABLE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "LOAD_FAILED"
  | "STALE"
  | "KEY_MISSING";

export type PaymentViewerRole = "CLIENT" | "FREELANCER";

export type PaymentLoadError = Extract<
  PaymentUiState,
  "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED" | "STALE"
>;

export type PaymentClientOverlay = Extract<
  PaymentUiState,
  | "WINDOW_OPENING"
  | "CONFIRMING"
  | "USER_CANCELED"
  | "KEY_MISSING"
  | "TEMPORARILY_UNAVAILABLE"
  | "ALREADY_PAID"
>;

export type PaymentPrimaryAction = "START" | "RETRY" | "CHECK" | "VIEW_PROJECT" | null;

export type PaymentPageViewModel = {
  paymentId: string | null;
  contractId: string;
  orderId: string | null;
  uiState: PaymentUiState;
  viewerRole: PaymentViewerRole;
  environment: "SANDBOX";
  projectTitle: string;
  amount: number;
  platformFeeAmount: number;
  settlementAmount: number;
  amountLabel: string;
  platformFeeLabel: string;
  settlementAmountLabel: string;
  paymentMethodLabel: string | null;
  paidAtLabel: string | null;
  primaryAction: PaymentPrimaryAction;
  permissions: { canStart: boolean; canRetry: boolean };
};

export type PaymentViewerSession = {
  actorUserId: string;
  clientId: string;
};

export type DerivePaymentUiStateInput = {
  loadError?: PaymentLoadError | null;
  overlay?: PaymentClientOverlay | null;
  paymentStatus?: GetPaymentResponse["status"] | null;
  projectTransactionStatus?: GetPaymentResponse["projectTransactionStatus"] | string | null;
  contractSigned?: boolean;
  viewerRole: PaymentViewerRole;
};

const LOAD_ERRORS: ReadonlySet<string> = new Set([
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

/** 서버 금액을 표시 문자열로만 바꾼다. 수수료는 다시 나누지 않는다. */
export function formatKrwLabel(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

function isPaid(status: DerivePaymentUiStateInput["paymentStatus"]): boolean {
  return status === "PAID";
}

/** 조회 오류·PAID를 최우선한다. 클라이언트는 금액을 재계산하지 않는다. */
export function derivePaymentUiState(input: DerivePaymentUiStateInput): PaymentUiState {
  if (input.loadError && LOAD_ERRORS.has(input.loadError)) return input.loadError;
  if (isPaid(input.paymentStatus)) {
    if (input.overlay === "ALREADY_PAID") return "ALREADY_PAID";
    if (input.projectTransactionStatus === "CONTRACT_PENDING") return "PAID_SYNCING";
    return "PAID";
  }
  if (input.overlay === "KEY_MISSING") return "KEY_MISSING";
  if (input.overlay === "TEMPORARILY_UNAVAILABLE") return "TEMPORARILY_UNAVAILABLE";
  if (input.projectTransactionStatus === "CANCELED") return "PROJECT_CANCELED";
  if (input.overlay === "USER_CANCELED") return "USER_CANCELED";
  if (input.overlay === "WINDOW_OPENING") return "WINDOW_OPENING";
  if (input.overlay === "CONFIRMING") return "CONFIRMING";
  if (input.paymentStatus === "PENDING") return "PAYMENT_CONFIRMING";
  if (input.contractSigned === false) return "CONTRACT_NOT_SIGNED";
  if (input.paymentStatus === "FAILED") return "FAILED_RETRYABLE";
  return "PAYMENT_AVAILABLE";
}

function permissionsFor(
  uiState: PaymentUiState,
  viewerRole: PaymentViewerRole,
): PaymentPageViewModel["permissions"] {
  const client = viewerRole === "CLIENT";
  return {
    canStart: client && uiState === "PAYMENT_AVAILABLE",
    canRetry: client && (uiState === "FAILED_RETRYABLE" || uiState === "USER_CANCELED"),
  };
}

function primaryActionFor(
  uiState: PaymentUiState,
  permissions: PaymentPageViewModel["permissions"],
): PaymentPrimaryAction {
  if (permissions.canStart) return "START";
  if (permissions.canRetry) return "RETRY";
  if (uiState === "PAYMENT_CONFIRMING" || uiState === "CONFIRMING" || uiState === "PAID_SYNCING") {
    return "CHECK";
  }
  if (uiState === "PAID" || uiState === "ALREADY_PAID" || uiState === "PROJECT_CANCELED") {
    return "VIEW_PROJECT";
  }
  return null;
}

function viewerRoleOf(session: PaymentViewerSession): PaymentViewerRole {
  return session.actorUserId === session.clientId ? "CLIENT" : "FREELANCER";
}

/** GET payment DTO를 화면 ViewModel로 바꾼다. 수수료 공식은 넣지 않는다. */
export function toPaymentViewModel(
  dto: GetPaymentResponse | null,
  session: PaymentViewerSession,
  loadError: PaymentLoadError | null = null,
  overlay: PaymentClientOverlay | null = null,
  contractSigned = true,
): PaymentPageViewModel {
  const viewerRole = viewerRoleOf(session);
  const uiState = derivePaymentUiState({
    loadError,
    overlay,
    paymentStatus: dto?.status ?? null,
    projectTransactionStatus: dto?.projectTransactionStatus,
    contractSigned,
    viewerRole,
  });
  const permissions = permissionsFor(uiState, viewerRole);
  const hideSensitive = loadError === "FORBIDDEN" || loadError === "NOT_FOUND";
  const amount = hideSensitive || dto == null ? 0 : dto.amount;
  const platformFeeAmount = hideSensitive || dto == null ? 0 : dto.platformFeeAmount;
  const settlementAmount = hideSensitive || dto == null ? 0 : dto.settlementAmount;

  return {
    paymentId: hideSensitive ? null : (dto?.paymentId ?? null),
    contractId: hideSensitive ? "" : (dto?.contractId ?? ""),
    orderId: hideSensitive || viewerRole !== "CLIENT" ? null : (dto?.orderId ?? null),
    uiState,
    viewerRole,
    environment: "SANDBOX",
    projectTitle: hideSensitive ? "" : (dto?.projectTitle ?? ""),
    amount,
    platformFeeAmount,
    settlementAmount,
    amountLabel: hideSensitive ? "" : formatKrwLabel(amount),
    platformFeeLabel: hideSensitive ? "" : formatKrwLabel(platformFeeAmount),
    settlementAmountLabel: hideSensitive ? "" : formatKrwLabel(settlementAmount),
    paymentMethodLabel: null,
    paidAtLabel: null,
    primaryAction: primaryActionFor(uiState, permissions),
    permissions,
  };
}
