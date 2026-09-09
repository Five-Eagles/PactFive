---
title: "사용자 평점 캐시 소비와 인증 ULID 생성기 app 통합"
status: "제안 — 유효함, 두 항목 모두 미구현 (2026-09-09 재검토)"
requested_by: "오민혁"
date: "2026-09-08"
affected_docs: [docs/domain/erd.md]
affected_features: [user-management, reviews, notifications]
---

> **재검토 (2026-09-09, 팀장).** CR-RV-002가 `user_rating_projections`를 만들지 않기로
> 한 것과 이 CR은 **다른 캐시를 가리킨다** — 폐기되지 않았다.
>
> - **(Fact)** CR-RV-002가 거부한 것은 reviews가 자체 소유하려던 별도 테이블
>   `user_rating_projections`다. 이유는 `getPublishedRatingAggregate`(reviews 자체
>   화면용)가 매번 실시간 합산으로 이미 잘 동작해서였다
>   (`features/reviews/change-requests/0002-...md` 닫음 노트).
> - **(Fact)** 이 CR이 요청하는 `users.rating_average`/`review_count`는 **다른 테이블,
>   다른 소유자**다 — ERD E-13(`docs/domain/erd.md:86`)에서 이미 별도로 결정된 캐시이고,
>   `schema.prisma:354-355`에 `ratingAverage Decimal?`·`reviewCount Int` 컬럼도 이미 있다.
>   project-management 같은 **다른 기능**이 리뷰 테이블을 직접 조회하지 않고 사용자
>   평점을 읽을 수 있어야 해서 필요한 캐시다 — reviews 자체 화면 문제와는 목적이 다르다.
> - **(Fact)** 생산자 쪽은 있다 — `review.service.ts:169`가
>   `events.publishReviewCreated(...)`를 호출하고, `:275` 주석대로 **공개된 행에만**
>   보낸다. 다만 `in-memory-review-event.ts` 뿐이라 durable outbox는 아니다(이 CR §"팀장 /
>   reviews 연결 요청" 4·5번이 이미 지적한 그대로).
> - **(Fact)** 소비자 쪽은 없다 — `app/server/src/features/user-management/`에
>   `createReviewCreatedConsumer`·`UserRatingRepository` 어느 것도 없다(grep 0건). 이벤트를
>   구독하는 코드 자체가 app/에 없으므로 `users.rating_average`는 항상 NULL로 남는다.
> - **(Fact)** 소비 반대편의 소비자도 비어 있다 —
>   `app/server/src/features/project-management/in-memory-external.adapter.ts:113`의
>   `toClientProfile`은 `averageRating: 0`을 하드코딩한다. 캐시가 채워져도 지금 코드는
>   그 값을 읽지 않는다. 이건 project-management의 Prisma 외부 어댑터 자체가 아직 없다는
>   더 큰 갭이라 이 CR 범위 밖이다.
> - **(Fact)** 인증 ULID 부분도 그대로 열려 있다 — `auth.service.ts:243-244`가 여전히
>   `usr_`/`ses_` + UUID32(36자)를 기본값으로 쓴다. `auth-record-id.ts`는 app/에 없다.
> - **(Opinion, 팀장)** 상태를 "반영 완료"나 "폐기"로 바꾸지 않는다 — 둘 다 사실이 아니다.
>   생산자만 반쪽 있고 소비자·읽는 쪽·ULID 세 곳 모두 미구현인 채로 둔다. 다음에 이 CR을
>   집을 때는 4개를 한 세트로 봐야 한다: ① durable outbox(생산자) ② user-management
>   consumer/repository(소비자) ③ project-management Prisma 외부 어댑터(읽는 쪽) ④ 인증
>   기본 생성기 30자화. 넷 중 하나만 하면 캐시가 반쪽짜리로 남는다.

# 통합 요청

## 근거와 완료 범위

ERD E-12는 REVIEW_CREATED 뒤 Users 도메인의 AVG/COUNT 원자적 갱신을 요구하고 reviews SPEC도
오민혁 소비 책임을 명시한다. user-management에 `createReviewCreatedConsumer`와 주입형
저장소/reader, 직렬화·rollback Mock, 경계 테스트를 추가했다. 새 HTTP·DB schema·UI는 없다.

또한 기존 `usr_`/`ses_` + UUID32 기본 생성기는 36자로 users/auth_sessions의 varchar(30)에
맞지 않았다. **feature 원본의 두 기본 생성기**를 기존 ERD prefixed ULID30에 맞췄다.
기존 36자 데이터는 변경하지 않았다. #89 프로필 포트에서 발견한 ID 차이의 source 후속이며,
app의 같은 생성기와 DB 기존 자료까지 해결한 것은 아니다.

## 팀장 / reviews 연결 요청

1. reviews가 공개 커밋한 후의 5필드 이벤트만 신뢰된 내부 채널로 전달한다. `REVIEW_CREATED`를
   notifications NotificationType에 추가하지 않는다. notifications의 `REVIEW_REQUESTED`와 별개다.
2. `createReviewCreatedConsumer(repository, ratings)`를 조립 지점에 주입한다.
   ratings는 reviews의 `getPublishedRatingAggregate`다. 이벤트 rating/이전 users 평균으로
   증분 합산하지 않는다. 사용자 캐시의 numeric(3,2)와 reviews 표시 한 자리 평균을 혼용하지 않는다.
3. `UserRatingRepository` DB adapter는 사용자 row/advisory lock을 획득한 **다음** 새 집계를
   읽고 두 users 필드를 원자적으로 교체한다. 사용자별 직렬화는 모든 worker 프로세스에 공통이어야
   하며 lagging replica/잠금 전 repeatable-read snapshot을 쓰지 않는다. 탈퇴도 같은 사용자
   잠금에 참여한다. 프로세스 내 Map 잠금을 그대로 운영에 복사하지 않는다.
4. publisher/worker는 소비기의 commit이 성공해야만 전달 성공을 기록한다. reject를 catch하고
   성공으로 처리하지 않는다. retryable=true는 제한적 backoff, false는 격리/조사이며
   dead-letter와 재처리 소유자를 지정한다. commit 결과 불명은 재집계 방식으로 재전달한다.
5. 현재 reviews prototype은 `publishReviewCreated` 호출 후 mark/outbox를 기록한다. 실제 app에는
   과거 구현도 남아 있다. 원본과 app 모두 운영 durable outbox 트랜잭션/후처리 재시도 보장이
   검증된 것은 아니다. 선행 review INSERT가 성공했으나 소비가 실패한 경우 같은 멱등키 replay가
   publish 경로를 생략해도 **별도의 durable worker가 재전달**하도록 reviews 담당자와 확인한다.
   이 feature 소비기는 생산자의 유실 문제를 대신 해결하지 않는다.

## 팀장 / 인증 연결 요청

- `auth-record-id.ts`와 AuthSessionService 기본 user/session 생성기 2줄을 app 형식으로 반영한다.
  외부 options의 기존 생성기 주입이 있으면 그 경로도 정본 길이에 맞는지 확인한다.
- 신규 가입 확인·OAuth 신규 가입·세션 발급을 실제 Prisma에서 검증한다. 기존 사용자/외래키 ID를
  일괄 축약하거나 다시 발급하지 않는다. 실제로 36자 자료가 저장된 환경이 있으면 먼저 read-only
  inventory 후 별도 승인된 이관 계획을 수립한다. schema를 36자로 늘리는 대안은 이 요청에 없다.
- 인증 provider UUID, nonce, Refresh/Access Token, 가입·탈퇴 정책은 변경하지 않는다.

## 미완료 조건

실제 DB adapter·lock/transaction 격리 검증, durable producer 전달·worker·운영 재처리, app
생성기 반영/기존 자료 조사와 공급자 E2E는 미완료다. 이번 변경은 담당 feature 초안이며
`app/` 수정 예외·병합·배포 승인을 확대하지 않는다. 기존 인증 피드백 상태도 임의 종결하지 않는다.
