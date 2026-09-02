/**
 * 누가 보고 있는가.
 *
 * **로그인 화면은 여기서 만들지 않는다.** user-management(오민혁) 담당이다.
 * 이 파일은 그 자리에 끼울 **연결점**만 정한다 — 화면들이 "지금 누가 보는가"를
 * 물어볼 창구 하나. 실제 로그인이 붙으면 `signIn()` 안쪽만 바뀌고
 * 화면 코드는 그대로다.
 *
 * 역할에 따라 화면이 달라지는 규칙이 여럿이라 역할 전환은 필요하다.
 *   engagement 규칙 30 — 북마크 아이콘은 비로그인·프리랜서·의뢰인이 각각 다르다
 *   project-management 규칙 17 — 내 프로젝트는 등록 의뢰인만
 *
 * 계정은 PRD §9 의 시드 6개를 그대로 쓴다. 지어내지 않는다.
 */
(function (global) {
  "use strict";

  var KEY = "pactfive:demo:session";

  /** PRD §9.2 시드 계정 6개 */
  var ACCOUNTS = [
    { id: "client-a", name: "김서연", role: "CLIENT", org: "주식회사 마루컴퍼니", note: "시연 주인공. 등록 → 수락 → 계약" },
    { id: "client-b", name: "박정우", role: "CLIENT", org: "라온물류", note: "다른 의뢰인의 프로젝트" },
    { id: "client-c", name: "이하늘", role: "CLIENT", org: "", note: "프로필 미완성 — 등록 게이트 시연용" },
    { id: "freelancer-a", name: "김다은", role: "FREELANCER", org: "Product designer", note: "시연 주인공. 지원 → 수락됨" },
    { id: "freelancer-b", name: "박서윤", role: "FREELANCER", org: "Frontend developer", note: "자동 거절 대상" },
    { id: "freelancer-c", name: "이준호", role: "FREELANCER", org: "Brand designer", note: "북마크·추천 시연" },
  ];

  function load() {
    try {
      var raw = global.sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null; // 저장소가 막혀도 화면은 비로그인으로 돌아간다
    }
  }

  var current = load();

  function save() {
    try {
      if (current) global.sessionStorage.setItem(KEY, JSON.stringify(current));
      else global.sessionStorage.removeItem(KEY);
    } catch (e) {
      /* 무시 */
    }
  }

  /** 실제 로그인이 붙을 자리. 지금은 시드 계정을 그대로 세운다 */
  function signIn(accountId) {
    current = ACCOUNTS.filter(function (a) { return a.id === accountId; })[0] || null;
    save();
    notify();
    return current;
  }

  function signOut() {
    current = null;
    save();
    notify();
  }

  function user() { return current; }
  function isFreelancer() { return !!current && current.role === "FREELANCER"; }
  function isClient() { return !!current && current.role === "CLIENT"; }

  function notify() {
    document.dispatchEvent(new CustomEvent("pactfive:session", { detail: current }));
  }

  /**
   * 헤더의 오른쪽을 상태에 맞춘다.
   *
   * 비로그인 — 로그인 · 프로젝트 등록
   * 로그인   — 이름(마이페이지로) · 로그아웃 · 프로젝트 등록
   *
   * **북마크는 헤더에 두지 않는다.** 로그인해야 의미가 있는 것이라
   * 마이페이지 안으로 넣었다.
   */
  function paintHeader(root) {
    var slot = (root || document).querySelector("[data-session-actions]");
    if (!slot) return;
    var u = current;
    slot.innerHTML = u
      ? '<a class="login" href="mypage.html">' + u.name + " 님</a>" +
        '<button class="btn quiet sm" type="button" data-signout>로그아웃</button>' +
        '<a class="btn primary sm" href="register.html">프로젝트 등록</a>'
      : '<a class="login" href="#" data-notyet="login">로그인</a>' +
        '<a class="btn primary sm" href="register.html">프로젝트 등록</a>';
  }

  var bound = false;
  function bind() {
    if (bound) return;
    bound = true;
    document.addEventListener("click", function (e) {
      if (e.target.closest("[data-signout]")) {
        e.preventDefault();
        signOut();
      }
      var pick = e.target.closest("[data-signin]");
      if (pick) {
        e.preventDefault();
        signIn(pick.getAttribute("data-signin"));
      }
    });
  }

  /** 로그인 안내 안에 붙는 시연용 계정 목록. 진짜 로그인이 생기면 통째로 사라진다 */
  function accountPickerHTML() {
    return (
      '<div class="picker">' +
        '<p class="picker__why">로그인 화면은 <b>오민혁 (user-management)</b> 담당입니다. ' +
        "여기서는 역할에 따라 화면이 어떻게 달라지는지만 보이도록 시드 계정을 그대로 세웁니다.</p>" +
        ACCOUNTS.map(function (a) {
          return '<button class="picker__row" type="button" data-signin="' + a.id + '">' +
            '<span class="picker__name">' + a.name + "</span>" +
            '<span class="picker__role">' + (a.role === "CLIENT" ? "의뢰인" : "프리랜서") + "</span>" +
            '<span class="picker__note">' + a.note + "</span>" +
          "</button>";
        }).join("") +
      "</div>"
    );
  }

  global.PactFiveSession = {
    ACCOUNTS: ACCOUNTS,
    signIn: signIn,
    signOut: signOut,
    user: user,
    isFreelancer: isFreelancer,
    isClient: isClient,
    paintHeader: paintHeader,
    accountPickerHTML: accountPickerHTML,
    bind: bind,
  };
})(window);
