/**
 * 안내 화면의 경로 상수.
 *
 * **컴포넌트를 import 하지 않는 파일이다.** 라우트 파일에 같이 두면 순환이 생긴다 —
 * 라우트가 화면을 부르고, 화면이 다시 경로를 얻으려 라우트를 부른다
 * (`preview/preview.paths.ts` 와 같은 이유).
 */
export const INFO_ROUTES = {
  guide: '/guide',
  safety: '/safety',
  terms: '/terms',
  privacy: '/privacy',
  support: '/support',
} as const;
