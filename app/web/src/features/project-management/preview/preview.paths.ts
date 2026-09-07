/**
 * 미리보기 화면의 경로 상수.
 *
 * **컴포넌트를 import 하지 않는 파일이다.** `preview.routes.tsx` 에 같이 두면 순환이 생긴다 —
 * 라우트 파일이 화면을 부르고, 그 화면이 다시 경로를 얻으려고 라우트 파일을 부른다.
 * 모듈 최상단에서 경로를 읽는 순간(예: 배너 슬라이드 배열) 그 순환이 실제로 터진다.
 *
 * 경로만 있는 이 파일은 누구든 안전하게 부를 수 있다.
 */
export const PREVIEW_ROUTES = {
  experts: '/experts',
  expertDetail: (expertId: string) => `/experts/${expertId}`,
} as const;
