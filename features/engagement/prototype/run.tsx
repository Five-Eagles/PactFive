import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// features/engagement/prototype/의 로컬 실행 스크립트.
// 실행: npx tsx features/engagement/prototype/run.tsx
//
// 검증 대상은 두 가지다.
//   1) Mock이 spec.md 규칙대로 동작하는가
//   2) prototype/web/의 컴포넌트가 design/*.html의 "필수 요소 목록"을 전부 렌더링하는가
//
// 주의: 이 파일 안에서는 JSX 문법을 쓰지 않는다. React.createElement를 직접 쓴다.
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

let passCount = 0;
let failCount = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    passCount += 1;
    console.log("[PASS]", label);
  } else {
    failCount += 1;
    console.error("[FAIL]", label);
  }
}

function section(title: string): void {
  console.log("");
  console.log(`--- ${title} ---`);
}

async function main() {
  ensurePackagesInstalled();

  const { createBookmarkRepositoryMock, createFixedClock, createIdGenerator, BOOKMARK_SEEDS } =
    await import("./mock/bookmark.mock");
  const { createProjectReadMock, createUserReadMock } = await import("./mock/project-read.mock");
  const { createEngagementService } = await import("./server/bookmark.service");
  const { isEngagementError, BookmarkAlreadyExistsError } = await import("./server/bookmark.types");

  console.log("=== engagement prototype 로컬 실행 ===");

  const AT = "2026-08-28T09:00:00Z";
  const FREE = { userId: "usr_free_1", role: "FREELANCER" as const };
  const FREE2 = { userId: "usr_free_2", role: "FREELANCER" as const };
  const CLIENT = { userId: "usr_client_a", role: "CLIENT" as const };

  function newSvc() {
    const repo = createBookmarkRepositoryMock(createFixedClock(AT));
    const projectRead = createProjectReadMock();
    const svc = createEngagementService({
      repo,
      ports: { projectRead, userRead: createUserReadMock() },
      now: () => AT,
      newBookmarkId: createIdGenerator(),
    });
    return { svc, repo, projectRead };
  }

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
      if (!isEngagementError(err)) {
        check(false, `${label} — 계약 오류가 아닌 예외: ${(err as Error).message}`);
        return;
      }
      check(
        err.status === status && err.body.error.code === code,
        `${label} → ${err.status} ${err.body.error.code}`,
      );
    }
  }

  /* ═══════════ 1. 저장소 Mock ═══════════ */
  section("저장소 Mock");
  {
    const repo = createBookmarkRepositoryMock(createFixedClock(AT));
    check(BOOKMARK_SEEDS.length === 5, "시드 5건");
    check(repo.find("usr_free_1", "prj_open_free") !== null, "저장된 것을 찾는다");
    check(repo.find("usr_free_1", "prj_없음") === null, "없는 것은 null");
    check(repo.countByFreelancer("usr_free_1") === 4, "본인 것만 센다");
    check(repo.countByFreelancer("usr_free_2") === 1, "남의 것은 별개");

    const mine = repo.findByFreelancer("usr_free_1");
    const times = mine.map((b) => new Date(b.createdAt).getTime());
    check(
      times.every((t, i) => i === 0 || times[i - 1]! >= t),
      "규칙 10: 최근 저장순으로 준다",
    );

    // 규칙 32 — UNIQUE 제약을 흉내 낸다. 조용히 덮어쓰면 서비스의 중복 경로가 검증되지 않는다.
    let threw = false;
    try {
      repo.insert({
        bookmarkId: "bkm_dup",
        freelancerId: "usr_free_1",
        projectId: "prj_open_free",
        createdAt: AT,
      });
    } catch (e) {
      threw = e instanceof BookmarkAlreadyExistsError;
    }
    check(threw, "규칙 32: 중복 삽입은 UNIQUE 위반으로 실패한다");

    check(repo.remove("usr_free_1", "prj_open_free") === 1, "지우면 1건");
    check(repo.remove("usr_free_1", "prj_open_free") === 0, "규칙 2: 없는 것을 지우면 0건");
    check(repo.find("usr_free_1", "prj_open_free") === null, "규칙 4: 실제로 지워진다");

    const fresh = createBookmarkRepositoryMock(createFixedClock(AT));
    check(fresh.countByFreelancer("usr_free_1") === 4, "새로 만들면 시드 상태로 돌아온다");
  }

  /* ═══════════ 2. 북마크 추가 (규칙 1·3·5·6·7) ═══════════ */
  section("북마크 추가");
  {
    const { svc, repo } = newSvc();
    const res = await svc.addBookmark(FREE, "prj_reco_1");
    check(res.status === 200 && res.body.bookmarked, "추가 성공");
    check(res.body.changed, "처음이면 changed: true");
    check(repo.find("usr_free_1", "prj_reco_1") !== null, "저장소에 실제로 들어간다");

    // 규칙 1 — "1건 있는 상태로 만든다". 두 번째도 성공이다.
    const again = await svc.addBookmark(FREE, "prj_reco_1");
    check(again.status === 200 && again.body.bookmarked, "규칙 1: 재추가도 성공");
    check(!again.body.changed, "재추가는 changed: false");
    check(
      again.body.bookmarkedAt === res.body.bookmarkedAt,
      "규칙 3: 재추가해도 저장 시각이 갱신되지 않는다",
    );
    check(repo.countByFreelancer("usr_free_1") === 5, "행이 하나만 생겼다");
  }
  {
    // 규칙 7 — 마감된 프로젝트도 저장할 수 있다.
    const { svc } = newSvc();
    const closed = await svc.addBookmark(FREE2, "prj_closed");
    check(closed.body.bookmarked, "규칙 7: 마감된 프로젝트도 저장된다");
  }
  {
    const { svc } = newSvc();
    await expectError("비로그인 추가", 401, "AUTH_REQUIRED", () =>
      svc.addBookmark(null, "prj_open_free"),
    );
    await expectError("의뢰인 추가", 403, "BOOKMARK_ROLE_REQUIRED", () =>
      svc.addBookmark(CLIENT, "prj_open_free"),
    );
    await expectError("없는 프로젝트", 404, "PROJECT_NOT_FOUND", () =>
      svc.addBookmark(FREE, "prj_없음"),
    );
    await expectError("삭제된 프로젝트", 404, "PROJECT_NOT_FOUND", () =>
      svc.addBookmark(FREE, "prj_deleted"),
    );
  }

  /* ═══════════ 3. 북마크 제거 (규칙 2·4) ═══════════ */
  section("북마크 제거");
  {
    const { svc, repo } = newSvc();
    const res = await svc.removeBookmark(FREE, "prj_open_free");
    check(res.status === 200 && !res.body.bookmarked, "제거 성공");
    check(res.body.changed, "있던 것을 지우면 changed: true");
    check(repo.find("usr_free_1", "prj_open_free") === null, "규칙 4: 행이 실제로 사라진다");

    // 규칙 2 — "0건인 상태로 만든다". 없어도 오류가 아니다.
    const again = await svc.removeBookmark(FREE, "prj_open_free");
    check(again.status === 200 && !again.body.bookmarked, "규칙 2: 없는 것을 지워도 성공");
    check(!again.body.changed, "없던 것은 changed: false");

    check(
      repo.find("usr_free_2", "prj_open_free") !== null,
      "남의 북마크는 건드리지 않는다",
    );

    await expectError("비로그인 제거", 401, "AUTH_REQUIRED", () =>
      svc.removeBookmark(null, "prj_open_free"),
    );
    await expectError("의뢰인 제거", 403, "BOOKMARK_ROLE_REQUIRED", () =>
      svc.removeBookmark(CLIENT, "prj_open_free"),
    );
  }

  /* ═══════════ 4. 내 북마크 목록 (규칙 9~15) ═══════════ */
  section("내 북마크 목록");
  {
    const { svc, projectRead } = newSvc();
    const res = await svc.listBookmarks(FREE);

    check(res.status === 200, "목록 200");
    check(
      !res.body.items.some((i) => i.project.projectId === "prj_deleted"),
      "규칙 12: 삭제된 프로젝트는 빠진다",
    );
    check(res.body.totalCount === 3, "규칙 12: 총계도 삭제분을 뺀 값이다");
    check(
      res.body.items.every((i) => !("transactionStatus" in i.project)),
      "규칙 27: 거래 상태 키 자체가 없다",
    );
    check(
      res.body.items.every((i) => !("createdAt" in i.project)),
      "정렬용 createdAt 은 응답에 내보내지 않는다",
    );

    const times = res.body.items.map((i) => new Date(i.bookmarkedAt).getTime());
    check(
      times.every((t, i) => i === 0 || times[i - 1]! >= t),
      "규칙 10: 최근 저장순",
    );

    const closed = res.body.items.find((i) => i.project.projectId === "prj_closed");
    check(closed !== undefined, "규칙 13: 마감된 프로젝트는 목록에 남는다");
    check(closed?.canApply === false, "규칙 14: 마감된 것은 canApply false");

    const open = res.body.items.find((i) => i.project.projectId === "prj_open_free");
    check(open?.canApply === true, "모집 중인 것은 canApply true");

    check(res.body.pageSize === 10, "규칙 11: 기본 10개");
    check(projectRead.calls.bulk.length === 1, "카드 조회를 한 번에 묶어서 부른다");
  }
  {
    // 규칙 12 — 거른 뒤에 자른다. 순서가 반대면 삭제분이 낀 페이지만 짧아진다.
    const { svc } = newSvc();
    const p1 = await svc.listBookmarks(FREE, { page: 1, pageSize: 2 });
    check(p1.body.items.length === 2, "1페이지 2건");
    const p2 = await svc.listBookmarks(FREE, { page: 2, pageSize: 2 });
    check(p2.body.items.length === 1, "2페이지 1건 — 삭제분이 페이지를 갉아먹지 않는다");
    check(p1.body.totalPages === 2, "totalPages 계산");
  }
  {
    const { svc } = newSvc();
    const other = await svc.listBookmarks(FREE2);
    check(other.body.totalCount === 1, "규칙 9: 본인 것만 나온다");

    await expectError("비로그인 목록", 401, "AUTH_REQUIRED", () => svc.listBookmarks(null));
    await expectError("의뢰인 목록", 403, "BOOKMARK_ROLE_REQUIRED", () =>
      svc.listBookmarks(CLIENT),
    );
    await expectError("page 0", 422, "VALIDATION_ERROR", () => svc.listBookmarks(FREE, { page: 0 }));
    await expectError("pageSize 51", 422, "VALIDATION_ERROR", () =>
      svc.listBookmarks(FREE, { pageSize: 51 }),
    );
  }
  {
    // 규칙 15 — 비어 있어도 오류가 아니다.
    const repo = createBookmarkRepositoryMock(createFixedClock(AT), []);
    const svc = createEngagementService({
      repo,
      ports: { projectRead: createProjectReadMock(), userRead: createUserReadMock() },
      now: () => AT,
      newBookmarkId: createIdGenerator(),
    });
    const empty = await svc.listBookmarks(FREE);
    check(
      empty.status === 200 && empty.body.items.length === 0 && empty.body.totalCount === 0,
      "규칙 15: 빈 목록도 200",
    );
  }

  /* ═══════════ 4-2. 저장한 프로젝트 id (규칙 35·36) ═══════════ */
  section("저장한 프로젝트 id");
  {
    const { svc, projectRead } = newSvc();
    const res = await svc.listBookmarkedProjectIds(FREE);

    check(res.status === 200, "id 조회 200");
    check(Array.isArray(res.body.projectIds), "projectIds 배열");
    check(
      res.body.projectIds.every((id) => typeof id === "string"),
      "id 문자열만 담는다 — 카드 데이터를 넣지 않는다",
    );
    check(
      !("page" in res.body) && !("totalCount" in res.body),
      "규칙 36: 페이지를 나누지 않는다",
    );
    check(
      res.body.projectIds.includes("prj_deleted"),
      "삭제된 프로젝트도 남긴다 — 화면에 없는 id 는 대조 결과를 바꾸지 않는다",
    );
    check(
      projectRead.calls.bulk.length === 0 && projectRead.calls.candidates.length === 0,
      "프로젝트를 한 번도 조회하지 않는다 — 그래서 목록보다 가볍다",
    );

    // 규칙 11 이 10개로 끊는 것과 달리, 여기는 전부 준다.
    const paged = await svc.listBookmarks(FREE, { page: 1, pageSize: 2 });
    check(
      res.body.projectIds.length > paged.body.items.length,
      "2페이지에 있는 항목도 id 조회에는 들어 있다",
    );
  }
  {
    const { svc } = newSvc();
    const other = await svc.listBookmarkedProjectIds(FREE2);
    check(other.body.projectIds.length === 1, "규칙 9: 남의 것은 섞이지 않는다");

    await expectError("비로그인 id 조회", 401, "AUTH_REQUIRED", () =>
      svc.listBookmarkedProjectIds(null),
    );
    await expectError("의뢰인 id 조회", 403, "BOOKMARK_ROLE_REQUIRED", () =>
      svc.listBookmarkedProjectIds(CLIENT),
    );
  }

  /* ═══════════ 5. 추천 프로젝트 (규칙 16~28) ═══════════ */
  section("추천 프로젝트");
  {
    const { svc, projectRead } = newSvc();
    // 기준: prj_open_free — DESIGN · FIGMA
    const res = await svc.getRecommendations("prj_open_free");

    check(res.status === 200, "추천 200");
    check(res.body.items.length === 4, "규칙 22: 4건 고정");
    check(!("page" in res.body), "목록 껍데기를 쓰지 않는다");

    const ids = res.body.items.map((p) => p.projectId);
    // 1순위 둘(reco_2 가 더 최근) → 2순위 reco_3 → 3순위 reco_4
    check(
      ids[0] === "prj_reco_2" && ids[1] === "prj_reco_1",
      "규칙 20·21: 1순위(카테고리+기술) 안에서 최근 등록순",
    );
    check(ids[2] === "prj_reco_3", "규칙 20: 2순위는 카테고리만 같음");
    check(ids[3] === "prj_reco_4", "규칙 20: 3순위는 기술만 겹침");

    check(!ids.includes("prj_open_free"), "규칙 18: 자기 자신을 추천하지 않는다");
    check(!ids.includes("prj_reco_closed"), "규칙 19: 마감된 것은 겹쳐도 추천하지 않는다");
    check(!ids.includes("prj_reco_none"), "카테고리도 기술도 안 겹치면 후보가 아니다");
    check(!ids.includes("prj_deleted"), "규칙 18: 삭제된 것은 추천하지 않는다");

    check(
      res.body.items.every((p) => !("transactionStatus" in p)),
      "규칙 27: 거래 상태 키가 없다",
    );
    check(
      res.body.items.every((p) => !("createdAt" in p) && !("tier" in p) && !("score" in p)),
      "규칙 28: 내부 점수·순위값을 내보내지 않는다",
    );
    check(
      projectRead.calls.candidates[0]?.excludeProjectId === "prj_open_free",
      "후보 거르기는 project-management 에 맡긴다",
    );
  }
  {
    // 규칙 23 — 4건보다 적으면 있는 만큼. 규칙 24 — 0건도 오류가 아니다.
    const { svc } = newSvc();
    const few = await svc.getRecommendations("prj_reco_none");
    check(few.body.items.length < 4, "규칙 23: 후보가 적으면 있는 만큼만");
    check(few.status === 200, "규칙 24: 적어도 200");

    await expectError("없는 프로젝트의 추천", 404, "PROJECT_NOT_FOUND", () =>
      svc.getRecommendations("prj_없음"),
    );
    await expectError("삭제된 프로젝트의 추천", 404, "PROJECT_NOT_FOUND", () =>
      svc.getRecommendations("prj_deleted"),
    );
  }
  {
    // 규칙 16 — 로그인 없이도 볼 수 있다. 위 호출들이 전부 auth 없이 돌았다는 것을 명시한다.
    const { svc } = newSvc();
    const anon = await svc.getRecommendations("prj_closed");
    check(anon.status === 200, "규칙 16: 비로그인도 추천을 볼 수 있다");
  }

  /* ═══════════ 6. 화면 필수 요소 9개 ═══════════ */
  section("화면 필수 요소 — high-fi-bookmarks.html");

  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { MyBookmarks } = await import("./web/MyBookmarks");
  const { RecommendationSection } = await import("./web/RecommendationSection");
  const { BookmarkButton } = await import("./web/BookmarkButton");

  /**
   * `design/high-fi-bookmarks.html` 의 "필수 요소 목록" 9개를 그대로 옮긴 것이다.
   * 8개는 PRD §14 문구표, 1개(`추천 프로젝트`)는 §7.2 화면 이름이다.
   * **이 목록에 없는 문구를 여기 넣지 않는다** — 넣는 순간 정본과 갈라진다.
   */
  const REQUIRED = [
    "북마크 해제",
    "지원하기",
    "모집이 마감되었습니다",
    "모집 중",
    "모집 마감",
    "저장한 프로젝트가 없습니다",
    "관심 있는 프로젝트를 북마크해 두면 여기에 모여요.",
    "프로젝트 둘러보기",
    "추천 프로젝트",
  ];

  const card = (o: {
    id: string;
    title: string;
    status: "OPEN" | "CLOSED";
    canApply: boolean;
    savedAt: string;
  }) => ({
    bookmarkId: `bkm_${o.id}`,
    bookmarkedAt: o.savedAt,
    canApply: o.canApply,
    project: {
      projectId: o.id,
      title: o.title,
      category: { category: "DESIGN", displayName: "디자인" },
      budgetAmount: 3_400_000,
      recruitmentDeadlineAt: "2026-09-16T14:59:59Z",
      recruitmentStatus: o.status,
      skills: [{ skillId: "FIGMA", displayName: "Figma" }],
      applicationCount: 0,
    },
  });

  // 시안의 기본 렌더링과 같은 구성 — 모집 중 하나, 마감 하나.
  const listHtml = renderToStaticMarkup(
    React.createElement(MyBookmarks, {
      items: [
        card({ id: "prj_a", title: "배달 앱 UI 개선", status: "OPEN", canApply: true, savedAt: "2026-08-25T10:00:00Z" }),
        card({ id: "prj_b", title: "쇼핑몰 웹사이트 구축", status: "CLOSED", canApply: false, savedAt: "2026-08-20T09:00:00Z" }),
      ],
    }),
  );
  const emptyHtml = renderToStaticMarkup(React.createElement(MyBookmarks, {}));
  const recoHtml = renderToStaticMarkup(
    React.createElement(RecommendationSection, {
      items: [
        {
          projectId: "prj_r1",
          title: "랜딩 페이지 제작",
          category: { category: "DESIGN", displayName: "디자인" },
          budgetAmount: 2_800_000,
          recruitmentDeadlineAt: "2026-09-20T14:59:59Z",
          recruitmentStatus: "OPEN" as const,
          skills: [{ skillId: "REACT", displayName: "React" }],
          applicationCount: 1,
        },
      ],
    }),
  );

  function decode(html: string): string {
    return html
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }

  const allHtml = decode([listHtml, emptyHtml, recoHtml].join("\n"));
  for (const text of REQUIRED) {
    check(allHtml.includes(text), `"${text}"`);
  }
  check(REQUIRED.length === 9, `필수 요소 합계 9개 (실제 ${REQUIRED.length}개)`);
  check(!/#[0-9A-Fa-f]{6}/.test(allHtml), "화면에 원시 색상값(#RRGGBB)이 박혀 있지 않다");

  /* --- 화면 규칙 --- */
  section("화면 규칙");
  {
    // 규칙 24 — 후보가 없으면 섹션 자체를 그리지 않는다.
    const hidden = renderToStaticMarkup(React.createElement(RecommendationSection, {}));
    check(hidden === "", "규칙 24: 추천 후보가 없으면 섹션을 렌더링하지 않는다");
    check(
      !hidden.includes("추천"),
      "규칙 24: 빈 상태 안내 문구도 남기지 않는다 (내 북마크와 다르다)",
    );

    // 규칙 28 — 순위값이 화면에 나오지 않는다.
    check(
      !recoHtml.includes("1순위") && !recoHtml.includes("tier") && !recoHtml.includes("score"),
      "규칙 28: 순위·점수를 화면에 쓰지 않는다",
    );

    // 규칙 30 — 의뢰인에게는 아이콘 자체를 그리지 않는다.
    const forClient = renderToStaticMarkup(
      React.createElement(BookmarkButton, { projectId: "prj_a", viewer: { role: "CLIENT" } }),
    );
    check(forClient === "", "규칙 30: 의뢰인에게는 북마크 아이콘을 표시하지 않는다");

    const forAnon = renderToStaticMarkup(
      React.createElement(BookmarkButton, { projectId: "prj_a", viewer: null }),
    );
    check(forAnon.includes("<button"), "규칙 30: 비로그인에게는 표시한다 (누르면 로그인 유도)");

    const forFree = renderToStaticMarkup(
      React.createElement(BookmarkButton, {
        projectId: "prj_a",
        viewer: { role: "FREELANCER" },
        initialBookmarked: true,
      }),
    );
    check(forFree.includes('aria-pressed="true"'), "규칙 30: 프리랜서는 저장 상태가 반영된다");

    // 규칙 13 — 마감된 것이 목록에 남아 있다.
    check(
      listHtml.includes("쇼핑몰 웹사이트 구축"),
      "규칙 13: 마감된 프로젝트도 목록에 남는다",
    );
    // 규칙 14 — 지원만 막힌다.
    check(listHtml.includes("disabled"), "규칙 14: 마감된 항목은 지원 버튼이 비활성이다");
  }

  /* ═══════════ 8. 추천 사유 (CR-0006 · §6 근거 이해) ═══════════ */
  section("근거 이해 — 추천 사유");
  {
    const { svc } = newSvc();
    // 기준: prj_open_free — DESIGN · FIGMA
    const res = await svc.getRecommendations("prj_open_free");

    const byId = new Map(res.body.items.map((p) => [p.projectId, p]));
    check(
      byId.get("prj_reco_2")?.reason === "SAME_CATEGORY_AND_SKILL",
      "1순위는 SAME_CATEGORY_AND_SKILL",
    );
    check(byId.get("prj_reco_3")?.reason === "SAME_CATEGORY", "2순위는 SAME_CATEGORY");
    check(byId.get("prj_reco_4")?.reason === "SHARED_SKILL", "3순위는 SHARED_SKILL");
    check(
      byId.get("prj_reco_2")?.matchedSkills.includes("Figma") === true,
      "무엇이 겹쳤는지까지 준다",
    );
    check(
      byId.get("prj_reco_3")?.matchedSkills.length === 0,
      "카테고리만 같으면 겹친 기술이 없다",
    );

    // 규칙 28 — 금지한 것은 점수와 순위값이다. 사유 문구는 대상이 아니다.
    check(
      res.body.items.every((p) => !("tier" in p) && !("score" in p) && !("rank" in p)),
      "규칙 28: 순위값·점수는 여전히 내보내지 않는다",
    );

    const html = decode(
      renderToStaticMarkup(
        React.createElement(RecommendationSection, {
          items: res.body.items.map((p) => ({ ...p, recruitmentStatus: p.recruitmentStatus })),
        }),
      ),
    );
    check(html.includes("디자인 · Figma 가 같아요"), "화면에 사유가 문장으로 나온다");
    check(html.includes("디자인 분야예요"), "카테고리만 같을 때의 문구");
    check(
      !html.includes("1순위") && !html.includes("2순위"),
      "순위 표현은 화면에도 없다",
    );

    // 사유를 모르면 지어내지 않는다.
    const noReason = renderToStaticMarkup(
      React.createElement(RecommendationSection, {
        items: [
          {
            projectId: "prj_x",
            title: "제목",
            category: { category: "DESIGN", displayName: "디자인" },
            budgetAmount: 1_000_000,
            recruitmentDeadlineAt: "2026-09-20T14:59:59Z",
            recruitmentStatus: "OPEN" as const,
            skills: [],
            applicationCount: 0,
          },
        ],
      }),
    );
    check(!noReason.includes("reco__why"), "사유를 모르면 아무 말도 하지 않는다");
  }

  section("결과");
  console.log(`PASS ${passCount} · FAIL ${failCount}`);
  if (failCount > 0) process.exitCode = 1;
}

main();
