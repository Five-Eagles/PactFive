/**
 * 원본: features/reviews/prototype/server/display-average.ts (조준영).
 * 이식 지시서(2026-09-09) §2-1 — 합계/건수에서 바로 한 자리로 반올림한다. 4.45를 다시
 * 반올림하지 않는다.
 *
 * 합계 489·건수 110이면 489/110 = 4.4454…이고 한 번에 한 자리로 반올림하면 4.4다. 둘째 자리로
 * 먼저 4.45를 만들고 다시 반올림하면 4.5가 된다 — 별점 한 칸이 틀린다(원본 run.tsx F12 반례).
 */
export function displayAverageRating(ratingSum: number, reviewCount: number): number | null {
  if (reviewCount <= 0) return null;
  return Math.round((ratingSum / reviewCount) * 10) / 10;
}
