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
} from "./index";
import { createPaymentRecordMock } from "./mock/payment-record.mock";
import { MOCK_OFFER_AMOUNT, MOCK_PROJECT_TITLE } from "./mock/public-api.mock";
import {
  createPaymentGatewayMock,
  MOCK_CONFIRMED_AMOUNT,
  MOCK_FAIL_PAYMENT_KEY,
  MOCK_OK_PAYMENT_KEY,
} from "./mock/payment.mock";
import {
  CallerGuardError,
  completeProjectTransactionIfSettled,
  markPaymentPendingIfAlive,
  restorePreContractProjectAfterReject,
  startProjectTransactionIfAccepted,
} from "./server/project-transaction.service";
import { PaymentGatewayError, type PaymentGateway } from "./server/payment.port";
import {
  createTossPaymentsAdapter,
  hasPgSecretKey,
  isPgKeyMissingError,
} from "./server/toss-payments.adapter";

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
        "REQUESTED",
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

  // 규칙 19·21 — 결제 행 FAILED 재시도 (I-17)
  {
    const records = createPaymentRecordMock();
    const prepared = records.preparePayment(MOCK_CONFIRMED_AMOUNT);
    try {
      await records.confirmPayment({
        orderId: prepared.orderId,
        amount: MOCK_CONFIRMED_AMOUNT,
        paymentKey: MOCK_FAIL_PAYMENT_KEY,
      });
      fail("규칙 19: PG 실패 키면 FAILED", "오류가 나지 않았습니다");
    } catch (err) {
      const row = records.getPayment(prepared.paymentId);
      if (
        err instanceof PaymentGatewayError &&
        err.code === "PAYMENT_CONFIRM_FAILED" &&
        row.status === "FAILED" &&
        row.orderId === prepared.orderId
      ) {
        pass("규칙 19: PG 실패 키면 FAILED");
      } else {
        fail("규칙 19: PG 실패 키면 FAILED", { err, row });
      }
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
      !missing.includes("결제하기")
    ) {
      pass("규칙 9: 키 없음 UX 결제하기 숨김");
    } else {
      fail("규칙 9: 키 없음 UX 결제하기 숨김", missing);
    }
  }

  // 규칙 17 — 합의·서명·결제 패널 필수 요소. 앱 셸 없이 상태 분기만.
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

    const create = htmlOf(React.createElement(AgreementPanel));
    hasText("규칙 17: 합의 필수 금액", create, "금액");
    hasText("규칙 17: 합의 필수 제안하기", create, "제안하기");
    hasText("규칙 17: 합의 로딩", htmlOf(React.createElement(AgreementPanel, { view: "loading" })), "불러오는 중");
    const loadFailed = htmlOf(React.createElement(AgreementPanel, { view: "loadFailed" }));
    hasText("규칙 17: 합의 LOAD_FAILED", loadFailed, "불러오지 못했습니다");
    hasText("규칙 17: 합의 LOAD_FAILED 재시도", loadFailed, "다시 시도");
    hasText(
      "규칙 17: 합의 409 재조회",
      htmlOf(React.createElement(AgreementPanel, { view: "stale" })),
      "다시 불러오기",
    );
    const canceled = htmlOf(React.createElement(AgreementPanel, { view: "canceled" }));
    hasText("규칙 17: 합의 취소 안내", canceled, "프로젝트가 취소되었습니다");
    if (!canceled.includes("제안하기") && !canceled.includes("수락하기") && !canceled.includes("거절하기")) {
      pass("규칙 17: 합의 취소 후 변경 숨김");
    } else {
      fail("규칙 17: 합의 취소 후 변경 숨김", canceled);
    }
    const respond = htmlOf(React.createElement(AgreementPanel, { view: "respond" }));
    hasText("규칙 17: 합의 수락하기", respond, "수락하기");
    hasText("규칙 17: 합의 거절하기", respond, "거절하기");

    const sign = htmlOf(React.createElement(ContractSignPanel));
    hasText("규칙 17: 서명 프로젝트 제목", sign, "프로젝트 제목");
    hasText("규칙 17: 서명 합의 금액", sign, "합의 금액");
    hasText("규칙 17: 서명하기", sign, "서명하기");
    const signFailed = htmlOf(React.createElement(ContractSignPanel, { view: "loadFailed" }));
    hasText("규칙 17: 서명 LOAD_FAILED", signFailed, "불러오지 못했습니다");
    hasText("규칙 17: 서명 LOAD_FAILED 재시도", signFailed, "다시 시도");
    const signCanceled = htmlOf(React.createElement(ContractSignPanel, { view: "canceled" }));
    hasText("규칙 17: 서명 취소 안내", signCanceled, "프로젝트가 취소되었습니다");
    if (!signCanceled.includes("서명하기")) {
      pass("규칙 17: 서명 취소 후 서명하기 숨김");
    } else {
      fail("규칙 17: 서명 취소 후 서명하기 숨김", signCanceled);
    }

    const checkout = htmlOf(React.createElement(PaymentPanel));
    hasText("규칙 17: 결제 금액", checkout, "결제 금액");
    hasText("규칙 17: 결제 플랫폼 수수료", checkout, "플랫폼 수수료");
    hasText("규칙 17: 결제 정산액", checkout, "정산액");
    hasText("규칙 17: 결제하기", checkout, "결제하기");
    hasText("규칙 17: 결제 보관 안내", checkout, "결제해도 바로 넘어가지 않습니다");
    const payFailed = htmlOf(React.createElement(PaymentPanel, { view: "failed" }));
    hasText("규칙 17: 결제 실패", payFailed, "결제 실패");
    hasText("규칙 17: 결제 다시 결제", payFailed, "다시 결제");

    const allHtml = [create, canceled, respond, sign, signFailed, signCanceled, checkout, payFailed].join("\n");
    if (!/#[0-9A-Fa-f]{6}/.test(allHtml)) {
      pass("규칙 17: 화면에 원시 색상값 없음");
    } else {
      fail("규칙 17: 화면에 원시 색상값 없음", allHtml);
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
  }

  // 규칙 16 — 공개 POST /payments · /payments/confirm (파사드)
  {
    const api = createPublicApiMock();
    const prepared = await api.preparePayment("prj_alive", MOCK_CLIENT_USER_ID);
    if (
      prepared.paymentId === MOCK_PAYMENT_ID &&
      prepared.orderId &&
      prepared.amount === MOCK_CONFIRMED_AMOUNT &&
      prepared.clientKey
    ) {
      pass("규칙 16: POST payments 준비 당사자 200");
    } else {
      fail("규칙 16: POST payments 준비 당사자 200", prepared);
    }
    const paid = await api.confirmPayment(MOCK_CLIENT_USER_ID, {
      orderId: prepared.orderId,
      amount: prepared.amount,
      paymentKey: MOCK_OK_PAYMENT_KEY,
    });
    const row = await api.getPayment(prepared.paymentId, MOCK_CLIENT_USER_ID);
    if (paid.status === "PAID" && row.status === "PAID" && row.orderId === prepared.orderId) {
      pass("규칙 16: POST payments/confirm 당사자 PAID");
    } else {
      fail("규칙 16: POST payments/confirm 당사자 PAID", { paid, row });
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
      "불러오는 중",
    );
    hasText(
      "규칙 22: LOAD_FAILED 재시도",
      htmlOf(React.createElement(AgreementPanel, { view: "loadFailed" })),
      "다시 시도",
    );
    hasText(
      "규칙 22: 409 재조회",
      htmlOf(React.createElement(AgreementPanel, { view: "stale" })),
      "다시 불러오기",
    );
    const canceled = htmlOf(React.createElement(AgreementPanel, { view: "canceled" }));
    if (canceled.includes("프로젝트가 취소되었습니다") && !canceled.includes("제안하기")) {
      pass("규칙 22: 취소 후 변경 숨김");
    } else {
      fail("규칙 22: 취소 후 변경 숨김", canceled);
    }
    hasText("규칙 17: 결제 필수 결제 금액", htmlOf(React.createElement(PaymentPanel)), "결제 금액");
    hasText("규칙 17: 결제 필수 결제하기", htmlOf(React.createElement(PaymentPanel)), "결제하기");
  }

  console.log(`PASS ${passCount} / FAIL ${failCount}`);
  if (failCount > 0) process.exitCode = 1;
}

main();
