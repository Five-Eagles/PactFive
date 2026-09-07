# reviews 테스트 결과

담당자: 조준영            테스트 날짜: 2026-09-07
테스트한 커밋: 커밋 전 (설계서 v2.0 `/me`·`/rating`·`content` 검증 포함)

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 65, FAIL 개수: 0)

키 없는 환경. 규칙 12 알림 발송은 해당 없음.

리뷰는 slug `rev-available`·`rev-m01`·`rev-blind` 등. `.review-grid`. 확인 모달은 POST 없음.
작성 GET은 `/me`+`/rating`. 브라우저 자동화는 없어 `run.tsx` SSR로 확인했다.

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 COMPLETED만 작성 | COMPLETED 작성 · 미완료 `PROJECT_NOT_COMPLETED` | 통과 |
| 2 상호 방향·당사자 | 프리랜서 방향 추론 · 비당사자 `REVIEW_FORBIDDEN` | 통과 |
| 3 방향당 1건 UNIQUE | 같은 키 200 · 다른 본문 `IDEMPOTENCY_KEY_REUSED` · 방향당 1회 409 | 통과 |
| 4 수정 불가 | PATCH 405 · PATCH 라우트 없음 | 통과 |
| 5 양측 즉시 공개 | 두 방향 작성 후 `visibility: PUBLISHED` 2건 | 통과 |
| 6 14일 단독 공개 | 미공개 INSERT에 이벤트 없음 · 14일 공개 · 기한 후 `REVIEW_PERIOD_CLOSED` | 통과 |
| 7 공개분 평균 | `/rating` null·0 · 공개분만 4.5 · users 캐시 미갱신 | 통과 |
| 8 CANCELED 차단 | 거래·계약 취소 `PROJECT_NOT_COMPLETED` | 통과 |
| 9 API·권한 | 비당사자 공개만 · `/me` 블라인드 숨김 · 무인증 401 | 통과 |
| 10 작성 필드·태그 | 태그 422 · 별점 400 · 공백 본문 422 · 서버가 식별자 채움 | 통과 |
| 11 UX | AVAILABLE·블라인드·평균 4.3. 설계서 §10 표시명. 403 제목 숨김 | 통과 |
| 12 알림 발송 | 발송은 팀장. 이 `run.tsx` 해당 없음 | 해당 없음 |
| 13 Increment | 이벤트 2건 · 404 · 사용자 공개 목록 빈 페이지 · `/me`·`/rating` 라우트 | 통과 |
| UI(design/web) | REV-01 페이지 본문. 1280 2열 / 모바일 스택 | 통과 |

## ux-philosophy.md §6 자체 점검 (리뷰)

| 검증 항목 | 이 화면에서 어떻게 충족하는가 |
|---|---|
| 상태 이해 | 작성 가능·블라인드 제출·공개·미완료·취소를 문장으로 구분한다. |
| 근거 이해 | 평균은 서버값. 0건은 `아직 받은 리뷰 없음`. |
| 작업 보호 | 확인 모달 POST 없음. 제출 후 수정 버튼 없음. |
| 복구 가능성 | LOAD_FAILED 「다시 시도」. 409 중복은 기존 결과. |
| 선택권 | 「나중에 작성」. 태그는 선택. |
| 비파괴성 | 「리뷰를 제출할까요?」. 상대 제출 여부를 추정하지 않는다. |
| 접근 가능성 | `h1`, 별점 `radiogroup`, 다이얼로그 `aria-modal`. |

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 Mock이다. 숨김·Outbox·app 재이식은 Increment 밖이다.
- 단독 공개 14일은 ASSUMPTION. ERD E-19 태그는 CR `0001-review-tag-codes-v2.md`로만 남김.
- develop `app/`은 아직 `review-summary`·단수 `/review`. 팀장 다음 통합.

## 팀장에게 물어봐야 하는 것

규칙 6 14일 확정. 태그 CR. `features/contracts-payments/review/external-wait-2026-08-31.md` §2.
