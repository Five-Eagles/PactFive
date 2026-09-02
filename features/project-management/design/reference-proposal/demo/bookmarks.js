/**
 * 북마크 토글.
 *
 * `features/engagement/spec.md` 의 규칙을 따른다.
 *   1 "추가"는 "1건 만든다"가 아니라 **"1건 있는 상태로 만든다"** — 이미 있으면 성공
 *   2 "제거"는 **"0건인 상태로 만든다"** — 이미 없어도 오류가 아니다
 *  31 낙관적 반영을 쓰면 실패했을 때 **원래 상태와 이유를 되돌려야 한다**
 *
 * 저장은 `sessionStorage` 다. `localStorage` 를 쓰면 공용 PC 에서 다음 사람에게
 * 남의 북마크가 보인다. 시안이라 서버가 없을 뿐이고, 실제로는
 * `PUT/DELETE /api/v1/projects/:id/bookmarks` 가 이 자리를 대신한다.
 */
(function (global) {
  "use strict";

  var KEY = "pactfive:demo:bookmarks";
  var ids = load();

  function load() {
    try {
      var raw = global.sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      // 사생활 보호 모드 · 저장소 차단. 저장만 못 할 뿐 화면은 그대로 돌아야 한다
      return [];
    }
  }

  function save() {
    try {
      global.sessionStorage.setItem(KEY, JSON.stringify(ids));
    } catch (e) {
      /* 무시 — 위와 같은 이유 */
    }
  }

  function has(id) {
    return ids.indexOf(id) !== -1;
  }

  /** 규칙 1·2 — 결과 상태를 만든다. 몇 번을 눌러도 결과가 같다 */
  function set(id, on) {
    var at = ids.indexOf(id);
    if (on && at === -1) ids.push(id);
    if (!on && at !== -1) ids.splice(at, 1);
    save();
    return has(id);
  }

  function toggle(id) {
    return set(id, !has(id));
  }

  function count() {
    return ids.length;
  }

  /** 버튼 하나의 겉모습을 상태에 맞춘다. 아이콘·읽어 주는 이름·누름 상태를 함께 바꾼다 */
  function paint(btn, on) {
    btn.textContent = on ? "★" : "☆";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "북마크 해제" : "북마크 저장");
  }

  /**
   * 화면 전체에 위임으로 한 번만 건다. 카드를 다시 그려도 다시 걸 필요가 없다.
   * 같은 프로젝트 카드가 여러 곳에 있으면 **전부** 같이 바뀐다 —
   * 한 곳만 바뀌면 사용자는 저장이 안 됐다고 본다.
   */
  function bind() {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-bookmark]");
      if (!btn) return;
      e.preventDefault();
      var id = btn.getAttribute("data-bookmark");
      var on = toggle(id);
      document.querySelectorAll('[data-bookmark="' + id + '"]').forEach(function (b) {
        paint(b, on);
      });
      document.dispatchEvent(new CustomEvent("pactfive:bookmark", { detail: { id: id, on: on } }));
    });
  }

  global.PactFiveBookmarks = {
    has: has,
    set: set,
    toggle: toggle,
    count: count,
    paint: paint,
    bind: bind,
  };
})(window);
