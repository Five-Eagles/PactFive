# user-management 피드백 — 2026-09-09 PR #89 통합 (포트/서비스/Prisma 리포지토리 이식)

반영 커밋(prototype 기준): `24b4cd9` `feat(user-management): 프로필 포트·평점 캐시 소비·인증 ID
정합성 (#89)`
통합 기준: `origin/develop 7fccffa`, 작업 브랜치
`feature/user-management-notifications-ai-pricing-integration`
sync-log.md 기록: 없음(이 브랜치는 아직 커밋 전)

> **후속 (2026-09-09, 팀장).** `notifications.md` 후속 노트와 같은 사정 — 이 커밋은
> `feat/notifications-user-management-integration` 브랜치로 오늘 develop 위에
> cherry-pick됐다(충돌 1건, `review.service.ts` — notifications.md 참고). 항목 1(인증 ID
> 생성기)·항목 2(평점 캐시 소비자)는 이제 CR-0002가 요구한 4개 항목 중 ②(소비자)·④(인증
> 생성기)를 채운 상태다 — ①(durable outbox 생산자)·③(project-management가 이 캐시를 읽는
> Prisma 외부 어댑터)은 여전히 비어 있다(`in-memory-external.adapter.ts`의 `toClientProfile`은
> 아직 `averageRating: 0` 하드코딩). CR-0002 문서에 반영.

> 사용자 승인 범위·공통 검증 결과는 같은 날짜 `ai-pricing.md`·`notifications.md` 참조.

## 항목 1 — [반영] 인증 ID 생성기를 ERD 정본 길이(30자)로 교체

상태: 완료

**Fact**
- 기존 `AuthSessionService`의 `nextUserId`/`nextSessionId` 기본값은 `usr_`/`ses_` +
  UUID32(하이픈 제거) = 36자였다. `schema.prisma`의 `users.id`/`auth_sessions.id`는
  `@db.VarChar(30)`이라 실제 DB에는 저장되지 않는 값이었다(신규 가입은 항상 이 기본값을 탄다).

**어떻게 채웠는지**
- `app/server/src/features/user-management/auth-record-id.ts`에 원본
  `createAuthRecordId(prefix, timestamp?, entropy?)`를 그대로 이식했다(접두어 3자 + `_` +
  Crockford Base32 ULID 26자 = 30자).
- `auth.service.ts`의 두 기본값을 `createAuthRecordId("usr"|"ses")` 호출로 바꿨다. 외부에서
  `nextUserId`/`nextSessionId`를 주입하는 기존 경로(테스트 등)는 그대로 둔다 — 기본값만 교체.
- 이미 저장된 36자 데이터, Supabase UUID, 토큰은 건드리지 않는다.

**왜 그렇게 채웠는지 (근거)**
- change-requests/0002-user-rating-and-auth-id-integration.md "팀장 / 인증 연결 요청" 1번.

**미완료 (CR-0002 "미완료 조건" 그대로)**
- 실제 36자 데이터가 저장된 환경이 있는지 read-only 조사·이관 계획은 이번 반영 범위 밖이다.

## 항목 2 — [반영] 사용자 평점 캐시(users.rating_average/review_count) 자동 갱신

상태: 완료

**Fact**
- `review.service.ts`의 `createReview`→`publishNewlyPublic`은 REVIEW_CREATED를 발행만 하고
  `users` 캐시는 갱신하지 않았다(코드 주석 "users는 갱신하지 않는다"). `schema.prisma`의
  `User.ratingAverage`/`reviewCount` 컬럼은 이미 있었지만 쓰는 코드가 없었다.

**어떻게 채웠는지**
- `user-management/user-rating.port.ts`·`user-rating.repository.ts`·`user-rating.service.ts`
  (`createReviewCreatedConsumer`)를 원본 그대로 이식했다.
- `PrismaUserRatingRepository.withUserRatingTransaction`은 `pg_advisory_xact_lock(hashtext(userId))`로
  사용자별 잠금을 건다 — `project-guard.ts`의 in-process Map 잠금과 달리 DB에 연결된 모든
  worker/인스턴스에 공통이다(CR-0002가 요구한 "모든 worker 프로세스에 공통인 DB row/advisory
  lock"). mock 인증 개발 모드용 `InMemoryUserRatingRepository`도 이식했다(처음 보는 사용자는
  활성으로 간주하고 캐시 행을 즉석 생성하는 dev 전용 완화를 추가했다 — 원본 mock은 테스트 전용
  seed 방식이라 이 완화가 없었다).
- `review.service.ts`의 `ReviewServiceDeps`에 `ratingConsumer: ReviewEventPort` 필드를
  추가했다. 새 타입을 만들지 않고 기존 `ReviewEventPort`(이벤트 5필드 계약이 이미 같음)를
  재사용해 reviews가 user-management를 import하지 않게 했다(app/web/AGENTS.md "폴더 간
  접점"과 같은 원칙 — 실제 연결은 express-app.ts에서만 한다).
- `getPublishedRatingAggregate`의 매개변수 타입을 `ReviewServiceDeps` 전체에서
  `Pick<ReviewServiceDeps, 'repository'|'now'>`로 좁혔다 — express-app.ts가
  `ratingConsumer`를 만들 때 그 값 자체를 필요로 하는 순환을 피하기 위함이다(하위호환:
  전체 deps를 넘기는 기존 호출부는 그대로 통과한다).
- express-app.ts에 `userRatingRepository`(Prisma/InMemory 게이트, 다른 6기능과 같은 패턴)와
  `reviewRatingConsumer`를 만들어 `createReviewRouter`에 주입했다.

**왜 그렇게 채웠는지 (근거)**
- change-requests/0002 "팀장 / reviews 연결 요청" 2·3번, api-contract.md "내부 리뷰 공개
  소비 및 인증 식별자" 절.

**미완료/한계 (CR-0002 자신이 인정한 gap — 새로 만든 회귀 아님)**
- `publishNewlyPublic`은 `deps.events.publishReviewCreated`와 마찬가지로 `ratingConsumer`
  호출도 try/catch 없이 그대로 둔다 — 캐시 갱신이 실패하면 리뷰 작성 응답 자체가 500으로
  실패할 수 있다(리뷰 행은 이미 INSERT됨). 같은 idempotencyKey로 재시도하면 캐시가
  갱신되지 않은 채 캐시된 200을 돌려준다(재발행하지 않음) — CR-0002가 "이 feature 소비기는
  생산자의 유실 문제를 대신 해결하지 않는다"고 명시한 durable outbox/재처리 부재의 연장이며,
  이번 반영에서 새로 만든 결함은 아니다.
- advisory lock은 `hashtext(userId)` 해시 충돌 시 다른 두 사용자가 같은 잠금을 공유할 수
  있다(false contention) — 직렬화 오류(다른 사용자 갱신을 건너뜀)는 아니고 대기 시간만
  늘어난다.

## 항목 3 — [보류, RW 결정] ProfileCompletionPort — 이식만 하고 게이트는 끈다

상태: 이식 완료 / 통합(게이트 연결) 보류

**Fact**
- app/web에는 프로필(회사명/업종, 전문분야/경력/기술) 입력·수정 화면이 없고, app/server에는
  `client_profiles`/`freelancer_profiles`/`freelancer_skills`를 채우는 코드가 전혀 없다
  (grep 0건, 2026-09-09 확인). `applications/application.types.ts`는 이 사실을 헤더 주석에
  이미 기록해 두고 `profileCompletion`을 항상 `null`로, `PROFILE_INCOMPLETE`를 절대 넣지
  않도록 명시적으로 비워 뒀다.

**Assumption → 결정 근거**
- 지금 PROFILE_INCOMPLETE 게이트를 켜면: 모든 프리랜서 계정이 (고칠 화면이 없으므로) 영원히
  INCOMPLETE로 잡혀 프로젝트 지원 자체가 막힌다 — 되돌릴 화면이 없는 회귀.
- change-requests/0001-profile-completion-integration.md도 "미완성 프로필을 채울 화면/복귀
  동선까지 확인"을 통합 완료 조건으로 명시하고 있어, 지금 게이트를 켜는 것은 그 문서 자신의
  조건에도 어긋난다.

**결정 (RW, AskUserQuestion)**
- "포트/서비스/Prisma 리포지토리만 이식, 게이트는 끄기" 선택. `profile-completion.port.ts`·
  `.repository.ts`·`.service.ts`(`createProfileCompletionPort`)를 원본 그대로 이식하고,
  `PrismaProfileCompletionRepository`(단일 `findUnique` + nested select로 사용자·역할별
  프로필·연결 기술을 한 SQL로 읽는 adapter)를 새로 작성했다. `applications`의
  `getApplicationEligibility`/`createApplication`에는 주입하지 않았다 — 기존 동작
  (`profileCompletion: null`, `PROFILE_INCOMPLETE` 미사용) 그대로 보존.
- express-app.ts 조립 지점에도 아직 인스턴스를 만들지 않았다 — 아무도 소비하지 않는 죽은
  배선을 남기지 않기 위함이다. 프로필 입력·수정 화면이 생기면 그때 Prisma 리포지토리를
  만들고 게이트를 연다.

**다음에 필요한 것 (통합 완료 조건, CR-0001 그대로)**
- 프로필 입력·수정 화면(회사명/업종 또는 전문분야/경력/기술), applications 게이트 실제 연결,
  project-management의 2상태 포트와의 실패 매핑 합의.

## 검증 — 2026-09-09

- `app/server`: `npx tsc --noEmit` 클린(생성된 Prisma 클라이언트 `src/generated/prisma` 대상
  포함 — 이전 트랙들과 달리 이번엔 sandbox에 클라이언트가 이미 존재해 실제 타입으로 검증했다).
- app/web 반영 없음 — PR #89의 실제 diff(`git show --stat 24b4cd9`)에 `features/user-management/
  prototype/web/**` 변경이 전혀 없다(커밋 메시지의 "account withdrawal UI prototype" 서브커밋은
  최종 diff에 web 파일로 남지 않았다 — api-contract.md의 PROVISIONAL 절 텍스트만 해당).
- applications/application.service.ts·application.types.ts는 이번 반영에서 손대지 않았다
  (항목 3 결정에 따라 그대로 보존, git diff로 재확인 가능).

**담당자 메모 (조준영 · applications, 2026-09-10)**
- RW 결정에 **동의합니다.** 프로필 입력 화면 없이 게이트를 켜면 Mock의
  `requireProfile`과 같이 모든 지원이 `PROFILE_INCOMPLETE`/`DEPENDENCY_UNAVAILABLE`로
  막힙니다. 지금 `profileCompletion: null` 유지가 맞습니다.
- applications 쪽 연결 시점: 입력·수정 화면이 `client_profiles`/`freelancer_profiles`를
  채운 뒤. 그때 `createProfileCompletionPort`를 express에 주입하고
  `getApplicationEligibility`·`createApplication`에 `requireProfile`을 원본대로 넣으면
  됩니다. **화면 전에는 지시서를 올리지 않습니다** — 켜라는 요청이 되면 안 됩니다.
- CR-AP-002 GAP-04·대기 현황판 09-10에도 같은 보류로 적어 두었습니다.
