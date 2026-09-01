/**
 * `<input type="date">` 값(예: `2026-09-20`)을 서버가 기대하는 ISO 시각으로 바꾼다.
 * 마감 시각은 그날 자정 직전(23:59:59Z)으로 고정한다.
 *
 * ProjectRegisterForm(SCR-B03~B05)의 등록 마감일 입력에서 처음 만들었고, 재모집 확인
 * (SCR-B10)에서 두 번째로 필요해져 `shared/`로 올렸다 — app/web/AGENTS.md "폴더 간 접점"의
 * 승격 기준("두 번째로 필요해질 때 올린다")을 따른다.
 */
export function toIsoOrEmpty(date: string): string {
  return date ? new Date(`${date}T23:59:59Z`).toISOString() : '';
}
