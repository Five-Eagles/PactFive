import { tagsForDirection } from './review.constants';
import { displayAverageRating } from './display-average';
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
  type ProjectReviewContext,
  type ProjectReviewContextPort,
  type PublishedRatingAggregate,
  type ReviewDirection,
  type ReviewEventPort,
  type ReviewItem,
  type ReviewRepository,
  type ReviewRow,
  type ReviewVisibility,
  type ReviewWindow,
  type UserExistsPort,
} from './review.types';

/**
 * 원본: features/reviews/prototype/server/review.service.ts (조준영). 재해석한 부분은
 * review.types.ts 헤더 주석 참고 — `deps.store.getProject`가 동기였던 것을
 * `deps.projectContext.getProjectContext`(비동기)로, `deps.store.userExists`를
 * `deps.userExists.userExists`(비동기)로 바꿨다. 그 외 검증 순서·409/422 판정·공개 규칙은
 * 원본 그대로다(테스트 40건이 이미 이 순서를 검증했다).
 *
 * 2026-09-09 반영(CR-RV-002, #203): review_windows 포팅. 원본은 in-memory Map +
 * `withKeyedLock`으로 createReview 전체를 감쌌다 — app/에는 그 락 인프라가 없어(review.types.ts
 * ReviewRepository 주석 참고), 대신 `ensureWindow`가 DB upsert로 원자성을 보장한다.
 * `user_rating_projections`(평점 캐시)는 포팅하지 않는다 — getUserRating이 이미 공개 리뷰
 * 실시간 합산으로 정상 동작해 캐시가 필요 없다는 판단을 이전 세션에서 확인했다.
 */

export type ReviewServiceDeps = {
  repository: ReviewRepository;
  projectContext: ProjectReviewContextPort;
  userExistsPort: UserExistsPort;
  events: ReviewEventPort;
  /**
   * 2026-09-09 — user-management PR #89(오민혁)의 `createReviewCreatedConsumer`를 조립 지점
   * (express-app.ts)에서 이 필드로 주입한다. `ReviewEventPort`와 이벤트 5필드 계약이 같아
   * 타입을 새로 만들지 않고 재사용한다 — reviews는 user-management를 import하지 않는다
   * (app/web/AGENTS.md "폴더 간 접점"과 같은 원칙). 사용자 평점 캐시(`users.rating_average`/
   * `review_count`)를 최신화한다. 실패 시 `publishNewlyPublic`과 같은 방식으로(현재 try/catch
   * 없음) 상위로 전파된다 — `deps.events.publishReviewCreated`가 이미 그렇게 동작했던 것과
   * 같은 기존 한계이며, 새로 만든 회귀는 아니다(feedback_loop/2026-09-09/user-management.md).
   */
  ratingConsumer: ReviewEventPort;
  now: () => string;
};

function requireActor(actorUserId: string | undefined): string {
  if (!actorUserId) {
    throw new ReviewApiError('AUTH_REQUIRED', '로그인이 필요합니다.');
  }
  return actorUserId;
}

// bodyHash는 정규화된 content를 해시한다(원본 request.content 원본이 아니다) — 안 그러면
// 트림 전후로 다른 본문이 같은 해시로 통과하거나, content가 항상 null로 계산돼(2026-09-09
// 이전 결함) 본문이 다른 요청이 같은 idempotencyKey로 통과한다.
function bodyHash(input: CreateReviewInput, content: string | null): string {
  return JSON.stringify({
    rating: input.rating,
    content,
    tags: [...input.tags].sort(),
  });
}

/** 원본: features/reviews/prototype/server/review.service.ts:47~56 (조준영) 그대로.
 * undefined는 통과(본문 없는 리뷰 허용)하고, 정의된 값은 trim 후 1~1,000자가 아니면 422다
 * — 공백만 있는 문자열은 trim 후 0자라 422다. */
function normalizeContent(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > 1000) {
    throw new ReviewApiError('REVIEW_CONTENT_INVALID', '리뷰 내용이 올바르지 않습니다.', [
      { field: 'content', reason: 'invalid' },
    ]);
  }
  return trimmed;
}

/** isPublic(boolean) → visibility(ReviewVisibility) 변환. 원본 :58~60. */
function visibilityOf(isPublic: boolean): ReviewVisibility {
  return isPublic ? 'PUBLISHED' : 'BLINDED';
}

export function isReviewPublic(
  _row: ReviewRow,
  siblings: ReviewRow[],
  nowIso: string,
  window: ReviewWindow | undefined,
): boolean {
  // 양쪽이 있으면 즉시 공개하고, 아니면 window 기한 이후 단독 공개한다. 원본
  // (조준영, prototype/server/review.service.ts:63~76)과 같다 — window가 없으면(=아직
  // ensureWindow가 만들어지지 않았으면, 실무에서는 COMPLETED인데 completedAt이 없는
  // 경우뿐이다) 단독 건은 절대 공개되지 않는다.
  const directions = new Set(siblings.map((item) => item.direction));
  if (directions.has('CLIENT_TO_FREELANCER') && directions.has('FREELANCER_TO_CLIENT')) {
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

/** window가 있으면 그대로, 없고 COMPLETED면 만들어서 돌려준다. COMPLETED인데 completedAt이
 * 없으면(이 CR 배포 전에 이미 COMPLETED였던 프로젝트 — 마이그레이션 SQL 주석 참고) 만들
 * 방법이 없어 undefined를 돌려준다 — 그 프로젝트는 이 CR이 배포되고 백필되기 전까지 단독
 * 리뷰가 공개되지 않고, `POST /reviews`도 REVIEW_PERIOD_CLOSED로 막힌다(isPeriodClosed가
 * window undefined를 "닫힘"으로 본다). 원본은 이 경우를 아예 상정하지 않았다(Mock은 항상
 * completedAt이 있었다) — 실 배포에서만 일어날 수 있는 간극이라 팀장이 이 함수에서
 * 명시적으로 처리한다. */
async function ensureWindowIfCompleted(
  deps: ReviewServiceDeps,
  project: Pick<ProjectReviewContext, 'projectId' | 'transactionStatus' | 'completedAt'>,
): Promise<ReviewWindow | undefined> {
  const existing = await deps.repository.getWindow(project.projectId);
  if (existing) return existing;
  if (project.transactionStatus !== 'COMPLETED' || !project.completedAt) return undefined;
  return deps.repository.ensureWindow(project.projectId, project.completedAt);
}

function toItem(row: ReviewRow, isPublic: boolean): ReviewItem {
  return {
    reviewId: row.reviewId,
    direction: row.direction,
    rating: row.rating,
    // ReviewRow는 DB 컬럼명(comment)을 그대로 쓴다 — API 응답 필드명(content)으로의 리네이밍은
    // 이 경계에서만 한다(DB 컬럼 자체는 안 건드린다, 이식 지시서 §1-3).
    content: row.comment,
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

async function requireProject(deps: ReviewServiceDeps, projectId: string) {
  const project = await deps.projectContext.getProjectContext(projectId);
  if (!project) {
    throw new ReviewApiError('PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.');
  }
  return project;
}

async function publishNewlyPublic(deps: ReviewServiceDeps, projectId: string): Promise<void> {
  const siblings = await deps.repository.getReviewsByProject(projectId);
  const nowIso = deps.now();
  const window = await deps.repository.getWindow(projectId);
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
    // users.rating_average/review_count 캐시 최신화 — user-management PR #89 소비기.
    await deps.ratingConsumer.publishReviewCreated(event);
    await deps.repository.markReviewCreatedPublished(row.reviewId, nowIso);
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
    throw new ReviewApiError('REVIEW_FORBIDDEN', '이 프로젝트에 대한 권한이 없습니다.');
  }
  // 취소 분기와 미완료 분기를 한 덩어리로 합쳤다(이식 지시서 §2-2) — 원본이 별도 코드를
  // 두지 않는다. PROJECT_TRANSITION_CONFLICT는 더 이상 던지지 않는다.
  if (project.transactionStatus !== 'COMPLETED' || project.contractStatus === 'CANCELED') {
    throw new ReviewApiError('PROJECT_NOT_COMPLETED', '거래가 완료되지 않았습니다.');
  }
  // CR-RV-002 — 여기 도달하면 transactionStatus는 이미 COMPLETED로 확정이다. 원본
  // (조준영, prototype/server/review.service.ts:193)의 ensureWindow(fresh) 호출 위치와
  // 같다.
  const window = await ensureWindowIfCompleted(deps, project);

  const direction: ReviewDirection =
    actor === project.clientId ? 'CLIENT_TO_FREELANCER' : 'FREELANCER_TO_CLIENT';
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ReviewApiError('INVALID_REVIEW_RATING', '별점은 1부터 5까지의 정수입니다.', [
      { field: 'rating', reason: 'invalid' },
    ]);
  }
  if (!Array.isArray(input.tags)) {
    throw new ReviewApiError('REVIEW_TAG_INVALID', '태그가 올바르지 않습니다.', [
      { field: 'tags', reason: 'invalid' },
    ]);
  }
  const allowedTags = new Set(tagsForDirection(direction));
  if (input.tags.some((tag) => !allowedTags.has(tag))) {
    throw new ReviewApiError('REVIEW_TAG_INVALID', '태그가 올바르지 않습니다.', [
      { field: 'tags', reason: 'invalid' },
    ]);
  }
  const content = normalizeContent(input.content);

  // 같은 키·본문은 기존 행을 그대로 돌려주고, 다른 본문은 409(IDEMPOTENCY_KEY_REUSED),
  // 같은 방향 재작성은 409(REVIEW_ALREADY_SUBMITTED)다 — 화면이 둘을 구분해야 한다(§2-2).
  const hash = bodyHash(input, content);
  const idemKey = `${projectId}:${actor}:${idempotencyKey}`;
  const cached = await deps.repository.getIdempotency(idemKey);
  const siblings = await deps.repository.getReviewsByProject(projectId);
  const nowIso = deps.now();
  if (cached) {
    if (cached.bodyHash !== hash) {
      throw new ReviewApiError('IDEMPOTENCY_KEY_REUSED', '같은 요청 키로 다른 내용을 보낼 수 없습니다.');
    }
    const row = await deps.repository.getReview(cached.reviewId);
    if (!row) {
      throw new ReviewApiError('PROJECT_NOT_FOUND', '리뷰를 찾을 수 없습니다.');
    }
    return {
      httpStatus: 200,
      body: toCreateBody(row, isReviewPublic(row, siblings, nowIso, window)),
    };
  }

  if (siblings.some((row) => row.direction === direction)) {
    throw new ReviewApiError('REVIEW_ALREADY_SUBMITTED', '이미 작성한 리뷰입니다.');
  }
  // CR-RV-002 — 원본(:216~219)과 같은 순서: 멱등·중복 판정 다음, 실제 삽입 전에 기간을 본다.
  // window는 방금 ensureWindowIfCompleted가 만들었으므로 openedAt이 미래일 일은 없지만,
  // 원본 그대로 방어적으로 남겨 둔다.
  const nowMs = Date.parse(nowIso);
  if (!window || nowMs < Date.parse(window.openedAt) || isPeriodClosed(window, nowIso)) {
    throw new ReviewApiError('REVIEW_PERIOD_CLOSED', '리뷰 작성 기간이 끝났습니다.');
  }

  const row: ReviewRow = {
    reviewId: await deps.repository.nextReviewId(),
    projectId,
    contractId: project.contractId,
    reviewerId: actor,
    revieweeId: actor === project.clientId ? project.freelancerId : project.clientId,
    direction,
    rating: input.rating,
    comment: content,
    tags: input.tags,
    createdAt: nowIso,
    reviewCreatedPublishedAt: null,
  };
  await deps.repository.insertReview(row);
  await deps.repository.setIdempotency(idemKey, hash, row.reviewId);
  // 공개가 된 행에만 REVIEW_CREATED를 보낸다. users는 갱신하지 않는다.
  await publishNewlyPublic(deps, projectId);
  const after = await deps.repository.getReviewsByProject(projectId);
  const stored = (await deps.repository.getReview(row.reviewId)) ?? row;
  return {
    httpStatus: 201,
    body: toCreateBody(stored, isReviewPublic(stored, after, deps.now(), window)),
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
  const siblings = await deps.repository.getReviewsByProject(projectId);
  const nowIso = deps.now();
  const window = await ensureWindowIfCompleted(deps, project);
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

/**
 * `GET /reviews/me` — 원본 features/reviews/prototype/server/review.service.ts:272~315와
 * 같다(CR-RV-002, #203). window가 있으면(COMPLETED고 completedAt이 있으면) 그 deadlineAt을
 * 돌려주고, 지났는데 아직 내 리뷰가 없으면 REVIEW_PERIOD_CLOSED다.
 */
export async function getMyProjectReview(
  deps: ReviewServiceDeps,
  projectId: string,
  actorUserId: string | undefined,
): Promise<GetMyProjectReviewResponse> {
  const actor = requireActor(actorUserId);
  const project = await requireProject(deps, projectId);
  const siblings = await deps.repository.getReviewsByProject(projectId);
  const nowIso = deps.now();
  const window = await ensureWindowIfCompleted(deps, project);
  const isParty = actor === project.clientId || actor === project.freelancerId;
  const direction: ReviewDirection | null = !isParty
    ? null
    : actor === project.clientId
      ? 'CLIENT_TO_FREELANCER'
      : 'FREELANCER_TO_CLIENT';
  const mine = direction ? siblings.find((row) => row.direction === direction) : undefined;
  const counterpart = direction ? siblings.find((row) => row.direction !== direction) : undefined;
  const counterpartPublic = counterpart ? isReviewPublic(counterpart, siblings, nowIso, window) : false;

  let reason: MyProjectReviewReason | null = null;
  if (!isParty) reason = 'REVIEW_FORBIDDEN';
  else if (project.transactionStatus !== 'COMPLETED' || project.contractStatus === 'CANCELED') {
    reason = 'PROJECT_NOT_COMPLETED';
  } else if (mine) reason = 'REVIEW_ALREADY_SUBMITTED';
  else if (isPeriodClosed(window, nowIso)) reason = 'REVIEW_PERIOD_CLOSED';

  return {
    canReview: reason === null,
    reason,
    reviewDeadlineAt: reviewDeadlineAt(window),
    myReview: mine ? toCreateBody(mine, isReviewPublic(mine, siblings, nowIso, window)) : null,
    counterpartyReviewVisibility: counterpartPublic ? 'PUBLISHED' : 'NOT_AVAILABLE',
  };
}

export async function getPublishedRatingAggregate(
  // 2026-09-09 — 조립 지점(express-app.ts)이 `ratingConsumer`를 만들 때 이 함수를 감싼
  // reader를 넘겨야 하는데, 그 reader는 아직 `ratingConsumer` 필드가 없는 부분 deps로도
  // 계산 가능하다. 전체 `ReviewServiceDeps`를 요구하면 "ratingConsumer를 만들려면
  // ReviewServiceDeps가 있어야 하고, ReviewServiceDeps는 ratingConsumer가 있어야 한다"는
  // 순환이 생겨 `Pick`으로 필요한 두 필드만 받는다.
  deps: Pick<ReviewServiceDeps, 'repository' | 'now'>,
  revieweeId: string,
): Promise<PublishedRatingAggregate> {
  // 공개 리뷰만 합산하고 반올림하지 않는다.
  const nowIso = deps.now();
  let ratingSum = 0;
  let reviewCount = 0;
  for (const row of await deps.repository.getAllReviews()) {
    if (row.revieweeId !== revieweeId) continue;
    const siblings = await deps.repository.getReviewsByProject(row.projectId);
    // 여기서는 ensure하지 않고 getWindow만 본다 — 원본(:301~309)과 같다. 합산은 읽기
    // 전용이라 window를 새로 만들 이유가 없다(어차피 없으면 그 리뷰는 비공개로 본다).
    const window = await deps.repository.getWindow(row.projectId);
    if (!isReviewPublic(row, siblings, nowIso, window)) continue;
    ratingSum += row.rating;
    reviewCount += 1;
  }
  return { ratingSum, reviewCount };
}

// `getReviewSummary`에서 이름을 바꿨다 — `review-summary` 경로가 `rating`으로 바뀐 것과 짝이다
// (이식 지시서 §3).
export async function getUserRating(
  deps: ReviewServiceDeps,
  userId: string,
  actorUserId: string | undefined,
): Promise<GetUserRatingResponse> {
  requireActor(actorUserId);
  if (!(await deps.userExistsPort.userExists(userId))) {
    throw new ReviewApiError('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  }
  // 평균은 공개분 합계에서 나누고 users 캐시는 읽지 않는다.
  const { ratingSum, reviewCount } = await getPublishedRatingAggregate(deps, userId);
  if (reviewCount === 0) {
    return { userId, averageRating: null, reviewCount: 0 };
  }
  // displayAverageRating — 이식 지시서 §2-1. 합계/건수에서 한 번에 반올림한다(두 번 반올림하면
  // 489/110=4.4454…가 4.4 대신 4.5로 나가는 결함이 있었다).
  return { userId, averageRating: displayAverageRating(ratingSum, reviewCount), reviewCount };
}

/** 오케스트레이션 조회 이름. HTTP는 getUserRating과 같다(api-contract.md :86). */
export const getUserRatingSummary = getUserRating;

/**
 * `GET /users/:userId/reviews` — `PUBLISHED`만, `publishedAt DESC, reviewId DESC`.
 * 원본 features/reviews/prototype/server/review.service.ts:357~390과 같다(CR-RV-002, #203).
 */
export async function listUserReviews(
  deps: ReviewServiceDeps,
  userId: string,
  actorUserId: string | undefined,
  page = 1,
  pageSize = 20,
): Promise<ListUserReviewsResponse> {
  requireActor(actorUserId);
  if (!(await deps.userExistsPort.userExists(userId))) {
    throw new ReviewApiError('USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  }
  const safePage = Math.min(1000, Math.max(1, Math.floor(page) || 1));
  const safeSize = Math.min(50, Math.max(1, Math.floor(pageSize) || 20));
  const nowIso = deps.now();

  const published: ReviewRow[] = [];
  for (const row of await deps.repository.getAllReviews()) {
    if (row.revieweeId !== userId) continue;
    const siblings = await deps.repository.getReviewsByProject(row.projectId);
    const window = await deps.repository.getWindow(row.projectId);
    if (!isReviewPublic(row, siblings, nowIso, window)) continue;
    published.push(row);
  }
  published.sort((a, b) => {
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
