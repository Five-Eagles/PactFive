export type ReviewDirection = "CLIENT_TO_FREELANCER" | "FREELANCER_TO_CLIENT";
export type ClientToFreelancerTag =
  | "RESPONSIBILITY"
  | "COMMUNICATION"
  | "TECHNICAL_SKILL"
  | "SCHEDULE_COMPLIANCE"
  | "DELIVERABLE_QUALITY";
export type FreelancerToClientTag =
  | "REQUIREMENT_CLARITY"
  | "COMMUNICATION"
  | "FEEDBACK_SPEED"
  | "SCOPE_STABILITY"
  | "PAYMENT_RELIABILITY";
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
  comment?: string;
  tags: string[];
  contractId?: unknown;
  direction?: unknown;
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

export type ProjectReviewContext = {
  projectId: string;
  clientId: string;
  freelancerId: string;
  transactionStatus: ProjectTransactionStatus;
  contractStatus: ContractStatus;
  contractId: string;
};

export type UserRatingCache = {
  userId: string;
  ratingAverage: number | null;
  reviewCount: number;
};

export type ReviewApiErrorCode =
  | "AUTH_REQUIRED"
  | "PROJECT_FORBIDDEN"
  | "PROJECT_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "REVIEW_ALREADY_EXISTS"
  | "TRANSACTION_NOT_COMPLETED"
  | "PROJECT_TRANSITION_CONFLICT"
  | "VALIDATION_ERROR"
  | "METHOD_NOT_ALLOWED";

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
};
