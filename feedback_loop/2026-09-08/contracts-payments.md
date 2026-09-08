# contracts-payments 피드백 — 2026-09-08 통합

반영 커밋(prototype 기준): #80 (조준영, `public-api.mock.ts`)
sync-log.md 기록: 없음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — deliveries 컬럼 7종 + invalidations 테이블 신설 (E-47·E-48) — 확인 요청

상태: 미확인

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
- {검토 후 자유 기재}

---

## 항목 2 — PrismaContractsPaymentsRepository 작성 중 발견한 스키마-도메인 간극 3건 — 확인 요청

상태: 미확인

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
- {검토 후 자유 기재. 특히 2번(platformFeeRateBps)은 정산 요율이 향후 결제마다
  달라질 계획이 있다면 스키마에 컬럼을 추가하는 편이 안전합니다.}

---
