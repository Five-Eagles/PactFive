import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// features/project-management/prototype/의 로컬 실행 스크립트.
// 실행: npx tsx prototype/run.tsx
//
// 검증 대상은 두 가지다.
//   1) Mock이 spec.md 규칙대로 동작하는가
//   2) prototype/web/의 컴포넌트가 design/*.html의 "필수 요소 목록"을 전부 렌더링하는가
//
// server/는 실제 DB가 없어 검증 대상이 아니다 — 구현 초안일 뿐이다.
//
// 주의: 이 파일 안에서는 JSX 문법을 쓰지 않는다. JSX를 쓰면 컴파일러가 파일 맨 위에
// react/jsx-runtime import를 자동으로 끼워 넣어 아래 설치 확인보다 먼저 해석된다.
// 대신 React.createElement를 직접 쓴다.
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
  execSync(`node ${JSON.stringify(path.join(dir, "scripts", "ensure-deps.js"))}`, {
    stdio: "inherit",
  });
}

/* ─────────────── 결과 집계 ─────────────── */

let passCount = 0;
let failCount = 0;

function check(condition: boolean, label: string): boolean {
  if (condition) {
    passCount += 1;
    console.log("[PASS]", label);
  } else {
    failCount += 1;
    console.error("[FAIL]", label);
  }
  return condition;
}

function section(title: string): void {
  console.log("");
  console.log(`--- ${title} ---`);
}

async function main() {
  ensurePackagesInstalled();

  const { ALL_SEEDS, SHARED_SEEDS, OWN_SEEDS, cloneSeeds } = await import("./mock/seeds");
  const { createProjectRepositoryMock, createFixedClock, isOfficialSkill, isValidCategory } =
    await import("./mock/project.mock");
  const { createExternalMocks, createMockTransaction } = await import("./mock/external.mock");

  console.log("=== project-management prototype 로컬 실행 ===");

  /* ═══════════ 1. 시드 ═══════════ */
  section("시드");

  check(SHARED_SEEDS.length === 10, "시드: contracts-payments 공유 10종");
  check(OWN_SEEDS.length === 8, "시드: project-management 전용 8종");
  check(
    new Set(ALL_SEEDS.map((p) => p.projectId)).size === ALL_SEEDS.length,
    "시드: projectId 중복 없음",
  );

  // 조준영 Mock과 id·상태·버전을 맞춘 것이 이 목록이다. 한쪽만 바뀌면 여기서 걸린다.
  const expectedShared = [
    "prj_alive",
    "prj_seq",
    "prj_restore",
    "prj_deleted",
    "prj_canceled",
    "prj_null_accept",
    "prj_in_progress",
    "prj_completed",
    "prj_deadline",
    "prj_pending_apps",
  ];
  check(
    expectedShared.every((id) => SHARED_SEEDS.some((p) => p.projectId === id)),
    "시드: 공유 시드 id 10종 일치",
  );

  // I-04 — 거래가 시작된 프로젝트는 모집이 닫혀 있어야 한다.
  check(
    ALL_SEEDS.every((p) => p.transactionStatus === "NONE" || p.recruitmentStatus === "CLOSED"),
    "시드: 불변식 I-04 (거래 진행 중이면 모집 CLOSED)",
  );

  // 시드가 서로 오염되지 않는지 — 한 배열을 고쳐도 다음 호출에 영향이 없어야 한다.
  const first = cloneSeeds();
  first[0]!.title = "오염";
  first[0]!.skillIds.push("OOPS");
  const second = cloneSeeds();
  check(second[0]!.title !== "오염", "시드: cloneSeeds가 매번 새 객체를 준다");
  check(!second[0]!.skillIds.includes("OOPS"), "시드: skillIds 배열도 복사된다");

  /* ═══════════ 2. 저장소 Mock ═══════════ */
  section("저장소 Mock");

  const clock = createFixedClock("2026-08-26T09:00:00Z");
  const repo = createProjectRepositoryMock(clock);

  check(repo.findById("prj_alive") !== null, "저장소: 살아 있는 프로젝트 조회");
  check(repo.findById("prj_deleted") === null, "저장소: 삭제된 프로젝트는 조회 제외 (규칙 11)");
  check(
    repo.findByIdIncludingDeleted("prj_deleted") !== null,
    "저장소: 삭제 판정용 조회는 삭제된 것도 준다",
  );
  check(repo.findById("prj_no_such_id") === null, "저장소: 없는 id는 null");
  check(repo.findAll().length === ALL_SEEDS.length - 1, "저장소: 전체 조회에서 삭제분 1건 제외");
  check(
    repo.findByClientId("usr_client_b").every((p) => p.clientId === "usr_client_b"),
    "저장소: 클라이언트별 조회",
  );

  const updated = repo.update("prj_alive", { projectVersion: 8 });
  check(updated.projectVersion === 8, "저장소: 부분 갱신 반영");
  check(updated.updatedAt === "2026-08-26T09:00:00Z", "저장소: updatedAt 자동 기록");
  check(repo.findById("prj_alive")!.projectVersion === 8, "저장소: 갱신이 저장소에 반영됨");

  // 저장소를 새로 만들면 앞선 갱신이 남아 있지 않아야 한다.
  const freshRepo = createProjectRepositoryMock(clock);
  check(
    freshRepo.findById("prj_alive")!.projectVersion === 7,
    "저장소: 새로 만들면 시드 상태로 돌아온다",
  );

  check(repo.findProcessed("key-1") === null, "멱등: 처음 보는 키는 null");
  repo.markProcessed("key-1", { ok: true }, 8);
  check(repo.findProcessed("key-1")?.projectVersion === 8, "멱등: 기록한 결과를 다시 준다");

  /* ═══════════ 3. 참조 데이터 ═══════════ */
  section("참조 데이터");

  check(isValidCategory("WEB_DEVELOPMENT"), "카테고리: 공식 카테고리 통과");
  check(!isValidCategory("UNKNOWN_CATEGORY"), "카테고리: 목록 밖은 거부");
  check(isOfficialSkill("REACT"), "기술: 공식 기술 통과");
  check(!isOfficialSkill("MY_OWN_STACK"), "기술: 커스텀 기술은 거부 (규칙 5)");

  /* ═══════════ 4. 다른 도메인 Mock ═══════════ */
  section("다른 도메인 Mock");

  const ext = createExternalMocks();

  const rejected = await ext.applications.rejectPendingApplications("prj_open_locked", {
    closureEventId: "evt_1",
    reason: "RECRUITMENT_CLOSED",
    occurredAt: "2026-08-26T09:00:00Z",
  });
  check(
    rejected.rejectedCount === 3 && rejected.result === "DONE",
    "applications: 대기 지원 3건 거절",
  );
  check(ext.calls.rejectPendingApplications.length === 1, "applications: 호출 기록 남음");

  const rejectedAgain = await ext.applications.rejectPendingApplications("prj_open_locked", {
    closureEventId: "evt_1",
    reason: "RECRUITMENT_CLOSED",
    occurredAt: "2026-08-26T09:00:00Z",
  });
  check(rejectedAgain.alreadyProcessed, "applications: 같은 사건 id 재호출은 멱등");

  const nothingToDo = await ext.applications.rejectPendingApplications("prj_open_free", {
    closureEventId: "evt_2",
    reason: "RECRUITMENT_CLOSED",
    occurredAt: "2026-08-26T09:00:00Z",
  });
  check(nothingToDo.result === "NOT_NEEDED", "applications: 대기 지원 0건이면 NOT_NEEDED");

  ext.failNext.rejectPendingApplications = true;
  const failed = await ext.applications.rejectPendingApplications("prj_open_locked", {
    closureEventId: "evt_3",
    reason: "PROJECT_CANCELED",
    occurredAt: "2026-08-26T09:00:00Z",
  });
  check(failed.result === "FAILED", "applications: 실패 주입이 동작한다 (규칙 23 검증용)");

  const invalidated = await ext.contracts.invalidateAgreementAndContract("prj_paying", {
    cancellationId: "cxl_1",
    actorUserId: "usr_client_a",
    reason: "PROJECT_CANCELED",
    projectCanceledAt: "2026-08-26T09:00:00Z",
  });
  check(invalidated.result === "DONE", "contracts: 합의·계약 무효화");

  const tx = createMockTransaction();
  const claimed = await ext.pricing.claimPricingAnalysisForCreatedProject(tx, {
    analysisId: "ana_valid",
    projectId: "prj_new",
    requesterId: "usr_client_a",
  });
  check(
    claimed.recommendedAmount === 4_800_000,
    "ai-pricing: DB에 저장된 추천 금액을 준다 (규칙 8)",
  );

  let claimRejected = false;
  try {
    await ext.pricing.claimPricingAnalysisForCreatedProject(tx, {
      analysisId: "ana_other_owner",
      projectId: "prj_new",
      requesterId: "usr_client_a",
    });
  } catch {
    claimRejected = true;
  }
  check(claimRejected, "ai-pricing: 남의 분석은 갱신 대상 0건으로 실패 (규칙 53)");

  const complete = await ext.profile.getProfileCompletion("usr_client_a");
  check(complete.status === "COMPLETE", "profile: 완성된 프로필");
  const incomplete = await ext.profile.getProfileCompletion("usr_incomplete");
  check(
    incomplete.status === "INCOMPLETE" && incomplete.missingFields.length > 0,
    "profile: 미완성 프로필은 빈 항목을 알려준다 (규칙 7)",
  );

  /* ═══════════ 5. 계약 함수 ═══════════ */

  const { createProjectContractService } = await import("./server/project-contract.service");
  const { isProjectContractError } = await import("./server/project.types");
  const { IDEMPOTENCY_KEY } = await import("./server/ports/project-transaction.port");

  const AT = "2026-08-26T09:00:00Z";

  /** 매번 새 저장소·새 외부 Mock 위에서 계약 서비스를 만든다 */
  function newService() {
    const r = createProjectRepositoryMock(createFixedClock(AT));
    const e = createExternalMocks();
    const svc = createProjectContractService({ repo: r, ports: e, now: () => AT });
    return { svc, repo: r, ext: e };
  }

  /** 기대한 상태 코드·오류 코드로 거절되는지 본다 */
  async function expectError(
    label: string,
    status: number,
    code: string,
    fn: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await fn();
      check(false, `${label} — 거절되지 않고 통과했습니다`);
    } catch (err) {
      if (!isProjectContractError(err)) {
        check(false, `${label} — 계약 오류가 아닌 예외: ${(err as Error).message}`);
        return;
      }
      check(
        err.status === status && err.body.error.code === code,
        `${label} → ${err.status} ${err.body.error.code}`,
      );
    }
  }

  const envelope = (key: string) => ({ requestId: "req_1", idempotencyKey: key, occurredAt: AT });

  /* --- 5-1. getProjectNegotiationContext (규칙 42) --- */
  section("계약 — getProjectNegotiationContext");
  {
    const { svc } = newService();
    const ctx = await svc.getProjectNegotiationContext("prj_alive");
    check(ctx.transactionStatus === "CONTRACT_PENDING", "공개 상세에 없는 거래 상태를 포함한다");
    check(ctx.acceptedApplicationId === "app_123", "수락된 지원서 id 를 포함한다");
    check(ctx.projectVersion === 7, "현재 버전을 함께 준다");
    await expectError("삭제된 프로젝트", 404, "PROJECT_NOT_FOUND", () =>
      svc.getProjectNegotiationContext("prj_deleted"),
    );
  }

  /* --- 5-2. acceptProjectApplication (규칙 36·55) --- */
  section("계약 — acceptProjectApplication");
  {
    const { svc, repo: r } = newService();
    const key = IDEMPOTENCY_KEY.acceptApplication("app_new");
    const res = await svc.acceptProjectApplication("prj_open_free", {
      ...envelope(key),
      applicationId: "app_new",
      actorUserId: "usr_client_a",
    });
    check(res.recruitmentStatus === "CLOSED", "수락하면 모집이 CLOSED 로 간다");
    check(res.transactionStatus === "CONTRACT_PENDING", "거래가 CONTRACT_PENDING 으로 간다");
    check(res.projectVersion === 2 && res.changed, "상태가 바뀌었으므로 버전 +1 (규칙 44)");
    check(r.findById("prj_open_free")!.recruitmentClosedAt === AT, "마감 시각이 기록된다");

    const again = await svc.acceptProjectApplication("prj_open_free", {
      ...envelope(key),
      applicationId: "app_new",
      actorUserId: "usr_client_a",
    });
    check(
      again.alreadyProcessed && !again.changed && again.projectVersion === 2,
      "같은 지원서 재호출은 성공 처리, 버전 그대로 (규칙 36)",
    );

    // 규칙 55 — 상태 조건을 먼저 봤다면 여기서 "모집이 OPEN 이 아님" 409 가 나갔을 것이다.
    check(
      again.acceptedApplicationId === "app_new",
      "규칙 55: 같은 지원서 판정이 상태 조건보다 먼저다",
    );

    await expectError("다른 지원서로 수락 시도", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      svc.acceptProjectApplication("prj_open_free", {
        ...envelope(IDEMPOTENCY_KEY.acceptApplication("app_other")),
        applicationId: "app_other",
        actorUserId: "usr_client_a",
      }),
    );
  }
  {
    const { svc } = newService();
    await expectError("이미 마감된 프로젝트", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      svc.acceptProjectApplication("prj_closed", {
        ...envelope(IDEMPOTENCY_KEY.acceptApplication("app_x")),
        applicationId: "app_x",
        actorUserId: "usr_client_a",
      }),
    );
    await expectError("applicationId 누락", 422, "VALIDATION_ERROR", () =>
      svc.acceptProjectApplication("prj_open_free", {
        ...envelope("k"),
        applicationId: "",
        actorUserId: "usr_client_a",
      }),
    );
  }

  /* --- 5-3. markPaymentPending (규칙 41) --- */
  section("계약 — markPaymentPending");
  {
    const { svc, repo: r } = newService();
    const key = IDEMPOTENCY_KEY.markPaymentPending("ctr_1");
    const res = await svc.markPaymentPending("prj_alive", {
      ...envelope(key),
      contractId: "ctr_1",
    });
    check(res.paymentPendingAt === AT, "결제 시작 시각이 기록된다");
    check(res.projectVersion === 7, "규칙 41: 상태 축을 안 바꾸므로 버전을 올리지 않는다");
    check(r.findById("prj_alive")!.transactionStatus === "CONTRACT_PENDING", "거래 축 그대로");

    const later = createProjectContractService({
      repo: r,
      ports: createExternalMocks(),
      now: () => "2026-08-27T00:00:00Z",
    });
    const second = await later.markPaymentPending("prj_alive", {
      ...envelope(IDEMPOTENCY_KEY.markPaymentPending("ctr_2")),
      contractId: "ctr_2",
    });
    check(
      second.paymentPendingAt === AT && !second.changed,
      "재호출해도 최초 시각을 유지한다 (취소 차단 경계가 밀리지 않음)",
    );

    await expectError("contractId 누락", 422, "VALIDATION_ERROR", () =>
      svc.markPaymentPending("prj_alive", { ...envelope("k2"), contractId: "" }),
    );
    await expectError("취소된 프로젝트", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      svc.markPaymentPending("prj_canceled", {
        ...envelope(IDEMPOTENCY_KEY.markPaymentPending("ctr_3")),
        contractId: "ctr_3",
      }),
    );
  }

  /* --- 5-4. startProjectTransaction (규칙 37·51) --- */
  section("계약 — startProjectTransaction");
  {
    const { svc, repo: r } = newService();
    const res = await svc.startProjectTransaction("prj_alive", {
      ...envelope(IDEMPOTENCY_KEY.startTransaction("ctr_1")),
      contractId: "ctr_1",
      expectedProjectVersion: 7,
    });
    check(res.transactionStatus === "IN_PROGRESS", "CONTRACT_PENDING → IN_PROGRESS");
    check(res.projectVersion === 8, "버전 +1");
    check(r.findById("prj_alive")!.recruitmentStatus === "CLOSED", "불변식 I-04 유지");
  }
  {
    const { svc } = newService();
    await expectError("기대 버전 누락", 422, "VALIDATION_ERROR", () =>
      svc.startProjectTransaction("prj_alive", {
        ...envelope(IDEMPOTENCY_KEY.startTransaction("ctr_9")),
        contractId: "ctr_9",
      } as never),
    );
    await expectError("기대 버전 불일치", 409, "PROJECT_VERSION_CONFLICT", () =>
      svc.startProjectTransaction("prj_alive", {
        ...envelope(IDEMPOTENCY_KEY.startTransaction("ctr_8")),
        contractId: "ctr_8",
        expectedProjectVersion: 3,
      }),
    );
    await expectError("수락된 지원서 없음", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      svc.startProjectTransaction("prj_null_accept", {
        ...envelope(IDEMPOTENCY_KEY.startTransaction("ctr_7")),
        contractId: "ctr_7",
        expectedProjectVersion: 7,
      }),
    );
    await expectError("취소된 프로젝트", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      svc.startProjectTransaction("prj_canceled", {
        ...envelope(IDEMPOTENCY_KEY.startTransaction("ctr_6")),
        contractId: "ctr_6",
        expectedProjectVersion: 6,
      }),
    );
  }
  {
    const { svc } = newService();
    const idem = await svc.startProjectTransaction("prj_in_progress", {
      ...envelope(IDEMPOTENCY_KEY.startTransaction("ctr_5")),
      contractId: "ctr_5",
      expectedProjectVersion: 8,
    });
    check(
      idem.alreadyProcessed && !idem.changed && idem.projectVersion === 8,
      "이미 IN_PROGRESS 면 멱등 성공, 버전 그대로",
    );
  }

  /* --- 5-5. completeProjectTransaction (규칙 38) --- */
  section("계약 — completeProjectTransaction");
  {
    const { svc } = newService();
    const res = await svc.completeProjectTransaction("prj_in_progress", {
      ...envelope(IDEMPOTENCY_KEY.completeTransaction("ctr_1")),
      contractId: "ctr_1",
      expectedProjectVersion: 8,
    });
    check(res.transactionStatus === "COMPLETED", "IN_PROGRESS → COMPLETED");
    check(res.projectVersion === 9, "버전 +1");

    const idem = await svc.completeProjectTransaction("prj_completed", {
      ...envelope(IDEMPOTENCY_KEY.completeTransaction("ctr_2")),
      contractId: "ctr_2",
      expectedProjectVersion: 9,
    });
    check(idem.alreadyProcessed && !idem.changed, "이미 COMPLETED 면 멱등 성공");

    await expectError("계약 대기 상태에서 완료 시도", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      svc.completeProjectTransaction("prj_alive", {
        ...envelope(IDEMPOTENCY_KEY.completeTransaction("ctr_3")),
        contractId: "ctr_3",
        expectedProjectVersion: 7,
      }),
    );
    await expectError("취소된 프로젝트", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      svc.completeProjectTransaction("prj_canceled", {
        ...envelope(IDEMPOTENCY_KEY.completeTransaction("ctr_4")),
        contractId: "ctr_4",
        expectedProjectVersion: 6,
      }),
    );
  }

  /* --- 5-6. restorePreContractProject (규칙 39·50) --- */
  section("계약 — restorePreContractProject");
  {
    const { svc, repo: r } = newService();
    const res = await svc.restorePreContractProject("prj_restore", {
      ...envelope(IDEMPOTENCY_KEY.restorePreContract("ngt_1")),
      negotiationId: "ngt_1",
      reason: "FREELANCER_REJECTED",
    });
    check(res.reopened && res.notReopenedReason === null, "마감 남고 대기 0 이면 재개된다");
    check(res.recruitmentStatus === "OPEN" && res.transactionStatus === "NONE", "OPEN + NONE");
    const after = r.findById("prj_restore")!;
    check(after.acceptedApplicationId === null, "수락 지원서를 비운다 (규칙 47 · CR-0002)");
    check(after.recruitmentStartAt === null, "recruitmentStartAt 은 건드리지 않는다");

    const again = await svc.restorePreContractProject("prj_restore", {
      ...envelope(IDEMPOTENCY_KEY.restorePreContract("ngt_1")),
      negotiationId: "ngt_1",
      reason: "FREELANCER_REJECTED",
    });
    check(again.alreadyProcessed, "같은 협상 재호출은 멱등");

    await expectError("다른 협상으로 복원 시도", 409, "PROJECT_ALREADY_RESTORED", () =>
      svc.restorePreContractProject("prj_restore", {
        ...envelope(IDEMPOTENCY_KEY.restorePreContract("ngt_2")),
        negotiationId: "ngt_2",
        reason: "CLIENT_REJECTED",
      }),
    );
  }
  {
    const { svc } = newService();
    const past = await svc.restorePreContractProject("prj_deadline", {
      ...envelope(IDEMPOTENCY_KEY.restorePreContract("ngt_3")),
      negotiationId: "ngt_3",
      reason: "FREELANCER_REJECTED",
    });
    check(
      !past.reopened && past.notReopenedReason === "DEADLINE_PASSED",
      "마감일이 지났으면 사유 DEADLINE_PASSED (규칙 50)",
    );
    check(past.transactionStatus === "NONE", "재개는 못 해도 거래 축은 NONE 으로 간다");

    const pend = await svc.restorePreContractProject("prj_pending_apps", {
      ...envelope(IDEMPOTENCY_KEY.restorePreContract("ngt_4")),
      negotiationId: "ngt_4",
      reason: "FREELANCER_REJECTED",
    });
    check(
      !pend.reopened && pend.notReopenedReason === "PENDING_APPLICATIONS_REMAIN",
      "대기 지원이 남으면 사유 PENDING_APPLICATIONS_REMAIN",
    );
    check(pend.recruitmentStatus === "CLOSED", "이 경우 모집은 CLOSED 를 유지한다");

    // 규칙 31 — CANCELED 는 다른 거래 상태로 되돌아가지 않는다.
    // start·complete 는 위에서 봤고, 복원도 막혀야 한다.
    await expectError("취소된 프로젝트 복원", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      svc.restorePreContractProject("prj_canceled", {
        ...envelope(IDEMPOTENCY_KEY.restorePreContract("ngt_5")),
        negotiationId: "ngt_5",
        reason: "CLIENT_REJECTED",
      }),
    );
  }

  /* --- 5-7. applyPricingAnalysisBudget (규칙 40) --- */
  section("계약 — applyPricingAnalysisBudget");
  {
    const { svc, repo: r, ext: e } = newService();
    const before = r.findById("prj_open_free")!.budgetAmount;
    const res = await svc.applyPricingAnalysisBudget("prj_open_free", {
      ...envelope(IDEMPOTENCY_KEY.applyPricingBudget("ana_valid")),
      pricingAnalysisId: "ana_valid",
      actorUserId: "usr_client_a",
    });
    check(res.budgetAmount === 4_800_000, "분석에 저장된 추천 금액을 쓴다 (규칙 40)");
    check(res.budgetAmount !== before && res.changed, "예산이 실제로 바뀌었다");
    check(res.projectVersion === 1, "상태 축이 아니므로 버전을 올리지 않는다 (규칙 44)");
    check(
      e.calls.getPricingAnalysisRecommendation.length === 1,
      "ai-pricing 을 실제로 호출한다",
    );

    await expectError("남의 프로젝트", 403, "PROJECT_FORBIDDEN", () =>
      svc.applyPricingAnalysisBudget("prj_other_client", {
        ...envelope(IDEMPOTENCY_KEY.applyPricingBudget("ana_a")),
        pricingAnalysisId: "ana_valid",
        actorUserId: "usr_client_a",
      }),
    );
    await expectError("대기 지원 있음", 409, "PROJECT_EDIT_LOCKED", () =>
      svc.applyPricingAnalysisBudget("prj_open_locked", {
        ...envelope(IDEMPOTENCY_KEY.applyPricingBudget("ana_b")),
        pricingAnalysisId: "ana_valid",
        actorUserId: "usr_client_a",
      }),
    );
    await expectError("남의 분석", 409, "PRICING_ANALYSIS_NOT_APPLICABLE", () =>
      svc.applyPricingAnalysisBudget("prj_open_free", {
        ...envelope(IDEMPOTENCY_KEY.applyPricingBudget("ana_other_owner")),
        pricingAnalysisId: "ana_other_owner",
        actorUserId: "usr_client_a",
      }),
    );
  }

  /* --- 5-8. 불변식 (규칙 46~48) --- */
  section("계약 — 불변식");
  {
    const { svc, repo: r } = newService();
    await svc.acceptProjectApplication("prj_open_free", {
      ...envelope(IDEMPOTENCY_KEY.acceptApplication("app_i")),
      applicationId: "app_i",
      actorUserId: "usr_client_a",
    });
    await svc.startProjectTransaction("prj_alive", {
      ...envelope(IDEMPOTENCY_KEY.startTransaction("ctr_i")),
      contractId: "ctr_i",
      expectedProjectVersion: 7,
    });
    check(
      r.findAll().every((p) => p.transactionStatus === "NONE" || p.recruitmentStatus === "CLOSED"),
      "규칙 46: 거래 ≠ NONE 이면 모집은 CLOSED",
    );
    check(
      r.findById("prj_open_free")!.acceptedApplicationId === "app_i",
      "규칙 47: 수락된 지원서는 한 칸뿐이라 두 건이 들어갈 수 없다",
    );
    check(
      r.findAll().every((p) => p.skillIds.length >= 1),
      "규칙 48: 요구 기술 최소 1개",
    );
  }
  {
    // 복원 뒤에 다시 수락할 수 있어야 한다.
    // 수락 지원서를 안 비우면 규칙 47 에 걸려 이 프로젝트는 영영 계약할 수 없게 된다.
    const { svc } = newService();
    await svc.restorePreContractProject("prj_restore", {
      ...envelope(IDEMPOTENCY_KEY.restorePreContract("ngt_9")),
      negotiationId: "ngt_9",
      reason: "FREELANCER_REJECTED",
    });
    const re = await svc.acceptProjectApplication("prj_restore", {
      ...envelope(IDEMPOTENCY_KEY.acceptApplication("app_z")),
      applicationId: "app_z",
      actorUserId: "usr_client_a",
    });
    check(
      re.acceptedApplicationId === "app_z" && re.changed,
      "복원된 프로젝트는 새 지원자를 다시 수락할 수 있다 (CR-0002 근거)",
    );
  }

  /* ═══════════ 6. 공개 API 9종 ═══════════ */

  const { createProjectService } = await import("./server/project.service");
  type ClientDetail = import("./server/project.types").ClientProjectDetail;

  const CLIENT_A = { userId: "usr_client_a", role: "CLIENT" as const };
  const CLIENT_B = { userId: "usr_client_b", role: "CLIENT" as const };
  const FREELANCER = { userId: "usr_free_1", role: "FREELANCER" as const };
  const INCOMPLETE = { userId: "usr_incomplete", role: "CLIENT" as const };

  let seq = 0;
  function newApi() {
    const r = createProjectRepositoryMock(createFixedClock(AT));
    const e = createExternalMocks();
    const api = createProjectService({
      repo: r,
      ports: e,
      now: () => AT,
      newProjectId: () => `prj_new_${++seq}`,
    });
    return { api, repo: r, ext: e };
  }

  const TX = createMockTransaction();
  const validCreate = {
    title: "쇼핑몰 웹사이트 구축",
    description:
      "자사 브랜드 온라인 스토어를 새로 만들려고 합니다. 상품 등록과 결제 연동이 필요합니다.",
    category: "WEB_DEVELOPMENT",
    recruitmentStartAt: null,
    recruitmentDeadlineAt: "2026-09-16T14:59:59Z",
    budgetAmount: 5_000_000,
    skillIds: ["REACT", "NODEJS"],
  };

  /* --- 6-1. 등록 (규칙 2~8) --- */
  section("공개 API — 등록");
  {
    const { api, repo: r } = newApi();
    const res = await api.createProject(CLIENT_A, validCreate, TX);
    check(res.status === 201, "등록 성공 201");
    check(res.body.recruitmentStatus === "OPEN", "시작 시각이 없으면 즉시 모집 (규칙 4)");
    check(res.body.transactionStatus === "NONE", "거래는 NONE 으로 시작");
    check(res.body.projectVersion === 1, "버전 1 로 시작");
    check(r.findById(res.body.projectId) !== null, "저장소에 실제로 들어갔다");
    check(
      res.body.category.displayName === "웹 개발" && res.body.skills[0]!.displayName === "React",
      "카테고리·기술이 사람이 읽는 이름으로 나간다",
    );

    const later = await api.createProject(
      CLIENT_A,
      { ...validCreate, recruitmentStartAt: "2026-09-01T00:00:00Z" },
      TX,
    );
    check(later.body.recruitmentStatus === "SCHEDULED", "시작 시각이 미래면 SCHEDULED (규칙 4)");
  }
  {
    const { api } = newApi();
    await expectError("비로그인 등록", 401, "AUTH_REQUIRED", () =>
      api.createProject(null, validCreate, TX),
    );
    await expectError("프리랜서 등록", 403, "PROJECT_CREATE_ROLE_REQUIRED", () =>
      api.createProject(FREELANCER, validCreate, TX),
    );
    await expectError("프로필 미완성", 403, "PROJECT_PROFILE_REQUIRED", () =>
      api.createProject(INCOMPLETE, validCreate, TX),
    );
    await expectError("제목 4자", 422, "VALIDATION_ERROR", () =>
      api.createProject(CLIENT_A, { ...validCreate, title: "네글자" }, TX),
    );
    await expectError("설명 19자", 422, "VALIDATION_ERROR", () =>
      api.createProject(CLIENT_A, { ...validCreate, description: "가".repeat(19) }, TX),
    );
    await expectError("없는 카테고리", 422, "INVALID_CATEGORY", () =>
      api.createProject(CLIENT_A, { ...validCreate, category: "COOKING" }, TX),
    );
    await expectError("예산 0", 422, "BUDGET_MUST_BE_POSITIVE", () =>
      api.createProject(CLIENT_A, { ...validCreate, budgetAmount: 0 }, TX),
    );
    await expectError("기술 0개", 422, "SKILL_REQUIRED", () =>
      api.createProject(CLIENT_A, { ...validCreate, skillIds: [] }, TX),
    );
    await expectError("커스텀 기술", 422, "CUSTOM_SKILL_NOT_ALLOWED", () =>
      api.createProject(CLIENT_A, { ...validCreate, skillIds: ["MY_OWN_STACK"] }, TX),
    );
    await expectError("없는 기술", 422, "INVALID_SKILL", () =>
      api.createProject(CLIENT_A, { ...validCreate, skillIds: ["COBOL"] }, TX),
    );
  }
  {
    // 규칙 3 — 세 가지를 다른 코드로 구분한다. 하나로 뭉치면 무엇을 고치라고 안내할 수 없다.
    const { api } = newApi();
    await expectError("마감일 과거", 422, "DEADLINE_MUST_BE_FUTURE", () =>
      api.createProject(
        CLIENT_A,
        { ...validCreate, recruitmentDeadlineAt: "2026-08-01T00:00:00Z" },
        TX,
      ),
    );
    await expectError("마감일 12시간 뒤", 422, "DEADLINE_BELOW_MINIMUM", () =>
      api.createProject(
        CLIENT_A,
        { ...validCreate, recruitmentDeadlineAt: "2026-08-26T21:00:00Z" },
        TX,
      ),
    );
    await expectError("마감일 366일 뒤", 422, "DEADLINE_EXCEEDS_LIMIT", () =>
      api.createProject(
        CLIENT_A,
        { ...validCreate, recruitmentDeadlineAt: "2027-09-01T00:00:00Z" },
        TX,
      ),
    );
  }
  {
    // 규칙 8 — 분석을 연결하면 클라이언트가 보낸 금액을 덮어쓴다.
    const { api, ext: e } = newApi();
    const res = await api.createProject(
      CLIENT_A,
      { ...validCreate, budgetAmount: 9_999_999, pricingAnalysisId: "ana_valid" },
      TX,
    );
    check(res.body.budgetAmount === 4_800_000, "분석 추천 금액으로 덮어쓴다 (규칙 8)");
    check(e.calls.claimPricingAnalysis.length === 1, "등록 트랜잭션 안에서 연결을 호출한다");
    check(
      e.calls.claimPricingAnalysis[0]!.projectId === res.body.projectId,
      "프로젝트를 먼저 만든 뒤 연결한다 (FK 순서)",
    );
  }
  {
    const { api, repo: r } = newApi();
    const before = r.findAll().length;
    await expectError("남의 분석 연결", 409, "PRICING_ANALYSIS_NOT_APPLICABLE", () =>
      api.createProject(CLIENT_A, { ...validCreate, pricingAnalysisId: "ana_other_owner" }, TX),
    );
    check(r.findAll().length === before, "연결 실패면 프로젝트 생성까지 되돌린다 (규칙 8)");
  }

  /* --- 6-2. 목록 · 검색 (규칙 9~12·14) --- */
  section("공개 API — 목록 · 검색");
  {
    const { api } = newApi();
    const all = api.listProjects({});
    check(
      all.body.items.every((i) => !("transactionStatus" in i)),
      "규칙 9: 목록에 거래 상태 키 자체가 없다",
    );
    check(
      all.body.items.every((i) => i.recruitmentStatus !== "CLOSED"),
      "규칙 10: 마감된 것은 기본으로 빠진다",
    );
    check(
      !all.body.items.some((i) => i.projectId === "prj_deleted"),
      "규칙 11: 삭제된 것은 어떤 조건으로도 안 나온다",
    );

    const closed = api.listProjects({ recruitmentStatus: "CLOSED" });
    check(closed.body.items.length > 0, "명시하면 마감된 것도 나온다");
    check(
      !closed.body.items.some((i) => i.projectId === "prj_deleted"),
      "명시해도 삭제된 것은 안 나온다",
    );

    const paged = api.listProjects({ page: 1, pageSize: 2 });
    check(paged.body.items.length === 2 && paged.body.pageSize === 2, "페이지 크기 적용");
    check(paged.body.totalPages === Math.ceil(paged.body.totalCount / 2), "totalPages 계산");

    const byCategory = api.listProjects({ category: "DESIGN" });
    check(
      byCategory.body.items.length > 0 &&
        byCategory.body.items.every((i) => i.category.category === "DESIGN"),
      "카테고리 필터",
    );
    const bySkill = api.listProjects({ skills: ["FIGMA"] });
    check(
      bySkill.body.items.length > 0 &&
        bySkill.body.items.every((i) => i.skills.some((s) => s.skillId === "FIGMA")),
      "기술 필터",
    );
    const byBudget = api.listProjects({ minBudget: 5_000_000 });
    check(byBudget.body.items.every((i) => i.budgetAmount >= 5_000_000), "예산 하한 필터");

    const sorted = api.listProjects({ sortBy: "budget", sortOrder: "asc" });
    const amounts = sorted.body.items.map((i) => i.budgetAmount);
    check(
      amounts.every((v, idx) => idx === 0 || amounts[idx - 1]! <= v),
      "예산 오름차순 정렬",
    );

    await expectError("page 0", 422, "VALIDATION_ERROR", async () => api.listProjects({ page: 0 }));
    await expectError("pageSize 51", 422, "VALIDATION_ERROR", async () =>
      api.listProjects({ pageSize: 51 }),
    );
    await expectError("없는 카테고리", 422, "INVALID_CATEGORY", async () =>
      api.listProjects({ category: "COOKING" }),
    );
  }
  {
    // 규칙 14 — 저장값이 아니라 조회 시점 기준으로 보인다.
    const late = createProjectService({
      repo: createProjectRepositoryMock(createFixedClock(AT)),
      ports: createExternalMocks(),
      now: () => "2026-09-02T00:00:00Z",
      newProjectId: () => "prj_x",
    });
    const scheduled = late.getProject(null, "prj_scheduled");
    check(
      scheduled.body.recruitmentStatus === "OPEN",
      "규칙 14: 시작 시각이 지나면 SCHEDULED 가 OPEN 으로 보인다",
    );
  }

  /* --- 6-3. 상세 (규칙 9·13·15) --- */
  section("공개 API — 상세");
  {
    const { api } = newApi();
    const anon = api.getProject(null, "prj_open_free");
    check(!("transactionStatus" in anon.body), "비로그인: 거래 상태 키 없음 (규칙 9)");
    check(!("editableFields" in anon.body), "비로그인: 잠금 정보 없음");

    const free = api.getProject(FREELANCER, "prj_open_free");
    check("canApply" in free.body, "프리랜서: canApply 포함");
    check(!("transactionStatus" in free.body), "프리랜서: 거래 상태 키 없음");

    const owner = api.getProject(CLIENT_A, "prj_open_free").body as ClientDetail;
    check("transactionStatus" in owner, "등록 의뢰인: 거래 상태 포함");
    check(owner.editableFields.includes("budgetAmount"), "규칙 13: 지원 0건이면 예산 수정 가능");

    const locked = api.getProject(CLIENT_A, "prj_open_locked").body as ClientDetail;
    check(
      !locked.editableFields.includes("budgetAmount") && locked.editableFields.includes("title"),
      "규칙 15: 대기 지원이 있으면 예산만 잠기고 제목은 열려 있다",
    );
    check(
      !locked.availableActions.includes("DELETE"),
      "규칙 20: 대기 지원이 있으면 삭제 버튼이 없다",
    );

    const reopenable = api.getProject(CLIENT_A, "prj_reopenable").body as ClientDetail;
    check(
      reopenable.availableActions.includes("REOPEN_RECRUITMENT"),
      "규칙 32: 재모집 가능하면 배지가 붙는다",
    );

    const paying = api.getProject(CLIENT_A, "prj_paying").body as ClientDetail;
    check(
      !paying.availableActions.includes("CANCEL"),
      "규칙 27: 결제가 시작되면 취소 버튼이 없다",
    );

    await expectError("삭제된 프로젝트 상세", 404, "PROJECT_NOT_FOUND", async () =>
      api.getProject(null, "prj_deleted"),
    );
  }

  /* --- 6-4. 수정 (규칙 15~18) --- */
  section("공개 API — 수정");
  {
    const { api, repo: r } = newApi();
    const res = api.updateProject(CLIENT_A, "prj_open_free", { title: "제목을 바꿉니다" });
    check(res.body.title === "제목을 바꿉니다", "제목 수정");
    check(res.body.projectVersion === 1, "규칙 18: 일반 수정으로 버전이 안 오른다");
    check(r.findById("prj_open_free")!.updatedAt === AT, "updatedAt 은 갱신된다");

    const budget = api.updateProject(CLIENT_A, "prj_open_free", { budgetAmount: 7_000_000 });
    check(budget.body.budgetAmount === 7_000_000, "지원 0건이면 예산 수정 가능");

    const titleOnly = api.updateProject(CLIENT_A, "prj_open_locked", { title: "제목만 바꿉니다" });
    check(titleOnly.body.title === "제목만 바꿉니다", "규칙 15: 잠긴 상태에서도 제목은 바뀐다");

    await expectError("남의 프로젝트 수정", 403, "PROJECT_FORBIDDEN", async () =>
      api.updateProject(CLIENT_B, "prj_open_free", { title: "가로채기 시도" }),
    );
    await expectError("비로그인 수정", 401, "AUTH_REQUIRED", async () =>
      api.updateProject(null, "prj_open_free", { title: "비로그인 수정" }),
    );
    await expectError("대기 지원 있는데 예산 수정", 409, "PROJECT_EDIT_LOCKED", async () =>
      api.updateProject(CLIENT_A, "prj_open_locked", { budgetAmount: 1_000_000 }),
    );
    await expectError("마감된 프로젝트 수정", 409, "PROJECT_EDIT_CLOSED", async () =>
      api.updateProject(CLIENT_A, "prj_closed", { title: "마감 후 수정" }),
    );
  }

  /* --- 6-5. 삭제 (규칙 19~21) --- */
  section("공개 API — 삭제");
  {
    const { api, repo: r } = newApi();
    const res = api.deleteProject(CLIENT_A, "prj_open_free");
    check(res.status === 204, "삭제 204");
    check(r.findByIdIncludingDeleted("prj_open_free")!.deletedAt === AT, "규칙 19: 소프트 삭제");
    check(r.findById("prj_open_free") === null, "조회에서 사라진다");

    const again = api.deleteProject(CLIENT_A, "prj_open_free");
    check(again.status === 204, "규칙 21: 이미 삭제된 것을 다시 지워도 204");

    await expectError("대기 지원 있음", 409, "PROJECT_DELETE_HAS_APPLICATIONS", async () =>
      api.deleteProject(CLIENT_A, "prj_open_locked"),
    );
    await expectError("거래 진행 중", 409, "PROJECT_DELETE_IN_TRANSACTION", async () =>
      api.deleteProject(CLIENT_A, "prj_in_progress"),
    );
    await expectError("남의 프로젝트 삭제", 403, "PROJECT_FORBIDDEN", async () =>
      api.deleteProject(CLIENT_B, "prj_scheduled"),
    );
  }

  /* --- 6-6. 모집 마감 (규칙 22~25) --- */
  section("공개 API — 모집 마감");
  {
    const { api, repo: r, ext: e } = newApi();
    const res = await api.closeRecruitment(CLIENT_A, "prj_open_locked");
    check(res.body.recruitmentStatus === "CLOSED", "OPEN → CLOSED");
    check(res.body.rejectedApplicationCount === 3, "대기 지원 3건이 일괄 거절됐다");
    check(
      e.calls.rejectPendingApplications[0]!.input.reason === "RECRUITMENT_CLOSED",
      "규칙 57: 마감 사유로 요청한다 (알림 문구가 다르다)",
    );
    check(r.findById("prj_open_locked")!.projectVersion === 2, "상태가 바뀌어 버전 +1");

    const again = await api.closeRecruitment(CLIENT_A, "prj_open_locked");
    check(
      again.status === 200 && again.body.rejectedApplicationCount === 0,
      "규칙 24: 재마감은 200, 거절 0건",
    );

    const scheduled = await api.closeRecruitment(CLIENT_A, "prj_scheduled");
    check(scheduled.body.recruitmentStatus === "CLOSED", "규칙 22: SCHEDULED 도 마감된다");
  }
  {
    // 규칙 23 — 후처리가 실패해도 마감은 되돌리지 않는다.
    const { api, repo: r, ext: e } = newApi();
    e.failNext.rejectPendingApplications = true;
    const res = await api.closeRecruitment(CLIENT_A, "prj_open_locked");
    check(res.body.recruitmentStatus === "CLOSED", "규칙 23: 후처리 실패해도 마감은 유지된다");
    check(r.findById("prj_open_locked")!.recruitmentStatus === "CLOSED", "저장소도 마감 상태");

    await expectError("취소된 프로젝트 마감", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      api.closeRecruitment(CLIENT_A, "prj_canceled"),
    );
  }
  {
    // 규칙 25 — deadlineNotifiedAt 이 이미 있으면 후처리를 다시 요청하지 않는다.
    // 배치가 마감 시각 경과를 이미 알렸는데 의뢰인이 수동 마감을 누른 경우다.
    const { api, repo: r, ext: e } = newApi();
    r.update("prj_open_locked", { deadlineNotifiedAt: "2026-08-25T00:00:00Z" });
    const res = await api.closeRecruitment(CLIENT_A, "prj_open_locked");
    check(res.body.recruitmentStatus === "CLOSED", "규칙 25: 마감 자체는 된다");
    check(
      e.calls.rejectPendingApplications.length === 0,
      "규칙 25: 이미 알린 뒤면 일괄 거절을 다시 요청하지 않는다",
    );
  }

  /* --- 6-7. 취소 (규칙 26~31) --- */
  section("공개 API — 취소");
  {
    const { api, repo: r } = newApi();
    const res = await api.cancelProject(CLIENT_A, "prj_open_free");
    check(res.status === 200, "취소 200");
    check(
      res.body.transactionStatus === "CANCELED" && res.body.recruitmentStatus === "CLOSED",
      "규칙 26: 거래 CANCELED + 모집 CLOSED",
    );
    check(res.body.postActions.contractInvalidation === "NOT_NEEDED", "계약이 없으면 NOT_NEEDED");
    check(r.findById("prj_open_free")!.projectVersion === 2, "버전 +1");

    const again = await api.cancelProject(CLIENT_A, "prj_open_free");
    check(again.status === 200, "규칙 30: 재취소는 200");
  }
  {
    const { api, ext: e } = newApi();
    const res = await api.cancelProject(CLIENT_A, "prj_alive");
    check(
      res.body.postActions.contractInvalidation === "DONE",
      "계약 대기 중이면 합의·계약 무효화를 요청한다 (규칙 29)",
    );
    check(e.calls.invalidateAgreementAndContract.length === 1, "contracts 를 실제로 호출한다");
  }
  {
    // 규칙 29 — 하나라도 실패하면 202.
    const { api, repo: r, ext: e } = newApi();
    e.failNext.rejectPendingApplications = true;
    const res = await api.cancelProject(CLIENT_A, "prj_open_locked");
    check(res.status === 202, "규칙 29: 후처리 실패면 202");
    check(res.body.postActions.applicationRejection === "FAILED", "무엇이 실패했는지 알려준다");
    check(
      r.findById("prj_open_locked")!.transactionStatus === "CANCELED",
      "취소 자체는 되돌리지 않는다",
    );
  }
  {
    const { api } = newApi();
    await expectError("결제 시작 후 취소", 409, "PROJECT_CANCEL_AFTER_PAYMENT", () =>
      api.cancelProject(CLIENT_A, "prj_paying"),
    );
    await expectError("진행 중 거래 취소", 409, "PROJECT_TRANSITION_CONFLICT", () =>
      api.cancelProject(CLIENT_A, "prj_in_progress"),
    );
    await expectError("남의 프로젝트 취소", 403, "PROJECT_FORBIDDEN", () =>
      api.cancelProject(CLIENT_B, "prj_open_free"),
    );
  }

  /* --- 6-8. 내 프로젝트 --- */
  section("공개 API — 내 프로젝트");
  {
    const { api } = newApi();
    const mine = api.listMyProjects(CLIENT_A, "usr_client_a", {});
    check(mine.body.items.length > 0, "내 프로젝트가 나온다");
    check(
      mine.body.items.every((i) => "transactionStatus" in i),
      "본인 목록에는 거래 상태가 들어간다",
    );
    check(
      !mine.body.items.some((i) => i.projectId === "prj_other_client"),
      "남의 프로젝트는 안 나온다",
    );
    check(!mine.body.items.some((i) => i.projectId === "prj_deleted"), "삭제된 것은 안 나온다");
    check(
      mine.body.items.some((i) => i.availableActions.includes("REOPEN_RECRUITMENT")),
      "재모집 가능한 것에 배지가 붙는다",
    );

    const filtered = api.listMyProjects(CLIENT_A, "usr_client_a", {
      transactionStatus: "COMPLETED",
    });
    check(
      filtered.body.items.length > 0 &&
        filtered.body.items.every((i) => i.transactionStatus === "COMPLETED"),
      "거래 상태 필터",
    );

    await expectError("남의 목록 조회", 403, "PROJECT_FORBIDDEN", async () =>
      api.listMyProjects(CLIENT_A, "usr_client_b", {}),
    );
    await expectError("비로그인 목록", 401, "AUTH_REQUIRED", async () =>
      api.listMyProjects(null, "usr_client_a", {}),
    );
  }

  /* --- 6-9. 재모집 (규칙 32~35) --- */
  section("공개 API — 재모집");
  {
    const { api, repo: r } = newApi();
    const res = api.reopenRecruitment(CLIENT_A, "prj_reopenable", {
      recruitmentDeadlineAt: "2026-09-20T14:59:59Z",
    });
    check(res.body.reopened && res.body.recruitmentStatus === "OPEN", "재모집 성공");
    check(res.body.recruitmentStartAt === AT, "규칙 33: 시작 시각을 현재로 갱신한다");
    check(res.body.projectVersion === 10, "버전 +1");
    check(r.findById("prj_reopenable")!.recruitmentClosedAt === null, "마감 시각을 지운다");
  }
  {
    // 규칙 33 — 상한은 **갱신 후** 시작 시각 기준이다.
    // 옛 시작 시각으로 쟀다면 이 요청은 통과했을 것이다.
    const { api } = newApi();
    await expectError("갱신 후 기준 366일", 422, "DEADLINE_EXCEEDS_LIMIT", async () =>
      api.reopenRecruitment(CLIENT_A, "prj_reopenable", {
        recruitmentDeadlineAt: "2027-09-01T00:00:00Z",
      }),
    );
  }
  {
    const { api, repo: r } = newApi();
    const before = r.findById("prj_open_free")!.recruitmentDeadlineAt;
    const noop = api.reopenRecruitment(CLIENT_A, "prj_open_free", {
      recruitmentDeadlineAt: "2027-01-01T00:00:00Z",
    });
    check(!noop.body.reopened, "규칙 35: 이미 OPEN 이면 reopened: false");
    check(
      r.findById("prj_open_free")!.recruitmentDeadlineAt === before,
      "규칙 35: 아무것도 바꾸지 않는다 — 모집 기간이 늘어나면 안 된다",
    );

    await expectError("대기 지원 잔존", 409, "PROJECT_EDIT_LOCKED", async () =>
      api.reopenRecruitment(CLIENT_A, "prj_closed_pending", {
        recruitmentDeadlineAt: "2026-09-20T14:59:59Z",
      }),
    );
    await expectError("취소된 프로젝트", 409, "PROJECT_TRANSITION_CONFLICT", async () =>
      api.reopenRecruitment(CLIENT_A, "prj_canceled", {
        recruitmentDeadlineAt: "2026-09-20T14:59:59Z",
      }),
    );
    await expectError("버전 불일치", 409, "PROJECT_VERSION_CONFLICT", async () =>
      api.reopenRecruitment(CLIENT_A, "prj_reopenable", {
        recruitmentDeadlineAt: "2026-09-20T14:59:59Z",
        expectedProjectVersion: 1,
      }),
    );
  }

  /* ═══════════ 6-10. engagement 에 제공하는 읽기 3종 ═══════════ */
  section("공개 API — engagement 제공 읽기 3종");
  {
    const { createProjectReadService } = await import("./server/project-read.service");
    const r = createProjectRepositoryMock(createFixedClock(AT));
    const read = createProjectReadService({ repo: r, now: () => AT });

    const one = await read.getProjectCardData("prj_open_free");
    check(one !== null, "카드 1장 조회");
    check(one !== null && !("transactionStatus" in one), "거래 상태를 주지 않는다");
    check(one !== null && !("deletedAt" in one), "삭제 여부를 값으로 주지 않는다");
    check(one?.createdAt !== undefined, "동점 정렬용 createdAt 은 포함한다");

    check(
      (await read.getProjectCardData("prj_deleted")) === null,
      "삭제된 프로젝트는 null",
    );
    check(
      (await read.getProjectCardData("prj_closed")) !== null,
      "마감된 것은 정상적으로 준다 (engagement 규칙 7·13)",
    );

    const bulk = await read.getProjectCardDataBulk([
      "prj_open_free",
      "prj_deleted",
      "prj_closed",
    ]);
    check(bulk.size === 2, "묶음 조회에서 삭제된 id 는 빠진다");
    check(!bulk.has("prj_deleted"), "빠진 id 를 보고 부르는 쪽이 걸러낸다");

    const candidates = await read.findRecommendationCandidates({
      excludeProjectId: "prj_open_free",
      category: "DESIGN",
      skillIds: ["FIGMA"],
    });
    check(
      !candidates.some((c) => c.projectId === "prj_open_free"),
      "자기 자신을 후보에 넣지 않는다",
    );
    check(
      candidates.every((c) => c.recruitmentStatus === "OPEN"),
      "OPEN 인 것만 후보다",
    );
    check(
      !candidates.some((c) => c.projectId === "prj_deleted"),
      "삭제된 것은 후보가 아니다",
    );

    // 규칙 14 의 계산이 project.service.ts 와 어긋나지 않는지 대조한다.
    // 두 파일에 같은 계산이 있어서, 한쪽만 고치면 여기서 걸린다.
    const { api: svc } = newApi();
    for (const id of ["prj_scheduled", "prj_open_free", "prj_closed", "prj_reopenable"]) {
      const viaRead = await read.getProjectCardData(id);
      const viaPublic = svc.getProject(null, id);
      check(
        viaRead?.recruitmentStatus === viaPublic.body.recruitmentStatus,
        `규칙 14 계산 일치 — ${id}`,
      );
    }
  }

  /* ═══════════ 7. 화면 필수 요소 43개 ═══════════ */

  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ProjectRegisterForm } = await import("./web/ProjectRegisterForm");
  const { ProjectBrowse, ProjectDetail } = await import("./web/ProjectBrowse");
  const { MyProjectList, ProjectEditForm, ReopenRecruitmentDialog } = await import(
    "./web/ProjectManage"
  );

  /**
   * 아래 목록은 `design/high-fi-*.html` 의 "필수 요소 목록" 을 그대로 옮긴 것이고,
   * 그 목록은 PRD §14 문구 정본을 옮긴 것이다.
   * **이 목록에 없는 문구를 여기 넣지 않는다** — 넣는 순간 정본과 갈라진다.
   */
  const REQUIRED = {
    "high-fi-register.html": [
      // SCR-B03
      "프로젝트 제목",
      "예) 쇼핑몰 웹사이트 구축",
      "5자 이상 100자 이하로 입력해 주세요.",
      "프로젝트 설명",
      "어떤 작업이 필요한지 구체적으로 적어 주세요.",
      "20자 이상 적어 주시면 AI 단가 분석을 더 정확하게 받을 수 있습니다.",
      "카테고리",
      "다음",
      // SCR-B04
      "모집 시작일 (선택)",
      "비워두면 바로 모집을 시작합니다",
      "모집 마감일",
      "모집 기간은 7일 이상을 권장합니다. 최대 1년까지 설정할 수 있습니다.",
      "예산",
      "예) 5,000,000",
      "단위는 원입니다. 나중에 지원자가 생기면 변경할 수 없습니다.",
      // SCR-B05
      "필요한 기술",
      "최소 1개, 최대 10개까지 선택할 수 있습니다.",
      "입력한 내용을 확인해 주세요",
      "수정",
      "등록하기",
    ],
    "high-fi-browse.html": [
      // SCR-B01
      "프로젝트를 검색해 보세요",
      "필터",
      "최신순",
      "마감임박순",
      "예산 높은순",
      "모집 중",
      // SCR-B02
      "예산",
      "필요한 기술",
      "지원하기",
    ],
    "high-fi-manage.html": [
      // SCR-B07
      "내 프로젝트",
      "프로젝트 등록",
      "수정",
      "모집 마감",
      "지원자 관리",
      // SCR-B06
      "프로젝트 수정",
      "프로젝트 제목",
      "프로젝트 설명",
      "저장",
      "취소",
      // SCR-B10
      "협상이 마무리되는 사이에 모집 마감일이 지났습니다. 마감일을 새로 정하면 다시 모집할 수 있습니다.",
      "모집 마감일",
      "다시 모집하기",
      "그만두기",
    ],
  } as const;

  const sampleItem = {
    projectId: "prj_open_free",
    title: "배달 앱 UI 개선",
    category: { category: "DESIGN", displayName: "디자인" },
    budgetAmount: 3_400_000,
    recruitmentDeadlineAt: "2026-09-16T14:59:59Z",
    recruitmentStatus: "OPEN" as const,
    skills: [{ skillId: "FIGMA", displayName: "Figma" }],
    applicationCount: 0,
    client: { name: "김의뢰", companyName: "스튜디오 A" },
  };

  const manageItem = {
    projectId: "prj_open_locked",
    title: "쇼핑몰 웹사이트 구축",
    budgetAmount: 5_000_000,
    recruitmentDeadlineAt: "2026-09-16T14:59:59Z",
    recruitmentStatus: "OPEN" as const,
    pendingApplicationCount: 3,
    editableFields: ["title", "description", "category", "skillIds"],
    availableActions: ["EDIT", "CLOSE_RECRUITMENT", "CANCEL"],
  };

  // 기본 렌더링에서 나와야 한다. 조건부로만 뜨는 요소는 목록에서 이미 제외돼 있다.
  const rendered = {
    "high-fi-register.html": renderToStaticMarkup(
      React.createElement(ProjectRegisterForm, {}),
    ),
    "high-fi-browse.html": [
      renderToStaticMarkup(React.createElement(ProjectBrowse, { items: [sampleItem] })),
      renderToStaticMarkup(
        React.createElement(ProjectDetail, {
          project: { ...sampleItem, description: "설명", recruitmentStartAt: null, canApply: true },
        }),
      ),
    ].join("\n"),
    "high-fi-manage.html": [
      renderToStaticMarkup(React.createElement(MyProjectList, { items: [manageItem] })),
      renderToStaticMarkup(
        React.createElement(ProjectEditForm, {
          project: { ...manageItem, description: "설명" },
        }),
      ),
      renderToStaticMarkup(React.createElement(ReopenRecruitmentDialog, {})),
    ].join("\n"),
  };

  /** HTML 엔티티를 되돌린다. renderToStaticMarkup 이 따옴표·괄호를 바꿔놓는다 */
  function decode(html: string): string {
    return html
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  let requiredTotal = 0;
  for (const [file, texts] of Object.entries(REQUIRED)) {
    section(`화면 필수 요소 — ${file}`);
    const html = decode(rendered[file as keyof typeof rendered]);
    for (const text of texts) {
      requiredTotal += 1;
      check(html.includes(text), `"${text}"`);
    }
  }
  check(requiredTotal === 43, `필수 요소 합계 43개 (실제 ${requiredTotal}개)`);

  // 원시 토큰을 화면이 직접 쓰면 디자인 시스템이 갈라진다.
  // 색은 design/_tokens.css 의 CSS 변수로만 들어가야 한다.
  const allHtml = Object.values(rendered).join("\n");
  check(!/#[0-9A-Fa-f]{6}/.test(allHtml), "화면에 원시 색상값(#RRGGBB)이 박혀 있지 않다");
  check(!allHtml.includes("workMode"), "workMode 는 쓰지 않는다 (CR-0004 — ERD 에 없는 필드)");

  section("결과");
  console.log(`PASS ${passCount} · FAIL ${failCount}`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main();
