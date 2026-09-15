# contracts-payments 이식 지시서 — Day1 P0 (2026-09-10)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 |
| 근거 | 2일 최대효과 개선계획 · 검토보고서 v2.0 C-06/C-01/C-13 |

`app/` 반영은 팀장 전용. 아래는 **이미 로컬에 적용한 교체 요지**다 — develop PR 시 대조용.

## C-06 — `contractApplicationId`

`createContractsPaymentsSnapshotReader`: `contract.agreementId` → `agreement.applicationId`
(`findAgreementById` 후).

## C-01 — `requireParty`

- deps에 `resolveApplicationFreelancer(applicationId)` 추가
- express-app: `applicationRepository.getApplication` → `freelancerId`
- 의뢰인 또는 선정 프리랜서만 허용

## C-13 — 취소 후 invalidate

`transactionStatus === 'CANCELED' || canceledAt` 이면 CONTRACT_PENDING/NONE과 같이 허용.
`paymentPendingAt`·IN_PROGRESS 거부는 유지.

## Day2 요지

- C-02: Prisma `saveAgreement`가 `offer.offerId` 유지
- C-08: PAID 재confirm 멱등 · `savePayment` update에 `pgOrderId`
- C-10: `preparedUploads` Map으로 uploadId/objectKey 검증 + 프로젝트 IN_PROGRESS
- C-11: APPROVED ∧ IN_PROGRESS 후에만 RELEASED
