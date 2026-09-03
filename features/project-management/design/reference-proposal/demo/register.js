/**
 * 프로젝트 등록 3단계 (SCR-B03 · B04 · B05).
 *
 * 문구는 `design/high-fi-register.html` 의 「필수 요소 목록」이 정본이다.
 * `prototype/run.tsx` 가 그 목록을 기계적으로 확인하므로 여기서 말을 바꾸면
 * 화면과 테스트가 갈라진다.
 *
 * **입력한 것을 잃지 않는다** (ux-philosophy §6 작업 보호).
 * 단계를 오가도, 새로고침해도, 실수로 닫았다 다시 열어도 남는다.
 * `sessionStorage` 를 쓴다 — `localStorage` 는 공용 PC 에서 남의 초안이 보인다.
 */
(function (global) {
  "use strict";

  var D = global.PactFiveData;
  var E = global.PactFiveEngine;
  var KEY = "pactfive:demo:draft";
  var VERSION = 1;

  /* ═══════════ 초안 ═══════════ */

  function empty() {
    return { title: "", description: "", category: "", startAt: "", deadlineAt: "",
      budget: "", skills: [], budgetSource: "" };
  }

  function load() {
    try {
      var raw = global.sessionStorage.getItem(KEY);
      if (!raw) return { value: empty(), restored: false };
      var box = JSON.parse(raw);
      // 형식이 바뀌었으면 버린다. 반쯤 맞는 값으로 화면을 채우는 것이 더 위험하다
      if (box.version !== VERSION) { global.sessionStorage.removeItem(KEY); return { value: empty(), restored: false }; }
      return { value: box.value, restored: true };
    } catch (e) {
      return { value: empty(), restored: false };
    }
  }

  var boot = load();
  var draft = boot.value;
  var restored = boot.restored;
  var savedAt = null;

  function save() {
    try {
      savedAt = new Date();
      global.sessionStorage.setItem(KEY, JSON.stringify({ version: VERSION, value: draft }));
    } catch (e) {
      /* 저장만 못 할 뿐 화면은 그대로 돌아야 한다 */
    }
  }

  function clear() {
    try { global.sessionStorage.removeItem(KEY); } catch (e) { /* 무시 */ }
    draft = empty();
    restored = false;
    savedAt = null;
  }

  /* ═══════════ 검증 ═══════════
     문구는 spec.md 규칙과 맞춘다. 무엇이 틀렸는지와 **어떻게 고치는지**를 함께 말한다 */

  var DAY = 24 * 60 * 60 * 1000;

  function errors(step) {
    var e = {};
    if (step === 1) {
      var t = draft.title.trim();
      if (!t) e.title = "제목을 입력해 주세요.";
      else if (t.length < 5) e.title = "5자 이상 입력해 주세요. 지금 " + t.length + "자입니다.";
      else if (t.length > 100) e.title = "100자 이하로 줄여 주세요. 지금 " + t.length + "자입니다.";

      var d = draft.description.trim();
      if (!d) e.description = "설명을 입력해 주세요.";
      else if (d.length < 20) e.description = "20자 이상 적어 주세요. 지금 " + d.length + "자입니다.";

      if (!draft.category) e.category = "카테고리를 골라 주세요.";
    }
    if (step === 2) {
      if (!draft.deadlineAt) e.deadlineAt = "모집 마감일을 정해 주세요.";
      else {
        var end = new Date(draft.deadlineAt).getTime();
        var base = draft.startAt ? new Date(draft.startAt).getTime() : Date.now();
        if (end <= Date.now()) e.deadlineAt = "마감일은 오늘보다 뒤여야 합니다.";
        else if (end - base > 365 * DAY) e.deadlineAt = "모집 기간은 최대 1년까지입니다.";
        else if (draft.startAt && end <= base) e.deadlineAt = "마감일이 시작일보다 앞섭니다.";
      }
      var b = Number(String(draft.budget).replace(/[^0-9]/g, ""));
      if (!b) e.budget = "예산을 입력해 주세요.";
      else if (b < 100000) e.budget = "최소 100,000원 이상으로 입력해 주세요.";
    }
    if (step === 3) {
      if (draft.skills.length === 0) e.skills = "기술을 최소 1개 골라 주세요.";
      else if (draft.skills.length > 10) e.skills = "최대 10개까지입니다.";
    }
    return e;
  }

  function stepOf() {
    var n = Number(new URLSearchParams((global.__pactfiveQuery || location.hash.slice(1)) || "").get("step"));
    return n >= 1 && n <= 3 ? n : 1;
  }

  function goto(n) { location.hash = "step=" + n; }

  /* ═══════════ 그리기 ═══════════ */

  var shown = {}; // 아직 건드리지 않은 칸에 빨간 글씨를 미리 띄우지 않는다

  function field(name, label, inner, help) {
    var msg = shown[name] ? (errors(stepOf())[name] || "") : "";
    return '<div class="field" data-invalid="' + (msg ? "true" : "false") + '">' +
      "<label" + (name ? ' for="f-' + name + '"' : "") + ">" + label + "</label>" +
      inner +
      (msg ? '<p class="err" role="alert">' + msg + "</p>"
           : help ? '<p class="help">' + help + "</p>" : "") +
    "</div>";
  }

  function step1() {
    return '<h2>프로젝트를 등록합니다</h2>' +
      field("title", "프로젝트 제목",
        '<input id="f-title" name="title" type="text" value="' + E.esc(draft.title) +
        '" placeholder="예) 쇼핑몰 웹사이트 구축" maxlength="120" />',
        "5자 이상 100자 이하로 입력해 주세요.") +
      field("description", "프로젝트 설명",
        '<textarea id="f-description" name="description" ' +
        'placeholder="어떤 작업이 필요한지 구체적으로 적어 주세요.">' + E.esc(draft.description) + "</textarea>",
        "20자 이상 적어 주시면 AI 단가 분석을 더 정확하게 받을 수 있습니다.") +
      field("category", "카테고리",
        '<select id="f-category" name="category"><option value="">고르세요</option>' +
        D.CATEGORIES.map(function (c) {
          return '<option value="' + c.id + '"' + (draft.category === c.id ? " selected" : "") + ">" + c.name + "</option>";
        }).join("") + "</select>");
  }

  function step2() {
    var b = Number(String(draft.budget).replace(/[^0-9]/g, ""));
    return '<h2>일정과 예산을 정합니다</h2>' +
      '<div class="two">' +
        field("startAt", "모집 시작일 (선택)",
          '<input id="f-startAt" name="startAt" type="date" value="' + E.esc(draft.startAt) + '" />',
          "비워두면 바로 모집을 시작합니다") +
        field("deadlineAt", "모집 마감일",
          '<input id="f-deadlineAt" name="deadlineAt" type="date" value="' + E.esc(draft.deadlineAt) + '" />',
          "모집 기간은 7일 이상을 권장합니다. 최대 1년까지 설정할 수 있습니다.") +
      "</div>" +
      field("budget", "예산",
        '<input id="f-budget" name="budget" type="text" inputmode="numeric" value="' +
        (b ? b.toLocaleString("ko-KR") : "") + '" placeholder="예) 5,000,000" />',
        "단위는 원입니다. 나중에 지원자가 생기면 변경할 수 없습니다.") +

      // 조건부 영역이라 「필수 요소 목록」에서 제외된 자리다
      '<div class="ai">' +
        "<b>AI 단가 분석</b>" +
        "<p>설명을 20자 이상 적으면 비슷한 프로젝트를 근거로 예산 범위를 알려드립니다." +
        (draft.description.trim().length >= 20
          ? " 지금 분석할 수 있습니다."
          : " 지금은 설명이 " + draft.description.trim().length + "자입니다.") + "</p>" +
        (draft.budgetSource === "AI_ANALYSIS"
          // 예산이 어디서 왔는지 화면에 남긴다 (CR-0006 결함 2)
          ? '<p class="help">현재 예산은 <b>AI 단가 분석이 제안한 금액</b>입니다. ' +
            "지원자가 생기기 전에는 직접 수정할 수 있습니다.</p>"
          : '<button class="btn secondary sm" type="button" id="ai"' +
            (draft.description.trim().length >= 20 ? "" : " disabled") + ">예산 범위 받아보기</button>") +
      "</div>";
  }

  function step3() {
    var cat = D.CATEGORIES.filter(function (c) { return c.id === draft.category; })[0];
    var b = Number(String(draft.budget).replace(/[^0-9]/g, ""));
    var row = function (k, v, step) {
      return '<div class="review__row"><span class="review__k">' + k + "</span>" +
        '<span class="review__v">' + v + "</span>" +
        '<a class="review__edit" href="#step=' + step + '">수정</a></div>';
    };

    return '<h2>입력한 내용을 확인해 주세요</h2>' +
      field("skills", '필요한 기술 <span class="caption num">' + draft.skills.length + " / 10</span>",
        '<div class="skills">' + D.SKILLS.map(function (s) {
          return "<label><input type=\"checkbox\" name=\"skill\" value=\"" + s.id + '"' +
            (draft.skills.indexOf(s.id) !== -1 ? " checked" : "") + " /> " + s.name + "</label>";
        }).join("") + "</div>",
        "최소 1개, 최대 10개까지 선택할 수 있습니다.") +

      '<div class="review">' +
        row("제목", E.esc(draft.title) || "—", 1) +
        row("설명", E.esc(draft.description.slice(0, 80)) + (draft.description.length > 80 ? "…" : "") || "—", 1) +
        row("카테고리", cat ? cat.name : "—", 1) +
        row("모집 기간", (draft.startAt || "즉시 시작") + " — " + (draft.deadlineAt || "—"), 2) +
        row("예산", b ? E.won(b) : "—", 2) +
        row("필요한 기술", draft.skills.length
          ? draft.skills.map(function (s) { return '<span class="chip">' + D.skillName(s) + "</span>"; }).join("")
          : "—", 3) +
      "</div>";
  }

  function render() {
    var root = document.getElementById("reg");
    if (!root) return;
    var step = stepOf();
    var body = step === 1 ? step1() : step === 2 ? step2() : step3();

    root.innerHTML =
      '<ul class="steps" style="list-style:none;padding:0;margin:0 0 var(--gap-5)">' +
        [1, 2, 3].map(function (n) {
          var label = ["기본 정보", "일정 · 예산", "필요 기술"][n - 1];
          return "<li" + (n === step ? ' aria-current="step"' : "") +
            ' data-done="' + (n < step ? "true" : "false") + '">' +
            '<span class="steps__n num">' + n + "</span><span>" + label + "</span></li>" +
            (n < 3 ? '<li class="steps__bar" aria-hidden="true"></li>' : "");
        }).join("") +
      "</ul>" +

      '<form class="card panel" id="form" novalidate>' + body +
        '<div class="acts">' +
          (step > 1 ? '<button class="btn quiet" type="button" data-go="' + (step - 1) + '">이전</button>' : "") +
          '<span class="spacer"></span>' +
          (step < 3
            ? '<button class="btn primary" type="button" data-go="' + (step + 1) + '">다음</button>'
            : '<button class="btn primary" type="submit">등록하기</button>') +
        "</div>" +
      "</form>" +

      // 작업 보호를 화면에 말한다. 말하지 않으면 사용자는 사라질까 봐 못 떠난다
      '<p class="saved">' +
        (restored ? "이전에 입력하던 내용을 불러왔습니다. " : "") +
        "입력한 내용은 자동으로 보관됩니다" +
        (savedAt ? " — 마지막 저장 " + savedAt.toTimeString().slice(0, 5) : "") + "." +
        (draft.title || draft.description
          ? ' <button class="btn quiet sm" type="button" id="discard">입력한 내용 지우기</button>' : "") +
      "</p>";
  }

  /* ═══════════ 반응 ═══════════ */

  function collect() {
    var f = document.getElementById("form");
    if (!f) return;
    ["title", "description", "category", "startAt", "deadlineAt", "budget"].forEach(function (k) {
      var el = f.elements[k];
      if (el) draft[k] = el.value;
    });
    var skills = f.querySelectorAll('input[name="skill"]:checked');
    if (f.querySelector('input[name="skill"]')) {
      draft.skills = Array.prototype.map.call(skills, function (c) { return c.value; });
    }
    save();
  }

  var bound = false;
  function bind() {
    if (bound) return;
    bound = true;

    document.addEventListener("input", function (e) {
      if (!e.target.closest("#form")) return;
      collect();
      // 이미 틀렸다고 말한 칸은 고치는 즉시 다시 본다. 다 쓸 때까지 기다리지 않는다
      if (shown[e.target.name]) render();
    });

    document.addEventListener("change", function (e) {
      if (!e.target.closest("#form")) return;
      collect();
      if (e.target.name === "skill" || e.target.name === "category") render();
    });

    document.addEventListener("click", function (e) {
      var go = e.target.closest("[data-go]");
      if (go) {
        e.preventDefault();
        collect();
        var next = Number(go.getAttribute("data-go"));
        // 뒤로 갈 때는 막지 않는다. 앞으로 갈 때만 확인한다
        if (next > stepOf()) {
          var errs = errors(stepOf());
          if (Object.keys(errs).length) {
            Object.keys(errs).forEach(function (k) { shown[k] = true; });
            render();
            var first = document.querySelector('[data-invalid="true"] input, [data-invalid="true"] textarea, [data-invalid="true"] select');
            if (first) first.focus();
            return;
          }
        }
        goto(next);
        return;
      }

      if (e.target.closest("#ai")) {
        e.preventDefault();
        // 실제로는 오민혁의 ai-pricing 이 계산한다. 여기서는 형식만 보인다
        draft.budget = "4,800,000";
        draft.budgetSource = "AI_ANALYSIS";
        save();
        render();
        return;
      }

      if (e.target.closest("#discard")) {
        e.preventDefault();
        clear();
        goto(1);
        render();
      }
    });

    document.addEventListener("submit", function (e) {
      if (!e.target.closest("#form")) return;
      e.preventDefault();
      collect();
      var errs = errors(3);
      if (Object.keys(errs).length) {
        Object.keys(errs).forEach(function (k) { shown[k] = true; });
        render();
        return;
      }
      done();
    });
  }

  /** 등록 완료. 실제로는 POST /api/v1/projects 가 이 자리다 */
  function done() {
    var title = draft.title;
    clear();
    var root = document.getElementById("reg");
    root.innerHTML =
      '<div class="empty" role="status" style="margin-top:var(--gap-6)">' +
        "<h3>등록했습니다</h3>" +
        "<p><b>" + E.esc(title) + "</b> 이(가) 모집 중이 되었습니다. " +
        "지원이 들어오면 알려드립니다.</p>" +
        '<a class="btn primary" href="browse.html">목록에서 보기</a>' +
      "</div>" +
      '<p class="saved">시안이라 실제로 저장되지는 않습니다. ' +
      "실제 화면에서는 <code>POST /api/v1/projects</code> 가 이 자리입니다.</p>";
  }

  global.PactFiveRegister = { render: render, bind: bind, draft: function () { return draft; } };
})(window);
