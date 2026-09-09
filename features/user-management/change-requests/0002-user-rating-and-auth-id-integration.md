---
title: "사용자 평점 캐시 소비와 인증 ULID 생성기 app 통합"
status: "제안"
requested_by: "오민혁"
date: "2026-09-08"
affected_docs: [docs/domain/erd.md]
affected_features: [user-management, reviews, notifications]
---

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
