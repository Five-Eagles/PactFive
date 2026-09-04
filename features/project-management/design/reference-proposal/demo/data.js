/**
 * 시안이 쓰는 데이터.
 *
 * PRD §9 "시드 데이터 설계" 의 P01~P12 를 그대로 옮긴 것이다 — 제목 · 카테고리 ·
 * 모집 상태 · 지원 건수가 그 표와 같다. 배포하면 이 데이터가 실제로 있으므로,
 * 시안에서 눌러 본 결과와 배포된 화면의 결과가 어긋나지 않는다.
 *
 * 마감일은 **절대 시각을 박지 않고 오늘 기준 상대 일수로 만든다.**
 * 박아 두면 며칠 뒤에 열었을 때 전부 마감으로 보인다 (PRD §9 유의사항 2).
 */
(function (global) {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  function inDays(n) {
    return new Date(Date.now() + n * DAY).toISOString();
  }

  /** ERD `project_category` 6종. 화면 이름은 여기 한 곳에서만 정한다 */
  var CATEGORIES = [
    { id: "WEB_DEVELOPMENT", name: "웹 개발" },
    { id: "MOBILE_APP", name: "모바일 앱" },
    { id: "DESIGN", name: "디자인" },
    { id: "DATA_AI", name: "데이터 · AI" },
    { id: "PLANNING", name: "기획" },
    { id: "MARKETING", name: "마케팅" },
  ];

  /** `is_custom = false` 인 공식 기술만. 커스텀은 프로젝트 요구 기술에 못 들어간다 */
  var SKILLS = [
    { id: "REACT", name: "React" },
    { id: "NODEJS", name: "Node.js" },
    { id: "TYPESCRIPT", name: "TypeScript" },
    { id: "JAVASCRIPT", name: "JavaScript" },
    { id: "VUE", name: "Vue" },
    { id: "SPRING", name: "Spring" },
    { id: "FLUTTER", name: "Flutter" },
    { id: "PYTHON", name: "Python" },
    { id: "SQL", name: "SQL" },
    { id: "FIGMA", name: "Figma" },
    { id: "HTML_CSS", name: "HTML/CSS" },
    { id: "AWS", name: "AWS" },
  ];

  /**
   * 의뢰인. `reviewCount: 0` 인 곳이 둘 있다 —
   * 평점이 없는 경우를 화면이 어떻게 그리는지 보려면 그런 데이터가 있어야 한다.
   */
  var CLIENTS = {
    c_maru: { name: "주식회사 마루컴퍼니", rating: 4.8, reviewCount: 12 },
    c_raon: { name: "라온물류", rating: 4.6, reviewCount: 31 },
    c_daily: { name: "데일리핏", rating: null, reviewCount: 0 },
    c_spoon: { name: "스푼테이블", rating: 4.9, reviewCount: 8 },
    c_corner: { name: "코너스톤", rating: 4.5, reviewCount: 5 },
    c_bloom: { name: "블루밍랩", rating: null, reviewCount: 0 },
    c_nowon: { name: "노원커머스", rating: 4.7, reviewCount: 19 },
    c_hanul: { name: "하늘스튜디오", rating: 4.4, reviewCount: 7 },
  };

  /**
   * 프로젝트 12건.
   *
   * `recruitmentStatus` 를 저장하되 **화면은 그 값을 그대로 믿지 않는다** —
   * 마감일이 지났는지는 조회 시점에 다시 본다 (spec.md 규칙 14).
   * 판정은 `engine.js` 의 `effectiveStatus()` 가 한다.
   */
  var PROJECTS = [
    {
      id: "prj_p01",
      title: "쇼핑몰 웹사이트 구축",
      description:
        "운영 3년차 여성 의류 쇼핑몰입니다. 모바일 유입이 70% 를 넘는데 화면이 데스크톱 기준으로 만들어져 있어 전면 개편이 필요합니다. 상품 목록·상세·장바구니·결제까지가 범위이고 관리자 화면은 이번 범위 밖입니다.",
      category: "WEB_DEVELOPMENT",
      budget: 5000000,
      skills: ["REACT", "TYPESCRIPT"],
      clientId: "c_maru",
      applicationCount: 0,
      recruitmentStatus: "OPEN",
      startAt: null,
      deadlineAt: inDays(14),
      createdAt: inDays(-2),
    },
    {
      id: "prj_p02",
      title: "사내 관리자 페이지",
      description:
        "물류 현장에서 쓰는 관리자 화면을 새로 만듭니다. 지금은 엑셀로 관리하는데 지점이 늘면서 한계가 왔습니다. 주문·재고·배송 세 화면이 핵심이고 권한 분리가 필요합니다.",
      category: "WEB_DEVELOPMENT",
      budget: 3500000,
      skills: ["NODEJS", "SQL"],
      clientId: "c_raon",
      applicationCount: 2,
      recruitmentStatus: "OPEN",
      startAt: null,
      deadlineAt: inDays(9),
      createdAt: inDays(-5),
    },
    {
      id: "prj_p03",
      title: "브랜드 리뉴얼 디자인",
      description:
        "10년 된 식품 브랜드입니다. 로고가 인쇄물 기준으로 만들어져 있어 앱과 SNS 에서 알아보기 어렵습니다. 로고 리디자인과 함께 색·서체·적용 예시를 담은 가이드라인 문서까지 필요합니다.",
      category: "DESIGN",
      budget: 2200000,
      skills: ["FIGMA"],
      clientId: "c_daily",
      applicationCount: 1,
      recruitmentStatus: "OPEN",
      startAt: null,
      deadlineAt: inDays(18),
      createdAt: inDays(-7),
    },
    {
      id: "prj_p04",
      title: "배달앱 MVP 개발",
      description:
        "동네 식당 20곳과 함께 시작하는 배달 서비스입니다. 주문·결제·배차까지 최소 기능만 먼저 만들고 반응을 보려 합니다. iOS 와 Android 를 함께 냅니다.",
      category: "MOBILE_APP",
      budget: 8000000,
      skills: ["FLUTTER", "TYPESCRIPT"],
      clientId: "c_spoon",
      applicationCount: 0,
      recruitmentStatus: "OPEN",
      startAt: null,
      deadlineAt: inDays(23),
      createdAt: inDays(-1),
    },
    {
      id: "prj_p05",
      title: "신제품 런칭 마케팅",
      description:
        "신제품 런칭을 3주 앞두고 있습니다. 랜딩페이지 하나와 SNS 광고 소재 6종이 필요합니다. 카피는 저희가 드리고 구성과 디자인을 맡아 주실 분을 찾습니다.",
      category: "MARKETING",
      budget: 3200000,
      skills: ["FIGMA"],
      clientId: "c_corner",
      applicationCount: 0,
      recruitmentStatus: "OPEN",
      startAt: null,
      deadlineAt: inDays(16),
      createdAt: inDays(-3),
    },
    {
      id: "prj_p06",
      title: "데이터 대시보드 구축",
      description:
        "여러 오픈마켓에서 들어오는 주문을 한 화면에서 보려 합니다. 채널마다 양식이 달라 매주 하루가 정산에 들어갑니다. 집계 로직과 조회 화면이 범위입니다.",
      category: "WEB_DEVELOPMENT",
      budget: 4500000,
      skills: ["PYTHON", "SQL", "REACT"],
      clientId: "c_nowon",
      applicationCount: 0,
      recruitmentStatus: "OPEN",
      startAt: null,
      deadlineAt: inDays(21),
      createdAt: inDays(-4),
    },
    {
      id: "prj_p07",
      title: "리서치 기반 서비스 기획",
      description:
        "새 서비스를 만들기 전에 사용자 조사를 먼저 하려 합니다. 인터뷰 설계부터 리포트까지 맡아 주실 분을 찾습니다. 모집은 다음 주에 시작합니다.",
      category: "PLANNING",
      budget: 6000000,
      skills: ["FIGMA"],
      clientId: "c_hanul",
      applicationCount: 0,
      recruitmentStatus: "SCHEDULED",
      startAt: inDays(6),
      deadlineAt: inDays(28),
      createdAt: inDays(-1),
    },
    {
      id: "prj_p08",
      title: "랜딩 페이지 제작",
      description:
        "행사 안내용 단일 페이지입니다. 모바일 우선으로 만들고 신청 폼이 붙습니다. 모집은 마감했습니다.",
      category: "WEB_DEVELOPMENT",
      budget: 1500000,
      skills: ["HTML_CSS"],
      clientId: "c_bloom",
      applicationCount: 3,
      recruitmentStatus: "CLOSED",
      startAt: null,
      deadlineAt: inDays(-3),
      createdAt: inDays(-20),
    },
    {
      id: "prj_p09",
      title: "사내 인트라넷 개편",
      description:
        "10년 된 사내 시스템을 걷어내고 새로 만듭니다. 게시판·결재·근태가 범위이고 기존 데이터를 옮겨야 합니다.",
      category: "WEB_DEVELOPMENT",
      budget: 12000000,
      skills: ["SPRING", "VUE", "SQL"],
      clientId: "c_raon",
      applicationCount: 1,
      recruitmentStatus: "CLOSED",
      startAt: null,
      deadlineAt: inDays(-6),
      createdAt: inDays(-30),
    },
    {
      id: "prj_p10",
      title: "커머스 앱 리뉴얼",
      description:
        "3년 된 커머스 앱을 새로 만듭니다. 지금 작업이 진행 중입니다.",
      category: "MOBILE_APP",
      budget: 18000000,
      skills: ["FLUTTER", "AWS"],
      clientId: "c_nowon",
      applicationCount: 1,
      recruitmentStatus: "CLOSED",
      startAt: null,
      deadlineAt: inDays(-12),
      createdAt: inDays(-45),
    },
    {
      id: "prj_p11",
      title: "홍보 영상 제작",
      description:
        "회사 소개 영상 한 편입니다. 촬영은 끝났고 편집만 남았습니다. 작업이 완료된 프로젝트입니다.",
      category: "DESIGN",
      budget: 2800000,
      skills: ["FIGMA"],
      clientId: "c_hanul",
      applicationCount: 1,
      recruitmentStatus: "CLOSED",
      startAt: null,
      deadlineAt: inDays(-20),
      createdAt: inDays(-60),
    },
    {
      id: "prj_p12",
      title: "이벤트 페이지 제작",
      description:
        "다음 주 행사에 맞춰 여는 페이지입니다. 일정이 촉박해 마감이 내일입니다. HTML/CSS 로 한 페이지만 만들면 됩니다.",
      category: "WEB_DEVELOPMENT",
      budget: 1800000,
      skills: ["HTML_CSS"],
      clientId: "c_bloom",
      applicationCount: 0,
      recruitmentStatus: "OPEN",
      startAt: null,
      deadlineAt: inDays(1),
      createdAt: inDays(-1),
    },
  ];

  global.PactFiveData = {
    CATEGORIES: CATEGORIES,
    SKILLS: SKILLS,
    CLIENTS: CLIENTS,
    PROJECTS: PROJECTS,
    categoryName: function (id) {
      var c = CATEGORIES.filter(function (x) { return x.id === id; })[0];
      return c ? c.name : id;
    },
    skillName: function (id) {
      var s = SKILLS.filter(function (x) { return x.id === id; })[0];
      return s ? s.name : id;
    },
  };
})(window);
