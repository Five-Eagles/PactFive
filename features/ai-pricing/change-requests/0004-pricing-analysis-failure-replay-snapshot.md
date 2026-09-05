---
title: "분석 실패 exact replay의 공개 응답 스냅샷 영속화"
status: "제안"
requested_by: "오민혁 (ai-pricing)"
date: "2026-09-04"
affected_docs: [docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [ai-pricing]
---

# 스펙 변경 신청

ID: `CR-AP-004`

## 배경 (왜 필요한가)

분석 생성의 `REJECTED` exact replay는 최초 502/504 상태와 공개 오류 body를 그대로 반환해야 한다.
현재 ERD의 `failure_code`만 저장하고 매 요청마다 현재 코드의 제품 문구를 다시 만들면 배포 사이에
문구·`retryable`·HTTP 매핑이 바뀐 경우 같은 멱등 키의 응답이 달라진다.

## 제안하는 변경

`REJECTED` 전이와 같은 원자 작업에서 아래 안전한 공개 응답 스냅샷을 영속화한다.

```text
failure_snapshot = { code, message, retryable }
failure_http_status = 502 | 504
```

공급자 원문, 모델명, 프롬프트, API key, stack trace는 저장하지 않는다. `PENDING`과 `APPROVED`에서는
두 필드가 NULL이고, `REJECTED`에서는 둘 다 NOT NULL이어야 한다. replay는 현재 문구 매핑을 다시
실행하지 않고 이 사본을 사용한다. 대안으로 공통 idempotency 결과 저장소를 채택한다면 동일한
HTTP 상태와 body를 `(CREATE_PRICING_ANALYSIS, requesterId, idempotencyKey)` 범위에 저장해도 된다.

프로토타입은 `PricingAnalysisRow.failureSnapshot`과 `failureHttpStatus`로 이 계약을 표현한다. 실제
DB adapter와 migration이 준비되기 전에는 운영 route를 활성화하지 않는다.

## 영향 범위

- `pricing_analyses` 또는 공통 idempotency 저장소 migration
- PENDING/APPROVED/REJECTED 상태별 CHECK와 repository 매핑
- 오류 문구 변경 전후 exact replay 통합 테스트
- 보존 기간과 개인정보·비밀 비저장 점검

## 승인 기준

- 프로세스 재시작과 서로 다른 배포 버전 사이에도 최초 REJECTED HTTP 상태와 body가 동일하다.
- 실패 스냅샷에 allowlist 밖 필드나 공급자 원문이 들어가지 않는다.
- 기존 행 backfill 또는 호환 처리 방안이 정해진다.
