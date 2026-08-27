import type {
  CompleteProjectTransactionInput,
  CompleteProjectTransactionResponse,
  MarkPaymentPendingInput,
  MarkPaymentPendingResponse,
  ProjectNegotiationContextResponse,
  RestorePreContractProjectInput,
  RestorePreContractProjectResponse,
  StartProjectTransactionInput,
  StartProjectTransactionResponse,
} from "./project-transaction.types";

/** 유동우가 구현하고 조준영이 호출하는 내부 계약. */
export type ProjectTransactionPort = {
  getProjectNegotiationContext(projectId: string): Promise<ProjectNegotiationContextResponse>;
  markPaymentPending(
    projectId: string,
    input: MarkPaymentPendingInput,
  ): Promise<MarkPaymentPendingResponse>;
  startProjectTransaction(
    projectId: string,
    input: StartProjectTransactionInput,
  ): Promise<StartProjectTransactionResponse>;
  completeProjectTransaction(
    projectId: string,
    input: CompleteProjectTransactionInput,
  ): Promise<CompleteProjectTransactionResponse>;
  restorePreContractProject(
    projectId: string,
    input: RestorePreContractProjectInput,
  ): Promise<RestorePreContractProjectResponse>;
};
