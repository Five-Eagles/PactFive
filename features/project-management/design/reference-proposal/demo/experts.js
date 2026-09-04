/**
 * 전문가 더미 데이터와 목록 규칙.
 *
 * ⚠ **PRD 에 없는 기능이다.** 화면 목록(§7.1) 어디에도 프리랜서 탐색이 없고
 * 담당자도 정해지지 않았다. 시안의 "전문가 찾기" 자리를 채우기 위한
 * **형식 제안**이며, 만들지 말지는 팀이 정한다
 * (README 「확인이 필요한 것」 1번).
 *
 * 그래서 여기 값은 전부 지어낸 것이다. 대신 **형식은 ERD 에 있는 것만 쓴다** —
 * 나중에 진짜로 만들 때 컬럼을 새로 파지 않아도 되게.
 *
 *   users               name · profile_image_url · bio · rating_average · review_count
 *   freelancer_profiles primary_category · career_years · hourly_rate_amount · portfolio_url
 *   freelancer_skills   기술 목록
 *
 * ERD 에 없어서 **넣지 않은 것**: 접속 상태("활동 가능"), 인증 배지.
 * 시안에는 있지만 채울 컬럼이 없다 — 이것도 README 에 적어 두었다.
 */
(function (global) {
  "use strict";

  var D = global.PactFiveData;

  /** 포트폴리오 썸네일은 시안이 준 4장을 돌려 쓴다. 없는 사진을 지어내지 않는다 */
  var SHOTS = [
    "assets/expert-dashboard.jpg",
    "assets/expert-backoffice.jpg",
    "assets/expert-branding.jpg",
    "assets/expert-content.jpg",
  ];

  var EXPERTS = [
    { id: "flr_01", name: "김다은", title: "Product designer", category: "DESIGN",
      years: 6, rate: 45000, rating: 4.9, reviews: 38, shot: 0,
      skills: ["FIGMA", "HTML_CSS"],
      bio: "서비스 기획 단계부터 함께합니다. 화면을 그리기 전에 무엇을 덜어낼지 먼저 정합니다. 커머스와 B2B 관리 화면을 주로 맡았습니다." },
    { id: "flr_02", name: "박서윤", title: "Frontend developer", category: "WEB_DEVELOPMENT",
      years: 4, rate: 52000, rating: 5.0, reviews: 21, shot: 1,
      skills: ["REACT", "TYPESCRIPT", "HTML_CSS"],
      bio: "디자인 시안을 그대로 옮기는 것에 그치지 않고, 느려지는 지점을 먼저 찾아 알려드립니다. 관리자 화면 경험이 많습니다." },
    { id: "flr_03", name: "이준호", title: "Brand designer", category: "DESIGN",
      years: 9, rate: 60000, rating: 4.9, reviews: 64, shot: 2,
      skills: ["FIGMA"],
      bio: "로고 하나로 끝내지 않습니다. 명함부터 앱 아이콘까지 어디에 놓여도 알아볼 수 있는 규칙을 함께 정리해 드립니다." },
    { id: "flr_04", name: "최유진", title: "Content creator", category: "MARKETING",
      years: 3, rate: 38000, rating: 4.8, reviews: 42, shot: 3,
      skills: ["FIGMA"],
      bio: "제품을 써 보고 씁니다. 광고 문구보다 실제로 무엇이 좋아지는지를 먼저 찾습니다." },
    { id: "flr_05", name: "정민석", title: "Backend engineer", category: "WEB_DEVELOPMENT",
      years: 7, rate: 58000, rating: 4.7, reviews: 29, shot: 1,
      skills: ["NODEJS", "SQL", "AWS"],
      bio: "트래픽이 늘어도 버티는 구조를 먼저 잡습니다. 결제·정산처럼 틀리면 안 되는 쪽을 주로 맡았습니다." },
    { id: "flr_06", name: "한소영", title: "Mobile developer", category: "MOBILE_APP",
      years: 5, rate: 50000, rating: 4.6, reviews: 17, shot: 0,
      skills: ["FLUTTER", "TYPESCRIPT"],
      bio: "iOS 와 Android 를 한 벌로 냅니다. 출시 심사에서 막히는 지점을 미리 정리해 드립니다." },
    { id: "flr_07", name: "오세준", title: "Data analyst", category: "DATA_AI",
      years: 4, rate: 44000, rating: 4.5, reviews: 11, shot: 1,
      skills: ["PYTHON", "SQL"],
      bio: "숫자를 예쁘게 그리는 것보다 어떤 결정을 내릴지부터 여쭙습니다. 그다음에 필요한 지표만 만듭니다." },
    { id: "flr_08", name: "임하늘", title: "Service planner", category: "PLANNING",
      years: 8, rate: 55000, rating: 4.8, reviews: 33, shot: 3,
      skills: ["FIGMA"],
      bio: "사용자 인터뷰부터 요구사항 문서까지 맡습니다. 개발자가 바로 읽을 수 있는 형태로 정리합니다." },
    { id: "flr_09", name: "강태현", title: "Fullstack developer", category: "WEB_DEVELOPMENT",
      years: 6, rate: 56000, rating: 4.4, reviews: 8, shot: 2,
      skills: ["VUE", "SPRING", "SQL"],
      bio: "작은 팀에서 앞뒤를 함께 맡아 왔습니다. 초기 제품을 빠르게 세우는 일에 익숙합니다." },
    { id: "flr_10", name: "서지우", title: "UX writer", category: "DESIGN",
      years: 3, rate: 36000, rating: null, reviews: 0, shot: 3,
      skills: ["FIGMA"],
      bio: "버튼 하나의 말이 바뀌면 사람들이 하는 일이 달라집니다. 오류 문구부터 손보는 편입니다." },
    { id: "flr_11", name: "노현우", title: "Growth marketer", category: "MARKETING",
      years: 5, rate: 47000, rating: 4.3, reviews: 14, shot: 2,
      skills: ["PYTHON", "FIGMA"],
      bio: "광고비를 늘리기 전에 새는 곳을 먼저 막습니다. 유입부터 결제까지 어디서 빠지는지 봅니다." },
    { id: "flr_12", name: "윤가람", title: "ML engineer", category: "DATA_AI",
      years: 4, rate: 62000, rating: null, reviews: 0, shot: 0,
      skills: ["PYTHON", "AWS"],
      bio: "모델보다 데이터를 먼저 봅니다. 지금 있는 데이터로 가능한 것과 아닌 것을 솔직하게 말씀드립니다." },
  ];

  var PAGE_SIZE = 8; // 4열 × 2행

  /**
   * query: { category, skills[], sortBy, page }
   *
   * 정렬은 셋이다. **점수를 만들어 "추천순"이라고 부르지 않는다** —
   * 무엇으로 줄 세웠는지 말할 수 없는 순서는 내보내지 않는다
   * (engagement 규칙 28 과 같은 이유).
   */
  function list(query) {
    var q = query || {};
    var rows = EXPERTS.slice();

    if (q.category) rows = rows.filter(function (x) { return x.category === q.category; });
    if (q.skills && q.skills.length) {
      rows = rows.filter(function (x) {
        return q.skills.every(function (s) { return x.skills.indexOf(s) !== -1; });
      });
    }

    var by = q.sortBy || "rating";
    rows.sort(function (a, b) {
      if (by === "reviews") {
        if (a.reviews !== b.reviews) return b.reviews - a.reviews;
      } else if (by === "years") {
        if (a.years !== b.years) return b.years - a.years;
      } else {
        // 평점순. 평가가 없는 사람은 뒤로 보내되 **0점으로 취급하지 않는다** —
        // "나쁘다"와 "아직 없다"는 다르다
        var ar = a.reviews > 0 ? a.rating : -1;
        var br = b.reviews > 0 ? b.rating : -1;
        if (ar !== br) return br - ar;
      }
      return a.id < b.id ? -1 : 1;
    });

    var total = rows.length;
    var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    var page = Math.min(Math.max(1, q.page || 1), totalPages);
    return {
      items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      totalCount: total, page: page, pageSize: PAGE_SIZE, totalPages: totalPages,
    };
  }

  function find(id) {
    return EXPERTS.filter(function (x) { return x.id === id; })[0] || null;
  }

  function esc(s) { return global.PactFiveEngine.esc(s); }

  /** 평점 표시. 리뷰가 없으면 0.0 이 아니라 "평가 없음" */
  function ratingHTML(x) {
    return x.reviews > 0
      ? '<span class="ecard__rate"><span class="star">★</span> <span class="num">' +
          x.rating.toFixed(1) + '</span> <span class="caption num">(' + x.reviews + ")</span></span>"
      : '<span class="ecard__rate none">평가 없음</span>';
  }

  /**
   * 전문가 카드. 프로젝트 카드와 같은 겹 규칙을 쓴다 —
   * 판(썸네일) · 표면(흰 카드 + 위쪽 밝은 선) · 앞으로 나온 아바타.
   * 정보 순서를 고정한다: 작업물 · 이름 · 직함 · 카테고리 · 평점 · 경력 · 단가 · 기술
   */
  function cardHTML(x) {
    return (
      '<article class="card ecard">' +
        '<a class="ecard__thumb" href="expert.html#id=' + x.id + '">' +
          '<img src="' + SHOTS[x.shot] + '" alt="' + esc(x.name) + '의 작업물" width="640" height="400" />' +
        "</a>" +
        '<div class="ecard__who">' +
          '<span class="avatar" aria-hidden="true">' + esc(x.name.slice(0, 1)) + "</span>" +
          '<span class="ecard__name">' +
            '<b><a href="expert.html#id=' + x.id + '">' + esc(x.name) + "</a></b>" +
            '<span class="ecard__title">' + esc(x.title) + "</span>" +
          "</span>" +
        "</div>" +
        '<p class="ecard__meta">' +
          '<span class="chip">' + esc(D.categoryName(x.category)) + "</span>" +
          ratingHTML(x) +
        "</p>" +
        '<p class="ecard__facts">' +
          '<span>경력 <b class="num">' + x.years + "</b>년</span>" +
          '<span>시간당 <b class="num">' + x.rate.toLocaleString("ko-KR") + "</b>원</span>" +
        "</p>" +
        '<p class="ecard__skills">' +
          x.skills.map(function (s) { return '<span class="chip">' + esc(D.skillName(s)) + "</span>"; }).join("") +
        "</p>" +
      "</article>"
    );
  }

  global.PactFiveExperts = {
    EXPERTS: EXPERTS, SHOTS: SHOTS, PAGE_SIZE: PAGE_SIZE,
    list: list, find: find, cardHTML: cardHTML, ratingHTML: ratingHTML,
  };
})(window);
