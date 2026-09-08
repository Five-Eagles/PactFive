import { SOLO_PUBLIC_AFTER_DAYS, DAY_MS, tagsForDirection } from './review.constants';
import {
  ReviewApiError,
  type CreateReviewInput,
  type CreateReviewResponse,
  type CreateReviewResult,
  type GetReviewSummaryResponse,
  type ListProjectReviewsResponse,
  type ProjectReviewContextPort,
  type PublishedRatingAggregate,
  type ReviewDirection,
  type ReviewEventPort,
  type ReviewItem,
  type ReviewRepository,
  type ReviewRow,
  type UserExistsPort,
} from './review.types';

/**
 * 원본: features/reviews/prototype/server/review.service.ts (조준영). 재해석한 부분은
 * review.types.ts 헤더 주석 참고 — `deps.store.getProject`가 동기였던 것을
 * `deps.projectContext.getProjectContext`(비동기)로, `deps.store.userExists`를
 * `deps.userExists.userExists`(비동기)로 바꿨다. 그 외 검증 순서·409/422 판정·공개 규칙은
 * 원본 그대로다(테스트 40건이 이미 이 순서를 검증했다).
 */

export type ReviewServiceDeps = {
  repository: ReviewRepository;
  projectContext: ProjectReviewContextPort;
  userExistsPort: UserExistsPort;
  events: ReviewEventPort;
  now: () => string;
};

function requireActor(actorUserId: string | undefined): string {
  if (!actorUserId) {
    throw new ReviewApiError('AUTH_REQUIRED', '로그인이 필요합니다.');
  }
  return actorUserId;
}

function bodyHash(input: CreateReviewInput): string {
  return JSON.stringify({
    rating: input.rating,
    comment: input.comment ?? null,
    tags: [...input.tags].sort(),
  });
}

function isAllowedRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

function assertTags(direction: ReviewDirection, tags: string[]): void {
  if (!Array.isArray(tags)) {
    throw new ReviewApiError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
      { field: 'tags', reason: 'invalid' },
    ]);
  }
  const allowed = new Set(tagsForDirection(direction));
  if (tags.some((tag) => !allowed.has(tag))) {
    throw new ReviewApiError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
      { field: 'tags', reason: 'invalid' },
    ]);
  }
}

export function isReviewPublic(row: ReviewRow, siblings: ReviewRow[], nowIso: string): boolean {
  // 양쪽이 있으면 즉시 공개하고, 아니면 14일이 지난 단독 건만 공개한다.
  const directions = new Set(siblings.map((item) => item.direction));
  if (directions.has('CLIENT_TO_FREELANCER') && directions.has('FREELANCER_TO_CLIENT')) {
    return true;
  }
  return Date.parse(nowIso) - Date.parse(row.createdAt) >= SOLO_PUBLIC_AFTER_DAYS * DAY_MS;
}

function toItem(row: ReviewRow, isPublic: boolean): ReviewItem {
  return {
    reviewId: row.reviewId,
    direction: row.direction,
    rating: row.rating,
    comment: row.comment,
    tags: row.tags,
    isPublic,
    createdAt: row.createdAt,
  };
}

function toCreateBody(row: ReviewRow, isPublic: boolean): CreateReviewResponse {
  return {
    ...toItem(row, isPublic),
    projectId: row.projectId,
    contractId: row.contractId,
    reviewerId: row.reviewerId,
    revieweeId: row.revieweeId,
  };
}

async function requireProject(deps: ReviewServiceDeps, projectId: string) {
  const project = await deps.projectContext.getProjectContext(projectId);
  if (!project) {
    throw new ReviewApiError('PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
  }
  return project;
}

async function publishNewlyPublic(deps: ReviewServiceDeps, projectId: string): Promise<void> {
  const siblings = deps.repository.getReviewsByProject(projectId);
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
    deps.repository.markReviewCreatedPublished(row.reviewId, nowIso);
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
    throw new ReviewApiError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
      { field: 'idempotencyKey', reason: 'required' },
    ]);
  }
  const project = await requireProject(deps, projectId);
  if (actor !== project.clientId && actor !== project.freelancerId) {
    throw new ReviewApiError('PROJECT_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  // 취소는 전이 충돌, 그 외 미완료는 TRANSACTION_NOT_COMPLETED다.
  if (project.transactionStatus === 'CANCELED' || project.contractStatus === 'CANCELED') {
    throw new ReviewApiError('PROJECT_TRANSITION_CONFLICT', '취소된 거래는 리뷰할 수 없습니다.');
  }
  if (project.transactionStatus !== 'COMPLETED') {
    throw new ReviewApiError('TRANSACTION_NOT_COMPLETED', '거래가 완료되지 않았습니다.');
  }

  const direction: ReviewDirection =
    actor === project.clientId ? 'CLIENT_TO_FREELANCER' : 'FREELANCER_TO_CLIENT';
  if (!isAllowedRating(input.rating)) {
    throw new ReviewApiError('VALIDATION_ERROR', '요청 값이 올바르지 않습니다.', [
      { field: 'rating', reason: 'invalid' },
    ]);
  }
  assertTags(direction, input.tags);

  // 같은 키·본문은 기존 행을 그대로 돌려주고, 다른 본문·같은 방향은 409다.
  const hash = bodyHash(input);
  const idemKey = `${projectId}:${actor}:${idempotencyKey}`;
  const cached = deps.repository.getIdempotency(idemKey);
  const siblings = deps.repository.getReviewsByProject(projectId);
  const nowIso = deps.now();
  if (cached) {
    if (cached.bodyHash !== hash) {
      throw new ReviewApiError('REVIEW_ALREADY_EXISTS', '이미 작성한 리뷰입니다.');
    }
    const row = deps.repository.getReview(cached.reviewId);
    if (!row) {
      throw new ReviewApiError('PROJECT_NOT_FOUND', '리뷰를 찾을 수 없습니다.');
    }
    return {
      httpStatus: 200,
      body: toCreateBody(row, isReviewPublic(row, siblings, nowIso)),
    };
  }

  if (siblings.some((row) => row.direction === direction)) {
    throw new ReviewApiError('REVIEW_ALREADY_EXISTS', '이미 작성한 리뷰입니다.');
  }

  const row: ReviewRow = {
    reviewId: deps.repository.nextReviewId(),
    projectId,
    contractId: project.contractId,
    reviewerId: actor,
    revieweeId: actor === project.clientId ? project.freelancerId : project.clientId,
    direction,
    rating: input.rating,
    comment: input.comment ?? null,
    tags: input.tags,
    createdAt: nowIso,
    reviewCreatedPublishedAt: null,
  };
  deps.repository.insertReview(row);
  deps.repository.setIdempotency(idemKey, hash, row.reviewId);
  // 공개가 된 행에만 REVIEW_CREATED를 보낸다. users는 갱신하지 않는다.
  await publishNewlyPublic(deps, projectId);
  const after = deps.repository.getReviewsByProject(projectId);
  const stored = deps.repository.getReview(row.reviewId) ?? row;
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
  const project = await requireProject(deps, projectId);
  // 비당사자는 공개분만, 당사자는 본인 미공개 행도 본다.
  const siblings = deps.repository.getReviewsByProject(projectId);
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

export async function getPublishedRatingAggregate(
  deps: ReviewServiceDeps,
  revieweeId: string,
): Promise<PublishedRatingAggregate> {
  // 공개 리뷰만 합산하고 반올림하지 않는다.
  const nowIso = deps.now();
  let ratingSum = 0;
  let reviewCount = 0;
  for (const row of deps.repository.getAllReviews()) {
    if (row.revieweeId !== revieweeId) continue;
    const siblings = deps.repository.getReviewsByProject(row.projectId);
    if (!isReviewPublic(row, siblings, nowIso)) continue;
    ratingSum += row.rating;
    reviewCount += 1;
  }
  return { ratingSum, reviewCount };
}

export async function getReviewSummary(
  deps: ReviewServiceDeps,
  userId: string,
  actorUserId: string | undefined,
): Promise<GetReviewSummaryResponse> {
  requireActor(actorUserId);
  if (!(await deps.userExistsPort.userExists(userId))) {
    throw new ReviewApiError('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  }
  // 평균은 공개분 합계에서 나누고 users 캐시는 읽지 않는다.
  const { ratingSum, reviewCount } = await getPublishedRatingAggregate(deps, userId);
  if (reviewCount === 0) {
    return { userId, averageRating: null, reviewCount: 0 };
  }
  return { userId, averageRating: ratingSum / reviewCount, reviewCount };
}
