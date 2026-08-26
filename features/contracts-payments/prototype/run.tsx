import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectTransactionMock } from "./mock/project-transaction.mock";
import {
  CallerGuardError,
  completeProjectTransactionIfSettled,
  markPaymentPendingIfAlive,
  restorePreContractProjectAfterReject,
  startProjectTransactionIfAccepted,
} from "./server/contract-transaction.service";
import {
  DomainContractError,
  isDomainContractError,
  type DomainContractErrorCode,
} from "./server/project-transaction.types";

function ensurePackagesInstalled(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let dir = here;
  while (!existsSync(path.join(dir, "scripts", "ensure-deps.js"))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("scripts/ensure-deps.js를 찾지 못했습니다. 리포 루트 구조를 확인하세요.");
    }
    dir = parent;
  }
  execSync(`node ${JSON.stringify(path.join(dir, "scripts", "ensure-deps.js"))}`, { stdio: "inherit" });
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
        requestId: "req_start_c",
        idempotencyKey: "transaction-start-canceled",
        occurredAt: "2026-08-25T05:01:00Z",
        expectedProjectVersion: 7,
      }),
    );
    await expectCode("규칙 3: 수락 지원 null 409", "PROJECT_TRANSITION_CONFLICT", () =>
      mock.startProjectTransaction("prj_null_accept", {
        requestId: "req_start_null",
        idempotencyKey: "transaction-start-null",
        occurredAt: "2026-08-25T05:01:00Z",
        expectedProjectVersion: 7,
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
        requestId: "req_complete_c",
        idempotencyKey: "transaction-complete-canceled",
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
        requestId: "req_ver",
        idempotencyKey: "transaction-start-ver",
        occurredAt: "2026-08-25T05:01:00Z",
        expectedProjectVersion: 1,
      }),
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

  console.log(`PASS ${passCount} / FAIL ${failCount}`);
  if (failCount > 0) process.exitCode = 1;
}

main();
