import { useState } from "react";
import { createReview as createReviewApi } from "./api/review";
import type { CreateReviewInput } from "../server/review.types";

export function useReview() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateReview = async (
    projectId: string,
    input: CreateReviewInput,
    idempotencyKey: string,
  ) => {
    setIsSubmitting(true);
    try {
      return await createReviewApi(projectId, input, idempotencyKey);
    } finally {
      setIsSubmitting(false);
    }
  };

  return { isSubmitting, handleCreateReview };
}
