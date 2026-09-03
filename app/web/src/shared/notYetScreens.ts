/**
 * "아직 없는 화면"을 눌렀을 때 무엇을 알려줄지 정의하는 사이트 전역 레지스트리.
 *
 * `features/project-management/design/reference-proposal/bundle.html`의 `demo/notyet.js`
 * (`SCREENS` 객체)가 원형이다 — 없는 화면을 조용히 죽은 링크로 두지 않고, 없다는 사실과
 * 담당·명세 위치를 말해준다는 철학을 그대로 옮겼다.
 *
 * `hasRoute`가 이 화면을 어떤 컴포넌트로 안내할지 가른다 (app/web/AGENTS.md "시안에는
 * 있지만 아직 없는 화면" 절 참고):
 * - `false` — 기능 폴더·spec·prototype 자체가 없다. `NotYetTrigger`가 제자리에서
 *   `NotYetDialog`만 연다(이동하지 않는다).
 * - `true` — `App.tsx`의 `NOT_INTEGRATED_ROUTES`에 실제 라우트가 등록돼 있다. 그 라우트는
 *   `ComingSoonOverlay`로 감싸져 있어, 이동은 하되 내용을 블러 처리하고 다이얼로그를 강제로
 *   띄운다(뒤로가기로만 닫힌다).
 */
export type NotYetScreenKey =
  | 'experts'
  | 'guide'
  | 'safety'
  | 'footer-terms'
  | 'footer-privacy'
  | 'footer-support'
  | 'applications'
  | 'ai-pricing'
  | 'reviews'
  | 'notifications';

export type NotYetScreen = {
  /** 화면 이름 — 다이얼로그 제목에 그대로 노출된다 */
  name: string;
  /** 담당자. 아직 정해지지 않았으면 지어내지 말고 "담당 미정"으로 정직하게 적는다 */
  owner: string;
  /** 명세·논의가 있는 위치 (파일 경로, CR 번호 등) */
  where: string;
  /** 왜 아직 없는지, 무엇부터 정해야 하는지 — 없으면 빈 문자열 */
  note: string;
  /** true면 App.tsx에 실제 라우트가 등록돼 있다 (ComingSoonOverlay 대상) */
  hasRoute: boolean;
};

export const NOT_YET_SCREENS: Record<NotYetScreenKey, NotYetScreen> = {
  experts: {
    name: '전문가 찾기',
    owner: '담당 미정',
    where: 'features/project-management/design/reference-proposal/README.md "확인이 필요한 것" 1번',
    note: 'PRD 화면 목록(§7.1)에 프리랜서 탐색 화면이 없다. 만들지 말지부터 팀이 정해야 한다.',
    hasRoute: false,
  },
  guide: {
    name: '이용 방법',
    owner: '담당 미정',
    where: 'features/project-management/design/homepage-transplant-plan.md 9번 Decision',
    note: '',
    hasRoute: false,
  },
  safety: {
    name: '안전한 거래',
    owner: '담당 미정',
    where: 'features/project-management/design/homepage-transplant-plan.md 9번 Decision',
    note: '',
    hasRoute: false,
  },
  'footer-terms': {
    name: '이용약관',
    owner: '담당 미정',
    where: 'features/project-management/design/homepage-transplant-plan.md 9번 Decision',
    note: '',
    hasRoute: false,
  },
  'footer-privacy': {
    name: '개인정보처리방침',
    owner: '담당 미정',
    where: 'features/project-management/design/homepage-transplant-plan.md 9번 Decision',
    note: '',
    hasRoute: false,
  },
  'footer-support': {
    name: '고객센터',
    owner: '담당 미정',
    where: 'features/project-management/design/homepage-transplant-plan.md 9번 Decision',
    note: '',
    hasRoute: false,
  },
  applications: {
    name: '지원하기',
    owner: '조준영 (2026-09-03 재배정)',
    where: 'features/applications/',
    note: '서버·프로토타입은 있다(PR #52). app/web 화면 연결이 아직이다.',
    hasRoute: true,
  },
  'ai-pricing': {
    name: 'AI 단가 분석',
    owner: '오민혁',
    where: 'features/ai-pricing/',
    note: '',
    hasRoute: true,
  },
  reviews: {
    name: '리뷰',
    owner: '조준영',
    where: 'features/reviews/',
    note: '프로토타입은 있다. app/web 화면 연결이 아직이다.',
    hasRoute: true,
  },
  notifications: {
    name: '알림',
    owner: '담당 미정',
    where: 'features/notifications/',
    note: '',
    hasRoute: true,
  },
};
