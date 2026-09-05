import type { CurrentNegotiationOfferResponse } from "../server/public-api.types";
import type { ContractStatus } from "../server/contract.types";

export type AgreementUiState =
  | "NOT_PROPOSED"
  | "WAITING_RESPONSE"
  | "ACTION_REQUIRED"
  | "AGREED"
  | "REJECTED_REOPENED"
  | "REJECTED_CLOSED"
  | "PROJECT_CANCELED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "LOAD_FAILED"
  | "STALE";

export type AgreementViewerRole = "CLIENT" | "FREELANCER";

export type AgreementLoadError = Extract<
  AgreementUiState,
  "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED" | "STALE"
>;

export type AgreementDetailViewModel = {
  agreementId: string | null;
  applicationId: string | null;
  round: number | null;
  uiState: AgreementUiState;
  viewerRole: AgreementViewerRole;
  project: {
    id: string;
    title: string;
    recruitmentStatus: string;
    transactionStatus: string;
  };
  counterpart: { displayName: string };
  currentOffer: {
    offerId: string;
    round: number;
    amount: number;
    currency: "KRW";
  } | null;
  history: { round: number; amount: number; label: string; superseded: boolean }[];
  contract: { id: string; status: ContractStatus } | null;
  rejectionResult: { reopened: boolean; notReopenedReason: string | null } | null;
  permissions: { canPropose: boolean; canAccept: boolean; canReject: boolean; canCounter: boolean };
};

export type AgreementViewerSession = {
  actorUserId: string;
  clientId: string;
  counterpartDisplayName?: string;
};

export type DeriveAgreementUiStateInput = {
  loadError?: AgreementLoadError | null;
  transactionStatus?: string | null;
  canceledAt?: string | null;
  agreementStatus?: "PROPOSED" | "ACCEPTED" | "REJECTED" | null;
  hasOffer: boolean;
  viewerRole: AgreementViewerRole;
  reopened?: boolean | null;
  offeredByUserId?: string | null;
  clientId?: string | null;
};

const TERMINAL_UI_STATES: ReadonlySet<AgreementUiState> = new Set([
  "AGREED",
  "REJECTED_REOPENED",
  "REJECTED_CLOSED",
  "PROJECT_CANCELED",
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

/** PM 표시명이 없으면 시안 픽스처를 쓴다. */
const COUNTERPART_FIXTURE: Record<AgreementViewerRole, string> = {
  CLIENT: "김프리",
  FREELANCER: "김의뢰",
};

/** round 1만 「최초 제안」. 「N차 제안」은 쓰지 않는다. */
export function historyLabelForRound(round: number): string {
  return round === 1 ? "최초 제안" : `${round - 1}회 수정`;
}

/** 아카이브 §5.1을 Increment 1 enum에 맞춘 화면 상태. */
export function deriveAgreementUiState(input: DeriveAgreementUiStateInput): AgreementUiState {
  if (input.loadError) return input.loadError;
  if (input.transactionStatus === "CANCELED" || Boolean(input.canceledAt)) {
    return "PROJECT_CANCELED";
  }
  if (input.agreementStatus === "ACCEPTED") return "AGREED";
  if (input.agreementStatus === "REJECTED") {
    return input.reopened === true ? "REJECTED_REOPENED" : "REJECTED_CLOSED";
  }
  if (!input.hasOffer) return "NOT_PROPOSED";
  if (input.agreementStatus === "PROPOSED" && isLatestOfferRecipient(input)) {
    return "ACTION_REQUIRED";
  }
  return "WAITING_RESPONSE";
}

/** 최신 offer 수신자면 재제안·수락·거절. 작성자 ID가 없으면 Increment 1처럼 프리랜서가 수신자. */
function isLatestOfferRecipient(input: {
  viewerRole: AgreementViewerRole;
  offeredByUserId?: string | null;
  clientId?: string | null;
}): boolean {
  if (!input.offeredByUserId || !input.clientId) {
    return input.viewerRole === "FREELANCER";
  }
  const offeredByClient = input.offeredByUserId === input.clientId;
  return offeredByClient ? input.viewerRole === "FREELANCER" : input.viewerRole === "CLIENT";
}

function permissionsFor(
  uiState: AgreementUiState,
  viewerRole: AgreementViewerRole,
): AgreementDetailViewModel["permissions"] {
  // 종료 상태에서는 서버 권한값이 틀려도 변경 버튼을 그리지 않는다.
  if (TERMINAL_UI_STATES.has(uiState)) {
    return { canPropose: false, canAccept: false, canReject: false, canCounter: false };
  }
  return {
    canPropose: uiState === "NOT_PROPOSED" && viewerRole === "CLIENT",
    canAccept: uiState === "ACTION_REQUIRED",
    canReject: uiState === "ACTION_REQUIRED",
    canCounter: uiState === "ACTION_REQUIRED",
  };
}

function viewerRoleOf(session: AgreementViewerSession): AgreementViewerRole {
  return session.actorUserId === session.clientId ? "CLIENT" : "FREELANCER";
}

/** GET current DTO + 세션을 화면 ViewModel로 바꾼다. */
export function toAgreementViewModel(
  dto: CurrentNegotiationOfferResponse | null,
  session: AgreementViewerSession,
  loadError: AgreementLoadError | null = null,
): AgreementDetailViewModel {
  const viewerRole = viewerRoleOf(session);
  const uiState = deriveAgreementUiState({
    loadError,
    transactionStatus: dto?.transactionStatus,
    canceledAt: dto?.canceledAt,
    agreementStatus: dto?.agreementStatus,
    hasOffer: dto?.offer != null,
    viewerRole,
    reopened: dto?.reopened,
    offeredByUserId: dto?.offer?.offeredByUserId,
    clientId: session.clientId,
  });
  const counterpartName =
    session.counterpartDisplayName ?? COUNTERPART_FIXTURE[viewerRole];
  const hideSensitive = loadError === "FORBIDDEN" || loadError === "NOT_FOUND";

  if (hideSensitive || dto == null) {
    return {
      agreementId: null,
      applicationId: null,
      round: null,
      uiState,
      viewerRole,
      project: {
        id: dto?.projectId ?? "",
        title: "",
        recruitmentStatus: "",
        transactionStatus: "",
      },
      counterpart: { displayName: counterpartName },
      currentOffer: null,
      history: [],
      contract: null,
      rejectionResult: null,
      permissions: permissionsFor(uiState, viewerRole),
    };
  }

  const offer = dto.offer;
  const currentOffer = offer
    ? {
        offerId: offer.offerId,
        round: offer.round,
        amount: offer.amount,
        currency: "KRW" as const,
      }
    : null;
  const offerRows = dto.offers?.length ? dto.offers : offer ? [offer] : [];
  const latestRound = offer?.round ?? 0;
  const history = offerRows
    .slice()
    .sort((a, b) => a.round - b.round)
    .map((row) => ({
      round: row.round,
      amount: row.amount,
      label: historyLabelForRound(row.round),
      // 최신보다 작은 round만 대체됨. SUPERSEDED는 저장하지 않는다.
      superseded: latestRound > 0 && row.round < latestRound,
    }));

  return {
    agreementId: dto.agreementId,
    applicationId: dto.applicationId,
    round: offer?.round ?? null,
    uiState,
    viewerRole,
    project: {
      id: dto.projectId,
      title: dto.projectTitle,
      recruitmentStatus: dto.recruitmentStatus,
      transactionStatus: dto.transactionStatus,
    },
    counterpart: { displayName: counterpartName },
    currentOffer,
    history,
    contract:
      dto.contractId && dto.contractStatus
        ? { id: dto.contractId, status: dto.contractStatus }
        : null,
    rejectionResult:
      dto.agreementStatus === "REJECTED"
        ? {
            reopened: dto.reopened === true,
            notReopenedReason: dto.notReopenedReason,
          }
        : null,
    permissions: permissionsFor(uiState, viewerRole),
  };
}
