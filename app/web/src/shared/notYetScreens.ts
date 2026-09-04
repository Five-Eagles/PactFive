/**
 * "아직 없는 화면"을 눌렀을 때 무엇을 알려줄지 정의하는 사이트 전역 레지스트리.
 *
 * `features/project-management/design/reference-proposal/bundle.html`의 `demo/notyet.js`
 * (`SCREENS` 객체)가 원형이다 — 없는 화면을 조용히 죽은 링크로 두지 않고, 준비 중이라는
 * 사실을 말해준다는 철학을 그대로 옮겼다.
 *
 * **여기 있는 값은 방문자가 읽는 말이다.** 담당자·명세 경로 같은 우리끼리 쓰는 정보는
 * `notYetScreens.dev.ts`로 뺐다 — 한 파일에 두면 배포 번들에 문자열로 남아 소스 보기로
 * 읽힌다 (2026-09-04).
 *
 * `hasRoute`가 이 화면을 어떤 컴포넌트로 안내할지 가른다 (app/web/AGENTS.md "시안에는
 * 있지만 아직 없는 화면" 절 참고):
 * - `false` — 갈 곳이 아직 없다. `NotYetTrigger`가 제자리에서 `NotYetDialog`만 연다.
 * - `true` — `App.tsx`에 실제 라우트가 등록돼 있다. 그 라우트는 `ComingSoonOverlay`로
 *   감싸져 있어, 이동은 하되 내용을 블러 처리하고 다이얼로그를 강제로 띄운다.
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
  /** 화면 이름 — 다이얼로그 제목에 그대로 노출된다. 방문자가 읽는 말로 적는다 */
  name: string;
  /** true면 App.tsx에 실제 라우트가 등록돼 있다 (ComingSoonOverlay 대상) */
  hasRoute: boolean;
};

export const NOT_YET_SCREENS: Record<NotYetScreenKey, NotYetScreen> = {
  // 2026-09-04 — 미리보기 화면이 생겼다 (project-management/preview/)
  experts: { name: '전문가 찾기', hasRoute: true },
  guide: { name: '이용 방법', hasRoute: false },
  safety: { name: '안전한 거래', hasRoute: false },
  'footer-terms': { name: '이용약관', hasRoute: false },
  'footer-privacy': { name: '개인정보처리방침', hasRoute: false },
  'footer-support': { name: '고객센터', hasRoute: false },
  applications: { name: '지원하기', hasRoute: true },
  'ai-pricing': { name: 'AI 단가 분석', hasRoute: true },
  reviews: { name: '리뷰', hasRoute: true },
  notifications: { name: '알림', hasRoute: true },
};
