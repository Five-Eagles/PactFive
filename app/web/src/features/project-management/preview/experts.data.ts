/**
 * 전문가 더미 데이터와 목록 규칙.
 *
 * `design/reference-proposal/demo/experts.js` 를 그대로 옮긴 것이다.
 *
 * ⚠ **PRD 에 없는 기능이다.** 화면 목록(§7.1) 어디에도 프리랜서 탐색이 없고 담당자도
 * 정해지지 않았다. 그래서 이 화면은 `ComingSoonOverlay` 뒤에서 **미리보기로만** 보인다.
 *
 * 값은 전부 지어낸 것이다. 대신 **형식은 ERD 에 있는 것만 쓴다** — 나중에 진짜로 만들 때
 * 컬럼을 새로 파지 않아도 되게.
 *
 *   users               name · profile_image_url · bio · rating_average · review_count
 *   freelancer_profiles primary_category · career_years · hourly_rate_amount
 *   freelancer_skills   기술 목록
 *
 * ERD 에 없어서 **넣지 않은 것**: 접속 상태("활동 가능"), 인증 배지. 시안에는 있지만
 * 채울 컬럼이 없다. 없는 값을 지어내면 나중에 만들 사람이 그걸 요구사항으로 읽는다.
 *
 * 서버가 없으므로 카테고리·기술 이름표를 데이터가 직접 들고 있다. 실제 목록 API 는
 * `displayName` 을 함께 준다 (`project.types.ts` 의 `CategoryRef`·`SkillRef`).
 */

export type Expert = {
  id: string;
  name: string;
  /** 직함. 시안 그대로 영문이다 — 사람이 스스로 적는 자리라 번역하지 않는다 */
  title: string;
  category: string;
  categoryName: string;
  years: number;
  /** 시간당 단가(원) */
  rate: number;
  /** 평점. 리뷰가 없으면 null — **0 이 아니다** */
  rating: number | null;
  reviews: number;
  /** 포트폴리오 썸네일 경로 */
  shot: string;
  skills: { id: string; name: string }[];
  bio: string;
};

const S = {
  FIGMA: 'Figma',
  HTML_CSS: 'HTML/CSS',
  REACT: 'React',
  TYPESCRIPT: 'TypeScript',
  NODEJS: 'Node.js',
  SQL: 'SQL',
  AWS: 'AWS',
  FLUTTER: 'Flutter',
  PYTHON: 'Python',
  VUE: 'Vue',
  SPRING: 'Spring',
} as const;

type SkillId = keyof typeof S;
const sk = (...ids: SkillId[]) => ids.map((id) => ({ id, name: S[id] }));

/** 포트폴리오 썸네일은 시안이 준 4장을 돌려 쓴다. 없는 사진을 지어내지 않는다 */
export const EXPERT_SHOTS = [
  '/images/home/expert-dashboard.jpg',
  '/images/home/expert-backoffice.jpg',
  '/images/home/expert-branding.jpg',
  '/images/home/expert-content.jpg',
];

export const EXPERTS: Expert[] = [
  {
    id: 'flr_01', name: '김다은', title: 'Product designer',
    category: 'DESIGN', categoryName: '디자인',
    years: 6, rate: 45000, rating: 4.9, reviews: 38, shot: EXPERT_SHOTS[0], skills: sk('FIGMA', 'HTML_CSS'),
    bio: '서비스 기획 단계부터 함께합니다. 화면을 그리기 전에 무엇을 덜어낼지 먼저 정합니다. 커머스와 B2B 관리 화면을 주로 맡았습니다.',
  },
  {
    id: 'flr_02', name: '박서윤', title: 'Frontend developer',
    category: 'WEB_DEVELOPMENT', categoryName: '웹 개발',
    years: 4, rate: 52000, rating: 5.0, reviews: 21, shot: EXPERT_SHOTS[1], skills: sk('REACT', 'TYPESCRIPT', 'HTML_CSS'),
    bio: '디자인 시안을 그대로 옮기는 것에 그치지 않고, 느려지는 지점을 먼저 찾아 알려드립니다. 관리자 화면 경험이 많습니다.',
  },
  {
    id: 'flr_03', name: '이준호', title: 'Brand designer',
    category: 'DESIGN', categoryName: '디자인',
    years: 9, rate: 60000, rating: 4.9, reviews: 64, shot: EXPERT_SHOTS[2], skills: sk('FIGMA'),
    bio: '로고 하나로 끝내지 않습니다. 명함부터 앱 아이콘까지 어디에 놓여도 알아볼 수 있는 규칙을 함께 정리해 드립니다.',
  },
  {
    id: 'flr_04', name: '최유진', title: 'Content creator',
    category: 'MARKETING', categoryName: '마케팅',
    years: 3, rate: 38000, rating: 4.8, reviews: 42, shot: EXPERT_SHOTS[3], skills: sk('FIGMA'),
    bio: '제품을 써 보고 씁니다. 광고 문구보다 실제로 무엇이 좋아지는지를 먼저 찾습니다.',
  },
  {
    id: 'flr_05', name: '정민석', title: 'Backend engineer',
    category: 'WEB_DEVELOPMENT', categoryName: '웹 개발',
    years: 7, rate: 58000, rating: 4.7, reviews: 29, shot: EXPERT_SHOTS[1], skills: sk('NODEJS', 'SQL', 'AWS'),
    bio: '트래픽이 늘어도 버티는 구조를 먼저 잡습니다. 결제·정산처럼 틀리면 안 되는 쪽을 주로 맡았습니다.',
  },
  {
    id: 'flr_06', name: '한소영', title: 'Mobile developer',
    category: 'MOBILE_APP', categoryName: '앱 개발',
    years: 5, rate: 50000, rating: 4.6, reviews: 17, shot: EXPERT_SHOTS[0], skills: sk('FLUTTER', 'TYPESCRIPT'),
    bio: 'iOS 와 Android 를 한 벌로 냅니다. 출시 심사에서 막히는 지점을 미리 정리해 드립니다.',
  },
  {
    id: 'flr_07', name: '오세준', title: 'Data analyst',
    category: 'DATA_AI', categoryName: '데이터·AI',
    years: 4, rate: 44000, rating: 4.5, reviews: 11, shot: EXPERT_SHOTS[1], skills: sk('PYTHON', 'SQL'),
    bio: '숫자를 예쁘게 그리는 것보다 어떤 결정을 내릴지부터 여쭙습니다. 그다음에 필요한 지표만 만듭니다.',
  },
  {
    id: 'flr_08', name: '임하늘', title: 'Service planner',
    category: 'PLANNING', categoryName: '기획·컨설팅',
    years: 8, rate: 55000, rating: 4.8, reviews: 33, shot: EXPERT_SHOTS[3], skills: sk('FIGMA'),
    bio: '사용자 인터뷰부터 요구사항 문서까지 맡습니다. 개발자가 바로 읽을 수 있는 형태로 정리합니다.',
  },
  {
    id: 'flr_09', name: '강태현', title: 'Fullstack developer',
    category: 'WEB_DEVELOPMENT', categoryName: '웹 개발',
    years: 6, rate: 56000, rating: 4.4, reviews: 8, shot: EXPERT_SHOTS[2], skills: sk('VUE', 'SPRING', 'SQL'),
    bio: '작은 팀에서 앞뒤를 함께 맡아 왔습니다. 초기 제품을 빠르게 세우는 일에 익숙합니다.',
  },
  {
    id: 'flr_10', name: '서지우', title: 'UX writer',
    category: 'DESIGN', categoryName: '디자인',
    years: 3, rate: 36000, rating: null, reviews: 0, shot: EXPERT_SHOTS[3], skills: sk('FIGMA'),
    bio: '버튼 하나의 말이 바뀌면 사람들이 하는 일이 달라집니다. 오류 문구부터 손보는 편입니다.',
  },
  {
    id: 'flr_11', name: '노현우', title: 'Growth marketer',
    category: 'MARKETING', categoryName: '마케팅',
    years: 5, rate: 47000, rating: 4.3, reviews: 14, shot: EXPERT_SHOTS[2], skills: sk('PYTHON', 'FIGMA'),
    bio: '광고비를 늘리기 전에 새는 곳을 먼저 막습니다. 유입부터 결제까지 어디서 빠지는지 봅니다.',
  },
  {
    id: 'flr_12', name: '윤가람', title: 'ML engineer',
    category: 'DATA_AI', categoryName: '데이터·AI',
    years: 4, rate: 62000, rating: null, reviews: 0, shot: EXPERT_SHOTS[0], skills: sk('PYTHON', 'AWS'),
    bio: '모델보다 데이터를 먼저 봅니다. 지금 있는 데이터로 가능한 것과 아닌 것을 솔직하게 말씀드립니다.',
  },
];

export const PAGE_SIZE = 8; // 4열 × 2행

export const EXPERT_CATEGORIES = [
  { id: 'WEB_DEVELOPMENT', name: '웹 개발' },
  { id: 'MOBILE_APP', name: '앱 개발' },
  { id: 'DESIGN', name: '디자인' },
  { id: 'MARKETING', name: '마케팅' },
  { id: 'DATA_AI', name: '데이터·AI' },
  { id: 'PLANNING', name: '기획·컨설팅' },
];

export const EXPERT_SORTS = [
  { id: 'rating', name: '평점순' },
  { id: 'reviews', name: '리뷰 많은순' },
  { id: 'years', name: '경력순' },
];

/** 목록·상세가 같이 쓰는 기술 목록 (필터 칩) */
export const EXPERT_SKILLS = (Object.keys(S) as SkillId[]).map((id) => ({ id, name: S[id] }));

export type ExpertQuery = {
  category?: string;
  skills?: string[];
  sortBy?: string;
  page?: number;
};

/**
 * 목록 규칙.
 *
 * 정렬은 셋뿐이다. **점수를 만들어 "추천순"이라고 부르지 않는다** — 무엇으로 줄 세웠는지
 * 말할 수 없는 순서는 내보내지 않는다 (engagement 규칙 28 과 같은 이유).
 */
export function listExperts(query: ExpertQuery = {}) {
  let rows = EXPERTS.slice();

  if (query.category) rows = rows.filter((x) => x.category === query.category);

  const skills = query.skills ?? [];
  if (skills.length > 0) {
    // 기술은 AND 다 — 고른 것을 모두 가진 사람만 (project-management 규칙 59 와 같다)
    rows = rows.filter((x) => skills.every((s) => x.skills.some((k) => k.id === s)));
  }

  const by = query.sortBy || 'rating';
  rows.sort((a, b) => {
    if (by === 'reviews') {
      if (a.reviews !== b.reviews) return b.reviews - a.reviews;
    } else if (by === 'years') {
      if (a.years !== b.years) return b.years - a.years;
    } else {
      // 평점순. 평가가 없는 사람은 뒤로 보내되 **0점으로 취급하지 않는다** —
      // "나쁘다"와 "아직 없다"는 다르다
      const ar = a.reviews > 0 ? (a.rating ?? -1) : -1;
      const br = b.reviews > 0 ? (b.rating ?? -1) : -1;
      if (ar !== br) return br - ar;
    }
    return a.id < b.id ? -1 : 1;
  });

  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const page = Math.min(Math.max(1, query.page || 1), totalPages);
  return {
    items: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    totalCount,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
  };
}

export function findExpert(id: string): Expert | null {
  return EXPERTS.find((x) => x.id === id) ?? null;
}
