// project-management 도메인(유동우 담당)이 제공하는 계약 함수 호출부.
// docs/domain/reference/prd-v5.2.html §5.4 "프로젝트 상태 변경 계약 7종" 중 조준영이 호출하는
// C-02·C-03·C-04·C-07. 실제 구현에서는 project-management 도메인의 HTTP API를 호출한다 —
// 어떤 도메인도 다른 도메인의 테이블을 직접 UPDATE하지 않는다 (PRD §0.2 #21).
//
// 벤더가 아니라 팀 내 다른 도메인이므로 ADR-0009의 포트/어댑터 대상은 아니지만, 호출부를 한
// 파일로 모아 나중에 실제 HTTP 클라이언트로 교체하기 쉽게 한다.

export type StartProjectTransactionResult =
  | { outcome: "STARTED" }
  | { outcome: "ALREADY_IN_PROGRESS" }
  | { outcome: "PROJECT_CANCELED" };

export type CompleteProjectTransactionResult =
  | { outcome: "COMPLETED" }
  | { outcome: "ALREADY_COMPLETED" }
  | { outcome: "CONFLICT" };

export type RestorePreContractProjectReason = "FREELANCER_REJECTED" | "CLIENT_REJECTED";

export type RestorePreContractProjectResult = {
  recruitmentStatus: "OPEN" | "CLOSED";
  transactionStatus: "NONE";
  reopened: boolean;
};

// C-02: 계약 SIGNED + 결제 PAID가 모두 될 때 1회 호출 (spec.md 규칙 9)
export async function startProjectTransaction(projectId: string): Promise<StartProjectTransactionResult> {
  throw new Error("prototype only — not implemented (실제로는 project-management 도메인 API 호출)");
}

// C-03: 납품 APPROVED + 정산 RELEASED가 모두 될 때 1회 호출 (spec.md 규칙 13)
export async function completeProjectTransaction(projectId: string): Promise<CompleteProjectTransactionResult> {
  throw new Error("prototype only — not implemented (실제로는 project-management 도메인 API 호출)");
}

// C-04: 합의 거절 직후 호출 (spec.md 규칙 3)
export async function restorePreContractProject(
  projectId: string,
  agreementId: string,
  reason: RestorePreContractProjectReason,
): Promise<RestorePreContractProjectResult> {
  throw new Error("prototype only — not implemented (실제로는 project-management 도메인 API 호출)");
}

// C-07: PG 결제 요청 직전 호출 (spec.md 규칙 6)
export async function markPaymentPending(projectId: string): Promise<void> {
  throw new Error("prototype only — not implemented (실제로는 project-management 도메인 API 호출)");
}
