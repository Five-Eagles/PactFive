/**
 * 아직 없는 화면을 누르면 무엇을 알려줄 것인가.
 *
 * 링크를 `href="#"` 로 두면 눌러도 아무 일이 없다. 사용자는 고장으로 읽는다.
 * **없다는 것을 말하고, 누가 만들며 명세가 어디 있는지까지 준다.**
 * 시안을 보는 사람이 곧 그 화면을 만들 사람이기 때문이다.
 *
 * `data-notyet="키"` 를 붙이면 이 파일이 알아서 처리한다.
 */
(function (global) {
  "use strict";

  var SCREENS = {
    register: {
      name: "프로젝트 등록",
      owner: "유동우 (project-management)",
      where: "design/high-fi-register.html · spec.md 규칙 1~8",
      note: "3단계 퍼널이다. 이 폴더의 시안 3장에는 아직 없다.",
    },
    login: {
      name: "로그인",
      owner: "오민혁 (user-management)",
      where: "features/user-management/",
      note: "",
      // 역할에 따라 화면이 달라지는 규칙이 여럿이라, 그것만 보이도록 계정을 세워 준다
      extra: function () {
        return window.PactFiveSession ? window.PactFiveSession.accountPickerHTML() : "";
      },
    },
    experts: {
      name: "전문가 찾기",
      owner: "정해지지 않음",
      where: "README.md 「확인이 필요한 것」 1번",
      note: "PRD 화면 목록(§7.1)에 프리랜서 탐색이 없다. 만들지 말지부터 정해야 한다.",
    },
    guide: {
      name: "이용 방법",
      owner: "정해지지 않음",
      where: "README.md 「확인이 필요한 것」",
      note: "정적 안내 페이지다. 화면 목록에 없다.",
    },
    safety: {
      name: "안전한 거래",
      owner: "조준영 (contracts-payments)",
      where: "features/contracts-payments/",
      note: "에스크로·전자계약 설명 페이지다. Step 2 다.",
    },
    myproject: {
      name: "내 프로젝트",
      owner: "유동우 (project-management)",
      where: "design/high-fi-manage.html · SCR-B07",
      note: "진행 단계·납품 파일은 계약 이후 데이터라 조준영 쪽과 맞춰야 한다.",
    },
    apply: {
      name: "지원하기",
      owner: "최윤석 몫이었으나 팀장·조준영이 나눠 맡기로 함 (2026-09-02)",
      where: "features/applications/",
      note: "이 흐름의 시작점이다. 없으면 계약·결제까지 시연이 이어지지 않는다.",
    },
  };

  function close() {
    var d = document.getElementById("notyet");
    if (d) d.remove();
    if (global.__notyetReturn && global.__notyetReturn.focus) global.__notyetReturn.focus();
  }

  function open(key) {
    var s = SCREENS[key];
    if (!s) return;
    close();
    global.__notyetReturn = document.activeElement;

    var el = document.createElement("div");
    el.id = "notyet";
    el.className = "notyet";
    el.innerHTML =
      '<div class="notyet__scrim" data-close></div>' +
      '<div class="notyet__box" role="alertdialog" aria-modal="true"' +
        ' aria-labelledby="notyet-t" aria-describedby="notyet-d">' +
        '<h2 id="notyet-t">' + s.name + " 화면은 아직 없습니다</h2>" +
        '<div id="notyet-d">' +
          (s.note ? "<p>" + s.note + "</p>" : "") +
          (s.extra ? s.extra() : "") +
          '<dl class="notyet__kv">' +
            "<dt>담당</dt><dd>" + s.owner + "</dd>" +
            "<dt>명세</dt><dd><code>" + s.where + "</code></dd>" +
          "</dl>" +
        "</div>" +
        '<button class="btn primary" type="button" data-close>닫기</button>' +
      "</div>";
    document.body.appendChild(el);

    el.querySelectorAll("[data-close]").forEach(function (b) {
      b.addEventListener("click", close);
    });
    // Esc 로 닫힌다. 빠져나갈 길을 하나만 두지 않는다
    el.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    el.querySelector(".btn").focus();
  }

  var bound = false;
  function bind() {
    if (bound) return; // 위와 같은 이유
    bound = true;
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-signin]")) { close(); return; }
      var t = e.target.closest("[data-notyet]");
      if (!t) return;
      e.preventDefault();
      open(t.getAttribute("data-notyet"));
    });
  }

  global.PactFiveNotYet = { open: open, bind: bind, SCREENS: SCREENS };
})(window);
