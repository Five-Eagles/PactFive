import { REVIEW_COLLECTION_METHODS } from "./review.constants";

/** 컬렉션에 허용하는 메서드. PATCH·PUT·DELETE는 없다. */
export const REVIEW_ROUTES = [
  { method: "POST", path: "/api/v1/projects/:projectId/reviews" },
  { method: "GET", path: "/api/v1/projects/:projectId/reviews" },
  { method: "GET", path: "/api/v1/users/:userId/review-summary" },
] as const;

export function isReviewMethodAllowed(method: string): boolean {
  return (REVIEW_COLLECTION_METHODS as readonly string[]).includes(method);
}
