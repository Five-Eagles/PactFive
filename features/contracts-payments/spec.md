# contracts-payments — SPEC

## 목적

의뢰인(client)과 프리랜서(freelancer)가 지원(application) 이후 금액에 합의하고, 계약을 체결·서명하고,
결제를 확정하고, 납품을 승인해 정산까지 이어지는 흐름을 다룬다.

## 범위

- 포함: 금액 합의(제안→수락/거절, 1회, 재협상 없음), 계약 생성·양측 서명, 결제 확정(PG 연동),
  플랫폼 수수료·정산액 계산, 납품 요청·승인, 계약 취소, project-management 도메인과의 상태 연동
  (`startProjectTransaction`/`completeProjectTransaction`/`restorePreContractProject`/
  `markPaymentPending` 호출)
- 제외: 금액 재협상(카운터 오퍼) — `docs/naming-convention.md` §3 "금액 합의"에 따라 MVP는 1회
  제안→수락/거절만 다룬다. 실제 PG 환불 처리(운영자 수동 처리 수준으로 단순화, RFP §3.6.4).
  리뷰 작성(`reviews`)은 별도 기능(`features/reviews/`)에서 다룬다. `cancelProject`는 의뢰인이
  project-management 도메인에서 직접 호출하는 API이므로 이 기능은 그 호출 자체를 만들지 않고,
  그 결과로 이 도메인이 해야 할 무효화 처리(규칙 10)만 다룬다.

## 관련 엔티티 (근거: `docs/domain/erd.md`)

- `agreements`: `id`, `application_id`, `proposed_by_user_id`, `agreed_amount`, `status`
  (`agreement_status`: `PROPOSED`|`ACCEPTED`|`REJECTED`), `responded_at`, `created_at`, `updated_at`
- `contracts`: `id`, `agreement_id`, `project_id`, `client_id`, `freelancer_id`,
  `project_title_snapshot`, `agreed_amount`, `work_start_date`, `work_end_date`, `terms_snapshot`,
  `status` (`contract_status`: `DRAFT`|`SIGNING`|`SIGNED`|`CANCELED`), `client_signed_at`,
  `freelancer_signed_at`, `signed_at`, `canceled_at`, `created_at`, `updated_at`
- `contract_signature_audits`: `id`, `contract_id`, `signer_id`, `signer_role`, `signed_at`,
  `ip_address`, `user_agent`, `created_at`
- `payments`: `id`, `contract_id`, `client_id`, `freelancer_id`, `currency`, `payment_amount`,
  `platform_fee_amount`, `settlement_amount`, `status` (`payment_status`:
  `READY`|`PENDING`|`PAID`|`FAILED`|`RELEASED`|`REFUNDED`), `pg_provider`, `pg_order_id`,
  `pg_payment_key`, `payment_method`, `raw_response`, `paid_at`, `failed_at`, `released_at`,
  `refunded_at`, `failure_code`, `failure_message`, `created_at`, `updated_at`
- `deliveries`: `id`, `contract_id`, `status` (`delivery_status`:
  `IN_PROGRESS`|`DELIVERY_REQUESTED`|`APPROVED`), `message`, `attachment_url`, `requested_at`,
  `approved_at`, `created_at`, `updated_at`

## 규칙

1. **금액 합의 제안**: `applications.status`가 `ACCEPTED`인 지원서 1건당 활성(`PROPOSED`) 상태의
   `agreements`는 1건만 존재할 수 있다. 제안 시 `agreed_amount`, `proposed_by_user_id`(제안자 —
   client 또는 freelancer 모두 가능)를 저장하고 `status = PROPOSED`.
2. **합의 수락**: 제안을 받은 상대측만 수락할 수 있다. 수락 시 `agreements.status = ACCEPTED`,
   `responded_at` 기록. 이어서 `contracts`를 자동 생성한다(`status = DRAFT`,
   `agreed_amount`는 합의 금액을 그대로 복사, `project_title_snapshot`은 계약 생성 시점 프로젝트
   제목을 스냅샷).
3. **합의 거절**: 제안을 받은 상대측만 거절할 수 있다. 거절 시 `agreements.status = REJECTED`,
   `responded_at` 기록. 이후 project-management 도메인의 `restorePreContractProject`를 호출한다
   (거절자에 따라 `reason`을 `FREELANCER_REJECTED`/`CLIENT_REJECTED`로 구분).
4. **계약 서명**: `contracts.status`가 `DRAFT`이면 첫 서명 시 `SIGNING`으로 전환한다. 서명자가
   client면 `client_signed_at`, freelancer면 `freelancer_signed_at`을 기록하고
   `contract_signature_audits`에 서명 감사 기록(`signer_id`, `signer_role`, `signed_at`,
   `ip_address`, `user_agent`)을 추가한다. 이미 같은 쪽이 서명했으면 거부한다(409). 양측 서명이
   모두 완료되면 `status = SIGNED`, `signed_at` 기록.
5. **결제 확정 전제조건**: `contracts.status`가 `SIGNED`가 아니면 결제를 시작할 수 없다(409).
6. **결제 요청 직전 마킹**: PG(토스페이먼츠) 결제 요청을 보내기 직전, project-management 도메인의
   `markPaymentPending(projectId)`(C-07)를 호출한다. 이 호출 없이 PG 요청을 보내지 않는다
   (근거: PRD §5.4 D-40 — 없으면 결제 완료 후 취소 가능 구간이 생긴다).
7. **결제 금액 계산**: `payment_amount = agreed_amount`. `platform_fee_amount = floor(payment_amount
   × 0.1)`(1원 미만은 버림, 근거: PRD §6.4 D-14). `settlement_amount = payment_amount −
   platform_fee_amount`.
8. **결제 확정 성공/실패**: PG 콜백이 성공이면 `payments.status = PAID`, `paid_at` 기록,
   `raw_response`에 PG 콜백 원문 저장. 실패면 `status = FAILED`, `failed_at`, `failure_code`,
   `failure_message` 기록.
9. **프로젝트 거래 시작 연동**: 계약이 `SIGNED`이고 결제가 `PAID`인 두 조건이 모두 충족된 시점에만
   project-management 도메인의 `startProjectTransaction(projectId)`(C-02)를 1회 호출한다. 이 함수가
   409(의뢰인이 이미 프로젝트를 취소함)를 반환하면 "프로젝트가 취소되었습니다"를 안내하고 중단한다.
10. **취소 시 무효화**: 프로젝트가 취소되어 계약을 더 진행할 수 없게 되면 `contracts.status =
    CANCELED`(`canceled_at` 기록), 관련 `agreements.status = REJECTED`로 무효화한다. 단
    `contract_signature_audits`에 남긴 서명 기록은 삭제하지 않고 보존한다.
11. **납품 요청**: `contracts.status`가 `SIGNED`가 아니면 납품을 요청할 수 없다(409). 요청 시
    `deliveries`를 생성(또는 갱신)하고 `status = DELIVERY_REQUESTED`, `requested_at` 기록.
12. **납품 승인과 정산**: 의뢰인만 납품을 승인할 수 있다. 승인 시 `deliveries.status = APPROVED`,
    `approved_at` 기록. 같은 트랜잭션에서 해당 계약의 `payments.status = RELEASED`, `released_at`
    기록(실제 계좌 이체는 MVP 범위 밖 — `docs/naming-convention.md` §3 "정산 처리" 참고).
13. **프로젝트 거래 완료 연동**: 납품이 `APPROVED`이고 정산이 `RELEASED`인 두 조건이 모두 충족된
    시점에만 project-management 도메인의 `completeProjectTransaction(projectId)`(C-03)를 1회
    호출한다. 이 함수가 409를 반환하면 프로젝트 상태를 재조회해 이미 `COMPLETED`면 성공으로
    처리하고, 아니면 오류로 보고한다. 이 호출이 성공해야 리뷰 작성이 열린다(근거: PRD §5.4 C-03,
    `features/reviews/`와의 경계).
14. **외부 벤더(PG) 의존 격리**: 결제 확정 로직은 토스페이먼츠 SDK를 직접 호출하지 않고
    `payment.port.ts` 인터페이스 뒤에 둔다. 구현체는 `toss-payments.adapter.ts`
    (근거: `docs/decisions/0009-external-vendor-interface-layer.md`, `constitution.md` 원칙 10).

## 크기 기준

이 문서가 300줄을 넘으면 분리를 검토하고, 500줄을 넘으면 분리한다. 단, 분리 기준은 길이가 아니라
**서로 안 읽어도 되는 독립된 책임**이 쌓였을 때다 (`sdd-framework/evolution-rules.md`). 같은 엔티티의
생애주기를 다루는 내용이면 길어도 한 파일로 유지한다.

## 비고

- project-management 도메인의 계약 함수(C-02·C-03·C-04·C-07)는 PRD §5.4에 정의된 대로 실제
  HTTP 호출을 가정하되, 이 기능의 `prototype/`에서는 Mock으로 대체한다(§0.3에 따르면 이 함수들의
  구현 자체는 유동우 담당이며 조준영은 Step 2 시점에 호출자로서 연동한다).
- 금액 합의의 2차(재협상) 설계는 PRD §5.4 C-04 시그니처에 `negotiationId`/`offerId`가 포함된
  더 복잡한 버전을 언급하지만, `docs/naming-convention.md` §3이 "MVP는 1회 제안→수락/거절만"으로
  범위를 명시하고 있고 `docs/domain/erd.md`의 `agreements` 테이블에도 그 필드가 없다. 이 스펙은
  ERD·naming-convention 기준의 1차(단순) 모델을 따른다 — PRD의 2차 설계와 충돌하는 부분이 있다면
  `change-requests/`에 기록한다.
