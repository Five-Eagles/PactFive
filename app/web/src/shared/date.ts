/**
 * `<input type="date">` 값(예: `2026-09-20`, 한국 사용자가 보는 달력일)을 서버가 기대하는
 * UTC ISO 시각으로 바꾼다.
 *
 * ## 시작일과 마감일은 변환이 다르다 (CR-AP-003, 조준영/2026-09-08)
 *
 * PRD §13.1 "값 표기" 표의 시각 예시가 `2026-08-31T14:59:59Z`다 — 이건 한국(KST, UTC+9) 기준
 * 그날 23:59:59를 UTC로 바꾼 값이다(23:59:59 − 9h = **같은 날짜의** 14:59:59). 마감일(하루의
 * 끝)은 이 규칙을 쓴다.
 *
 * 시작일은 반대로 하루의 **시작**이다 — KST 그날 0시를 UTC로 바꾸면 **전날** 15:00이 된다.
 * 원래 이 파일에 함수가 하나(`toIsoOrEmpty`, 마감일용 `T23:59:59Z` 리터럴)뿐이었고 시작일
 * 입력에도 그대로 썼다(`project-registration-draft.ts`, `ProjectEditPage.tsx`). 시작일 9/2를
 * `2026-09-02T23:59:59Z`로 저장하면 KST로는 9/3 08:59다 — 하루가 밀리고, 화면은 ISO 문자열
 * 앞 10자리만 잘라 「9. 2.」로 보여주므로 이 차이가 드러나지 않았다.
 *
 * 저장·비교는 계속 UTC다(PRD §13.1) — 바뀐 것은 "한국 달력일 → UTC" 변환 지점뿐이다.
 * `+09:00` 오프셋을 명시한 ISO 문자열을 `Date`에 직접 넘겨 엔진이 변환하게 한다 — 오프셋
 * 계산을 직접 문자열로 손으로 하지 않는다(날짜 경계·자릿수 실수를 피한다).
 */

/** 모집 마감일 — 그 날짜의 KST 23:59:59(그날의 끝)를 UTC로 바꾼다. */
export function toIsoDeadlineOrEmpty(date: string): string {
  return date ? new Date(`${date}T23:59:59+09:00`).toISOString() : '';
}

/** 모집 시작일 — 그 날짜의 KST 0시(자정, 그날의 시작)를 UTC로 바꾼다. */
export function toIsoStartOfDayOrEmpty(date: string): string {
  return date ? new Date(`${date}T00:00:00+09:00`).toISOString() : '';
}

/**
 * 역변환 — UTC ISO 시각이 **KST로는 어느 달력일인지**를 `YYYY-MM-DD`로 돌려준다.
 * `<input type="date">` 프리필용(예: ProjectEditPage가 기존 `recruitmentStartAt`을 보여줄 때).
 *
 * 마감일(`T14:59:59Z`)은 문자열 앞 10자리만 잘라도 KST 날짜와 같아서 지금까지 드러나지
 * 않았지만, 시작일(`T15:00:00Z`, 전날 자정)은 그냥 자르면 하루 전 날짜가 나온다 — 그래서
 * 이 함수가 필요하다. KST는 서머타임이 없어 고정 +9h 보정이면 충분하다.
 */
export function toKstDateOnly(iso: string): string {
  if (!iso) return '';
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
