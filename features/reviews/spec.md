# reviews — SPEC

이번 세션 범위는 **규칙 13 Increment**이다. 공개 API Mock · `design/` high-fi 1화면 · `run.tsx`.
정본: PRD v6.4 §3.7.1 · I-23 · I-24, 상호 리뷰 설계서 v2.0, ERD v1.4 `reviews`.
태그 코드는 설계서 §10. E-19와의 차이는 `change-requests/0001-review-tag-codes-v2.md`.
함수명으로만 지칭한다 (D-48).

## 목적

거래 완료 후 당사자가 서로 1회 평가하고, 공개된 리뷰만 평균 별점에 넣는 계약을 고정한다.

## 범위

- 포함: 작성 조건, 방향·1회 제한, 블라인드·14일 공개, 평균, `/reviews/me`·`/rating`·사용자 공개 목록,
  Mock, high-fi 1화면, `REVIEW_CREATED` 발행.
- 제외: 수정·삭제, 운영 숨김·복원, Outbox Projection, `users` 직접 UPDATE, 알림 발송.

## 관련 엔티티 (근거: `docs/domain/erd.md`)

조준영: `reviews`. PK 접두어 `rvw_`. `updated_at`·`deleted_at` 없음.
`rating` 1~5. UNIQUE `(project_id, direction)`.
`review_direction` = `CLIENT_TO_FREELANCER` · `FREELANCER_TO_CLIENT`.
공개는 컬럼이 아니라 조회 때 `visibility`(`BLINDED`·`PUBLISHED`)로 계산한다.

오민혁: `users` 평점 캐시 — `REVIEW_CREATED` 후 `getPublishedRatingAggregate`로 재집계.
유동우: `projects.transaction_status` 읽기 (`COMPLETED` · `CANCELED`).
계약: `contracts.status` (`CANCELED`면 작성 차단).

태그(설계서 §10, 방향에 맞는 5종만). 검증은 서비스.

의뢰인→프리랜서: `WORK_QUALITY` · `ON_TIME_DELIVERY` · `GOOD_COMMUNICATION` ·
`REQUIREMENT_UNDERSTANDING` · `PROFESSIONAL_ATTITUDE`.
프리랜서→의뢰인: `CLEAR_REQUIREMENTS` · `FAST_FEEDBACK` · `GOOD_COMMUNICATION` ·
`SCOPE_STABILITY` · `PROFESSIONAL_ATTITUDE`.

## 규칙

번호는 이후 `api-contract.md`·`prototype/`에서 "규칙 N"으로 참조한다.

1. **작성은 `transactionStatus = COMPLETED`만** (I-24). 선행은 `completeProjectTransaction` 성공.
   그 외·취소는 409 `PROJECT_NOT_COMPLETED`. 서버가 거래 상태를 읽고 판정한다.

2. **상호 리뷰.** 서버가 계약 당사자로 방향을 추론한다. 본문에 `direction` 없음. 비당사자 403
   `REVIEW_FORBIDDEN`.

3. **같은 프로젝트·같은 방향은 1건** (I-23). 다른 키 재POST는 409 `REVIEW_ALREADY_SUBMITTED`.
   같은 멱등키·다른 본문은 409 `IDEMPOTENCY_KEY_REUSED`. 같은 키·같은 본문은 200.

4. **수정 불가.** PATCH·PUT·DELETE 없음. 호출하면 405.

5. **양측 공개.** 두 방향이 있으면 둘 다 `PUBLISHED`. `visibility`는 계산값이다.

6. **단독 공개 (ASSUMPTION).** 첫 리뷰 `submittedAt` 후 14일이면 그 1건만 공개.
   기한 후 반대 방향 신규 제출은 409 `REVIEW_PERIOD_CLOSED`.
   `REVIEW_CREATED`는 공개 이후 5필드만. 미공개 INSERT에는 안 보낸다.

7. **평균은 공개분만.** 내부 `getPublishedRatingAggregate`. 브라우저는
   `GET /api/v1/users/:userId/rating`. 없으면 `averageRating: null`, `reviewCount: 0`.
   `.../review-summary`는 폐기.

8. **취소·무효 차단.** `CANCELED`는 규칙 1과 같은 409 `PROJECT_NOT_COMPLETED`.
   이미 공개된 리뷰는 지우지 않는다.

9. **API·권한.** Bearer 필수.
   `POST/GET .../projects/:projectId/reviews`, `GET .../reviews/me`,
   `GET .../users/:userId/rating`, `GET .../users/:userId/reviews`.
   비당사자 프로젝트 목록은 `PUBLISHED`만. 블라인드 상대 존재는 `/me`에서도 숨긴다.
   POST `Idempotency-Key` 필수.

10. **작성 필드.** 서버가 식별자를 채운다. 본문: `rating`(1~5), `content`(선택 1~1,000),
    `tags`(방향 5종 부분집합). 잘못된 별점 400 `INVALID_REVIEW_RATING`.
    본문 오류 422 `REVIEW_CONTENT_INVALID`. 태그 오류 422 `REVIEW_TAG_INVALID`.

11. **UX.** 라우트 `/projects/:projectId/reviews` (REV-01). 작성 GET은 `/me`+`/rating`.
    상대 제출 여부를 말하지 않는다. 제출 후 수정 없음.

12. **알림 발행은 CP / 발송은 팀장.** 이 기능은 `REVIEW_REQUESTED`를 발송하지 않는다.

13. **Increment 완료 기준** (`prototype/run.tsx`).
    COMPLETED 작성 / 미완료·취소 409 / 방향당 1회 / 멱등 / PATCH 없음 /
    양쪽 즉시 공개 / 14일 단독 공개 / 기한 후 409 / 공개분 평균·`/rating` /
    `/me` 블라인드 숨김 / 잘못된 태그·본문 / 로딩·빈·`LOAD_FAILED`.
    제외: 숨김·Outbox·알림 발송·app 재이식.

## 크기 기준

같은 엔티티(`reviews`)의 생애주기라 한 파일로 유지한다.

## 비고

규칙 6의 14일은 **ASSUMPTION**이다. 외부 대기 정본은
`features/contracts-payments/review/external-wait-2026-08-31.md`.
