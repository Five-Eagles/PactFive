/** 공개 시점에만 발행한다. 오민혁이 users 캐시를 이 이벤트로 갱신한다. */
export type ReviewCreatedEvent = {
  reviewId: string;
  projectId: string;
  revieweeId: string;
  rating: number;
  publishedAt: string;
};

export type ReviewEventPort = {
  publishReviewCreated(event: ReviewCreatedEvent): Promise<void>;
};
