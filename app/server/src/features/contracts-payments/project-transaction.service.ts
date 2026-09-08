import { ignoreNotificationFailure, type NotificationTriggerPort } from "./notification.port";
import type { ProjectTransactionPort } from "./project-transaction.port";
import type {
  CompleteProjectTransactionInput,
  CompleteProjectTransactionResponse,
  MarkPaymentPendingInput,
  RestorePreContractProjectInput,
  StartProjectTransactionInput,
} from "./project-transaction.types";
import { isDomainContractError } from "./project-transaction.types";

/**
 * 원본 파일명은 `contract-transaction.service.ts`였다. 이 기능의 나머지 파일(port/types/mock)이
 * 전부 `project-transaction.*`을 쓰고, `docs/naming-convention.md` §17 "구현에서 잠근 항목" 1번이
 * 거래 상태 enum 이름을 `ProjectTransactionStatus`로 이미 확정해 두었으므로 `project-transaction`
 * 쪽으로 통일했다 — 원본 담당자(조준영)에게 이 이름 불일치를 확인받아야 한다(feedback_loop 기록).
 */
export type DeliveryStatus = "IN_PROGRESS" | "DELIVERY_REQUESTED" | "APPROVED";
export type PaymentStatus = "RELEASED" | "PAID" | "READY" | string;

/** I-30 등 호출자가 포트를 부르기 전에 막는 오류. HTTP 5종 코드가 아니다. */
export class CallerGuardError extends Error {
  constructor(public readonly reason: "I30_NOT_SATISFIED" | "ACCEPTED_APPLICATION_MISMATCH") {
    super(reason);
    this.name = "CallerGuardError";
  }
}

/** 규칙 2: 전이 전에 프로젝트가 살아 있는지 조회한다. */
export async function requireNegotiationContext(
  port: ProjectTransactionPort,
  projectId: string,
) {
  return port.getProjectNegotiationContext(projectId);
}

export async function markPaymentPendingIfAlive(
  port: ProjectTransactionPort,
  projectId: string,
  input: MarkPaymentPendingInput,
) {
  await requireNegotiationContext(port, projectId);
  return port.markPaymentPending(projectId, input);
}

/** 조회 응답의 수락 지원과 계약 지원서를 대조한 뒤에만 start를 부른다. 본문에는 ID를 넣지 않는다. */
export async function startProjectTransactionIfAccepted(
  port: ProjectTransactionPort,
  projectId: string,
  input: StartProjectTransactionInput,
  contractApplicationId: string,
) {
  const context = await requireNegotiationContext(port, projectId);
  if (context.acceptedApplicationId !== contractApplicationId) {
    throw new CallerGuardError("ACCEPTED_APPLICATION_MISMATCH");
  }
  return port.startProjectTransaction(projectId, input);
}

/**
 * I-30: 납품 승인·정산 완료 전에는 complete 포트를 호출하지 않는다.
 *
 * `notify`를 넣으면(교차 생명주기 Coordinator 경유) COMPLETED 전이 성공 직후에만
 * `publishReviewRequested`를 양쪽 1회 발행한다(spec.md 규칙 4·26) — throw여도 COMPLETED는
 * 유지하고, 발행 실패도 COMPLETED를 되돌리지 않는다.
 */
export async function completeProjectTransactionIfSettled(
  port: ProjectTransactionPort,
  projectId: string,
  input: CompleteProjectTransactionInput,
  deliveryStatus: DeliveryStatus,
  paymentStatus: PaymentStatus,
  notify?: { notifications: NotificationTriggerPort; freelancerId: string },
) {
  if (deliveryStatus !== "APPROVED" || paymentStatus !== "RELEASED") {
    throw new CallerGuardError("I30_NOT_SATISFIED");
  }
  const context = await requireNegotiationContext(port, projectId);
  let result: CompleteProjectTransactionResponse;
  try {
    result = await port.completeProjectTransaction(projectId, input);
  } catch (err) {
    // 409면 현재 상태를 다시 읽어 COMPLETED만 멱등 성공으로 친다(spec.md 규칙 4).
    if (
      isDomainContractError(err) &&
      (err.body.error.code === "PROJECT_TRANSITION_CONFLICT" ||
        err.body.error.code === "PROJECT_VERSION_CONFLICT")
    ) {
      const again = await requireNegotiationContext(port, projectId);
      if (again.transactionStatus === "COMPLETED") {
        return {
          projectId,
          recruitmentStatus: again.recruitmentStatus,
          transactionStatus: "COMPLETED" as const,
          alreadyProcessed: true,
          processedAt: input.occurredAt,
          changed: false,
          projectVersion: again.projectVersion,
        };
      }
    }
    throw err;
  }
  // COMPLETED 전이 성공 뒤에만 발행한다. throw여도 완료를 되돌리지 않는다.
  if (notify && result.changed) {
    await ignoreNotificationFailure(() =>
      notify.notifications.publishReviewRequested({
        type: "REVIEW_REQUESTED",
        projectId,
        clientId: context.clientId,
        freelancerId: notify.freelancerId,
        occurredAt: input.occurredAt,
      }),
    );
  }
  return result;
}

export async function restorePreContractProjectAfterReject(
  port: ProjectTransactionPort,
  projectId: string,
  input: RestorePreContractProjectInput,
) {
  await requireNegotiationContext(port, projectId);
  return port.restorePreContractProject(projectId, input);
}
