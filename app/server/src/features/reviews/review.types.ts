/**
 * reviews — 도메인 타입 정본 (app/ 반영)
 *
 * 원본: features/reviews/prototype/server/review.types.ts (조준영). app/ 재해석에서 바뀐 것
 * 두 가지 — 원본의 `ReviewStore`는 프로젝트 컨텍스트(`clientId`·`freelancerId`·
 * `transactionStatus`·`contractStatus`·`contractId`)와 "사용자가 존재하는가"까지 같은
 * 저장소 안에 동기 함수로 뒀다(단일 프로세스 Mock이라 가능했다). app/에서는:
 *
 *   1. 프로젝트 조각의 절반은 project-management(`clientId`·`transactionStatus`)에,
 *      나머지 절반은 contracts-payments(`freelancerId`·`contractId`·`contractStatus`)에
 *      있다 — 두 delegate를 합치는 `ProjectReviewContextPort`(비동기)로 분리했다.
 *   2. "사용자가 존재하는가"는 user-management가 아직 조회 함수를 내놓지 않아
 *      engagement의 `UserReadPort.getUserRole`과 같은 임시 연결(express-app.ts의 `roleByUserId`
 *      캐시)을 재사용한다 — `UserExistsPort`로 분리했다(feedback_loop 2026-09-05 기록).
 *
 * `ReviewRepository`는 리뷰(`reviews`) 자기 자신의 행만 갖는다.
 */

export type ReviewDirection = 'CLIENT_TO_FREELANCER' | 'FREELANCER_TO_CLIENT';
/** 공개 여부. `isPublic: boolean`에서 바뀌었다 (조준영, 2026-09-09 이식 지시서 §1-3). */
export type ReviewVisibility = 'BLINDED' | 'PUBLISHED';
// 태그 코드 v2.0 — review.constants.ts 참고. app/ 이식본(2026-09-05)이 2026-09-07 설계서
// v2.0 이전 계약을 쓰고 있던 것을 여기서도 맞춘다.
export type ClientToFreelancerTag =
  | 'WORK_QUALITY'
  | 'ON_TIME_DELIVERY'
  | 'GOOD_COMMUNICATION'
  | 'REQUIREMENT_UNDERSTANDING'
  | 'PROFESSIONAL_ATTITUDE';
export type FreelancerToClientTag =
  | 'CLEAR_REQUIREMENTS'
  | 'FAST_FEEDBACK'
  | 'GOOD_COMMUNICATION'
  | 'SCOPE_STABILITY'
  | 'PROFESSIONAL_ATTITUDE';
export type ReviewTag = ClientToFreelancerTag | FreelancerToClientTag;

export type ContractStatus = 'DRAFT' | 'SIGNING' | 'SIGNED' | 'CANCELED';
export type ProjectTransactionStatus =
  | 'NONE'
  | 'CONTRACT_PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELED';

export type CreateReviewInput = {
  rating: number;
  content?: string;
  tags: string[];
};

export type ReviewItem = {
  reviewId: string;
  direction: ReviewDirection;
  rating: number;
  content: string | null;
  tags: string[];
  visibility: ReviewVisibility;
  submittedAt: string;
};

export type CreateReviewResponse = ReviewItem & {
  projectId: string;
  contractId: string;
  reviewerId: string;
  revieweeId: string;
  /** 작성 직후에는 수정할 수 없다 — 원본 고정값(api-contract.md :137) */
  editable: false;
};

export type CreateReviewResult = {
  httpStatus: 200 | 201;
  body: CreateReviewResponse;
};

export type ListProjectReviewsResponse = {
  projectId: string;
  items: ReviewItem[];
};

/** `getReviewSummary`에서 이름을 바꿨다(이식 지시서 §3) — `review-summary` 경로가 `rating`으로
 * 바뀐 것과 짝이다. 오케스트레이션 조회 이름 `getUserRatingSummary`는 이 타입의 별칭이다. */
export type GetUserRatingResponse = {
  userId: string;
  averageRating: number | null;
  reviewCount: number;
};

/** `reviews/me`가 「작성할 수 없는 이유」로 주는 코드. `REVIEW_PERIOD_CLOSED`는 review_windows가
 * 생기는 CR-RV-002 이후(#203)에 추가한다 — 그전까지 이 사유로는 절대 안 걸린다. */
export type MyProjectReviewReason =
  | 'PROJECT_NOT_COMPLETED'
  | 'REVIEW_FORBIDDEN'
  | 'REVIEW_ALREADY_SUBMITTED'
  | 'REVIEW_PERIOD_CLOSED';

export type GetMyProjectReviewResponse = {
  canReview: boolean;
  reason: MyProjectReviewReason | null;
  /** review_windows 없이는 줄 값이 없다 — CR-RV-002 전까지 항상 null(이식 지시서 §4). */
  reviewDeadlineAt: string | null;
  myReview: CreateReviewResponse | null;
  counterpartyReviewVisibility: 'NOT_AVAILABLE' | 'PUBLISHED';
};

export type ListUserReviewsResponse = {
  items: ReviewItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type ReviewRow = {
  reviewId: string;
  projectId: string;
  contractId: string;
  reviewerId: string;
  revieweeId: string;
  direction: ReviewDirection;
  rating: number;
  comment: string | null;
  tags: string[];
  createdAt: string;
  reviewCreatedPublishedAt: string | null;
};

/** project-management + contracts-payments가 정본인 프로젝트 조각. 두 delegate를 합쳐서 채운다. */
export type ProjectReviewContext = {
  projectId: string;
  clientId: string;
  freelancerId: string;
  transactionStatus: ProjectTransactionStatus;
  contractStatus: ContractStatus;
  contractId: string;
};

// 에러 코드 v2.0 (조준영, 2026-09-09 이식 지시서 §2-2) — api-contract.md 계약과 맞춘다.
// PROJECT_FORBIDDEN→REVIEW_FORBIDDEN, TRANSACTION_NOT_COMPLETED·PROJECT_TRANSITION_CONFLICT
// (취소 분기)→PROJECT_NOT_COMPLETED 한 덩어리, REVIEW_ALREADY_EXISTS 두 용도를
// IDEMPOTENCY_KEY_REUSED(같은 키·다른 본문)·REVIEW_ALREADY_SUBMITTED(같은 방향 재작성)로 분리,
// rating/tags 검증을 VALIDATION_ERROR에서 INVALID_REVIEW_RATING/REVIEW_TAG_INVALID로 분리,
// REVIEW_CONTENT_INVALID 신설. idempotencyKey 누락은 원본대로 VALIDATION_ERROR 유지.
export type ReviewApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'REVIEW_FORBIDDEN'
  | 'PROJECT_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'REVIEW_ALREADY_SUBMITTED'
  | 'PROJECT_NOT_COMPLETED'
  | 'INVALID_REVIEW_RATING'
  | 'REVIEW_TAG_INVALID'
  | 'REVIEW_CONTENT_INVALID'
  | 'VALIDATION_ERROR'
  | 'METHOD_NOT_ALLOWED';

export type ReviewApiErrorBody = {
  error: {
    code: ReviewApiErrorCode;
    message: string;
    details: null | Array<{ field: string; reason: string }>;
  };
};

const HTTP_BY_CODE: Record<ReviewApiErrorCode, 400 | 401 | 403 | 404 | 405 | 409 | 422> = {
  AUTH_REQUIRED: 401,
  REVIEW_FORBIDDEN: 403,
  PROJECT_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  IDEMPOTENCY_KEY_REUSED: 409,
  REVIEW_ALREADY_SUBMITTED: 409,
  PROJECT_NOT_COMPLETED: 409,
  INVALID_REVIEW_RATING: 400,
  REVIEW_TAG_INVALID: 422,
  REVIEW_CONTENT_INVALID: 422,
  VALIDATION_ERROR: 422,
};

/** 공개 리뷰 API 4xx. users 캐시는 이 오류로 갱신하지 않는다. */
export class ReviewApiError extends Error {
  readonly httpStatus: 400 | 401 | 403 | 404 | 405 | 409 | 422;
  readonly body: ReviewApiErrorBody;

  constructor(
    code: ReviewApiErrorCode,
    message: string,
    details: ReviewApiErrorBody['error']['details'] = null,
  ) {
    super(message);
    this.name = 'ReviewApiError';
    this.httpStatus = HTTP_BY_CODE[code];
    this.body = { error: { code, message, details } };
  }
}

export function isReviewApiError(err: unknown): err is ReviewApiError {
  return err instanceof ReviewApiError;
}

/** 공개된 시점에만 발행한다. notifications 담당이 아직 없어(폴더가 .gitkeep뿐) 발행만 하고
 * 발송은 미룬다 — applications의 InMemoryApplicationNotificationPort와 같은 원칙. */
export type ReviewCreatedEvent = {
  reviewId: string;
  projectId: string;
  revieweeId: string;
  rating: number;
  publishedAt: string;
};

export type ReviewEventPort = {
  publishReviewCreated(event: ReviewCreatedEvent): Promise<void>;
};

export type PublishedRatingAggregate = {
  ratingSum: number;
  reviewCount: number;
};

/**
 * 리뷰 자기 자신의 행 저장소. 프로젝트 조각·사용자 존재 여부는 없다 (위 주석 참고).
 *
 * 2026-09-08 팀장 반영: Prisma 백엔드 추가를 위해 전 메서드를 Promise 반환으로 바꿨다(원본은
 * 단일 프로세스 Mock이라 동기였다) — InMemory 구현은 이미 동기로 계산한 값을 Promise.resolve로
 * 감싸기만 하면 되고, review.service.ts 호출부는 전부 이미 async 함수 안이라 await만 추가하면
 * 된다(기계적 변경, 검증은 tsc가 대신한다).
 */
export type ReviewRepository = {
  getReviewsByProject(projectId: string): Promise<ReviewRow[]>;
  getReview(reviewId: string): Promise<ReviewRow | undefined>;
  getAllReviews(): Promise<ReviewRow[]>;
  insertReview(row: ReviewRow): Promise<void>;
  markReviewCreatedPublished(reviewId: string, publishedAt: string): Promise<void>;
  getIdempotency(key: string): Promise<{ bodyHash: string; reviewId: string } | undefined>;
  setIdempotency(key: string, bodyHash: string, reviewId: string): Promise<void>;
  nextReviewId(): Promise<string>;
};

/** 프로젝트 조각 읽기 — project-management + contracts-payments delegate 합성
 * (app/web/AGENTS.md "폴더 간 접점" — 이 폴더는 두 폴더를 직접 import하지 않는다). */
export type ProjectReviewContextPort = {
  getProjectContext(projectId: string): Promise<ProjectReviewContext | null>;
};

/** "사용자가 존재하는가" — user-management가 조회 함수를 내놓기 전까지의 잠정 연결
 * (express-app.ts의 `roleByUserId` 캐시, engagement의 UserReadPort와 같은 원칙). */
export type UserExistsPort = {
  userExists(userId: string): Promise<boolean>;
};
