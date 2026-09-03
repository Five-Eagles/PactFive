/**
 * main.html `.cats__grid` 10칸의 데이터.
 *
 * **2026-09-04 정정**: 처음엔 ERD 값을 `WEB_DEVELOPMENT`·`APP_DEVELOPMENT`·`DESIGN`·
 * `MARKETING`·`PLANNING`·`ETC` 6종으로 잘못 기억하고 `MOBILE_APP`→`APP_DEVELOPMENT`,
 * `데이터·AI`→`ETC`로 옮겨 심었다. 실제로 서버에 물어보니(`GET /api/v1/projects?category=ETC`
 * → 422 `INVALID_CATEGORY`) 진짜 값은 `app/server/src/features/project-management/
 * in-memory-external.adapter.ts`의 `VALID_CATEGORIES`: `WEB_DEVELOPMENT`·`MOBILE_APP`·
 * `DESIGN`·`DATA_AI`·`PLANNING`·`MARKETING`이다 — `APP_DEVELOPMENT`·`ETC`는 애초에 없다.
 * 시안의 "앱 개발"·"데이터·AI" 타일이 실은 값을 안 옮겨도 이미 맞았다. `UX·UI`·`브랜딩`·
 * `영상·사진`·`콘텐츠` 4개만 `DESIGN`으로 근사한다(README가 이미 제안한 근사, 유일하게
 * 남는 근사다).
 */
export type HomeCategory = {
  key: string;
  label: string;
  /** undefined면 필터 없이 전체 목록(전체보기) */
  category: string | undefined;
  hot?: boolean;
};

export const HOME_CATEGORIES: HomeCategory[] = [
  { key: 'web', label: '웹 개발', category: 'WEB_DEVELOPMENT' },
  { key: 'app', label: '앱 개발', category: 'MOBILE_APP' },
  { key: 'ux', label: 'UX · UI', category: 'DESIGN', hot: true },
  { key: 'brand', label: '브랜딩', category: 'DESIGN' },
  { key: 'marketing', label: '마케팅', category: 'MARKETING' },
  { key: 'video', label: '영상 · 사진', category: 'DESIGN' },
  { key: 'content', label: '콘텐츠', category: 'DESIGN' },
  { key: 'data', label: '데이터 · AI', category: 'DATA_AI' },
  { key: 'planning', label: '기획 · 컨설팅', category: 'PLANNING' },
  { key: 'all', label: '전체보기', category: undefined },
];
