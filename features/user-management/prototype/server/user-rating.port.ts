/** reviews가 공개 커밋 이후 전달하는 REVIEW_CREATED의 기존 5필드 계약. */
export type ReviewCreatedEvent = {
  reviewId: string;
  projectId: string;
  revieweeId: string;
  rating: number;
  publishedAt: string;
};

export type PublishedRatingAggregateReader = {
  getPublishedRatingAggregate(revieweeId: string): Promise<{ ratingSum: number; reviewCount: number }>;
};

/** 실패하면 반드시 reject한다. 생산자/worker는 성공 전에 전달 완료를 기록하면 안 된다. */
export type ReviewCreatedConsumer = {
  publishReviewCreated(event: ReviewCreatedEvent): Promise<void>;
};
