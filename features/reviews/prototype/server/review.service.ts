import { REVIEW_COLLECTION_METHODS, SOLO_PUBLIC_AFTER_DAYS, DAY_MS, tagsForDirection } from "./review.constants";
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

export function isReviewPublic(row: ReviewRow, siblings: ReviewRow[], nowIso: string): boolean {
  // 양쪽이 있으면 즉시 공개하고, 아니면 14일이 지난 단독 건만 공개한다.
  const directions = new Set(siblings.map((item) => item.direction));
  if (directions.has("CLIENT_TO_FREELANCER") && directions.has("FREELANCER_TO_CLIENT")) {
    return true;
  }
  return Date.parse(nowIso) - Date.parse(row.createdAt) >= SOLO_PUBLIC_AFTER_DAYS * DAY_MS;
}

function earliestSubmittedAt(siblings: ReviewRow[]): string | null {
  if (siblings.length === 0) return null;
  return siblings.reduce(
    (min, row) => (Date.parse(row.createdAt) < Date.parse(min) ? row.createdAt : min),
    siblings[0].createdAt,
  );
}

function reviewDeadlineAt(siblings: ReviewRow[]): string | null {
  const first = earliestSubmittedAt(siblings);
  if (!first) return null;
  return new Date(Date.parse(first) + SOLO_PUBLIC_AFTER_DAYS * DAY_MS).toISOString();
}

function isPeriodClosed(siblings: ReviewRow[], nowIso: string): boolean {
  const deadline = reviewDeadlineAt(siblings);
  return deadline !== null && Date.parse(nowIso) >= Date.parse(deadline);
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
  for (const row of siblings) {
    // 이미 보낸 행은 건너뛰어 공개 시점 1회만 지킨다.
    if (!isReviewPublic(row, siblings, nowIso) || row.reviewCreatedPublishedAt) continue;
    await deps.events.publishReviewCreated({
      reviewId: row.reviewId,
      projectId: row.projectId,
      revieweeId: row.revieweeId,
      rating: row.rating,
      publishedAt: nowIso,
    });
    deps.store.markReviewCreatedPublished(row.reviewId, nowIso);
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

  const siblings = deps.store.getReviewsByProject(projectId);
  const nowIso = deps.now();
  const hash = bodyHash(input, content);
  const idemKey = `${projectId}:${actor}:${idempotencyKey}`;
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
      httpStatus: 200,
      body: toCreateBody(row, isReviewPublic(row, siblings, nowIso)),
    };
  }

  if (siblings.some((row) => row.direction === direction)) {
    throw new ReviewApiError("REVIEW_ALREADY_SUBMITTED", "이미 작성한 리뷰입니다.");
  }
  if (isPeriodClosed(siblings, nowIso)) {
    throw new ReviewApiError("REVIEW_PERIOD_CLOSED", "리뷰 작성 기간이 끝났습니다.");
  }

  const row: ReviewRow = {
    reviewId: deps.store.nextReviewId(),
    projectId,
    contractId: project.contractId,
    reviewerId: actor,
    revieweeId: actor === project.clientId ? project.freelancerId : project.clientId,
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
    httpStatus: 201,
    body: toCreateBody(stored, isReviewPublic(stored, after, deps.now())),
  };
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
  const isParty = actor === project.clientId || actor === project.freelancerId;
  const items = siblings
    .map((row) => {
      const isPublic = isReviewPublic(row, siblings, nowIso);
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
    ? isReviewPublic(counterpart, siblings, nowIso)
    : false;

  let reason: MyProjectReviewReason | null = null;
  if (!isParty) reason = "REVIEW_FORBIDDEN";
  else if (project.transactionStatus !== "COMPLETED" || project.contractStatus === "CANCELED") {
    reason = "PROJECT_NOT_COMPLETED";
  } else if (mine) reason = "REVIEW_ALREADY_SUBMITTED";
  else if (isPeriodClosed(siblings, nowIso)) reason = "REVIEW_PERIOD_CLOSED";

  return {
    canReview: reason === null,
    reason,
    reviewDeadlineAt: reviewDeadlineAt(siblings),
    myReview: mine ? toCreateBody(mine, isReviewPublic(mine, siblings, nowIso)) : null,
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
    if (!isReviewPublic(row, siblings, nowIso)) continue;
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
  if (reviewCount === 0) {
    return { userId, averageRating: null, reviewCount: 0 };
  }
  return { userId, averageRating: ratingSum / reviewCount, reviewCount };
}

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
      return isReviewPublic(row, siblings, nowIso);
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

export async function publishDueSoloReviews(deps: ReviewServiceDeps): Promise<void> {
  const seen = new Set<string>();
  for (const row of deps.store.getAllReviews()) {
    if (seen.has(row.projectId)) continue;
    seen.add(row.projectId);
    await publishNewlyPublic(deps, row.projectId);
  }
}
