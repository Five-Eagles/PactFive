/**
 * reviews 응답 타입 — app/server/src/features/reviews/review.types.ts와 같은 모양을 화면이
 * 필요로 하는 만큼만 옮긴다 (app/web/AGENTS.md "폴더 간 접점" — 서버 폴더를 직접 import하지
 * 않는다).
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

export const CLIENT_TO_FREELANCER_TAGS: ClientToFreelancerTag[] = [
  'RESPONSIBILITY',
  'COMMUNICATION',
  'TECHNICAL_SKILL',
  'SCHEDULE_COMPLIANCE',
  'DELIVERABLE_QUALITY',
];

export const FREELANCER_TO_CLIENT_TAGS: FreelancerToClientTag[] = [
  'REQUIREMENT_CLARITY',
  'COMMUNICATION',
  'FEEDBACK_SPEED',
  'SCOPE_STABILITY',
  'PAYMENT_RELIABILITY',
];

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

export type ListProjectReviewsResponse = {
  projectId: string;
  items: ReviewItem[];
};

export type GetReviewSummaryResponse = {
  userId: string;
  averageRating: number | null;
  reviewCount: number;
};
