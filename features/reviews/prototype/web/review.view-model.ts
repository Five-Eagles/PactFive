import {
  CLIENT_TO_FREELANCER_TAGS,
  FREELANCER_TO_CLIENT_TAGS,
} from "../server/review.constants";
import type {
  ContractStatus,
  ProjectTransactionStatus,
  ReviewDirection,
  ReviewItem,
} from "../server/review.types";

export type ReviewViewerRole = "CLIENT" | "FREELANCER" | "OUTSIDER";

export type ReviewLoadError = "FORBIDDEN" | "NOT_FOUND" | "LOAD_FAILED";

export type ReviewUiState =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "LOAD_FAILED"
  | "PUBLISHED"
  | "ALREADY_SUBMITTED"
  | "SUBMITTED_BLIND"
  | "CANCELED"
  | "NOT_AVAILABLE"
  | "AVAILABLE"
  | "SUBMITTING";

export type ReviewPrimaryAction = "OPEN_CONFIRM" | "VIEW_PROJECT" | "NONE";

export type ReviewTagOption = { code: string; label: string };

export type ReviewFormViewModel = {
  projectId: string;
  projectTitle: string;
  uiState: ReviewUiState;
  viewerRole: ReviewViewerRole;
  revieweeDisplayName: string;
  revieweeRoleLabel: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  selectedTags: string[];
  comment: string;
  allowedTags: ReviewTagOption[];
  canReview: boolean;
  canSubmit: boolean;
  primaryAction: ReviewPrimaryAction;
  myRating: number | null;
  myComment: string | null;
  myTags: string[];
  ratingSummaryLabel: string;
};

export const RATING_HELPER: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "매우 아쉬워요",
  2: "아쉬워요",
  3: "보통이에요",
  4: "만족해요",
  5: "매우 만족해요",
};

const CLIENT_TAG_LABEL: Record<(typeof CLIENT_TO_FREELANCER_TAGS)[number], string> = {
  RESPONSIBILITY: "업무 태도가 전문적이에요",
  COMMUNICATION: "소통이 원활해요",
  TECHNICAL_SKILL: "기술 역량이 좋아요",
  SCHEDULE_COMPLIANCE: "납기를 잘 지켜요",
  DELIVERABLE_QUALITY: "결과물 품질이 좋아요",
};

const FREELANCER_TAG_LABEL: Record<(typeof FREELANCER_TO_CLIENT_TAGS)[number], string> = {
  REQUIREMENT_CLARITY: "요구사항이 명확해요",
  COMMUNICATION: "소통이 원활해요",
  FEEDBACK_SPEED: "피드백이 빨라요",
  SCOPE_STABILITY: "업무 범위가 안정적이에요",
  PAYMENT_RELIABILITY: "결제가 믿을 수 있어요",
};

export type DeriveReviewUiStateInput = {
  loadError?: ReviewLoadError | null;
  overlay?: "SUBMITTING" | "ALREADY_SUBMITTED" | null;
  transactionStatus: ProjectTransactionStatus;
  contractStatus: ContractStatus;
  viewerRole: ReviewViewerRole;
  myReview: { isPublic: boolean } | null;
};

/** 역할별 E-19 태그에 설계서 표시명만 붙인다. */
export function allowedTagsForRole(role: ReviewViewerRole): ReviewTagOption[] {
  if (role === "CLIENT") {
    return CLIENT_TO_FREELANCER_TAGS.map((code) => ({ code, label: CLIENT_TAG_LABEL[code] }));
  }
  if (role === "FREELANCER") {
    return FREELANCER_TO_CLIENT_TAGS.map((code) => ({ code, label: FREELANCER_TAG_LABEL[code] }));
  }
  return [];
}

/** 서버 평균을 소수 첫째 자리로만 보여 주고 목록으로 다시 나누지 않는다. */
export function formatRatingSummary(
  averageRating: number | null,
  reviewCount: number,
): string {
  if (averageRating === null || reviewCount === 0) return "아직 받은 리뷰 없음";
  const shown = (Math.round(averageRating * 10) / 10).toFixed(1);
  return `★ ${shown} · 리뷰 ${reviewCount}개`;
}

export function ownDirection(role: ReviewViewerRole): ReviewDirection | null {
  if (role === "CLIENT") return "CLIENT_TO_FREELANCER";
  if (role === "FREELANCER") return "FREELANCER_TO_CLIENT";
  return null;
}

/** 본인 방향 행만 고른다. 상대 제출 여부는 필드로 두지 않는다. */
export function findMyReview(
  items: readonly ReviewItem[],
  role: ReviewViewerRole,
): ReviewItem | null {
  const direction = ownDirection(role);
  if (!direction) return null;
  return items.find((item) => item.direction === direction) ?? null;
}

export function deriveReviewUiState(input: DeriveReviewUiStateInput): ReviewUiState {
  if (input.loadError) return input.loadError;
  if (input.overlay === "ALREADY_SUBMITTED") return "ALREADY_SUBMITTED";
  if (input.overlay === "SUBMITTING") return "SUBMITTING";
  // 본인 행이 있으면 거래 상태와 무관하게 작성 폼을 닫는다.
  if (input.myReview?.isPublic) return "PUBLISHED";
  if (input.myReview) return "SUBMITTED_BLIND";
  if (input.transactionStatus === "CANCELED" || input.contractStatus === "CANCELED") {
    return "CANCELED";
  }
  if (input.transactionStatus !== "COMPLETED") return "NOT_AVAILABLE";
  if (input.viewerRole === "CLIENT" || input.viewerRole === "FREELANCER") return "AVAILABLE";
  return "FORBIDDEN";
}

function primaryAction(uiState: ReviewUiState): ReviewPrimaryAction {
  if (uiState === "AVAILABLE") return "OPEN_CONFIRM";
  if (uiState === "SUBMITTING") return "NONE";
  if (uiState === "PUBLISHED" || uiState === "SUBMITTED_BLIND" || uiState === "ALREADY_SUBMITTED") {
    return "NONE";
  }
  return "VIEW_PROJECT";
}

export type ToReviewViewModelInput = {
  loadError?: ReviewLoadError | null;
  overlay?: "SUBMITTING" | "ALREADY_SUBMITTED" | null;
  projectId: string;
  projectTitle: string;
  transactionStatus: ProjectTransactionStatus;
  contractStatus: ContractStatus;
  viewerRole: ReviewViewerRole;
  items: readonly ReviewItem[];
  averageRating?: number | null;
  reviewCount?: number;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  selectedTags?: string[];
  comment?: string;
};

/** listProjectReviews + review-summary를 화면 필드로 조립한다. */
export function toReviewViewModel(input: ToReviewViewModelInput): ReviewFormViewModel {
  const myReview = findMyReview(input.items, input.viewerRole);
  const uiState = deriveReviewUiState({
    loadError: input.loadError,
    overlay: input.overlay,
    transactionStatus: input.transactionStatus,
    contractStatus: input.contractStatus,
    viewerRole: input.viewerRole,
    myReview: myReview ? { isPublic: myReview.isPublic } : null,
  });
  const hideSensitive =
    uiState === "FORBIDDEN" || uiState === "NOT_FOUND" || uiState === "LOAD_FAILED";
  const canReview = uiState === "AVAILABLE";
  const rating = input.rating ?? null;
  const selectedTags = input.selectedTags ?? [];
  return {
    projectId: input.projectId,
    projectTitle: hideSensitive ? "" : input.projectTitle,
    uiState,
    viewerRole: input.viewerRole,
    revieweeDisplayName: hideSensitive ? "" : revieweeName(input.viewerRole),
    revieweeRoleLabel: hideSensitive ? "" : revieweeRoleLabel(input.viewerRole),
    rating,
    selectedTags,
    comment: input.comment ?? "",
    allowedTags: hideSensitive ? [] : allowedTagsForRole(input.viewerRole),
    canReview,
    canSubmit: canReview && rating !== null && selectedTags.length <= 5,
    primaryAction: primaryAction(uiState),
    myRating: hideSensitive ? null : (myReview?.rating ?? null),
    myComment: hideSensitive ? null : (myReview?.comment ?? null),
    myTags: hideSensitive ? [] : (myReview?.tags ?? []),
    ratingSummaryLabel: formatRatingSummary(
      input.averageRating ?? null,
      input.reviewCount ?? 0,
    ),
  };
}

function revieweeName(role: ReviewViewerRole): string {
  if (role === "CLIENT") return "김민준";
  if (role === "FREELANCER") return "이서연";
  return "";
}

function revieweeRoleLabel(role: ReviewViewerRole): string {
  if (role === "CLIENT") return "프리랜서";
  if (role === "FREELANCER") return "의뢰인";
  return "";
}
