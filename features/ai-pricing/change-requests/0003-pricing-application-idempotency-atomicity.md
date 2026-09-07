---
title: "AI 추천 예산 적용의 exact replay 저장과 교차 도메인 원자성 확정"
status: "제안"
requested_by: "오민혁 (ai-pricing)"
date: "2026-09-04"
affected_docs: [docs/domain/reference/prd-v6.4.md, docs/domain/reference/erd-v1.4.dbml, docs/domain/erd.md]
affected_features: [ai-pricing, project-management]
---

# 스펙 변경 신청

ID: `CR-AP-003`

## 배경 (왜 필요한가)

기존 프로젝트에 추천 예산을 적용하면 project-management의 `projects.budget_amount`와 ai-pricing의
`pricing_analyses.project_id/applied_at`이 함께 바뀐다. 재시도·동시 요청·중간 실패를 구분할 영속
결과와 공통 transaction 경계가 없으면 부분 갱신 또는 잘못된 409가 발생한다.

## 현재 스펙

- PRD C-05와 반복 호출 표는 같은 분석·같은 금액의 재시도를 200 멱등 성공으로 정의한다.
- ERD E-21 조건부 UPDATE는 `applied_at IS NULL` 대상이 0건이면 이미 적용/승인 안 됨을 409로
  처리한다고 정의한다.
- 현재 ai-pricing의 `getPricingAnalysisRecommendation`은 읽기 전용이고, project-management의
  프로젝트 갱신과 분석 `applied_at` 기록을 한 transaction으로 묶지 않는다.
- `pricing_analyses.idempotency_key`는 분석 생성 키이며 적용 결과 저장소가 아니다.

따라서 단순히 현재 상태만 보면 exact replay와 다른 재적용을 구분할 수 없고, 한쪽 commit 후 다른
쪽 실패를 되돌릴 계약도 없다.

## 제안하는 변경

### 1. 적용 멱등 결과를 영속화

`pricing-apply-{pricingAnalysisId}` 키에 대해 최소 다음을 원자 transaction 안에 저장한다. 조회와
unique 범위는 키 문자열 단독이 아니라 `(operation, actorUserId, key)` 복합 범위다.

```text
operation = APPLY_PRICING_ANALYSIS
actorUserId
pricingAnalysisId
projectId
requestFingerprint
httpStatus
responseBody
processedAt
```

저장 위치는 공통 idempotency 테이블을 우선 제안한다. 별도 테이블이 승인되지 않으면 같은 정보를
손실 없이 저장할 기존 공통 mechanism을 지정해야 한다. 분석 생성 키 컬럼에 적용 키를 덮어쓰지 않는다.

판정 순서는 다음과 같다.

1. 인증/기본 형식을 확인한다.
2. 키의 기존 결과를 조회한다.
3. 같은 fingerprint면 저장된 최초 HTTP 상태와 body를 재생한다.
4. 다른 fingerprint면 409 `IDEMPOTENCY_KEY_REUSED`다.
5. 기존 결과가 없을 때만 현재 분석/프로젝트 상태를 잠그고 검증·변경한다.

이 순서로 exact replay 200과 새로운 재적용 409를 동시에 만족한다.

### 2. 원자적 ProjectBudgetApplicationPort

```ts
interface ProjectBudgetApplicationPort {
  applyPricingAnalysisBudget(
    input: AtomicPricingBudgetApplicationInput,
  ): Promise<AtomicPricingBudgetApplicationResult>;
}
```

adapter는 한 transaction에서 다음을 모두 commit하거나 모두 rollback해야 한다.

- 프로젝트 소유권·잠금·선택 버전 검증
- 화면에 표시한 `expectedBudgetAmount`와 현재 `projects.budget_amount`의 CAS 검증
- 분석 소유권·APPROVED·미적용 검증 및 row lock/조건부 갱신
- DB `recommended_amount`를 `projects.budget_amount`에 반영
- 분석 `project_id`, `applied_at` 기록
- 멱등 HTTP 결과 기록

ai-pricing이 `projects`를 직접 갱신하거나 project-management가 분석 테이블을 임의 갱신하는 대신,
두 repository가 같은 transaction context에 참여하는 application-level coordinator/adapter를 둔다.
같은 DB transaction을 공유할 수 없는 배치라면 outbox/saga와 보상·관측 계약을 별도로 승인하기 전까지
MVP `/apply`를 활성화하지 않는다.

원자 포트를 사용할 수 없으면 요청은 어느 mutation도 시작하지 않고
`503 PRICING_APPLICATION_UNAVAILABLE`로 fail-closed한다.

현재 D-53은 예산 변경 시 `projectVersion`을 증가시키지 않고 `expectedProjectVersion`도 선택값이다.
따라서 버전만으로는 다른 탭의 예산 변경을 탐지할 수 없다. MVP 공개 apply는
`expectedBudgetAmount`를 필수로 받고 잠근 DB 현재 예산과 비교해 다르면
`409 PROJECT_BUDGET_CONFLICT`로 전부 rollback한다. 장기적으로 별도 `budgetRevision` 또는 예산 변경도
포함하는 version 정책을 채택하면 이 전제값을 대체할 수 있다.

### 3. 신규 프로젝트 등록 경로는 유지

등록 중에는 별도 apply API를 만들지 않는다. `POST /api/v1/projects`의 `pricingAnalysisId` handoff와
기존 `claimPricingAnalysisForCreatedProject(transaction, input)`이 프로젝트 생성 transaction에
참여하는 현재 Step 1 계약을 유지한다.

## 영향 범위

- 적용 멱등 결과 schema/repository 및 보존 기간
- ai-pricing/project-management transaction adapter와 lock 순서
- `/pricing-analyses/:id/apply` 응답 저장·replay
- 경쟁 요청, timeout, deadlock retry, 부분 실패 통합 테스트
- stale 화면의 `expectedBudgetAmount` 불일치와 서로 다른 분석 간 overwrite 경쟁 테스트
- PRD의 200/409 표와 ERD 조건부 UPDATE 설명 동기화

## 대안으로 검토했던 것

- `applied_at IS NOT NULL`이면 모두 200: 다른 프로젝트·다른 actor 요청도 성공처럼 숨긴다.
- 조건부 UPDATE 0건이면 모두 409: 정상 exact replay를 실패시켜 PRD 멱등 계약을 깬다.
- 읽기 포트 후 두 번의 순차 UPDATE: 중간 실패와 경쟁 요청에서 부분 갱신이 생긴다.
- 부분 실패 후 best-effort 보상: 보상 자체가 실패할 수 있고 MVP에 필요한 상태/재처리 계약이 없다.

## 승인에 필요한 결정

- 멱등 결과의 저장 테이블/소유자/보존 기간
- 두 도메인이 공유할 transaction coordinator와 lock 획득 순서
- request fingerprint canonicalization 및 hash algorithm/version
- `expectedBudgetAmount` CAS 유지 여부 또는 별도 budget revision 도입
- deadlock/DB transient failure의 서버 내부 재시도 한도
- 서로 다른 DB로 분리될 미래 시점의 outbox/saga 전환 조건
