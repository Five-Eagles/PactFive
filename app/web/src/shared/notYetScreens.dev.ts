import type { NotYetScreenKey } from './notYetScreens';

/**
 * 준비 중 화면의 **개발자용** 메모 — 담당과 명세 위치.
 *
 * `notYetScreens.ts` 에서 떼어냈다. 방문자 화면에 그리지 않는 것만으로는 부족하다 —
 * 한 파일에 두면 배포 번들 안에 담당자 이름과 내부 경로가 문자열로 그대로 남아
 * **소스 보기로 읽힌다.** `DevScreenNote` 하나만 이 파일을 쓰고, 그 컴포넌트는
 * 배포 빌드에서 통째로 사라지므로 이 데이터도 함께 빠진다.
 *
 * 담당이 아직 없으면 지어내지 말고 "담당 미정"으로 정직하게 적는다.
 */
export type DevScreenNote = {
  /** 담당자. 정해지지 않았으면 "담당 미정" */
  owner: string;
  /** 명세·논의가 있는 위치 (파일 경로, CR 번호 등) */
  where: string;
  /** 왜 아직 없는지, 무엇부터 정해야 하는지 — 없으면 빈 문자열 */
  note: string;
};

export const DEV_SCREEN_NOTES: Record<NotYetScreenKey, DevScreenNote> = {
  experts: {
    owner: '유동우 (대표페이지 위성 화면)',
    where: 'app/web/src/features/project-management/preview/ (시안: design/reference-proposal/experts.html)',
    note: 'PRD 화면 목록(§7.1)에 프리랜서 탐색 화면이 없다. 만들지 말지부터 팀이 정해야 한다.',
  },
  guide: {
    owner: '유동우 (대표페이지 위성 화면)',
    where: 'features/project-management/design/reference-proposal/guide.html',
    note: '',
  },
  safety: {
    owner: '유동우 (대표페이지 위성 화면)',
    where: 'features/project-management/design/reference-proposal/guide.html #safety',
    note: '',
  },
  'footer-terms': {
    owner: '담당 미정',
    where: 'features/project-management/design/homepage-transplant-plan.md 9번 Decision',
    note: '',
  },
  'footer-privacy': {
    owner: '담당 미정',
    where: 'features/project-management/design/homepage-transplant-plan.md 9번 Decision',
    note: '',
  },
  'footer-support': {
    owner: '담당 미정',
    where: 'features/project-management/design/homepage-transplant-plan.md 9번 Decision',
    note: '',
  },
  applications: {
    owner: '조준영 (2026-09-03 재배정)',
    where: 'features/applications/',
    note: '서버·프로토타입은 있다(PR #52). app/web 화면 연결이 아직이다.',
  },
  'ai-pricing': {
    owner: '오민혁',
    where: 'features/ai-pricing/',
    note: '',
  },
  reviews: {
    owner: '조준영',
    where: 'features/reviews/',
    note: '프로토타입은 있다. app/web 화면 연결이 아직이다.',
  },
  notifications: {
    owner: '담당 미정',
    where: 'features/notifications/',
    note: '',
  },
};
