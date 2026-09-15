---
title: "리뷰 창·평점 Projection Mock을 ERD에 올린다"
status: "반영 완료"
requested_by: "조준영 (reviews)"
date: "2026-09-07"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [reviews]
---

# 스펙 변경 신청 — 리뷰 창·평점 Projection (CR-RV-002)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (reviews) |
| 날짜 | 2026-09-07 |
| 상태 | **반영 완료 (2026-09-09 팀장 · 2026-09-10 조준영 확인).** `review_windows` 반영. Projection 테이블은 신설하지 않기로 합의 |
| ID | `CR-RV-002` |
| 근거 | 실서비스 구축 검토서 F06·F07·F12 |

> **닫음 (2026-09-09, 팀장).**
>
> **`review_windows` — 반영.** `project_id` PK(1:1), `opened_at`(프로젝트 최초
> `completedAt`), `deadline_at` = `opened_at` + 14일, `policy_version` 그대로 스키마에
> 넣었다(`docs/domain/erd.md`·`erd-v1.4.dbml`, `app/server/prisma/schema.prisma`). 원본
> (`features/reviews/prototype/server/review.service.ts`)의 `isReviewPublic`·
> `ensureWindow`·`isPeriodClosed`·`reviewDeadlineAt` 로직을 `app/server/src/features/reviews/
> review.service.ts`에 그대로 포팅했다 — 검증 순서·409/공개 규칙은 원본과 같다(수동
> 스모크 테스트로 창 생성·마감 후 공개 전환·`REVIEW_PERIOD_CLOSED` 409·비완료 프로젝트에서
> 창 미생성 4가지 시나리오를 직접 돌려 확인했다).
>
> **한 가지 전제가 원본에는 없던 것이다 — `opened_at`의 소스.** 원본 Mock은
> `ProjectReviewContext.completedAt`이 항상 이미 있었다(테스트 프로젝트를 그렇게
> 세팅했다). app/의 `projects` 테이블에는 애초에 "언제 COMPLETED가 됐는지" 저장하는
> 컬럼이 없었다 — `transactionStatus`만 바뀌고 시각은 어디에도 안 남았다. CR 본문이
> "프로젝트 최초 completedAt"을 요구하길래, `projects.completed_at`
> (nullable timestamptz)을 신설해 `completeProjectTransaction`이 COMPLETED로 바꾸는
> 그 한 번의 호출에서만 쓰도록 했다(`payment_pending_at`과 같은 원칙, 이 CR이 명시적으로
> 요청한 컬럼은 아니지만 이것 없이는 구현이 성립하지 않았다). **이 부분은 조준영 확인이
> 필요하다** — project-management 소유 테이블에 새 컬럼을 더한 것이라, 저장 시점·의미가
> 조준영이 상정한 것과 같은지 봐 달라.
>
> **배포 위험 — 기존 COMPLETED 프로젝트.** 이 CR이 배포되기 전에 이미 COMPLETED였던
> 프로젝트는 `completed_at`이 NULL로 남는다. 그 프로젝트들은 `review_windows`가 생기지
> 않아 단독 리뷰가 영원히 비공개로 남고, 새 리뷰 작성도 `REVIEW_PERIOD_CLOSED` 409로
> 막힌다. 마이그레이션 SQL(`20260909140000_review_windows_and_project_completed_at`)에
> 확인 조회를 넣어 뒀다 — 배포 전 팀장이 실제 데이터로 대상이 있는지 확인해야 한다.
>
> **`user_rating_projections` — 신설하지 않는다.** `getUserRating`이 공개 리뷰를 매번
> 실시간으로 합산해서 이미 정상 동작한다(`review.service.ts` `getPublishedRatingAggregate`).
> 이 판단은 이번에 새로 내린 것이 아니라, 이전 세션에서 조준영과 이미 확인한 사항이다 —
> 캐시를 얹을 이유(성능 문제·집계 비용)가 실제로 나타나면 그때 별도 CR로 다시 요청해
> 달라.
>
> 확인 — `app/server` tsc는 이 CR로 새로 생긴 7건(`Project.completedAt`·`ReviewWindow`
> 모델·`prisma.reviewWindow` 접근자 관련)을 포함해 총 9건이 나온다. 전부 샌드박스가
> `prisma generate`를 실행할 수 없어서 나는 예상된 전이 상태다(#176·#202와 같은 사유) —
> 로컬에서 `npx prisma generate` 한 번이면 사라진다. 그 외 신규 tsc 에러는 없다.

> **확인 완료 (조준영, 2026-09-10).**
> - `projects.completed_at` — 저장 시점·의미가 규칙 6(최초 `completedAt`)과 같다. 동의.
> - `user_rating_projections` 미신설 — 동의. 합계 정본은 `getPublishedRatingAggregate`이고
>   실시간 합산이면 F07 캐시 경합이 없다. 이 CR은 전부 닫아도 된다.
> - 배포 전 COMPLETED NULL 백필은 팀장 안내에 동의.

## 배경 (왜 필요한가)

실서비스 구축 검토서 F06·F07·F12. 동시 첫 제출과 평점 덮어쓰기를 Mock에서 막으려면
`review_windows`와 reviews 소유 `user_rating_projections`가 필요하다. ERD는 팀장 반영.

## 현재 스펙

`reviews`만 있다. 공개는 조회 때 계산. `users.rating_average`는 오민혁.

## 제안하는 변경

- `review_windows`: `project_id` UNIQUE, `opened_at`(프로젝트 최초 completedAt),
  `deadline_at` = opened_at+14일, `policy_version`.
- `user_rating_projections`: `user_id` UNIQUE, `rating_sum`, `review_count`, `calculated_at`.
  `users` 직접 UPDATE 없음.

근거: 검토서 F06·F07·F12. `app/`·ERD 원본은 이 CR로만 요청한다.
