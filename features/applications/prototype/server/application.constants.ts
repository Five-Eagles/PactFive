export const MOCK_NOW = "2026-09-03T02:00:00Z";
export const MOCK_CLIENT_USER_ID = "usr_client_a";
export const MOCK_FREELANCER_USER_ID = "usr_freelancer_b";
export const MOCK_FREELANCER_2_USER_ID = "usr_freelancer_c";
export const MOCK_OUTSIDER_USER_ID = "usr_outsider";
export const MOCK_INCOMPLETE_USER_ID = "usr_freelancer_incomplete";

export const APPLY_IDEMPOTENCY_PREFIX = "application-create-";
export const ACCEPT_IDEMPOTENCY_PREFIX = "application-accept-";

export const COVER_LETTER_MIN = 100;
export const COVER_LETTER_MAX = 3000;
export const EXPECTED_AMOUNT_MIN = 10_000;
export const EXPECTED_AMOUNT_MAX = 1_000_000_000;
export const EXPECTED_DURATION_MIN = 1;
export const EXPECTED_DURATION_MAX = 365;

export const MSG_COVER_LETTER =
  "지원 동기를 100~3,000자로 입력해 주세요.";
export const MSG_EXPECTED_AMOUNT =
  "제안 금액을 10,000원~1,000,000,000원의 정수로 입력해 주세요.";
export const MSG_EXPECTED_DURATION =
  "예상 수행 기간을 1~365일의 정수로 입력해 주세요.";
export const MSG_UNKNOWN_FIELD = "요청에 허용되지 않은 필드가 있습니다.";

export const MSG_PROFILE_INCOMPLETE = "지원 전에 필수 프로필을 완성해 주세요.";
export const MSG_PROJECT_CANCELED = "프로젝트가 취소되었습니다.";
export const MSG_ACCEPT_QUEUED = "선정은 완료되었으며 후속 처리를 진행 중입니다";

export const LIST_PAGE_DEFAULT = 1;
export const LIST_PAGE_MAX = 1000;
export const LIST_PAGE_SIZE_DEFAULT = 10;
export const LIST_PAGE_SIZE_MAX = 50;

export const REJECTION_COPY = {
  DIRECT: "의뢰인이 이번 지원을 선정하지 않았습니다.",
  AUTO_OTHER_ACCEPTED: "다른 지원자가 선정되어 이번 지원은 마감되었습니다.",
  AUTO_RECRUITMENT_CLOSED: "프로젝트 모집이 마감되어 지원이 종료되었습니다.",
  AGREEMENT_DECLINED: "금액 합의가 최종 거절되어 선정이 종료되었습니다.",
} as const;
