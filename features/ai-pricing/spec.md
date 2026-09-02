# ai-pricing — SPEC

## 목적

AI 단가 분석 결과를 프로젝트 예산에 안전하게 연결하기 위한 선행 내부 계약을 정의한다. 이 문서는
2026-08-27 일정의 최소 산출물인 계약 시그니처와 경계만 다루며, AI 단가 분석 본기능의 전체 구현
명세는 후속 Step 2에서 확장한다.

## 범위

- 포함:
  - 이미 등록된 프로젝트에 AI 추천 예산을 반영하는 `applyPricingAnalysisBudget`
  - 프로젝트 생성 트랜잭션 안에서 미적용 분석을 연결하는
    `claimPricingAnalysisForCreatedProject`
  - apply 계약의 멱등성 및 claim 계약의 조건부 갱신·트랜잭션 경계
  - project-management CR-0003에 대한 읽기 전용 `getPricingAnalysisRecommendation` 포트
- 제외:
  - OpenAI API 호출, 프롬프트 설계, 모델 선택과 분석 결과 생성
  - AI 분석 요청·리포트 화면, 전체 REST API와 디자인 시안
  - DB migration 및 `project-management`의 프로젝트 생성·예산 갱신 구현
  - `app/` 및 `docs/domain/` 통합 반영

## 관련 엔티티 (근거: `docs/domain/erd.md`)

이 기능은 `pricing_analyses`의 다음 필드를 소유한다.

- `id`, `requester_id`, `project_id`
- `recommended_amount`, `review_status`, `reviewed_at`, `applied_at`
- `idempotency_key`, `created_at`, `updated_at`

여기서 `pricing_analyses.idempotency_key`는 **분석 요청 생성 중복 방지용**이다. 아래 D-54 호출의
`pricing-apply-{pricingAnalysisId}`를 이 컬럼에 저장하거나 같은 키로 취급하지 않는다.

`projects.budget_amount`, `projects.pending_application_count`, `projects.project_version`, 모집 상태와
거래 상태는 `project-management` 소유 데이터다. 이 기능은 해당 테이블을 임의로 직접 갱신하지
않고 아래 내부 계약과 같은 트랜잭션 컨텍스트를 통해서만 연동한다.

## 계약 1 — 기존 프로젝트의 추천 예산 반영

문서 간 계약 참조의 정본은 번호가 아니라 다음 함수명이다.

```ts
applyPricingAnalysisBudget(projectId, pricingAnalysisId)
```

이 계약은 의뢰인이 **이미 등록된 프로젝트**의 AI 분석 리포트에서 추천 예산 반영을 선택했을 때
사용한다. 프로젝트 등록 도중의 분석 연결에는 사용하지 않는다.

- 제공자: `project-management`
- 호출자: `ai-pricing`
- `project-management`는 `projects` 갱신을, `ai-pricing`은 `pricing_analyses` 적용 기록을 소유한다.
- 두 도메인 갱신의 원자성·실패 보상 경계는 아직 정본에 확정되지 않았다. 8월 27일 산출물에서는
  시그니처만 고정하고 구현 전 팀장 통합 결정으로 남긴다.

### 8월 28일 호출 접점

최신 `develop`의 project-management는 `applyPricingAnalysisBudget`을 이미 제공한다. ai-pricing은
이 함수를 중복 구현하거나 `projects`를 직접 갱신하지 않고, 요청받은 CR-0003에 따라 다음 읽기 전용
접점을 제공한다.

```ts
getPricingAnalysisRecommendation({ analysisId, projectId, requesterId })
```

이 접점은 분석 소유자·승인 상태·기존 프로젝트 연결을 검증한 뒤 저장된 `recommendedAmount`만
반환하고 분석 상태를 변경하지 않는다. 따라서 C-05의 project 예산 갱신과
`pricing_analyses.applied_at` 기록을 하나로 묶는 원자성은 여전히 팀장 통합 결정 대상이다.
프로토타입 정본은 `prototype/server/pricing-analysis.port.ts`다.

### 공통 요청 메타데이터

PRD v6.4 D-54의 프로젝트 상태 변경 계약 공통 규약에 따라 실제 호출은 다음 메타데이터를 함께
전달한다. 위 두 업무 인자는 함수 식별용 축약 시그니처이고, 아래 값은 호출 envelope 또는 동일한
호출 컨텍스트에서 생략하지 않는다.

| 필드 | 필수 | 규칙 |
|---|---|---|
| `requestId` | 필수 | 호출 추적 ID |
| `idempotencyKey` | 필수 | `pricing-apply-{pricingAnalysisId}` |
| `occurredAt` | 필수 | 원본 사건 발생 시각 |
| `expectedProjectVersion` | 선택 | 전달한 경우 현재 프로젝트 버전과 다르면 409 |

### 공통 응답

| 필드 | 의미 |
|---|---|
| `alreadyProcessed` | 같은 멱등 요청이 이전에 처리됐는지 |
| `processedAt` | 최초 처리 완료 시각 |
| `changed` | 이번 호출로 상태나 예산이 실제 변경됐는지 |
| `projectVersion` | 처리 후 프로젝트 버전 |

예산 변경은 일반 필드 수정이므로 `projectVersion`을 증가시키지 않는다(D-53). 요청의
`expectedProjectVersion`은 현재 버전과 비교만 하고, 응답은 증가시키지 않은 현재 버전을 반환한다.

### 적용 조건과 결과

- 프로젝트가 존재하고 삭제되지 않았으며, 요청자가 해당 프로젝트의 등록 의뢰인이어야 한다.
- 대기 중인 지원이 0건이고 프로젝트가 마감·거래 단계에 들어가지 않아 예산 수정이 가능한
  상태여야 한다.
- 분석의 `review_status`는 `APPROVED`여야 한다.
- 클라이언트가 금액을 인자로 전달하지 않는다. 서버가 `pricing_analyses.recommended_amount`를
  읽어 프로젝트의 `budget_amount`에 사용한다.
- 정확히 같은 적용 요청의 재시도는 멱등 성공 후보지만, 아래 문서 충돌이 해소되기 전에는
  “이미 적용됨”만으로 200을 반환하도록 구현하지 않는다.
- 서로 다른 동시 요청이 같은 분석을 두 번 적용하지 못하도록 `applied_at` 기반 조건부 갱신과
  프로젝트 버전 검사를 사용한다.

### 실패

| 조건 | 결과 |
|---|---|
| 프로젝트가 없거나 삭제됨 | 404 |
| 요청자가 등록 의뢰인이 아님 | 403 |
| 대기 중인 지원이 1건 이상 | 409 |
| 프로젝트가 마감·거래 단계이거나 버전이 충돌함 | 409 |
| 분석이 `APPROVED`가 아님 | 409 |
| 같은 멱등 키·프로젝트·분석·추천 금액의 정확한 재시도 | 200 멱등 성공이라는 PRD C-05/반복 호출 표의 해석 후보 |
| 다른 프로젝트에 적용됐거나 상태가 다른 분석 | 409 |

### 구현 전 동기화가 필요한 충돌

PRD C-05와 반복 호출 표는 같은 분석·같은 금액의 재시도를 200으로 설명하지만, D-67의 조건부
`UPDATE` 규칙은 이미 적용돼 영향 행이 0건이면 409라고 설명한다. 따라서 exact replay를 입증할
저장 위치와 판정 순서가 정해지기 전에는 두 동작 중 하나를 임의 구현하지 않는다. 팀장 통합에서
200 exact replay와 409 경합/상태 불일치를 구분하는 정본 규칙을 확정해야 한다.

## 계약 2 — 프로젝트 생성 트랜잭션의 분석 claim

`POST /api/v1/projects`의 선택 필드 `pricingAnalysisId`를 받은 경우, project-management는 프로젝트
생성 트랜잭션 안에서 다음 내부 포트를 호출한다. 별도 공개 API나 등록 완료 후 후속 호출을 만들지
않는다.

```ts
type ClaimPricingAnalysisForCreatedProjectInput = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};

type ClaimPricingAnalysisForCreatedProjectResult = {
  recommendedAmount: number;
};

interface PricingAnalysisClaimPort {
  claimPricingAnalysisForCreatedProject(
    transaction: TransactionContext,
    input: ClaimPricingAnalysisForCreatedProjectInput,
  ): Promise<ClaimPricingAnalysisForCreatedProjectResult>;
}
```

### claim 조건과 트랜잭션 경계

- `analysisId`와 `requesterId`가 가리키는 분석 한 건이 존재해야 한다. 공개 프로젝트 등록 요청의
  `pricingAnalysisId`는 호출자가 이 내부 필드 `analysisId`로 명시적으로 매핑한다.
- 해당 분석은 `review_status = APPROVED`, `applied_at IS NULL`, `project_id IS NULL`이어야 한다.
- 조건이 모두 맞는 한 행에 한해 `project_id`와 `applied_at`만 조건부 갱신한다.
- 성공하면 DB의 `recommended_amount`를 `recommendedAmount`로 반환한다. project-management는
  반환값으로 자기 도메인의 프로젝트 예산을 기록한다.
- 함수는 전달받은 `TransactionContext`를 그대로 사용하며 내부에서 별도 transaction을 시작하거나
  commit하지 않는다.
- 조건부 갱신 대상이 0건이면 `PRICING_ANALYSIS_NOT_CLAIMABLE`을 반환한다. 프로젝트 생성 API는
  이를 409로 매핑하고 프로젝트 생성과 분석 연결 전체를 rollback한다.

## 업무 규칙

1. `applyPricingAnalysisBudget`는 이미 등록된 프로젝트 전용이고,
   `claimPricingAnalysisForCreatedProject`는 신규 프로젝트 생성 트랜잭션 전용이다.
2. 두 계약 모두 클라이언트가 전달한 추천 금액을 신뢰하지 않고 DB의
   `pricing_analyses.recommended_amount`를 사용한다.
3. 같은 분석을 두 프로젝트에 적용하거나 같은 프로젝트 예산에 두 번 반영하지 않는다.
4. ai-pricing은 `pricing_analyses`만, project-management는 `projects`만 갱신한다.
5. 신규 등록의 외부 진입점은 `POST /api/v1/projects` 하나이며 내부 claim 포트는 별도 공개 API가
   아니다.

## 팀장 통합 시 확인

현재 PRD v6.4 D-60·D-67 본문에는 신규 claim 계약이 미채택으로 남아 있지만, 2026-08-25
오민혁 회신 Q-01은 같은 공개 등록 경로와 트랜잭션을 유지하는 내부 포트 방식으로
`claimPricingAnalysisForCreatedProject`를 채택했다. `pricing_analyses` 담당자 결정이 우선한다는
D-67 단서에 따른 기능 원본이며, 팀장은 통합 시 `docs/domain/` 사본과 이 결정을 동기화해야 한다.
이때 apply exact replay의 200/409 충돌과 교차 도메인 원자성·보상 경계도 함께 확정해야 한다.
기능 담당자는 팀장 전용인 `docs/domain/`, `app/` 또는 다른 담당자의
`features/project-management/`를 직접 수정하지 않는다.

## 크기 기준

이 문서가 300줄을 넘으면 분리를 검토하고, 500줄을 넘으면 분리한다. 단, 같은 엔티티의 생애주기와
서로 의존하는 계약은 한 문서에 유지한다.
