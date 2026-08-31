# reviews 테스트 결과

담당자: 조준영            테스트 날짜: 2026-08-31
테스트한 커밋: 이 커밋

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 35, FAIL 개수: 0)

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 COMPLETED만 작성 | `run.tsx` COMPLETED 작성 · 미완료 `TRANSACTION_NOT_COMPLETED` | 통과 |
| 2 상호 방향·당사자 | `run.tsx` 프리랜서 방향 추론 · 비당사자 POST 403 | 통과 |
| 3 방향당 1건 UNIQUE | `run.tsx` 같은 키·본문 멱등 200 · 방향당 1회 409 | 통과 |
| 4 수정 불가 | `run.tsx` PATCH 405 · PATCH 라우트 없음 | 통과 |
| 5 양측 즉시 공개 | `run.tsx` 두 방향 작성 후 `isPublic: true` 2건 | 통과 |
| 6 14일 단독 공개 | `run.tsx` 미공개 INSERT에 이벤트 없음 · 14일 공개 · 공개 시점 발행 | 통과 |
| 7 공개분 평균 · REVIEW_CREATED | `run.tsx` null·0 · 공개분만 4.5 · users 캐시 미갱신 | 통과 |
| 8 CANCELED 차단 | `run.tsx` 거래 취소 409 · 계약 취소 409 | 통과 |
| 9 API·권한 | `run.tsx` 비당사자 공개만 · 본인 미공개 · 무인증 401 | 통과 |
| 10 작성 필드·태그 | `run.tsx` 잘못된 태그 422 · 별점 422 · 서버가 식별자 채움 | 통과 |
| 11 UX | `run.tsx` 별점·리뷰 작성·빈·로딩·LOAD_FAILED·409 3종·수정 없음 | 통과 |
| 12 알림 비범위 | 최윤석 `REVIEW_REQUESTED`. 이 Increment에서 호출하지 않음 | 안 함 (해당 없음) |
| 13 Increment 완료 기준 | `run.tsx` 양쪽 공개 시 이벤트 2건 · 없는 프로젝트 404 | 통과 |
| UI(design/web) | `design/low-fi.html` 필수 요소 3개가 `ReviewPanel` 기본 렌더에 있음 | 통과 |

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 HTTP·DB 없는 Mock이다. `review.repository.ts`는 호출하면 not implemented다.
- 단독 공개 14일은 ASSUMPTION (PRD에 기간 없음).
- `REVIEW_REQUESTED` 알림은 최윤석. 미연동.
- `REVIEW_CREATED`는 발행만 한다. `users.rating_average` UPDATE는 오민혁.

## 팀장에게 물어봐야 하는 것

- 규칙 6 단독 공개 14일을 확정할 것인지, 다른 일수인지.
  Discord·예/아니오: `features/contracts-payments/review/external-wait-2026-08-31.md` §2.
