# reviews — SPEC

이번 세션 범위는 **규칙 13 Increment**이다. 공개 API Mock · `design/` high-fi 1화면 · `run.tsx`.
정본: PRD v6.4 §3.7.1 · I-23 · I-24, ERD v1.4 `reviews`·E-19 태그 10종,
`docs/domain/erd.md` E-13 `REVIEW_CREATED`. 함수명으로만 지칭한다 (D-48).

## 목적

거래 완료 후 당사자가 서로 1회 평가하고, 공개된 리뷰만 평균 별점에 넣는 계약을 고정한다.

## 범위

- 포함: 작성 조건, 방향·1회 제한, 공개 규칙, 평균, API·권한, UX,
  공개 API Mock, `design/` high-fi 1화면, 14일 단독 공개, `REVIEW_CREATED` 발행.
- 제외: 수정·삭제, 납품 UI, `users` 직접 UPDATE(오민혁), 알림 발송(최윤석 `REVIEW_REQUESTED`).

## 관련 엔티티 (근거: `docs/domain/erd.md`)

조준영: `reviews`. PK 접두어 `rvw_`. `updated_at`·`deleted_at` 없음.
`rating` 1~5. UNIQUE `(project_id, direction)`.
`review_direction` = `CLIENT_TO_FREELANCER` · `FREELANCER_TO_CLIENT`.

오민혁: `users.rating_average`, `users.review_count` — `REVIEW_CREATED`로만 갱신 (E-13).
유동우: `projects.transaction_status` 읽기 (`COMPLETED` · `CANCELED`).
계약: `contracts.status` (`CANCELED`면 작성 차단).

태그(E-19, jsonb 배열, 방향에 맞는 5종만). 검증은 DB가 아니라 서비스.

의뢰인→프리랜서: `RESPONSIBILITY` · `COMMUNICATION` · `TECHNICAL_SKILL` ·
`SCHEDULE_COMPLIANCE` · `DELIVERABLE_QUALITY`.
프리랜서→의뢰인: `REQUIREMENT_CLARITY` · `COMMUNICATION` · `FEEDBACK_SPEED` ·
`SCOPE_STABILITY` · `PAYMENT_RELIABILITY`.

## 규칙

번호는 이후 `api-contract.md`·`prototype/`에서 "규칙 N"으로 참조한다.

1. **작성은 `transactionStatus = COMPLETED`만** (I-24). 선행은 contracts-payments 규칙 4
   `completeProjectTransaction` 성공. `IN_PROGRESS`·그 외는 409. 서버가 거래 상태를 읽고
   판정한다. 클라이언트가 보낸 상태값은 쓰지 않는다.

2. **상호 리뷰.** 방향은 두 값뿐이다. 의뢰인이 쓰면 `CLIENT_TO_FREELANCER`, 프리랜서가 쓰면
   `FREELANCER_TO_CLIENT`. 서버가 계약 당사자로 추론한다. 본문에 `direction`을 넣지 않는다.
   비당사자 403.

3. **같은 프로젝트·같은 방향은 1건** (I-23, UNIQUE). 재POST는 409. 멱등 키가 같아도 본문이
   다르면 바꾸지 않고 409다. 성공 INSERT는 1행.

4. **수정 불가.** PATCH·PUT 없음. `updated_at` 컬럼 없음. UPDATE는 정상 경로에 두지 않는다
   (I-23 App). 삭제도 없다 (평판 데이터).

5. **양측 공개.** 두 방향 행이 모두 있으면 둘 다 즉시 공개한다. `isPublic`은 컬럼이 아니라
   계산값이다.

6. **단독 공개 (ASSUMPTION).** PRD에 대기 기간이 없다. **첫 리뷰 `created_at` 후 14일**이
   지나고 상대가 없으면 그 1건만 공개한다. 팀 확정 전 가정이다. 비고에 남긴다.
   `REVIEW_CREATED`는 **공개 시점**에 1회 발행한다. 미공개 INSERT에는 안 보낸다.

7. **평균 별점은 공개된 리뷰만** 산술평균한다. `users.rating_average` / `review_count`는
   조준영이 직접 UPDATE하지 않는다. 오민혁이 `REVIEW_CREATED`로 갱신한다 (E-13).
   공개 리뷰가 없으면 `averageRating: null`, `reviewCount: 0`.
   제공 API: `GET /api/v1/users/:userId/review-summary` (`getReviewSummary`).
   프로젝트 목록은 이 값을 가공하지 않고 싣는다.

8. **취소·무효 차단.** `transactionStatus = CANCELED` 또는 계약 `CANCELED`면 작성 409.
   COMPLETED가 아니면 규칙 1. 이미 공개된 리뷰는 취소로 지우지 않는다.

9. **API·권한.** `Authorization: Bearer <accessToken>`.
   `POST /api/v1/projects/:projectId/reviews` (`createReview`) — 당사자+COMPLETED.
   `GET /api/v1/projects/:projectId/reviews` (`listProjectReviews`) — 당사자는 본인 미공개
   + 공개된 양쪽. 비당사자는 공개된 것만. 공개 전 상대 리뷰는 숨긴다.
   POST `Idempotency-Key` 필수. 키 재사용이 같은 본문이면 기존 201과 동일 본문 200.

10. **작성 필드.** 서버가 `project_id`·`contract_id`(해당 프로젝트 계약 1건)·`reviewer_id`·
    `reviewee_id`·`direction`·`created_at`을 채운다. 본문: `rating`(1~5), `comment`(선택),
    `tags`(해당 방향 5종 부분집합, 빈 배열 허용). 다른 방향 태그·미등록 코드는 422.
    `contract_id`를 클라이언트가 넣으면 무시한다.

11. **UX.** 라우트 `/projects/:projectId/reviews`. 상태: 로딩, 빈(본인 없음·상대 미작성),
    `LOAD_FAILED` 재시도, 409 중복·미완료·취소 안내, 공개 전 "상대 리뷰는 아직 없습니다".
    제출 후 수정 버튼 없음.

12. **알림은 이 기능이 보내지 않는다.** `REVIEW_REQUESTED`는 최윤석. 공개·작성과 알림 시점은
    다음 스프린트에 최윤석과 맞춘다.

13. **Increment 완료 기준** (`prototype/run.tsx`).
    공개 API Mock(규칙 9·7), `design/` high-fi 1화면(규칙 11), 14일 단독 공개 스케줄,
    `REVIEW_CREATED` 발행만 (users UPDATE는 오민혁).
    제외: 수정·삭제, 납품 UI, 알림 발송.
    완료 기준: COMPLETED 작성 / 미완료 거부 / 방향당 1회 409 / PATCH 없음 /
    양쪽 즉시 공개 / 14일 단독 공개 / CANCELED 거부 / 공개분만 평균 / 비당사자 공개만 /
    잘못된 태그 422 / 로딩·빈·`LOAD_FAILED`.

## 크기 기준

같은 엔티티(`reviews`)의 생애주기라 한 파일로 유지한다.

## 비고

규칙 6의 14일은 **ASSUMPTION**이다. PRD·ERD에 기간이 없다. 팀장이 다른 일수를 정하면
규칙 6만 고친다. 외부 대기(키·14일·오민혁 `REVIEW_CREATED`·최윤석 알림) 정본은
`features/contracts-payments/review/external-wait-2026-08-31.md`.
