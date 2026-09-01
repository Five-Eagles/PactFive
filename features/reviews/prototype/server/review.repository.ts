/** 실제 DB 초안. 검증은 Mock 저장소를 쓴다. */
export async function findReviewsByProject(_projectId: string): Promise<never> {
  throw new Error("prototype only — not implemented");
}

export async function insertReview(_row: unknown): Promise<never> {
  throw new Error("prototype only — not implemented");
}
