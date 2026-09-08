/** 합계/건수에서 바로 한 자리로 반올림한다. 4.45를 다시 반올림하지 않는다. */
export function displayAverageRating(ratingSum: number, reviewCount: number): number | null {
  if (reviewCount <= 0) return null;
  return Math.round((ratingSum / reviewCount) * 10) / 10;
}
