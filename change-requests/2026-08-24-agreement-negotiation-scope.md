---
title: "금액 합의(agreements) 재협상 설계 — PRD 2차 vs ERD/naming-convention 1차 불일치"
status: "제안"
requested_by: "조준영"
date: "2026-08-24"
affected_docs: ["docs/domain/reference/prd-v5.2.html", "docs/domain/erd.md", "docs/naming-convention.md"]
affected_features: ["contracts-payments"]
---

# 스펙 변경 신청

## 배경 (왜 필요한가)

`contracts-payments` SPEC 작성 중 `restorePreContractProject`(C-04) 계약 함수를 확인하다가 발견함.

## 현재 스펙

- `docs/naming-convention.md` §3: "금액 합의 `agreement` ... (MVP는 1회 제안→수락/거절만)"
- `docs/domain/erd.md`의 `agreements` 테이블: `id`, `application_id`, `proposed_by_user_id`,
  `agreed_amount`, `status`, `responded_at`, `created_at`, `updated_at` — 재협상 관련 필드 없음
- `docs/domain/reference/prd-v5.2.html` §5.4 C-04: `restorePreContractProject(projectId,
  negotiationId, offerId, actorUserId, reason, requestId, idempotencyKey, occurredAt,
  expectedProjectVersion?)` — "2차 설계"라고 명시하며 양측 재제안(카운터 오퍼)을 전제로 한
  `negotiationId`/`offerId` 필드를 요구함

## 제안하는 변경

`contracts-payments` SPEC은 naming-convention·ERD 기준의 **1차(단순) 모델**을 따르기로 하고 진행함
— 즉 `restorePreContractProject` 호출 시 `negotiationId` 대신 `agreementId`를 식별자로 사용하고,
재협상(카운터 오퍼) 관련 인자는 생략함. PRD §5.4가 2차 설계 기준으로 쓰여 있다면, PRD를 1차
기준으로 되돌리거나(간단), 혹은 ERD에 `negotiationId`/재협상 관련 필드를 추가하고
naming-convention의 "MVP는 1회 제안→수락/거절만" 문구를 수정하는 방향(복잡, 범위 확대) 중 하나로
팀 결정이 필요함.

## 영향 범위

- `features/contracts-payments/` (본 기능) — 이미 1차 모델로 진행함
- `docs/domain/erd.md`의 `agreements` 테이블 스키마 (2차로 갈 경우 컬럼 추가 필요)
- PRD §5.4 C-04 시그니처 (1차로 갈 경우 문서 수정 필요)

## 대안으로 검토했던 것

- PRD의 2차 설계(negotiationId 기반)를 그대로 따라가는 안 — 기각. ERD에 해당 컬럼이 없어
  구현이 불가능하고, naming-convention.md가 명시적으로 MVP 범위를 1회 제안→수락/거절로 못박고
  있어 정본 충돌 시 더 최근·더 좁은 범위인 naming-convention·ERD를 우선함.
