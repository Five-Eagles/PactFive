import type { CreateReviewInput, CreateReviewResponse } from "../../server/review.types";

export async function createReview(
  projectId: string,
  input: CreateReviewInput,
  idempotencyKey: string,
): Promise<CreateReviewResponse> {
  const res = await fetch(`/api/v1/projects/${projectId}/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ rating: input.rating, comment: input.comment, tags: input.tags }),
  });
  if (!res.ok) {
    throw new Error("리뷰를 작성하지 못했습니다");
  }
  return res.json();
}
