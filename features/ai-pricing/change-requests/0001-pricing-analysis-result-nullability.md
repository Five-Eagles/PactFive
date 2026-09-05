---
title: "pricing_analyses 결과 컬럼을 상태에 맞게 nullable로 변경"
status: "제안"
requested_by: "오민혁 (ai-pricing)"
date: "2026-09-04"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [ai-pricing]
---

# 스펙 변경 신청

ID: `CR-AP-001`

## 배경 (왜 필요한가)

Step 2는 분석 레코드를 먼저 `PENDING`으로 예약한 뒤 LLM 결과를 검증하고 `APPROVED` 또는
`REJECTED`로 끝낸다. 처리 중이거나 실패한 레코드에는 신뢰할 수 있는 추천 금액과 breakdown이 없다.

## 현재 스펙

`docs/domain/reference/erd-v1.4.dbml`의 `pricing_analyses`는 다음을 동시에 요구한다.

- `recommended_amount integer [not null]`
- `breakdown jsonb [not null]`
- `review_status` 기본값 `PENDING`
- `PENDING`은 처리/검증 중, `REJECTED`는 공급자·시간초과·파싱/검증 실패

따라서 PENDING을 저장하려면 가짜 금액·가짜 breakdown을 넣어야 하고, 실패 행에도 미검증 결과가
정상 값처럼 남는다. 부록의 `CHECK (recommended_amount > 0)`도 NULL 가능 상태를 표현하지 못한다.

## 제안하는 변경

두 결과 컬럼을 nullable로 바꾸고 상태별 조합을 CHECK로 강제한다.

```sql
recommended_amount integer NULL,
breakdown jsonb NULL,

CHECK (recommended_amount IS NULL OR recommended_amount > 0),
CHECK (
  (review_status = 'PENDING'
    AND recommended_amount IS NULL
    AND breakdown IS NULL
    AND failure_code IS NULL
    AND reviewed_at IS NULL)
  OR
  (review_status = 'APPROVED'
    AND recommended_amount IS NOT NULL
    AND breakdown IS NOT NULL
    AND failure_code IS NULL
    AND reviewed_at IS NOT NULL)
  OR
  (review_status = 'REJECTED'
    AND recommended_amount IS NULL
    AND breakdown IS NULL
    AND failure_code IS NOT NULL
    AND reviewed_at IS NOT NULL)
)
```

breakdown 원소 타입, 양수 정수, 1~20건, 문자열 길이, 합계 일치는 DB JSON CHECK 대신 ai-pricing의
구조화 출력 validator가 강제한다. `APPROVED` 전이 transaction에서 결과와 `reviewed_at`을 함께
기록한다.

## 영향 범위

- ERD와 실제 DB migration의 nullability/CHECK
- repository/domain 타입을 상태 discriminated union으로 변경
- 공개 API에서 PENDING/REJECTED의 `result: null` 표현
- fixture, persistence, 상태 전이 및 무효 출력 테스트

기존 APPROVED 데이터는 그대로 유효하다. migration 전에 PENDING/REJECTED 저장 구현을 배포하면 안 된다.

## 대안으로 검토했던 것

- `0`과 빈 배열을 저장: 양수 불변식을 깨고 아직 없는 결과를 실제 결과처럼 만든다.
- 분석기 성공 후에만 행 생성: 멱등 동시 요청을 예약할 수 없고 실패·비용 추적 기록이 사라진다.
- 결과용 별도 테이블 추가: 상태 문제는 풀지만 MVP에 불필요한 join과 엔티티를 늘린다.

## 승인 기준

- PENDING/APPROVED/REJECTED 각각의 유효/무효 컬럼 조합이 migration 테스트로 증명된다.
- 기존 APPROVED 행 migration과 rollback 계획이 있다.
- 애플리케이션 합계 validator가 별도 테스트된다.
