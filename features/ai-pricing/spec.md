# ai-pricing — SPEC

담당자: 오민혁

상태: Step 1 계약 보존 · Step 2 동기식 MVP 프로토타입 구현 · app/DB 통합 대기

기준일: 2026-09-04

## 목적

의뢰인이 프로젝트 제목·설명·카테고리를 바탕으로 AI 추천 예산과 항목별 근거를 받고, 그 결과를
프로젝트 등록 또는 기존 프로젝트 예산에 안전하게 연결하는 규칙을 정의한다. 추천 금액은 참고값이며
`projects.budget_amount`나 계약의 `agreed_amount`와 같은 값으로 간주하지 않는다.

## 정본과 범위

이 문서는 ai-pricing 기능 원본이다. 공개 HTTP 모양은 `api-contract.md`, Step 1 내부 포트의 실행 가능한
예시는 `prototype/server/pricing-analysis.port.ts`를 함께 본다.

포함 범위:

- 동기식 분석 생성: 한 POST 요청 안에서 멱등 예약 → 분석기 호출 → 결과 검증 → 최종 상태 저장
- 분석 상태·입력 스냅샷·추천 총액·breakdown·실패 분류의 생애주기
- 분석 생성, 단건 조회, 기존 프로젝트 적용 공개 API
- 프로젝트 등록 트랜잭션용 Step 1 claim 포트
- 기존 프로젝트 적용의 멱등성·소유권·원자성 경계

제외 범위:

- 모델 학습, 관리자 수동 승인, 비동기 큐·배치 재처리
- 모델·공급자 선택 UI, 토큰 사용량·비용 정산
- DB migration, `docs/domain/`, `app/`, 다른 기능 원본의 직접 수정
- 추천 금액을 계약 합의 금액으로 자동 전파하는 동작

## 선행 블로커와 작업 가설

| ID | 충돌 | 이 문서의 작업 가설 | 해소 조건 |
|---|---|---|---|
| CR-AP-001 | ERD의 `recommended_amount`·`breakdown`은 NOT NULL인데 `PENDING`·`REJECTED`는 결과가 없을 수 있음 | 도메인/API에서는 두 결과를 terminal `APPROVED`에만 존재하는 값으로 취급한다 | `change-requests/0001-pricing-analysis-result-nullability.md` 승인 및 migration |
| CR-AP-002 | PRD/ERD의 카테고리 코드와 현재 project-management 런타임 코드가 다름 | 프로토타입은 현재 런타임 6종을 ai-pricing 내부 단일 validator 한 곳에서만 사용한다. 운영 통합에서는 project-management와 공유 모듈로 교체한다 | `change-requests/0002-pricing-analysis-category-vocabulary.md`에서 단일 목록·소유 위치 확정 |
| CR-AP-003 | exact replay 200 규칙, 조건부 UPDATE 0건 409 규칙, 두 도메인 갱신의 원자성이 함께 정의되지 않음 | exact replay 기록을 상태 검사보다 먼저 읽고, 원자 포트가 없으면 적용을 수행하지 않고 503을 반환한다 | `change-requests/0003-pricing-application-idempotency-atomicity.md` 승인 |
| CR-AP-004 | ERD의 `failure_code`만으로는 배포 사이에 REJECTED 최초 HTTP/body exact replay를 보장할 수 없음 | 안전한 최초 공개 failure와 HTTP 상태를 분석 행에 함께 보관한다 | `change-requests/0004-pricing-analysis-failure-replay-snapshot.md` 승인 및 migration |
| CR-AP-005 | ERD는 생성 멱등 키를 global unique로 두지만 API 범위는 요청자별임 | repository와 rate-limit은 요청자·키·최초 fingerprint를 함께 묶는다 | `change-requests/0005-pricing-analysis-idempotency-scope.md` 승인 및 migration |
| CR-AP-006 | ERD에는 저장된 create fingerprint를 어떤 입력 스키마 버전으로 계산했는지 보존할 컬럼이 없음 | 분석 행에 `input_fingerprint_schema_version`을 저장하고 snapshot binding 검증에 사용한다 | `change-requests/0006-pricing-input-fingerprint-schema-version.md` 승인 및 원자 backfill migration |

위 가설은 임의로 충돌을 덮는 최종 결정이 아니다. 특히 기존 프로젝트 적용 API는 원자 구현이 준비될
때까지 fail-closed 상태다.

## 소유 엔티티와 값 의미

ai-pricing은 `pricing_analyses`를 소유한다.

| 필드 | 규칙 |
|---|---|
| `id` | `pra_...` 형태의 분석 식별자 |
| `requester_id` | 분석을 요청한 CLIENT 사용자 |
| `project_id` | 등록 전에는 NULL, 프로젝트에 채택되면 대상 프로젝트 ID |
| `input_snapshot` | 정규화된 `{ title, description, category }`의 생성 시점 불변 사본 |
| `recommended_amount` | 검증된 원 단위 양의 정수. `APPROVED`에서만 존재 |
| `breakdown` | 검증된 `[{ name, description, amount, rationale }]`. `APPROVED`에서만 존재 |
| `model_name` | 내부 추적 전용. 공개 응답에 노출하지 않음 |
| `prompt_version` | 내부 회귀 추적 전용. 공개 응답에 노출하지 않음 |
| `result_schema_version` | 공급자 결과 검증·내부 파서 추적 전용. 입력 fingerprint 버전과 별개이며 공개 응답에 노출하지 않음 |
| `failure_code` | 안전하게 분류한 내부 실패 코드. 공급자 원문을 저장·노출하지 않음 |
| `failure_snapshot` | REJECTED exact replay용 최초 공개 `{code, message, retryable}` 사본. 공급자 원문 제외 |
| `failure_http_status` | REJECTED exact replay용 최초 `502` 또는 `504` |
| `idempotency_key` | 분석 생성 중복 방지 키. 적용 요청의 키와 별개 |
| `input_fingerprint_schema_version` | create fingerprint를 계산한 정규화·직렬화 규칙 버전. `varchar(20)` 내부 값이며 공개 응답에 노출하지 않음 |
| `request_fingerprint` | 요청자, 정규화 입력, 작업 종류, `input_fingerprint_schema_version`의 결정적 해시 |
| `review_status` | `PENDING` · `APPROVED` · `REJECTED` |
| `reviewed_at` | 시스템 검증이 끝난 시각. 사용자가 리포트를 본 시각이 아님 |
| `applied_at` | 추천 금액이 프로젝트에 채택된 최초 시각 |

`projects`와 그 예산·지원 수·상태·버전은 project-management가 소유한다. ai-pricing은 해당 테이블을
직접 갱신하지 않는다.

## 상태 수명주기

허용 전이는 다음 둘뿐이다.

```text
PENDING → APPROVED
PENDING → REJECTED
```

- `PENDING`: 멱등 키가 예약됐고 분석 호출 또는 결과 검증 중이다. 결과와 `reviewed_at`은 없다.
- `APPROVED`: 구조, 타입, 금액, breakdown 합계를 모두 검증했다. 결과와 `reviewed_at`이 있다.
- `REJECTED`: 공급자 실패, 시간초과, 구조화 출력 파싱 또는 검증이 실패했다. 검증 결과는 없고
  `failure_code`, 최초 공개 failure/HTTP 상태 스냅샷과 `reviewed_at`이 있다.
- terminal 상태를 `PENDING`으로 되돌리지 않는다. 사용자의 재시도는 새 `Idempotency-Key`로 새 분석
  레코드를 생성한다.
- 단, terminal 실패를 확인하지 못한 네트워크 단절·응답 유실·모호한 5xx 재시도는 마지막 생성 키를
  보존해 exact replay한다. 공개 `REJECTED`를 확인했거나 키 충돌이 확정된 경우에만 새 키를 발급한다.
- 프로세스가 강제 종료돼 남은 stale `PENDING`의 회수 정책은 아직 운영 결정이 필요하다. 같은 키로
  새 분석기를 호출해 조용히 중복 비용을 만들지는 않는다.

저장 행도 불신 입력으로 취급한다. 공통 ID·요청자·키·fingerprint·정규화 snapshot·스키마 버전·시각을
검증하고, `requester_id + input_snapshot + input_fingerprint_schema_version`으로 create fingerprint를
재계산해 저장된 `request_fingerprint`와 정확히 결합되는지 확인한 뒤 상태별 불변식을 적용한다.
`PENDING`은 결과·실패·검토·프로젝트·적용 값이 모두 null,
`APPROVED`는 검증된 결과와 검토 시각이 있고 실패 값은 null, `REJECTED`는 결과·프로젝트·적용 값이
null이고 공개 실패 사본·최초 502/504·검토 시각이 있어야 한다. 프로젝트 ID와 적용 시각은
`APPROVED`에서만 함께 존재할 수 있고 시각은 생성 → 검토 → 적용 순서를 지켜야 한다. 어긋난 행은
공개 DTO나 적용 입력으로 사용하지 않고 안전한 저장 오류로 닫는다. `REJECTED` replay는 저장한 공개
failure와 HTTP 상태를 그대로 사용하며, 현재 코드-메시지 mapping으로 다시 계산하지 않는다.

## 입력과 결과 스키마

### 입력 스냅샷

```ts
type PricingAnalysisInputSnapshot = {
  title: string;       // trim 후 5~100자
  description: string; // trim 후 20~5000자
  category: ProjectCategory;
};
```

`ProjectCategory`는 운영 통합에서 project-management와 공유하는 단일 validator에서 가져온다.
현재 feature 프로토타입은 타 담당자 원본을 수정하지 않기 위해 런타임 6종을
`pricing-analysis.constants.ts` 한 곳에만 임시 고정한다. 입력 원문은 프롬프트 명령이 아니라 분석
대상 데이터로 구획하고, 로그에는 설명 전문이나 인증 정보를 남기지 않는다.

### 스키마 버전 경계

- `PRICING_ANALYSIS_INPUT_SCHEMA_VERSION`은 분석 생성의 정규화 body와 create fingerprint 규칙만
  버전화하며 새 행의 `input_fingerprint_schema_version`으로 함께 저장한다.
- `PRICING_APPLICATION_INPUT_SCHEMA_VERSION`은 분석 ID, 프로젝트 ID, CAS 입력을 포함한 apply
  fingerprint 규칙만 버전화한다.
- `PRICING_ANALYSIS_SCHEMA_VERSION`은 공급자 결과 검증과 저장된 `result_schema_version` 추적에만
  사용한다.

세 버전은 독립적으로 관리한다. create/apply 입력 계약 변경과 분석 결과 계약 변경을 같은 상수로
묶지 않으며, 결과 스키마 버전을 멱등 fingerprint에 대신 넣지 않는다.

### 검증된 결과

```ts
type PricingBreakdownItem = {
  name: string;        // trim 후 1~100자
  description: string; // trim 후 1~500자
  amount: number;
  rationale: string;   // trim 후 1~1000자
};

type ApprovedPricingAnalysisResult = {
  recommendedAmount: number;
  breakdown: PricingBreakdownItem[];
};
```

모든 `amount`는 KRW 원 단위이며 `1..2_147_483_647` 범위의 정수다. breakdown은 1~20건이고, 각
문자열은 위 길이 범위를 만족해야 한다. 모든 breakdown `amount`의 합은 오버플로 없이
`recommendedAmount`와 정확히 같아야 한다. 반올림, 음수 할인 항목, 부동소수점, 문자열 금액은
허용하지 않는다. adapter는 출력 토큰 상한을 걸고, HTTP 계층은 파싱 전에 응답 body 상한을 적용한다.

OpenAI Responses의 HTTP 200도 불신 입력이다. `object: "response"`, 최상위 `status: "completed"`,
없거나 null인 `error`·`incomplete_details`, 완료된 assistant message의 단일 `output_text`만 결과 JSON으로
파싱한다. reasoning item은 제품 데이터로 읽지 않는다. `refusal`, 복수 text, 알 수 없는 item/content,
`failed`·`incomplete`·`queued`·`cancelled`·`in_progress`, malformed JSON, Content-Length 또는 stream
누적 기준 256KiB 초과 응답은 모두 무효 결과다.

## 동기식 분석 생성 흐름

`POST /api/v1/pricing-analyses`는 다음 순서로 처리한다.

1. route의 전용 parser가 JSON 문법을 먼저 검증한다. malformed body는 원문을 노출하지 않고
   400 `MALFORMED_JSON`으로 끝낸다. 이후 인증, CLIENT 역할, `Idempotency-Key`, 입력 DTO, 공유
   카테고리 코드를 검증한다.
2. 정규화된 입력과 `PRICING_ANALYSIS_INPUT_SCHEMA_VERSION`으로 fingerprint를 만들고
   `(operation, requesterId, idempotencyKey)` 범위의 기존 결과를 먼저 조회한다. exact replay는 현재
   분석기 설정과 무관하게 저장 결과를 반환하되, 저장된 입력 버전·snapshot·요청자에서 fingerprint를
   재계산한 값까지 일치해야 한다.
3. 신규 요청이면 운영 환경 분석기와 사용자별 호출 제한 capability를 확인한다. 둘 중 하나라도
   없으면 레코드를 만들지 않고 503으로 끝낸다. 호출 제한 소비는
   `(requesterId, idempotencyKey, requestFingerprint)`에 대해 멱등이어야 해서 동시 exact replay가
   quota를 두 번 소비하지 않는다. 같은 사용자·키의 다른 fingerprint는 저장소 예약 실패 뒤에도
   409로 거부한다. 한도를 넘으면 행·공급자 호출 없이 429다. 호출 제한 포트의 반환값이
   `ALLOWED|LIMITED|IDEMPOTENCY_KEY_REUSED` 중 하나가 아니면 capability 실패 503으로 닫는다.
   요청자와 키 scope는 별도 필드 또는 충돌 없는 tuple 인코딩으로 보존하고 임의 구분자 연결을 쓰지
   않는다.
4. 키를 예약하며 `PENDING`과 create 입력 fingerprint 스키마 버전을 함께 저장하고, 경합으로 같은
   키가 생기면 fingerprint를 비교해 분석기를 다시 호출하지 않는다. 저장소 예약·CAS 반환값과 재조회
   행의 분석 ID·요청자·키·fingerprint·상태가
   계약과 다르면 성공으로 추정하지 않고 500으로 닫는다.
5. `PricingAnalyzerPort`를 호출해 구조화 출력을 요청한다. 외부 SDK와 모델명은 adapter 뒤에 둔다.
6. 응답을 신뢰하지 않고 정확한 허용 키, 이 문서의 결과 스키마와 합계 규칙으로 다시 검증한다.
7. 성공이면 `APPROVED`, 실패면 안전한 `failure_code`와 최초 공개 failure/HTTP 상태 사본을 가진
   `REJECTED`로 저장한 뒤 HTTP 결과를 반환한다. 외부 호출을 포함한 장시간 DB transaction은 열지
   않는다.

```ts
interface PricingAnalyzerPort {
  analyze(input: PricingAnalysisInputSnapshot): Promise<unknown>;
}

interface PricingAnalysisRateLimitPort {
  consumeNewAnalysis(input: {
    requesterId: string;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<"ALLOWED" | "LIMITED" | "IDEMPOTENCY_KEY_REUSED">;
}
```

adapter는 공급자의 structured-output 기능을 사용하되, 그 기능의 성공을 애플리케이션 검증 통과로
간주하지 않는다. 운영 모델은 현재 결과 JSON Schema의 모든 제약을 지원한다고 검증된 base model의
명시적 allowlist로 제한한다. allowlist 밖 모델과 `ft:` fine-tuned model은 설정 단계에서 거부하며,
운영 환경에서 분석기 키나 이 호환성 설정이 빠졌을 때 mock이나 고정 금액으로 대체하지 않는다.

## 공개 유스케이스

### 분석 생성과 조회

- 생성: `POST /api/v1/pricing-analyses`
- 조회: `GET /api/v1/pricing-analyses/:pricingAnalysisId`
- 두 API 모두 로그인한 CLIENT가 자기 분석에만 접근할 수 있다.
- 생성은 동기식 MVP다. 최초 정상 호출은 최종 `APPROVED` 응답을 기다린다. 동일 요청이 처리 중일 때
  들어온 exact replay에만 `PENDING` 응답이 가능하다.
- 202 `PENDING`을 받은 클라이언트는 응답의 `pricingAnalysisId`로 GET을 제한적으로 재조회한다.
  지수 backoff·최대 시도 횟수·전체 deadline을 적용한다. 각 GET 자체도 남은 deadline으로 취소해
  응답 정지가 전체 제한을 무력화하지 못하게 한다. deadline 뒤에도 PENDING이면 입력을 보존한 채
  자동 재실행 없이 복구 안내를 표시한다. stale PENDING을 같은 키로 재분석하지 않는다.
- 공개 응답에는 입력 스냅샷, 상태, 검증 결과 또는 안전한 실패 분류만 포함한다. 모델명, 공급자명,
  프롬프트, 공급자 응답 원문·오류 원문, 스택 트레이스는 포함하지 않는다.
- 브라우저는 정확한 키 집합·상태 불변식·금액/합계/시각을 런타임 검증한다. 생성은
  `202/PENDING` 또는 `200|201/APPROVED`, 조회는 `200`과 요청 분석 ID 일치만 허용한다. 다른 2xx,
  추가 필드, trim 정규화되지 않은 입력 snapshot, malformed DTO는 성공 화면으로 전환하지 않는다.

### 프로젝트 등록 중 채택

프로젝트 등록 화면은 분석 생성 응답의 `pricingAnalysisId`를 보관한다. 사용자가 추천 금액을 수정하지
않고 채택할 때만 `POST /api/v1/projects`의 선택 필드로 넘긴다. 별도 apply API를 호출하지 않는다.
사용자가 금액을 수정하면 `pricingAnalysisId`를 생략하고 일반 `budgetAmount`로 등록한다.

### 기존 프로젝트에 적용

기존 프로젝트에서만 다음 API를 사용한다.

```text
POST /api/v1/pricing-analyses/:pricingAnalysisId/apply
```

클라이언트는 추천 금액을 보내지 않는다. 서버가 저장된 `recommended_amount`를 사용한다. 단,
사용자가 확인한 현재 프로젝트 예산은 `expectedBudgetAmount`로 반드시 보내며 서버가 현재 DB 예산과
CAS 비교한다. 분석 소유자와 프로젝트 소유자가 모두 현재 CLIENT여야 하고, 분석은
`APPROVED`·미적용이어야 하며, 프로젝트 예산 수정 잠금 조건을 통과해야 한다.
`projects.budget_amount`, `pricing_analyses.project_id`, `pricing_analyses.applied_at`, 적용 멱등 결과는
전부 commit되거나 전부 rollback되어야 한다.

원자 포트 호출 전에는 조회한 저장 행을 위 상태 불변식으로 검증하고, 엄격한 `APPROVED` 행의 저장
추천 금액만 전달한다. 포트 결과도 정확한 키 집합, 요청 분석·프로젝트 ID, 저장 추천 금액, KRW,
유효 시각, `changed: true`, 0 이상 프로젝트 버전과 일치해야 한다. 알 수 없는 포트 오류 코드나
malformed·추가 필드·식별자 불일치 성공값은 안전한 500이며 성공으로 공개하지 않는다. 브라우저도
apply의 HTTP 200, 정확 DTO, 요청 분석·프로젝트 ID를 모두 확인한 뒤에만 적용 완료로 전환한다.

화면은 적용이 완료되면 적용 전 확인 문구와 `프로젝트 예산에 반영`·`반영하지 않기` action을 더 이상
노출하지 않는다. 대신 변경 전 금액, 변경 후 금액, 적용 완료 시각과 완료 후 이동 action만 표시한다.
입력 검증에 실패하면 폼 상단 오류 요약으로 포커스를 옮기고, 요약의 각 항목은 해당 입력 필드로
이동할 수 있는 링크여야 한다.

```ts
interface ProjectBudgetApplicationPort {
  applyPricingAnalysisBudget(
    input: AtomicPricingBudgetApplicationInput,
  ): Promise<AtomicPricingBudgetApplicationResult>;
}
```

이 포트의 실제 adapter가 위 원자성을 보장하지 않거나 사용할 수 없으면 API는 mutation을 시작하지
않고 `503 PRICING_APPLICATION_UNAVAILABLE`을 반환한다. 읽기 전용 금액 조회 후 각 도메인을 따로
갱신하는 구현은 허용하지 않는다.

## Step 1 내부 계약 — 보존

### 신규 프로젝트 생성 트랜잭션의 claim

`POST /api/v1/projects`가 선택 필드 `pricingAnalysisId`를 받으면 project-management가 자기 생성
transaction 안에서 아래 포트를 호출한다. 이는 공개 API가 아니다.

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

분석은 요청자 소유, `APPROVED`, `applied_at IS NULL`, `project_id IS NULL`이어야 한다. 조건부 갱신으로
`project_id`와 `applied_at`을 기록하고 DB의 추천 금액을 반환한다. 대상 행이 없으면
`PRICING_ANALYSIS_NOT_CLAIMABLE`이며 프로젝트 생성 전체가 409로 rollback된다. 포트는 전달받은
transaction을 사용하고 별도 transaction을 열거나 commit하지 않는다.

### 기존 프로젝트용 Step 1 읽기 포트

현재 프로토타입의 다음 계약도 호환성 때문에 유지한다.

```ts
getPricingAnalysisRecommendation({ analysisId, projectId, requesterId })
```

이는 소유자·승인 상태·프로젝트 연결을 검증한 뒤 저장된 `recommendedAmount`만 반환하고 상태를
변경하지 않는다. 조회·표시 또는 원자 포트 내부 구현 보조 용도로만 쓸 수 있으며, 이 읽기 결과를
받아 두 저장소를 순차 갱신하는 공개 apply 구현의 근거가 될 수 없다.

기존 project-management 계약의 요청 메타데이터 `requestId`, `idempotencyKey`, `occurredAt`, 선택
`expectedProjectVersion`과 응답 `alreadyProcessed`, `processedAt`, `changed`, `projectVersion`도
유지한다. apply용 내부 키는 `pricing-apply-{pricingAnalysisId}`다. 예산 변경은 기존 D-53 계약대로
`projectVersion`을 증가시키지 않으므로, Step 2 공개 apply에서는 화면에 표시했던
`expectedBudgetAmount`를 추가로 필수 전달해 같은 transaction에서 현재 예산과 비교한다.

## 업무 규칙

1. 분석 생성·조회·적용은 인증된 `CLIENT`만 가능하고, 분석 요청자 및 대상 프로젝트 등록 의뢰인이
   현재 사용자와 같아야 한다.
2. 생성 입력은 trim·길이·공유 카테고리 검증 후 `{title, description, category}`로 스냅샷하며 생성
   이후 프로젝트가 수정돼도 과거 분석 입력을 바꾸지 않는다.
3. 모든 POST에는 `Idempotency-Key`가 필수다. 같은 키와 같은 fingerprint는 최초 결과를 재생하고,
   같은 키와 다른 fingerprint는 `409 IDEMPOTENCY_KEY_REUSED`다. create 키의 unique 범위는 사용자별
   `(requesterId, idempotencyKey)`이며 다른 사용자의 같은 문자열 키는 서로 충돌하거나 노출되지 않는다.
4. 분석 재시도는 terminal 행을 재활성화하지 않고 새 키로 새 `pricing_analyses` 행을 만든다.
5. 분석기는 `PricingAnalyzerPort` 뒤에 두고 structured output을 요청하며, 공급자·모델·원문 오류를
   공개 API 계약에 노출하지 않는다. 명시적 allowlist의 schema-compatible base model만 허용하고
   `ft:` fine-tuned model과 allowlist 밖 모델은 거부한다. Responses HTTP 200도 완료 envelope와 단일
   완료 assistant `output_text`를 통과하기 전에는 성공이 아니다.
6. 운영 환경에서 분석기 키, 모델 allowlist 또는 필수 설정이 없으면
   `503 PRICING_ANALYZER_UNAVAILABLE`이고 mock fallback이나 미검증 저장을 하지 않는다.
7. 분석기 결과는 불신 입력이다. breakdown 항목과 총액은 양의 KRW 정수여야 하고 항목 합계가 총액과
   정확히 일치해야만 `APPROVED`가 된다.
8. `PENDING`은 exact replay 조회에만 202로 보일 수 있고, `APPROVED`와 `REJECTED`는 불변 terminal
   상태다. 검증 완료 시각을 `reviewed_at`에 기록한다.
9. 프로젝트 등록 중 추천 채택은 프로젝트 생성 요청의 `pricingAnalysisId` handoff만 사용한다. 등록
   완료 후 별도 apply 호출을 이어 붙이지 않는다.
10. 기존 프로젝트 apply는 클라이언트가 보낸 추천 금액을 받지 않으며, 프로젝트 잠금·버전·분석
    상태와 `expectedBudgetAmount`를 검증하고 두 도메인 변경과 멱등 결과를 원자적으로 commit한다.
11. 원자적 `ProjectBudgetApplicationPort`가 없거나 의존 도메인 판정을 안전하게 수행할 수 없으면
    fail-closed 503이며 어느 쪽 데이터도 변경하지 않는다.
12. 동일 적용 요청의 exact replay는 저장된 최초 성공을 200으로 반환한다. 같은 분석의 다른 요청,
    다른 프로젝트, 다른 fingerprint, 이미 등록 claim으로 소비된 분석은 409다.
13. breakdown은 항목 수·문자열 길이·금액·합계 상한을 모두 통과해야 하며, 사용자별 요청 제한과
    공급자 출력 토큰 상한 없이 운영 route를 활성화하지 않는다.

## 실패와 공개 정보 원칙

- 사용자 입력·권한·상태 충돌은 각각 4xx로 구분한다.
- 공급자 실패·무효 구조화 출력은 502, 애플리케이션이 정한 외부 호출 시간초과는 504다.
- 분석기 설정 또는 원자 적용 capability 부재는 503이다.
- 사용자별 호출 제한 capability 부재도 fail-closed 503이다.
- 호출 제한·저장소·프로젝트 적용 포트가 정의되지 않은 값이나 식별자 불일치 결과를 반환하면
  fail-closed 503/500이며 추정 성공하지 않는다.
- repository가 던진 예외는 그 타입이 `PricingAnalysisApiError`여도 신뢰하지 않고 임의 code/status/body를
  버린 안전한 500으로 정규화한다. project application 포트는 열거된
  `ProjectBudgetApplicationError`만 매핑하며, 임의 `PricingAnalysisApiError`와 다른 예외는 안전한
  500이다. 포트 성공값 검증은 이 예외 매핑 경계 밖에서 수행한다.
- 저장 실패는 500이며 성공으로 응답하지 않는다.
- 사용자별 호출 제한 초과는 분석기를 호출하거나 행을 만들지 않고 429다.
- 공개 `failure.code`는 allowlist 값만 사용하고 `message`는 제품 문구다. 공급자 응답 body, 모델명,
  API 키 일부, 내부 exception message를 `details`나 로그의 일반 필드로 전달하지 않는다.

## 검증 기준

- 같은 생성 키·동일 fingerprint의 직렬/동시 호출에서 분석기 호출은 최대 한 번이다.
- 같은 키·다른 입력은 분석기를 호출하지 않고 409다.
- 동시 exact replay는 호출 제한 quota를 한 번만 소비하며, 새 키가 한도를 넘으면 행과 분석기 호출
  없이 429다. 호출 제한 capability가 없거나 실패하면 행 생성 없이 503이다.
- 양수 정수, 1~20개 breakdown, 문자열 길이, 정확한 합계의 경계값을 단위 테스트한다.
- 형식상 유효한 저장 snapshot도 요청자·저장 입력 스키마 버전으로 fingerprint를 재계산한 값이
  `request_fingerprint`와 다르면 저장 오류로 닫는지 확인한다.
- 공급자 오류·시간초과·무효 JSON은 각각 안전한 `REJECTED` 상태와 공개 오류로 매핑된다.
- malformed 요청 JSON은 DTO 검증 전 parser 경계에서 400 `MALFORMED_JSON`이고 원문을 노출하지 않는다.
- HTTP 200이더라도 미완료/실패/대기/취소 Responses envelope, refusal, 복수/알 수 없는 출력,
  malformed·256KiB 초과 body를 거부한다.
- 생성 exact replay는 `PENDING` 202, `APPROVED` 200, `REJECTED` 최초 502/504 상태·오류 body를
  보존하며 현재 mapping으로 재계산하거나 분석기를 다시 호출하지 않는다.
- 타 역할·타 소유자 생성/조회/apply를 거부한다.
- 신규 등록 claim 실패 시 프로젝트와 분석 변경이 모두 rollback된다.
- 기존 프로젝트 apply의 성공, exact replay, 경쟁 요청, 지원 존재, 버전 충돌, 포트 부재를 통합
  테스트하고 저장 `APPROVED` 불변식과 포트 성공 DTO/식별자도 재검증하며 모든 실패에서 부분 갱신이
  없음을 확인한다.
- 브라우저가 endpoint별 HTTP 상태, 정확 DTO와 요청 분석·프로젝트 ID binding이 맞을 때만 성공 상태로
  전환하고 임의의 2xx·추가 필드 응답을 거부하는지 확인한다.
- 202 PENDING 재조회는 backoff·최대 횟수·취소·deadline을 지키고 새 분석을 만들지 않는지 확인한다.
- 화면에 표시한 예산과 DB 현재 예산이 달라지면 `PROJECT_BUDGET_CONFLICT`이고 어느 값도 바뀌지
  않는지 확인한다.

## 팀장 통합 시 확인

PRD v6.4 D-60·D-67에는 신규 claim 함수가 미채택으로 남아 있지만, 현재 feature 계약과
project-management 구현은 동일한 공개 등록 API 안에서 이 내부 포트를 사용한다. 외부 등록 경로는
여전히 하나이므로 Step 1 계약을 유지한다. 팀장 통합 시 여섯 change request와 `docs/domain/` 사본을
동기화하고, 중복된 카테고리 상수와 읽기-후-쓰기 apply 경로가 남지 않았는지 확인한다.
