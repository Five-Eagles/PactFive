/**
 * 원본: features/applications/prototype/server/application.constants.ts (PR #83 반영,
 * 2026-09-07 develop 6202e16 기준). Mock 전용 상수(테스트 유저 ID, MSG_PROFILE_INCOMPLETE)는
 * 옮기지 않았다 — app/에는 실제 사용자가 오고, 프로필 완성도 검사는 이번 반영에서 빠졌다
 * (application.types.ts 헤더 주석 2번 항목).
 */
export const ACCEPT_IDEMPOTENCY_PREFIX = 'application-accept-';

export const COVER_LETTER_MIN = 100;
export const COVER_LETTER_MAX = 3000;
export const EXPECTED_AMOUNT_MIN = 10_000;
export const EXPECTED_AMOUNT_MAX = 1_000_000_000;
export const EXPECTED_DURATION_MIN = 1;
export const EXPECTED_DURATION_MAX = 365;

export const MSG_COVER_LETTER = '지원 동기를 100~3,000자로 입력해 주세요.';
export const MSG_EXPECTED_AMOUNT = '제안 금액을 10,000원~1,000,000,000원의 정수로 입력해 주세요.';
export const MSG_EXPECTED_DURATION = '예상 수행 기간을 1~365일의 정수로 입력해 주세요.';
export const MSG_UNKNOWN_FIELD = '요청에 허용되지 않은 필드가 있습니다.';

export const LIST_PAGE_DEFAULT = 1;
export const LIST_PAGE_MAX = 1000;
export const LIST_PAGE_SIZE_DEFAULT = 10;
export const LIST_PAGE_SIZE_MAX = 50;

export const REJECTION_COPY = {
  DIRECT: '의뢰인이 이번 지원을 선정하지 않았습니다.',
  AUTO_OTHER_ACCEPTED: '다른 지원자가 선정되어 이번 지원은 마감되었습니다.',
  AUTO_RECRUITMENT_CLOSED: '프로젝트 모집이 마감되어 지원이 종료되었습니다.',
  AGREEMENT_DECLINED: '금액 합의가 최종 거절되어 선정이 종료되었습니다.',
} as const;
