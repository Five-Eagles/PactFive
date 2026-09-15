/**
 * 공개 취소 필드(`cancellationId`)를 applications의 `closureEventId`로만 바꾼다(F11,
 * spec.md 규칙 25) — 새 사건을 만들지 않는다. applications가 실제로 이 값을 소비하는
 * 인바운드를 아직 app/에 붙이지 않아, 지금은 변환 함수만 두고 호출자는 없다.
 *
 * 원본: features/contracts-payments/prototype/server/closure-adapter.ts (28471d6, #80).
 */
export function toApplicationClosureEventId(cancellationId: string): string {
  return cancellationId;
}
