import type { NotificationTriggerPort } from "./notification.port";
import type { ProjectTransactionPort } from "./project-transaction.port";
import {
  completeProjectTransactionIfSettled,
  requireNegotiationContext,
  startProjectTransactionIfAccepted,
} from "./project-transaction.service";

/**
 * 교차 생명주기 Coordinator — 공개 HTTP·`ORCH_*` 코드가 아니다(spec.md 규칙 26).
 * 사건(`SIGNED`/`PAID`/`APPROVED`/`RELEASED`)마다 계약·결제·납품·프로젝트를 다시 읽고
 * AND가 맞을 때만 규칙 3·4(start/complete)를 호출한다. 한쪽만이면 호출하지 않고 원장을
 * 유지한다 — 역순·중복 이벤트도 재조회로 전이는 1회만 일어난다.
 *
 * 원본: features/contracts-payments/prototype/server/transaction-lifecycle.coordinator.ts
 * (28471d6, #80).
 */

export type CoordinatorContractStatus = "DRAFT" | "SIGNING" | "SIGNED" | "CANCELED";
export type CoordinatorPaymentStatus = "READY" | "PENDING" | "PAID" | "FAILED" | "RELEASED";
export type CoordinatorDeliveryStatus = "IN_PROGRESS" | "DELIVERY_REQUESTED" | "APPROVED";

/** 공식 상태는 각 도메인 조회값이다. Coordinator는 복사본을 저장하지 않는다. */
export type TransactionLifecycleSnapshot = {
  projectId: string;
  contractId: string;
  contractApplicationId: string;
  freelancerId: string;
  contractStatus: CoordinatorContractStatus;
  paymentStatus: CoordinatorPaymentStatus | null;
  deliveryStatus: CoordinatorDeliveryStatus | null;
};

export type TransactionLifecycleSnapshotReader = {
  read(projectId: string): Promise<TransactionLifecycleSnapshot>;
};

export type TransactionLifecycleEvent = {
  eventId: string;
  projectId: string;
  occurredAt: string;
};

export type CoordinatorHandleResult = {
  duplicateEvent: boolean;
  started: boolean;
  completed: boolean;
};

export type TransactionLifecycleCoordinator = {
  onContractSigned(event: TransactionLifecycleEvent): Promise<CoordinatorHandleResult>;
  onPaymentPaid(event: TransactionLifecycleEvent): Promise<CoordinatorHandleResult>;
  onDeliveryApproved(event: TransactionLifecycleEvent): Promise<CoordinatorHandleResult>;
  onPaymentReleased(event: TransactionLifecycleEvent): Promise<CoordinatorHandleResult>;
};

export type TransactionLifecycleCoordinatorDeps = {
  projects: ProjectTransactionPort;
  snapshots: TransactionLifecycleSnapshotReader;
  notifications: NotificationTriggerPort;
};

const idle: CoordinatorHandleResult = {
  duplicateEvent: false,
  started: false,
  completed: false,
};

/** 교차 AND만 평가하고 기존 start/complete 가드를 호출한다. */
export function createTransactionLifecycleCoordinator(
  deps: TransactionLifecycleCoordinatorDeps,
): TransactionLifecycleCoordinator {
  const seenEventIds = new Set<string>();

  async function evaluateStart(
    event: TransactionLifecycleEvent,
  ): Promise<CoordinatorHandleResult> {
    if (seenEventIds.has(event.eventId)) {
      return { ...idle, duplicateEvent: true };
    }
    const snapshot = await deps.snapshots.read(event.projectId);
    const context = await requireNegotiationContext(deps.projects, event.projectId);
    const bothReady = snapshot.contractStatus === "SIGNED" && snapshot.paymentStatus === "PAID";
    if (!bothReady || context.transactionStatus !== "CONTRACT_PENDING") {
      seenEventIds.add(event.eventId);
      return idle;
    }
    try {
      await startProjectTransactionIfAccepted(
        deps.projects,
        event.projectId,
        {
          contractId: snapshot.contractId,
          requestId: event.eventId,
          idempotencyKey: `transaction-start-${snapshot.contractId}`,
          occurredAt: event.occurredAt,
          expectedProjectVersion: context.projectVersion,
        },
        snapshot.contractApplicationId,
      );
      seenEventIds.add(event.eventId);
      return { ...idle, started: true };
    } catch {
      // 실패를 성공으로 바꾸지 않고 PAID 원장을 유지한 채 재시도한다.
      return idle;
    }
  }

  async function evaluateComplete(
    event: TransactionLifecycleEvent,
  ): Promise<CoordinatorHandleResult> {
    if (seenEventIds.has(event.eventId)) {
      return { ...idle, duplicateEvent: true };
    }
    const snapshot = await deps.snapshots.read(event.projectId);
    const context = await requireNegotiationContext(deps.projects, event.projectId);
    const bothReady =
      snapshot.deliveryStatus === "APPROVED" && snapshot.paymentStatus === "RELEASED";
    if (!bothReady || context.transactionStatus !== "IN_PROGRESS") {
      seenEventIds.add(event.eventId);
      return idle;
    }
    try {
      await completeProjectTransactionIfSettled(
        deps.projects,
        event.projectId,
        {
          contractId: snapshot.contractId,
          requestId: event.eventId,
          idempotencyKey: `transaction-complete-${snapshot.contractId}`,
          occurredAt: event.occurredAt,
          expectedProjectVersion: context.projectVersion,
        },
        "APPROVED",
        "RELEASED",
        {
          notifications: deps.notifications,
          freelancerId: snapshot.freelancerId,
        },
      );
      seenEventIds.add(event.eventId);
      return { ...idle, completed: true };
    } catch {
      return idle;
    }
  }

  return {
    onContractSigned: evaluateStart,
    onPaymentPaid: evaluateStart,
    onDeliveryApproved: evaluateComplete,
    onPaymentReleased: evaluateComplete,
  };
}
