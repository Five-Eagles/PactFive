/**
 * 앱 전역 경로 상수.
 *
 * 특정 기능에 속하는 경로는 여기가 아니라 그 기능의 `{도메인}.routes.tsx`에서 export한다.
 * 화면 컴포넌트에 경로 문자열을 하드코딩하지 않는다 (app/web/AGENTS.md).
 */
export const APP_ROUTES = {
  home: '/',
  login: '/login',
} as const;
