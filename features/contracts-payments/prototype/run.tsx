import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canProposeNegotiationOffer,
  createNotificationTriggerMock,
  createProjectTransactionMock,
  createPublicApiMock,
  DomainContractError,
  isDomainContractError,
  isPublicApiError,
  MOCK_CLIENT_USER_ID,
  MOCK_FREELANCER_USER_ID,
  MOCK_NOW,
  MOCK_OUTSIDER_USER_ID,
  MOCK_PAYMENT_ID,
  toAcceptedApplicationHandoff,
  type DomainContractErrorCode,
  type GetDeliveryResponse,
} from "./index";
import { createPaymentRecordMock } from "./mock/payment-record.mock";
import {
  MOCK_DELIVERY_CONTRACT_CANCELED,
  MOCK_DELIVERY_CONTRACT_COMPLETED,
  MOCK_DELIVERY_CONTRACT_IN_PROGRESS,
  MOCK_DELIVERY_FILE_NAME,
  MOCK_DELIVERY_MESSAGE,
  MOCK_DELIVERY_SHA256,
  MOCK_OFFER_AMOUNT,
  MOCK_PROJECT_TITLE,
} from "./mock/public-api.mock";
import {
  createPaymentGatewayMock,
  MOCK_CONFIRMED_AMOUNT,
  MOCK_FAIL_PAYMENT_KEY,
  MOCK_OK_PAYMENT_KEY,
  MOCK_RECOVER_PAID_KEY,
} from "./mock/payment.mock";
import {
  CallerGuardError,
  completeProjectTransactionIfSettled,
  markPaymentPendingIfAlive,
  restorePreContractProjectAfterReject,
  startProjectTransactionIfAccepted,
} from "./server/project-transaction.service";
import { PaymentGatewayError, type PaymentGateway } from "./server/payment.port";
import type { CurrentNegotiationOfferResponse } from "./server/public-api.types";
import {
  createTossPaymentsAdapter,
  hasPgSecretKey,
  isPgKeyMissingError,
} from "./server/toss-payments.adapter";
import {
  deriveAgreementUiState,
  historyLabelForRound,
  toAgreementViewModel,
  type AgreementViewerSession,
} from "./web/agreement.view-model";
import { deriveDeliveryUiState, toDeliveryViewModel } from "./web/delivery.view-model";
import { deriveContractUiState, toContractViewModel } from "./web/contract.view-model";
import { derivePaymentUiState, toPaymentViewModel } from "./web/payment.view-model";
import {
  amountsMismatch,
  deriveSettlementUiState,
  toSettlementViewModel,
} from "./web/settlement.view-model";
import type { GetSettlementResponse, GetCancellationResponse } from "./server/public-api.types";
import {
  deriveCancellationUiState,
  toCancellationViewModel,
} from "./web/cancellation.view-model";
import {
  createCheckoutOrchestrator,
  createTossCheckoutStub,
  failRedirectCopy,
  hasPgClientKey,
  parseTossSuccessQuery,
  shouldConfirmRedirect,
  shouldLoadTossWidget,
  tossWidgetLoaderSrc,
  toTossCheckoutRequest,
} from "./web/toss-checkout.stub";

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (!existsSync(path.join(dir, "scripts", "ensure-deps.js"))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("scripts/ensure-deps.js를 찾지 못했습니다. 리포 루트 구조를 확인하세요.");
    }
    dir = parent;
  }
  return dir;
}

/** 리포 루트 `.env`만 읽는다. 값은 로그에 남기지 않는다. */
function loadFeatureEnv(): void {
  const envPath = path.join(findRepoRoot(path.dirname(fileURLToPath(import.meta.url))), ".env");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function ensurePackagesInstalled(): void {
  const dir = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
  execSync(`node ${JSON.stringify(path.join(dir, "scripts", "ensure-deps.js"))}`, { stdio: "inherit" });
}

/** 키 없으면 Mock. 키 있으면 토스 어댑터. */
function assemblePaymentGateway(): PaymentGateway {
  if (!hasPgSecretKey()) return createPaymentGatewayMock();
  return createTossPaymentsAdapter();
}

async function withClearedPgSecretKey<T>(run: () => Promise<T> | T): Promise<T> {
  const previous = process.env.PG_SECRET_KEY;
  delete process.env.PG_SECRET_KEY;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.PG_SECRET_KEY;
    else process.env.PG_SECRET_KEY = previous;
  }
}

const ALLOWED_CODES: DomainContractErrorCode[] = [
  "PROJECT_NOT_FOUND",
  "PROJECT_TRANSITION_CONFLICT",
  "PROJECT_VERSION_CONFLICT",
  "PROJECT_ALREADY_RESTORED",
  "VALIDATION_ERROR",
];

const CLIENT_SESSION: AgreementViewerSession = {
  actorUserId: MOCK_CLIENT_USER_ID,
  clientId: MOCK_CLIENT_USER_ID,
};
const FREELANCER_SESSION: AgreementViewerSession = {
  actorUserId: MOCK_FREELANCER_USER_ID,
  clientId: MOCK_CLIENT_USER_ID,
};

/** 상태 산정 테스트용 GET current 픽스처. */
function sampleOfferDto(
  overrides: Partial<CurrentNegotiationOfferResponse> = {},
): CurrentNegotiationOfferResponse {
  const offer =
    overrides.offer !== undefined
      ? overrides.offer
      : {
          offerId: "off_1",
          round: 1,
          amount: MOCK_OFFER_AMOUNT,
          currency: "KRW" as const,
          offeredByUserId: MOCK_CLIENT_USER_ID,
        };
  return {
    projectId: "prj_alive",
    agreementId: "agr_1",
    agreementStatus: "PROPOSED",
    offer,
    contractId: null,
    contractStatus: null,
    projectTitle: MOCK_PROJECT_TITLE,
    recruitmentStatus: "CLOSED",
    transactionStatus: "CONTRACT_PENDING",
    canceledAt: null,
    applicationId: "app_123",
    reopened: null,
    notReopenedReason: null,
    offers: offer ? [offer] : [],
    ...overrides,
    offer,
    offers: overrides.offers ?? (offer ? [offer] : []),
  };
}

function hasMutationCta(html: string): boolean {
  return (
    html.includes(">제안하기<") ||
    html.includes(">수락하기<") ||
    html.includes(">거절하기<") ||
    html.includes(">재제안<")
  );
}

function hasEditCta(html: string): boolean {
  return html.includes("프로젝트 수정") || html.includes("수정하기");
}

function hasDeliveryMutationCta(html: string): boolean {
  return (
    html.includes('class="btn primary">결과물 납품') ||
    html.includes('class="btn primary">완료 승인') ||
    html.includes('class="btn primary">납품 요청')
  );
}

let passCount = 0;
let failCount = 0;

function pass(name: string): void {
  passCount += 1;
  console.log("[PASS]", name);
}

function fail(name: string, detail: unknown): void {
  failCount += 1;
  console.error("[FAIL]", name, detail);
}

async function expectCode(
  name: string,
  code: DomainContractErrorCode,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
    fail(name, "오류가 나지 않았습니다");
  } catch (err) {
    if (isDomainContractError(err) && err.body.error.code === code) {
      pass(name);
      return;
    }
    fail(name, err);
  }
}

async function signBothSides(
  api: ReturnType<typeof createPublicApiMock>,
  projectId = "prj_alive",
): Promise<string> {
  const proposed = await api.proposeNegotiationOffer(projectId, MOCK_CLIENT_USER_ID, {
    amount: MOCK_OFFER_AMOUNT,
    currency: "KRW",
  });
  const accepted = await api.acceptNegotiationOffer(
    projectId,
    proposed.offer?.offerId ?? "",
    MOCK_FREELANCER_USER_ID,
    { expectedRound: 1 },
  );
  const contractId = accepted.contractId ?? "";
  await api.signContract(contractId, MOCK_CLIENT_USER_ID);
  await api.signContract(contractId, MOCK_FREELANCER_USER_ID);
  return contractId;
}

async function main() {
  ensurePackagesInstalled();
  loadFeatureEnv();
  console.log("=== contracts-payments prototype 로컬 실행 ===");

  // 규칙 2 — 호출 전 조회
  {
    const mock = createProjectTransactionMock();
    const ctx = await mock.getProjectNegotiationContext("prj_alive");
    if (ctx.transactionStatus === "CONTRACT_PENDING" && ctx.acceptedApplicationId === "app_123") {
      pass("규칙 2: 살아있는 프로젝트 조회");
    } else {
      fail("규칙 2: 살아있는 프로젝트 조회", ctx);
    }
    await expectCode("규칙 2: 없는 프로젝트 404", "PROJECT_NOT_FOUND", () =>
      mock.getProjectNegotiationContext("prj_missing"),
    );
    await expectCode("규칙 2: 삭제된 프로젝트 404", "PROJECT_NOT_FOUND", () =>
      mock.getProjectNegotiationContext("prj_deleted"),
    );
  }

  // 규칙 6·1 — markPaymentPending, 버전 비증가
  {
    const mock = createProjectTransactionMock();
    const first = await mock.markPaymentPending("prj_alive", {
      contractId: "ctr_123",
      requestId: "req_pay_pending_01",
      idempotencyKey: "payment-pending-ctr_123",
      occurredAt: "2026-08-25T05:00:00Z",
    });
    if (
      first.changed === true &&
      first.paymentPendingAt === "2026-08-25T05:00:00Z" &&
      first.projectVersion === 7 &&
      first.transactionStatus === "CONTRACT_PENDING"
    ) {
      pass("규칙 6: 최초 결제 대기 기록, 버전 유지");
    } else {
      fail("규칙 6: 최초 결제 대기 기록, 버전 유지", first);
    }
    const second = await mock.markPaymentPending("prj_alive", {
      contractId: "ctr_123",
      requestId: "req_pay_pending_02",
      idempotencyKey: "payment-pending-ctr_123-retry",
      occurredAt: "2026-08-25T06:00:00Z",
    });
    if (second.changed === false && second.paymentPendingAt === "2026-08-25T05:00:00Z") {
      pass("규칙 6: 재호출 시 최초 시각 유지");
    } else {
      fail("규칙 6: 재호출 시 최초 시각 유지", second);
    }
    await expectCode("규칙 6: 취소된 프로젝트 409", "PROJECT_TRANSITION_CONFLICT", () =>
      mock.markPaymentPending("prj_canceled", {
        contractId: "ctr_123",
        requestId: "req_pay_canceled",
        idempotencyKey: "payment-pending-canceled",
        occurredAt: "2026-08-25T05:00:00Z",
      }),
    );
    await expectCode("규칙 6: contractId 누락 422", "VALIDATION_ERROR", () =>
      mock.markPaymentPending("prj_seq", {
        contractId: "",
        requestId: "req_pay_no_id",
        idempotencyKey: "payment-pending-empty",
        occurredAt: "2026-08-25T05:00:00Z",
      }),
    );
  }

  // 규칙 3 — start. 본문에 acceptedApplicationId를 넣지 않는다.
  {
    const mock = createProjectTransactionMock();
    const started = await startProjectTransactionIfAccepted(
      mock,
      "prj_alive",
      {
        contractId: "ctr_123",
        requestId: "req_start_01",
        idempotencyKey: "transaction-start-ctr_123",
        occurredAt: "2026-08-25T05:01:00Z",
        expectedProjectVersion: 7,
      },
      "app_123",
    );
    if (
      started.transactionStatus === "IN_PROGRESS" &&
      started.changed === true &&
      started.projectVersion === 8 &&
      started.recruitmentStatus === "CLOSED"
    ) {
      pass("규칙 3: CONTRACT_PENDING → IN_PROGRESS");
    } else {
      fail("규칙 3: CONTRACT_PENDING → IN_PROGRESS", started);
    }
    const again = await mock.startProjectTransaction("prj_alive", {
      contractId: "ctr_123",
      requestId: "req_start_02",
      idempotencyKey: "transaction-start-ctr_123-again",
      occurredAt: "2026-08-25T05:02:00Z",
      expectedProjectVersion: 8,
    });
    if (again.alreadyProcessed === true && again.changed === false && again.projectVersion === 8) {
      pass("규칙 3: 이미 IN_PROGRESS 멱등 200");
    } else {
      fail("규칙 3: 이미 IN_PROGRESS 멱등 200", again);
    }
    await expectCode("규칙 3: 취소 프로젝트 409", "PROJECT_TRANSITION_CONFLICT", () =>
      mock.startProjectTransaction("prj_canceled", {
        contractId: "ctr_canceled",
        requestId: "req_start_c",
        idempotencyKey: "transaction-start-canceled",
        occurredAt: "2026-08-25T05:01:00Z",
        expectedProjectVersion: 7,
      }),
    );
    await expectCode("규칙 3: 수락 지원 null 409", "PROJECT_TRANSITION_CONFLICT", () =>
      mock.startProjectTransaction("prj_null_accept", {
        contractId: "ctr_null",
        requestId: "req_start_null",
        idempotencyKey: "transaction-start-null",
        occurredAt: "2026-08-25T05:01:00Z",
        expectedProjectVersion: 7,
      }),
    );
    await expectCode("규칙 3: COMPLETED에서 start 409", "PROJECT_TRANSITION_CONFLICT", () =>
      mock.startProjectTransaction("prj_completed", {
        contractId: "ctr_completed",
        requestId: "req_start_completed",
        idempotencyKey: "transaction-start-completed",
        occurredAt: "2026-08-25T05:01:00Z",
        expectedProjectVersion: 9,
      }),
    );
  }
  {
    const mock = createProjectTransactionMock();
    try {
      await startProjectTransactionIfAccepted(
        mock,
        "prj_seq",
        {
          contractId: "ctr_mismatch",
          requestId: "req_start_mismatch",
          idempotencyKey: "transaction-start-mismatch",
          occurredAt: "2026-08-25T05:01:00Z",
          expectedProjectVersion: 7,
        },
        "app_other",
      );
      fail("규칙 3: 지원서 불일치 시 포트 미호출", "호출이 성공했습니다");
    } catch (err) {
      const counts = mock.getCallCounts();
      if (err instanceof CallerGuardError && counts.startProjectTransaction === 0) {
        pass("규칙 3: 지원서 불일치 시 start 포트 미호출");
      } else {
        fail("규칙 3: 지원서 불일치 시 start 포트 미호출", { err, counts });
      }
    }
  }

  // 규칙 4 — complete + I-30
  {
    const mock = createProjectTransactionMock();
    const before = mock.getCallCounts().completeProjectTransaction;
    try {
      await completeProjectTransactionIfSettled(
        mock,
        "prj_in_progress",
        {
          contractId: "ctr_block",
          requestId: "req_complete_block",
          idempotencyKey: "transaction-complete-block",
          occurredAt: "2026-08-25T06:00:00Z",
          expectedProjectVersion: 8,
        },
        "DELIVERY_REQUESTED",
        "PAID",
      );
      fail("규칙 4: I-30 미충족 시 포트 미호출", "호출이 성공했습니다");
    } catch (err) {
      const after = mock.getCallCounts().completeProjectTransaction;
      if (err instanceof CallerGuardError && err.reason === "I30_NOT_SATISFIED" && after === before) {
        pass("규칙 4: I-30 미충족 시 complete 포트 미호출");
      } else {
        fail("규칙 4: I-30 미충족 시 complete 포트 미호출", { err, before, after });
      }
    }
    const done = await completeProjectTransactionIfSettled(
      mock,
      "prj_in_progress",
      {
        contractId: "ctr_123",
        requestId: "req_complete_01",
        idempotencyKey: "transaction-complete-ctr_123",
        occurredAt: "2026-08-25T06:00:00Z",
        expectedProjectVersion: 8,
      },
      "APPROVED",
      "RELEASED",
    );
    if (done.transactionStatus === "COMPLETED" && done.changed === true && done.projectVersion === 9) {
      pass("규칙 4: IN_PROGRESS → COMPLETED");
    } else {
      fail("규칙 4: IN_PROGRESS → COMPLETED", done);
    }
    const idempotent = await mock.completeProjectTransaction("prj_completed", {
      contractId: "ctr_done",
      requestId: "req_complete_done",
      idempotencyKey: "transaction-complete-already",
      occurredAt: "2026-08-25T06:01:00Z",
      expectedProjectVersion: 9,
    });
    if (idempotent.alreadyProcessed === true && idempotent.transactionStatus === "COMPLETED") {
      pass("규칙 4: 이미 COMPLETED 멱등 200");
    } else {
      fail("규칙 4: 이미 COMPLETED 멱등 200", idempotent);
    }
    await expectCode("규칙 4: CANCELED에서 complete 409", "PROJECT_TRANSITION_CONFLICT", () =>
      mock.completeProjectTransaction("prj_canceled", {
        contractId: "ctr_canceled",
        requestId: "req_complete_c",
        idempotencyKey: "transaction-complete-canceled",
        occurredAt: "2026-08-25T06:00:00Z",
        expectedProjectVersion: 7,
      }),
    );
    await expectCode("규칙 4: CONTRACT_PENDING에서 complete 409", "PROJECT_TRANSITION_CONFLICT", () =>
      mock.completeProjectTransaction("prj_alive", {
        contractId: "ctr_pending",
        requestId: "req_complete_pending",
        idempotencyKey: "transaction-complete-pending",
        occurredAt: "2026-08-25T06:00:00Z",
        expectedProjectVersion: 7,
      }),
    );
  }

  // 규칙 5 — restore
  {
    const mock = createProjectTransactionMock();
    const startAt = mock.getRecruitmentStartAt("prj_restore");
    const restored = await restorePreContractProjectAfterReject(mock, "prj_restore", {
      negotiationId: "ngt_123",
      offerId: "off_3",
      actorUserId: "usr_freelancer_b",
      reason: "FREELANCER_REJECTED",
      requestId: "req_restore_01",
      idempotencyKey: "negotiation-reject-ngt_123",
      occurredAt: "2026-08-25T04:30:00Z",
    });
    if (
      restored.transactionStatus === "NONE" &&
      restored.reopened === true &&
      restored.notReopenedReason === null &&
      restored.recruitmentStatus === "OPEN" &&
      mock.getRecruitmentStartAt("prj_restore") === startAt
    ) {
      pass("규칙 5: 재개 성공, recruitmentStartAt 불변");
    } else {
      fail("규칙 5: 재개 성공, recruitmentStartAt 불변", restored);
    }
    const same = await mock.restorePreContractProject("prj_restore", {
      negotiationId: "ngt_123",
      actorUserId: "usr_freelancer_b",
      reason: "FREELANCER_REJECTED",
      requestId: "req_restore_02",
      idempotencyKey: "negotiation-reject-ngt_123-retry",
      occurredAt: "2026-08-25T04:31:00Z",
    });
    if (same.alreadyProcessed === true && same.reopened === true) {
      pass("규칙 5: 같은 negotiationId 멱등");
    } else {
      fail("규칙 5: 같은 negotiationId 멱등", same);
    }
    await expectCode("규칙 5: 다른 negotiationId 409", "PROJECT_ALREADY_RESTORED", () =>
      mock.restorePreContractProject("prj_restore", {
        negotiationId: "ngt_other",
        actorUserId: "usr_freelancer_b",
        reason: "CLIENT_REJECTED",
        requestId: "req_restore_other",
        idempotencyKey: "negotiation-reject-ngt_other",
        occurredAt: "2026-08-25T04:32:00Z",
      }),
    );
    const deadline = await mock.restorePreContractProject("prj_deadline", {
      negotiationId: "ngt_deadline",
      actorUserId: "usr_client_a",
      reason: "CLIENT_REJECTED",
      requestId: "req_restore_dl",
      idempotencyKey: "negotiation-reject-deadline",
      occurredAt: "2026-08-25T04:30:00Z",
    });
    if (deadline.reopened === false && deadline.notReopenedReason === "DEADLINE_PASSED") {
      pass("규칙 5: 마감 지남 notReopenedReason");
    } else {
      fail("규칙 5: 마감 지남 notReopenedReason", deadline);
    }
    const pending = await mock.restorePreContractProject("prj_pending_apps", {
      negotiationId: "ngt_pending",
      actorUserId: "usr_client_a",
      reason: "CLIENT_REJECTED",
      requestId: "req_restore_pending",
      idempotencyKey: "negotiation-reject-pending",
      occurredAt: "2026-08-25T04:30:00Z",
    });
    if (
      pending.reopened === false &&
      pending.notReopenedReason === "PENDING_APPLICATIONS_REMAIN" &&
      pending.transactionStatus === "NONE"
    ) {
      pass("규칙 5: 대기 지원 잔존 200");
    } else {
      fail("규칙 5: 대기 지원 잔존 200", pending);
    }
  }

  // 규칙 1 — 버전 충돌, start 버전 필수
  {
    const mock = createProjectTransactionMock();
    await expectCode("규칙 1: start 버전 불일치 409", "PROJECT_VERSION_CONFLICT", () =>
      mock.startProjectTransaction("prj_alive", {
        contractId: "ctr_ver",
        requestId: "req_ver",
        idempotencyKey: "transaction-start-ver",
        occurredAt: "2026-08-25T05:01:00Z",
        expectedProjectVersion: 1,
      }),
    );
    const denied = createProjectTransactionMock(MOCK_NOW, { serviceToken: "wrong-token" });
    await expectCode("규칙 1: 토큰 불일치 422", "VALIDATION_ERROR", () =>
      denied.getProjectNegotiationContext("prj_alive"),
    );
  }

  // 규칙 7 — 해피패스 순서 (시드는 이미 CONTRACT_PENDING)
  {
    const mock = createProjectTransactionMock();
    await markPaymentPendingIfAlive(mock, "prj_seq", {
      contractId: "ctr_seq",
      requestId: "req_seq_pending",
      idempotencyKey: "payment-pending-ctr_seq",
      occurredAt: "2026-08-25T05:00:00Z",
    });
    const started = await startProjectTransactionIfAccepted(
      mock,
      "prj_seq",
      {
        contractId: "ctr_seq",
        requestId: "req_seq_start",
        idempotencyKey: "transaction-start-ctr_seq",
        occurredAt: "2026-08-25T05:01:00Z",
        expectedProjectVersion: 7,
      },
      "app_123",
    );
    const completed = await completeProjectTransactionIfSettled(
      mock,
      "prj_seq",
      {
        contractId: "ctr_seq",
        requestId: "req_seq_complete",
        idempotencyKey: "transaction-complete-ctr_seq",
        occurredAt: "2026-08-25T06:00:00Z",
        expectedProjectVersion: started.projectVersion,
      },
      "APPROVED",
      "RELEASED",
    );
    if (started.transactionStatus === "IN_PROGRESS" && completed.transactionStatus === "COMPLETED") {
      pass("규칙 7: markPaymentPending → start → complete");
    } else {
      fail("규칙 7: markPaymentPending → start → complete", { started, completed });
    }
  }

  // 규칙 7 — AcceptedApplicationHandoff (A1–A4). propose는 이 손잡이일 때만.
  {
    const mock = createProjectTransactionMock();
    const alive = await mock.getProjectNegotiationContext("prj_alive");
    const nullAccept = await mock.getProjectNegotiationContext("prj_null_accept");
    const inProgress = await mock.getProjectNegotiationContext("prj_in_progress");
    const handoff = toAcceptedApplicationHandoff(alive);
    if (
      canProposeNegotiationOffer(alive) &&
      handoff?.acceptedApplicationId === "app_123" &&
      handoff.transactionStatus === "CONTRACT_PENDING" &&
      !canProposeNegotiationOffer(nullAccept) &&
      !canProposeNegotiationOffer(inProgress)
    ) {
      pass("규칙 7: AcceptedApplicationHandoff만 propose 진입");
    } else {
      fail("규칙 7: AcceptedApplicationHandoff만 propose 진입", { alive, nullAccept, inProgress });
    }
  }

  // 규칙 7 — PAID·COMPLETED 직후 publish. 납품 2종은 호출하지 않는다.
  {
    const notifications = createNotificationTriggerMock();
    const records = createPaymentRecordMock(createPaymentGatewayMock(), {
      notifications,
      projectId: "prj_seq",
      freelancerId: "usr_freelancer_b",
    });
    const prepared = records.preparePayment(MOCK_CONFIRMED_AMOUNT);
    const paid = await records.confirmPayment({
      orderId: prepared.orderId,
      amount: MOCK_CONFIRMED_AMOUNT,
      paymentKey: MOCK_OK_PAYMENT_KEY,
    });
    const txn = createProjectTransactionMock();
    await completeProjectTransactionIfSettled(
      txn,
      "prj_in_progress",
      {
        contractId: "ctr_notify",
        requestId: "req_notify_complete",
        idempotencyKey: "transaction-complete-notify",
        occurredAt: "2026-08-25T06:00:00Z",
        expectedProjectVersion: 8,
      },
      "APPROVED",
      "RELEASED",
      { notifications, freelancerId: "usr_freelancer_b" },
    );
    const published = notifications.getPublished();
    const types = published.map((event) => event.type);
    if (
      paid.status === "PAID" &&
      types.includes("PAYMENT_COMPLETED") &&
      types.includes("REVIEW_REQUESTED") &&
      !types.includes("DELIVERY_REQUESTED") &&
      !types.includes("DELIVERY_APPROVED")
    ) {
      pass("규칙 7: PAID·COMPLETED 직후 publish (납품 미호출)");
    } else {
      fail("규칙 7: PAID·COMPLETED 직후 publish (납품 미호출)", { paid, published });
    }
  }

  // 규칙 7 — 포트 throw여도 PAID·COMPLETED를 되돌리지 않는다.
  {
    const notifications = createNotificationTriggerMock({ throwOnPublish: true });
    const records = createPaymentRecordMock(createPaymentGatewayMock(), { notifications });
    const prepared = records.preparePayment(MOCK_CONFIRMED_AMOUNT);
    const paid = await records.confirmPayment({
      orderId: prepared.orderId,
      amount: MOCK_CONFIRMED_AMOUNT,
      paymentKey: MOCK_OK_PAYMENT_KEY,
    });
    const row = records.getPayment(prepared.paymentId);
    const txn = createProjectTransactionMock();
    const completed = await completeProjectTransactionIfSettled(
      txn,
      "prj_in_progress",
      {
        contractId: "ctr_notify_throw",
        requestId: "req_notify_throw",
        idempotencyKey: "transaction-complete-throw",
        occurredAt: "2026-08-25T06:00:00Z",
        expectedProjectVersion: 8,
      },
      "APPROVED",
      "RELEASED",
      { notifications, freelancerId: "usr_freelancer_b" },
    );
    const ctx = await txn.getProjectNegotiationContext("prj_in_progress");
    if (
      paid.status === "PAID" &&
      row.status === "PAID" &&
      completed.transactionStatus === "COMPLETED" &&
      ctx.transactionStatus === "COMPLETED"
    ) {
      pass("규칙 7: 알림 throw여도 PAID·COMPLETED 유지");
    } else {
      fail("규칙 7: 알림 throw여도 PAID·COMPLETED 유지", { paid, row, completed, ctx });
    }
  }

  // 규칙 8 — 오류 코드 5종만
  {
    const mock = createProjectTransactionMock();
    const MOCK_AT = "2026-08-25T05:00:00Z";
    const samples: Array<[string, () => Promise<unknown>]> = [
      ["not-found", () => mock.getProjectNegotiationContext("prj_missing")],
      [
        "conflict",
        () =>
          mock.startProjectTransaction("prj_canceled", {
            contractId: "ctr_c",
            requestId: "r",
            idempotencyKey: "k-conflict",
            occurredAt: MOCK_AT,
            expectedProjectVersion: 7,
          }),
      ],
      [
        "version",
        () =>
          mock.startProjectTransaction("prj_alive", {
            contractId: "ctr_v",
            requestId: "r",
            idempotencyKey: "k-version",
            occurredAt: MOCK_AT,
            expectedProjectVersion: 0,
          }),
      ],
      [
        "already-restored",
        async () => {
          await mock.restorePreContractProject("prj_alive", {
            negotiationId: "ngt_a",
            actorUserId: "usr_a",
            reason: "FREELANCER_REJECTED",
            requestId: "r1",
            idempotencyKey: "neg-a",
            occurredAt: MOCK_AT,
          });
          return mock.restorePreContractProject("prj_alive", {
            negotiationId: "ngt_b",
            actorUserId: "usr_a",
            reason: "CLIENT_REJECTED",
            requestId: "r2",
            idempotencyKey: "neg-b",
            occurredAt: MOCK_AT,
          });
        },
      ],
      [
        "validation",
        () =>
          mock.markPaymentPending("prj_seq", {
            contractId: "",
            requestId: "r",
            idempotencyKey: "k-val",
            occurredAt: MOCK_AT,
          }),
      ],
    ];
    let allAllowed = true;
    for (const [, run] of samples) {
      try {
        await run();
        allAllowed = false;
      } catch (err) {
        if (
          !(err instanceof DomainContractError) ||
          !ALLOWED_CODES.includes(err.body.error.code) ||
          Object.keys(err.body.error).sort().join() !== "code,details,message"
        ) {
          allAllowed = false;
          fail("규칙 8: 봉투 형식", err);
        }
      }
    }
    if (allAllowed) pass("규칙 8: 오류 코드 5종·봉투만 사용");
  }

  // 규칙 9 — PaymentGateway Mock (키 불필요)
  {
    const gateway = createPaymentGatewayMock();
    const paid = await gateway.confirmPayment({
      orderId: "ord_mock_01",
      amount: MOCK_CONFIRMED_AMOUNT,
      paymentKey: MOCK_OK_PAYMENT_KEY,
    });
    if (paid.status === "PAID" && paid.amount === MOCK_CONFIRMED_AMOUNT) {
      pass("규칙 9: Mock 결제 승인 성공");
    } else {
      fail("규칙 9: Mock 결제 승인 성공", paid);
    }
    try {
      await gateway.confirmPayment({
        orderId: "ord_mock_01",
        amount: 1,
        paymentKey: MOCK_OK_PAYMENT_KEY,
      });
      fail("규칙 9: Mock 금액 불일치 거부", "오류가 나지 않았습니다");
    } catch (err) {
      if (err instanceof PaymentGatewayError && err.code === "PAYMENT_AMOUNT_MISMATCH") {
        pass("규칙 9: Mock 금액 불일치 거부");
      } else {
        fail("규칙 9: Mock 금액 불일치 거부", err);
      }
    }
  }

  // 규칙 19·21 — 결제 행 PENDING 복구·FAILED 재시도 (I-17)
  {
    const records = createPaymentRecordMock();
    const prepared = records.preparePayment(MOCK_CONFIRMED_AMOUNT);
    try {
      await records.confirmPayment({
        orderId: prepared.orderId,
        amount: MOCK_CONFIRMED_AMOUNT,
        paymentKey: MOCK_FAIL_PAYMENT_KEY,
      });
      fail("규칙 19: PG 실패 키면 PENDING", "오류가 나지 않았습니다");
    } catch (err) {
      const row = records.getPayment(prepared.paymentId);
      if (
        err instanceof PaymentGatewayError &&
        err.code === "PAYMENT_CONFIRM_FAILED" &&
        row.status === "PENDING" &&
        row.orderId === prepared.orderId
      ) {
        pass("규칙 19: PG 실패 키면 PENDING");
      } else {
        fail("규칙 19: PG 실패 키면 PENDING", { err, row });
      }
    }
    const reconciled = await records.reconcilePendingPayments();
    if (reconciled?.status === "FAILED" && reconciled.orderId === prepared.orderId) {
      pass("규칙 19: reconcile 후 FAILED");
    } else {
      fail("규칙 19: reconcile 후 FAILED", reconciled);
    }
    const oldOrderId = prepared.orderId;
    const retried = records.retryPayment(prepared.paymentId);
    if (
      retried.paymentId === prepared.paymentId &&
      retried.orderId !== oldOrderId &&
      retried.status === "READY"
    ) {
      pass("규칙 21: FAILED 재시도 같은 paymentId 새 orderId READY");
    } else {
      fail("규칙 21: FAILED 재시도 같은 paymentId 새 orderId READY", retried);
    }
    await expectCode("규칙 21: 옛 orderId confirm 409", "PROJECT_TRANSITION_CONFLICT", () =>
      records.confirmPayment({
        orderId: oldOrderId,
        amount: MOCK_CONFIRMED_AMOUNT,
        paymentKey: MOCK_OK_PAYMENT_KEY,
      }),
    );
    const paid = await records.confirmPayment({
      orderId: retried.orderId,
      amount: MOCK_CONFIRMED_AMOUNT,
      paymentKey: MOCK_OK_PAYMENT_KEY,
    });
    const row = records.getPayment(prepared.paymentId);
    if (paid.status === "PAID" && row.status === "PAID" && row.orderId === retried.orderId) {
      pass("규칙 19: 재시도 후 승인 성공 PAID");
    } else {
      fail("규칙 19: 재시도 후 승인 성공 PAID", { paid, row });
    }
  }

  {
    const records = createPaymentRecordMock();
    const prepared = records.preparePayment(MOCK_CONFIRMED_AMOUNT);
    try {
      await records.confirmPayment({
        orderId: prepared.orderId,
        amount: MOCK_CONFIRMED_AMOUNT,
        paymentKey: MOCK_RECOVER_PAID_KEY,
      });
      fail("PAY-02: timeout 후 PENDING", "오류가 나지 않았습니다");
    } catch (err) {
      const row = records.getPayment(prepared.paymentId);
      if (row.status === "PENDING" && err instanceof PaymentGatewayError) {
        pass("PAY-02: timeout 후 PENDING");
      } else {
        fail("PAY-02: timeout 후 PENDING", { err, row });
      }
    }
    const recovered = await records.reconcilePendingPayments();
    if (recovered?.status === "PAID") pass("PAY-02: retrieve DONE이면 PAID");
    else fail("PAY-02: retrieve DONE이면 PAID", recovered);
  }

  // 규칙 9 — 키 없음이면 어댑터를 만들지 않고 Mock
  await withClearedPgSecretKey(async () => {
    const gateway = assemblePaymentGateway();
    const paid = await gateway.confirmPayment({
      orderId: "ord_no_key_01",
      amount: MOCK_CONFIRMED_AMOUNT,
      paymentKey: MOCK_OK_PAYMENT_KEY,
    });
    if (!hasPgSecretKey() && paid.status === "PAID") {
      pass("규칙 9: 키 없음 → Mock 유지");
    } else {
      fail("규칙 9: 키 없음 → Mock 유지", { hasKey: hasPgSecretKey(), paid });
    }
    try {
      createTossPaymentsAdapter();
      fail("규칙 9: 키 없이 어댑터 생성", "오류가 나지 않았습니다");
    } catch (err) {
      if (isPgKeyMissingError(err) && err.field === "PG_SECRET_KEY") {
        pass("규칙 9: 키 없이 어댑터 생성 → PgKeyMissingError");
      } else {
        fail("규칙 9: 키 없이 어댑터 생성 → PgKeyMissingError", err);
      }
    }
  });

  // 규칙 9 — 키 없음 UX. 프론트는 시크릿을 읽지 않는다.
  {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PaymentPanel } = await import("./web/PaymentPanel");
    const missing = renderToStaticMarkup(React.createElement(PaymentPanel, { view: "keyMissing" }));
    if (
      missing.includes("연동 준비 중") &&
      missing.includes("다시 시도") &&
      !missing.includes("결제하기") &&
      !missing.includes("테스트 결제 진행")
    ) {
      pass("규칙 9: 키 없음 UX 결제하기 숨김");
    } else {
      fail("규칙 9: 키 없음 UX 결제하기 숨김", missing);
    }
  }

    // 규칙 17 — 합의 페이지·서명·결제 패널 필수 요소. 앱 셸 없이 uiState 분기만.
  {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AgreementPanel } = await import("./web/AgreementPanel");
    const { ContractSignPanel } = await import("./web/ContractSignPanel");
    const { PaymentPanel } = await import("./web/PaymentPanel");

    function htmlOf(node: React.ReactElement): string {
      return renderToStaticMarkup(node);
    }
    function hasText(name: string, html: string, text: string): void {
      if (html.includes(text)) pass(name);
      else fail(name, html);
    }

    const create = htmlOf(React.createElement(AgreementPanel, { uiState: "NOT_PROPOSED" }));
    hasText("규칙 17: 합의 필수 금액", create, "금액");
    hasText("규칙 17: 합의 필수 제안하기", create, "제안하기");
    hasText(
      "규칙 17: 합의 입력 오류",
      htmlOf(React.createElement(AgreementPanel, { uiState: "NOT_PROPOSED", amountError: true })),
      "금액을 입력해 주세요.",
    );
    hasText(
      "규칙 17: 합의 로딩",
      htmlOf(React.createElement(AgreementPanel, { view: "loading" })),
      "합의 내용을 불러오는 중입니다.",
    );
    const loadFailed = htmlOf(React.createElement(AgreementPanel, { uiState: "LOAD_FAILED" }));
    hasText("규칙 17: 합의 LOAD_FAILED", loadFailed, "합의 내용을 불러오지 못했습니다");
    hasText("규칙 17: 합의 LOAD_FAILED 재시도", loadFailed, "다시 시도");
    hasText(
      "규칙 17: 합의 409 재조회",
      htmlOf(React.createElement(AgreementPanel, { uiState: "STALE" })),
      "다시 불러오기",
    );
    const canceled = htmlOf(React.createElement(AgreementPanel, { uiState: "PROJECT_CANCELED" }));
    hasText("규칙 17: 합의 취소 안내", canceled, "프로젝트가 취소되었습니다");
    if (!hasMutationCta(canceled)) pass("규칙 17: 합의 취소 후 변경 숨김");
    else fail("규칙 17: 합의 취소 후 변경 숨김", canceled);

    const waiting = htmlOf(React.createElement(AgreementPanel, { uiState: "WAITING_RESPONSE" }));
    hasText("규칙 17: 합의 의뢰인 대기", waiting, "상대의 수락·거절 또는 재제안");
    hasText("규칙 17: 합의 최초 제안 이력", waiting, "최초 제안");
    if (!hasMutationCta(waiting) && !hasEditCta(waiting)) {
      pass("규칙 17: 의뢰인 대기 시 수정 없음");
    } else {
      fail("규칙 17: 의뢰인 대기 시 수정 없음", waiting);
    }
    if (!waiting.includes("아직 작성")) pass("규칙 17: 대기 화면에 상대 제출 추정 없음");
    else fail("규칙 17: 대기 화면에 상대 제출 추정 없음", waiting);
    if (!waiting.includes("이후 제안으로 대체됨") && !waiting.includes("SUPERSEDED")) {
      pass("규칙 17: 라운드 1 이력에 대체됨 없음");
    } else {
      fail("규칙 17: 라운드 1 이력에 대체됨 없음", waiting);
    }

    const respond = htmlOf(React.createElement(AgreementPanel, { uiState: "ACTION_REQUIRED" }));
    hasText("규칙 17: 합의 수락하기", respond, "수락하기");
    hasText("규칙 17: 합의 거절하기", respond, "거절하기");
    hasText("규칙 17: 합의 재제안", respond, "재제안");
    hasText("규칙 17: 합의 수락 확인", respond, "합의를 수락할까요?");
    hasText("규칙 17: 합의 거절 확인", respond, "거절 확인");
    hasText("규칙 17: 거절 시 모집 복구 안내", respond, "마감 전이면 모집이 다시 열릴 수 있습니다");
    if (!respond.includes("아직 작성") && !respond.includes("NEGOTIATING") && !respond.includes("/agreements/")) {
      pass("규칙 17: 수신자 화면에 추정 문구·설계서 경로 없음");
    } else {
      fail("규칙 17: 수신자 화면에 추정 문구·설계서 경로 없음", respond);
    }

    const clientAction = htmlOf(
      React.createElement(AgreementPanel, {
        uiState: "ACTION_REQUIRED",
        viewerRole: "CLIENT",
        offerRound: 2,
      }),
    );
    hasText("규칙 17: 라운드 2 의뢰인 재제안", clientAction, "재제안");
    hasText("규칙 17: 라운드 2 이력", clientAction, "1회 수정");
    if (hasMutationCta(clientAction)) pass("규칙 17: 라운드 2 의뢰인 수신자 CTA");
    else fail("규칙 17: 라운드 2 의뢰인 수신자 CTA", clientAction);

    const freelancerWait = htmlOf(
      React.createElement(AgreementPanel, {
        uiState: "WAITING_RESPONSE",
        viewerRole: "FREELANCER",
        offerRound: 2,
      }),
    );
    if (!hasMutationCta(freelancerWait)) pass("규칙 17: 라운드 2 작성자 대기 CTA 숨김");
    else fail("규칙 17: 라운드 2 작성자 대기 CTA 숨김", freelancerWait);
    hasText("규칙 17: 과거 이력 대체됨", freelancerWait, "이후 제안으로 대체됨");
    if (!freelancerWait.includes("SUPERSEDED") && !freelancerWait.includes("NEGOTIATING")) {
      pass("규칙 17: 이력에 SUPERSEDED 저장 표시 없음");
    } else {
      fail("규칙 17: 이력에 SUPERSEDED 저장 표시 없음", freelancerWait);
    }

    const historyPreview = htmlOf(
      React.createElement(AgreementPanel, {
        uiState: "WAITING_RESPONSE",
        viewerRole: "FREELANCER",
        offerRound: 2,
      }),
    );
    hasText("규칙 17: agr-history 대체됨", historyPreview, "이후 제안으로 대체됨");

    const agreed = htmlOf(React.createElement(AgreementPanel, { uiState: "AGREED" }));
    hasText("규칙 17: 합의 계약서 확인", agreed, "계약서 확인");
    if (!hasMutationCta(agreed)) pass("규칙 17: 합의 완료 후 변경 숨김");
    else fail("규칙 17: 합의 완료 후 변경 숨김", agreed);

    const reopened = htmlOf(React.createElement(AgreementPanel, { uiState: "REJECTED_REOPENED" }));
    hasText("규칙 17: 거절 재개 프로젝트 확인", reopened, "프로젝트 확인");
    hasText("규칙 17: 거절 재개 프로젝트 수정", reopened, "프로젝트 수정");
    if (!hasMutationCta(reopened)) pass("규칙 17: 거절 재개 후 변경 숨김");
    else fail("규칙 17: 거절 재개 후 변경 숨김", reopened);

    const closed = htmlOf(React.createElement(AgreementPanel, { uiState: "REJECTED_CLOSED" }));
    hasText("규칙 17: 거절 종료 프로젝트 확인", closed, "프로젝트 확인");
    if (!hasEditCta(closed) && !hasMutationCta(closed)) {
      pass("규칙 17: 거절 종료 후 수정·변경 숨김");
    } else {
      fail("규칙 17: 거절 종료 후 수정·변경 숨김", closed);
    }

    const forbidden = htmlOf(React.createElement(AgreementPanel, { uiState: "FORBIDDEN" }));
    hasText("규칙 17: 합의 403", forbidden, "이 합의를 볼 수 있는 권한이 없습니다");
    if (!forbidden.includes("money") && !hasMutationCta(forbidden)) {
      pass("규칙 17: 합의 403 민감 정보 없음");
    } else {
      fail("규칙 17: 합의 403 민감 정보 없음", forbidden);
    }

    const notFound = htmlOf(React.createElement(AgreementPanel, { uiState: "NOT_FOUND" }));
    hasText("규칙 17: 합의 404", notFound, "합의를 찾을 수 없습니다");
    if (!notFound.includes("money") && !hasMutationCta(notFound)) {
      pass("규칙 17: 합의 404 민감 정보 없음");
    } else {
      fail("규칙 17: 합의 404 민감 정보 없음", notFound);
    }

    const sign = htmlOf(React.createElement(ContractSignPanel));
    hasText("규칙 17: 서명 프로젝트 제목", sign, "프로젝트 제목");
    hasText("규칙 17: 서명 합의 금액", sign, "합의 금액");
    hasText("규칙 17: 서명하기", sign, "서명하기");
    const signFailed = htmlOf(React.createElement(ContractSignPanel, { view: "loadFailed" }));
    hasText("규칙 17: 서명 LOAD_FAILED", signFailed, "불러오지 못했습니다");
    hasText("규칙 17: 서명 LOAD_FAILED 재시도", signFailed, "다시 시도");
    const signCanceled = htmlOf(React.createElement(ContractSignPanel, { view: "canceled" }));
    hasText("규칙 17: 서명 취소 안내", signCanceled, "프로젝트가 취소되었습니다");
    hasText("규칙 17: 서명 기록 보존", signCanceled, "기존 서명 기록은 보존됩니다");
    if (!signCanceled.includes("서명하기")) {
      pass("규칙 17: 서명 취소 후 서명하기 숨김");
    } else {
      fail("규칙 17: 서명 취소 후 서명하기 숨김", signCanceled);
    }
    hasText(
      "규칙 17: 서명 M01 제목",
      htmlOf(React.createElement(ContractSignPanel, { uiState: "READY_TO_SIGN" })),
      "계약 내용에 동의하고 서명할까요?",
    );
    const signPay = htmlOf(React.createElement(ContractSignPanel, { uiState: "SIGNED_PAYMENT_REQUIRED" }));
    hasText("규칙 17: 서명 결제하기", signPay, "결제하기");
    if (!signPay.includes('class="btn primary">서명하기')) {
      pass("규칙 17: 체결 후 서명하기 숨김");
    } else {
      fail("규칙 17: 체결 후 서명하기 숨김", signPay);
    }
    hasText(
      "규칙 17: 서명 M02 제목",
      htmlOf(React.createElement(ContractSignPanel, { uiState: "SIGNED_PAYMENT_REQUIRED", initialModal: "signed" })),
      "양측 서명이 완료되었습니다",
    );
    const signProgress = htmlOf(React.createElement(ContractSignPanel, { uiState: "IN_PROGRESS" }));
    if (!signProgress.includes("서명하기")) pass("규칙 17: 작업 중 서명하기 숨김");
    else fail("규칙 17: 작업 중 서명하기 숨김", signProgress);
    const signForbidden = htmlOf(React.createElement(ContractSignPanel, { uiState: "FORBIDDEN" }));
    if (!signForbidden.includes("money") && !signForbidden.includes("서명하기")) {
      pass("규칙 17: 서명 403 민감 정보 없음");
    } else {
      fail("규칙 17: 서명 403 민감 정보 없음", signForbidden);
    }
    hasText("규칙 17: 서명 공증 아님", sign, "공증이나 공인전자서명");
    const signWait = htmlOf(React.createElement(ContractSignPanel, { uiState: "WAITING_COUNTERPART" }));
    hasText("규칙 17: 서명 상대 대기", signWait, "상대방의 서명");
    hasText("규칙 17: 서명 내 서명 완료", signWait, "내 서명은 완료되었습니다");
    if (
      !signWait.includes("서명하기") &&
      !signWait.includes("CONTRACT_FORBIDDEN") &&
      !signWait.includes("CONTRACT_CANCELED")
    ) {
      pass("규칙 17: 상대 대기 서명하기·CONTRACT_* 없음");
    } else {
      fail("규칙 17: 상대 대기 서명하기·CONTRACT_* 없음", signWait);
    }

    const checkout = htmlOf(React.createElement(PaymentPanel));
    hasText("규칙 17: 결제 금액", checkout, "결제 금액");
    hasText("규칙 17: 결제 플랫폼 수수료", checkout, "플랫폼 수수료");
    hasText("규칙 17: 결제 정산액", checkout, "정산액");
    hasText("규칙 17: 테스트 결제 진행", checkout, "테스트 결제 진행");
    hasText("규칙 17: 결제 보관 안내", checkout, "결제해도 바로 넘어가지 않습니다");
    hasText("규칙 17: 결제 Sandbox 배지", checkout, "Sandbox 테스트 결제");
    hasText("규칙 17: 결제 M01 제목", checkout, "Sandbox 테스트 결제를 진행할까요?");
    const payFailed = htmlOf(React.createElement(PaymentPanel, { view: "failed" }));
    hasText("규칙 17: 결제 실패", payFailed, "결제 실패");
    hasText("규칙 17: 결제 다시 결제", payFailed, "다시 결제");
    if (!checkout.includes("에스크로") && !checkout.includes("지급 완료")) {
      pass("규칙 17: 결제 에스크로 문구 없음");
    } else {
      fail("규칙 17: 결제 에스크로 문구 없음", checkout);
    }
    const payPaid = htmlOf(React.createElement(PaymentPanel, { view: "paid" }));
    if (
      payPaid.includes("Sandbox 결제가 완료되었습니다") &&
      !payPaid.includes("테스트 결제 진행") &&
      !payPaid.includes("다시 결제")
    ) {
      pass("규칙 17: PAID는 새 결제 없음");
    } else {
      fail("규칙 17: PAID는 새 결제 없음", payPaid);
    }
    const payPending = htmlOf(React.createElement(PaymentPanel, { view: "pending" }));
    if (
      payPending.includes("다시 결제하지 마세요") &&
      !payPending.includes("결제 실패") &&
      !payPending.includes("테스트 결제 진행")
    ) {
      pass("규칙 17: PENDING은 실패가 아님");
    } else {
      fail("규칙 17: PENDING은 실패가 아님", payPending);
    }
    const payUnsigned = htmlOf(React.createElement(PaymentPanel, { uiState: "CONTRACT_NOT_SIGNED" }));
    hasText("규칙 17: 결제 미체결", payUnsigned, "양측 서명이 필요합니다");
    if (!payUnsigned.includes("테스트 결제 진행") && !payUnsigned.includes("PAYMENT_FORBIDDEN")) {
      pass("규칙 17: 미체결 결제 CTA·PAYMENT_FORBIDDEN 없음");
    } else {
      fail("규칙 17: 미체결 결제 CTA·PAYMENT_FORBIDDEN 없음", payUnsigned);
    }
    const paySyncing = htmlOf(React.createElement(PaymentPanel, { uiState: "PAID_SYNCING" }));
    hasText("규칙 17: 결제 동기화", paySyncing, "새 결제는 만들지 않습니다");
    if (!paySyncing.includes("테스트 결제 진행") && !paySyncing.includes("PAYMENT_FORBIDDEN")) {
      pass("규칙 17: 동기화 결제 CTA·PAYMENT_FORBIDDEN 없음");
    } else {
      fail("규칙 17: 동기화 결제 CTA·PAYMENT_FORBIDDEN 없음", paySyncing);
    }
    const payFreelancer = htmlOf(
      React.createElement(PaymentPanel, { uiState: "PAYMENT_AVAILABLE", viewerRole: "FREELANCER" }),
    );
    if (payFreelancer.includes("결제 대기") && !payFreelancer.includes("테스트 결제 진행")) {
      pass("규칙 17: 프리랜서 결제 액션 없음");
    } else {
      fail("규칙 17: 프리랜서 결제 액션 없음", payFreelancer);
    }

    const allHtml = [
      create,
      canceled,
      waiting,
      respond,
      clientAction,
      freelancerWait,
      agreed,
      reopened,
      closed,
      forbidden,
      notFound,
      sign,
      signFailed,
      signCanceled,
      checkout,
      payFailed,
    ].join("\n");
    if (!/#[0-9A-Fa-f]{6}/.test(allHtml)) {
      pass("규칙 17: 화면에 원시 색상값 없음");
    } else {
      fail("규칙 17: 화면에 원시 색상값 없음", allHtml);
    }
  }

  // 규칙 10·17 — 합의 uiState 산정. 서버 DTO를 화면이 직접 쓰지 않는다.
  {
    if (historyLabelForRound(1) === "최초 제안") pass("규칙 10: 이력 라벨 최초 제안");
    else fail("규칙 10: 이력 라벨 최초 제안", historyLabelForRound(1));

    const loadFirst = deriveAgreementUiState({
      loadError: "FORBIDDEN",
      transactionStatus: "CANCELED",
      canceledAt: "2026-09-01T00:00:00Z",
      agreementStatus: "ACCEPTED",
      hasOffer: true,
      viewerRole: "FREELANCER",
      reopened: true,
    });
    if (loadFirst === "FORBIDDEN") pass("규칙 17: 상태 산정 403 우선");
    else fail("규칙 17: 상태 산정 403 우선", loadFirst);

    const cancelOverAccept = deriveAgreementUiState({
      transactionStatus: "CANCELED",
      agreementStatus: "ACCEPTED",
      hasOffer: true,
      viewerRole: "FREELANCER",
    });
    if (cancelOverAccept === "PROJECT_CANCELED") pass("규칙 17: 상태 산정 취소 우선");
    else fail("규칙 17: 상태 산정 취소 우선", cancelOverAccept);

    const cancelByAt = deriveAgreementUiState({
      canceledAt: "2026-09-01T00:00:00Z",
      agreementStatus: "PROPOSED",
      hasOffer: true,
      viewerRole: "CLIENT",
    });
    if (cancelByAt === "PROJECT_CANCELED") pass("규칙 17: 상태 산정 canceledAt 우선");
    else fail("규칙 17: 상태 산정 canceledAt 우선", cancelByAt);

    const agreed = deriveAgreementUiState({
      agreementStatus: "ACCEPTED",
      hasOffer: true,
      viewerRole: "CLIENT",
    });
    if (agreed === "AGREED") pass("규칙 10: 수락 화면 AGREED");
    else fail("규칙 10: 수락 화면 AGREED", agreed);

    const reopened = deriveAgreementUiState({
      agreementStatus: "REJECTED",
      hasOffer: true,
      viewerRole: "CLIENT",
      reopened: true,
    });
    if (reopened === "REJECTED_REOPENED") pass("규칙 17: 거절 재개 산정");
    else fail("규칙 17: 거절 재개 산정", reopened);

    const closed = deriveAgreementUiState({
      agreementStatus: "REJECTED",
      hasOffer: true,
      viewerRole: "CLIENT",
      reopened: false,
    });
    if (closed === "REJECTED_CLOSED") pass("규칙 17: 거절 종료 산정");
    else fail("규칙 17: 거절 종료 산정", closed);

    const empty = deriveAgreementUiState({
      agreementStatus: null,
      hasOffer: false,
      viewerRole: "CLIENT",
    });
    if (empty === "NOT_PROPOSED") pass("규칙 10: 제안 전 NOT_PROPOSED");
    else fail("규칙 10: 제안 전 NOT_PROPOSED", empty);

    const freelancer = deriveAgreementUiState({
      agreementStatus: "PROPOSED",
      hasOffer: true,
      viewerRole: "FREELANCER",
    });
    if (freelancer === "ACTION_REQUIRED") pass("규칙 10: 프리랜서 ACTION_REQUIRED");
    else fail("규칙 10: 프리랜서 ACTION_REQUIRED", freelancer);

    const clientWait = deriveAgreementUiState({
      agreementStatus: "PROPOSED",
      hasOffer: true,
      viewerRole: "CLIENT",
    });
    if (clientWait === "WAITING_RESPONSE") pass("규칙 10: 의뢰인 WAITING_RESPONSE");
    else fail("규칙 10: 의뢰인 WAITING_RESPONSE", clientWait);

    const agreedVm = toAgreementViewModel(
      sampleOfferDto({ agreementStatus: "ACCEPTED", contractId: "ctr_1", contractStatus: "DRAFT" }),
      CLIENT_SESSION,
    );
    if (
      agreedVm.uiState === "AGREED" &&
      !agreedVm.permissions.canPropose &&
      !agreedVm.permissions.canAccept &&
      !agreedVm.permissions.canReject
    ) {
      pass("규칙 17: 종료 상태 변경 권한 없음");
    } else {
      fail("규칙 17: 종료 상태 변경 권한 없음", agreedVm.permissions);
    }

    const waitingVm = toAgreementViewModel(sampleOfferDto(), CLIENT_SESSION);
    if (
      waitingVm.uiState === "WAITING_RESPONSE" &&
      !waitingVm.permissions.canPropose &&
      !waitingVm.permissions.canAccept &&
      !waitingVm.permissions.canReject &&
      !waitingVm.permissions.canCounter
    ) {
      pass("규칙 17: 의뢰인 대기 변경 권한 없음");
    } else {
      fail("규칙 17: 의뢰인 대기 변경 권한 없음", waitingVm);
    }

    const actionVm = toAgreementViewModel(sampleOfferDto(), FREELANCER_SESSION);
    if (
      actionVm.uiState === "ACTION_REQUIRED" &&
      actionVm.permissions.canAccept &&
      actionVm.permissions.canReject &&
      actionVm.permissions.canCounter
    ) {
      pass("규칙 10: 프리랜서 수락·거절 권한");
    } else {
      fail("규칙 10: 프리랜서 수락·거절 권한", actionVm);
    }

    const round2Offer = {
      offerId: "off_2",
      round: 2,
      amount: 120_000,
      currency: "KRW" as const,
      offeredByUserId: MOCK_FREELANCER_USER_ID,
    };
    const round2Dto = sampleOfferDto({
      offer: round2Offer,
      offers: [
        {
          offerId: "off_1",
          round: 1,
          amount: MOCK_OFFER_AMOUNT,
          currency: "KRW",
          offeredByUserId: MOCK_CLIENT_USER_ID,
        },
        round2Offer,
      ],
    });
    const clientActionVm = toAgreementViewModel(round2Dto, CLIENT_SESSION);
    if (
      clientActionVm.uiState === "ACTION_REQUIRED" &&
      clientActionVm.permissions.canCounter &&
      clientActionVm.history.length === 2 &&
      clientActionVm.history[0]?.label === "최초 제안" &&
      clientActionVm.history[0]?.superseded === true &&
      clientActionVm.history[1]?.superseded === false
    ) {
      pass("규칙 10: 라운드 2 의뢰인 ACTION_REQUIRED");
    } else {
      fail("규칙 10: 라운드 2 의뢰인 ACTION_REQUIRED", clientActionVm);
    }
    const freelancerWaitVm = toAgreementViewModel(round2Dto, FREELANCER_SESSION);
    if (
      freelancerWaitVm.uiState === "WAITING_RESPONSE" &&
      !freelancerWaitVm.permissions.canCounter &&
      !freelancerWaitVm.permissions.canAccept
    ) {
      pass("규칙 10: 라운드 2 프리랜서 WAITING_RESPONSE");
    } else {
      fail("규칙 10: 라운드 2 프리랜서 WAITING_RESPONSE", freelancerWaitVm);
    }

    const forbiddenVm = toAgreementViewModel(sampleOfferDto(), CLIENT_SESSION, "FORBIDDEN");
    if (forbiddenVm.uiState === "FORBIDDEN" && forbiddenVm.currentOffer === null && forbiddenVm.history.length === 0) {
      pass("규칙 17: 403 ViewModel 민감 정보 없음");
    } else {
      fail("규칙 17: 403 ViewModel 민감 정보 없음", forbiddenVm);
    }
  }

  // sandbox 실호출 — 시크릿이 없으면 해당 없음
  if (!hasPgSecretKey()) {
    pass("규칙 9: PG sandbox 실호출 해당 없음 (PG_SECRET_KEY 없음)");
  } else {
    try {
      const adapter = createTossPaymentsAdapter();
      await adapter.confirmPayment({
        orderId: "ord_sandbox_probe",
        amount: 100,
        paymentKey: "pay_invalid_probe",
      });
      fail("규칙 9: sandbox 잘못된 키는 4xx", "승인이 성공했습니다");
    } catch (err) {
      if (err instanceof PaymentGatewayError && err.code === "PAYMENT_CONFIRM_FAILED") {
        pass("규칙 9: sandbox 잘못된 키는 승인 실패");
      } else {
        fail("규칙 9: sandbox 잘못된 키는 승인 실패", err);
      }
    }
    try {
      const adapter = createTossPaymentsAdapter();
      await adapter.retrievePayment("ord_sandbox_missing");
      fail("규칙 9: sandbox retrieve 실패", "조회가 성공했습니다");
    } catch (err) {
      if (err instanceof PaymentGatewayError && err.code === "PAYMENT_CONFIRM_FAILED") {
        pass("규칙 9: sandbox retrieve 실패");
      } else {
        fail("규칙 9: sandbox retrieve 실패", err);
      }
    }
  }

  // 규칙 10·16·22 — 빈 생성·의뢰인 제안·현재 조회
  {
    const api = createPublicApiMock();
    const empty = await api.getCurrentNegotiationOffer("prj_alive", MOCK_CLIENT_USER_ID);
    if (empty.offer === null && empty.agreementId === null && empty.contractId === null) {
      pass("규칙 22: 빈 생성");
    } else {
      fail("규칙 22: 빈 생성", empty);
    }
    const proposed = await api.proposeNegotiationOffer("prj_alive", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    if (
      proposed.agreementStatus === "PROPOSED" &&
      proposed.offer?.round === 1 &&
      proposed.offer.amount === MOCK_OFFER_AMOUNT
    ) {
      pass("규칙 10: 의뢰인 제안");
    } else {
      fail("규칙 10: 의뢰인 제안", proposed);
    }
    const current = await api.getCurrentNegotiationOffer("prj_alive", MOCK_FREELANCER_USER_ID);
    if (current.offer?.offerId === proposed.offer?.offerId && current.agreementId === proposed.agreementId) {
      pass("규칙 16: 현재 조회");
    } else {
      fail("규칙 16: 현재 조회", current);
    }
  }

  // 규칙 11·20 — 수락→DRAFT·멱등·계약 필드
  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_seq", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const offerId = proposed.offer?.offerId ?? "";
    const accepted = await api.acceptNegotiationOffer("prj_seq", offerId, MOCK_FREELANCER_USER_ID, {
      expectedRound: 1,
    });
    if (accepted.agreementStatus === "ACCEPTED" && accepted.contractStatus === "DRAFT" && accepted.contractId) {
      pass("규칙 11: 수락→DRAFT");
    } else {
      fail("규칙 11: 수락→DRAFT", accepted);
    }
    const again = await api.acceptNegotiationOffer("prj_seq", offerId, MOCK_FREELANCER_USER_ID, {
      expectedRound: 1,
    });
    if (again.contractId === accepted.contractId && again.contractStatus === "DRAFT") {
      pass("규칙 22: 수락 멱등");
    } else {
      fail("규칙 22: 수락 멱등", again);
    }
    const contract = await api.getContract(accepted.contractId ?? "", MOCK_CLIENT_USER_ID);
    if (
      contract.termsSnapshot.schemaVersion === 1 &&
      contract.termsSnapshot.amount === MOCK_OFFER_AMOUNT &&
      contract.termsSnapshot.projectTitle === MOCK_PROJECT_TITLE &&
      contract.status === "DRAFT"
    ) {
      pass("규칙 20: 수락 시 계약 필드");
    } else {
      fail("규칙 20: 수락 시 계약 필드", contract);
    }
  }

  // 규칙 22 — 거절→restore·거절 멱등
  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_restore", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const offerId = proposed.offer?.offerId ?? "";
    const rejected = await api.rejectNegotiationOffer(
      "prj_restore",
      offerId,
      MOCK_FREELANCER_USER_ID,
      { reasonCode: "PRICE_NOT_ACCEPTABLE" },
    );
    const ctx = await api.projects.getProjectNegotiationContext("prj_restore");
    if (rejected.agreementStatus === "REJECTED" && ctx.transactionStatus === "NONE") {
      pass("규칙 22: 거절→restore");
    } else {
      fail("규칙 22: 거절→restore", { rejected, ctx });
    }
    const again = await api.rejectNegotiationOffer(
      "prj_restore",
      offerId,
      MOCK_FREELANCER_USER_ID,
      { reasonCode: "PRICE_NOT_ACCEPTABLE" },
    );
    if (again.agreementStatus === "REJECTED" && again.agreementId === rejected.agreementId) {
      pass("규칙 22: 거절 멱등");
    } else {
      fail("규칙 22: 거절 멱등", again);
    }
  }

  // 규칙 22 — 비당사자 403
  {
    const api = createPublicApiMock();
    try {
      await api.getCurrentNegotiationOffer("prj_alive", MOCK_OUTSIDER_USER_ID);
      fail("규칙 22: 비당사자 403", "오류가 나지 않았습니다");
    } catch (err) {
      if (isPublicApiError(err) && err.body.error.code === "PROJECT_FORBIDDEN" && err.httpStatus === 403) {
        pass("규칙 22: 비당사자 403");
      } else {
        fail("규칙 22: 비당사자 403", err);
      }
    }
  }

  // AGR-02 — 재제안 Mock. 수신자만 counter/accept/reject. /agreements 경로·신설 오류 코드 없음.
  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_alive", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const offerId = proposed.offer?.offerId ?? "";
    const currentJson = JSON.stringify(proposed);
    if (!currentJson.includes("/agreements/") && !currentJson.includes("AGREEMENT_FORBIDDEN")) {
      pass("AGR-02: GET current에 /agreements 경로·AGREEMENT_FORBIDDEN 없음");
    } else {
      fail("AGR-02: GET current에 /agreements 경로·AGREEMENT_FORBIDDEN 없음", proposed);
    }

    const before = await api.projects.getProjectNegotiationContext("prj_alive");
    const restoreCalls: string[] = [];
    const origRestore = api.projects.restorePreContractProject.bind(api.projects);
    api.projects.restorePreContractProject = async (projectId, input) => {
      restoreCalls.push(input.reason);
      return origRestore(projectId, input);
    };
    const countered = await api.counterNegotiationOffer("prj_alive", offerId, MOCK_FREELANCER_USER_ID, {
      amount: 120_000,
      currency: "KRW",
      expectedRound: 1,
    });
    const after = await api.projects.getProjectNegotiationContext("prj_alive");
    if (
      countered.agreementStatus === "PROPOSED" &&
      countered.offer?.round === 2 &&
      countered.offer.amount === 120_000 &&
      countered.offers.length === 2 &&
      after.projectVersion === before.projectVersion &&
      restoreCalls.length === 0
    ) {
      pass("AGR-02: 프리랜서 재제안 round 2 · version 불변 · restore 없음");
    } else {
      fail("AGR-02: 프리랜서 재제안 round 2 · version 불변 · restore 없음", {
        countered,
        before: before.projectVersion,
        after: after.projectVersion,
        restoreCalls,
      });
    }

    try {
      await api.counterNegotiationOffer("prj_alive", countered.offer?.offerId ?? "", MOCK_FREELANCER_USER_ID, {
        amount: 130_000,
        currency: "KRW",
        expectedRound: 2,
      });
      fail("AGR-02: 작성자 재제안 403", "오류가 나지 않았습니다");
    } catch (err) {
      if (isPublicApiError(err) && err.body.error.code === "PROJECT_FORBIDDEN") {
        pass("AGR-02: 작성자 재제안 403");
      } else {
        fail("AGR-02: 작성자 재제안 403", err);
      }
    }

    const accepted = await api.acceptNegotiationOffer(
      "prj_alive",
      countered.offer?.offerId ?? "",
      MOCK_CLIENT_USER_ID,
      { expectedRound: 2 },
    );
    if (accepted.agreementStatus === "ACCEPTED" && accepted.contractStatus === "DRAFT") {
      pass("AGR-02: 의뢰인 수락→DRAFT");
    } else {
      fail("AGR-02: 의뢰인 수락→DRAFT", accepted);
    }
  }

  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_seq", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    try {
      await api.counterNegotiationOffer("prj_seq", proposed.offer?.offerId ?? "", MOCK_CLIENT_USER_ID, {
        amount: 110_000,
        currency: "KRW",
        expectedRound: 1,
      });
      fail("AGR-02: 최초 작성자 재제안 403", "오류가 나지 않았습니다");
    } catch (err) {
      if (isPublicApiError(err) && err.body.error.code === "PROJECT_FORBIDDEN") {
        pass("AGR-02: 최초 작성자 재제안 403");
      } else {
        fail("AGR-02: 최초 작성자 재제안 403", err);
      }
    }
    try {
      await api.counterNegotiationOffer("prj_seq", proposed.offer?.offerId ?? "", MOCK_FREELANCER_USER_ID, {
        amount: 110_000,
        currency: "KRW",
        expectedRound: 99,
      });
      fail("AGR-02: expectedRound 불일치 409", "오류가 나지 않았습니다");
    } catch (err) {
      const body = JSON.stringify(err);
      if (
        isDomainContractError(err) &&
        err.body.error.code === "PROJECT_TRANSITION_CONFLICT" &&
        !body.includes("OFFER_VERSION_CONFLICT")
      ) {
        pass("AGR-02: expectedRound 불일치 PROJECT_TRANSITION_CONFLICT");
      } else {
        fail("AGR-02: expectedRound 불일치 PROJECT_TRANSITION_CONFLICT", err);
      }
    }
  }

  {
    const api = createPublicApiMock();
    const restoreCalls: string[] = [];
    const origRestore = api.projects.restorePreContractProject.bind(api.projects);
    api.projects.restorePreContractProject = async (projectId, input) => {
      restoreCalls.push(input.reason);
      return origRestore(projectId, input);
    };
    const proposed = await api.proposeNegotiationOffer("prj_restore", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    await api.rejectNegotiationOffer(
      "prj_restore",
      proposed.offer?.offerId ?? "",
      MOCK_FREELANCER_USER_ID,
      { reasonCode: "PRICE_NOT_ACCEPTABLE" },
    );
    if (restoreCalls[0] === "FREELANCER_REJECTED") pass("AGR-02: 프리랜서 거절 FREELANCER_REJECTED");
    else fail("AGR-02: 프리랜서 거절 FREELANCER_REJECTED", restoreCalls);
  }

  {
    const api = createPublicApiMock();
    const restoreCalls: string[] = [];
    const origRestore = api.projects.restorePreContractProject.bind(api.projects);
    api.projects.restorePreContractProject = async (projectId, input) => {
      restoreCalls.push(input.reason);
      return origRestore(projectId, input);
    };
    const proposed = await api.proposeNegotiationOffer("prj_deadline", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const countered = await api.counterNegotiationOffer(
      "prj_deadline",
      proposed.offer?.offerId ?? "",
      MOCK_FREELANCER_USER_ID,
      { amount: 110_000, currency: "KRW", expectedRound: 1 },
    );
    await api.rejectNegotiationOffer(
      "prj_deadline",
      countered.offer?.offerId ?? "",
      MOCK_CLIENT_USER_ID,
      { reasonCode: "PRICE_NOT_ACCEPTABLE" },
    );
    if (restoreCalls[0] === "CLIENT_REJECTED") pass("AGR-02: 의뢰인 거절 CLIENT_REJECTED");
    else fail("AGR-02: 의뢰인 거절 CLIENT_REJECTED", restoreCalls);
  }

  // AGR-03 — 라운드 교대·작성자 수락 거부·과거 offer 409. SUPERSEDED 저장 없음.
  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_alive", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const before = await api.projects.getProjectNegotiationContext("prj_alive");
    const round2 = await api.counterNegotiationOffer(
      "prj_alive",
      proposed.offer?.offerId ?? "",
      MOCK_FREELANCER_USER_ID,
      { amount: 120_000, currency: "KRW", expectedRound: 1 },
    );
    const round3 = await api.counterNegotiationOffer(
      "prj_alive",
      round2.offer?.offerId ?? "",
      MOCK_CLIENT_USER_ID,
      { amount: 130_000, currency: "KRW", expectedRound: 2 },
    );
    const after = await api.projects.getProjectNegotiationContext("prj_alive");
    if (
      round3.agreementStatus === "PROPOSED" &&
      round3.offer?.round === 3 &&
      round3.offer.offeredByUserId === MOCK_CLIENT_USER_ID &&
      round3.offers.length === 3 &&
      after.projectVersion === before.projectVersion
    ) {
      pass("AGR-03: 의뢰인 재제안 round 3 · 수신자 교대 · version 불변");
    } else {
      fail("AGR-03: 의뢰인 재제안 round 3 · 수신자 교대 · version 불변", {
        round3,
        before: before.projectVersion,
        after: after.projectVersion,
      });
    }
  }

  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_seq", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    try {
      await api.acceptNegotiationOffer("prj_seq", proposed.offer?.offerId ?? "", MOCK_CLIENT_USER_ID, {
        expectedRound: 1,
      });
      fail("AGR-03: 작성자 수락 403", "오류가 나지 않았습니다");
    } catch (err) {
      const current = await api.getCurrentNegotiationOffer("prj_seq", MOCK_CLIENT_USER_ID);
      if (
        isPublicApiError(err) &&
        err.body.error.code === "PROJECT_FORBIDDEN" &&
        current.agreementStatus === "PROPOSED"
      ) {
        pass("AGR-03: 작성자 수락 403");
      } else {
        fail("AGR-03: 작성자 수락 403", { err, current });
      }
    }
  }

  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_alive", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const countered = await api.counterNegotiationOffer(
      "prj_alive",
      proposed.offer?.offerId ?? "",
      MOCK_FREELANCER_USER_ID,
      { amount: 120_000, currency: "KRW", expectedRound: 1 },
    );
    try {
      await api.acceptNegotiationOffer("prj_alive", proposed.offer?.offerId ?? "", MOCK_CLIENT_USER_ID, {
        expectedRound: 1,
      });
      fail("AGR-03: 과거 offer 수락 409", "오류가 나지 않았습니다");
    } catch (err) {
      const body = JSON.stringify(err);
      if (
        isDomainContractError(err) &&
        err.body.error.code === "PROJECT_TRANSITION_CONFLICT" &&
        !body.includes("OFFER_VERSION_CONFLICT") &&
        countered.offer?.round === 2
      ) {
        pass("AGR-03: 과거 offer 수락 PROJECT_TRANSITION_CONFLICT");
      } else {
        fail("AGR-03: 과거 offer 수락 PROJECT_TRANSITION_CONFLICT", err);
      }
    }
  }

  // 규칙 16·21 — 공개 GET /payments/:paymentId (웹훅 없음)
  {
    const api = createPublicApiMock();
    const row = await api.getPayment(MOCK_PAYMENT_ID, MOCK_CLIENT_USER_ID);
    if (row.paymentId === MOCK_PAYMENT_ID && row.status === "READY" && row.orderId) {
      pass("규칙 16: GET payment 당사자 200");
    } else {
      fail("규칙 16: GET payment 당사자 200", row);
    }
    try {
      await api.getPayment(MOCK_PAYMENT_ID, MOCK_OUTSIDER_USER_ID);
      fail("규칙 16: GET payment 비당사자 403", "오류가 나지 않았습니다");
    } catch (err) {
      if (isPublicApiError(err) && err.body.error.code === "PROJECT_FORBIDDEN" && err.httpStatus === 403) {
        pass("규칙 16: GET payment 비당사자 403");
      } else {
        fail("규칙 16: GET payment 비당사자 403", err);
      }
    }
    await expectCode("규칙 16: GET payment 없음 404", "PROJECT_NOT_FOUND", () =>
      api.getPayment("pay_missing", MOCK_CLIENT_USER_ID),
    );
    const settlementRow = await api.getSettlement(MOCK_PAYMENT_ID, MOCK_CLIENT_USER_ID);
    if (
      settlementRow.paymentId === MOCK_PAYMENT_ID &&
      settlementRow.environment === "SANDBOX" &&
      settlementRow.provider === "MANUAL_SIMULATION" &&
      settlementRow.platformFeeRateBps === 1000
    ) {
      pass("규칙 16: GET settlement 당사자 200");
    } else {
      fail("규칙 16: GET settlement 당사자 200", settlementRow);
    }
    try {
      await api.getSettlement(MOCK_PAYMENT_ID, MOCK_OUTSIDER_USER_ID);
      fail("규칙 16: GET settlement 비당사자 403", "오류가 나지 않았습니다");
    } catch (err) {
      if (isPublicApiError(err) && err.body.error.code === "PROJECT_FORBIDDEN" && err.httpStatus === 403) {
        pass("규칙 16: GET settlement 비당사자 403");
      } else {
        fail("규칙 16: GET settlement 비당사자 403", err);
      }
    }
    await expectCode("규칙 16: GET settlement 없음 404", "PROJECT_NOT_FOUND", () =>
      api.getSettlement("pay_missing", MOCK_CLIENT_USER_ID),
    );
    const cancellationRow = await api.getCancellation("prj_alive", MOCK_CLIENT_USER_ID);
    if (
      cancellationRow.projectId === "prj_alive" &&
      cancellationRow.postActions === null &&
      cancellationRow.transactionStatus === "CONTRACT_PENDING"
    ) {
      pass("규칙 16: GET cancellation 당사자 200");
    } else {
      fail("규칙 16: GET cancellation 당사자 200", cancellationRow);
    }
    try {
      await api.getCancellation("prj_alive", MOCK_OUTSIDER_USER_ID);
      fail("규칙 16: GET cancellation 비당사자 403", "오류가 나지 않았습니다");
    } catch (err) {
      if (isPublicApiError(err) && err.body.error.code === "PROJECT_FORBIDDEN" && err.httpStatus === 403) {
        pass("규칙 16: GET cancellation 비당사자 403");
      } else {
        fail("규칙 16: GET cancellation 비당사자 403", err);
      }
    }
    await expectCode("규칙 16: GET cancellation 없음 404", "PROJECT_NOT_FOUND", () =>
      api.getCancellation("prj_missing", MOCK_CLIENT_USER_ID),
    );
  }

  // 규칙 16 — 공개 POST /payments · /payments/confirm (파사드)
  {
    const api = createPublicApiMock();
    try {
      await api.preparePayment("prj_alive", MOCK_CLIENT_USER_ID);
      fail("PAY-02: 미서명 prepare 409", "오류가 나지 않았습니다");
    } catch (err) {
      const body = JSON.stringify(err);
      if (
        isDomainContractError(err) &&
        err.body.error.code === "PROJECT_TRANSITION_CONFLICT" &&
        !body.includes("CONTRACT_NOT_SIGNED") &&
        !body.includes("PAYMENT_FORBIDDEN")
      ) {
        pass("PAY-02: 미서명 prepare 409");
      } else {
        fail("PAY-02: 미서명 prepare 409", err);
      }
    }
    try {
      await api.preparePayment("prj_alive", MOCK_FREELANCER_USER_ID);
      fail("PAY-02: 프리랜서 prepare 403", "오류가 나지 않았습니다");
    } catch (err) {
      if (isPublicApiError(err) && err.body.error.code === "PROJECT_FORBIDDEN") {
        pass("PAY-02: 프리랜서 prepare 403");
      } else {
        fail("PAY-02: 프리랜서 prepare 403", err);
      }
    }
    await signBothSides(api, "prj_alive");
    const prepared = await api.preparePayment("prj_alive", MOCK_CLIENT_USER_ID);
    const pendingAt = (await api.projects.getProjectNegotiationContext("prj_alive")).paymentPendingAt;
    if (
      prepared.paymentId === MOCK_PAYMENT_ID &&
      prepared.orderId &&
      prepared.amount === MOCK_CONFIRMED_AMOUNT &&
      prepared.clientKey &&
      pendingAt
    ) {
      pass("규칙 16: POST payments 준비 당사자 200");
    } else {
      fail("규칙 16: POST payments 준비 당사자 200", { prepared, pendingAt });
    }
    const paid = await api.confirmPayment(MOCK_CLIENT_USER_ID, {
      orderId: prepared.orderId,
      amount: prepared.amount,
      paymentKey: MOCK_OK_PAYMENT_KEY,
    });
    const row = await api.getPayment(prepared.paymentId, MOCK_CLIENT_USER_ID);
    const afterPay = await api.projects.getProjectNegotiationContext("prj_alive");
    if (
      paid.status === "PAID" &&
      row.status === "PAID" &&
      row.orderId === prepared.orderId &&
      afterPay.transactionStatus === "IN_PROGRESS"
    ) {
      pass("규칙 16: POST payments/confirm 당사자 PAID");
    } else {
      fail("규칙 16: POST payments/confirm 당사자 PAID", { paid, row, afterPay });
    }
  }

  {
    const api = createPublicApiMock();
    await expectCode("PAY-02: 취소 프로젝트 prepare 409", "PROJECT_TRANSITION_CONFLICT", () =>
      api.preparePayment("prj_canceled", MOCK_CLIENT_USER_ID),
    );
  }

  {
    const api = createPublicApiMock();
    await signBothSides(api, "prj_alive");
    const prepared = await api.preparePayment("prj_alive", MOCK_CLIENT_USER_ID);
    try {
      await api.confirmPayment(MOCK_CLIENT_USER_ID, {
        orderId: prepared.orderId,
        amount: prepared.amount,
        paymentKey: MOCK_FAIL_PAYMENT_KEY,
      });
    } catch {
      // PENDING 유지
    }
    const payload = {
      eventType: "PAYMENT_STATUS_CHANGED",
      paymentKey: MOCK_FAIL_PAYMENT_KEY,
      orderId: prepared.orderId,
      status: "DONE",
      createdAt: MOCK_NOW,
    };
    const first = await api.receivePaymentWebhook(payload);
    const second = await api.receivePaymentWebhook(payload);
    let seventh = second;
    for (let i = 0; i < 5; i += 1) seventh = await api.receivePaymentWebhook(payload);
    const row = await api.getPayment(prepared.paymentId, MOCK_CLIENT_USER_ID);
    if (
      first.alreadyProcessed !== true &&
      seventh.alreadyProcessed === true &&
      row.status === "FAILED"
    ) {
      pass("PAY-02: 웹훅 7회 반영 1회");
    } else {
      fail("PAY-02: 웹훅 7회 반영 1회", { first, seventh, row });
    }
  }

  {
    const api = createPublicApiMock();
    await signBothSides(api, "prj_alive");
    const prepared = await api.preparePayment("prj_alive", MOCK_CLIENT_USER_ID);
    await api.confirmPayment(MOCK_CLIENT_USER_ID, {
      orderId: prepared.orderId,
      amount: prepared.amount,
      paymentKey: MOCK_OK_PAYMENT_KEY,
    });
    const reverse = await api.receivePaymentWebhook({
      eventType: "PAYMENT_STATUS_CHANGED",
      paymentKey: MOCK_OK_PAYMENT_KEY,
      orderId: prepared.orderId,
      status: "ABORTED",
      createdAt: "2026-01-01T00:00:00Z",
    });
    const row = await api.getPayment(prepared.paymentId, MOCK_CLIENT_USER_ID);
    if (row.status === "PAID" && reverse.applied === false) {
      pass("PAY-02: 역순 웹훅 PAID 비회귀");
    } else {
      fail("PAY-02: 역순 웹훅 PAID 비회귀", { reverse, row });
    }
  }

  {
    const api = createPublicApiMock();
    await signBothSides(api, "prj_alive");
    api.tripPaymentCircuit();
    try {
      await api.preparePayment("prj_alive", MOCK_CLIENT_USER_ID);
      fail("PAY-02: 회로 Open prepare 409", "오류가 나지 않았습니다");
    } catch (err) {
      const body = JSON.stringify(err);
      if (
        isDomainContractError(err) &&
        err.body.error.code === "PROJECT_TRANSITION_CONFLICT" &&
        !body.includes("PG_TEMPORARILY_UNAVAILABLE")
      ) {
        pass("PAY-02: 회로 Open prepare 409");
      } else {
        fail("PAY-02: 회로 Open prepare 409", err);
      }
    }
  }

  // 규칙 12·13 — 서명 전이·멱등 최초 시각
  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_alive", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const accepted = await api.acceptNegotiationOffer(
      "prj_alive",
      proposed.offer?.offerId ?? "",
      MOCK_FREELANCER_USER_ID,
      { expectedRound: 1 },
    );
    const contractId = accepted.contractId ?? "";
    const first = await api.signContract(contractId, MOCK_CLIENT_USER_ID);
    if (first.status === "SIGNING" && first.clientSignedAt === MOCK_NOW && first.alreadyProcessed === false) {
      pass("규칙 12: 첫 서명 SIGNING");
    } else {
      fail("규칙 12: 첫 서명 SIGNING", first);
    }
    const firstAgain = await api.signContract(contractId, MOCK_CLIENT_USER_ID);
    if (
      firstAgain.alreadyProcessed === true &&
      firstAgain.clientSignedAt === first.clientSignedAt
    ) {
      pass("규칙 13: 서명 멱등 최초 시각");
    } else {
      fail("규칙 13: 서명 멱등 최초 시각", firstAgain);
    }
    const both = await api.signContract(contractId, MOCK_FREELANCER_USER_ID);
    if (both.status === "SIGNED" && both.signedAt === MOCK_NOW && both.freelancerSignedAt === MOCK_NOW) {
      pass("규칙 12: 양쪽 서명 SIGNED");
    } else {
      fail("규칙 12: 양쪽 서명 SIGNED", both);
    }
    const afterSigned = await api.projects.getProjectNegotiationContext("prj_alive");
    if (afterSigned.transactionStatus === "CONTRACT_PENDING") {
      pass("CTR-02: SIGNED 직후 CONTRACT_PENDING");
    } else {
      fail("CTR-02: SIGNED 직후 CONTRACT_PENDING", afterSigned);
    }
  }

  // CTR-02 — 서명 순서 자유·취소 후 거부·감사 보존
  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_seq", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const accepted = await api.acceptNegotiationOffer(
      "prj_seq",
      proposed.offer?.offerId ?? "",
      MOCK_FREELANCER_USER_ID,
      { expectedRound: 1 },
    );
    const contractId = accepted.contractId ?? "";
    const first = await api.signContract(contractId, MOCK_FREELANCER_USER_ID);
    if (
      first.status === "SIGNING" &&
      first.freelancerSignedAt === MOCK_NOW &&
      first.clientSignedAt === null
    ) {
      pass("CTR-02: 프리랜서 선서명 SIGNING");
    } else {
      fail("CTR-02: 프리랜서 선서명 SIGNING", first);
    }
    const firstAgain = await api.signContract(contractId, MOCK_FREELANCER_USER_ID);
    const auditsAfterRetry = api.getSignatureAudits().filter((row) => row.contractId === contractId);
    if (firstAgain.alreadyProcessed === true && auditsAfterRetry.length === 1) {
      pass("CTR-02: 재서명 감사 1건");
    } else {
      fail("CTR-02: 재서명 감사 1건", { firstAgain, auditsAfterRetry });
    }
    const both = await api.signContract(contractId, MOCK_CLIENT_USER_ID);
    if (both.status === "SIGNED" && both.clientSignedAt === MOCK_NOW && both.signedAt === MOCK_NOW) {
      pass("CTR-02: 의뢰인 후서명 SIGNED");
    } else {
      fail("CTR-02: 의뢰인 후서명 SIGNED", both);
    }
  }

  {
    const api = createPublicApiMock();
    const proposed = await api.proposeNegotiationOffer("prj_restore", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const accepted = await api.acceptNegotiationOffer(
      "prj_restore",
      proposed.offer?.offerId ?? "",
      MOCK_FREELANCER_USER_ID,
      { expectedRound: 1 },
    );
    const contractId = accepted.contractId ?? "";
    const first = await api.signContract(contractId, MOCK_FREELANCER_USER_ID);
    await api.invalidateAgreementAndContract("prj_restore", {
      cancellationId: "cnl_sign_cancel",
      actorUserId: MOCK_CLIENT_USER_ID,
      reason: "PROJECT_CANCELED",
      projectCanceledAt: MOCK_NOW,
      requestId: "req_sign_cancel",
      idempotencyKey: "invalidate-cnl_sign_cancel",
      occurredAt: MOCK_NOW,
    });
    const afterCancel = await api.getContract(contractId, MOCK_FREELANCER_USER_ID);
    const audits = api.getSignatureAudits().filter((row) => row.contractId === contractId);
    try {
      await api.signContract(contractId, MOCK_CLIENT_USER_ID);
      fail("CTR-02: SIGNING 취소 후 서명 409", "오류가 나지 않았습니다");
    } catch (err) {
      const body = JSON.stringify(err);
      if (
        isDomainContractError(err) &&
        err.body.error.code === "PROJECT_TRANSITION_CONFLICT" &&
        !body.includes("CONTRACT_CANCELED") &&
        afterCancel.status === "CANCELED" &&
        afterCancel.freelancerSignedAt === first.freelancerSignedAt &&
        audits.length === 1
      ) {
        pass("CTR-02: SIGNING 취소 후 서명 409 · 감사 보존");
      } else {
        fail("CTR-02: SIGNING 취소 후 서명 409 · 감사 보존", {
          err,
          afterCancel,
          audits,
        });
      }
    }
  }

  // 규칙 15 — 무효화 DONE·NOT_NEEDED·멱등
  {
    const api = createPublicApiMock();
    const none = await api.invalidateAgreementAndContract("prj_alive", {
      cancellationId: "cnl_none",
      actorUserId: MOCK_CLIENT_USER_ID,
      reason: "PROJECT_CANCELED",
      projectCanceledAt: MOCK_NOW,
      requestId: "req_inv_none",
      idempotencyKey: "invalidate-cnl_none",
      occurredAt: MOCK_NOW,
    });
    if (none.result === "NOT_NEEDED" && none.alreadyProcessed === false) {
      pass("규칙 15: 무효화 NOT_NEEDED");
    } else {
      fail("규칙 15: 무효화 NOT_NEEDED", none);
    }
    await api.proposeNegotiationOffer("prj_seq", MOCK_CLIENT_USER_ID, {
      amount: MOCK_OFFER_AMOUNT,
      currency: "KRW",
    });
    const done = await api.invalidateAgreementAndContract("prj_seq", {
      cancellationId: "cnl_123",
      actorUserId: MOCK_CLIENT_USER_ID,
      reason: "PROJECT_CANCELED",
      projectCanceledAt: MOCK_NOW,
      requestId: "req_inv_01",
      idempotencyKey: "invalidate-cnl_123",
      occurredAt: MOCK_NOW,
    });
    if (done.result === "DONE") {
      pass("규칙 15: 무효화 DONE");
    } else {
      fail("규칙 15: 무효화 DONE", done);
    }
    const again = await api.invalidateAgreementAndContract("prj_seq", {
      cancellationId: "cnl_123",
      actorUserId: MOCK_CLIENT_USER_ID,
      reason: "PROJECT_CANCELED",
      projectCanceledAt: MOCK_NOW,
      requestId: "req_inv_02",
      idempotencyKey: "invalidate-cnl_123",
      occurredAt: MOCK_NOW,
    });
    if (again.result === "DONE" && again.alreadyProcessed === true) {
      pass("규칙 15: 무효화 멱등");
    } else {
      fail("규칙 15: 무효화 멱등", again);
    }
  }

  // 규칙 21 — retrievePayment
  {
    const gateway = createPaymentGatewayMock();
    try {
      await gateway.confirmPayment({
        orderId: "ord_retrieve_fail",
        amount: MOCK_CONFIRMED_AMOUNT,
        paymentKey: MOCK_FAIL_PAYMENT_KEY,
      });
      fail("규칙 21: retrievePayment FAILED", "오류가 나지 않았습니다");
    } catch (err) {
      const retrieved = await gateway.retrievePayment("ord_retrieve_fail");
      if (
        err instanceof PaymentGatewayError &&
        retrieved.status === "FAILED" &&
        retrieved.orderId === "ord_retrieve_fail"
      ) {
        pass("규칙 21: retrievePayment FAILED");
      } else {
        fail("규칙 21: retrievePayment FAILED", { err, retrieved });
      }
    }
  }

  // 규칙 22 — Increment 백로그 UX. 합의·서명은 규칙 17, 결제는 PaymentPanel.
  {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { AgreementPanel } = await import("./web/AgreementPanel");
    const { PaymentPanel } = await import("./web/PaymentPanel");

    function htmlOf(node: React.ReactElement): string {
      return renderToStaticMarkup(node);
    }
    function hasText(name: string, html: string, text: string): void {
      if (html.includes(text)) pass(name);
      else fail(name, html);
    }

    hasText(
      "규칙 22: 로딩",
      htmlOf(React.createElement(AgreementPanel, { view: "loading" })),
      "합의 내용을 불러오는 중입니다.",
    );
    hasText(
      "규칙 22: LOAD_FAILED 재시도",
      htmlOf(React.createElement(AgreementPanel, { uiState: "LOAD_FAILED" })),
      "다시 시도",
    );
    hasText(
      "규칙 22: 409 재조회",
      htmlOf(React.createElement(AgreementPanel, { uiState: "STALE" })),
      "다시 불러오기",
    );
    const canceled = htmlOf(React.createElement(AgreementPanel, { uiState: "PROJECT_CANCELED" }));
    if (canceled.includes("프로젝트가 취소되었습니다") && !hasMutationCta(canceled)) {
      pass("규칙 22: 취소 후 변경 숨김");
    } else {
      fail("규칙 22: 취소 후 변경 숨김", canceled);
    }
    hasText("규칙 17: 결제 필수 결제 금액", htmlOf(React.createElement(PaymentPanel)), "결제 금액");
    hasText("규칙 17: 결제 필수 테스트 결제 진행", htmlOf(React.createElement(PaymentPanel)), "테스트 결제 진행");
  }

  // 규칙 23 — 납품 Increment. 취소 우선 · APPROVED+PAID는 완료가 아님 · Mock 4종.
  {
    function sampleDeliveryDto(
      overrides: Partial<GetDeliveryResponse> = {},
    ): GetDeliveryResponse {
      return {
        contractId: "ctr_1",
        projectId: "prj_1",
        projectTitle: MOCK_PROJECT_TITLE,
        transactionStatus: "IN_PROGRESS",
        canceledAt: null,
        contractStatus: "SIGNED",
        agreedAmount: MOCK_OFFER_AMOUNT,
        delivery: null,
        paymentStatus: "PAID",
        downloadUrl: null,
        canRequestDelivery: false,
        canApprove: false,
        canDownload: false,
        canReview: false,
        ...overrides,
      };
    }

    const cancelFirst = deriveDeliveryUiState({
      transactionStatus: "CANCELED",
      deliveryStatus: "APPROVED",
      paymentStatus: "RELEASED",
      hasDelivery: true,
      viewerRole: "CLIENT",
    });
    if (cancelFirst === "PROJECT_CANCELED") pass("규칙 23: 상태 산정 취소 우선");
    else fail("규칙 23: 상태 산정 취소 우선", cancelFirst);

    const paidApproved = deriveDeliveryUiState({
      transactionStatus: "IN_PROGRESS",
      deliveryStatus: "APPROVED",
      paymentStatus: "PAID",
      hasDelivery: true,
      viewerRole: "CLIENT",
    });
    if (paidApproved === "SETTLEMENT_PENDING") pass("규칙 23: APPROVED+PAID는 정산 대기");
    else fail("규칙 23: APPROVED+PAID는 정산 대기", paidApproved);

    const released = deriveDeliveryUiState({
      transactionStatus: "IN_PROGRESS",
      deliveryStatus: "APPROVED",
      paymentStatus: "RELEASED",
      hasDelivery: true,
      viewerRole: "CLIENT",
    });
    if (released === "COMPLETED") pass("규칙 23: APPROVED+RELEASED는 완료");
    else fail("규칙 23: APPROVED+RELEASED는 완료", released);

    const action = deriveDeliveryUiState({
      transactionStatus: "IN_PROGRESS",
      deliveryStatus: "DELIVERY_REQUESTED",
      paymentStatus: "PAID",
      hasDelivery: true,
      viewerRole: "CLIENT",
    });
    if (action === "ACTION_REQUIRED") pass("규칙 23: 의뢰인 ACTION_REQUIRED");
    else fail("규칙 23: 의뢰인 ACTION_REQUIRED", action);

    const waiting = deriveDeliveryUiState({
      transactionStatus: "IN_PROGRESS",
      deliveryStatus: "DELIVERY_REQUESTED",
      paymentStatus: "PAID",
      hasDelivery: true,
      viewerRole: "FREELANCER",
    });
    if (waiting === "WAITING_REVIEW") pass("규칙 23: 프리랜서 WAITING_REVIEW");
    else fail("규칙 23: 프리랜서 WAITING_REVIEW", waiting);

    const ready = deriveDeliveryUiState({
      transactionStatus: "IN_PROGRESS",
      contractStatus: "SIGNED",
      paymentStatus: "PAID",
      deliveryStatus: "IN_PROGRESS",
      hasDelivery: true,
      viewerRole: "FREELANCER",
    });
    if (ready === "READY_TO_DELIVER") pass("규칙 23: 프리랜서 READY_TO_DELIVER");
    else fail("규칙 23: 프리랜서 READY_TO_DELIVER", ready);

    const work = deriveDeliveryUiState({
      transactionStatus: "IN_PROGRESS",
      contractStatus: "SIGNED",
      paymentStatus: "PAID",
      deliveryStatus: "IN_PROGRESS",
      hasDelivery: true,
      viewerRole: "CLIENT",
    });
    if (work === "WORK_IN_PROGRESS") pass("규칙 23: 의뢰인 WORK_IN_PROGRESS");
    else fail("규칙 23: 의뢰인 WORK_IN_PROGRESS", work);

    const forbiddenVm = toDeliveryViewModel(
      sampleDeliveryDto({
        agreedAmount: 1_000_000,
        delivery: {
          deliveryId: "dlv_secret",
          status: "DELIVERY_REQUESTED",
          version: 1,
          message: MOCK_DELIVERY_MESSAGE,
          requestedAt: MOCK_NOW,
          approvedAt: null,
          file: { fileName: MOCK_DELIVERY_FILE_NAME, mimeType: "application/zip", sizeBytes: 10 },
        },
      }),
      CLIENT_SESSION,
      "FORBIDDEN",
    );
    if (
      forbiddenVm.uiState === "FORBIDDEN" &&
      forbiddenVm.delivery.file == null &&
      forbiddenVm.delivery.message == null &&
      forbiddenVm.contract.amount === 0
    ) {
      pass("규칙 23: 403 ViewModel 민감 정보 없음");
    } else {
      fail("규칙 23: 403 ViewModel 민감 정보 없음", forbiddenVm);
    }

    const settleVm = toDeliveryViewModel(
      sampleDeliveryDto({
        delivery: {
          deliveryId: "dlv_1",
          status: "APPROVED",
          version: 1,
          message: MOCK_DELIVERY_MESSAGE,
          requestedAt: MOCK_NOW,
          approvedAt: MOCK_NOW,
          file: { fileName: MOCK_DELIVERY_FILE_NAME, mimeType: "application/zip", sizeBytes: 10 },
        },
      }),
      CLIENT_SESSION,
    );
    if (
      settleVm.uiState === "SETTLEMENT_PENDING" &&
      !settleVm.permissions.canRequestDelivery &&
      !settleVm.permissions.canApprove
    ) {
      pass("규칙 23: 정산 대기 변경 권한 없음");
    } else {
      fail("규칙 23: 정산 대기 변경 권한 없음", settleVm.permissions);
    }
  }

  {
    const notifications = createNotificationTriggerMock();
    const api = createPublicApiMock(MOCK_NOW, { notifications });
    const beforeComplete = api.projects.getCallCounts().completeProjectTransaction;
    const fileMeta = {
      fileName: MOCK_DELIVERY_FILE_NAME,
      contentType: "application/zip",
      size: 1_048_576,
      sha256: MOCK_DELIVERY_SHA256,
    };

    const empty = await api.getDelivery(MOCK_DELIVERY_CONTRACT_IN_PROGRESS, MOCK_FREELANCER_USER_ID);
    if (empty.delivery?.status === "IN_PROGRESS" && empty.delivery.file == null) {
      pass("규칙 23: GET IN_PROGRESS 행 200");
    } else {
      fail("규칙 23: GET IN_PROGRESS 행 200", empty);
    }
    const ensured = api.ensureDeliveryForContract(MOCK_DELIVERY_CONTRACT_IN_PROGRESS);
    const ensuredAgain = api.ensureDeliveryForContract(MOCK_DELIVERY_CONTRACT_IN_PROGRESS);
    if (ensured.deliveryId === ensuredAgain.deliveryId && ensured.status === "IN_PROGRESS") {
      pass("규칙 23: ensureDelivery 중복은 같은 행");
    } else {
      fail("규칙 23: ensureDelivery 중복은 같은 행", { ensured, ensuredAgain });
    }
    const readyVm = toDeliveryViewModel(empty, FREELANCER_SESSION);
    if (readyVm.uiState === "READY_TO_DELIVER") pass("규칙 23: GET 프리랜서 납품 전");
    else fail("규칙 23: GET 프리랜서 납품 전", readyVm.uiState);
    const workVm = toDeliveryViewModel(empty, CLIENT_SESSION);
    if (workVm.uiState === "WORK_IN_PROGRESS") pass("규칙 23: GET 의뢰인 작업 중");
    else fail("규칙 23: GET 의뢰인 작업 중", workVm.uiState);

    try {
      await api.getDelivery(MOCK_DELIVERY_CONTRACT_IN_PROGRESS, MOCK_OUTSIDER_USER_ID);
      fail("규칙 23: GET 비당사자 403", "오류가 나지 않았습니다");
    } catch (err) {
      if (isPublicApiError(err) && err.body.error.code === "PROJECT_FORBIDDEN" && err.httpStatus === 403) {
        pass("규칙 23: GET 비당사자 403");
      } else {
        fail("규칙 23: GET 비당사자 403", err);
      }
    }
    await expectCode("규칙 23: GET 없는 계약 404", "PROJECT_NOT_FOUND", () =>
      api.getDelivery("ctr_missing", MOCK_CLIENT_USER_ID),
    );

    await expectCode("규칙 23: 잘못된 sha256 422", "VALIDATION_ERROR", () =>
      api.prepareDeliveryUpload(MOCK_DELIVERY_CONTRACT_IN_PROGRESS, MOCK_FREELANCER_USER_ID, {
        ...fileMeta,
        sha256: "not-a-hash",
      }),
    );
    await expectCode("규칙 23: 미준비 업로드 422", "VALIDATION_ERROR", () =>
      api.requestDelivery(MOCK_DELIVERY_CONTRACT_IN_PROGRESS, MOCK_FREELANCER_USER_ID, {
        objectKey: "deliveries/ctr_missing/obj",
        uploadId: "upl_missing",
        message: MOCK_DELIVERY_MESSAGE,
        idempotencyKey: "req-not-ready",
      }),
    );

    const prepared = await api.prepareDeliveryUpload(
      MOCK_DELIVERY_CONTRACT_IN_PROGRESS,
      MOCK_FREELANCER_USER_ID,
      fileMeta,
    );
    const requested = await api.requestDelivery(
      MOCK_DELIVERY_CONTRACT_IN_PROGRESS,
      MOCK_FREELANCER_USER_ID,
      {
        objectKey: prepared.objectKey,
        uploadId: prepared.uploadId,
        message: MOCK_DELIVERY_MESSAGE,
        idempotencyKey: "req-1",
      },
    );
    if (requested.delivery?.status === "DELIVERY_REQUESTED") {
      pass("규칙 23: 납품 요청 DELIVERY_REQUESTED");
    } else {
      fail("규칙 23: 납품 요청 DELIVERY_REQUESTED", requested);
    }
    const requestedAgain = await api.requestDelivery(
      MOCK_DELIVERY_CONTRACT_IN_PROGRESS,
      MOCK_FREELANCER_USER_ID,
      {
        objectKey: prepared.objectKey,
        uploadId: prepared.uploadId,
        message: MOCK_DELIVERY_MESSAGE,
        idempotencyKey: "req-1",
      },
    );
    const requestPublished = notifications.getPublished().filter((event) => event.type === "DELIVERY_REQUESTED");
    if (requestedAgain.alreadyProcessed === true && requestPublished.length === 1) {
      pass("규칙 23: 같은 납품 키 재호출 1회");
    } else {
      fail("규칙 23: 같은 납품 키 재호출 1회", { requestedAgain, requestPublished });
    }
    await expectCode("규칙 23: 같은 키 다른 본문 409", "PROJECT_TRANSITION_CONFLICT", () =>
      api.requestDelivery(MOCK_DELIVERY_CONTRACT_IN_PROGRESS, MOCK_FREELANCER_USER_ID, {
        objectKey: prepared.objectKey,
        uploadId: prepared.uploadId,
        message: "다른 메시지",
        idempotencyKey: "req-1",
      }),
    );
    const waitVm = toDeliveryViewModel(requested, FREELANCER_SESSION);
    if (waitVm.uiState === "WAITING_REVIEW") pass("규칙 23: 요청 후 프리랜서 검토 대기");
    else fail("규칙 23: 요청 후 프리랜서 검토 대기", waitVm.uiState);
    const actionDto = await api.getDelivery(
      MOCK_DELIVERY_CONTRACT_IN_PROGRESS,
      MOCK_CLIENT_USER_ID,
    );
    const actionVm = toDeliveryViewModel(actionDto, CLIENT_SESSION);
    if (actionVm.uiState === "ACTION_REQUIRED") pass("규칙 23: 요청 후 의뢰인 검토");
    else fail("규칙 23: 요청 후 의뢰인 검토", actionVm.uiState);

    const approved = await api.approveDelivery(MOCK_DELIVERY_CONTRACT_IN_PROGRESS, MOCK_CLIENT_USER_ID, {
      idempotencyKey: "appr-1",
    });
    const afterComplete = api.projects.getCallCounts().completeProjectTransaction;
    if (
      approved.delivery?.status === "APPROVED" &&
      approved.transactionStatus === "IN_PROGRESS" &&
      approved.paymentStatus === "PAID" &&
      afterComplete === beforeComplete
    ) {
      pass("규칙 23: 승인 PAID는 complete 미호출");
    } else {
      fail("규칙 23: 승인 PAID는 complete 미호출", {
        approved,
        beforeComplete,
        afterComplete,
      });
    }
    const firstApprovedAt = approved.delivery?.approvedAt;
    const approvedAgain = await api.approveDelivery(
      MOCK_DELIVERY_CONTRACT_IN_PROGRESS,
      MOCK_CLIENT_USER_ID,
      { idempotencyKey: "appr-1" },
    );
    const approvePublished = notifications.getPublished().filter((event) => event.type === "DELIVERY_APPROVED");
    if (
      approvedAgain.alreadyProcessed === true &&
      approvedAgain.delivery?.approvedAt === firstApprovedAt &&
      approvePublished.length === 1
    ) {
      pass("규칙 23: 같은 승인 키 재호출 1회");
    } else {
      fail("규칙 23: 같은 승인 키 재호출 1회", { approvedAgain, approvePublished });
    }
    const settleAfter = toDeliveryViewModel(approved, CLIENT_SESSION);
    if (settleAfter.uiState === "SETTLEMENT_PENDING") pass("규칙 23: 승인 후 정산 대기");
    else fail("규칙 23: 승인 후 정산 대기", settleAfter.uiState);

    const types = notifications.getPublished().map((event) => event.type);
    if (types.includes("DELIVERY_REQUESTED") && types.includes("DELIVERY_APPROVED")) {
      pass("규칙 23: 납품 경로에서만 납품 publish");
    } else {
      fail("규칙 23: 납품 경로에서만 납품 publish", types);
    }

    const releasedAfterApprove = await api.simulateSettlementReleased(MOCK_DELIVERY_CONTRACT_IN_PROGRESS);
    if (
      releasedAfterApprove.transactionStatus === "COMPLETED" &&
      api.projects.getCallCounts().completeProjectTransaction === beforeComplete + 1
    ) {
      pass("규칙 23: 승인 후 RELEASED면 complete 1회");
    } else {
      fail("규칙 23: 승인 후 RELEASED면 complete 1회", releasedAfterApprove);
    }

    const completedDto = await api.getDelivery(
      MOCK_DELIVERY_CONTRACT_COMPLETED,
      MOCK_CLIENT_USER_ID,
    );
    const doneVm = toDeliveryViewModel(completedDto, CLIENT_SESSION);
    if (doneVm.uiState === "COMPLETED" && doneVm.permissions.canReview) {
      pass("규칙 23: RELEASED 시드는 완료");
    } else {
      fail("규칙 23: RELEASED 시드는 완료", doneVm);
    }

    const canceledDto = await api.getDelivery(
      MOCK_DELIVERY_CONTRACT_CANCELED,
      MOCK_FREELANCER_USER_ID,
    );
    const canceledVm = toDeliveryViewModel(canceledDto, FREELANCER_SESSION);
    if (
      canceledVm.uiState === "PROJECT_CANCELED" &&
      !canceledVm.permissions.canRequestDelivery &&
      !canceledVm.permissions.canApprove
    ) {
      pass("규칙 23: 취소 프로젝트 변경 숨김");
    } else {
      fail("규칙 23: 취소 프로젝트 변경 숨김", canceledVm);
    }
  }

  {
    const reverse = createPublicApiMock(MOCK_NOW);
    const fileMeta = {
      fileName: MOCK_DELIVERY_FILE_NAME,
      contentType: "application/zip",
      size: 1_048_576,
      sha256: MOCK_DELIVERY_SHA256,
    };
    const beforeReleaseOnly = reverse.projects.getCallCounts().completeProjectTransaction;
    await reverse.simulateSettlementReleased(MOCK_DELIVERY_CONTRACT_IN_PROGRESS);
    if (reverse.projects.getCallCounts().completeProjectTransaction === beforeReleaseOnly) {
      pass("규칙 23: RELEASED만이면 complete 미호출");
    } else {
      fail("규칙 23: RELEASED만이면 complete 미호출", reverse.projects.getCallCounts());
    }
    const prepared = await reverse.prepareDeliveryUpload(
      MOCK_DELIVERY_CONTRACT_IN_PROGRESS,
      MOCK_FREELANCER_USER_ID,
      fileMeta,
    );
    await reverse.requestDelivery(MOCK_DELIVERY_CONTRACT_IN_PROGRESS, MOCK_FREELANCER_USER_ID, {
      objectKey: prepared.objectKey,
      uploadId: prepared.uploadId,
      message: MOCK_DELIVERY_MESSAGE,
      idempotencyKey: "req-reverse",
    });
    const beforeApprove = reverse.projects.getCallCounts().completeProjectTransaction;
    const approved = await reverse.approveDelivery(
      MOCK_DELIVERY_CONTRACT_IN_PROGRESS,
      MOCK_CLIENT_USER_ID,
      { idempotencyKey: "appr-reverse" },
    );
    if (
      approved.transactionStatus === "COMPLETED" &&
      reverse.projects.getCallCounts().completeProjectTransaction === beforeApprove + 1
    ) {
      pass("규칙 23: RELEASED 먼저면 승인 시 complete");
    } else {
      fail("규칙 23: RELEASED 먼저면 승인 시 complete", approved);
    }
    const recovered = await reverse.recoverStuckCompletions();
    if (recovered === 0) pass("규칙 23: 복구 worker 중복 없음");
    else fail("규칙 23: 복구 worker 중복 없음", recovered);
  }

  {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { DeliveryPanel } = await import("./web/DeliveryPanel");

    function htmlOf(node: React.ReactElement): string {
      return renderToStaticMarkup(node);
    }
    function hasText(name: string, html: string, text: string): void {
      if (html.includes(text)) pass(name);
      else fail(name, html);
    }

    const ready = htmlOf(React.createElement(DeliveryPanel));
    hasText("규칙 23: 필수 결과물 납품", ready, "결과물 납품");
    hasText("규칙 23: 필수 납품 요청", ready, "납품 요청");
    hasText("규칙 23: 파일 검사 안내", ready, "파일 안전성 검사");
    const action = htmlOf(React.createElement(DeliveryPanel, { uiState: "ACTION_REQUIRED" }));
    hasText("규칙 23: 필수 완료 승인", action, "완료 승인");
    hasText("규칙 23: 필수 승인 확인", action, "납품을 승인할까요?");
    hasText(
      "규칙 23: 필수 리뷰 작성",
      htmlOf(React.createElement(DeliveryPanel, { uiState: "COMPLETED" })),
      "리뷰 작성",
    );
    hasText(
      "규칙 23: 로딩",
      htmlOf(React.createElement(DeliveryPanel, { loading: true })),
      "납품 내용을 불러오는 중입니다.",
    );
    const loadFailed = htmlOf(React.createElement(DeliveryPanel, { uiState: "LOAD_FAILED" }));
    hasText("규칙 23: LOAD_FAILED 재시도", loadFailed, "다시 시도");
    hasText(
      "규칙 23: 409 재조회",
      htmlOf(React.createElement(DeliveryPanel, { uiState: "STALE" })),
      "다시 불러오기",
    );
    const canceled = htmlOf(React.createElement(DeliveryPanel, { uiState: "PROJECT_CANCELED" }));
    hasText("규칙 23: 취소 안내", canceled, "프로젝트가 취소되었습니다");
    if (!hasDeliveryMutationCta(canceled)) pass("규칙 23: 취소 후 변경 숨김");
    else fail("규칙 23: 취소 후 변경 숨김", canceled);

    const settlement = htmlOf(React.createElement(DeliveryPanel, { uiState: "SETTLEMENT_PENDING" }));
    hasText("규칙 23: 정산 대기 안내", settlement, "정산 처리 중");
    hasText("규칙 23: 정산 대기 정산 확인", settlement, "정산 확인");
    if (!hasDeliveryMutationCta(settlement)) pass("규칙 23: 정산 대기 변경 숨김");
    else fail("규칙 23: 정산 대기 변경 숨김", settlement);

    const completed = htmlOf(React.createElement(DeliveryPanel, { uiState: "COMPLETED" }));
    if (!hasDeliveryMutationCta(completed)) pass("규칙 23: 완료 후 변경 숨김");
    else fail("규칙 23: 완료 후 변경 숨김", completed);

    const work = htmlOf(React.createElement(DeliveryPanel, { uiState: "WORK_IN_PROGRESS" }));
    hasText("규칙 23: 의뢰인 작업 중 안내", work, "프리랜서가 작업 중입니다.");
    if (!hasDeliveryMutationCta(work)) pass("규칙 23: 작업 중 변경 숨김");
    else fail("규칙 23: 작업 중 변경 숨김", work);

    const forbidden = htmlOf(React.createElement(DeliveryPanel, { uiState: "FORBIDDEN" }));
    hasText("규칙 23: 403 안내", forbidden, "이 납품을 볼 수 있는 권한이 없습니다");
    if (!forbidden.includes(MOCK_DELIVERY_FILE_NAME) && !forbidden.includes("money")) {
      pass("규칙 23: 403 민감 정보 없음");
    } else {
      fail("규칙 23: 403 민감 정보 없음", forbidden);
    }
    const notFound = htmlOf(React.createElement(DeliveryPanel, { uiState: "NOT_FOUND" }));
    if (!notFound.includes(MOCK_DELIVERY_FILE_NAME) && !notFound.includes("money")) {
      pass("규칙 23: 404 민감 정보 없음");
    } else {
      fail("규칙 23: 404 민감 정보 없음", notFound);
    }
  }

  {
    const payWait = deriveContractUiState({
      contractStatus: "SIGNED",
      paymentStatus: "READY",
      transactionStatus: "CONTRACT_PENDING",
      viewerHasSigned: true,
      viewerRole: "CLIENT",
    });
    if (payWait === "SIGNED_PAYMENT_REQUIRED") pass("규칙 17: SIGNED+미결제는 결제 필요");
    else fail("규칙 17: SIGNED+미결제는 결제 필요", payWait);

    const work = deriveContractUiState({
      contractStatus: "SIGNED",
      paymentStatus: "PAID",
      transactionStatus: "IN_PROGRESS",
      viewerHasSigned: true,
      viewerRole: "CLIENT",
    });
    if (work === "IN_PROGRESS") pass("규칙 17: SIGNED+PAID+IN_PROGRESS는 작업 시작");
    else fail("규칙 17: SIGNED+PAID+IN_PROGRESS는 작업 시작", work);

    const notWork = deriveContractUiState({
      contractStatus: "SIGNED",
      paymentStatus: "READY",
      transactionStatus: "IN_PROGRESS",
      viewerHasSigned: true,
      viewerRole: "FREELANCER",
    });
    if (notWork === "SIGNED_PAYMENT_WAIT") pass("규칙 17: SIGNED만으로 작업 시작 아님");
    else fail("규칙 17: SIGNED만으로 작업 시작 아님", notWork);

    const readySign = deriveContractUiState({
      contractStatus: "DRAFT",
      paymentStatus: null,
      transactionStatus: "CONTRACT_PENDING",
      viewerHasSigned: false,
      viewerRole: "CLIENT",
    });
    if (readySign === "READY_TO_SIGN") pass("규칙 17: DRAFT 미서명은 서명 가능");
    else fail("규칙 17: DRAFT 미서명은 서명 가능", readySign);

    const forbiddenVm = toContractViewModel(
      {
        contractId: "ctr_secret",
        projectId: "prj_secret",
        status: "DRAFT",
        termsSnapshot: {
          schemaVersion: 1,
          amount: 1_000_000,
          currency: "KRW",
          projectTitle: MOCK_PROJECT_TITLE,
        },
        workStartDate: "2026-09-03",
        workEndDate: "2026-09-30",
        clientSignedAt: null,
        freelancerSignedAt: null,
        signedAt: null,
        transactionStatus: "CONTRACT_PENDING",
        canceledAt: null,
        paymentStatus: null,
      },
      CLIENT_SESSION,
      "FORBIDDEN",
    );
    if (forbiddenVm.uiState === "FORBIDDEN" && forbiddenVm.contract.amount === 0) {
      pass("규칙 17: 서명 403 ViewModel 민감 정보 없음");
    } else {
      fail("규칙 17: 서명 403 ViewModel 민감 정보 없음", forbiddenVm);
    }
  }

  {
    const client = { actorUserId: "usr_client", clientId: "usr_client" } as const;
    const freelancer = { actorUserId: "usr_freelancer", clientId: "usr_client" } as const;
    const samplePayment = {
      paymentId: "pay_1",
      contractId: "ctr_1",
      orderId: "ord_1",
      amount: 100_000,
      currency: "KRW" as const,
      platformFeeAmount: 7_000,
      settlementAmount: 93_000,
      status: "READY" as const,
      projectTitle: MOCK_PROJECT_TITLE,
      projectTransactionStatus: "CONTRACT_PENDING" as const,
      environment: "SANDBOX" as const,
    };

    if (
      derivePaymentUiState({
        paymentStatus: "PAID",
        projectTransactionStatus: "IN_PROGRESS",
        contractSigned: true,
        viewerRole: "CLIENT",
      }) === "PAID"
    ) {
      pass("규칙 17: PAID+IN_PROGRESS는 완료");
    } else {
      fail("규칙 17: PAID+IN_PROGRESS는 완료");
    }
    if (
      derivePaymentUiState({
        paymentStatus: "PAID",
        projectTransactionStatus: "CONTRACT_PENDING",
        contractSigned: true,
        viewerRole: "CLIENT",
      }) === "PAID_SYNCING"
    ) {
      pass("규칙 17: PAID+CONTRACT_PENDING은 동기화");
    } else {
      fail("규칙 17: PAID+CONTRACT_PENDING은 동기화");
    }
    if (
      derivePaymentUiState({
        paymentStatus: "PENDING",
        projectTransactionStatus: "CONTRACT_PENDING",
        contractSigned: true,
        viewerRole: "CLIENT",
      }) === "PAYMENT_CONFIRMING"
    ) {
      pass("규칙 17: PENDING은 확인 중");
    } else {
      fail("규칙 17: PENDING은 확인 중");
    }
    if (
      derivePaymentUiState({
        paymentStatus: "FAILED",
        projectTransactionStatus: "CONTRACT_PENDING",
        contractSigned: true,
        viewerRole: "CLIENT",
      }) === "FAILED_RETRYABLE"
    ) {
      pass("규칙 17: FAILED만 재결제");
    } else {
      fail("규칙 17: FAILED만 재결제");
    }

    const feeVm = toPaymentViewModel(samplePayment, client);
    if (
      feeVm.platformFeeAmount === 7_000 &&
      feeVm.settlementAmount === 93_000 &&
      feeVm.platformFeeLabel === "7,000원" &&
      feeVm.permissions.canStart
    ) {
      pass("규칙 17: 결제 수수료는 서버 값");
    } else {
      fail("규칙 17: 결제 수수료는 서버 값", feeVm);
    }

    const freelancerVm = toPaymentViewModel(samplePayment, freelancer);
    if (
      freelancerVm.permissions.canStart === false &&
      freelancerVm.permissions.canRetry === false &&
      freelancerVm.orderId === null
    ) {
      pass("규칙 17: 프리랜서 ViewModel 액션 없음");
    } else {
      fail("규칙 17: 프리랜서 ViewModel 액션 없음", freelancerVm);
    }

    const stub = createTossCheckoutStub();
    const orch = createCheckoutOrchestrator(stub);
    await orch.start(null, "PAYMENT_AVAILABLE");
    if (stub.calls.length === 0) pass("규칙 16: 준비 실패 시 SDK 미호출");
    else fail("규칙 16: 준비 실패 시 SDK 미호출", stub.calls);

    const orchApi = createPublicApiMock();
    await signBothSides(orchApi, "prj_alive");
    const prepared = await orchApi.preparePayment("prj_alive", MOCK_CLIENT_USER_ID);
    const mapped = toTossCheckoutRequest(prepared);
    if (
      mapped.clientKey === prepared.clientKey &&
      mapped.orderId === prepared.orderId &&
      mapped.orderName === prepared.orderName &&
      mapped.amount === prepared.amount &&
      mapped.successUrl === prepared.successUrl &&
      mapped.failUrl === prepared.failUrl
    ) {
      pass("규칙 16: 준비값을 SDK에 그대로 전달");
    } else {
      fail("규칙 16: 준비값을 SDK에 그대로 전달", { prepared, mapped });
    }

    const once = createTossCheckoutStub();
    const onceOrch = createCheckoutOrchestrator(once);
    await Promise.all([
      onceOrch.start(prepared, "PAYMENT_AVAILABLE"),
      onceOrch.start(prepared, "PAYMENT_AVAILABLE"),
    ]);
    if (once.calls.length === 1) pass("규칙 16: 결제 준비 중복 클릭 1회");
    else fail("규칙 16: 결제 준비 중복 클릭 1회", once.calls);

    await onceOrch.start(prepared, "PROJECT_CANCELED");
    if (once.calls.length === 1) pass("규칙 16: 취소 후 결제창 미호출");
    else fail("규칙 16: 취소 후 결제창 미호출", once.calls);

    const parsed = parseTossSuccessQuery("paymentKey=tgen_1&orderId=ord_1&amount=100000");
    if (parsed && shouldConfirmRedirect(parsed, "READY") && !shouldConfirmRedirect(parsed, "PAID")) {
      pass("규칙 16: Redirect는 PAID면 confirm 생략");
    } else {
      fail("규칙 16: Redirect는 PAID면 confirm 생략", parsed);
    }
    if (failRedirectCopy() === "결제가 진행되지 않았습니다.") {
      pass("규칙 16: 실패 Redirect 승인 미호출 안내");
    } else {
      fail("규칙 16: 실패 Redirect 승인 미호출 안내", failRedirectCopy());
    }
    if (!shouldLoadTossWidget("mock_pg_client_key") && tossWidgetLoaderSrc().includes("tosspayments.com")) {
      pass("PAY-02: mock 키는 위젯 CDN 미사용");
    } else {
      fail("PAY-02: mock 키는 위젯 CDN 미사용", {
        load: shouldLoadTossWidget("mock_pg_client_key"),
        src: tossWidgetLoaderSrc(),
      });
    }
    if (hasPgClientKey()) {
      if (shouldLoadTossWidget(process.env.PG_CLIENT_KEY ?? "")) {
        pass("PAY-02: 클라이언트 키 있으면 위젯 로더");
      } else {
        fail("PAY-02: 클라이언트 키 있으면 위젯 로더", "로더 분기가 닫혀 있습니다");
      }
    } else {
      pass("PAY-02: 클라이언트 키 없음 keyMissing 유지");
    }
  }

  {
    const client = { actorUserId: "usr_client", clientId: "usr_client" } as const;
    const freelancer = { actorUserId: "usr_freelancer", clientId: "usr_client" } as const;
    const sampleSettlement = (
      overrides: Partial<GetSettlementResponse> = {},
    ): GetSettlementResponse => ({
      paymentId: "pay_set",
      contractId: "ctr_set",
      projectId: "prj_set",
      projectTitle: MOCK_PROJECT_TITLE,
      environment: "SANDBOX",
      provider: "MANUAL_SIMULATION",
      currency: "KRW",
      paymentAmount: 100_000,
      platformFeeRateBps: 1000,
      platformFeeAmount: 10_000,
      settlementAmount: 90_000,
      paymentStatus: "PAID",
      deliveryStatus: null,
      projectTransactionStatus: "IN_PROGRESS",
      canceledAt: null,
      ...overrides,
    });

    if (
      deriveSettlementUiState({
        paymentStatus: "PAID",
        deliveryStatus: null,
        projectTransactionStatus: "IN_PROGRESS",
      }) === "WAITING_DELIVERY"
    ) {
      pass("규칙 17: PAID+미납품은 납품 대기");
    } else {
      fail("규칙 17: PAID+미납품은 납품 대기");
    }
    if (
      deriveSettlementUiState({
        paymentStatus: "PAID",
        deliveryStatus: "APPROVED",
        projectTransactionStatus: "IN_PROGRESS",
      }) === "ELIGIBLE"
    ) {
      pass("규칙 17: APPROVED+PAID는 정산 가능");
    } else {
      fail("규칙 17: APPROVED+PAID는 정산 가능");
    }
    if (
      deriveSettlementUiState({
        paymentStatus: "RELEASED",
        deliveryStatus: "APPROVED",
        projectTransactionStatus: "IN_PROGRESS",
      }) === "COMPLETION_SYNCING"
    ) {
      pass("규칙 17: RELEASED+IN_PROGRESS는 완료 동기화");
    } else {
      fail("규칙 17: RELEASED+IN_PROGRESS는 완료 동기화");
    }
    if (
      deriveSettlementUiState({
        paymentStatus: "RELEASED",
        deliveryStatus: "APPROVED",
        projectTransactionStatus: "COMPLETED",
      }) === "RELEASED"
    ) {
      pass("규칙 17: RELEASED+COMPLETED는 정산 완료");
    } else {
      fail("규칙 17: RELEASED+COMPLETED는 정산 완료");
    }

    const mismatchDto = sampleSettlement({ platformFeeAmount: 7_000, settlementAmount: 90_000 });
    const mismatchVm = toSettlementViewModel(mismatchDto, client);
    if (
      amountsMismatch(100_000, 7_000, 90_000) &&
      mismatchVm.uiState === "REVIEW_REQUIRED" &&
      mismatchVm.platformFeeAmount === 7_000 &&
      mismatchVm.settlementAmount === 90_000 &&
      mismatchVm.paymentAmount === 100_000
    ) {
      pass("규칙 17: 정산 합계 불일치는 숫자 보정 없음");
    } else {
      fail("규칙 17: 정산 합계 불일치는 숫자 보정 없음", mismatchVm);
    }

    const clientVm = toSettlementViewModel(sampleSettlement(), client);
    const freelancerVm = toSettlementViewModel(sampleSettlement(), freelancer);
    if (
      clientVm.primaryAmount === 100_000 &&
      freelancerVm.primaryAmount === 90_000 &&
      clientVm.platformFeeAmount === 10_000 &&
      freelancerVm.platformFeeAmount === 10_000
    ) {
      pass("규칙 17: 정산 대표 금액은 역할별 서버 값");
    } else {
      fail("규칙 17: 정산 대표 금액은 역할별 서버 값", { clientVm, freelancerVm });
    }

    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { SettlementPanel } = await import("./web/SettlementPanel");
    function htmlOf(node: React.ReactElement): string {
      return renderToStaticMarkup(node);
    }
    function hasText(name: string, html: string, text: string): void {
      if (html.includes(text)) pass(name);
      else fail(name, html);
    }
    function hasForbiddenPayoutCopy(html: string): boolean {
      return (
        html.includes("에스크로") ||
        html.includes("지급 완료") ||
        html.includes("지급완료") ||
        html.includes("출금 가능") ||
        html.includes("정산 실행") ||
        html.includes("재지급") ||
        html.includes("송금 완료") ||
        html.includes("계좌 지급")
      );
    }

    const waitDlv = htmlOf(React.createElement(SettlementPanel));
    hasText("규칙 17: 정산 Sandbox 배지", waitDlv, "Sandbox 정산 시뮬레이션");
    hasText("규칙 17: 정산 시뮬레이션 카피", waitDlv, "정산 시뮬레이션");
    hasText("규칙 17: 정산 M01 도움", waitDlv, "무슨 뜻인가요?");
    if (!hasForbiddenPayoutCopy(waitDlv)) pass("규칙 17: 정산 금지 문구 없음");
    else fail("규칙 17: 정산 금지 문구 없음", waitDlv);

    const eligible = htmlOf(React.createElement(SettlementPanel, { uiState: "ELIGIBLE" }));
    hasText("규칙 17: 정산 가능 안내", eligible, "정산 가능한 상태입니다");
    if (!hasForbiddenPayoutCopy(eligible) && !eligible.includes("정산 실행")) {
      pass("규칙 17: 정산 가능 지급 버튼 없음");
    } else {
      fail("규칙 17: 정산 가능 지급 버튼 없음", eligible);
    }

    const released = htmlOf(React.createElement(SettlementPanel, { uiState: "RELEASED" }));
    hasText("규칙 17: 정산 완료 안내", released, "정산 시뮬레이션이 완료되었습니다");
    if (!hasForbiddenPayoutCopy(released)) pass("규칙 17: 정산 완료 금지 문구 없음");
    else fail("규칙 17: 정산 완료 금지 문구 없음", released);

    const forbidden = htmlOf(React.createElement(SettlementPanel, { uiState: "FORBIDDEN" }));
    if (!forbidden.includes("100,000") && !forbidden.includes("money")) {
      pass("규칙 17: 정산 403 금액 숨김");
    } else {
      fail("규칙 17: 정산 403 금액 숨김", forbidden);
    }
  }

  {
    const client = { actorUserId: "usr_client", clientId: "usr_client" } as const;
    const sampleCancellation = (
      overrides: Partial<GetCancellationResponse> = {},
    ): GetCancellationResponse => ({
      projectId: "prj_can",
      projectTitle: MOCK_PROJECT_TITLE,
      recruitmentStatus: "CLOSED",
      transactionStatus: "CONTRACT_PENDING",
      paymentPendingAt: null,
      canceledAt: null,
      acceptedApplicationId: "app_1",
      agreementStatus: "PROPOSED",
      contractStatus: "DRAFT",
      hasSignatureAudit: false,
      postActions: null,
      ...overrides,
    });

    if (
      deriveCancellationUiState({
        transactionStatus: "CANCELED",
        postActions: { applicationRejection: "NOT_NEEDED", contractInvalidation: "FAILED" },
        viewerRole: "CLIENT",
      }) === "CANCELED_FOLLOWUP_PENDING"
    ) {
      pass("규칙 17: CANCELED+FAILED는 후처리 중");
    } else {
      fail("규칙 17: CANCELED+FAILED는 후처리 중");
    }
    if (
      deriveCancellationUiState({
        transactionStatus: "CANCELED",
        postActions: { applicationRejection: "NOT_NEEDED", contractInvalidation: "DONE" },
        viewerRole: "CLIENT",
      }) === "CANCELED_COMPLETE"
    ) {
      pass("규칙 17: CANCELED는 취소 완료");
    } else {
      fail("규칙 17: CANCELED는 취소 완료");
    }
    if (
      deriveCancellationUiState({
        transactionStatus: "CONTRACT_PENDING",
        paymentPendingAt: "2026-09-04T00:00:00Z",
        viewerRole: "CLIENT",
      }) === "PAYMENT_STARTED"
    ) {
      pass("규칙 17: paymentPendingAt은 취소 불가");
    } else {
      fail("규칙 17: paymentPendingAt은 취소 불가");
    }
    if (
      deriveCancellationUiState({
        transactionStatus: "IN_PROGRESS",
        viewerRole: "CLIENT",
      }) === "IN_PROGRESS"
    ) {
      pass("규칙 17: IN_PROGRESS는 취소 가능 아님");
    } else {
      fail("규칙 17: IN_PROGRESS는 취소 가능 아님");
    }

    const followVm = toCancellationViewModel(
      sampleCancellation({
        transactionStatus: "CANCELED",
        canceledAt: "2026-09-04T00:00:00Z",
        postActions: { applicationRejection: "NOT_NEEDED", contractInvalidation: "FAILED" },
      }),
      client,
    );
    if (followVm.uiState === "CANCELED_FOLLOWUP_PENDING" && followVm.canCancel === false) {
      pass("규칙 17: 후처리는 취소 재실행 없음");
    } else {
      fail("규칙 17: 후처리는 취소 재실행 없음", followVm);
    }

    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { CancellationPanel } = await import("./web/CancellationPanel");
    const { AgreementPanel } = await import("./web/AgreementPanel");
    const { ContractSignPanel } = await import("./web/ContractSignPanel");
    function htmlOf(node: React.ReactElement): string {
      return renderToStaticMarkup(node);
    }
    function hasText(name: string, html: string, text: string): void {
      if (html.includes(text)) pass(name);
      else fail(name, html);
    }
    function hasForbiddenCancelCopy(html: string): boolean {
      return (
        html.includes("계약이 법적으로 무효") ||
        html.includes("취소에 실패했습니다") ||
        html.includes("합의 철회") ||
        html.includes("처음부터 무효") ||
        html.includes("환불하세요")
      );
    }

    const available = htmlOf(React.createElement(CancellationPanel));
    hasText("규칙 17: 취소 확인 제목", available, "프로젝트를 취소할까요?");
    hasText("규칙 17: 취소 확인 버튼", available, "프로젝트 취소");
    if (!hasForbiddenCancelCopy(available)) pass("규칙 17: 취소 금지 문구 없음");
    else fail("규칙 17: 취소 금지 문구 없음", available);

    const followup = htmlOf(
      React.createElement(CancellationPanel, { uiState: "CANCELED_FOLLOWUP_PENDING" }),
    );
    hasText("규칙 17: 취소 후처리 안내", followup, "일부 후속 처리가 진행 중입니다");
    if (
      followup.includes("내 프로젝트") &&
      !followup.includes("취소에 실패했습니다") &&
      !hasForbiddenCancelCopy(followup)
    ) {
      pass("규칙 17: 후처리는 취소 실패가 아님");
    } else {
      fail("규칙 17: 후처리는 취소 실패가 아님", followup);
    }

    const complete = htmlOf(
      React.createElement(CancellationPanel, { uiState: "CANCELED_COMPLETE" }),
    );
    hasText("규칙 17: 취소 완료 안내", complete, "프로젝트가 취소되었습니다");

    const forbidden = htmlOf(React.createElement(CancellationPanel, { uiState: "FORBIDDEN" }));
    if (!forbidden.includes(MOCK_PROJECT_TITLE) && !forbidden.includes("합의·계약 종료 완료")) {
      pass("규칙 17: 취소 403 제목 숨김");
    } else {
      fail("규칙 17: 취소 403 제목 숨김", forbidden);
    }

    hasText(
      "규칙 17: 합의 취소와 거절 구분",
      htmlOf(React.createElement(AgreementPanel, { uiState: "PROJECT_CANCELED" })),
      "프로젝트가 취소되어 금액 합의가 종료되었습니다",
    );
    hasText(
      "규칙 17: 합의 거절 재개 유지",
      htmlOf(React.createElement(AgreementPanel, { uiState: "REJECTED_REOPENED" })),
      "상대가 제안을 거절했습니다",
    );
  }

  console.log(`PASS ${passCount} / FAIL ${failCount}`);
  if (failCount > 0) process.exitCode = 1;
}

main();
