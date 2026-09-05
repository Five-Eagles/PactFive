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
 *      engagement의 `UserReadPort.getUserRole`과 같은 임시 연결(app.ts의 `roleByUserId`
 *      캐시)을 재사용한다 — `UserExistsPort`로 분리했다(feedback_loop 2026-09-05 기록).
 *
 * `ReviewRepository`는 리뷰(`reviews`) 자기 자신의 행만 갖는다.
 */

export type ReviewDirection = 'CLIENT_TO_FREELANCER' | 'FREELANCER_TO_CLIENT';
export type ClientToFreelancerTag =
  | 'RESPONSIBILITY'
  | 'COMMUNICATION'
  | 'TECHNICAL_SKILL'
  | 'SCHEDULE_COMPLIANCE'
  | 'DELIVERABLE_QUALITY';
export type FreelancerToClientTag =
  | 'REQUIREMENT_CLARITY'
  | 'COMMUNICATION'
  | 'FEEDBACK_SPEED'
  | 'SCOPE_STABILITY'
  | 'PAYMENT_RELIABILITY';
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
  comment?: string;
  tags: string[];
};

export type ReviewItem = {
  reviewId: string;
  direction: ReviewDirection;
  rating: number;
  comment: string | null;
  tags: string[];
  isPublic: boolean;
  createdAt: string;
};

export type CreateReviewResponse = ReviewItem & {
  projectId: string;
  contractId: string;
  reviewerId: string;
  revieweeId: string;
};

export type CreateReviewResult = {
  httpStatus: 200 | 201;
  body: CreateReviewResponse;
};

export type ListProjectReviewsResponse = {
  projectId: string;
  items: ReviewItem[];
};

export type GetReviewSummaryResponse = {
  userId: string;
  averageRating: number | null;
  reviewCount: number;
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

export type ReviewApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'PROJECT_FORBIDDEN'
  | 'PROJECT_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'REVIEW_ALREADY_EXISTS'
  | 'TRANSACTION_NOT_COMPLETED'
  | 'PROJECT_TRANSITION_CONFLICT'
  | 'VALIDATION_ERROR'
  | 'METHOD_NOT_ALLOWED';

export type ReviewApiErrorBody = {
  error: {
    code: ReviewApiErrorCode;
    message: string;
    details: null | Array<{ field: string; reason: string }>;
  };
};

const HTTP_BY_CODE: Record<ReviewApiErrorCode, 401 | 403 | 404 | 405 | 409 | 422> = {
  AUTH_REQUIRED: 401,
  PROJECT_FORBIDDEN: 403,
  PROJECT_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  REVIEW_ALREADY_EXISTS: 409,
  TRANSACTION_NOT_COMPLETED: 409,
  PROJECT_TRANSITION_CONFLICT: 409,
  VALIDATION_ERROR: 422,
};

/** 공개 리뷰 API 4xx. users 캐시는 이 오류로 갱신하지 않는다. */
export class ReviewApiError extends Error {
  readonly httpStatus: 401 | 403 | 404 | 405 | 409 | 422;
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

/** 리뷰 자기 자신의 행 저장소. 프로젝트 조각·사용자 존재 여부는 없다 (위 주석 참고). */
export type ReviewRepository = {
  getReviewsByProject(projectId: string): ReviewRow[];
  getReview(reviewId: string): ReviewRow | undefined;
  getAllReviews(): ReviewRow[];
  insertReview(row: ReviewRow): void;
  markReviewCreatedPublished(reviewId: string, publishedAt: string): void;
  getIdempotency(key: string): { bodyHash: string; reviewId: string } | undefined;
  setIdempotency(key: string, bodyHash: string, reviewId: string): void;
  nextReviewId(): string;
};

/** 프로젝트 조각 읽기 — project-management + contracts-payments delegate 합성
 * (app/web/AGENTS.md "폴더 간 접점" — 이 폴더는 두 폴더를 직접 import하지 않는다). */
export type ProjectReviewContextPort = {
  getProjectContext(projectId: string): Promise<ProjectReviewContext | null>;
};

/** "사용자가 존재하는가" — user-management가 조회 함수를 내놓기 전까지의 잠정 연결
 * (app.ts의 `roleByUserId` 캐시, engagement의 UserReadPort와 같은 원칙). */
export type UserExistsPort = {
  userExists(userId: string): Promise<boolean>;
};
