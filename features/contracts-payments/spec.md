# contracts-payments — SPEC

이번 세션 범위는 **합의·서명·결제 설계 확정**이다. 다음 스프린트에서 구현한다.
규칙 1~9(4함수·PG 포트)는 FACT다. 정본: PRD v6.4 · ERD v1.4 · `review/spec-design-eval.md`.
함수명으로만 지칭한다 (D-48). `C-nn`은 목차 번호다.

## 목적

조준영 도메인(합의·계약·서명·결제)의 상태·API·화면 계약을 고정한다.
유동우 4함수 호출 계약은 규칙 1~8, PG 승인은 규칙 9다.

## 범위

- 포함: 4함수 호출 계약, `PaymentGateway.confirmPayment`, 금액 합의·계약 서명·샌드박스 결제
  설계(상태·API·라우트·UX·Increment 1 테스트 목록).
- 제외: 위젯 구현, 에스크로·지급대행·실정산, PG 환불, 납품·리뷰, `acceptProjectApplication` 구현,
  `projects` 테이블 직접 UPDATE. 제안 철회는 Increment 1 제외.

## 관련 엔티티 (근거: `docs/domain/erd.md`)

조준영: `agreements`, `negotiation_offer`, `contracts`, `contract_signature_audits`, `payments`.
유동우: `projects`의 `recruitment_status`, `transaction_status`, `payment_pending_at`,
`project_version`, `canceled_at`, `deleted_at`, `recruitment_deadline_at`,
`pending_application_count`, `accepted_application_id`.

저장 enum: `agreement_status` = `PROPOSED` · `ACCEPTED` · `REJECTED`.
`contract_status` = `DRAFT` · `SIGNING` · `SIGNED` · `CANCELED`.
`payment_status` = `READY` · `PENDING` · `PAID` · `FAILED` · `RELEASED` (`REFUNDED`는 MVP 미구현).
`project_transaction_status` = `NONE` · `CONTRACT_PENDING` · `IN_PROGRESS` · `COMPLETED` · `CANCELED`.

## 규칙

번호는 이후 `api-contract.md`·`prototype/`에서 "규칙 N"으로 참조한다.

1. **공통 봉투는 4함수에 동일하다** (D-54). 요청: `requestId`, `idempotencyKey`, `occurredAt`.
   `expectedProjectVersion`은 **`start`와 `complete`만 필수**, restore·`markPaymentPending`은 선택
   (유동우 규칙 51, J3). 응답: `alreadyProcessed`, `processedAt`, `changed`, `projectVersion`.
   `changed`/`alreadyProcessed` 조합은 PRD §5.4 표 그대로다.
   `expectedProjectVersion`을 넣었는데 현재 버전과 다르면 `409 PROJECT_VERSION_CONFLICT`.
   `projectVersion`은 **거래/모집 상태 전이 성공 시에만 +1** (ERD E-23).
   `markPaymentPending`은 상태를 안 바꾸므로 **버전을 올리지 않는다** (FACT, 유동우 예).
   경로는 `/internal/v1/projects/:projectId/...` 만. 서버 간 토큰. 브라우저·사용자 토큰 거부 (J1).
   Mock 고정값은 `MOCK_INTERNAL_SERVICE_TOKEN`. 공개 입구는 `prototype/index.ts`. 불일치면 422.

2. **`startProjectTransaction`·`completeProjectTransaction` 호출 전에** 조준영은
   `getProjectNegotiationContext`로 프로젝트가 살아 있는지 확인한다 (D-44). 확인 없이 부르면
   취소된 프로젝트에 결제가 걸릴 수 있다. 그 확인 지점이 규칙 6 `markPaymentPending`이다.
   start 전 조회에서 `acceptedApplicationId`가 계약의 지원서와 같은지 **호출자가 대조**한다.
   요청 본문에는 `acceptedApplicationId`를 넣지 않는다 — 정본은 `projects.accepted_application_id`
   (D-41, S2).

3. **`startProjectTransaction`** — 가장 먼저 확정하는 함수.

   - **호출 주체·시점:** 조준영 서버만 → 유동우. 계약 `SIGNED` **그리고** 결제 `PAID`가 **둘 다**
     된 직후 1회. 선행: 최윤석 `acceptProjectApplication` 성공 → `CONTRACT_PENDING`.
   - **Given:** 프로젝트 존재, `deletedAt = null`, `transactionStatus = CONTRACT_PENDING`,
     `canceledAt = null`, `acceptedApplicationId` 존재. 호출자 도메인에서 계약 `SIGNED` ∧ 결제 `PAID`.
   - **When:** `startProjectTransaction(projectId, envelope)` 호출.
   - **Then:** `transactionStatus = IN_PROGRESS`, `recruitmentStatus`는 `CLOSED` 유지,
     `projectVersion +1`, `changed: true`, `alreadyProcessed: false`.
   - **입력:** `projectId` + 규칙 1 봉투. 멱등 키 `transaction-start-{contractId}` (FACT).
     `acceptedApplicationId`는 본문에 없음.
   - **반환:** 봉투 + `projectId`, `recruitmentStatus`, `transactionStatus`.
   - **실행 전 허용:** `transactionStatus = CONTRACT_PENDING`. 그 외는 실패. 단 아래 중복 호출 예외.
     `CONTRACT_PENDING`인데 `acceptedApplicationId`가 null이면 **무결성 위반**으로
     `409 PROJECT_TRANSITION_CONFLICT` (전용 코드 없음, D-31). 정상 경로에서는 수락이 두 값을
     같은 트랜잭션에서 쓴다 (S3).
   - **실행 후:** `IN_PROGRESS` (모집은 `CLOSED` 유지, I-04).
   - **오류:** `404 PROJECT_NOT_FOUND` (없음·삭제). `409 PROJECT_TRANSITION_CONFLICT`
     (`CONTRACT_PENDING`이 아님, 포함 `CANCELED` — 화면은 "프로젝트가 취소되었습니다").
     `409 PROJECT_VERSION_CONFLICT`. `422 VALIDATION_ERROR` (필수 필드 누락).
   - **중복 호출:** 이미 `IN_PROGRESS`면 **200 성공** (`changed: false`, `alreadyProcessed: true`).
     `CANCELED`면 재시도도 **409**. 판정 순서: 존재 → 같은 멱등 키 기존 결과 → 이미
     `IN_PROGRESS` → `CANCELED`/그 외 상태 → 버전 → 전이. 순서 반대면 정상 재시도가 409가 된다.

4. **`completeProjectTransaction`**

   - **호출 주체·시점:** 조준영 서버만 → 유동우. 납품 `APPROVED` **그리고** 정산 `RELEASED`가
     둘 다 된 직후. 성공해야 리뷰가 열린다. 호출 전 규칙 2 조회 의무.
   - **입력:** `projectId` + 규칙 1 봉투. 멱등 키 `transaction-complete-{contractId}` (FACT).
   - **반환:** 봉투 + `projectId`, `recruitmentStatus`, `transactionStatus`.
   - **실행 전 허용:** `transactionStatus = IN_PROGRESS`. 유동우는 납품·정산 테이블을 **읽지 않는다**
     (C1). I-30(`COMPLETED`는 `APPROVED` ∧ `RELEASED`)은 **호출자가 호출 전에 지킨다.**
     project-management `run.tsx`는 `IN_PROGRESS`가 아니면 거부까지만 확인한다.
   - **실행 후:** `COMPLETED` (모집 `CLOSED` 유지).
   - **오류:** `404 PROJECT_NOT_FOUND`. `409 PROJECT_TRANSITION_CONFLICT` (`IN_PROGRESS`가
     아님, 포함 `CANCELED` — D-30). `409 PROJECT_VERSION_CONFLICT`. `422 VALIDATION_ERROR`.
     호출자가 409를 받으면 상태를 다시 읽어 이미 `COMPLETED`면 성공으로 치고, 아니면 오류 보고한다.
   - **중복 호출:** 이미 `COMPLETED`면 **200 성공**. `CANCELED`면 **409**. 판정 순서: 존재 →
     멱등 키 → 이미 `COMPLETED` → `CANCELED`/그 외 → 버전 → 전이.

5. **`restorePreContractProject`**

   - **호출 주체·시점:** 조준영 → 유동우. **최신 제안 수신자의 최종 거절만.** 재제안·제안 철회·
     프로젝트 취소 때는 부르지 않는다. 이 함수는 합의 `REJECTED`·계약 `CANCELED`를 **대신하지 않는다**
     (조준영 테이블). `invalidateAgreementAndContract`(유동우→조준영, 프로젝트 취소)와 **반대 방향·
     다른 사건**이다. 두 경로는 겹치지 않는다 (R2·R3).
   - **입력 (D-42·D-55):** `projectId`, `negotiationId`(필수, 멱등 판정 기준), `offerId`(선택,
     감사), `actorUserId`, `reason`(`FREELANCER_REJECTED` \| `CLIENT_REJECTED`) + 규칙 1 봉투.
     **`negotiationId`는 `agreements.id`와 같다** (I-15 스레드. 새 테이블·`ngt_` 접두어 없음).
     `offerId`는 거절한 round. 멱등 키: `negotiation-reject-{agreements.id}`.
     §5.7의 `agreementId` 표기는 D-55로 폐기(필드명만 `negotiationId`).
   - **반환:** 봉투 + `projectId`, `negotiationId`, `recruitmentStatus`, `transactionStatus`,
     `reopened`, `notReopenedReason` (`null` \| `DEADLINE_PASSED` \| `PENDING_APPLICATIONS_REMAIN`,
     J2), `restoredFields`. `restoredFields`는 항상 `["recruitmentStatus", "transactionStatus"]`다.
     `recruitment_start_at`은 **건드리지 않는다.** 그 값을 새로 찍는 것은 A-13 재모집뿐이다 (D-85).
     계약·합의 금액은 `projects`에 없으므로 되돌리지 않는다. 협상 중 수정된 제목·설명·첨부는 보존한다.
   - **실행 전 허용:** `transactionStatus = CONTRACT_PENDING`.
   - **실행 후:** `transactionStatus → NONE`. 마감일 > 서버 시각 **그리고**
     `pendingApplicationCount = 0`이면 `recruitmentStatus → OPEN`, `reopened: true`,
     `notReopenedReason: null`. 마감일이 지났으면 `CLOSED` 유지, `reopened: false`,
     `notReopenedReason: DEADLINE_PASSED`. 대기 지원이 남아 있으면 `OPEN` 전환을 보류하고
     `CLOSED`+`reopened: false`+`notReopenedReason: PENDING_APPLICATIONS_REMAIN`으로 200을 주며,
     유동우가 최윤석에게 `rejectPendingApplications`를 재요청한다 (D-43). 이미 자동 거절된
     지원자는 복구하지 않는다 (`CONFIRMED`, R4).
   - **오류:** `404 PROJECT_NOT_FOUND`. `409 PROJECT_TRANSITION_CONFLICT` (`CONTRACT_PENDING`
     아님, 포함 `CANCELED`). `409 PROJECT_ALREADY_RESTORED` (다른 `negotiationId`로 이미 복원).
     `409 PROJECT_VERSION_CONFLICT`. `422 VALIDATION_ERROR`.
   - **중복 호출:** 같은 `negotiationId`면 **200**, 최초 결과 그대로. 다른 `negotiationId`면
     **409 `PROJECT_ALREADY_RESTORED`**. 판정 순서: 존재 → 같은 `negotiationId` → 다른
     협상으로 이미 복원 → `CANCELED`/그 외 상태 → 버전 → 복원. C-01과 같이 "같은 대상인가"를
     상태보다 먼저 본다.

6. **`markPaymentPending`** (D-40, 조준영 수용)

   - **호출 주체·시점:** 조준영 서버만 → 유동우. **PG 결제 요청을 보내기 직전 필수.** 취소 차단은
     부수 효과다. 본래 목적은 결제 시작 전에 프로젝트가 살아 있는지 한 번 확인하는 것이다.
   - **입력:** `projectId` + `contractId`(본문 필수, P3) + 규칙 1 봉투.
     멱등 키: `payment-pending-{contractId}`. 키에서 `contractId`를 **파싱하지 않는다.**
     멱등 키는 같은 요청인지 판별만 한다 (P2 기각).
   - **반환:** 봉투 + `projectId`, `transactionStatus`, `paymentPendingAt`.
   - **실행 전 허용:** `transactionStatus = CONTRACT_PENDING`, `canceledAt = null`.
   - **실행 후:** `paymentPendingAt`에 시각 기록. **거래/모집 상태는 바꾸지 않는다.**
     따라서 `projectVersion`도 **올리지 않는다.** 이후 취소 API는 `paymentPendingAt`이 있으면
     `409 PROJECT_CANCEL_AFTER_PAYMENT`로 거부한다 (D-40).
   - **오류:** `404 PROJECT_NOT_FOUND`. `409 PROJECT_TRANSITION_CONFLICT`
     (`CONTRACT_PENDING` 아님 또는 `CANCELED` — 결제를 시작하면 안 됨).
     `409 PROJECT_VERSION_CONFLICT`. `422 VALIDATION_ERROR`.
   - **중복 호출:** 이미 `paymentPendingAt`이 있으면 **200 성공**, **시각은 최초값 유지** (P4).
     재호출로 시각을 갱신하면 취소 차단 경계가 뒤로 밀린다. `CANCELED`면 **409**.

7. **호출 순서 (해피패스).** 최윤석 `acceptProjectApplication` 성공 → 나머지 PENDING 거절 →
   알림 → 조준영 금액합의·서명 → `markPaymentPending` → PG → `SIGNED`∧`PAID` →
   `startProjectTransaction` → 작업·납품 → `APPROVED`∧`RELEASED` →
   `completeProjectTransaction`. 최종 거절 시만 `restorePreContractProject`.
   결제 확정 후 상태 전이가 실패하면 PG를 되돌리지 않고 전이를 재시도한다 (§5.8).
   수락 전에는 `acceptedApplicationId`가 null이며 계약 흐름에 들어가지 않는다. 프로젝트당
   수락 지원은 1건이다 (최윤석 2026-08-26 예).

8. **오류 코드는 PRD §8.3 24종만 쓴다.** 새 코드를 만들지 않는다. HTTP 본문은
   `{ error: { code, message, details } }`. `CANCELED`와 "상태 불일치"는 같은
   `PROJECT_TRANSITION_CONFLICT`다. 화면 분기가 필요하면 409 후 `getProjectNegotiationContext`를
   다시 읽는다. `PROJECT_ALREADY_CANCELED`는 제거된 코드다 (D-31).

9. **결제 승인은 `PaymentGateway.confirmPayment`만 통한다** (ADR-0009). 서비스는 토스 SDK를
   직접 import하지 않는다. 입력: `orderId`, `amount`, `paymentKey`. 성공 시 `status: PAID`.
   Mock은 `pay_mock_ok` + 금액 100000만 성공하고, 아니면 `PAYMENT_AMOUNT_MISMATCH`다.
   실제 sandbox는 리포 루트 `.env`의 `PG_SECRET_KEY`가 있을 때만 어댑터를 만든다. 없으면 Mock.
   키 없이 `createTossPaymentsAdapter()`를 부르면 `PgKeyMissingError` (`field: PG_SECRET_KEY`).
   키 이름: `PG_CLIENT_KEY`(위젯), `PG_SECRET_KEY`(서버, `VITE_` 금지). 값은 루트 `.env`만.
   깃에 넣지 않는다. 프론트는 시크릿을 읽지 않고, 키 없음은 `view="keyMissing"`이다.

10. **금액 합의는 다회차 도메인이다.** `negotiation_offer.round`가 라운드다. 활성 제안은 최신
    round 1건. 저장 enum은 `PROPOSED`·`ACCEPTED`·`REJECTED`만 (D-81). 2차 설계서 `PENDING`은
    `PROPOSED`, `SUPERSEDED`는 이전 round다. 제안 철회는 Increment 1에서 하지 않는다.
    Increment 1 화면: 의뢰인 최초 제안 → 프리랜서 수락 또는 최종 거절 (프론트 AGR-01).
    최초 `proposeNegotiationOffer`는 해당 `application_id`에 `agreements`가 없으면 1건을 만든다.
    `application_id` = 수락 지원서, `proposed_by_user_id` = 제안자(Increment 1은 의뢰인),
    `agreed_amount` = 이번 offer `offered_amount` (`PROPOSED`여도 NOT NULL), `status` =
    `PROPOSED`, `responded_at` = null. 이어서 offer round 1. Increment 1은 지원서당 합의 1건
    (I-15). 수락·거절 시 `responded_at`을 찍고 거절 offer에는 `rejected_reason`을 남긴다.
    재제안 API는 계약에 두되 Increment 1 테스트 범위 밖이다. 진입은 규칙 7과 같다
    (`CONTRACT_PENDING` + 수락 지원 1건).

11. **수락은 합의 확정과 계약 `DRAFT` 생성을 한 트랜잭션에서 한다.** `acceptNegotiationOffer`.
    최신 round의 수신자만. 성공 후 `agreements.status = ACCEPTED`, `contracts.status = DRAFT`.
    프론트 `CREATED`/`READY`는 `DRAFT`의 화면 별칭이며 API에 쓰지 않는다. 최종 거절은
    `agreements`·최신 offer를 `REJECTED`로 바꾼 뒤 규칙 5 `restorePreContractProject`만.
    필드 복사는 규칙 20.

12. **계약 상태.** `DRAFT` → 첫 서명 성공 시 `SIGNING` → 양쪽 서명 시 `SIGNED`.
    `signed_at`은 양쪽이 채워진 순간에만 찍는다. 무효화·프로젝트 취소 경로는 `CANCELED`.
    전이표는 규칙 19.

13. **`signContract`.** 계약 당사자만. 멱등 키 `contract-sign-{contractId}-{signerId}`.
    같은 계약·같은 서명자 감사는 1건 (I-19). 재호출은 200, `client_signed_at` /
    `freelancer_signed_at`은 **최초값 유지**. `canceledAt`이 있으면 거부 (D-04, PM-45).
    취소 후에도 `contract_signature_audits`는 삭제하지 않는다 (D-11). IP·user-agent는 ERD 컬럼.
    서명 대상은 규칙 20, 순서는 규칙 19.

14. **샌드박스 결제는 승인까지다.** 준비 → 위젯/리다이렉트 → 규칙 9 `confirmPayment` → 웹훅은
    조회 API로 재검증 → `PAID` → 규칙 3 `startProjectTransaction`. 규칙 6은 PG 요청 직전.
    에스크로·지급대행·실정산·PG 환불은 제외. `RELEASED`는 정산 설계서(다음 스프린트).
    「결제 취소」는 계약 취소 설계서의 환불 경로이지 Toss MVP가 아니다.
    전이·FAILED·조회는 규칙 19·21.

15. **프로젝트 취소 경로**는 `invalidateAgreementAndContract`다 (합의 `REJECTED`, 계약
    `CANCELED`, 서명 감사 보존). restore와 반대 방향이다 (규칙 5). `paymentPendingAt`이 있으면
    일반 취소는 `409 PROJECT_CANCEL_AFTER_PAYMENT` (규칙 6).

16. **공개 API 경로 (함수명이 정본).** Increment 1 REST:
    `POST /api/v1/projects/:projectId/negotiation-offers` (`proposeNegotiationOffer`),
    `GET /api/v1/projects/:projectId/negotiation-offers/current`,
    `POST .../negotiation-offers/:offerId/accept` (`acceptNegotiationOffer`),
    `POST .../negotiation-offers/:offerId/reject` (`rejectNegotiationOffer`),
    `GET /api/v1/contracts/:contractId` (규칙 20), `POST /api/v1/contracts/:contractId/sign`,
    `POST /api/v1/payments` (준비), `GET /api/v1/payments/:paymentId` (규칙 21),
    `POST /api/v1/payments/confirm` (규칙 9).
    프론트 설계서 `/agreements` 5종은 **폐기**한다. 내부 4함수는 `/internal/v1/...` (규칙 1).
    무효화 inbound는 `POST /internal/v1/projects/:projectId/invalidate-agreement` (규칙 22).

17. **프론트 라우트 초안.** `/projects/:projectId/agreements` (생성 모드),
    `/projects/:projectId/agreements/:agreementId` (AGR-01 상세),
    `/projects/:projectId/contracts/:contractId` (CTR-01 서명),
    `/projects/:projectId/payments/:paymentId` (체크아웃, `payments.id`).
    Toss `orderId`는 `pg_order_id`이며 화면 경로에 쓰지 않는다.
    UX: 로딩, 빈 생성 모드, `LOAD_FAILED` 재시도, `STALE`/409 후 재조회, 프로젝트 취소 시
    변경 버튼 숨김 (프론트 v2.0). 서명·결제도 같은 패턴. 취소된 프로젝트 서명은
    "프로젝트가 취소되었습니다".

18. **Increment 1 백로그·테스트는 규칙 22.** 재제안·철회·에스크로·환불은 Increment 밖이다.

19. **계약·결제 전이표.** `payments.status`와 규칙 6 `paymentPendingAt`은 다른 칸이다.
    `RELEASED`/`REFUNDED`는 Increment 1 밖.
    계약: `DRAFT` —첫 `signContract`→ `SIGNING` —양쪽→ `SIGNED`(`signed_at`).
    `DRAFT`|`SIGNING`|`SIGNED`(미결제) —`invalidateAgreementAndContract`→ `CANCELED`.
    `PAID` 이후 계약 취소·환불은 제외. 서명 순서는 자유. `CANCELED`에서 서명은 거부.
    결제(계약 `SIGNED` + 규칙 6 이후, I-17 계약당 1행): (없음) —`POST /payments`→ `READY`.
    `payment_amount` = `agreed_amount`, `platform_fee_amount` = `floor(amount × 0.1)`(D-14),
    `settlement_amount` = 차액, `currency` = `KRW`, `pg_provider` = `TOSS_PAYMENTS`.
    `READY` —confirm 수신→ `PENDING` —규칙 9 성공→ `PAID` → 규칙 3.
    `PENDING` —금액 불일치·PG 실패→ `FAILED`(`failed_at`·`failure_code`·`raw_response`).
    `FAILED` —같은 행에 새 `pg_order_id`를 넣고 `READY`로 되돌린다. 옛 `orderId` confirm은 409.
    같은 `pg_order_id`로 confirm 재시도 금지 (I-20).

20. **수락 시 계약 필드.** `acceptNegotiationOffer`가 ERD NOT NULL을 채운다.
    `agreement_id`·`project_id`·`client_id`·`freelancer_id` = 수락 컨텍스트.
    `agreed_amount` = 최신 offer `offered_amount`. `project_title_snapshot` = `projects.title`.
    `work_start_date` = 수락일 UTC date. `work_end_date` = `recruitment_deadline_at`의 date
    (start보다 이르면 start와 같게, CHECK). `terms_snapshot` =
    `{ schemaVersion: 1, amount, currency: "KRW", projectTitle }` (E-18). PDF 없음.
    `status = DRAFT`, 서명 시각 전부 null. 당사자는 `GET /api/v1/contracts/:contractId`의
    `terms_snapshot`을 보고 `signContract`. PDF 생성·대기 없음.

21. **FAILED 재시도·웹훅.** 실패 주문은 재confirm하지 않는다. 재결제는 같은 `paymentId`에
    새 `orderId`(규칙 19, I-17). 토스 웹훅은 브라우저 API가 아니다. 서버가
    `PaymentGateway`로 재조회한 뒤 `payments`를 맞춘다. 포트 `retrievePayment`는 다음
    스프린트에 추가한다(지금은 `confirmPayment`만 FACT).
    화면 폴링: `GET /api/v1/payments/:paymentId` → `READY`|`PENDING`|`PAID`|`FAILED`. 당사자만.
    `PAID`인데 start가 실패하면 PG를 되돌리지 않고 규칙 3을 재시도한다 (규칙 7).

22. **Increment 1 백로그·완료 기준** (구현은 다음 스프린트).
    백로그: 공개 API Mock(규칙 16 + GET contract/payment). `signContract` + 멱등·최초 시각 2.
    `design/` low-fi 3화면(합의·서명·결제, 규칙 17). inbound `invalidateAgreementAndContract`
    (`cancellationId`, `actorUserId`, `reason: PROJECT_CANCELED`, `projectCanceledAt` →
    `DONE`|`NOT_NEEDED`|`FAILED`, D-89). `PaymentGateway.retrievePayment`(규칙 21).
    제외: 위젯 실연동, 에스크로·`RELEASED`, PG 환불, 재제안·철회.
    완료 기준 — 합의 12: 빈 생성 / 의뢰인 제안 / 현재 조회 / 수락→DRAFT / 수락 멱등 /
    거절→restore / 거절 멱등 / 로딩 / `LOAD_FAILED` 재시도 / 409 재조회 / 취소 후 변경 숨김 /
    비당사자 403. 서명 2 + 결제 Mock(규칙 9, 기존) + `FAILED` 후 같은 행 새 `orderId` `READY` 1.
    restore는 규칙 5 기존.

## 크기 기준

같은 엔티티(`projects` 거래 상태)의 생애주기라 한 파일로 유지한다.

## 담당자 확인

**유동우 (구현 제공자) — 2026-08-25 확정.** 19건 중 18건 예. 유일한 아니오(P2)는 P3 채택:
`markPaymentPending` 본문에 `contractId` 필수. J1~J3은 유동우 spec 규칙 49~51. 상세는
`review/yudong-function-defs-reply.md`.

**최윤석 (지원 수락 선행) — 2026-08-26 확정.** A1~A4, B1~B4, 기존 1~3 전부 예
(`review/yoonseok-function-defs-response-final.html`). start·complete·markPaymentPending는
applications 범위 밖. restore 시 기존 `REJECTED`는 되살리지 않음. 대기 지원 잔존 시
`rejectPendingApplications` 재요청을 다시 받음. 재개 후 새 지원은 `PENDING`. 거절 사유는
`PROJECT_CANCELED`와 `AGREEMENT_DECLINED`를 구분.

## 비고

멱등 키·버전 비증가·내부 경로·`notReopenedReason`·start/complete 버전 필수·최윤석 호출 순서는
FACT다. 합의·서명·결제 정본은 `review/spec-design-eval.md` 최적안이다.
sandbox 키·알림 4종은 이번 Increment 밖. 대기 정본은 `review/external-wait-2026-08-31.md`.

추가 제안 2건 — **조준영 동의.**
1. `CONTRACT_PENDING` ⇒ `accepted_application_id` 존재. 유동우가 PRD 다음 개정에서 불변식으로
   올린다. 그 전까지 S3의 409가 방어다.
2. I-30 테스트는 **이 기능 `prototype/run.tsx`**에 둔다. 두 조건이 충족되기 전에는
   `completeProjectTransaction`을 호출하지 않는지 확인한다.
