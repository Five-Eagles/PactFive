import type { ContractStatus, GetContractResponse } from "../server/public-api.types";

export type ContractUiState =
  | "READY_TO_SIGN"
  | "WAITING_COUNTERPART"
  | "SIGNED_PAYMENT_REQUIRED"
  | "SIGNED_PAYMENT_WAIT"
  | "IN_PROGRESS"
  | "PROJECT_CANCELED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "LOAD_FAILED"
  | "STALE";

export type ContractViewerRole = "CLIENT" | "FREELANCER";

export type ContractLoadError = Extract<
  ContractUiState,
  "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED" | "STALE"
>;

export type ContractPaymentStatus = "READY" | "PENDING" | "PAID" | "FAILED" | null;

export type PartySignatureView = {
  role: ContractViewerRole;
  displayName: string;
  signedAt: string | null;
  statusLabel: string;
};

export type ContractDetailViewModel = {
  contractId: string;
  uiState: ContractUiState;
  viewerRole: ContractViewerRole;
  project: { id: string; title: string; transactionStatus: string };
  contract: { id: string; status: string; amount: number };
  workPeriod: { startDate: string; endDate: string };
  counterpart: { displayName: string };
  parties: PartySignatureView[];
  signedAt: string | null;
  permissions: { canSign: boolean; canPay: boolean };
};

export type ContractViewerSession = {
  actorUserId: string;
  clientId: string;
  counterpartDisplayName?: string;
};

export type DeriveContractUiStateInput = {
  loadError?: ContractLoadError | null;
  transactionStatus?: string | null;
  canceledAt?: string | null;
  contractStatus?: ContractStatus | null;
  paymentStatus?: ContractPaymentStatus;
  viewerHasSigned: boolean;
  viewerRole: ContractViewerRole;
};

const PARTY_NAME: Record<ContractViewerRole, string> = {
  CLIENT: "김의뢰",
  FREELANCER: "김프리",
};

const COUNTERPART_FIXTURE: Record<ContractViewerRole, string> = {
  CLIENT: "김프리",
  FREELANCER: "김의뢰",
};

function isPaid(status: ContractPaymentStatus | undefined): boolean {
  return status === "PAID";
}

/** 조회 오류·취소 우선. SIGNED만으로 작업 시작을 만들지 않는다. */
export function deriveContractUiState(input: DeriveContractUiStateInput): ContractUiState {
  if (input.loadError) return input.loadError;
  if (
    input.transactionStatus === "CANCELED" ||
    Boolean(input.canceledAt) ||
    input.contractStatus === "CANCELED"
  ) {
    return "PROJECT_CANCELED";
  }
  const signed = input.contractStatus === "SIGNED";
  if (signed && isPaid(input.paymentStatus) && input.transactionStatus === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }
  if (signed && isPaid(input.paymentStatus)) return "IN_PROGRESS";
  if (signed) {
    return input.viewerRole === "CLIENT" ? "SIGNED_PAYMENT_REQUIRED" : "SIGNED_PAYMENT_WAIT";
  }
  if (input.viewerHasSigned) return "WAITING_COUNTERPART";
  return "READY_TO_SIGN";
}

function permissionsFor(uiState: ContractUiState): ContractDetailViewModel["permissions"] {
  return {
    canSign: uiState === "READY_TO_SIGN",
    canPay: uiState === "SIGNED_PAYMENT_REQUIRED",
  };
}

function viewerRoleOf(session: ContractViewerSession): ContractViewerRole {
  return session.actorUserId === session.clientId ? "CLIENT" : "FREELANCER";
}

function viewerHasSigned(
  role: ContractViewerRole,
  dto: GetContractResponse | null,
): boolean {
  if (dto == null) return false;
  return role === "CLIENT" ? dto.clientSignedAt != null : dto.freelancerSignedAt != null;
}

function partyView(
  role: ContractViewerRole,
  signedAt: string | null,
): PartySignatureView {
  return {
    role,
    displayName: PARTY_NAME[role],
    signedAt,
    statusLabel: signedAt ? "서명 완료" : "서명 전",
  };
}

/** GET contract DTO + 세션을 화면 ViewModel로 바꾼다. 해시는 넣지 않는다. */
export function toContractViewModel(
  dto: GetContractResponse | null,
  session: ContractViewerSession,
  loadError: ContractLoadError | null = null,
): ContractDetailViewModel {
  const viewerRole = viewerRoleOf(session);
  const uiState = deriveContractUiState({
    loadError,
    transactionStatus: dto?.transactionStatus,
    canceledAt: dto?.canceledAt,
    contractStatus: dto?.status,
    paymentStatus: dto?.paymentStatus ?? null,
    viewerHasSigned: viewerHasSigned(viewerRole, dto),
    viewerRole,
  });
  const counterpartName =
    session.counterpartDisplayName ?? COUNTERPART_FIXTURE[viewerRole];
  const hideSensitive = loadError === "FORBIDDEN" || loadError === "NOT_FOUND";
  const emptyParties: PartySignatureView[] = [
    partyView("CLIENT", null),
    partyView("FREELANCER", null),
  ];

  if (hideSensitive || dto == null) {
    return {
      contractId: dto?.contractId ?? "",
      uiState,
      viewerRole,
      project: { id: dto?.projectId ?? "", title: "", transactionStatus: "" },
      contract: { id: dto?.contractId ?? "", status: "", amount: 0 },
      workPeriod: { startDate: "", endDate: "" },
      counterpart: { displayName: counterpartName },
      parties: emptyParties,
      signedAt: null,
      permissions: permissionsFor(uiState),
    };
  }

  return {
    contractId: dto.contractId,
    uiState,
    viewerRole,
    project: {
      id: dto.projectId,
      title: dto.termsSnapshot.projectTitle,
      transactionStatus: dto.transactionStatus,
    },
    contract: {
      id: dto.contractId,
      status: dto.status,
      amount: dto.termsSnapshot.amount,
    },
    workPeriod: { startDate: dto.workStartDate, endDate: dto.workEndDate },
    counterpart: { displayName: counterpartName },
    parties: [
      partyView("CLIENT", dto.clientSignedAt),
      partyView("FREELANCER", dto.freelancerSignedAt),
    ],
    signedAt: dto.signedAt,
    permissions: permissionsFor(uiState),
  };
}
