/**
 * 목록 규칙을 화면에서 그대로 돌린다.
 *
 * `features/project-management/spec.md` 의 규칙을 옮긴 것이다. 시안이 서버 없이
 * 동작해야 하므로 같은 판정을 여기서 한 번 더 한다 — **규칙 번호를 주석에 붙여**
 * 나중에 서버와 어긋나면 어디를 봐야 하는지 알 수 있게 했다.
 *
 * 카드 렌더도 여기 있다. 세 화면(main · browse · detail)이 같은 카드를 쓰므로
 * 두 벌로 두면 한쪽만 고쳐진다.
 */
(function (global) {
  "use strict";

  var D = global.PactFiveData;
  var DAY = 24 * 60 * 60 * 1000;

  /* ═══════════ 판정 ═══════════ */

  /**
   * 규칙 14 — 모집 상태는 **저장값이 아니라 조회 시점**으로 판정한다.
   * 마감일이 지났으면 저장값이 OPEN 이어도 마감이다.
   */
  function effectiveStatus(p, now) {
    var t = now || Date.now();
    if (p.recruitmentStatus === "CLOSED") return "CLOSED";
    if (p.startAt && new Date(p.startAt).getTime() > t) return "SCHEDULED";
    if (new Date(p.deadlineAt).getTime() < t) return "CLOSED";
    return "OPEN";
  }

  /**
   * 규칙 62·63 — 검색어 판정.
   *
   * 62: 제목 · 설명 · **요구 기술 이름**에서 찾는다. 기술은 표시 이름과 코드 둘 다.
   *     제목·설명만 보면 "React" 가 0건이 된다 — React 를 요구하는 프로젝트가 있는데도.
   * 63: 띄어쓰기가 있으면 낱말로 끊어 **전부** 만족하는 것만 (AND).
   *     통째로 찾으면 "브랜드 디자인" 이 "브랜드 리뉴얼 디자인" 을 못 잡는다.
   */
  function matchesKeyword(p, keyword) {
    var words = String(keyword || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;

    var hay = [p.title, p.description]
      .concat(
        p.skills.map(function (id) { return D.skillName(id); }),
        p.skills,
      )
      .join(" ")
      .toLowerCase();

    return words.every(function (w) { return hay.indexOf(w) !== -1; });
  }

  /* ═══════════ 목록 ═══════════ */

  var PAGE_SIZE = 9; // 3열 × 3행. 통합 앱(app/web)도 같은 값을 쓴다

  /**
   * query: { keyword, category, skills[], minBudget, maxBudget, includeClosed, sortBy, page }
   */
  function list(query) {
    var q = query || {};
    var now = Date.now();

    var rows = D.PROJECTS.slice();

    // 규칙 10 — 모집 상태를 지정하지 않으면 마감된 것은 빼고 보여준다.
    // "찾는 곳"이라 지원할 수 없는 것이 첫 화면에 섞이면 목적에 어긋난다.
    if (!q.includeClosed) {
      rows = rows.filter(function (p) { return effectiveStatus(p, now) !== "CLOSED"; });
    }

    if (q.keyword) rows = rows.filter(function (p) { return matchesKeyword(p, q.keyword); });

    // 규칙 59 — 카테고리는 하나만. 프로젝트가 카테고리를 하나만 갖기 때문이다
    if (q.category) rows = rows.filter(function (p) { return p.category === q.category; });

    // 규칙 59 — 기술은 여러 개를 고르되 **전부 만족**하는 것만 (AND)
    if (q.skills && q.skills.length) {
      rows = rows.filter(function (p) {
        return q.skills.every(function (s) { return p.skills.indexOf(s) !== -1; });
      });
    }

    if (q.minBudget) rows = rows.filter(function (p) { return p.budget >= q.minBudget; });
    if (q.maxBudget) rows = rows.filter(function (p) { return p.budget <= q.maxBudget; });

    // 정렬 3종. **2차 기준을 반드시 둔다** — 같은 값이 여러 건일 때 순서가 요청마다
    // 달라지면 페이지를 넘길 때 같은 프로젝트가 두 번 나오거나 아예 빠진다 (PRD §3.6)
    var by = q.sortBy || "latest";
    rows.sort(function (a, b) {
      if (by === "deadline") {
        var d = new Date(a.deadlineAt) - new Date(b.deadlineAt);
        if (d !== 0) return d;
      } else if (by === "budget") {
        if (a.budget !== b.budget) return b.budget - a.budget;
      } else {
        var c = new Date(b.createdAt) - new Date(a.createdAt);
        if (c !== 0) return c;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var page = Math.min(Math.max(1, q.page || 1), totalPages);
    var start = (page - 1) * PAGE_SIZE;

    return {
      items: rows.slice(start, start + PAGE_SIZE),
      totalCount: total,
      page: page,
      pageSize: PAGE_SIZE,
      totalPages: totalPages,
    };
  }

  function find(id) {
    return D.PROJECTS.filter(function (p) { return p.id === id; })[0] || null;
  }

  /* ═══════════ 표시 ═══════════ */

  var STATUS_TEXT = {
    OPEN: { label: "모집 중", cls: "open" },
    SCHEDULED: { label: "모집 예정", cls: "scheduled" },
    CLOSED: { label: "모집 마감", cls: "closed" },
  };

  function won(n) {
    return n.toLocaleString("ko-KR") + "원";
  }

  /** 절대 날짜와 상대 기한을 **함께** 준다. 상대만 있으면 "5일 전"이 언제인지 알 수 없다 */
  function deadlineText(iso) {
    var days = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
    var abs = iso.slice(0, 10).replace(/-/g, ".");
    var rel;
    if (days < 0) rel = "마감됨";
    else if (days === 0) rel = "오늘 마감";
    else if (days === 1) rel = "내일 마감";
    else rel = "D-" + days;
    return { abs: abs, rel: rel };
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /**
   * 프로젝트 카드. 정보 9개 그룹을 늘 같은 순서로 둔다 —
   * 순서가 카드마다 다르면 눈으로 비교할 수 없다.
   */
  function cardHTML(p) {
    var st = STATUS_TEXT[effectiveStatus(p)];
    var c = D.CLIENTS[p.clientId];
    var dl = deadlineText(p.deadlineAt);
    var saved = global.PactFiveBookmarks && global.PactFiveBookmarks.has(p.id);

    var rate = c.reviewCount > 0
      ? '<span class="pcard__rate num">★ ' + c.rating.toFixed(1) + " (" + c.reviewCount + ")</span>"
      // 0.0 이나 별 0개로 그리면 "평가가 나쁘다"로 읽힌다. "아직 없다"와 다르다
      : '<span class="pcard__rate none">평가 없음</span>';

    return (
      '<article class="card pcard">' +
        '<div class="pcard__head">' +
          '<span class="pcard__cat">' + esc(D.categoryName(p.category)) + "</span>" +
          '<span class="badge ' + st.cls + '">' + st.label + "</span>" +
          '<button class="save" type="button" data-bookmark="' + p.id + '"' +
            ' aria-pressed="' + (saved ? "true" : "false") + '"' +
            ' aria-label="' + (saved ? "북마크 해제" : "북마크 저장") + '">' +
            (saved ? "★" : "☆") +
          "</button>" +
        "</div>" +
        '<h3 class="pcard__title"><a href="detail.html#id=' + p.id + '">' + esc(p.title) + "</a></h3>" +
        '<p class="pcard__client"><b>' + esc(c.name) + "</b>" + rate + "</p>" +
        '<p class="pcard__budget num">' + won(p.budget) + "</p>" +
        '<p class="pcard__skills">' +
          p.skills.map(function (s) { return '<span class="chip">' + esc(D.skillName(s)) + "</span>"; }).join("") +
        "</p>" +
        '<p class="pcard__meta">' +
          '<span class="num">지원 ' + p.applicationCount + "건</span>" +
          '<span class="due num">' + dl.abs + " · <b>" + dl.rel + "</b></span>" +
        "</p>" +
      "</article>"
    );
  }

  global.PactFiveEngine = {
    PAGE_SIZE: PAGE_SIZE,
    effectiveStatus: effectiveStatus,
    matchesKeyword: matchesKeyword,
    list: list,
    find: find,
    cardHTML: cardHTML,
    deadlineText: deadlineText,
    won: won,
    esc: esc,
    STATUS_TEXT: STATUS_TEXT,
  };
})(window);
