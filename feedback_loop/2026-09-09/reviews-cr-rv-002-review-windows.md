# reviews 4단계 — CR-RV-002 (14일 리뷰 창) 반영 (2026-09-09)

## 한 일

**스키마** — `projects`에 `completed_at`(nullable timestamptz) 신설. `transactionStatus`가
`COMPLETED`로 바뀌는 `completeProjectTransaction`(project-management, 이미 COMPLETED
재진입을 멱등 early-return으로 막고 있어 재작성 위험 없음) 한 곳에서만 쓴다. `review_windows`
테이블 신설(`project_id` PK 1:1, `opened_at`, `deadline_at` = opened_at+14일, `policy_version`).

**project-management 배선** — `ProjectRecord`·`NegotiationContext`·Prisma/InMemory
리포지토리에 `completedAt` 필드 추가(`payment_pending_at`과 같은 패턴). 신규 프로젝트는
`completedAt: null`로 생성, `completeProjectTransaction`이 COMPLETED 전이 시 한 번만 쓴다.

**reviews 포팅** — `review.service.ts`에 원본(조준영, `review.service.ts`)의 `isReviewPublic`
(window 인자 추가) · `reviewDeadlineAt` · `isPeriodClosed` · `ensureWindow` 흐름을 그대로
옮겼다. `createReview`는 COMPLETED 확정 직후 window를 ensure하고, 삽입 전 기간 마감이면
409 `REVIEW_PERIOD_CLOSED`를 던진다. `getMyProjectReview`는 `reviewDeadlineAt` 필드와
`REVIEW_PERIOD_CLOSED` 사유를 실제로 채운다. `listProjectReviews`·
`getPublishedRatingAggregate`·`listUserReviews`도 window를 반영해 단독 리뷰가 14일 뒤
공개되도록 고쳤다.

**동시성** — 원본은 in-memory Map + `withKeyedLock`으로 window 최초 생성을 지켰다. app/에는
그 락 인프라가 없어, Prisma 구현은 `project_id` 기본키에 대한 `upsert`(create/update no-op)로
같은 원자성을 얻는다 — 두 요청이 동시에 첫 리뷰를 넣어도 같은 openedAt·deadlineAt으로
수렴한다.

**신설하지 않은 것** — `user_rating_projections`(평점 캐시 테이블). `getUserRating`이 공개
리뷰 실시간 합산으로 이미 정상 동작해 캐시가 필요 없다는 판단을 이전 세션에서 조준영과
확인했다.

## 파일

- `app/server/prisma/schema.prisma` (`Project.completedAt`, `ReviewWindow` 모델)
- `app/server/prisma/migrations/20260909140000_review_windows_and_project_completed_at/`
- `app/server/src/features/project-management/{project.types.ts, project.service.ts,
  project-contract.service.ts, project-transaction.port.ts, prisma-project.repository.ts}`
- `app/server/src/features/reviews/{review.types.ts, review.service.ts,
  in-memory-review.repository.ts, prisma-review.repository.ts,
  project-review-context.adapter.ts}`
- `docs/domain/erd.md`, `docs/domain/reference/erd-v1.4.dbml`
- `features/reviews/change-requests/0002-review-window-and-rating-projection.md` (닫음, 절반)

## 검증

- `npx tsc --noEmit`(app/server): **9건** 에러, 전부 `prisma generate` 미실행으로 인한
  예상된 전이 상태(`Project.completedAt` 4건, `ReviewWindow` 모델/접근자 3건, 기존
  CR-CP-002 잔여 2건) — 로컬에서 `npx prisma generate` 한 번이면 전부 사라진다.
- `npx tsx --test app/server/tests/project-pricing-registration.test.ts`: 8/8 PASS.
- 수동 스모크 테스트(InMemoryReviewRepository로 직접 시나리오 실행, 커밋 대상 아님):
  창 생성 시 `deadlineAt = completedAt + 14일` 정확히 계산됨 / 마감 전 상대방
  `reviewDeadlineAt` 정상 반환 / 마감 후 상대방 리뷰가 자동 공개(`PUBLISHED`)로 전환됨 /
  마감 후 새 리뷰 시도는 409 `REVIEW_PERIOD_CLOSED` / `listProjectReviews`가 마감 후
  외부인에게 공개된 단독 리뷰를 정상 노출 / 미완료 프로젝트는 window를 만들지 않고
  `PROJECT_NOT_COMPLETED` 사유·`reviewDeadlineAt: null` 유지 — 6개 시나리오 전부 기대대로
  동작.

## 담당자별 영향/리스크

**조준영 (reviews)** — 코드 변경 없음(팀장이 이식). **확인 필요**: `projects.completed_at`
컬럼은 이 CR이 명시적으로 요청한 게 아니라 팀장이 "프로젝트 최초 completedAt"을 구현하기
위해 추가한 것이다 — 저장 시점(`completeProjectTransaction` 성공 순간)과 의미가 조준영이
상정한 것과 같은지 확인해 달라. `user_rating_projections`를 신설하지 않기로 한 결정도
재확인 부탁한다(이전 세션에서 이미 합의했다고 기록돼 있으나, 최종 확인은 조준영 몫).

**유동우 (project-management)** — 코드 변경 없음(팀장이 스키마·서비스 함수 직접 수정).
`projects` 테이블에 새 컬럼(`completed_at`)이 생겼다 — `ProjectRecord` 타입에 필드가
추가됐으니 이 테이블을 다루는 다른 작업을 할 때 인지하고 있어야 한다.

**전체 팀 (로컬 `app/server` 빌드/테스트)** — `git pull` 후 `npx prisma generate` 필수
(#176·#202와 동일 안내). 안 하면 위 9건의 에러가 그대로 보인다.

**배포 전 확인 필요 (팀장, 미해결)** — 배포 DB에 이미 `COMPLETED`인 프로젝트가 있으면
`completed_at`이 NULL로 남아 그 프로젝트들의 리뷰 창이 영구히 열리지 않는다. 마이그레이션
SQL에 확인 조회를 넣어 뒀다 — 배포 전 실제 데이터로 대상 유무를 확인하고, 있다면 백필
정책(예: `updated_at` 근사치 사용, 또는 "이 CR 이후 완료분부터만 적용")을 결정해야 한다.

## 다음

`#203`(reviews 4단계, CR-RV-002)의 마지막 남은 일은 이 문서·커밋으로 종결. 9단계 계획
전체(#195~#203)가 이것으로 완료된다.
