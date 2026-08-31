import { addDaysIso, MOCK_CLIENT_USER_ID, MOCK_FREELANCER_USER_ID, MOCK_NOW, MOCK_OUTSIDER_USER_ID, MOCK_UNREVIEWED_USER_ID } from "../server/review.constants";
import type { ReviewCreatedEvent, ReviewEventPort } from "../server/review-event.port";
import {
  createReview,
  getReviewSummary,
  listProjectReviews,
  publishDueSoloReviews,
  type ReviewServiceDeps,
} from "../server/review.service";
import type {
  CreateReviewInput,
  ProjectReviewContext,
  ReviewRow,
  ReviewStore,
  UserRatingCache,
} from "../server/review.types";

function seedCreatedAt(nowIso: string, daysAgo: number): string {
  return addDaysIso(nowIso, -daysAgo);
}

function createMemoryStore(nowIso: string): ReviewStore {
  const projects = new Map<string, ProjectReviewContext>();
  const users = new Map<string, UserRatingCache>();
  const reviews: ReviewRow[] = [];
  const idempotency = new Map<string, { bodyHash: string; reviewId: string }>();
  let seq = 200;

  function addUser(userId: string): void {
    users.set(userId, { userId, ratingAverage: null, reviewCount: 0 });
  }

  function addProject(row: ProjectReviewContext): void {
    projects.set(row.projectId, row);
  }

  // 시드 사용자는 캐시가 비어 있고, 리뷰 작성 후에도 이 값을 바꾸지 않는다.
  addUser(MOCK_CLIENT_USER_ID);
  addUser(MOCK_FREELANCER_USER_ID);
  addUser(MOCK_OUTSIDER_USER_ID);
  addUser(MOCK_UNREVIEWED_USER_ID);

  const signed = (projectId: string, transactionStatus: ProjectReviewContext["transactionStatus"], contractStatus: ProjectReviewContext["contractStatus"] = "SIGNED"): ProjectReviewContext => ({
    projectId,
    clientId: MOCK_CLIENT_USER_ID,
    freelancerId: MOCK_FREELANCER_USER_ID,
    transactionStatus,
    contractStatus,
    contractId: `ctr_${projectId}`,
  });

  addProject(signed("prj_completed", "COMPLETED"));
  addProject(signed("prj_in_progress", "IN_PROGRESS"));
  addProject(signed("prj_canceled", "CANCELED", "CANCELED"));
  addProject(signed("prj_contract_canceled", "COMPLETED", "CANCELED"));
  addProject(signed("prj_both", "COMPLETED"));
  addProject(signed("prj_solo_fresh", "COMPLETED"));
  addProject(signed("prj_solo_due", "COMPLETED"));
  addProject(signed("prj_avg_a", "COMPLETED"));
  addProject(signed("prj_avg_b", "COMPLETED"));

  function seedReview(row: Omit<ReviewRow, "reviewCreatedPublishedAt"> & { reviewCreatedPublishedAt?: string | null }): void {
    reviews.push({ ...row, reviewCreatedPublishedAt: row.reviewCreatedPublishedAt ?? null });
  }

  // 단독·양쪽·평균 시드. isPublic은 컬럼이 아니라 조회 때 계산한다.
  seedReview({
    reviewId: "rvw_solo_fresh",
    projectId: "prj_solo_fresh",
    contractId: "ctr_prj_solo_fresh",
    reviewerId: MOCK_CLIENT_USER_ID,
    revieweeId: MOCK_FREELANCER_USER_ID,
    direction: "CLIENT_TO_FREELANCER",
    rating: 5,
    comment: "아직 비공개",
    tags: ["RESPONSIBILITY"],
    createdAt: nowIso,
  });
  seedReview({
    reviewId: "rvw_solo_due",
    projectId: "prj_solo_due",
    contractId: "ctr_prj_solo_due",
    reviewerId: MOCK_CLIENT_USER_ID,
    revieweeId: MOCK_FREELANCER_USER_ID,
    direction: "CLIENT_TO_FREELANCER",
    rating: 4,
    comment: "14일 경과",
    tags: ["COMMUNICATION"],
    createdAt: seedCreatedAt(nowIso, 14),
  });
  seedReview({
    reviewId: "rvw_both_c2f",
    projectId: "prj_both",
    contractId: "ctr_prj_both",
    reviewerId: MOCK_CLIENT_USER_ID,
    revieweeId: MOCK_FREELANCER_USER_ID,
    direction: "CLIENT_TO_FREELANCER",
    rating: 5,
    comment: "의뢰인 리뷰",
    tags: ["DELIVERABLE_QUALITY"],
    createdAt: nowIso,
  });
  seedReview({
    reviewId: "rvw_both_f2c",
    projectId: "prj_both",
    contractId: "ctr_prj_both",
    reviewerId: MOCK_FREELANCER_USER_ID,
    revieweeId: MOCK_CLIENT_USER_ID,
    direction: "FREELANCER_TO_CLIENT",
    rating: 4,
    comment: "프리랜서 리뷰",
    tags: ["REQUIREMENT_CLARITY"],
    createdAt: nowIso,
  });
  seedReview({
    reviewId: "rvw_avg_a",
    projectId: "prj_avg_a",
    contractId: "ctr_prj_avg_a",
    reviewerId: MOCK_CLIENT_USER_ID,
    revieweeId: MOCK_FREELANCER_USER_ID,
    direction: "CLIENT_TO_FREELANCER",
    rating: 5,
    comment: null,
    tags: [],
    createdAt: nowIso,
  });
  seedReview({
    reviewId: "rvw_avg_a_back",
    projectId: "prj_avg_a",
    contractId: "ctr_prj_avg_a",
    reviewerId: MOCK_FREELANCER_USER_ID,
    revieweeId: MOCK_CLIENT_USER_ID,
    direction: "FREELANCER_TO_CLIENT",
    rating: 5,
    comment: null,
    tags: [],
    createdAt: nowIso,
  });
  seedReview({
    reviewId: "rvw_avg_b",
    projectId: "prj_avg_b",
    contractId: "ctr_prj_avg_b",
    reviewerId: MOCK_CLIENT_USER_ID,
    revieweeId: MOCK_FREELANCER_USER_ID,
    direction: "CLIENT_TO_FREELANCER",
    rating: 4,
    comment: null,
    tags: [],
    createdAt: nowIso,
  });
  seedReview({
    reviewId: "rvw_avg_b_back",
    projectId: "prj_avg_b",
    contractId: "ctr_prj_avg_b",
    reviewerId: MOCK_FREELANCER_USER_ID,
    revieweeId: MOCK_CLIENT_USER_ID,
    direction: "FREELANCER_TO_CLIENT",
    rating: 4,
    comment: null,
    tags: [],
    createdAt: nowIso,
  });

  return {
    getProject(projectId) {
      return projects.get(projectId);
    },
    userExists(userId) {
      return users.has(userId);
    },
    getUserCache(userId) {
      const row = users.get(userId);
      return row ? { ...row } : undefined;
    },
    getReviewsByProject(projectId) {
      return reviews.filter((row) => row.projectId === projectId).map((row) => ({ ...row }));
    },
    getReview(reviewId) {
      const row = reviews.find((item) => item.reviewId === reviewId);
      return row ? { ...row } : undefined;
    },
    getAllReviews() {
      return reviews.map((row) => ({ ...row }));
    },
    insertReview(row) {
      reviews.push({ ...row });
    },
    markReviewCreatedPublished(reviewId, publishedAt) {
      const row = reviews.find((item) => item.reviewId === reviewId);
      if (row) row.reviewCreatedPublishedAt = publishedAt;
    },
    getIdempotency(key) {
      const cached = idempotency.get(key);
      return cached ? { ...cached } : undefined;
    },
    setIdempotency(key, bodyHash, reviewId) {
      idempotency.set(key, { bodyHash, reviewId });
    },
    nextReviewId() {
      seq += 1;
      return `rvw_${seq}`;
    },
  };
}

function createRecordingEventPort(events: ReviewCreatedEvent[]): ReviewEventPort {
  return {
    async publishReviewCreated(event) {
      events.push({ ...event });
    },
  };
}

/** Increment 공개 API 스탠드인. users.rating_average는 갱신하지 않는다. */
export function createReviewApiMock(nowIso: string = MOCK_NOW) {
  const store = createMemoryStore(nowIso);
  const publishedEvents: ReviewCreatedEvent[] = [];
  let currentNow = nowIso;
  // now는 테스트가 14일을 재현할 때만 바꾼다.
  const deps: ReviewServiceDeps = {
    store,
    events: createRecordingEventPort(publishedEvents),
    now: () => currentNow,
  };

  return {
    setNow(nextIso: string) {
      currentNow = nextIso;
    },
    getPublishedEvents(): ReviewCreatedEvent[] {
      return [...publishedEvents];
    },
    getUserCache(userId: string) {
      return store.getUserCache(userId);
    },
    async createReview(
      projectId: string,
      actorUserId: string | undefined,
      input: CreateReviewInput,
      idempotencyKey?: string,
    ) {
      return createReview(deps, projectId, actorUserId, input, idempotencyKey);
    },
    async listProjectReviews(projectId: string, actorUserId: string | undefined) {
      return listProjectReviews(deps, projectId, actorUserId);
    },
    async getReviewSummary(userId: string, actorUserId: string | undefined) {
      return getReviewSummary(deps, userId, actorUserId);
    },
    async publishDueSoloReviews() {
      return publishDueSoloReviews(deps);
    },
  };
}
