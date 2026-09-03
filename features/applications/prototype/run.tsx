import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOCK_CLIENT_USER_ID,
  MOCK_FREELANCER_2_USER_ID,
  MOCK_FREELANCER_USER_ID,
  MOCK_NOW,
  MOCK_OUTSIDER_USER_ID,
} from "./server/application.constants";
import { createApplicationApiMock } from "./mock/application.mock";
import {
  ApplicationApiError,
  isApplicationApiError,
  type ApplicationApiErrorCode,
} from "./server/application.types";

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

const APPLY_BODY = {
  coverLetter: "일정과 스택이 맞습니다.",
  expectedAmount: 1_000_000,
  expectedDurationDays: 30,
};

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
      api.createApplication("prj_open", MOCK_FREELANCER_USER_ID, { ...APPLY_BODY, expectedAmount: 2 }, "idem-other"),
    );
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
    const manage = htmlOf("manage");
    hasText("규칙 10: 지원자 목록", manage, "지원자 목록");
    hasText("규칙 10: 수락", manage, "수락");
    hasText("규칙 10: 거절", manage, "거절");
    hasText("규칙 10: 내 지원 현황", htmlOf("mine"), "내 지원 현황");
    hasText("규칙 10: 로딩", htmlOf("loading"), "불러오는 중");
    hasText("규칙 10: LOAD_FAILED", htmlOf("loadFailed"), "불러오지 못했습니다");
    hasText("규칙 10: 다시 시도", htmlOf("loadFailed"), "다시 시도");
    hasText("규칙 10: 409 수락", htmlOf("conflict"), "다른 지원자가 먼저 수락되었습니다");
    const allHtml = [apply, manage, htmlOf("loading")].join("\n");
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
