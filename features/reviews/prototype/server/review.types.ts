export type ReviewDirection = "CLIENT_TO_FREELANCER" | "FREELANCER_TO_CLIENT";
export type ReviewVisibility = "BLINDED" | "PUBLISHED";
export type ClientToFreelancerTag =
  | "WORK_QUALITY"
  | "ON_TIME_DELIVERY"
  | "GOOD_COMMUNICATION"
  | "REQUIREMENT_UNDERSTANDING"
  | "PROFESSIONAL_ATTITUDE";
export type FreelancerToClientTag =
  | "CLEAR_REQUIREMENTS"
  | "FAST_FEEDBACK"
  | "GOOD_COMMUNICATION"
  | "SCOPE_STABILITY"
  | "PROFESSIONAL_ATTITUDE";
export type ReviewTag = ClientToFreelancerTag | FreelancerToClientTag;

export type ContractStatus = "DRAFT" | "SIGNING" | "SIGNED" | "CANCELED";
export type ProjectTransactionStatus =
  | "NONE"
  | "CONTRACT_PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED";

export type CreateReviewInput = {
  rating: number;
  content?: string;
  tags: string[];
  contractId?: unknown;
  direction?: unknown;
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

export type MyProjectReviewReason =
  | "PROJECT_NOT_COMPLETED"
  | "REVIEW_FORBIDDEN"
  | "REVIEW_ALREADY_SUBMITTED"
  | "REVIEW_PERIOD_CLOSED";

export type GetMyProjectReviewResponse = {
  canReview: boolean;
  reason: MyProjectReviewReason | null;
  reviewDeadlineAt: string | null;
  myReview: CreateReviewResponse | null;
  counterpartyReviewVisibility: "NOT_AVAILABLE" | "PUBLISHED";
};

export type GetUserRatingResponse = {
  userId: string;
  averageRating: number | null;
  reviewCount: number;
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
  content: string | null;
  tags: string[];
  createdAt: string;
  reviewCreatedPublishedAt: string | null;
};

export type ProjectReviewContext = {
  projectId: string;
  clientId: string;
  freelancerId: string;
  transactionStatus: ProjectTransactionStatus;
  contractStatus: ContractStatus;
  contractId: string;
  completedAt: string | null;
};

export type ReviewWindow = {
  projectId: string;
  openedAt: string;
  deadlineAt: string;
  policyVersion: 1;
};

export type UserRatingProjection = {
  userId: string;
  ratingSum: number;
  reviewCount: number;
  calculatedAt: string;
};

export type UserRatingCache = {
  userId: string;
  ratingAverage: number | null;
  reviewCount: number;
};

export type ReviewApiErrorCode =
  | "AUTH_REQUIRED"
  | "REVIEW_FORBIDDEN"
  | "PROJECT_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "REVIEW_ALREADY_SUBMITTED"
  | "IDEMPOTENCY_KEY_REUSED"
  | "PROJECT_NOT_COMPLETED"
  | "REVIEW_PERIOD_CLOSED"
  | "INVALID_REVIEW_RATING"
  | "REVIEW_CONTENT_INVALID"
  | "REVIEW_TAG_INVALID"
  | "VALIDATION_ERROR"
  | "METHOD_NOT_ALLOWED";

export type ReviewApiErrorBody = {
  error: {
    code: ReviewApiErrorCode;
    message: string;
    details: null | Array<{ field: string; reason: string }>;
  };
};

const HTTP_BY_CODE: Record<ReviewApiErrorCode, 400 | 401 | 403 | 404 | 405 | 409 | 422> = {
  INVALID_REVIEW_RATING: 400,
  AUTH_REQUIRED: 401,
  REVIEW_FORBIDDEN: 403,
  PROJECT_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  REVIEW_ALREADY_SUBMITTED: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  PROJECT_NOT_COMPLETED: 409,
  REVIEW_PERIOD_CLOSED: 409,
  REVIEW_CONTENT_INVALID: 422,
  REVIEW_TAG_INVALID: 422,
  VALIDATION_ERROR: 422,
};

/** 공개 리뷰 API 4xx. users 캐시는 이 오류로 갱신하지 않는다. */
export class ReviewApiError extends Error {
  readonly httpStatus: 400 | 401 | 403 | 404 | 405 | 409 | 422;
  readonly body: ReviewApiErrorBody;

  constructor(
    code: ReviewApiErrorCode,
    message: string,
    details: ReviewApiErrorBody["error"]["details"] = null,
  ) {
    super(message);
    this.name = "ReviewApiError";
    this.httpStatus = HTTP_BY_CODE[code];
    this.body = { error: { code, message, details } };
  }
}

export function isReviewApiError(err: unknown): err is ReviewApiError {
  return err instanceof ReviewApiError;
}

export type ReviewStore = {
  getProject(projectId: string): ProjectReviewContext | undefined;
  userExists(userId: string): boolean;
  getUserCache(userId: string): UserRatingCache | undefined;
  getReviewsByProject(projectId: string): ReviewRow[];
  getReview(reviewId: string): ReviewRow | undefined;
  getAllReviews(): ReviewRow[];
  insertReview(row: ReviewRow): void;
  markReviewCreatedPublished(reviewId: string, publishedAt: string): void;
  getIdempotency(key: string): { bodyHash: string; reviewId: string } | undefined;
  setIdempotency(key: string, bodyHash: string, reviewId: string): void;
  nextReviewId(): string;
  ensureWindow(project: ProjectReviewContext): ReviewWindow;
  getWindow(projectId: string): ReviewWindow | undefined;
  getProjection(userId: string): UserRatingProjection | undefined;
  setProjection(row: UserRatingProjection): void;
  enqueueOutbox(eventId: string, payload: unknown): void;
  listOutbox(): Array<{ eventId: string; payload: unknown }>;
};
