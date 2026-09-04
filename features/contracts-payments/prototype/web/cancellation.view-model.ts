import type {
  GetCancellationResponse,
  PostActionResult,
} from "../server/public-api.types";

export type CancellationUiState =
  | "CANCEL_AVAILABLE"
  | "SUBMITTING"
  | "CANCELED_COMPLETE"
  | "CANCELED_FOLLOWUP_PENDING"
  | "ALREADY_CANCELED"
  | "PAYMENT_STARTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "LOAD_FAILED"
  | "STALE";

export type CancellationViewerRole = "CLIENT" | "FREELANCER";

export type CancellationLoadError = Extract<
  CancellationUiState,
  "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED" | "STALE"
>;

export type CancellationClientOverlay = Extract<
  CancellationUiState,
  "SUBMITTING" | "ALREADY_CANCELED"
>;

export type CancellationPrimaryAction = "OPEN_CONFIRM" | "VIEW_PAYMENT" | "VIEW_PROJECT" | null;

export type CancellationImpactItem = {
  kind: "AGREEMENT" | "CONTRACT" | "NOTIFICATION";
  label: string;
};

export type CancellationPostActionView = {
  key: "applicationRejection" | "contractInvalidation";
  status: PostActionResult;
  label: string;
};

export type CancellationDetailViewModel = {
  projectId: string;
  uiState: CancellationUiState;
  viewerRole: CancellationViewerRole;
  projectTitle: string;
  canCancel: boolean;
  impactItems: CancellationImpactItem[];
  canceledAtLabel: string | null;
  postActions: CancellationPostActionView[];
  primaryAction: CancellationPrimaryAction;
};

export type CancellationViewerSession = {
  actorUserId: string;
  clientId: string;
};

export type DeriveCancellationUiStateInput = {
  loadError?: CancellationLoadError | null;
  overlay?: CancellationClientOverlay | null;
  transactionStatus?: GetCancellationResponse["transactionStatus"] | string | null;
  paymentPendingAt?: string | null;
  canceledAt?: string | null;
  postActions?: GetCancellationResponse["postActions"];
  viewerRole?: CancellationViewerRole;
};

const LOAD_ERRORS: ReadonlySet<string> = new Set([
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

function hasFailedPostAction(postActions: GetCancellationResponse["postActions"]): boolean {
  if (!postActions) return false;
  return (
    postActions.applicationRejection === "FAILED" ||
    postActions.contractInvalidation === "FAILED"
  );
}

function isCanceled(
  transactionStatus: DeriveCancellationUiStateInput["transactionStatus"],
  canceledAt: string | null | undefined,
): boolean {
  return transactionStatus === "CANCELED" || Boolean(canceledAt);
}

/** 조회 오류·이미 취소를 최우선한다. 202 후처리는 취소 실패가 아니다. */
export function deriveCancellationUiState(
  input: DeriveCancellationUiStateInput,
): CancellationUiState {
  if (input.loadError && LOAD_ERRORS.has(input.loadError)) return input.loadError;
  if (isCanceled(input.transactionStatus, input.canceledAt)) {
    if (input.overlay === "ALREADY_CANCELED") return "ALREADY_CANCELED";
    if (hasFailedPostAction(input.postActions)) return "CANCELED_FOLLOWUP_PENDING";
    return "CANCELED_COMPLETE";
  }
  if (input.transactionStatus === "COMPLETED") return "COMPLETED";
  if (input.transactionStatus === "IN_PROGRESS") return "IN_PROGRESS";
  if (input.paymentPendingAt) return "PAYMENT_STARTED";
  if (input.overlay === "SUBMITTING") return "SUBMITTING";
  if (
    input.viewerRole === "CLIENT" &&
    (input.transactionStatus === "NONE" || input.transactionStatus === "CONTRACT_PENDING")
  ) {
    return "CANCEL_AVAILABLE";
  }
  return "CANCEL_AVAILABLE";
}

function primaryActionFor(uiState: CancellationUiState): CancellationPrimaryAction {
  if (uiState === "CANCEL_AVAILABLE") return "OPEN_CONFIRM";
  if (uiState === "PAYMENT_STARTED") return "VIEW_PAYMENT";
  return "VIEW_PROJECT";
}

function viewerRoleOf(session: CancellationViewerSession): CancellationViewerRole {
  return session.actorUserId === session.clientId ? "CLIENT" : "FREELANCER";
}

export function postActionLabel(
  key: CancellationPostActionView["key"],
  status: PostActionResult,
): string {
  if (key === "applicationRejection") {
    if (status === "DONE") return "지원 처리 완료";
    if (status === "FAILED") return "지원 후속 처리 중";
    return "처리할 지원 없음";
  }
  if (status === "DONE") return "합의·계약 종료 완료";
  if (status === "FAILED") return "합의·계약 후속 처리 중";
  return "종료할 합의·계약 없음";
}

function impactItemsFrom(dto: GetCancellationResponse | null): CancellationImpactItem[] {
  if (!dto) return [];
  const items: CancellationImpactItem[] = [];
  if (dto.agreementStatus) {
    items.push({
      kind: "AGREEMENT",
      label: "프로젝트 취소로 금액 합의가 종료됩니다",
    });
  }
  if (dto.contractStatus) {
    items.push({
      kind: "CONTRACT",
      label: dto.hasSignatureAudit
        ? "프로젝트 취소로 계약 진행이 종료됩니다. 기존 서명 기록은 보존됩니다"
        : "프로젝트 취소로 계약 진행이 종료됩니다",
    });
  }
  return items;
}

function formatCanceledAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return `${date.getUTCFullYear()}. ${date.getUTCMonth() + 1}. ${date.getUTCDate()}.`;
}

/** GET cancellation DTO를 화면 ViewModel로 바꾼다. 취소 POST는 만들지 않는다. */
export function toCancellationViewModel(
  dto: GetCancellationResponse | null,
  session: CancellationViewerSession,
  loadError: CancellationLoadError | null = null,
  overlay: CancellationClientOverlay | null = null,
): CancellationDetailViewModel {
  const viewerRole = viewerRoleOf(session);
  const uiState = deriveCancellationUiState({
    loadError,
    overlay,
    transactionStatus: dto?.transactionStatus,
    paymentPendingAt: dto?.paymentPendingAt,
    canceledAt: dto?.canceledAt,
    postActions: dto?.postActions,
    viewerRole,
  });
  const hideSensitive = loadError === "FORBIDDEN" || loadError === "NOT_FOUND";
  const canCancel = uiState === "CANCEL_AVAILABLE" && viewerRole === "CLIENT";
  const postActions =
    hideSensitive || dto?.postActions == null
      ? []
      : (
          [
            ["applicationRejection", dto.postActions.applicationRejection],
            ["contractInvalidation", dto.postActions.contractInvalidation],
          ] as const
        ).map(([key, status]) => ({
          key,
          status,
          label: postActionLabel(key, status),
        }));

  return {
    projectId: hideSensitive ? "" : (dto?.projectId ?? ""),
    uiState,
    viewerRole,
    projectTitle: hideSensitive ? "" : (dto?.projectTitle ?? ""),
    canCancel,
    impactItems: hideSensitive ? [] : impactItemsFrom(dto),
    canceledAtLabel: hideSensitive ? null : formatCanceledAt(dto?.canceledAt ?? null),
    postActions,
    primaryAction: primaryActionFor(uiState),
  };
}
