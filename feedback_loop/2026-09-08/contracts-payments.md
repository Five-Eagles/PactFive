# contracts-payments 피드백 — 2026-09-08 통합

반영 커밋(prototype 기준): #80 (조준영, `public-api.mock.ts`)
sync-log.md 기록: 없음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — deliveries 컬럼 7종 + invalidations 테이블 신설 (E-47·E-48) — 확인 요청

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- `deliveries`에 `version`·`object_key`·`file_name`·`mime_type`·`size_bytes` 5개 컬럼을
  추가했다. 이 5개는 원본(`features/contracts-payments/prototype/mock/public-api.mock.ts`의
  `DeliveryRow`)에 이미 있던 값을 그대로 옮긴 것이다.
- `invalidations` 테이블을 신설했다. 취소 시 계약 무효화 결과(`contractInvalidation`) 개념
  자체는 원본 mock에 있었다.

**어떻게 채웠는지**
- ERD: `docs/domain/reference/erd-v1.4.dbml`의 `deliveries` 테이블에 컬럼 7종 추가,
  `invalidations` 테이블 신설(E-47·E-48). `docs/domain/erd.md`에도 동일 반영.
- 스키마: `app/server/prisma/schema.prisma`의 `Delivery` 모델에 컬럼 7종 추가, `Invalidation`
  모델 신설(PRISMA-GAP-17).

**왜 그렇게 채웠는지 (근거) — 확인 필요한 부분**
- **팀장이 원본 없이 추가한 부분**: `deliveries.file_sha256`(업로드 파일 무결성 해시)과
  `deliveries.requested_by`(납품 요청자) 2개 컬럼은 원본 mock에 없던 필드다. spec.md 규칙
  23(파일 무결성 관련)을 근거로 팀장이 추가했다.
- **팀장이 구조를 새로 설계한 부분**: `invalidations`를 "별도 영속 테이블"로 만든 것 자체가
  팀장 판단이다. 원본엔 결과값 개념만 있었지, 테이블로 분리해 이력을 남기는 설계는 없었다.
  spec.md 규칙 25(취소 시 GET으로 마지막 무효화 결과 조회)를 근거로 삼았다.
- 위 두 가지는 다른 3개 기능(reviews·applications·project-management)의 이번 반영분과 달리
  "원본 그대로"가 아니라 팀장의 해석이 섞여 있다. 사용자(팀장 본인)가 이미 "그대로 진행 +
  담당자에 사후 공유"로 승인해 반영은 완료했지만, 실제 설계자인 조준영님이 보기에 필드명·
  범위가 이상하면 언제든 바꿀 수 있다 — 이미 배포된 마이그레이션이 아니라 아직 로컬에서
  `prisma migrate dev`도 실행 전인 초안 단계다.

**담당자 메모**
- 조준영 2026-09-09 — **두 컬럼 다 맞습니다. 원본 없이 추가한 것이 아니라 제가 제안해 둔
  것입니다.** `features/contracts-payments/spec.md` 규칙 23 마지막 줄이 그대로 적혀 있습니다:
  「ERD 제안: `fileObjectKey`·`fileSha256`·`version`·`requestedBy`(팀장 반영)」. `sha256`은
  같은 규칙의 `upload-prepare` 본문 `{ fileName, contentType, size, sha256 }`에도 있습니다 —
  클라이언트가 보낸 해시를 받아만 두고 저장할 자리가 없던 것이 문제였습니다. 필드명도
  그대로 좋습니다.
- `requested_by`도 필요합니다. 규칙 23은 「프리랜서 1회 요청 → 의뢰인 명시적 승인」인데,
  승인자만 알 수 있고 요청자를 모르면 계약 당사자가 아닌 사람이 올린 납품을 사후에 가릴 수
  없습니다. 실AV·실저장소가 스텁인 지금은 감사 기록이 유일한 방어선입니다.
- **`invalidations` 별도 테이블도 동의합니다.** 규칙 25가 GET `postActions.contractInvalidation`을
  `DONE`/`NOT_NEEDED`/`FAILED` 3상태로 내려주게 정해 뒀고, `FAILED`는 "취소 실패가 아니라
  202 후처리"입니다. 결과값만 들고 있으면 재조회 때 `FAILED`를 되살릴 수 없어 화면이 무엇을
  기다리는지 못 보여 줍니다. 이력으로 남기는 쪽이 규칙 25에 맞습니다.
- 멱등 키는 확인해 봤고 문제 없습니다. `cancellation_id`가 PK라 유니크가 걸립니다.
  `cancellationEventId`는 설계서 v2.0 별칭이고 Mock이 `input.cancellationId ?? input
  .cancellationEventId`로 **하나로 정규화**하므로(`public-api.mock.ts:108`) 컬럼을 따로 둘
  필요가 없습니다.
- 다만 이 테이블만으로는 규칙 25의 **「다른 본문 409」를 판정할 수 없습니다.** Mock은
  `invalidateIdempotency`에 `{ bodyHash, response }`를 함께 저장해 같은 키·다른 본문을
  409로 막습니다(`public-api.mock.ts:1248·1284`). `invalidations`에는 `contract_invalidation`
  결과만 있어서, 같은 `cancellationId`로 다른 본문이 오면 통과시킵니다. 아래 항목 2의
  3번(범용 멱등 캐시)과 같은 뿌리라 CR-CP-002에 함께 넣었습니다.

---

## 항목 2 — PrismaContractsPaymentsRepository 작성 중 발견한 스키마-도메인 간극 3건 — 확인 요청

상태: 반영완료

**배경**
같은 날(2026-09-08) 뒤이어, 6기능 Prisma 이식 트랙의 마지막 순서로
`ContractsPaymentsRepository`(`in-memory-contracts-payments.repository.ts`)를 Prisma 구현
(`prisma-contracts-payments.repository.ts`)으로 옮겼다. 인터페이스를 Promise 반환으로
바꾸고 `public-api.service.ts` 호출부에 await를 추가하는 기계적 작업 자체는 이미 완료해
커밋했다(신규 스키마 변경 없음, 코드만). 그 과정에서 도메인 타입과 오늘 오전에 반영한
schema.prisma(E-47·E-48, 위 항목 1) 사이에 3가지가 안 맞았다 — 스키마를 또 건드리지 않고
리포지토리 안에서 흡수했지만, 실제 설계자 확인이 필요하다.

**Fact — 코드로 흡수한 간극 3건**
1. `Payment.clientId`/`freelancerId`는 schema에서 NOT NULL이지만, 도메인 `PaymentRow`
   (원본 mock 그대로)는 이 두 필드를 갖지 않는다. `savePayment`가 최초 삽입 시 `contractId`로
   `Contract`를 찾아 `clientId`/`freelancerId`를 채워 넣는다 — Contract에 이미 있는 값이라
   중복 저장이지만, NOT NULL을 만족시키려면 이 방법뿐이었다.
2. `PaymentRow.platformFeeRateBps`는 저장 컬럼이 없다(schema는 `platformFeeAmount`만
   저장). `settlement-fee.ts` 주석은 "과거 결제는 요율이 바뀌어도 다시 나누지 않는다"라고
   못박아 두는데, 그 스냅샷을 저장할 컬럼이 없다는 뜻이다. 지금은 `platformFeeAmount`÷
   `paymentAmount`로 역산한다 — 시스템 전체가 고정 요율 하나(`platformFeeRate = 0.1`
   기본값)만 쓰는 지금은 정확히 맞지만, 결제마다 요율이 달라지는 기능이 생기면 이 역산은
   틀린다.
3. `getIdempotent`/`setIdempotent`(합의·서명·납품·취소 등 서로 다른 응답 모양을 담는 범용
   멱등 캐시)는 대응하는 Prisma 모델이 없다. `PrismaContractsPaymentsRepository` 안에
   in-memory Map으로만 남겨뒀다 — 서버가 재시작하면 멱등 캐시가 비어 같은 요청이 재처리될
   수 있다(단, CAS·유니크 제약으로 데이터 자체의 정합성은 깨지지 않는다. ai-pricing의
   `ProjectBudgetApplicationAdapter`가 이미 같은 성격의 gap을 안고 있다).

**왜 스키마를 또 안 건드렸는지**
오늘 오전(항목 1)에 이미 팀장 해석이 섞인 스키마 변경을 한 차례 반영했다. 같은 날 또
스키마를 확장하는 것은 "근거→비교→결정" 없이 반복하는 것이라 판단해, 이번엔 리포지토리
코드 안에서 흡수 가능한 만큼만 흡수하고 나머지는 알려진 gap으로 남겼다.

**담당자 메모**
- 조준영 2026-09-09 — 세 건 다 확인했습니다. **1번은 그대로 두고, 2번은 컬럼을 추가해야
  하며, 3번은 알려진 gap으로 남기는 데 동의합니다.** 스키마 변경분은 `CR-CP-002`로
  올렸습니다 (`features/contracts-payments/change-requests/0002-payment-fee-snapshot-columns.md`).

**1번 (`Payment.clientId`/`freelancerId` 중복 저장) — 지금 방식 유지**

`Contract`에서 찾아 채우는 방식이 맞습니다. 계약당 결제 1행이고 당사자는 계약이 정본이라
값이 갈라질 수 없습니다. 스키마의 `@@index([freelancerId, releasedAt])`가 프리랜서별 정산
조회용인데, 이 인덱스를 쓰려면 `payments`에 컬럼이 있어야 합니다 — join으로 바꾸면 정산
목록이 느려집니다. 도메인 `PaymentRow`에 두 필드를 늘리는 건 반대합니다. 화면·API가 쓰지
않는 값이라 응답 모양만 커집니다.

**2번 (`platformFeeRateBps` 역산) — 컬럼을 추가해야 합니다. 미래 대비가 아니라 지금 규칙 위반입니다**

- spec 규칙 24가 「수수료 `floor(paymentAmount × 1000 / 10000)`, **결제 생성 시 스냅샷**」이라고
  못박아 뒀습니다. 스냅샷을 저장하라는 규칙인데 저장할 컬럼이 없습니다.
- 요율이 바뀔 계획은 **이미 코드에 있습니다.** `payment-record.mock.ts`에
  `setFeePolicyVersion`·`feePolicyVersion`이 있고, `run.tsx`의 「규칙 24: 정책 변경 뒤 스냅샷
  불변」이 정책을 `fee-policy-v2`로 바꿔도 금액이 안 변하는지 검증합니다. 가상의 미래가
  아니라 통과 중인 테스트입니다.
- `fee_policy_version` 컬럼도 없습니다. 요율만 저장해도 **어느 정책으로 계산했는지** 남지
  않아서, 정책을 바꾼 뒤 과거 정산을 감사할 수 없습니다. 두 컬럼은 같이 가야 합니다.
- `pg_cost_amount`도 없습니다(`setPgCostAmount`, 규칙 24 「PG 비용은 정산액에서 빼지 않는다」).
  빼지 않더라도 얼마 나갔는지는 기록해야 정산 원장이 맞습니다.
- 역산 자체도 원리적으로 되돌릴 수 없는 계산입니다. `platformFeeAmount`가 버림이라 나머지가
  버려집니다. 결제 금액이 1만 원 이상이면 `Math.round`가 오차를 덮어 지금은 맞지만,
  **맞는 게 우연이지 보장이 아닙니다.** 요율이 1000이 아니게 되는 순간 조용히 틀립니다.

**3번 (범용 멱등 캐시가 in-memory Map) — gap 유지에 동의. 다만 범위를 좁혀 주세요**

서버 재시작 시 멱등 캐시가 비는 것은 받아들일 수 있습니다. 판단 근거는 규칙 25·23의 멱등이
**CAS·유니크 제약으로 데이터 정합성은 지켜지고**, 캐시가 비면 재처리가 일어나도 결과가
같기 때문입니다(`alreadyProcessed` 표시만 잘못 나갑니다).

다만 한 가지는 정합성 문제입니다 — **같은 키·다른 본문 409**(규칙 23·25)는 캐시가 비면
판정할 수 없습니다. 재시작 뒤에 다른 본문으로 같은 키가 오면 막지 못하고 통과합니다.
`bodyHash`만 남기는 작은 테이블이면 충분해서 CR-CP-002에 함께 넣었습니다.

---
