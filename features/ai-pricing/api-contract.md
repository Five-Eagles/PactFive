# ai-pricing — API 계약

기준: `spec.md` Step 2 동기식 MVP

Base path: `/api/v1`

## 공통 계약

### 인증과 권한

모든 엔드포인트는 `Authorization: Bearer <token>`을 요구한다. 호출자는 `CLIENT`여야 한다. 조회와
적용에서는 `pricing_analyses.requester_id`가 인증 사용자와 같아야 하며, 적용 대상 프로젝트의
등록 의뢰인도 같은 사용자여야 한다. 존재 여부를 통한 타인 분석 열거를 막기 위해 없는 분석과
타인 분석은 모두 404 `PRICING_ANALYSIS_NOT_FOUND`로 응답한다.

### POST 멱등 헤더

```http
Idempotency-Key: <8..100자의 공백 없는 printable ASCII>
```

두 POST 모두 필수다. 멱등 조회 범위는 `(operation, actorUserId, key)`다. 이 tuple은 별도 컬럼이나
충돌 없는 구조 인코딩으로 보존하며 `actorUserId + ':' + key` 같은 구분자 문자열 결합은 금지한다.
fingerprint는 endpoint 작업 종류, 인증 사용자 ID, path 식별자, 정규화된 body, 해당 작업의 입력
fingerprint 스키마 버전으로
결정한다. 다른 사용자나 다른 operation의 같은 문자열 키는 서로의 존재를 드러내거나 충돌시키지
않는다.

버전의 목적은 서로 분리한다.

| 버전 | 용도 |
|---|---|
| `PRICING_ANALYSIS_INPUT_SCHEMA_VERSION` | 분석 생성 body를 정규화해 create fingerprint를 계산하고 행의 `input_fingerprint_schema_version`에 저장하는 규칙 |
| `PRICING_APPLICATION_INPUT_SCHEMA_VERSION` | 분석 ID·적용 body를 정규화해 apply fingerprint를 계산하는 규칙 |
| `PRICING_ANALYSIS_SCHEMA_VERSION` | 공급자 결과 검증과 저장 행의 `result_schema_version` 추적 |

create와 apply는 서로의 입력 버전을 공유하지 않으며, 결과 스키마 버전을 입력 fingerprint 버전으로
대체하지 않는다. 한 계약이 바뀌면 해당 버전만 독립적으로 올린다.

- 같은 키 + 같은 fingerprint: 분석기나 mutation을 다시 실행하지 않고 저장된 논리 결과를 재생한다.
  분석 생성은 `PENDING` replay에 202, `APPROVED` terminal replay에 200을 반환한다. `REJECTED`
  terminal replay는 최초 실패의 502/504 HTTP 상태, 오류 code와 body를 그대로 반환한다. 적용 성공
  replay는 저장된 body와 함께 200이다.
- 같은 키 + 다른 fingerprint: 409 `IDEMPOTENCY_KEY_REUSED`.
- 처리 중인 분석 생성의 exact replay: 현재 `PENDING` 표현과 202를 반환하며 두 번째 분석기 호출은
  하지 않는다. terminal이 된 뒤에는 위 상태별 HTTP 코드와 최초 body를 재생한다.
- 분석 생성 재시도는 새 키를 써야 하며 새 `pricingAnalysisId`가 생긴다.
- 위 규칙은 `REJECTED`를 확인한 새 분석 시도에 해당한다. 응답 유실·네트워크 단절·모호한 5xx는
  마지막 키를 보존해 먼저 exact replay하고 중복 행·중복 과금을 만들지 않는다.
- 기존 프로젝트 적용 키는 `pricing-apply-{pricingAnalysisId}`를 사용한다.

### 오류 DTO

```ts
type ApiError = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown> | null;
  };
};
```

`details`에도 공급자명·모델명·프롬프트·외부 응답/오류 원문·API key·stack trace를 넣지 않는다.

## 공개 DTO

```ts
type PricingAnalysisInputSnapshotDto = {
  title: string;
  description: string;
  category: ProjectCategory;
};

type PricingBreakdownItemDto = {
  name: string;        // trim 후 1~100자
  description: string; // trim 후 1~500자
  amount: number; // KRW 원 단위 양의 정수
  rationale: string;   // trim 후 1~1000자
};

type PricingAnalysisBaseDto = {
  pricingAnalysisId: string;
  inputSnapshot: PricingAnalysisInputSnapshotDto;
  createdAt: string;
  reviewedAt: string | null;
  appliedAt: string | null;
};

type PendingPricingAnalysisDto = PricingAnalysisBaseDto & {
  reviewStatus: "PENDING";
  result: null;
  failure: null;
};

type ApprovedPricingAnalysisDto = PricingAnalysisBaseDto & {
  reviewStatus: "APPROVED";
  result: {
    currency: "KRW";
    recommendedAmount: number;
    breakdown: PricingBreakdownItemDto[];
  };
  failure: null;
};

type RejectedPricingAnalysisDto = PricingAnalysisBaseDto & {
  reviewStatus: "REJECTED";
  result: null;
  failure: {
    code:
      | "PRICING_ANALYSIS_PROVIDER_FAILED"
      | "PRICING_ANALYSIS_TIMEOUT"
      | "PRICING_ANALYSIS_INVALID_RESULT";
    message: string;
    retryable: boolean;
  };
};

type PricingAnalysisDto =
  | PendingPricingAnalysisDto
  | ApprovedPricingAnalysisDto
  | RejectedPricingAnalysisDto;
```

서버와 브라우저는 위 DTO를 타입 선언만으로 신뢰하지 않는다. 정확한 키 집합, ID·시각·금액 형식,
breakdown 합계와 상태별 nullability를 런타임에서 다시 검증한다. `PENDING`은 결과·실패·검토·적용
정보가 모두 없어야 하고, `APPROVED`만 검증된 결과를 가지며, `REJECTED`는 결과·적용 정보 없이
영속화된 공개 실패 사본만 가져야 한다. 저장 행이 이 불변식을 어기면 500
`PRICING_ANALYSIS_STORAGE_FAILED`로 닫는다.
브라우저의 `inputSnapshot.title`과 `description`도 길이만 맞으면 되는 것이 아니라 trim 전후가 같은
정규화 문자열이어야 한다.

저장 행의 create `request_fingerprint`도 단순 형식만 확인하지 않는다. 내부 컬럼
`input_fingerprint_schema_version`을 읽어 `requesterId`, 정규화된 `inputSnapshot`, 작업 종류와 함께
동일한 canonical 규칙으로 다시 계산하며, 저장 hash와 정확히 같을 때만 replay·조회·apply에 사용한다.
해당 버전 컬럼은 공개 DTO에 포함하지 않는다.

브라우저는 성공 HTTP 범위 전체를 임의로 허용하지 않는다. 생성은 `202/PENDING` 또는
`200|201/APPROVED`, 조회는 `200`과 요청한 분석 ID, 적용은 `200`과 요청한 분석·프로젝트 ID가
모두 일치해야 한다. 각 body도 추가 키를 허용하지 않는 정확 DTO여야 하며, 위 조합과 다른 2xx는
성공 상태로 전환하지 않고 안전한 클라이언트 오류로 처리한다.

`ProjectCategory`의 코드 목록은 현재 문서 충돌이 있다. feature 프로토타입은 현재 런타임의 6개
코드를 `pricing-analysis.constants.ts` 한 곳에서만 임시 사용한다. 운영 배포에서는
project-management의 공유 validator를 사용하며 CR-AP-002 승인 후 한 목록으로 고정한다.

## 1. 분석 생성

```http
POST /api/v1/pricing-analyses
Authorization: Bearer <token>
Idempotency-Key: 9f884f24-1234-4cab-a2c3-a084b91877ff
Content-Type: application/json
```

### 요청

```json
{
  "title": "B2B 주문 관리 웹 서비스 구축",
  "description": "관리자와 파트너사가 주문, 재고, 정산 현황을 관리하는 반응형 웹 서비스가 필요합니다.",
  "category": "WEB_DEVELOPMENT"
}
```

| 필드 | 타입 | 필수 | 검증 |
|---|---|---|---|
| `title` | string | 필수 | trim 후 5~100자 |
| `description` | string | 필수 | trim 후 20~5000자 |
| `category` | `ProjectCategory` | 필수 | 공유 validator의 활성 코드 한 개 |

알 수 없는 필드는 거부한다. 서버는 정규화한 세 필드만 `inputSnapshot`으로 저장한다.

### 처리와 응답

최초 요청은 같은 HTTP 요청 안에서 분석기 호출, 불신 검증, 저장까지 마친다.

#### 201 — APPROVED

```json
{
  "pricingAnalysisId": "pra_01JXYZ123",
  "reviewStatus": "APPROVED",
  "inputSnapshot": {
    "title": "B2B 주문 관리 웹 서비스 구축",
    "description": "관리자와 파트너사가 주문, 재고, 정산 현황을 관리하는 반응형 웹 서비스가 필요합니다.",
    "category": "WEB_DEVELOPMENT"
  },
  "result": {
    "currency": "KRW",
    "recommendedAmount": 5200000,
    "breakdown": [
      {
        "name": "주문 관리",
        "description": "주문 생성, 상태 변경, 검색 기능",
        "amount": 3000000,
        "rationale": "관리자와 파트너 권한별 주문 흐름 구현 비용"
      },
      {
        "name": "재고·정산 대시보드",
        "description": "재고와 정산 현황 집계 화면",
        "amount": 2200000,
        "rationale": "집계 API와 반응형 시각화 구현 비용"
      }
    ]
  },
  "failure": null,
  "createdAt": "2026-09-04T03:00:00.000Z",
  "reviewedAt": "2026-09-04T03:00:07.000Z",
  "appliedAt": null
}
```

breakdown은 1~20건이고 모든 금액은 `1..2147483647`의 KRW 정수다. `name`은 1~100자,
`description`은 1~500자, `rationale`은 1~1000자이며 항목 금액 합계는 `recommendedAmount`와
정확히 같아야 한다. adapter는 출력 토큰 상한을 적용하고 HTTP 계층은 JSON 파싱 전 body 크기를
제한한다.

OpenAI Responses API가 HTTP 200을 반환해도 곧바로 성공으로 취급하지 않는다. adapter는 최상위
`object: "response"`, `status: "completed"`, `error`·`incomplete_details`가 없거나 null이고 완료된
assistant message의 단일 `output_text`만 허용한다. reasoning item은 제품 데이터로 파싱하지 않는다.
`refusal`, 복수 `output_text`, 알 수 없는 content/output 형태, `failed`·`incomplete`·`queued`·
`cancelled`·`in_progress` 상태, malformed JSON, 선언 또는 stream 누적 기준 256KiB 초과 body는 모두
`PRICING_ANALYSIS_INVALID_RESULT`로 안전하게 거부한다. 공급자 원문은 공개 오류에 포함하지 않는다.

#### 202 — 동일 요청이 아직 PENDING

최초 호출이 진행 중일 때 도착한 exact replay에만 반환한다.

```json
{
  "pricingAnalysisId": "pra_01JXYZ123",
  "reviewStatus": "PENDING",
  "inputSnapshot": {
    "title": "B2B 주문 관리 웹 서비스 구축",
    "description": "관리자와 파트너사가 주문, 재고, 정산 현황을 관리하는 반응형 웹 서비스가 필요합니다.",
    "category": "WEB_DEVELOPMENT"
  },
  "result": null,
  "failure": null,
  "createdAt": "2026-09-04T03:00:00.000Z",
  "reviewedAt": null,
  "appliedAt": null
}
```

클라이언트는 `pricingAnalysisId`로 GET을 지수 backoff하며 제한 횟수만 재조회한다. 각 GET은 전체
deadline의 남은 시간으로 취소한다. deadline을 넘겨도 PENDING이면 자동으로 새 분석을 만들지 않고
입력을 보존한 복구 상태를 표시한다.

#### terminal 실패

공급자/출력 실패도 `REJECTED` 분석을 남긴다. 오류 body의 `details.analysis`에는 위
`RejectedPricingAnalysisDto`를 넣어 사용자가 안전한 상태와 새 키 재시도 가능 여부를 알 수 있게
한다. 최초 공개 failure 사본과 502/504 상태를 함께 영속화하며, exact replay는 현재 제품 문구를
다시 만들지 않고 이 사본으로 같은 상태와 body를 반환한다. 분석기도 다시 호출하지 않는다.

| HTTP | code | 저장 상태 | 의미 |
|---|---|---|---|
| 502 | `PRICING_ANALYSIS_PROVIDER_FAILED` | `REJECTED` | 공급자 호출 실패 |
| 502 | `PRICING_ANALYSIS_INVALID_RESULT` | `REJECTED` | 구조·타입·양수 정수·합계 검증 실패 |
| 504 | `PRICING_ANALYSIS_TIMEOUT` | `REJECTED` | 애플리케이션 deadline 초과 |

### 그 밖의 오류

| HTTP | code | 조건 |
|---|---|---|
| 400 | `MALFORMED_JSON` | JSON 파싱 불가 |
| 401 | `AUTH_REQUIRED` | 인증 없음/실패 |
| 403 | `PRICING_ANALYSIS_ROLE_REQUIRED` | CLIENT가 아님 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 같은 키와 다른 fingerprint |
| 429 | `PRICING_ANALYSIS_RATE_LIMITED` | 사용자별 분석 생성 한도 초과; 공급자 호출·행 생성 없음 |
| 422 | `IDEMPOTENCY_KEY_REQUIRED` | 키 누락 또는 형식 오류 |
| 422 | `VALIDATION_ERROR` | 필드 누락, 길이·타입 위반, 알 수 없는 필드 |
| 422 | `INVALID_CATEGORY` | 공유 목록에 없는 category |
| 500 | `PRICING_ANALYSIS_STORAGE_FAILED` | 예약 또는 terminal 저장 실패 |
| 503 | `PRICING_ANALYZER_UNAVAILABLE` | 운영 환경 key/필수 설정 누락, 모델 allowlist 미포함 또는 fine-tuned model |
| 503 | `PRICING_ANALYSIS_RATE_LIMIT_UNAVAILABLE` | 분산 호출 제한 capability 누락/장애 |

신규 요청의 503 설정 실패는 분석 레코드를 만들기 전에 반환한다. 호출 제한 소비는
`(requesterId, idempotencyKey, requestFingerprint)`를 원자적으로 묶으므로 동시 exact replay가
quota를 중복 소비하지 않는다. 같은 사용자·키의 다른 fingerprint는 앞선 분석 행 예약이 실패했어도
409 `IDEMPOTENCY_KEY_REUSED`다. 이미 저장된 exact replay는 현재 설정·호출 제한 잔량과 관계없이
재생한다. 운영 환경에서
mock 결과로 성공시키지 않는다. OpenAI adapter는 현재 결과 JSON Schema의 모든 제약을 지원한다고
검증된 base model의 명시적 allowlist만 허용한다. allowlist 밖 모델과 `ft:` fine-tuned model은
분석 행을 만들기 전에 503 `PRICING_ANALYZER_UNAVAILABLE`로 거부한다.

HTTP route는 body를 DTO validator에 넘기기 전에 전용 JSON parser 경계를 거친다. 문법이 깨진 JSON은
원문이나 parser exception을 노출하지 않고 400 `MALFORMED_JSON`으로 응답한다. 호출 제한 포트가
`ALLOWED|LIMITED|IDEMPOTENCY_KEY_REUSED` 이외의 값, 저장소가 정의되지 않은 예약·CAS 결과 또는
요청자·키·fingerprint·분석 ID가 맞지 않는 행을 반환하면 성공으로 추정하지 않고 503 또는 안전한
500으로 fail-closed한다. 신규 `PENDING` 예약에는 create fingerprint와 이를 계산한 입력 스키마
버전을 함께 저장해야 한다.

repository가 던진 값도 신뢰 경계 밖이다. 내부에서 `PricingAnalysisApiError` 모양으로 위장한 예외를
포함해 모든 repository throw는 원문·임의 status/code를 버리고 동일한 안전한 500
`PRICING_ANALYSIS_STORAGE_FAILED`로 정규화한다.

## 2. 분석 단건 조회

```http
GET /api/v1/pricing-analyses/:pricingAnalysisId
Authorization: Bearer <token>
```

### 응답

- 200: 현재 상태의 `PricingAnalysisDto`. GET에서는 `PENDING`, `APPROVED`, `REJECTED` 모두 HTTP
  200이고 body의 `reviewStatus`로 구분한다.
- `REJECTED.failure`에는 allowlist 코드, 제품 메시지, `retryable`만 포함한다.
- `modelName`, `provider`, `promptVersion`, `resultSchemaVersion`, 공급자 원문 오류는 반환하지 않는다.

### 오류

| HTTP | code | 조건 |
|---|---|---|
| 400 | `INVALID_PRICING_ANALYSIS_ID` | path ID 형식 오류 |
| 401 | `AUTH_REQUIRED` | 인증 없음/실패 |
| 403 | `PRICING_ANALYSIS_ROLE_REQUIRED` | CLIENT가 아님 |
| 404 | `PRICING_ANALYSIS_NOT_FOUND` | 없거나 현재 사용자가 소유하지 않음 |
| 500 | `PRICING_ANALYSIS_STORAGE_FAILED` | 저장소 조회 실패 |

## 3. 기존 프로젝트 예산 적용

프로젝트가 이미 등록된 경우에만 사용한다. 프로젝트 등록 도중에는 이 API를 호출하지 않는다.

```http
POST /api/v1/pricing-analyses/:pricingAnalysisId/apply
Authorization: Bearer <token>
Idempotency-Key: pricing-apply-pra_01JXYZ123
Content-Type: application/json
```

### 요청

```json
{
  "projectId": "prj_01JABC456",
  "expectedBudgetAmount": 3500000,
  "expectedProjectVersion": 3
}
```

| 필드 | 타입 | 필수 | 검증 |
|---|---|---|---|
| `projectId` | string | 필수 | `prj_...` 식별자 |
| `expectedBudgetAmount` | integer | 필수 | 사용자가 화면에서 확인한 현재 KRW 예산, 1..2147483647 |
| `expectedProjectVersion` | integer | 선택 | 0 이상. 전달하면 현재 버전과 비교 |

추천 `amount`나 새 `budgetAmount`는 받지 않는다. `expectedBudgetAmount`는 추천값이 아니라 stale 화면
덮어쓰기를 막는 CAS 전제값이며, 서버의 현재 프로젝트 예산과 다르면 변경하지 않는다.

### 200 응답

```json
{
  "pricingAnalysisId": "pra_01JXYZ123",
  "projectId": "prj_01JABC456",
  "budgetAmount": 5200000,
  "currency": "KRW",
  "appliedAt": "2026-09-04T03:05:00.000Z",
  "processedAt": "2026-09-04T03:05:00.000Z",
  "changed": true,
  "projectVersion": 3
}
```

exact replay는 저장된 위 최초 상태와 body를 그대로 200으로 반환한다. 최초 응답의 `changed`도 재생
대상이므로 replay에서 `false`로 바꾸지 않는다. 내부 Step 1 포트의 `alreadyProcessed` 플래그가
필요한 호출자는 멱등 저장소의 별도 메타데이터를 사용한다.

성공 시 다음이 하나의 원자 단위다.

1. 현재 `projects.budget_amount = expectedBudgetAmount`인지 잠금 상태에서 검증
2. `projects.budget_amount`를 저장된 추천 금액으로 변경
3. `pricing_analyses.project_id`와 `applied_at` 기록
4. 키·fingerprint·HTTP 상태·응답 body로 멱등 결과 기록

`ProjectBudgetApplicationPort`가 세 결과를 원자적으로 commit할 수 없으면 mutation 없이 503이다.
포트를 호출하기 전 서버는 저장 행 전체를 다시 검증해 현재 요청자 소유의 엄격한 `APPROVED` 상태와
검증된 저장 추천 금액인지 확인한다. 포트 성공값도 정확한 키 집합, 분석·프로젝트 ID, 저장 추천 금액,
KRW, 시각, `changed: true`, 프로젝트 버전을 다시 검증한다. 알 수 없는 포트 오류 코드나 malformed·
추가 필드·식별자 불일치 결과는 성공으로 반환하지 않고 500 `PRICING_APPLICATION_STORAGE_FAILED`로
닫으며 분석과 프로젝트의 부분 성공을 인정하지 않는다.

포트가 던진 오류 중 계약에 열거된 `ProjectBudgetApplicationError` 코드만 위 4xx/503으로 매핑한다.
포트가 임의 `PricingAnalysisApiError` 또는 다른 예외를 던져도 그 status/code/body를 그대로 공개하지
않고 안전한 500으로 정규화한다. 성공 DTO 검증은 포트 예외 매핑 경계 밖에서 별도로 수행하여,
malformed 성공값이 포트가 의도한 공개 오류로 둔갑하지 않게 한다.

### 오류

| HTTP | code | 조건 |
|---|---|---|
| 400 | `INVALID_PRICING_ANALYSIS_ID` | path ID 형식 오류 |
| 400 | `INVALID_PROJECT_ID` | project ID 형식 오류 |
| 401 | `AUTH_REQUIRED` | 인증 없음/실패 |
| 403 | `PRICING_ANALYSIS_ROLE_REQUIRED` | CLIENT가 아님 |
| 403 | `PROJECT_FORBIDDEN` | 현재 사용자가 대상 프로젝트 등록 의뢰인이 아님 |
| 404 | `PRICING_ANALYSIS_NOT_FOUND` | 분석이 없거나 현재 사용자 소유가 아님 |
| 404 | `PROJECT_NOT_FOUND` | 프로젝트가 없거나 삭제됨 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 같은 키와 다른 fingerprint |
| 409 | `PRICING_ANALYSIS_NOT_APPROVED` | 분석이 PENDING/REJECTED |
| 409 | `PRICING_ANALYSIS_ALREADY_APPLIED` | exact replay가 아닌 요청이 소비된 분석을 적용 |
| 409 | `PROJECT_EDIT_LOCKED` | 대기 중 지원이 한 건 이상 |
| 409 | `PROJECT_EDIT_CLOSED` | 모집 마감 또는 거래 단계라 예산 수정 불가 |
| 409 | `PROJECT_VERSION_CONFLICT` | 예상 프로젝트 버전 불일치 |
| 409 | `PROJECT_BUDGET_CONFLICT` | 화면에서 확인한 예산과 현재 DB 예산이 다름 |
| 422 | `IDEMPOTENCY_KEY_REQUIRED` | 키 누락/형식 오류 또는 정해진 apply 키 불일치 |
| 422 | `VALIDATION_ERROR` | body 타입 또는 필드 위반 |
| 500 | `PRICING_APPLICATION_STORAGE_FAILED` | 원자 transaction 자체 실패; 전부 rollback |
| 503 | `PRICING_APPLICATION_UNAVAILABLE` | 원자 포트가 없거나 의존 판정을 안전하게 수행할 수 없음 |

오류에서는 `projects`와 `pricing_analyses` 어느 쪽도 부분 변경하지 않는다.

## 4. 프로젝트 등록 handoff — 기존 API 보존

등록 중 분석을 채택하면 별도 ai-pricing apply API 없이 project-management의 기존 요청에 넘긴다.

```http
POST /api/v1/projects
```

```json
{
  "title": "B2B 주문 관리 웹 서비스 구축",
  "description": "관리자와 파트너사가 주문, 재고, 정산 현황을 관리하는 반응형 웹 서비스가 필요합니다.",
  "category": "WEB_DEVELOPMENT",
  "recruitmentDeadlineAt": "2026-10-04T03:00:00.000Z",
  "budgetAmount": 5200000,
  "skillIds": ["REACT", "NODEJS", "SQL"],
  "pricingAnalysisId": "pra_01JXYZ123"
}
```

- 추천 금액을 그대로 채택할 때만 `pricingAnalysisId`를 보낸다. 수정했다면 생략한다.
- ID가 있으면 클라이언트의 `budgetAmount`를 신뢰하지 않고 claim이 반환한 DB 추천 금액을 쓴다.
- project-management는 생성 transaction 안에서
  `claimPricingAnalysisForCreatedProject(transaction, input)`을 호출한다.
- 내부 claim의 `PRICING_ANALYSIS_NOT_CLAIMABLE`은 프로젝트 생성 API의 409
  `PRICING_ANALYSIS_NOT_APPLICABLE`로 매핑하며, 프로젝트 생성과 분석 연결을 모두 rollback한다.

## 내부 포트 호환성

Step 1의 공개 import 진입점과 다음 함수명은 유지한다.

- `claimPricingAnalysisForCreatedProject(transaction, input)` — 신규 프로젝트 등록 transaction 전용
- `getPricingAnalysisRecommendation(query)` — 저장 추천 금액 읽기 전용
- `applyPricingAnalysisBudget` — 기존 프로젝트용 project-management 계약명

읽기 전용 포트만으로 공개 apply를 구현하지 않는다. `spec.md`의 원자적
`ProjectBudgetApplicationPort` capability가 준비된 경우에만 `/apply` route를 활성화한다.
