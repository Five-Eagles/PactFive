# contracts-payments — SPEC

이번 세션 범위는 **계약 연동 함수 4개의 호출 계약**이다. 화면·PG·서명 UI는 포함하지 않는다.
정본: PRD v6.4 §5.4 · ERD v1.4. 함수명으로만 지칭한다 (D-48). `C-nn`은 목차 번호다.
경로·필드 확정: 유동우 회신 `review/yudong-function-defs-reply.md` (2026-08-25).

## 목적

조준영(contracts-payments)이 유동우(project-management)에게 넘기는 상태 전이 호출을,
유동우·최윤석이 **추가 설명 없이 Mock으로 구현·호출**할 수 있게 고정한다.
출발점은 `startProjectTransaction`이다. 최윤석의 지원 수락(`acceptProjectApplication`) 이후
프로젝트·계약 흐름이 여기서 시작된다.

## 범위

- 포함: 아래 4함수의 호출 주체·시점, 입력, 반환, 전후 상태, 오류 코드, 중복 호출.
  호출 전 조회 `getProjectNegotiationContext`는 4함수의 전제라서 같이 적는다.
- 제외: 금액 합의·서명·PG·납품·정산·리뷰 화면, `acceptProjectApplication` 구현,
  `rejectPendingApplications`/`invalidateAgreementAndContract` 시그니처 확정,
  `projects` 테이블 직접 UPDATE.

## 관련 엔티티 (근거: `docs/domain/erd.md`)

호출자가 읽고 쓰는 것은 조준영 테이블이다: `agreements.status`, `negotiation_offer`,
`contracts.status`, `payments.status`, `deliveries.status`.
호출 대상은 유동우 테이블 `projects`의 `recruitment_status`, `transaction_status`,
`payment_pending_at`, `project_version`, `canceled_at`, `deleted_at`,
`recruitment_deadline_at`, `pending_application_count`, `accepted_application_id`다.

저장 enum 정본: `recruitment_status` = `SCHEDULED` · `OPEN` · `CLOSED`.
`project_transaction_status` = `NONE` · `CONTRACT_PENDING` · `IN_PROGRESS` · `COMPLETED` · `CANCELED`.
`contract_status` `SIGNED`, `payment_status` `PAID`/`RELEASED`, `delivery_status` `APPROVED`.

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
     멱등 키: `negotiation-reject-{negotiationId}`. §5.7의 `agreementId` 표기는 D-55로 폐기.
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
FACT다. 교차 담당 확인 대기는 없다.

추가 제안 2건 — **조준영 동의.**
1. `CONTRACT_PENDING` ⇒ `accepted_application_id` 존재. 유동우가 PRD 다음 개정에서 불변식으로
   올린다. 그 전까지 S3의 409가 방어다.
2. I-30 테스트는 **이 기능 `prototype/run.tsx`**에 둔다. 두 조건이 충족되기 전에는
   `completeProjectTransaction`을 호출하지 않는지 확인한다.
