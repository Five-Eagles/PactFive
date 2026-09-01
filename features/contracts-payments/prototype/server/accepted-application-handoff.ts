import type {
  ProjectNegotiationContextResponse,
  ProjectTransactionStatus,
} from "./project-transaction.types";

/**
 * 최윤석 accept 이후 조준영 합의 진입 조건 (A1–A4 예, 2026-08-26).
 * acceptedApplicationId가 있고 CONTRACT_PENDING일 때만 proposeNegotiationOffer에 들어간다.
 */
export type AcceptedApplicationHandoff = {
  projectId: string;
  acceptedApplicationId: string;
  transactionStatus: Extract<ProjectTransactionStatus, "CONTRACT_PENDING">;
};

export function canProposeNegotiationOffer(
  ctx: ProjectNegotiationContextResponse,
): ctx is ProjectNegotiationContextResponse & AcceptedApplicationHandoff {
  return ctx.acceptedApplicationId != null && ctx.transactionStatus === "CONTRACT_PENDING";
}

/** 손잡이가 없으면 합의에 들어가지 않는다. A3: 수락 전 acceptedApplicationId는 null. */
export function toAcceptedApplicationHandoff(
  ctx: ProjectNegotiationContextResponse,
): AcceptedApplicationHandoff | null {
  if (!canProposeNegotiationOffer(ctx)) return null;
  return {
    projectId: ctx.projectId,
    acceptedApplicationId: ctx.acceptedApplicationId,
    transactionStatus: "CONTRACT_PENDING",
  };
}
