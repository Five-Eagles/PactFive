/** 규칙 6 ASSUMPTION. 팀장이 다른 일수를 정하면 이 값만 바꾼다. */
export const SOLO_PUBLIC_AFTER_DAYS = 14;

export const DAY_MS = 86_400_000;

// 태그 코드 v2.0 (조준영, 2026-09-09 이식 지시서 §1-1) — 2026-09-07 설계서 v2.0에서 계약이
// 바뀌었는데 이 app/ 이식본(2026-09-05)은 구 코드를 그대로 쓰고 있었다. api-contract.md
// :124~129 기준으로 맞춘다.
export const CLIENT_TO_FREELANCER_TAGS = [
  'WORK_QUALITY',
  'ON_TIME_DELIVERY',
  'GOOD_COMMUNICATION',
  'REQUIREMENT_UNDERSTANDING',
  'PROFESSIONAL_ATTITUDE',
] as const;

export const FREELANCER_TO_CLIENT_TAGS = [
  'CLEAR_REQUIREMENTS',
  'FAST_FEEDBACK',
  'GOOD_COMMUNICATION',
  'SCOPE_STABILITY',
  'PROFESSIONAL_ATTITUDE',
] as const;

export function tagsForDirection(
  direction: 'CLIENT_TO_FREELANCER' | 'FREELANCER_TO_CLIENT',
): readonly string[] {
  return direction === 'CLIENT_TO_FREELANCER' ? CLIENT_TO_FREELANCER_TAGS : FREELANCER_TO_CLIENT_TAGS;
}
