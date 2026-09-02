/** 규칙 6 ASSUMPTION. 팀장이 다른 일수를 정하면 이 값만 바꾼다. */
export const SOLO_PUBLIC_AFTER_DAYS = 14;

export const DAY_MS = 86_400_000;

export const MOCK_NOW = "2026-08-31T00:00:00Z";

export const MOCK_CLIENT_USER_ID = "usr_client_a";
export const MOCK_FREELANCER_USER_ID = "usr_freelancer_b";
export const MOCK_OUTSIDER_USER_ID = "usr_outsider";
export const MOCK_UNREVIEWED_USER_ID = "usr_unreviewed";

export const CLIENT_TO_FREELANCER_TAGS = [
  "RESPONSIBILITY",
  "COMMUNICATION",
  "TECHNICAL_SKILL",
  "SCHEDULE_COMPLIANCE",
  "DELIVERABLE_QUALITY",
] as const;

export const FREELANCER_TO_CLIENT_TAGS = [
  "REQUIREMENT_CLARITY",
  "COMMUNICATION",
  "FEEDBACK_SPEED",
  "SCOPE_STABILITY",
  "PAYMENT_RELIABILITY",
] as const;

export const REVIEW_COLLECTION_METHODS = ["GET", "POST"] as const;

export function addDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString();
}

export function tagsForDirection(
  direction: "CLIENT_TO_FREELANCER" | "FREELANCER_TO_CLIENT",
): readonly string[] {
  return direction === "CLIENT_TO_FREELANCER"
    ? CLIENT_TO_FREELANCER_TAGS
    : FREELANCER_TO_CLIENT_TAGS;
}
