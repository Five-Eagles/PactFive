import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOCK_CLIENT_USER_ID,
  MOCK_FREELANCER_2_USER_ID,
  MOCK_FREELANCER_USER_ID,
  MOCK_INCOMPLETE_USER_ID,
  MOCK_NOW,
  MOCK_OUTSIDER_USER_ID,
} from "./server/application.constants";
import { createApplicationApiMock, createUnavailableProfilePort } from "./mock/application.mock";
import {
  ApplicationApiError,
  isApplicationApiError,
  type ApplicationApiErrorCode,
  type CreateApplicationBody,
} from "./server/application.types";
import {
  MSG_COVER_LETTER,
  MSG_EXPECTED_AMOUNT,
  MSG_EXPECTED_DURATION,
  MSG_PROFILE_INCOMPLETE,
  MSG_ACCEPT_QUEUED,
  MSG_PROJECT_CANCELED,
  MSG_UNKNOWN_FIELD,
  REJECTION_COPY,
} from "./server/application.constants";

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
  code: ApplicationApiErrorCode,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
    fail(name, "오류가 나지 않았습니다");
  } catch (err) {
    if (isApplicationApiError(err) && err.body.error.code === code) {
      pass(name);
      return;
    }
    fail(name, err);
  }
}

async function expectMessage(
  name: string,
  code: ApplicationApiErrorCode,
  message: string,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
    fail(name, "오류가 나지 않았습니다");
  } catch (err) {
    if (isApplicationApiError(err) && err.body.error.code === code && err.body.error.message === message) {
      pass(name);
      return;
    }
    fail(name, err);
  }
}

const APPLY_BODY: CreateApplicationBody = {
  coverLetter:
    "관련 경험과 수행 계획을 정리합니다. 일정과 스택이 맞고 커뮤니케이션을 맞춰 진행할 수 있습니다. 요구 범위를 확인하고 일정 안에 전달하겠습니다. 기술 스택과 협업 방식을 맞춰 진행합니다.",
  expectedAmount: 1_000_000,
  expectedDurationDays: 30,
};

function coverOf(length: number): string {
  return "가".repeat(length);
}

async function main() {
  ensurePackagesInstalled();
  console.log("=== applications prototype 로컬 실행 ===");

  // 규칙 1 — OPEN만 생성
  {
    const api = createApplicationApiMock();
    const created = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-ok");
    if (created.httpStatus === 201 && created.body.status === "PENDING") {
      pass("규칙 1: OPEN 작성");
    } else {
      fail("규칙 1: OPEN 작성", created);
    }
    await expectCode("규칙 1: 마감 거부", "PROJECT_TRANSITION_CONFLICT", () =>
      api.createApplication("prj_closed", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-closed"),
    );
  }

  // 규칙 1 — 입력 범위·허용 필드
  {
    await expectMessage("규칙 1: 동기 99자", "VALIDATION_ERROR", MSG_COVER_LETTER, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, coverLetter: coverOf(99) },
        "idem-cover-99",
      ),
    );
    const atMin = await createApplicationApiMock().createApplication(
      "prj_open",
      MOCK_FREELANCER_USER_ID,
      { ...APPLY_BODY, coverLetter: coverOf(100) },
      "idem-cover-100",
    );
    if (atMin.httpStatus === 201) pass("규칙 1: 동기 100자");
    else fail("규칙 1: 동기 100자", atMin);
    const atMax = await createApplicationApiMock().createApplication(
      "prj_open",
      MOCK_FREELANCER_USER_ID,
      { ...APPLY_BODY, coverLetter: coverOf(3000) },
      "idem-cover-3000",
    );
    if (atMax.httpStatus === 201) pass("규칙 1: 동기 3000자");
    else fail("규칙 1: 동기 3000자", atMax);
    await expectMessage("규칙 1: 동기 3001자", "VALIDATION_ERROR", MSG_COVER_LETTER, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, coverLetter: coverOf(3001) },
        "idem-cover-3001",
      ),
    );
    await expectMessage("규칙 1: 공백 동기", "VALIDATION_ERROR", MSG_COVER_LETTER, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, coverLetter: " \n  \n " },
        "idem-cover-ws",
      ),
    );
    await expectMessage("규칙 1: 금액 9999", "VALIDATION_ERROR", MSG_EXPECTED_AMOUNT, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, expectedAmount: 9_999 },
        "idem-amt-low",
      ),
    );
    const amountMin = await createApplicationApiMock().createApplication(
      "prj_open",
      MOCK_FREELANCER_USER_ID,
      { ...APPLY_BODY, expectedAmount: 10_000 },
      "idem-amt-min",
    );
    if (amountMin.httpStatus === 201) pass("규칙 1: 금액 10000");
    else fail("규칙 1: 금액 10000", amountMin);
    const amountMax = await createApplicationApiMock().createApplication(
      "prj_open",
      MOCK_FREELANCER_USER_ID,
      { ...APPLY_BODY, expectedAmount: 1_000_000_000 },
      "idem-amt-max",
    );
    if (amountMax.httpStatus === 201) pass("규칙 1: 금액 10억");
    else fail("규칙 1: 금액 10억", amountMax);
    await expectMessage("규칙 1: 금액 10억+1", "VALIDATION_ERROR", MSG_EXPECTED_AMOUNT, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, expectedAmount: 1_000_000_001 },
        "idem-amt-over",
      ),
    );
    const overBudget = await createApplicationApiMock().createApplication(
      "prj_open",
      MOCK_FREELANCER_USER_ID,
      { ...APPLY_BODY, expectedAmount: 2_000_000 },
      "idem-over-budget",
    );
    if (overBudget.httpStatus === 201) pass("규칙 1: 예산 초과 허용");
    else fail("규칙 1: 예산 초과 허용", overBudget);
    await expectMessage("규칙 1: 기간 0", "VALIDATION_ERROR", MSG_EXPECTED_DURATION, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, expectedDurationDays: 0 },
        "idem-dur-0",
      ),
    );
    const durMin = await createApplicationApiMock().createApplication(
      "prj_open",
      MOCK_FREELANCER_USER_ID,
      { ...APPLY_BODY, expectedDurationDays: 1 },
      "idem-dur-1",
    );
    if (durMin.httpStatus === 201) pass("규칙 1: 기간 1");
    else fail("규칙 1: 기간 1", durMin);
    const durMax = await createApplicationApiMock().createApplication(
      "prj_open",
      MOCK_FREELANCER_USER_ID,
      { ...APPLY_BODY, expectedDurationDays: 365 },
      "idem-dur-365",
    );
    if (durMax.httpStatus === 201) pass("규칙 1: 기간 365");
    else fail("규칙 1: 기간 365", durMax);
    await expectMessage("규칙 1: 기간 366", "VALIDATION_ERROR", MSG_EXPECTED_DURATION, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, expectedDurationDays: 366 },
        "idem-dur-366",
      ),
    );
    await expectMessage("규칙 1: 기간 1.5", "VALIDATION_ERROR", MSG_EXPECTED_DURATION, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, expectedDurationDays: 1.5 },
        "idem-dur-float",
      ),
    );
    await expectMessage("규칙 1: 금지 필드 status", "VALIDATION_ERROR", MSG_UNKNOWN_FIELD, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, status: "ACCEPTED" },
        "idem-status",
      ),
    );
    await expectMessage("규칙 1: 금지 필드 freelancerId", "VALIDATION_ERROR", MSG_UNKNOWN_FIELD, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, freelancerId: "usr_x" },
        "idem-fid",
      ),
    );
    await expectMessage("규칙 1: 금지 필드 attachments", "VALIDATION_ERROR", MSG_UNKNOWN_FIELD, () =>
      createApplicationApiMock().createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, attachments: [] },
        "idem-att",
      ),
    );
  }

  // 규칙 2 — 같은 프로젝트·프리랜서 1건
  {
    const api = createApplicationApiMock();
    const first = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-dup");
    const again = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-dup");
    if (again.httpStatus === 200 && again.body.applicationId === first.body.applicationId) {
      pass("규칙 2: 같은 키·본문 멱등 200");
    } else {
      fail("규칙 2: 같은 키·본문 멱등 200", again);
    }
    await expectCode("규칙 2: 방향당 1회 409", "APPLICATION_ALREADY_EXISTS", () =>
      api.createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        { ...APPLY_BODY, expectedAmount: 2_000_000 },
        "idem-other",
      ),
    );
  }

  // 규칙 2 — 생성 +1/+1, 멱등 200은 안 올림
  {
    const api = createApplicationApiMock();
    await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-count");
    const afterInsert = api.getProject("prj_open");
    if (afterInsert?.applicationCount === 1 && afterInsert.pendingApplicationCount === 1) {
      pass("규칙 2: 생성 후 전체 1·대기 1");
    } else {
      fail("규칙 2: 생성 후 전체 1·대기 1", afterInsert);
    }
    await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-count");
    const afterIdempotent = api.getProject("prj_open");
    if (afterIdempotent?.applicationCount === 1 && afterIdempotent.pendingApplicationCount === 1) {
      pass("규칙 2: 멱등 200은 카운트 유지");
    } else {
      fail("규칙 2: 멱등 200은 카운트 유지", afterIdempotent);
    }
  }

  // 규칙 3 — 수락 후 잔여 거절
  {
    const api = createApplicationApiMock();
    const first = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-a");
    const second = await api.createApplication("prj_open", MOCK_FREELANCER_2_USER_ID, APPLY_BODY, "idem-b");
    const accepted = await api.acceptApplication(first.body.applicationId, MOCK_CLIENT_USER_ID);
    const listed = await api.listProjectApplications("prj_open", MOCK_CLIENT_USER_ID);
    const other = listed.items.find((item) => item.applicationId === second.body.applicationId);
    if (
      accepted.httpStatus === 200 &&
      accepted.status === "ACCEPTED" &&
      other?.status === "REJECTED" &&
      other.rejectionType === "AUTO_OTHER_ACCEPTED" &&
      api.getPublishedEvents().some((event) => event.type === "APPLICATION_ACCEPTED")
    ) {
      pass("규칙 3: 수락 후 잔여 자동 거절");
    } else {
      fail("규칙 3: 수락 후 잔여 자동 거절", { accepted, listed, events: api.getPublishedEvents() });
    }
  }

  // 규칙 3 — C-01 실패 시 잔여 거절·알림 금지
  {
    const api = createApplicationApiMock(MOCK_NOW, {
      projectApplications: {
        async acceptProjectApplication() {
          throw new ApplicationApiError(
            "PROJECT_TRANSITION_CONFLICT",
            "다른 지원자가 먼저 수락되었습니다",
          );
        },
      },
    });
    const first = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-c01-a");
    const second = await api.createApplication("prj_open", MOCK_FREELANCER_2_USER_ID, APPLY_BODY, "idem-c01-b");
    let threw = false;
    try {
      await api.acceptApplication(first.body.applicationId, MOCK_CLIENT_USER_ID);
    } catch (err) {
      threw = isApplicationApiError(err) && err.body.error.code === "PROJECT_TRANSITION_CONFLICT";
      if (!threw) fail("규칙 3: C-01 실패 시 잔여 유지", err);
    }
    if (!threw) {
      fail("규칙 3: C-01 실패 시 잔여 유지", "오류가 나지 않았습니다");
    } else {
      const listed = await api.listProjectApplications("prj_open", MOCK_CLIENT_USER_ID);
      const project = api.getProject("prj_open");
      const events = api.getPublishedEvents();
      const remainingPending = listed.items.every((item) => item.status === "PENDING");
      const noAcceptNotify = !events.some(
        (event) => event.type === "APPLICATION_ACCEPTED" || event.type === "APPLICATION_AUTO_REJECTED",
      );
      const projectUntouched =
        project?.recruitmentStatus === "OPEN" &&
        project.acceptedApplicationId === null &&
        project.pendingApplicationCount === 2;
      if (remainingPending && noAcceptNotify && projectUntouched) {
        pass("규칙 3: C-01 실패 시 잔여 유지");
      } else {
        fail("규칙 3: C-01 실패 시 잔여 유지", { listed, project, events });
      }
    }
  }

  // 규칙 4 — 같은 지원 재시도 200 vs 다른 지원 409
  {
    const api = createApplicationApiMock();
    const first = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-same");
    const second = await api.createApplication("prj_open", MOCK_FREELANCER_2_USER_ID, APPLY_BODY, "idem-other-f");
    const once = await api.acceptApplication(first.body.applicationId, MOCK_CLIENT_USER_ID);
    const twice = await api.acceptApplication(first.body.applicationId, MOCK_CLIENT_USER_ID);
    if (once.handoff.acceptedApplicationId === twice.handoff.acceptedApplicationId) {
      pass("규칙 4: 같은 지원 재시도 200");
    } else {
      fail("규칙 4: 같은 지원 재시도 200", { once, twice });
    }
    await expectCode("규칙 4: 다른 지원 409", "PROJECT_TRANSITION_CONFLICT", () =>
      api.acceptApplication(second.body.applicationId, MOCK_CLIENT_USER_ID),
    );
  }

  // 규칙 5 — OPEN 아닌 수락 409
  {
    const api = createApplicationApiMock();
    await expectCode("규칙 5: CLOSED 수락 409", "PROJECT_TRANSITION_CONFLICT", () =>
      api.acceptApplication("app_closed_pending", MOCK_CLIENT_USER_ID),
    );
    await expectCode("규칙 5: SCHEDULED 생성 409", "PROJECT_TRANSITION_CONFLICT", () =>
      api.createApplication("prj_scheduled", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-sched"),
    );
  }

  // 규칙 6 — 손잡이
  {
    const api = createApplicationApiMock();
    const created = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-hand");
    const accepted = await api.acceptApplication(created.body.applicationId, MOCK_CLIENT_USER_ID);
    const project = api.getProject("prj_open");
    if (
      accepted.handoff.transactionStatus === "CONTRACT_PENDING" &&
      accepted.handoff.acceptedApplicationId === created.body.applicationId &&
      project?.acceptedApplicationId === created.body.applicationId &&
      project.pendingApplicationCount === 0
    ) {
      pass("규칙 6: CONTRACT_PENDING 손잡이");
    } else {
      fail("규칙 6: CONTRACT_PENDING 손잡이", { accepted, project });
    }
  }

  // 규칙 7 — 개별 거절 DIRECT
  {
    const api = createApplicationApiMock();
    const created = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-rej");
    const rejected = await api.rejectApplication(created.body.applicationId, MOCK_CLIENT_USER_ID);
    if (rejected.status === "REJECTED" && rejected.rejectionType === "DIRECT") {
      pass("규칙 7: 개별 거절 DIRECT");
    } else {
      fail("규칙 7: 개별 거절 DIRECT", rejected);
    }
    const afterReject = api.getProject("prj_open");
    if (afterReject?.applicationCount === 1 && afterReject.pendingApplicationCount === 0) {
      pass("규칙 7: DIRECT 후 대기 0·전체 유지");
    } else {
      fail("규칙 7: DIRECT 후 대기 0·전체 유지", afterReject);
    }
    await api.rejectApplication(created.body.applicationId, MOCK_CLIENT_USER_ID);
    const afterIdempotentReject = api.getProject("prj_open");
    if (afterIdempotentReject?.pendingApplicationCount === 0) {
      pass("규칙 7: 멱등 거절은 대기 재차감 없음");
    } else {
      fail("규칙 7: 멱등 거절은 대기 재차감 없음", afterIdempotentReject);
    }
  }

  // 규칙 8 — 일괄 거절 멱등
  {
    const api = createApplicationApiMock();
    await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-batch");
    const input = {
      closureEventId: "close_1",
      reason: "RECRUITMENT_CLOSED" as const,
      occurredAt: MOCK_NOW,
    };
    const first = await api.rejectPendingApplications("prj_open", input);
    const second = await api.rejectPendingApplications("prj_open", input);
    if (first.result === "DONE" && first.rejectedCount === 1 && second.alreadyProcessed === true) {
      pass("규칙 8: 일괄 거절 멱등");
    } else {
      fail("규칙 8: 일괄 거절 멱등", { first, second });
    }
    const empty = await api.rejectPendingApplications("prj_scheduled", {
      closureEventId: "close_empty",
      reason: "PROJECT_CANCELED",
      occurredAt: MOCK_NOW,
    });
    if (empty.result === "NOT_NEEDED") {
      pass("규칙 8: PENDING 없으면 NOT_NEEDED");
    } else {
      fail("규칙 8: PENDING 없으면 NOT_NEEDED", empty);
    }
  }

  // 규칙 8 — GAP-01 취소 NULL
  {
    const api = createApplicationApiMock();
    const created = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-cancel");
    await api.rejectPendingApplications("prj_open", {
      closureEventId: "cancel_1",
      reason: "PROJECT_CANCELED",
      occurredAt: MOCK_NOW,
    });
    const row = api.getApplicationRow(created.body.applicationId);
    if (row?.status === "REJECTED" && row.rejectionType === null) {
      pass("규칙 8: 취소 rejectionType null");
    } else {
      fail("규칙 8: 취소 rejectionType null", row);
    }
    const again = await api.rejectPendingApplications("prj_open", {
      closureEventId: "cancel_1",
      reason: "PROJECT_CANCELED",
      occurredAt: MOCK_NOW,
    });
    if (again.alreadyProcessed && api.getApplicationRow(created.body.applicationId)?.rejectionType === null) {
      pass("규칙 8: 취소 멱등·덮지 않음");
    } else {
      fail("규칙 8: 취소 멱등·덮지 않음", again);
    }
    const directApi = createApplicationApiMock();
    const direct = await directApi.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-keep");
    await directApi.rejectApplication(direct.body.applicationId, MOCK_CLIENT_USER_ID);
    await directApi.rejectPendingApplications("prj_open", {
      closureEventId: "cancel_keep",
      reason: "PROJECT_CANCELED",
      occurredAt: MOCK_NOW,
    });
    const kept = directApi.getApplicationRow(direct.body.applicationId);
    if (kept?.status === "REJECTED" && kept.rejectionType === "DIRECT") {
      pass("규칙 8: 이미 REJECTED는 덮지 않음");
    } else {
      fail("규칙 8: 이미 REJECTED는 덮지 않음", kept);
    }
  }

  // 규칙 9 — 권한
  {
    const api = createApplicationApiMock();
    await expectCode("규칙 9: 무인증 401", "AUTH_REQUIRED", () =>
      api.createApplication("prj_open", undefined, APPLY_BODY, "idem-auth"),
    );
    await expectCode("규칙 9: 의뢰인 생성 403", "PROJECT_FORBIDDEN", () =>
      api.createApplication("prj_open", MOCK_CLIENT_USER_ID, APPLY_BODY, "idem-client"),
    );
    await expectCode("규칙 9: 비의뢰인 목록 403", "PROJECT_FORBIDDEN", () =>
      api.listProjectApplications("prj_open", MOCK_OUTSIDER_USER_ID),
    );
    await expectCode("규칙 9: 없는 프로젝트 404", "PROJECT_NOT_FOUND", () =>
      api.listProjectApplications("prj_missing", MOCK_CLIENT_USER_ID),
    );
  }

  // 규칙 10 — 내 지원 transactionStatus
  {
    const api = createApplicationApiMock();
    const mine = await api.listMyApplications(MOCK_FREELANCER_USER_ID);
    const completed = mine.items.find((item) => item.applicationId === "app_completed");
    const deleted = mine.items.find((item) => item.applicationId === "app_deleted");
    if (completed?.status === "ACCEPTED" && completed.transactionStatus === "COMPLETED") {
      pass("규칙 10: listMy COMPLETED");
    } else {
      fail("규칙 10: listMy COMPLETED", completed);
    }
    if (deleted?.transactionStatus === null) {
      pass("규칙 10: 삭제된 프로젝트 transactionStatus null");
    } else {
      fail("규칙 10: 삭제된 프로젝트 transactionStatus null", deleted);
    }
    const canceled = mine.items.find((item) => item.applicationId === "app_canceled");
    if (canceled?.projectNotice === "CANCELED" && canceled.rejectionType === null) {
      pass("규칙 10: 취소 projectNotice CANCELED");
    } else {
      fail("규칙 10: 취소 projectNotice CANCELED", canceled);
    }
  }

  // eligibility · 프로필 게이트
  {
    const api = createApplicationApiMock();
    const ok = await api.getApplicationEligibility("prj_open", MOCK_FREELANCER_USER_ID);
    if (ok.canApply && ok.blockedReasons.length === 0 && ok.profileCompletion?.status === "COMPLETE") {
      pass("규칙 1: eligibility COMPLETE");
    } else {
      fail("규칙 1: eligibility COMPLETE", ok);
    }
    const incomplete = await api.getApplicationEligibility("prj_open", MOCK_INCOMPLETE_USER_ID);
    if (!incomplete.canApply && incomplete.blockedReasons.includes("PROFILE_INCOMPLETE")) {
      pass("규칙 1: eligibility INCOMPLETE");
    } else {
      fail("규칙 1: eligibility INCOMPLETE", incomplete);
    }
    await expectMessage("규칙 1: 미완성 생성 409", "PROFILE_INCOMPLETE", MSG_PROFILE_INCOMPLETE, () =>
      api.createApplication("prj_open", MOCK_INCOMPLETE_USER_ID, APPLY_BODY, "idem-inc"),
    );
    await expectCode("규칙 1: 프로필 없음 503", "DEPENDENCY_UNAVAILABLE", () =>
      createApplicationApiMock(MOCK_NOW, { omitProfilePort: true }).createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        APPLY_BODY,
        "idem-noport",
      ),
    );
    await expectCode("규칙 1: 프로필 UNAVAILABLE 503", "DEPENDENCY_UNAVAILABLE", () =>
      createApplicationApiMock(MOCK_NOW, { profiles: createUnavailableProfilePort() }).createApplication(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
        APPLY_BODY,
        "idem-unav",
      ),
    );
    await expectCode("규칙 9: eligibility 의뢰인 403", "PROJECT_FORBIDDEN", () =>
      api.getApplicationEligibility("prj_open", MOCK_CLIENT_USER_ID),
    );
    await expectCode("규칙 1: eligibility 포트 없음 503", "DEPENDENCY_UNAVAILABLE", () =>
      createApplicationApiMock(MOCK_NOW, { omitProfilePort: true }).getApplicationEligibility(
        "prj_open",
        MOCK_FREELANCER_USER_ID,
      ),
    );
  }

  // 단건 GET · 페이지
  {
    const api = createApplicationApiMock();
    const created = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-get");
    const detail = await api.getApplication(created.body.applicationId, MOCK_FREELANCER_USER_ID);
    if (detail.applicationId === created.body.applicationId && detail.projectNotice === "NONE") {
      pass("규칙 9: 단건 GET 본인");
    } else {
      fail("규칙 9: 단건 GET 본인", detail);
    }
    await expectCode("규칙 9: 단건 GET 비당사자 404", "APPLICATION_NOT_FOUND", () =>
      api.getApplication(created.body.applicationId, MOCK_OUTSIDER_USER_ID),
    );
    const paged = await api.listMyApplications(MOCK_FREELANCER_USER_ID, { page: 1, pageSize: 1 });
    if (paged.page === 1 && paged.pageSize === 1 && paged.totalCount >= 5 && paged.items.length === 1 && paged.totalPages >= 5) {
      pass("규칙 9: 목록 페이지 메타");
    } else {
      fail("규칙 9: 목록 페이지 메타", paged);
    }
  }

  // 202 · outbox
  {
    const api = createApplicationApiMock(MOCK_NOW, { holdOutbox: true });
    const first = await api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, APPLY_BODY, "idem-202-a");
    const second = await api.createApplication("prj_open", MOCK_FREELANCER_2_USER_ID, APPLY_BODY, "idem-202-b");
    const accepted = await api.acceptApplication(first.body.applicationId, MOCK_CLIENT_USER_ID, "idem-202-acc");
    const listedBefore = await api.listProjectApplications("prj_open", MOCK_CLIENT_USER_ID);
    const otherBefore = listedBefore.items.find((item) => item.applicationId === second.body.applicationId);
    if (accepted.httpStatus === 202 && accepted.postActionsStatus === "QUEUED" && otherBefore?.status === "PENDING") {
      pass("규칙 3: holdOutbox 202");
    } else {
      fail("규칙 3: holdOutbox 202", { accepted, otherBefore });
    }
    await api.processOutbox();
    const listedAfter = await api.listProjectApplications("prj_open", MOCK_CLIENT_USER_ID);
    const otherAfter = listedAfter.items.find((item) => item.applicationId === second.body.applicationId);
    const op = await api.getApplicationOperation(accepted.operationId, MOCK_CLIENT_USER_ID);
    const replay = await api.acceptApplication(first.body.applicationId, MOCK_CLIENT_USER_ID, "idem-202-acc");
    if (
      otherAfter?.rejectionType === "AUTO_OTHER_ACCEPTED" &&
      op.status === "SUCCEEDED" &&
      replay.httpStatus === 200 &&
      replay.replayed
    ) {
      pass("규칙 3: drain 후 200 재호출");
    } else {
      fail("규칙 3: drain 후 200 재호출", { otherAfter, op, replay });
    }
    await expectCode("규칙 9: operation 비의뢰인 404", "OPERATION_NOT_FOUND", () =>
      api.getApplicationOperation(accepted.operationId, MOCK_OUTSIDER_USER_ID),
    );
  }

  // 규칙 10 — UX 필수 요소
  {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ApplicationPanel } = await import("./web/ApplicationPanel");

    function htmlOf(view?: import("./web/ApplicationPanel").ApplicationView): string {
      return renderToStaticMarkup(React.createElement(ApplicationPanel, view ? { view } : undefined));
    }
    function hasText(name: string, html: string, text: string): void {
      if (html.includes(text)) pass(name);
      else fail(name, html);
    }

    const apply = htmlOf();
    hasText("규칙 10: 자기소개", apply, "자기소개");
    hasText("규칙 10: 희망 금액", apply, "희망 금액");
    hasText("규칙 10: 예상기간", apply, "예상기간");
    hasText("규칙 10: 지원하기", apply, "지원하기");
    hasText("규칙 10: 제출 확인 제목", apply, "지원서를 제출할까요?");
    hasText("규칙 10: 제출 후 수정 불가", apply, "제출 후에는 수정하거나 철회할 수 없습니다.");
    hasText("규칙 10: 제출하기", apply, "제출하기");
    hasText("규칙 10: 그만두기", apply, "그만두기");
    hasText("규칙 10: 제출 금액 재표시", apply, "1,000,000원");
    hasText("규칙 10: 제출 기간 재표시", apply, "30일");
    const manage = htmlOf("manage");
    hasText("규칙 10: 지원자 목록", manage, "지원자 목록");
    hasText("규칙 10: 수락", manage, "수락");
    hasText("규칙 10: 거절", manage, "거절");
    hasText("규칙 10: 내 지원 현황", htmlOf("mine"), "내 지원 현황");
    hasText("규칙 10: 검토 중", htmlOf("mine"), "검토 중");
    hasText("규칙 10: 선정됨", htmlOf("mineSelected"), "선정됨");
    hasText("규칙 10: 선정은 계약 완료 아님", htmlOf("mineSelected"), "계약 체결 완료가 아닙니다");
    hasText("규칙 10: 미선정", htmlOf("mineRejected"), "미선정");
    hasText("규칙 10: 거절 DIRECT", htmlOf("mineRejected"), REJECTION_COPY.DIRECT);
    hasText("규칙 10: 거절 AUTO_OTHER", htmlOf("mineRejected"), REJECTION_COPY.AUTO_OTHER_ACCEPTED);
    hasText("규칙 10: 거절 CLOSED", htmlOf("mineRejected"), REJECTION_COPY.AUTO_RECRUITMENT_CLOSED);
    hasText("규칙 10: 거절 AGREEMENT", htmlOf("mineRejected"), REJECTION_COPY.AGREEMENT_DECLINED);
    hasText("규칙 10: 완료됨", htmlOf("mineCompleted"), "완료됨");
    hasText("규칙 10: 리뷰 경로", htmlOf("mineCompleted"), "/projects/prj_completed/reviews");
    hasText("규칙 10: 로딩", htmlOf("loading"), "불러오는 중");
    hasText("규칙 10: LOAD_FAILED", htmlOf("loadFailed"), "불러오지 못했습니다");
    hasText("규칙 10: 다시 시도", htmlOf("loadFailed"), "다시 시도");
    hasText("규칙 10: 409 수락", htmlOf("conflict"), "다른 지원자가 먼저 수락되었습니다");
    hasText("규칙 10: 수락 확인", manage, "수락 확인");
    hasText("규칙 10: 취소", manage, "취소");
    hasText("규칙 10: 거절 되돌릴 수 없음", manage, "거절 후에는 되돌릴 수 없습니다.");
    hasText("규칙 10: 거절 확인", manage, "거절 확인");
    hasText("규칙 10: 빈 목록", htmlOf("manageEmpty"), "아직 지원자가 없습니다");
    hasText("규칙 10: 삭제된 프로젝트", htmlOf("mineDeleted"), "의뢰인이 삭제한 프로젝트입니다.");
    hasText("규칙 10: 프로필 미완성", htmlOf("applyBlocked"), MSG_PROFILE_INCOMPLETE);
    hasText("규칙 10: 후속 처리", htmlOf("acceptQueued"), MSG_ACCEPT_QUEUED);
    hasText("규칙 10: 프로젝트 취소", htmlOf("mineCanceled"), MSG_PROJECT_CANCELED);
    const allHtml = [
      apply,
      manage,
      htmlOf("loading"),
      htmlOf("manageEmpty"),
      htmlOf("mineDeleted"),
      htmlOf("mineCompleted"),
      htmlOf("mineSelected"),
      htmlOf("mineRejected"),
      htmlOf("applyBlocked"),
      htmlOf("acceptQueued"),
      htmlOf("mineCanceled"),
    ].join("\n");
    if (!/#[0-9A-Fa-f]{6}/.test(allHtml)) {
      pass("규칙 10: 화면에 원시 색상값 없음");
    } else {
      fail("규칙 10: 화면에 원시 색상값 없음", allHtml);
    }
  }

  console.log(`PASS ${passCount} / FAIL ${failCount}`);
  if (failCount > 0) process.exitCode = 1;
}

main();
