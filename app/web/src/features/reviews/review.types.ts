/**
 * reviews 응답 타입 — app/server/src/features/reviews/review.types.ts와 같은 모양을 화면이
 * 필요로 하는 만큼만 옮긴다 (app/web/AGENTS.md "폴더 간 접점" — 서버 폴더를 직접 import하지
 * 않는다).
 *
 * 2026-09-09 — 조준영 이식 지시서 §1: 태그 코드 v2.0, comment→content, isPublic→visibility,
 * createdAt→submittedAt, editable 추가. 서버 review.types.ts와 같은 변경.
 */

export type ReviewDirection = 'CLIENT_TO_FREELANCER' | 'FREELANCER_TO_CLIENT';
export type ReviewVisibility = 'BLINDED' | 'PUBLISHED';
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

export const CLIENT_TO_FREELANCER_TAGS: ClientToFreelancerTag[] = [
  'WORK_QUALITY',
  'ON_TIME_DELIVERY',
  'GOOD_COMMUNICATION',
  'REQUIREMENT_UNDERSTANDING',
  'PROFESSIONAL_ATTITUDE',
];

export const FREELANCER_TO_CLIENT_TAGS: FreelancerToClientTag[] = [
  'CLEAR_REQUIREMENTS',
  'FAST_FEEDBACK',
  'GOOD_COMMUNICATION',
  'SCOPE_STABILITY',
  'PROFESSIONAL_ATTITUDE',
];

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
  editable: false;
};

export type ListProjectReviewsResponse = {
  projectId: string;
  items: ReviewItem[];
};

/** `review-summary`→`rating` 경로 변경과 짝인 타입 이름 변경 (이식 지시서 §3). */
export type GetUserRatingResponse = {
  userId: string;
  averageRating: number | null;
  reviewCount: number;
};

export type MyProjectReviewReason =
  | 'PROJECT_NOT_COMPLETED'
  | 'REVIEW_FORBIDDEN'
  | 'REVIEW_ALREADY_SUBMITTED'
  | 'REVIEW_PERIOD_CLOSED';

export type GetMyProjectReviewResponse = {
  canReview: boolean;
  reason: MyProjectReviewReason | null;
  reviewDeadlineAt: string | null;
  myDirection: ReviewDirection | null;
  myReview: CreateReviewResponse | null;
  counterpartyReviewVisibility: 'NOT_AVAILABLE' | 'PUBLISHED';
};
