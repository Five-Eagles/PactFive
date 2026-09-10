import { REVIEW_COLLECTION_METHODS, tagsForDirection } from "./review.constants";
import { displayAverageRating } from "./display-average";
import { withKeyedLock } from "./keyed-lock";
import type { ReviewEventPort } from "./review-event.port";
import type { PublishedRatingAggregate } from "./published-rating.port";
import {
  ReviewApiError,
  type CreateReviewInput,
  type CreateReviewResponse,
  type CreateReviewResult,
  type GetMyProjectReviewResponse,
  type GetUserRatingResponse,
  type ListProjectReviewsResponse,
  type ListUserReviewsResponse,
  type MyProjectReviewReason,
  type ReviewDirection,
  type ReviewItem,
  type ReviewRow,
  type ReviewStore,
  type ReviewVisibility,
  type ReviewWindow,
} from "./review.types";

export type { ReviewStore };

export type ReviewServiceDeps = {
  store: ReviewStore;
  events: ReviewEventPort;
  now: () => string;
};

function requireActor(actorUserId: string | undefined): string {
  if (!actorUserId) {
    throw new ReviewApiError("AUTH_REQUIRED", "로그인이 필요합니다.");
  }
  return actorUserId;
}

function bodyHash(input: CreateReviewInput, content: string | null): string {
  return JSON.stringify({
    rating: input.rating,
    content,
    tags: [...input.tags].sort(),
  });
}

function normalizeContent(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 1000) {
    throw new ReviewApiError("REVIEW_CONTENT_INVALID", "리뷰 내용이 올바르지 않습니다.", [
      { field: "content", reason: "invalid" },
    ]);
  }
  return trimmed;
}

function visibilityOf(isPublic: boolean): ReviewVisibility {
  return isPublic ? "PUBLISHED" : "BLINDED";
}

export function isReviewPublic(
  _row: ReviewRow,
  siblings: ReviewRow[],
  nowIso: string,
  window: ReviewWindow | undefined,
): boolean {
  // 양쪽이 있으면 즉시 공개하고, 아니면 window 기한 이후 단독 공개한다.
  const directions = new Set(siblings.map((item) => item.direction));
  if (directions.has("CLIENT_TO_FREELANCER") && directions.has("FREELANCER_TO_CLIENT")) {
    return true;
  }
  if (!window) return false;
  return Date.parse(nowIso) >= Date.parse(window.deadlineAt);
}

function reviewDeadlineAt(window: ReviewWindow | undefined): string | null {
  return window?.deadlineAt ?? null;
}

function isPeriodClosed(window: ReviewWindow | undefined, nowIso: string): boolean {
  if (!window) return true;
  return Date.parse(nowIso) >= Date.parse(window.deadlineAt);
}

function toItem(row: ReviewRow, isPublic: boolean): ReviewItem {
  return {
    reviewId: row.reviewId,
    direction: row.direction,
    rating: row.rating,
    content: row.content,
    tags: row.tags,
    visibility: visibilityOf(isPublic),
    submittedAt: row.createdAt,
  };
}

function toCreateBody(row: ReviewRow, isPublic: boolean): CreateReviewResponse {
  return {
    ...toItem(row, isPublic),
    projectId: row.projectId,
    contractId: row.contractId,
    reviewerId: row.reviewerId,
    revieweeId: row.revieweeId,
    editable: false,
  };
}

async function publishNewlyPublic(deps: ReviewServiceDeps, projectId: string): Promise<void> {
  const siblings = deps.store.getReviewsByProject(projectId);
  const nowIso = deps.now();
  const window = deps.store.getWindow(projectId);
  const publishedIds: string[] = [];
  for (const row of siblings) {
    // 이미 보낸 행은 건너뛰어 공개 시점 1회만 지킨다.
    if (!isReviewPublic(row, siblings, nowIso, window) || row.reviewCreatedPublishedAt) continue;
    const event = {
      reviewId: row.reviewId,
      projectId: row.projectId,
      revieweeId: row.revieweeId,
      rating: row.rating,
      publishedAt: nowIso,
    };
    await deps.events.publishReviewCreated(event);
    deps.store.markReviewCreatedPublished(row.reviewId, nowIso);
    deps.store.enqueueOutbox(`review-created-${row.reviewId}`, event);
    publishedIds.push(row.revieweeId);
  }
  const unique = [...new Set(publishedIds)].sort();
  for (const userId of unique) {
    await refreshUserRatingProjection(deps, userId);
  }
}

/** PATCH·PUT·DELETE는 등록하지 않는다. */
export function assertReviewWriteMethod(method: string): void {
  if (!(REVIEW_COLLECTION_METHODS as readonly string[]).includes(method)) {
    throw new ReviewApiError("METHOD_NOT_ALLOWED", "리뷰는 수정하거나 삭제할 수 없습니다.");
  }
}

export async function createReview(
  deps: ReviewServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
  input: CreateReviewInput,
  idempotencyKey: string | undefined,
): Promise<CreateReviewResult> {
  // 당사자·COMPLETED만 받고, 본문의 direction·contractId는 쓰지 않는다.
  const actor = requireActor(actorUserId);
  if (!idempotencyKey) {
    throw new ReviewApiError("VALIDATION_ERROR", "요청 값이 올바르지 않습니다.", [
      { field: "idempotencyKey", reason: "required" },
    ]);
  }
  const project = deps.store.getProject(projectId);
  if (!project) {
    throw new ReviewApiError("PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }
  if (actor !== project.clientId && actor !== project.freelancerId) {
    throw new ReviewApiError("REVIEW_FORBIDDEN", "이 프로젝트에 대한 권한이 없습니다.");
  }
  if (
    project.transactionStatus !== "COMPLETED" ||
    project.contractStatus === "CANCELED"
  ) {
    throw new ReviewApiError("PROJECT_NOT_COMPLETED", "거래가 완료되지 않았습니다.");
  }

  const direction: ReviewDirection =
    actor === project.clientId ? "CLIENT_TO_FREELANCER" : "FREELANCER_TO_CLIENT";
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ReviewApiError("INVALID_REVIEW_RATING", "별점은 1부터 5까지의 정수입니다.", [
      { field: "rating", reason: "invalid" },
    ]);
  }
  if (!Array.isArray(input.tags)) {
    throw new ReviewApiError("REVIEW_TAG_INVALID", "태그가 올바르지 않습니다.", [
      { field: "tags", reason: "invalid" },
    ]);
  }
  const allowed = new Set(tagsForDirection(direction));
  if (input.tags.some((tag) => !allowed.has(tag))) {
    throw new ReviewApiError("REVIEW_TAG_INVALID", "태그가 올바르지 않습니다.", [
      { field: "tags", reason: "invalid" },
    ]);
  }
  const content = normalizeContent(input.content);
  const hash = bodyHash(input, content);
  const idemKey = `${projectId}:${actor}:${idempotencyKey}`;

  return withKeyedLock(`review-window:${projectId}`, async () => {
  const fresh = deps.store.getProject(projectId);
  if (!fresh) {
    throw new ReviewApiError("PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }
  const window = deps.store.ensureWindow(fresh);
  const siblings = deps.store.getReviewsByProject(projectId);
  const nowIso = deps.now();
  const cached = deps.store.getIdempotency(idemKey);
  if (cached) {
    if (cached.bodyHash !== hash) {
      throw new ReviewApiError("IDEMPOTENCY_KEY_REUSED", "같은 요청 키로 다른 내용을 보낼 수 없습니다.");
    }
    const row = deps.store.getReview(cached.reviewId);
    if (!row) {
      throw new ReviewApiError("PROJECT_NOT_FOUND", "리뷰를 찾을 수 없습니다.");
    }
    return {
      httpStatus: 200 as const,
      body: toCreateBody(row, isReviewPublic(row, siblings, nowIso, window)),
    };
  }

  if (siblings.some((row) => row.direction === direction)) {
    throw new ReviewApiError("REVIEW_ALREADY_SUBMITTED", "이미 작성한 리뷰입니다.");
  }
  const nowMs = Date.parse(nowIso);
  if (nowMs < Date.parse(window.openedAt) || isPeriodClosed(window, nowIso)) {
    throw new ReviewApiError("REVIEW_PERIOD_CLOSED", "리뷰 작성 기간이 끝났습니다.");
  }

  const row: ReviewRow = {
    reviewId: deps.store.nextReviewId(),
    projectId,
    contractId: fresh.contractId,
    reviewerId: actor,
    revieweeId: actor === fresh.clientId ? fresh.freelancerId : fresh.clientId,
    direction,
    rating: input.rating,
    content,
    tags: input.tags,
    createdAt: nowIso,
    reviewCreatedPublishedAt: null,
  };
  deps.store.insertReview(row);
  deps.store.setIdempotency(idemKey, hash, row.reviewId);
  await publishNewlyPublic(deps, projectId);
  const after = deps.store.getReviewsByProject(projectId);
  const stored = deps.store.getReview(row.reviewId) ?? row;
  return {
    httpStatus: 201 as const,
    body: toCreateBody(stored, isReviewPublic(stored, after, deps.now(), deps.store.getWindow(projectId))),
  };
  });
}

export async function listProjectReviews(
  deps: ReviewServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
): Promise<ListProjectReviewsResponse> {
  const actor = requireActor(actorUserId);
  const project = deps.store.getProject(projectId);
  if (!project) {
    throw new ReviewApiError("PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }
  const siblings = deps.store.getReviewsByProject(projectId);
  const nowIso = deps.now();
  const window = deps.store.getWindow(projectId) ?? (project.transactionStatus === "COMPLETED" ? deps.store.ensureWindow(project) : undefined);
  const isParty = actor === project.clientId || actor === project.freelancerId;
  const items = siblings
    .map((row) => {
      const isPublic = isReviewPublic(row, siblings, nowIso, window);
      return { row, isPublic };
    })
    .filter(({ row, isPublic }) => isPublic || (isParty && row.reviewerId === actor))
    .map(({ row, isPublic }) => toItem(row, isPublic));
  return { projectId, items };
}

export async function getMyProjectReview(
  deps: ReviewServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
): Promise<GetMyProjectReviewResponse> {
  const actor = requireActor(actorUserId);
  const project = deps.store.getProject(projectId);
  if (!project) {
    throw new ReviewApiError("PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.");
  }
  const siblings = deps.store.getReviewsByProject(projectId);
  const nowIso = deps.now();
  const window =
    deps.store.getWindow(projectId) ??
    (project.transactionStatus === "COMPLETED" ? deps.store.ensureWindow(project) : undefined);
  const isParty = actor === project.clientId || actor === project.freelancerId;
  const direction: ReviewDirection | null = !isParty
    ? null
    : actor === project.clientId
      ? "CLIENT_TO_FREELANCER"
      : "FREELANCER_TO_CLIENT";
  const mine = direction ? siblings.find((row) => row.direction === direction) : undefined;
  const counterpart = direction
    ? siblings.find((row) => row.direction !== direction)
    : undefined;
  const counterpartPublic = counterpart
    ? isReviewPublic(counterpart, siblings, nowIso, window)
    : false;

  let reason: MyProjectReviewReason | null = null;
  if (!isParty) reason = "REVIEW_FORBIDDEN";
  else if (project.transactionStatus !== "COMPLETED" || project.contractStatus === "CANCELED") {
    reason = "PROJECT_NOT_COMPLETED";
  } else if (mine) reason = "REVIEW_ALREADY_SUBMITTED";
  else if (isPeriodClosed(window, nowIso)) reason = "REVIEW_PERIOD_CLOSED";

  return {
    canReview: reason === null,
    reason,
    reviewDeadlineAt: reviewDeadlineAt(window),
    myDirection: direction,
    myReview: mine ? toCreateBody(mine, isReviewPublic(mine, siblings, nowIso, window)) : null,
    counterpartyReviewVisibility: counterpartPublic ? "PUBLISHED" : "NOT_AVAILABLE",
  };
}

export async function getPublishedRatingAggregate(
  deps: ReviewServiceDeps,
  revieweeId: string,
): Promise<PublishedRatingAggregate> {
  const nowIso = deps.now();
  let ratingSum = 0;
  let reviewCount = 0;
  for (const row of deps.store.getAllReviews()) {
    if (row.revieweeId !== revieweeId) continue;
    const siblings = deps.store.getReviewsByProject(row.projectId);
    const window = deps.store.getWindow(row.projectId);
    if (!isReviewPublic(row, siblings, nowIso, window)) continue;
    ratingSum += row.rating;
    reviewCount += 1;
  }
  return { ratingSum, reviewCount };
}

export async function getUserRating(
  deps: ReviewServiceDeps,
  userId: string,
  actorUserId: string | undefined,
): Promise<GetUserRatingResponse> {
  requireActor(actorUserId);
  if (!deps.store.userExists(userId)) {
    throw new ReviewApiError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
  }
  const { ratingSum, reviewCount } = await getPublishedRatingAggregate(deps, userId);
  const projected = deps.store.getProjection(userId);
  const sum = projected?.ratingSum ?? ratingSum;
  const count = projected?.reviewCount ?? reviewCount;
  if (count === 0) {
    return { userId, averageRating: null, reviewCount: 0 };
  }
  return { userId, averageRating: displayAverageRating(sum, count), reviewCount: count };
}

// 오케스트레이션 조회 이름. HTTP는 getUserRating과 같다.
export const getUserRatingSummary = getUserRating;

export async function listUserReviews(
  deps: ReviewServiceDeps,
  userId: string,
  actorUserId: string | undefined,
  page = 1,
  pageSize = 20,
): Promise<ListUserReviewsResponse> {
  requireActor(actorUserId);
  if (!deps.store.userExists(userId)) {
    throw new ReviewApiError("USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
  }
  const safePage = Math.min(1000, Math.max(1, Math.floor(page) || 1));
  const safeSize = Math.min(50, Math.max(1, Math.floor(pageSize) || 20));
  const nowIso = deps.now();
  const published = deps.store
    .getAllReviews()
    .filter((row) => {
      if (row.revieweeId !== userId) return false;
      const siblings = deps.store.getReviewsByProject(row.projectId);
      const window = deps.store.getWindow(row.projectId);
      return isReviewPublic(row, siblings, nowIso, window);
    })
    .sort((a, b) => {
      const publishedA = a.reviewCreatedPublishedAt ?? a.createdAt;
      const publishedB = b.reviewCreatedPublishedAt ?? b.createdAt;
      const byTime = Date.parse(publishedB) - Date.parse(publishedA);
      return byTime !== 0 ? byTime : b.reviewId.localeCompare(a.reviewId);
    });
  const totalCount = published.length;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / safeSize);
  const start = (safePage - 1) * safeSize;
  const items = published.slice(start, start + safeSize).map((row) => toItem(row, true));
  return { items, page: safePage, pageSize: safeSize, totalCount, totalPages };
}

export async function refreshUserRatingProjection(
  deps: ReviewServiceDeps,
  userId: string,
): Promise<void> {
  await withKeyedLock(`rating-proj:${userId}`, async () => {
    const agg = await getPublishedRatingAggregate(deps, userId);
    deps.store.setProjection({
      userId,
      ratingSum: agg.ratingSum,
      reviewCount: agg.reviewCount,
      calculatedAt: deps.now(),
    });
  });
}

export async function publishDueSoloReviews(deps: ReviewServiceDeps): Promise<void> {
  const seen = new Set<string>();
  for (const row of deps.store.getAllReviews()) {
    if (seen.has(row.projectId)) continue;
    seen.add(row.projectId);
    await publishNewlyPublic(deps, row.projectId);
  }
}
