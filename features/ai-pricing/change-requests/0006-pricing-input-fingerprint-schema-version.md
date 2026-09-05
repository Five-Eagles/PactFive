---
title: "분석 입력 fingerprint 스키마 버전 저장"
status: "제안"
requested_by: "오민혁 (ai-pricing)"
date: "2026-09-04"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [ai-pricing]
---

# 스펙 변경 신청

ID: `CR-AP-006`

## 배경 (왜 필요한가)

`pricing_analyses.request_fingerprint`는 작업 종류, 요청자, 정규화된 `input_snapshot`과 create 입력
fingerprint 스키마 버전으로 계산한다. 현재 ERD에는 그 버전을 보존하는 컬럼이 없다. 입력 정규화나
canonical 직렬화 규칙이 바뀐 뒤 현재 버전만으로 과거 hash를 재계산하면 정상 행도 손상된 것으로
판단하거나, 반대로 snapshot과 hash의 결합을 검증하지 못한 채 replay할 수 있다.

## 제안하는 변경

`pricing_analyses`에 다음 내부 컬럼을 추가한다.

```sql
input_fingerprint_schema_version varchar(20) NOT NULL
```

- 현재 create 입력 버전은 20자 이하의 불변 코드 `pricing-input-v1`을 사용한다.
- 신규 분석 예약은 `input_snapshot`, `request_fingerprint`,
  `input_fingerprint_schema_version`을 같은 원자 작업으로 기록한다.
- 조회·replay·apply 전에는 저장된 `requester_id`, 정규화된 `input_snapshot`, 작업 종류와
  `input_fingerprint_schema_version`으로 hash를 다시 계산해 `request_fingerprint`와 정확히 같은지
  확인한다. 불일치는 500 저장 오류로 fail-closed한다.
- 버전 코드는 공개 DTO에 노출하지 않고, 한번 사용한 코드의 의미를 바꾸거나 재사용하지 않는다.
- 요청자와 멱등 키 scope는 별도 컬럼 또는 충돌 없는 구조 인코딩으로 유지한다. 구분자 문자열 연결은
  이 버전 추가와 관계없이 허용하지 않는다.

## 기존 행 migration과 backfill

1. 운영 migration에서는 먼저 nullable 컬럼을 추가하고, 각 기존 행이 실제로 사용한 create 입력
   정규화·직렬화 규칙을 식별한다.
2. 기존 버전 식별자가 20자를 넘거나 새 compact 코드로 바뀌면, 해당 규칙으로
   `requester_id + input_snapshot`을 재정규화하여 `request_fingerprint`와 버전 값을 한 transaction에서
   함께 backfill한다. hash만 또는 버전만 단독 변경하지 않는다.
3. snapshot이 유효하지 않거나 원래 알고리즘을 확정할 수 없는 행은 임의 버전으로 채우지 않는다.
   migration을 중단하거나 별도 격리 목록으로 보내 운영 결정을 받는다.
4. 모든 행의 재계산 검증과 중복 검사를 통과한 뒤 컬럼을 `NOT NULL`로 전환하고, 새 코드가 두 값을
   항상 함께 기록하도록 배포한다.

아직 실제 DB adapter가 연결되지 않은 환경이라 기존 운영 행이 없다면 backfill 단계는 빈 집합으로
검증하되, migration 자체에는 기존 행 처리와 실패 조건을 남긴다.

## 영향 범위

- ERD와 실제 DB migration
- `PricingAnalysisRow` ↔ DB row mapper 및 repository insert/read
- create fingerprint 버전 상수와 과거 버전별 재계산 함수
- replay·GET·apply의 저장 행 검증
- 기존 행 backfill·rollback 운영 절차

## 승인 기준

- 모든 신규 `pricing_analyses` 행에 20자 이하의 입력 fingerprint 스키마 버전이 저장된다.
- 저장 snapshot 또는 requester가 hash와 결합되지 않으면 공개 응답·replay·apply 전에 안전한 500이다.
- 기존 행의 버전과 fingerprint가 한 transaction에서 backfill되고 부분 갱신이 남지 않는다.
- migration 완료 뒤 null 또는 알 수 없는 버전의 행을 정상 행으로 사용하지 않는다.
- S2-R6 snapshot/fingerprint binding과 S2-R21 tuple collision 회귀 테스트가 계속 통과한다.
