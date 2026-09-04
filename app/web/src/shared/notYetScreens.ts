/**
 * "아직 없는 화면"을 눌렀을 때 무엇을 알려줄지 정의하는 사이트 전역 레지스트리.
 *
 * `features/project-management/design/reference-proposal/bundle.html`의 `demo/notyet.js`
 * (`SCREENS` 객체)가 원형이다 — 없는 화면을 조용히 죽은 링크로 두지 않고, 준비 중이라는
 * 사실을 말해준다는 철학을 그대로 옮겼다.
 *
 * **여기 있는 값은 방문자가 읽는 말이다.** 담당자·명세 경로 같은 우리끼리 쓰는 정보는
 * 화면에 절대 넣지 않는다 — 개발 중에만 보이게 하는 것도 안 된다. 그런 정보가 필요하면
 * 이 파일 아래 주석을 읽는다 (2026-09-04).
 *
 * `hasRoute`가 이 화면을 어떤 컴포넌트로 안내할지 가른다 (app/web/AGENTS.md "시안에는
 * 있지만 아직 없는 화면" 절 참고):
 * - `false` — 갈 곳이 아직 없다. `NotYetTrigger`가 제자리에서 `NotYetDialog`만 연다.
 * - `true` — `App.tsx`에 실제 라우트가 등록돼 있다. 그 라우트는 `ComingSoonOverlay`로
 *   감싸져 있어, 이동은 하되 내용을 블러 처리하고 다이얼로그를 강제로 띄운다.
 */
export type NotYetScreenKey =
  | 'experts'
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
  // 2026-09-04 — guide·safety·footer 3종은 실제 화면이 되어 이 표에서 빠졌다.
  // 남겨두면 다음 사람이 "아직 없는 화면" 으로 읽는다.
  experts: { name: '전문가 찾기', hasRoute: true },
  applications: { name: '지원하기', hasRoute: true },
  'ai-pricing': { name: 'AI 단가 분석', hasRoute: true },
  reviews: { name: '리뷰', hasRoute: true },
  notifications: { name: '알림', hasRoute: true },
};

/* ─────────────────────────────────────────────────────────────
 * 담당과 명세 위치 — **주석이다. 화면에 그리지 않는다.**
 *
 * 예전에 이 정보를 다이얼로그에 띄웠다가 걷어냈다. 개발 중에만 보이게 해도 안 된다 —
 * 화면은 방문자가 읽는 자리이고, 담당자 이름과 내부 경로는 거기 있을 것이 아니다.
 * 알아야 하는 사람은 코드를 읽는 사람뿐이므로 여기 둔다.
 *
 *   experts        유동우 · app/web/src/features/project-management/preview/
 *                  (시안: design/reference-proposal/experts.html)
 *                  PRD 화면 목록(§7.1)에 프리랜서 탐색이 없다. 만들지 말지부터 팀이 정한다
 *
 *   applications   조준영 (2026-09-03 재배정) · features/applications/
 *                  서버·프로토타입은 있다(PR #52). app/web 화면 연결이 아직이다
 *
 *   ai-pricing     오민혁 · features/ai-pricing/
 *
 *   reviews        조준영 · features/reviews/
 *                  프로토타입은 있다. app/web 화면 연결이 아직이다
 *
 *   notifications  담당 미정 · features/notifications/
 * ───────────────────────────────────────────────────────────── */
