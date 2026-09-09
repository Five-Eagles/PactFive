import type { PublishedRatingAggregateReader, ReviewCreatedConsumer, ReviewCreatedEvent } from "./user-rating.port";
import type { UserRatingCache, UserRatingRepository } from "./user-rating.repository";

export class UserRatingProjectionError extends Error {
  constructor(
    public readonly code: "INVALID_REVIEW_EVENT" | "USER_UNAVAILABLE" | "INVALID_RATING_AGGREGATE" | "DEPENDENCY_UNAVAILABLE",
    public readonly retryable: boolean,
  ) {
    super("사용자 평점 캐시를 갱신하지 못했습니다.");
    this.name = "UserRatingProjectionError";
  }
}

function isIdentifier(identifier: unknown): identifier is string {
  return typeof identifier === "string" && identifier.length > 0 && !/[\s\u0000-\u001f\u007f]/u.test(identifier);
}

function isPublishedAt(timestamp: unknown): boolean {
  if (typeof timestamp !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(timestamp)) return false;
  const milliseconds = Date.parse(timestamp);
  const normalized = timestamp.includes(".") ? timestamp : timestamp.replace("Z", ".000Z");
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === normalized;
}

function validateEvent(event: ReviewCreatedEvent): void {
  if (!event || typeof event !== "object" || !isIdentifier(event.reviewId) || !isIdentifier(event.projectId) ||
      !isIdentifier(event.revieweeId) || !Number.isInteger(event.rating) || event.rating < 1 || event.rating > 5 ||
      !isPublishedAt(event.publishedAt)) {
    throw new UserRatingProjectionError("INVALID_REVIEW_EVENT", false);
  }
}

function calculateCache(aggregate: Awaited<ReturnType<PublishedRatingAggregateReader["getPublishedRatingAggregate"]>>): UserRatingCache {
  if (!aggregate || typeof aggregate !== "object" || !Number.isSafeInteger(aggregate.ratingSum) ||
      !Number.isSafeInteger(aggregate.reviewCount) || aggregate.reviewCount < 0 || aggregate.reviewCount > 2_147_483_647 ||
      aggregate.ratingSum < aggregate.reviewCount || aggregate.ratingSum > 5 * aggregate.reviewCount) {
    throw new UserRatingProjectionError("INVALID_RATING_AGGREGATE", true);
  }
  if (aggregate.reviewCount === 0) return { ratingAverage: null, reviewCount: 0 };
  // numeric(3,2) 캐시용 2자리 half-up. 표시용 한 자리 평균의 원본으로 재사용하지 않는다.
  const count = BigInt(aggregate.reviewCount);
  const hundredths = (BigInt(aggregate.ratingSum) * 200n + count) / (2n * count);
  return { ratingAverage: Number(hundredths) / 100, reviewCount: aggregate.reviewCount };
}

export function createReviewCreatedConsumer(
  repository: UserRatingRepository,
  ratings: PublishedRatingAggregateReader,
): ReviewCreatedConsumer {
  return {
    async publishReviewCreated(event) {
      validateEvent(event);
      // 외부에서 전달 객체를 바꿔도 잠금 대상과 집계/쓰기 대상이 갈라지지 않는다.
      const userId = event.revieweeId;
      try {
        await repository.withUserRatingTransaction(userId, async (transaction) => {
          const subject = await transaction.findUser();
          if (!subject || subject.userId !== userId || subject.deletedAt !== null) {
            throw new UserRatingProjectionError("USER_UNAVAILABLE", false);
          }
          const aggregate = await ratings.getPublishedRatingAggregate(userId);
          await transaction.replaceRating(calculateCache(aggregate));
        });
      } catch (error) {
        if (error instanceof UserRatingProjectionError) throw error;
        // 내부 예외/사용자 정보는 외부로 전파하지 않는다. commit 결과 불명도 재집계로 재시도한다.
        throw new UserRatingProjectionError("DEPENDENCY_UNAVAILABLE", true);
      }
    },
  };
}
