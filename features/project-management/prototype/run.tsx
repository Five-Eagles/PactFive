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

  /* ═══════════ 5. 계약 함수 8종 — PR #3에서 추가 ═══════════ */
  /* ═══════════ 6. 공개 API 9종 — PR #4에서 추가 ═══════════ */
  /* ═══════════ 7. 화면 필수 요소 43개 — PR #5에서 추가 ═══════════ */

  section("결과");
  console.log(`PASS ${passCount} · FAIL ${failCount}`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main();
