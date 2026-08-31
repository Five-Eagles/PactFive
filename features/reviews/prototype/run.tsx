import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MOCK_CLIENT_USER_ID,
  MOCK_FREELANCER_USER_ID,
  MOCK_OUTSIDER_USER_ID,
  MOCK_UNREVIEWED_USER_ID,
} from "./server/review.constants";
import { createReviewApiMock } from "./mock/review.mock";
import { ReviewApiError, isReviewApiError, type ReviewApiErrorCode } from "./server/review.types";
import { assertReviewWriteMethod } from "./server/review.service";
import { isReviewMethodAllowed, REVIEW_ROUTES } from "./server/review.routes";

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
  code: ReviewApiErrorCode,
  run: () => Promise<unknown>,
): Promise<void> {
  try {
    await run();
    fail(name, "오류가 나지 않았습니다");
  } catch (err) {
    if (isReviewApiError(err) && err.body.error.code === code) {
      pass(name);
      return;
    }
    fail(name, err);
  }
}

const CLIENT_BODY = {
  rating: 5 as const,
  comment: "일정과 품질이 좋았습니다.",
  tags: ["RESPONSIBILITY", "DELIVERABLE_QUALITY"],
};

const FREELANCER_BODY = {
  rating: 4 as const,
  comment: "요구가 명확했습니다.",
  tags: ["REQUIREMENT_CLARITY", "PAYMENT_RELIABILITY"],
};

async function main() {
  ensurePackagesInstalled();
  console.log("=== reviews prototype 로컬 실행 ===");

  // 규칙 1 — COMPLETED만 작성, 미완료 거부
  {
    const api = createReviewApiMock();
    const created = await api.createReview("prj_completed", MOCK_CLIENT_USER_ID, CLIENT_BODY, "idem-ok");
    if (
      created.httpStatus === 201 &&
      created.body.direction === "CLIENT_TO_FREELANCER" &&
      created.body.reviewId.startsWith("rvw_") &&
      created.body.isPublic === false
    ) {
      pass("규칙 1: COMPLETED 작성");
    } else {
      fail("규칙 1: COMPLETED 작성", created);
    }
    await expectCode("규칙 1: 미완료 거부", "TRANSACTION_NOT_COMPLETED", () =>
      api.createReview("prj_in_progress", MOCK_CLIENT_USER_ID, CLIENT_BODY, "idem-in-progress"),
    );
  }

  // 규칙 2 — 방향 추론, 비당사자 POST 403
  {
    const api = createReviewApiMock();
    const asFreelancer = await api.createReview(
      "prj_completed",
      MOCK_FREELANCER_USER_ID,
      FREELANCER_BODY,
      "idem-fr",
    );
    if (asFreelancer.body.direction === "FREELANCER_TO_CLIENT" && asFreelancer.body.revieweeId === MOCK_CLIENT_USER_ID) {
      pass("규칙 2: 프리랜서 방향 추론");
    } else {
      fail("규칙 2: 프리랜서 방향 추론", asFreelancer);
    }
    await expectCode("규칙 2: 비당사자 POST 403", "PROJECT_FORBIDDEN", () =>
      api.createReview("prj_completed", MOCK_OUTSIDER_USER_ID, CLIENT_BODY, "idem-out"),
    );
  }

  // 규칙 3 — 방향당 1회 409, 멱등 같은 본문 200
  {
    const api = createReviewApiMock();
    const first = await api.createReview("prj_completed", MOCK_CLIENT_USER_ID, CLIENT_BODY, "idem-dup");
    const again = await api.createReview("prj_completed", MOCK_CLIENT_USER_ID, CLIENT_BODY, "idem-dup");
    if (again.httpStatus === 200 && again.body.reviewId === first.body.reviewId) {
      pass("규칙 3: 같은 키·본문 멱등 200");
    } else {
      fail("규칙 3: 같은 키·본문 멱등 200", again);
    }
    await expectCode("규칙 3: 방향당 1회 409", "REVIEW_ALREADY_EXISTS", () =>
      api.createReview("prj_completed", MOCK_CLIENT_USER_ID, { ...CLIENT_BODY, rating: 4 }, "idem-dup-2"),
    );
  }

  // 규칙 4 — PATCH 없음
  {
    try {
      assertReviewWriteMethod("PATCH");
      fail("규칙 4: PATCH 405", "오류가 나지 않았습니다");
    } catch (err) {
      if (err instanceof ReviewApiError && err.httpStatus === 405) {
        pass("규칙 4: PATCH 405");
      } else {
        fail("규칙 4: PATCH 405", err);
      }
    }
    const hasPatchRoute = REVIEW_ROUTES.some((route) => route.method === "PATCH");
    if (!hasPatchRoute && !isReviewMethodAllowed("PATCH")) {
      pass("규칙 4: PATCH 라우트 없음");
    } else {
      fail("규칙 4: PATCH 라우트 없음", REVIEW_ROUTES);
    }
  }

  // 규칙 5 — 양쪽 즉시 공개
  {
    const api = createReviewApiMock();
    await api.createReview("prj_completed", MOCK_CLIENT_USER_ID, CLIENT_BODY, "idem-both-c");
    const second = await api.createReview("prj_completed", MOCK_FREELANCER_USER_ID, FREELANCER_BODY, "idem-both-f");
    const listed = await api.listProjectReviews("prj_completed", MOCK_CLIENT_USER_ID);
    if (second.body.isPublic === true && listed.items.length === 2 && listed.items.every((item) => item.isPublic)) {
      pass("규칙 5: 양쪽 즉시 공개");
    } else {
      fail("규칙 5: 양쪽 즉시 공개", { second, listed });
    }
  }

  // 규칙 6 — 14일 단독 공개, 미공개 INSERT에는 이벤트 없음
  {
    const api = createReviewApiMock();
    await api.createReview("prj_completed", MOCK_CLIENT_USER_ID, CLIENT_BODY, "idem-solo");
    if (api.getPublishedEvents().length === 0) {
      pass("규칙 6: 미공개 INSERT에 REVIEW_CREATED 없음");
    } else {
      fail("규칙 6: 미공개 INSERT에 REVIEW_CREATED 없음", api.getPublishedEvents());
    }
    const due = await api.listProjectReviews("prj_solo_due", MOCK_OUTSIDER_USER_ID);
    if (due.items.length === 1 && due.items[0].isPublic === true) {
      pass("규칙 6: 14일 단독 공개");
    } else {
      fail("규칙 6: 14일 단독 공개", due);
    }
    await api.publishDueSoloReviews();
    const events = api.getPublishedEvents();
    if (events.some((event) => event.reviewId === "rvw_solo_due")) {
      pass("규칙 6: 공개 시점에 REVIEW_CREATED 발행");
    } else {
      fail("규칙 6: 공개 시점에 REVIEW_CREATED 발행", events);
    }
  }

  // 규칙 7 — 공개분만 평균, users 미갱신
  {
    const api = createReviewApiMock();
    const empty = await api.getReviewSummary(MOCK_UNREVIEWED_USER_ID, MOCK_CLIENT_USER_ID);
    if (empty.averageRating === null && empty.reviewCount === 0) {
      pass("규칙 7: 공개 리뷰 없으면 null");
    } else {
      fail("규칙 7: 공개 리뷰 없으면 null", empty);
    }
    const summary = await api.getReviewSummary(MOCK_FREELANCER_USER_ID, MOCK_CLIENT_USER_ID);
    if (summary.averageRating === 4.5 && summary.reviewCount === 4) {
      pass("규칙 7: 공개분만 평균");
    } else {
      fail("규칙 7: 공개분만 평균", summary);
    }
    const cache = api.getUserCache(MOCK_FREELANCER_USER_ID);
    if (cache && cache.ratingAverage === null && cache.reviewCount === 0) {
      pass("규칙 7: users 캐시 미갱신");
    } else {
      fail("규칙 7: users 캐시 미갱신", cache);
    }
  }

  // 규칙 8 — CANCELED 거부
  {
    const api = createReviewApiMock();
    await expectCode("규칙 8: 거래 취소 409", "PROJECT_TRANSITION_CONFLICT", () =>
      api.createReview("prj_canceled", MOCK_CLIENT_USER_ID, CLIENT_BODY, "idem-cancel"),
    );
    await expectCode("규칙 8: 계약 취소 409", "PROJECT_TRANSITION_CONFLICT", () =>
      api.createReview("prj_contract_canceled", MOCK_CLIENT_USER_ID, CLIENT_BODY, "idem-ctr-cancel"),
    );
  }

  // 규칙 9 — 비당사자 공개만, 당사자 본인 미공개, 401
  {
    const api = createReviewApiMock();
    const outsiderFresh = await api.listProjectReviews("prj_solo_fresh", MOCK_OUTSIDER_USER_ID);
    if (outsiderFresh.items.length === 0) {
      pass("규칙 9: 비당사자 공개만");
    } else {
      fail("규칙 9: 비당사자 공개만", outsiderFresh);
    }
    const clientFresh = await api.listProjectReviews("prj_solo_fresh", MOCK_CLIENT_USER_ID);
    const freelancerFresh = await api.listProjectReviews("prj_solo_fresh", MOCK_FREELANCER_USER_ID);
    if (
      clientFresh.items.length === 1 &&
      clientFresh.items[0].isPublic === false &&
      freelancerFresh.items.length === 0
    ) {
      pass("규칙 9: 당사자 본인 미공개·상대 숨김");
    } else {
      fail("규칙 9: 당사자 본인 미공개·상대 숨김", { clientFresh, freelancerFresh });
    }
    await expectCode("규칙 9: 무인증 401", "AUTH_REQUIRED", () =>
      api.listProjectReviews("prj_both", undefined),
    );
  }

  // 규칙 10 — 잘못된 태그 422, 서버가 식별자를 채움, contractId 무시
  {
    const api = createReviewApiMock();
    await expectCode("규칙 10: 잘못된 태그 422", "VALIDATION_ERROR", () =>
      api.createReview(
        "prj_completed",
        MOCK_CLIENT_USER_ID,
        { rating: 5, tags: ["REQUIREMENT_CLARITY"] },
        "idem-bad-tag",
      ),
    );
    await expectCode("규칙 10: 별점 범위 422", "VALIDATION_ERROR", () =>
      api.createReview("prj_completed", MOCK_CLIENT_USER_ID, { rating: 6, tags: [] }, "idem-bad-rating"),
    );
    const created = await api.createReview(
      "prj_completed",
      MOCK_CLIENT_USER_ID,
      { ...CLIENT_BODY, contractId: "ctr_forged", direction: "FREELANCER_TO_CLIENT" },
      "idem-fields",
    );
    if (
      created.body.contractId === "ctr_prj_completed" &&
      created.body.direction === "CLIENT_TO_FREELANCER" &&
      created.body.reviewerId === MOCK_CLIENT_USER_ID &&
      created.body.revieweeId === MOCK_FREELANCER_USER_ID
    ) {
      pass("규칙 10: 서버가 식별자 채움");
    } else {
      fail("규칙 10: 서버가 식별자 채움", created);
    }
  }

  // 규칙 13 완료 기준 — 양쪽 공개 시 이벤트 2건
  {
    const api = createReviewApiMock();
    await api.createReview("prj_completed", MOCK_CLIENT_USER_ID, CLIENT_BODY, "idem-evt-c");
    await api.createReview("prj_completed", MOCK_FREELANCER_USER_ID, FREELANCER_BODY, "idem-evt-f");
    if (api.getPublishedEvents().length === 2) {
      pass("규칙 13: 양쪽 공개 시 REVIEW_CREATED 2건");
    } else {
      fail("규칙 13: 양쪽 공개 시 REVIEW_CREATED 2건", api.getPublishedEvents());
    }
    await expectCode("규칙 13: 없는 프로젝트 404", "PROJECT_NOT_FOUND", () =>
      api.listProjectReviews("prj_missing", MOCK_CLIENT_USER_ID),
    );
  }

  // 규칙 11 — UX 필수 요소·로딩·빈·LOAD_FAILED·409·수정 없음
  {
    const React = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { ReviewPanel } = await import("./web/ReviewPanel");

    function htmlOf(view?: string): string {
      return renderToStaticMarkup(React.createElement(ReviewPanel, view ? { view } : undefined));
    }
    function hasText(name: string, html: string, text: string): void {
      if (html.includes(text)) pass(name);
      else fail(name, html);
    }

    const empty = htmlOf();
    hasText("규칙 11: 필수 별점", empty, "별점");
    hasText("규칙 11: 필수 리뷰 작성", empty, "리뷰 작성");
    hasText("규칙 11: 빈 상대 미작성", empty, "상대 리뷰는 아직 없습니다");
    hasText("규칙 11: 로딩", htmlOf("loading"), "로딩");
    hasText("규칙 11: LOAD_FAILED", htmlOf("loadFailed"), "LOAD_FAILED");
    hasText("규칙 11: LOAD_FAILED 재시도", htmlOf("loadFailed"), "다시 시도");
    hasText("규칙 11: 409 중복", htmlOf("duplicate"), "이미 작성한 리뷰입니다");
    hasText("규칙 11: 409 미완료", htmlOf("incomplete"), "거래가 완료되지 않았습니다");
    hasText("규칙 11: 409 취소", htmlOf("canceled"), "취소된 거래는 리뷰할 수 없습니다");
    const submitted = htmlOf("submitted");
    if (!submitted.includes("수정")) {
      pass("규칙 11: 제출 후 수정 버튼 없음");
    } else {
      fail("규칙 11: 제출 후 수정 버튼 없음", submitted);
    }
    const allHtml = [empty, htmlOf("loading"), htmlOf("loadFailed"), submitted].join("\n");
    if (!/#[0-9A-Fa-f]{6}/.test(allHtml)) {
      pass("규칙 11: 화면에 원시 색상값 없음");
    } else {
      fail("규칙 11: 화면에 원시 색상값 없음", allHtml);
    }
  }

  console.log(`PASS ${passCount} / FAIL ${failCount}`);
  if (failCount > 0) process.exitCode = 1;
}

main();
