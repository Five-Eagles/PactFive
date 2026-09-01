/** 오민혁이 REVIEW_CREATED 수신 후 공개분 합계를 다시 읽는다. 반올림은 하지 않는다. */

export type PublishedRatingAggregate = {
  ratingSum: number;
  reviewCount: number;
};

export type PublishedRatingAggregateReader = {
  getPublishedRatingAggregate(revieweeId: string): Promise<PublishedRatingAggregate>;
};
