/**
 * 대표페이지 히어로의 요약 카드.
 *
 * **로그인해야 보이는 자리다.** 비로그인에게 진행 중인 프로젝트를 보여줄 수 없다.
 * 그렇다고 자리를 비우면 히어로가 무너지고, 가짜 데이터를 두면 거짓말이 된다 —
 * 같은 껍데기에 **무엇이 보일지를** 적는다.
 *
 * 역할에 따라 내용이 다르다.
 *   의뢰인   내가 등록한 프로젝트의 진행 단계와 마감
 *   프리랜서 저장해 둔 프로젝트 / 없으면 둘러보기
 *   비로그인 로그인하면 무엇이 보이는지
 *
 * 배너 위로 24px 걸쳐 올라온다 — 두 조각이 하나로 읽히게 하는 겹 처리다.
 */
(function (global) {
  "use strict";

  /** 계약 이후 4단계. 조준영 쪽 데이터라 지금은 형식만 보인다 */
  var STAGES = ["합의", "계약", "결제", "납품"];

  function icon() {
    return '<span class="resume__ico" aria-hidden="true">' +
      '<svg width="21" height="21" viewBox="0 0 24 24">' +
        '<path fill="var(--navy-100)" d="M5 2.6h8.6L19.4 8v13.4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1z"/>' +
        '<path fill="var(--navy-200)" d="M13.6 2.6 19.4 8h-5.8z"/>' +
        '<path fill="none" stroke="var(--navy-700)" stroke-width="1.5" stroke-linejoin="round"' +
          ' d="M5 2.6h8.6L19.4 8v13.4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1z"/>' +
        '<path fill="none" stroke="var(--navy-700)" stroke-width="1.5" stroke-linecap="round"' +
          ' d="M7.6 12.4h8.8M7.6 16.4h5.6"/>' +
      "</svg></span>";
  }

  function steps(at) {
    return '<span class="resume__steps">' +
      STAGES.map(function (s, i) {
        return '<span class="resume__dot" data-on="' + (i <= at) + '"' +
          ' data-now="' + (i === at) + '" title="' + s + '"></span>';
      }).join("") +
      '<span class="resume__stage">' + STAGES[at] + "</span></span>";
  }

  function shell(anon, inner) {
    return '<div class="resume" data-anon="' + (anon ? "true" : "false") + '">' + inner + "</div>";
  }

  function render() {
    var slot = document.getElementById("resume");
    if (!slot) return;
    var S = global.PactFiveSession;
    var E = global.PactFiveEngine;
    var u = S ? S.user() : null;

    /* 비로그인 — 무엇이 보일지 말한다 */
    if (!u) {
      slot.innerHTML = shell(true,
        icon() +
        '<span class="resume__main">' +
          '<span class="resume__k">내 프로젝트</span>' +
          '<span class="resume__title">로그인하면 진행 중인 프로젝트와 마감이 여기 보입니다.</span>' +
        "</span>" +
        '<a class="btn secondary sm" href="#" data-notyet="login">로그인</a>');
      return;
    }

    /* 의뢰인 — 등록한 것 중 가장 급한 하나 */
    if (u.role === "CLIENT") {
      var mine = global.PactFiveManage ? global.PactFiveManage.mine() : [];
      var open = mine.filter(function (p) { return E.effectiveStatus(p) !== "CLOSED"; });
      if (open.length === 0) {
        slot.innerHTML = shell(true,
          icon() +
          '<span class="resume__main">' +
            '<span class="resume__k">내 프로젝트</span>' +
            '<span class="resume__title">진행 중인 프로젝트가 없습니다. 등록하면 여기서 한눈에 봅니다.</span>' +
          "</span>" +
          '<a class="btn secondary sm" href="register.html">프로젝트 등록</a>');
        return;
      }
      // 마감이 가장 가까운 것. 급한 것이 먼저 보여야 한다
      open.sort(function (a, b) { return new Date(a.deadlineAt) - new Date(b.deadlineAt); });
      var p = open[0];
      var dl = E.deadlineText(p.deadlineAt);
      // 지원이 들어왔으면 합의 단계로 본다. 실제 단계는 조준영 쪽 데이터다
      var at = p.applicationCount > 0 ? 1 : 0;

      slot.innerHTML = shell(false,
        icon() +
        '<span class="resume__main">' +
          '<span class="resume__k">내 프로젝트</span>' +
          '<span class="resume__title">' + E.esc(p.title) + "</span>" +
        "</span>" +
        steps(at) +
        '<span class="resume__due"><span>마감일</span><b class="num">' + dl.rel + "</b></span>" +
        '<a class="resume__go" href="mypage.html#tab=projects">전체 보기 ›</a>');
      return;
    }

    /* 프리랜서 — 저장해 둔 것 */
    var saved = E.list({ savedOnly: true, includeClosed: true, sortBy: "deadline" });
    if (saved.totalCount === 0) {
      slot.innerHTML = shell(true,
        icon() +
        '<span class="resume__main">' +
          '<span class="resume__k">저장한 프로젝트</span>' +
          '<span class="resume__title">카드의 별을 누르면 여기 모입니다.</span>' +
        "</span>" +
        '<a class="btn secondary sm" href="browse.html">프로젝트 둘러보기</a>');
      return;
    }
    var q = saved.items[0];
    var qd = E.deadlineText(q.deadlineAt);
    slot.innerHTML = shell(false,
      icon() +
      '<span class="resume__main">' +
        '<span class="resume__k">저장한 프로젝트 ' + saved.totalCount + "건 · 마감이 가장 가까운 것</span>" +
        '<span class="resume__title">' + E.esc(q.title) + "</span>" +
      "</span>" +
      '<span class="resume__due"><span>마감일</span><b class="num">' + qd.rel + "</b></span>" +
      '<a class="resume__go" href="mypage.html#tab=saved">전체 보기 ›</a>');
  }

  var bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    // 로그인·북마크가 바뀌면 이 카드도 따라간다. 안 그러면 옛 상태가 남는다
    document.addEventListener("pactfive:session", render);
    document.addEventListener("pactfive:bookmark", render);
  }

  global.PactFiveResume = { render: render, bind: bind };
})(window);
