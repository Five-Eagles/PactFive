# 외부 대기 — 2026-08-31

| | |
|---|---|
| 보내는 사람 | 조준영 · contracts-payments · reviews |
| 날짜 | 2026-08-31 |
| 범위 | 이번 Increment 밖. Mock·reviews 규칙 13은 닫힘 |
| 정본 | 이 파일. 키 질문 원문은 [teamlead-pg-sandbox-keys.md](teamlead-pg-sandbox-keys.md) |

답이 없어도 조준영 쪽 구현은 진행하지 않는다. 수신 후에만 이어서 한다.

## 현황

| 항목 | 상대 | 조준영 | 상대 | 오면 |
|---|---|---|---|---|
| Toss sandbox 키 | 팀장 | Mock만. 실호출 없음 | 8/26 요청, 미수신 | 루트 `.env` → 위젯·실호출 |
| 단독 공개 14일 | 팀장 | 규칙 6 = 14일 구현 | ASSUMPTION | 다른 일수면 상수 1곳 |
| `REVIEW_CREATED` | 오민혁 | 공개 시점 발행만 | users UPDATE 없음 | 없음. 소비는 오민혁 |
| 알림 4종 | 최윤석 | 포트 설계 완료. Mock publish만 | 발송 대기 | 함수명 회신 시 spec 한 줄 |

위젯 실연동, 에스크로·`RELEASED`, PG 환불, 재제안은 키·납품 설계 이후다.

---

## 1. Toss sandbox 키 — 팀장

계정 생성은 팀장. 값은 채팅·깃에 넣지 않는다. 이름: `PG_CLIENT_KEY` · `PG_SECRET_KEY`
(리포 루트 `.env.example` · 값은 루트 `.env`). 키 없으면 `PaymentGateway` Mock만 쓴다.

### Discord

조준영(contracts-payments)입니다. 8/26 Toss sandbox 키 요청이 아직 미수신입니다. Increment 1 Mock은 통과했고, 오기 전엔 Mock만 유지합니다. (1) `PG_CLIENT_KEY` · `PG_SECRET_KEY`로 줄 수 있는지. (2) 전달은 채팅 평문 금지, 루트 `.env`만. (3) sandbox 승인·취소가 켜져 있는지. (4) 위젯 클라이언트 키와 서버 시크릿이 구분되는지. 전문은 `features/contracts-payments/review/teamlead-pg-sandbox-keys.md`.

---

## 2. 단독 공개 14일 — 팀장

PRD·ERD에 대기 기간이 없다. 첫 리뷰 `created_at` 후 **14일**로 구현했다
(`SOLO_PUBLIC_AFTER_DAYS`, reviews 규칙 6). UNIQUE·COMPLETED·PATCH 없음은 불변이다.

### Discord

조준영(reviews)입니다. 단독 공개 대기 기간이 PRD에 없어 **14일**로 구현했습니다. 14일 확정인지, 다른 일수인지 알려 주세요. 바꾸면 `features/reviews/prototype/server/review.constants.ts`의 `SOLO_PUBLIC_AFTER_DAYS`와 spec 규칙 6만 고칩니다.

| # | 질문 | 예 | 아니오 | 메모 |
|---|---|---|---|---|
| T1 | 단독 공개 14일로 확정하는가 | | | 아니면 일수 |
| T2 | 바꾸면 규칙 6·상수만 고치면 되는가 | | | |

---

## 3. `REVIEW_CREATED` — 오민혁 (user-management)

조준영은 `users.rating_average` · `users.review_count`를 UPDATE하지 않는다.
공개 시점에만 1회 발행한다. 미공개 INSERT에는 안 보낸다. 양쪽이 모이면 즉시 2건.

```ts
type ReviewCreatedEvent = {
  reviewId: string;
  projectId: string;
  revieweeId: string;
  rating: number;
  publishedAt: string;
};
```

포트: `features/reviews/prototype/server/review-event.port.ts`.
검증: `npx tsx features/reviews/prototype/run.tsx`.

### Discord

조준영(reviews)입니다. `REVIEW_CREATED`를 **공개 시점**에만 발행합니다. 페이로드는 `reviewId` · `projectId` · `revieweeId` · `rating` · `publishedAt`. users 캐시 UPDATE는 오민혁입니다. 예/아니오는 `features/contracts-payments/review/external-wait-2026-08-31.md` §3.

| # | 질문 | 예 | 아니오 | 메모 |
|---|---|---|---|---|
| M1 | 공개 시점에만 소비하는가. 미공개 INSERT는 무시 | | | |
| M2 | 같은 `reviewId`는 멱등. 캐시를 두 번 올리지 않음 | | | |
| M3 | 위 5필드로 `rating_average`·`review_count` 갱신이 충분한가 | | | |
| M4 | 평균은 공개분 산술평균인가 | | | |

---

## 4. 알림 4종 — 최윤석 (notifications)

알림은 최윤석이 만든다 (PRD §5.6). 조준영은 `NotificationTriggerPort`로 **발행만** 한다.
실패해도 결제·납품·완료는 되돌리지 않는다. 납품 2종은 시그니처만, 에스크로 이후 호출.
계약 정본: [yoonseok-ports-contract.md](yoonseok-ports-contract.md).

| type | 제안 시점 | 수신 | 이번 Increment |
|---|---|---|---|
| `PAYMENT_COMPLETED` | `payments.status → PAID` | 프리랜서 | 포트 발행 / 발송 대기 |
| `DELIVERY_REQUESTED` | `delivery_status → DELIVERY_REQUESTED` | 의뢰인 | 납품 미구현 |
| `DELIVERY_APPROVED` | `delivery_status → APPROVED` | 프리랜서 | 납품 미구현 |
| `REVIEW_REQUESTED` | `transactionStatus → COMPLETED` 직후 양쪽 | 당사자 | 포트 발행 / 발송 대기 |

`REVIEW_REQUESTED`는 **작성 가능 시점**이다. 리뷰 공개·`REVIEW_CREATED`와 다르다.

### Discord

조준영입니다. 알림 4종은 최윤석이 발송합니다. 조준영은 `publishPaymentCompleted` · `publishReviewRequested`를 Mock에서 발행하고, 납품 2종은 시그니처만 둡니다. 맞출 계약은 `features/contracts-payments/review/yoonseok-ports-contract.md`. 포트 throw여도 `PAID`·`COMPLETED`는 유지합니다.

| # | 질문 | 예 | 아니오 | 메모 |
|---|---|---|---|---|
| Y1 | `PAYMENT_COMPLETED` = `PAID` 직후, 수신 프리랜서 | | | |
| Y2 | `DELIVERY_REQUESTED` / `DELIVERY_APPROVED` = 납품 상태 전이 직후 | | | 스프린트는 이후 |
| Y3 | `REVIEW_REQUESTED` = `COMPLETED` 직후 양쪽 1회. 공개 시점이 아님 | | | |
| Y4 | 조준영 `publish*`, 최윤석 `create*Notification` | | | 함수명 |
| Y5 | 알림 실패는 결제·완료를 되돌리지 않는가 | | | PRD 확정 |

---

## 수신 후

1. 키 → 루트 `.env`만. `run.tsx` sandbox 실호출. 위젯은 그 다음.
2. 14일 변경 → `SOLO_PUBLIC_AFTER_DAYS` + reviews 규칙 6.
3. 오민혁 회신 → 페이로드 부족분만 규칙 6에 추가. users UPDATE는 여전히 안 한다.
4. 최윤석 회신 → 함수명만 spec에 한 줄. 포트는 설계 완료. 발송 코드는 최윤석.
