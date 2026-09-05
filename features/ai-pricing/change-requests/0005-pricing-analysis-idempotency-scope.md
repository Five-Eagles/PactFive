---
title: "분석 생성 멱등 키 unique 범위를 요청자별로 변경"
status: "제안"
requested_by: "오민혁 (ai-pricing)"
date: "2026-09-04"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [ai-pricing]
---

# 스펙 변경 신청

ID: `CR-AP-005`

## 배경 (왜 필요한가)

공개 계약의 생성 멱등 범위는 `(CREATE_PRICING_ANALYSIS, requesterId, idempotencyKey)`다. 현재 ERD의
`pricing_analyses.idempotency_key` 단일 global unique는 서로 다른 사용자가 우연히 같은 키를
선택했을 때 충돌을 만들며, 잘못 구현하면 다른 사용자의 요청 존재 여부까지 드러낼 수 있다.

## 제안하는 변경

생성 키의 단일 컬럼 unique를 제거하고 다음 복합 unique를 사용한다.

```sql
UNIQUE (requester_id, idempotency_key)
```

별도 공통 idempotency 저장소를 채택한다면
`UNIQUE (operation, actor_user_id, idempotency_key)`를 사용한다. 어느 방식이든 조회는 인증 사용자
범위 안에서만 수행하고, 다른 사용자의 같은 문자열 키는 정상적인 독립 요청이어야 한다.

rate-limit의 멱등 예약도 `(requesterId, idempotencyKey)`에 최초 `requestFingerprint`를 결합한다.
분석 행 예약이 실패했더라도 같은 사용자·키의 다른 fingerprint는 409
`IDEMPOTENCY_KEY_REUSED`이고 quota 우회에 사용될 수 없다.

## 영향 범위

- ERD unique index와 실제 DB migration
- repository의 `findByIdempotency(requesterId, idempotencyKey)` 구현
- 사용자별 rate-limit/idempotency 저장소의 fingerprint 결합
- 서로 다른 사용자 같은 키, 같은 사용자 같은/다른 fingerprint의 경합 테스트

## 승인 기준

- 서로 다른 두 사용자가 같은 키로 각각 분석을 생성할 수 있다.
- 한 사용자의 키가 다른 사용자에게 충돌이나 존재 신호를 만들지 않는다.
- 같은 사용자·키의 다른 fingerprint는 행 예약 실패 뒤에도 409이며 quota를 우회하지 않는다.
