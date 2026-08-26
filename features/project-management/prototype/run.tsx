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
  check(OWN_SEEDS.length === 7, "시드: project-management 전용 7종");
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

  /* ═══════════ 6. 공개 API 9종 — 다음 라운드에서 추가 ═══════════ */
  /* ═══════════ 7. 화면 필수 요소 43개 — 다음 라운드에서 추가 ═══════════ */

  /* ═══════════ 6. 공개 API 9종 — 다음 라운드에서 추가 ═══════════ */
  /* ═══════════ 7. 화면 필수 요소 43개 — 다음 라운드에서 추가 ═══════════ */

  section("결과");
  console.log(`PASS ${passCount} · FAIL ${failCount}`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main();
