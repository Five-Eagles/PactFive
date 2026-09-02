/**
 * 내 프로젝트 · 수정 · 재모집 (SCR-B07 · B06 · B10).
 *
 * 문구는 `design/high-fi-manage.html` 의 「필수 요소 목록」이 정본이다.
 *
 * **잠금을 화면이 계산하지 않는다** (규칙 13). 서버가 준 `editableFields` ·
 * `availableActions` 를 그대로 따른다. 화면이 다시 계산하면 규칙이 두 곳에 생기고,
 * 언젠가 한쪽만 고쳐진다. 여기서는 서버가 없으므로 `permissions()` 하나가
 * 그 자리를 대신하고 — **화면 코드는 그 결과만 읽는다.**
 */
(function (global) {
  "use strict";

  var D = global.PactFiveData;
  var E = global.PactFiveEngine;
  var S = global.PactFiveSession;

  /* ═══════════ 서버가 판정할 자리 ═══════════ */

  /**
   * 규칙 13 — 무엇을 고칠 수 있고 무엇을 할 수 있는가.
   * 실제로는 `GET /api/v1/clients/:id/projects` 응답에 들어 있다.
   */
  function permissions(p) {
    var st = E.effectiveStatus(p);
    var pending = p.applicationCount;      // 대기 중인 지원 수
    var inTransaction = !!p.transaction;   // 계약 이후 단계인가

    var editable = ["title", "description", "category", "skillIds"];
    // 규칙 15 — 지원자가 생기면 예산과 모집 일정이 잠긴다.
    // 지원한 뒤에 조건이 바뀌면 지원자가 다른 조건으로 지원한 셈이 된다.
    if (pending === 0 && !inTransaction) {
      editable.push("budgetAmount", "recruitmentStartAt", "recruitmentDeadlineAt");
    }
    if (st === "CLOSED" || inTransaction) editable = [];

    var actions = [];
    if (editable.length) actions.push("EDIT");
    if (st === "OPEN" || st === "SCHEDULED") actions.push("CLOSE_RECRUITMENT");
    if (st === "CLOSED" && !inTransaction) actions.push("REOPEN_RECRUITMENT");
    if (!inTransaction) actions.push("CANCEL");
    // 규칙 — 대기 지원이 있으면 지울 수 없다. 지원자 쪽 기록이 함께 사라진다
    if (pending === 0 && !inTransaction) actions.push("DELETE");

    return { editable: editable, actions: actions, pending: pending, status: st };
  }

  var LABEL = {
    EDIT: "수정",
    CLOSE_RECRUITMENT: "모집 마감",
    REOPEN_RECRUITMENT: "다시 모집하기",
    CANCEL: "프로젝트 취소",
    DELETE: "삭제",
  };

  /** 왜 막혔는지. 버튼만 사라지면 이유를 알 수 없다 */
  function blocked(id, perm) {
    if (id === "DELETE" && perm.pending > 0) {
      return "지원자 " + perm.pending + "명이 있어 삭제할 수 없습니다";
    }
    if (id === "EDIT" && perm.status === "CLOSED") return "모집이 마감되어 수정할 수 없습니다";
    if (id === "CLOSE_RECRUITMENT" && perm.status === "CLOSED") return "이미 마감되었습니다";
    if (id === "CANCEL") return "거래가 진행 중이라 취소할 수 없습니다";
    if (id === "DELETE") return "거래가 진행 중이라 삭제할 수 없습니다";
    return "";
  }

  /* ═══════════ 되돌릴 수 없는 행동 ═══════════ */

  var DESTRUCTIVE = { CLOSE_RECRUITMENT: 1, CANCEL: 1, DELETE: 1 };

  /** 끝난 뒤에 할 말. 라벨에 "했습니다"를 붙이면 "삭제 했습니다"가 된다 */
  var DONE = {
    CLOSE_RECRUITMENT: "모집을 마감했습니다.",
    CANCEL: "프로젝트를 취소했습니다.",
    DELETE: "프로젝트를 삭제했습니다.",
  };

  /**
   * 무슨 일이 일어나는지 먼저 말한다 (ux-philosophy §6 비파괴성).
   * 문구는 high-fi-manage.html 의 확인 다이얼로그 3종 그대로다.
   */
  function effects(id, p, perm) {
    if (id === "CLOSE_RECRUITMENT") {
      return {
        title: "모집을 마감할까요?",
        body: "마감하면 다시 모집할 수 없습니다." +
          (perm.pending > 0 ? " 대기 중인 지원 " + perm.pending + "건이 거절 처리됩니다." : ""),
        confirm: "마감하기",
      };
    }
    if (id === "CANCEL") {
      return {
        title: "프로젝트를 취소할까요?",
        body: "취소하면 되돌릴 수 없습니다." +
          (perm.pending > 0 ? " 선정된 프리랜서에게 취소 알림이 전송되고, 진행 중이던 계약이 무효 처리됩니다." : ""),
        confirm: "취소하기",
      };
    }
    return { title: "프로젝트를 삭제할까요?", body: "삭제하면 목록에서 사라집니다. 되돌릴 수 없습니다.", confirm: "삭제하기" };
  }

  /* ═══════════ 그리기 ═══════════ */

  function mine() {
    // 시안이라 로그인한 의뢰인의 것을 흉내 낸다. 실제로는
    // GET /api/v1/clients/:clientId/projects 가 본인 것만 준다 (규칙 17)
    return D.PROJECTS.filter(function (p) {
      return ["prj_p01", "prj_p02", "prj_p07", "prj_p08", "prj_p12"].indexOf(p.id) !== -1;
    });
  }

  function actionsHTML(p, perm) {
    var known = ["EDIT", "CLOSE_RECRUITMENT", "REOPEN_RECRUITMENT", "CANCEL", "DELETE"];
    return known.map(function (id) {
      var can = perm.actions.indexOf(id) !== -1;
      var why = can ? "" : blocked(id, perm);
      // 재모집은 마감된 것에만 뜬다. 늘 보이면 무엇이 가능한지 흐려진다
      if (id === "REOPEN_RECRUITMENT" && !can) return "";
      var danger = id === "CANCEL" || id === "DELETE";
      return '<span class="act">' +
        '<button class="btn ' + (danger ? "danger" : "secondary") + ' sm" type="button"' +
          ' data-act="' + id + '" data-id="' + p.id + '"' +
          (can ? "" : " disabled") +
          // 사유를 두 경로로 전한다. title 은 키보드·보조 기술에 전달되지 않는다
          (why ? ' title="' + why + '" aria-label="' + LABEL[id] + " — " + why + '"' : "") +
        ">" + LABEL[id] + "</button>" +
        (why ? '<span class="act__why">' + why + "</span>" : "") +
      "</span>";
    }).join("");
  }

  function listHTML() {
    var rows = mine();
    if (rows.length === 0) {
      return '<div class="empty" role="status">' +
        "<h3>등록한 프로젝트가 없습니다</h3>" +
        "<p>첫 프로젝트를 등록하고 프리랜서를 만나보세요.</p>" +
        '<a class="btn primary" href="register.html">프로젝트 등록</a></div>';
    }
    return '<ul class="mlist">' + rows.map(function (p) {
      var perm = permissions(p);
      var st = E.STATUS_TEXT[perm.status];
      var dl = E.deadlineText(p.deadlineAt);
      return '<li class="card mrow">' +
        '<div class="mrow__head">' +
          '<span class="badge ' + st.cls + '">' + st.label + "</span>" +
          '<span class="pcard__cat">' + E.esc(D.categoryName(p.category)) + "</span>" +
          '<a class="mrow__apps" href="#" data-notyet="apply">지원자 관리' +
            (perm.pending ? ' <b class="num">' + perm.pending + "</b>" : "") + "</a>" +
        "</div>" +
        '<h3 class="mrow__title"><a href="detail.html#id=' + p.id + '">' + E.esc(p.title) + "</a></h3>" +
        '<p class="mrow__facts">' +
          '<span class="num">' + E.won(p.budget) + "</span>" +
          '<span class="num">' + dl.abs + " · " + dl.rel + "</span>" +
          '<span class="num">지원 ' + p.applicationCount + "건</span>" +
        "</p>" +
        '<div class="acts">' + actionsHTML(p, perm) + "</div>" +
      "</li>";
    }).join("") + "</ul>";
  }

  /** SCR-B06 수정. 잠긴 칸은 숨기지 않고 **왜 잠겼는지 말한다** */
  function editHTML(p) {
    var perm = permissions(p);
    var can = function (f) { return perm.editable.indexOf(f) !== -1; };
    var lockNote = "지원자 " + perm.pending + "명이 있어 ";

    function box(id, label, control, locked, note) {
      return '<div class="field" data-locked="' + (locked ? "true" : "false") + '">' +
        '<label for="' + id + '">' + label + "</label>" + control +
        (locked ? '<p class="help">' + note + "</p>" : "") + "</div>";
    }

    return '<h2>프로젝트 수정</h2>' +
      box("e-title", "프로젝트 제목",
        '<input id="e-title" type="text" value="' + E.esc(p.title) + '"' +
        (can("title") ? "" : " readonly") + " />", !can("title"), "모집이 마감되어 수정할 수 없습니다.") +
      box("e-desc", "프로젝트 설명",
        '<textarea id="e-desc" rows="6"' + (can("description") ? "" : " readonly") + ">" +
        E.esc(p.description) + "</textarea>", !can("description"), "모집이 마감되어 수정할 수 없습니다.") +
      box("e-budget", "예산",
        '<input id="e-budget" type="text" value="' + p.budget.toLocaleString("ko-KR") + '"' +
        (can("budgetAmount") ? "" : " readonly") + " />",
        !can("budgetAmount"), lockNote + "예산은 변경할 수 없습니다.") +
      '<div class="two">' +
        box("e-start", "모집 시작일 (선택)",
          '<input id="e-start" type="date" value="' + (p.startAt ? p.startAt.slice(0, 10) : "") + '"' +
          (can("recruitmentStartAt") ? "" : " readonly") + " />",
          !can("recruitmentStartAt"), lockNote + "모집 일정은 변경할 수 없습니다.") +
        box("e-deadline", "모집 마감일",
          '<input id="e-deadline" type="date" value="' + p.deadlineAt.slice(0, 10) + '"' +
          (can("recruitmentDeadlineAt") ? "" : " readonly") + " />",
          !can("recruitmentDeadlineAt"), lockNote + "모집 일정은 변경할 수 없습니다.") +
      "</div>" +
      '<div class="acts acts--end">' +
        '<a class="btn quiet" href="mypage.html#tab=projects">취소</a>' +
        '<button class="btn primary" type="button" data-save="' + p.id + '">저장</button>' +
      "</div>";
  }

  /** SCR-B10 재모집 */
  function reopenHTML(p) {
    return '<h2>다시 모집하기</h2>' +
      // 왜 이 화면이 떴는지 먼저 말한다. 사실만 말하고 과장하지 않는다 (§12)
      '<p class="lede">협상이 마무리되는 사이에 모집 마감일이 지났습니다. ' +
      "마감일을 새로 정하면 다시 모집할 수 있습니다.</p>" +
      '<div class="field"><label for="r-deadline">모집 마감일</label>' +
        '<input id="r-deadline" type="date" /></div>' +
      '<div class="acts acts--end">' +
        '<a class="btn quiet" href="mypage.html#tab=projects">그만두기</a>' +
        '<button class="btn primary" type="button" data-reopen="' + p.id + '">다시 모집하기</button>' +
      "</div>";
  }

  /* ═══════════ 확인 다이얼로그 ═══════════ */

  function ask(id, p) {
    var e = effects(id, p, permissions(p));
    var el = document.createElement("div");
    el.className = "notyet"; // 겉모습은 안내와 같다. 새로 만들지 않는다
    el.id = "confirm";
    el.innerHTML =
      '<div class="notyet__scrim" data-no></div>' +
      '<div class="notyet__box" role="alertdialog" aria-modal="true"' +
        ' aria-labelledby="c-t" aria-describedby="c-d">' +
        '<h2 id="c-t">' + e.title + "</h2>" +
        '<p id="c-d">' + e.body + "</p>" +
        '<div class="acts acts--end">' +
          // 포커스는 "그만두기"에 둔다. Enter 를 누르면 실행되어 버린다
          '<button class="btn quiet" type="button" data-no>그만두기</button>' +
          '<button class="btn danger" type="button" data-yes="' + id + '">' + e.confirm + "</button>" +
        "</div>" +
      "</div>";
    document.body.appendChild(el);
    el.querySelector("button[data-no]").focus();
    el.addEventListener("keydown", function (ev) { if (ev.key === "Escape") close(); });
    el.querySelectorAll("[data-no]").forEach(function (b) {
      b.addEventListener("click", close);
    });
    el.querySelector("[data-yes]").addEventListener("click", function () {
      close();
      toast(DONE[id] + " 시안이라 실제로 바뀌지는 않습니다.");
    });
  }

  function close() {
    var el = document.getElementById("confirm");
    if (el) el.remove();
  }

  function toast(msg) {
    var t = document.createElement("p");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3200);
  }

  global.PactFiveManage = {
    permissions: permissions,
    listHTML: listHTML,
    editHTML: editHTML,
    reopenHTML: reopenHTML,
    ask: ask,
    toast: toast,
    mine: mine,
  };
})(window);
