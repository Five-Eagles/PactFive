# project-management — API 계약

형식은 `docs/naming-convention.md` §7(REST API), §6(DTO 패턴)을 따른다. 규칙 번호는 `spec.md`를 가리킨다.

**두 종류가 있다.**

| 구분 | 개수 | 누가 부르나 | 인증 |
|---|---|---|---|
| 공개 API `/api/v1` | 9종 (A-01~A-08 · A-13) | 브라우저 | `Authorization: Bearer <accessToken>` |
| **내부 계약** `/internal/v1` | **8종** | **다른 도메인 서버** | **서비스 토큰. 사용자 토큰으로는 거부** (규칙 49) |

북마크·추천(A-09~A-12)은 `features/engagement/api-contract.md`에 있다.

---

## 공통 규약

식별자는 접두어가 붙은 문자열이다 (`prj_...` · `usr_...` · `app_...`).

목록 응답은 전부 같은 껍데기를 쓴다.

```json
{ "items": [], "page": 1, "pageSize": 20, "totalCount": 0, "totalPages": 0 }
```

오류 응답도 하나의 형태를 쓴다.

```json
{ "error": { "code": "PROJECT_EDIT_LOCKED", "message": "지원자가 있어 예산과 일정은 변경할 수 없습니다.", "details": null } }
```

모든 응답에서 **`transactionStatus`는 등록 의뢰인에게만 나간다.** 그 외에는 키 자체가 없다 (규칙 9).

---

# 공개 API

## POST /api/v1/projects — 등록

권한: 의뢰인 · 프로필 완성 (규칙 6·7)

요청:

```json
{
  "title": "쇼핑몰 웹사이트 구축",
  "description": "자사 브랜드 온라인 스토어를 새로 만들려고 합니다. 상품 등록과 결제 연동이 필요합니다.",
  "category": "WEB_DEVELOPMENT",
  "recruitmentStartAt": null,
  "recruitmentDeadlineAt": "2026-09-16T14:59:59Z",
  "budgetAmount": 5000000,
  "skillIds": ["REACT", "NODEJS", "SQL"],
  "pricingAnalysisId": null
}
```

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `title` | string | ✅ | 5~100자 |
| `description` | string | ✅ | 20~5000자 |
| `category` | string | ✅ | 카테고리 6종 중 하나 |
| `recruitmentStartAt` | string·null | ⬜ | `null`이면 즉시 모집 |
| `recruitmentDeadlineAt` | string | ✅ | `now+1일` ~ `now+365일` |
| `budgetAmount` | integer | ✅ | 1 이상 |
| `skillIds` | string[] | ✅ | 1~10개 · 공식 기술만 (규칙 5) |
| `pricingAnalysisId` | string·null | ⬜ | 있으면 AI 분석을 연결한다 (규칙 8) |

응답 201: `ClientProjectDetail`

> **`pricingAnalysisId`가 있으면 `budgetAmount`는 무시된다.** 분석에 저장된 추천 금액으로 덮어쓴다 (규칙 8).
> 처리 순서는 `spec.md`의 "규칙 8의 처리 순서"를 따른다 — FK 때문에 프로젝트를 먼저 만들어야 한다.

에러: 401 `AUTH_REQUIRED` · 403 `PROJECT_CREATE_ROLE_REQUIRED`(프리랜서) · 403 `PROJECT_PROFILE_REQUIRED` · 422 `VALIDATION_ERROR` · 422 `DEADLINE_MUST_BE_FUTURE` · 422 `DEADLINE_BELOW_MINIMUM` · 422 `DEADLINE_EXCEEDS_LIMIT` · 422 `DEADLINE_BEFORE_START` · 422 `BUDGET_MUST_BE_POSITIVE` · 422 `INVALID_CATEGORY` · 422 `INVALID_SKILL` · 422 `SKILL_REQUIRED` · 422 `CUSTOM_SKILL_NOT_ALLOWED` · **409 `PRICING_ANALYSIS_NOT_APPLICABLE`**(분석 연결 실패 — 프로젝트도 생성되지 않음)

## GET /api/v1/projects — 목록 · 검색

권한: 누구나

쿼리: `keyword` · `category` · `skills` · `minBudget` · `maxBudget` · `recruitmentStatus` · `deadlineBefore` · `sortBy` · `sortOrder` · `page` · `pageSize`

| 파라미터 | 제약 |
|---|---|
| `page` | 1~1000 |
| `pageSize` | 1~50 |
| `sortOrder` | `asc` · `desc` (소문자) |
| enum 값 | `UPPER_SNAKE_CASE` |

응답 200: `PublicProjectSummary` 목록

> **마감된 프로젝트는 기본적으로 빠진다.** `recruitmentStatus=CLOSED`를 명시했을 때만 포함한다 (규칙 10).
> 삭제된 프로젝트는 어떤 조건으로도 나오지 않는다 (규칙 11).

에러: 422 `VALIDATION_ERROR`(범위 밖 페이지·정렬값) · 422 `INVALID_CATEGORY` · 422 `INVALID_SKILL`

## GET /api/v1/projects/:projectId — 상세

권한: 누구나. **등록 의뢰인이면 더 많은 필드를 받는다.**

응답 200: `PublicProjectDetail` 또는 `ClientProjectDetail`

| 보는 사람 | 응답 |
|---|---|
| 비로그인 · 다른 사용자 | `PublicProjectDetail` — `transactionStatus` 없음 |
| 로그인한 프리랜서 | 위 + `canApply` |
| **등록 의뢰인** | `ClientProjectDetail` — `transactionStatus` · `pendingApplicationCount` · `editableFields` · `availableActions` 포함 |

에러: 404 `PROJECT_NOT_FOUND`(없거나 삭제됨)

## PATCH /api/v1/projects/:projectId — 수정

권한: 등록 의뢰인만 (규칙 17)

요청: `title` · `description` · `category` · `recruitmentStartAt` · `recruitmentDeadlineAt` · `budgetAmount` · `skillIds` 중 바꿀 것만

응답 200: `ClientProjectDetail` (갱신된 `editableFields` 포함)

> **대기 중 지원이 1건이라도 있으면 `budgetAmount`와 모집 일정은 잠긴다** (규칙 15).
> 이 값을 읽지 못하면 잠금을 유지한다. 0으로 간주하지 않는다.
> **일반 필드 수정으로는 `projectVersion`이 올라가지 않는다** (규칙 18).

에러: 401 `AUTH_REQUIRED` · 403 `PROJECT_FORBIDDEN` · 404 `PROJECT_NOT_FOUND` · **409 `PROJECT_EDIT_LOCKED`**(대기 지원 있는데 예산·일정 수정) · **409 `PROJECT_EDIT_CLOSED`**(마감·거래 단계) · 422 검증 오류 (등록과 동일)

## DELETE /api/v1/projects/:projectId — 삭제

권한: 등록 의뢰인만

응답 204: 본문 없음

> **소프트 삭제다** (규칙 19). 이미 삭제된 프로젝트를 다시 삭제해도 `204`를 반환한다 (규칙 21).

에러: 401 `AUTH_REQUIRED` · 403 `PROJECT_FORBIDDEN` · **409 `PROJECT_DELETE_HAS_APPLICATIONS`**(대기 지원 1건 이상) · **409 `PROJECT_DELETE_IN_TRANSACTION`**(거래 진행 중)

## POST /api/v1/projects/:projectId/close-recruitment — 모집 마감

권한: 등록 의뢰인만

요청: 본문 없음

응답 200:

```json
{
  "projectId": "prj_p01",
  "recruitmentStatus": "CLOSED",
  "transactionStatus": "NONE",
  "rejectedApplicationCount": 3,
  "closedAt": "2026-08-25T05:12:00Z"
}
```

| 필드 | 설명 |
|---|---|
| `rejectedApplicationCount` | 이번 마감으로 일괄 거절된 건수. applications가 처리한 결과 |

> 이미 마감된 프로젝트를 다시 마감하면 `200`이고 `rejectedApplicationCount`는 `0`이다 (규칙 24).
> **후처리가 실패해도 마감은 되돌리지 않는다** (규칙 23).

에러: 401 `AUTH_REQUIRED` · 403 `PROJECT_FORBIDDEN` · 404 `PROJECT_NOT_FOUND` · 409 `PROJECT_TRANSITION_CONFLICT`(취소된 프로젝트)

## POST /api/v1/projects/:projectId/cancel — 취소

권한: 등록 의뢰인만

요청: 본문 없음

응답 200 또는 202:

```json
{
  "projectId": "prj_p01",
  "recruitmentStatus": "CLOSED",
  "transactionStatus": "CANCELED",
  "canceledAt": "2026-08-25T06:00:00Z",
  "postActions": {
    "applicationRejection": "DONE",
    "contractInvalidation": "NOT_NEEDED"
  }
}
```

| 값 | 뜻 |
|---|---|
| `DONE` | 처리했다 |
| `NOT_NEEDED` | 처리할 것이 없었다 |
| `FAILED` | 시도했으나 실패했다 |

> **`postActions`에 `FAILED`가 하나라도 있으면 `202`를 반환한다** (규칙 29). 취소 자체는 되돌리지 않는다.
> 이미 취소된 프로젝트를 다시 취소하면 `200`이다 (규칙 30).

에러: 401 `AUTH_REQUIRED` · 403 `PROJECT_FORBIDDEN` · 404 `PROJECT_NOT_FOUND` · **409 `PROJECT_CANCEL_AFTER_PAYMENT`**(`paymentPendingAt`이 있음 — 규칙 27) · 409 `PROJECT_TRANSITION_CONFLICT`(거래 `IN_PROGRESS` 이상 — 규칙 28)

## GET /api/v1/clients/:clientId/projects — 내 프로젝트

권한: 본인만

쿼리: `recruitmentStatus` · `transactionStatus` · `page` · `pageSize`

응답 200: `ClientProjectDetail` 목록

> **재모집 가능한 프로젝트에 배지가 붙는다.** `availableActions`에 `REOPEN_RECRUITMENT`가 들어 있으면 SCR-B10으로 갈 수 있다.

에러: 401 `AUTH_REQUIRED` · 403 `PROJECT_FORBIDDEN`(다른 사람의 목록)

## POST /api/v1/projects/:projectId/reopen-recruitment — 재모집

권한: 등록 의뢰인만. 선행: `recruitmentStatus = CLOSED` · `transactionStatus = NONE` · 미취소 · 미삭제

요청:

```json
{ "recruitmentDeadlineAt": "2026-09-20T14:59:59Z", "expectedProjectVersion": 9 }
```

| 필드 | 타입 | 필수 | 제약 |
|---|---|---|---|
| `recruitmentDeadlineAt` | string | ✅ | 현재 시각보다 뒤 · **갱신된 `recruitmentStartAt` + 365일 이내** |
| `expectedProjectVersion` | integer | ⬜ | 넣으면 조건부 갱신 |

> **`recruitmentStartAt`은 요청 필드가 아니다.** 재모집이 성공하면 서버가 현재 시각으로 갱신하고, 마감일 상한은 **갱신 후 값 기준**으로 검증한다 (규칙 33).

응답 200:

```json
{
  "projectId": "prj_p01",
  "recruitmentStatus": "OPEN",
  "transactionStatus": "NONE",
  "recruitmentStartAt": "2026-08-25T09:00:00Z",
  "recruitmentDeadlineAt": "2026-09-20T14:59:59Z",
  "projectVersion": 10,
  "reopened": true
}
```

> 이미 `OPEN`이면 `reopened: false`이고 **아무것도 바꾸지 않는다.** `recruitmentStartAt`도 그대로 둔다 (규칙 35).

에러: 401 `AUTH_REQUIRED` · 403 `PROJECT_FORBIDDEN` · 404 `PROJECT_NOT_FOUND` · **409 `PROJECT_EDIT_LOCKED`**(대기 지원 잔존 — 규칙 34) · 409 `PROJECT_TRANSITION_CONFLICT`(취소·거래 진행 중) · 409 `PROJECT_VERSION_CONFLICT` · 422 `DEADLINE_MUST_BE_FUTURE` · 422 `DEADLINE_BELOW_MINIMUM` · 422 `DEADLINE_EXCEEDS_LIMIT`

---

# 내부 계약 — `/internal/v1`

**브라우저에서 부를 수 없다** (규칙 49). 서비스 토큰으로만 접근하며, 사용자 로그인 토큰은 거부한다.

함수 이름이 정본이고 경로는 구현 편의다. 문서 사이에서는 함수 이름으로 부른다.

## 공통 봉투

모든 내부 계약이 같은 필드를 주고받는다.

```json
{
  "requestId": "req_start_01",
  "idempotencyKey": "transaction-start-ctr_123",
  "occurredAt": "2026-08-25T05:01:00Z",
  "expectedProjectVersion": 7
}
```

```json
{
  "alreadyProcessed": false,
  "processedAt": "2026-08-25T05:01:00Z",
  "changed": true,
  "projectVersion": 8
}
```

| 필드 | 뜻 |
|---|---|
| `idempotencyKey` | 같은 요청인지 판별한다. 이미 처리됐으면 최초 결과를 그대로 돌려준다 (규칙 43) |
| `changed` | 이번 호출로 실제로 바뀌었는가 |
| `alreadyProcessed` | 이전에 같은 요청이 처리됐는가 |
| `projectVersion` | **상태 축이 실제로 바뀐 경우에만 +1** (규칙 44) |

**중복 방지 키**

| 함수 | 키 |
|---|---|
| `acceptProjectApplication` | `application-accept-{applicationId}` |
| `startProjectTransaction` | `transaction-start-{contractId}` |
| `completeProjectTransaction` | `transaction-complete-{contractId}` |
| `restorePreContractProject` | `negotiation-reject-{negotiationId}` |
| `applyPricingAnalysisBudget` | `pricing-apply-{pricingAnalysisId}` |
| `cancelProject` | `project-cancel-{cancellationId}` |
| `markPaymentPending` | `payment-pending-{contractId}` |

**공통 에러**: 404 `PROJECT_NOT_FOUND` · 409 `PROJECT_TRANSITION_CONFLICT`(허용 상태 아님 · `CANCELED` 포함) · 409 `PROJECT_VERSION_CONFLICT` · 422 `VALIDATION_ERROR`

## POST /internal/v1/projects/:projectId/accept-application

`acceptProjectApplication` — 최윤석이 부른다. 지원 수락.

요청: 공통 봉투 + `applicationId` · `actorUserId`

응답 200: 공통 응답 + `acceptedApplicationId` · `recruitmentStatus: "CLOSED"` · `transactionStatus: "CONTRACT_PENDING"`

> **"같은 지원서인가"를 상태 조건보다 먼저 판정한다** (규칙 36). 순서가 반대면 정상 재시도가 `409`를 받고 화면에 사실과 다른 안내가 뜬다.

에러: 위 공통 + 409 `PROJECT_TRANSITION_CONFLICT`(다른 지원자가 이미 수락됨 · `recruitmentStatus`가 `OPEN`이 아님)

## GET /internal/v1/projects/:projectId/negotiation-context

`getProjectNegotiationContext` — 조준영이 부른다. 협상 진입 판정용 조회.

응답 200:

```json
{
  "projectId": "prj_123",
  "clientId": "usr_client_a",
  "recruitmentStatus": "CLOSED",
  "transactionStatus": "CONTRACT_PENDING",
  "acceptedApplicationId": "app_123",
  "recruitmentDeadlineAt": "2026-09-16T14:59:59Z",
  "canceledAt": null,
  "paymentPendingAt": null,
  "projectVersion": 7
}
```

> 공개 상세에는 `transactionStatus`가 없어 협상 진입을 판정할 수 없다. 이 조회가 그래서 있다.

에러: 404 `PROJECT_NOT_FOUND`

## POST /internal/v1/projects/:projectId/mark-payment-pending

`markPaymentPending` — 조준영이 부른다. PG 요청 직전 1회.

요청: 공통 봉투 + **`contractId`**(필수) · `actorUserId`

응답 200: 공통 응답 + `paymentPendingAt` · `transactionStatus: "CONTRACT_PENDING"`

> **상태 축을 바꾸지 않으므로 `projectVersion`을 올리지 않는다** (규칙 41).
> 이미 `paymentPendingAt`이 있으면 `200`이고 **최초 시각을 그대로 유지한다.** 갱신하면 취소 차단 경계가 뒤로 밀린다.

에러: 위 공통 + 409 `PROJECT_TRANSITION_CONFLICT`(`CONTRACT_PENDING`이 아니거나 취소됨)

## POST /internal/v1/projects/:projectId/start-transaction

`startProjectTransaction` — 조준영이 부른다. 계약 `SIGNED` 그리고 결제 `PAID` 직후 1회.

요청: 공통 봉투 + `contractId` · `actorUserId`. **`expectedProjectVersion` 필수** (규칙 51)

응답 200: 공통 응답 + `recruitmentStatus: "CLOSED"` · `transactionStatus: "IN_PROGRESS"`

> 판정 순서: 존재 → 중복 방지 키 → 이미 `IN_PROGRESS` → 그 외 상태 → 버전 → 전이
> **`acceptedApplicationId`가 비어 있으면 `409`로 거부한다.** `CONTRACT_PENDING`인데 수락된 지원서가 없는 것은 정상 경로에서 생길 수 없는 상태다.

에러: 위 공통 + 422 `VALIDATION_ERROR`(`expectedProjectVersion` 누락)

## POST /internal/v1/projects/:projectId/complete-transaction

`completeProjectTransaction` — 조준영이 부른다. 납품 `APPROVED` 그리고 정산 `RELEASED` 직후.

요청: 공통 봉투 + `contractId` · `actorUserId`. **`expectedProjectVersion` 필수**

응답 200: 공통 응답 + `transactionStatus: "COMPLETED"`

> **납품·정산 테이블을 읽지 않는다.** `IN_PROGRESS`인지만 확인한다. 두 조건이 충족됐는지는 **호출자가 지킨다.**
> 이미 `COMPLETED`면 `200` 멱등. `CANCELED`면 `409`.

에러: 위 공통 + 422 `VALIDATION_ERROR`

## POST /internal/v1/projects/:projectId/restore-pre-contract

`restorePreContractProject` — 조준영이 부른다. 최신 제안 수신자의 최종 거절 직후.

요청: 공통 봉투 + `negotiationId`(필수 · 중복 판정 기준) · `offerId`(선택) · `actorUserId` · `reason`(`FREELANCER_REJECTED` · `CLIENT_REJECTED`)

응답 200:

```json
{
  "projectId": "prj_123",
  "negotiationId": "ngt_123",
  "recruitmentStatus": "OPEN",
  "transactionStatus": "NONE",
  "reopened": true,
  "notReopenedReason": null,
  "restoredFields": ["recruitmentStatus", "transactionStatus"],
  "alreadyProcessed": false,
  "processedAt": "2026-08-25T04:30:00Z",
  "changed": true,
  "projectVersion": 8
}
```

| `notReopenedReason` | 언제 |
|---|---|
| `null` | 재개됨 (`reopened: true`) |
| `DEADLINE_PASSED` | 마감일 경과 — 의뢰인이 A-13으로 다시 열 수 있다 |
| `PENDING_APPLICATIONS_REMAIN` | 대기 지원 잔존 — **A-13도 막힌다.** 일괄 거절을 다시 요청 중 |

> **`recruitmentStartAt`은 건드리지 않는다.** 그 값을 새로 찍는 것은 A-13 재모집뿐이다.
> **자동 거절된 지원자를 되살리지 않는다.**
> 같은 `negotiationId` 재호출은 `200`. 다른 협상으로 이미 복원됐으면 `409 PROJECT_ALREADY_RESTORED`.

에러: 위 공통 + 409 `PROJECT_ALREADY_RESTORED`

## POST /internal/v1/projects/:projectId/apply-pricing-budget

`applyPricingAnalysisBudget` — 오민혁이 부른다. **이미 등록된 프로젝트**의 예산에 AI 추천을 반영.

요청: 공통 봉투 + `pricingAnalysisId` · `actorUserId`

응답 200: 공통 응답 + `budgetAmount`

> **클라이언트가 보낸 금액을 받지 않는다.** 분석에 저장된 추천 금액을 쓴다 (규칙 40).
> 등록 시점의 연결은 이 함수가 아니라 `POST /api/v1/projects`의 `pricingAnalysisId` 필드로 처리한다.

에러: 위 공통 + 403 `PROJECT_FORBIDDEN` · **409 `PROJECT_EDIT_LOCKED`**(대기 지원 있음)

## `cancelProject` — 내부 주소를 열지 않는다

계약 함수 8종 중 마지막 하나다. 의뢰인 요청이라 공개 API `POST /api/v1/projects/:projectId/cancel`(A-07)로
들어오며, **`/internal/v1`에는 같은 주소를 만들지 않는다.**

따라서 위에 적힌 내부 주소는 7개다. 중복 방지 키 `project-cancel-{cancellationId}`는
A-07 처리에서 그대로 쓴다.

---

# 다른 도메인에 부르는 것

이 기능이 **호출하는** 쪽이다. 상대 도메인이 제공한다.

| 함수 | 제공 | 언제 |
|---|---|---|
| `rejectPendingApplications` | 최윤석 | 마감·취소 시 대기 지원 일괄 거절 (규칙 23·29) |
| `invalidateAgreementAndContract` | 조준영 | 취소 시 합의·계약 무효화 (규칙 29) |
| `claimPricingAnalysisForCreatedProject` | 오민혁 | 등록 시 분석 연결 (규칙 52) |
| `getPricingAnalysisRecommendation` | 오민혁 | 이미 등록된 프로젝트의 예산 반영 (규칙 40) — **확인 대기 · CR-0003** |
| `getProfileCompletion` | 오민혁 | 등록 전 프로필 완성 확인 (규칙 7) |

**전부 `prototype/server/ports/` 뒤에 둔다.** 형태가 바뀌면 어댑터 한 곳만 고친다 (ADR-0009).

```ts
// 오민혁 확정 (규칙 52·53)
type ClaimPricingAnalysisForCreatedProjectInput = {
  analysisId: string;
  projectId: string;
  requesterId: string;
};
type ClaimPricingAnalysisForCreatedProjectResult = { recommendedAmount: number };

interface PricingAnalysisClaimPort {
  claimPricingAnalysisForCreatedProject(
    transaction: TransactionContext,
    input: ClaimPricingAnalysisForCreatedProjectInput,
  ): Promise<ClaimPricingAnalysisForCreatedProjectResult>;
}
```

`rejectPendingApplications`의 형태는 **팀 방침에 따라 아래로 확정했다** (spec.md 규칙 57). 최윤석 담당 영역이라 실제 형태가 다르면 `applications.port.ts` 어댑터 한 곳만 교체한다.

```ts
// spec.md 규칙 57 — 무응답 확정 (사후 검토·재이슈 가능)
type RejectPendingApplicationsInput = {
  closureEventId: string;
  reason: 'RECRUITMENT_CLOSED' | 'PROJECT_CANCELED';
  occurredAt: string;
};
type RejectPendingApplicationsResult = {
  rejectedCount: number;
  alreadyProcessed: boolean;
  result: 'DONE' | 'NOT_NEEDED' | 'FAILED';
};
```

---

# DTO

```ts
// naming-convention.md §6: 서버 내부 입력은 ...Input, HTTP 요청 본문은 ...Request,
// 응답은 ...Response, 목록 항목은 ...Item, 검색 조건은 ...Filter/...Query

type RecruitmentStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED';
type ProjectTransactionStatus = 'NONE' | 'CONTRACT_PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';

type SkillRef = { skillId: string; displayName: string };
type CategoryRef = { category: string; displayName: string };
type ClientPublicProfile = {
  userId: string; name: string; companyName: string | null;
  profileImageUrl: string | null; averageRating: number; reviewCount: number;
};

// 목록 카드 — transactionStatus 없음
type PublicProjectItem = {
  projectId: string; title: string; category: CategoryRef;
  budgetAmount: number; recruitmentDeadlineAt: string;
  recruitmentStatus: RecruitmentStatus; skills: SkillRef[];
  applicationCount: number; client: ClientPublicProfile;
  // isBookmarked 는 없다 — 아래 참고
};

type PublicProjectDetail = PublicProjectItem & {
  description: string; recruitmentStartAt: string | null; canApply?: boolean;
};

// ── 북마크 여부는 이 응답에 없다 (2026-09-02 확정) ────────────────────
// PRD v6.4 §4 는 PublicProjectItem 에 isBookmarked 를 두지만, 그러려면
// project-management 서비스가 engagement 를 불러야 한다. 서버 기능 간 직접
// 의존이 되고 담당 경계를 넘는다.
//
// 화면이 GET /api/v1/bookmarks/ids 를 한 번 불러 대조한다
// (engagement api-contract.md · engagement spec 규칙 35·36).
//
// 계약에서 아예 뺀 이유: 서버가 채우지 않을 키를 남겨두면 다음 사람이 또 채우려 든다.
// PRD 쪽 수정은 CR-0008 로 요청했다.

// 등록 의뢰인 전용 — transactionStatus 포함
type ClientProjectDetail = PublicProjectDetail & {
  // 예산이 어디서 왔는가. 등록 의뢰인만 본다 — 프리랜서가 알면 지원 금액 판단에
  // 영향을 준다. ERD 컬럼은 CR-0007 로 요청 중이다.
  budgetSource: "CLIENT_INPUT" | "AI_ANALYSIS";
  budgetSourceAt: string;
  transactionStatus: ProjectTransactionStatus;
  pendingApplicationCount: number;
  recruitmentClosedAt: string | null;
  canceledAt: string | null;
  projectVersion: number;
  editableFields: string[];
  availableActions: ('EDIT' | 'CLOSE_RECRUITMENT' | 'CANCEL' | 'DELETE' | 'REOPEN_RECRUITMENT')[];
};

type ProjectListResponse = {
  items: PublicProjectItem[];
  page: number; pageSize: number; totalCount: number; totalPages: number;
};

type CreateProjectInput = {
  title: string; description: string; category: string;
  recruitmentStartAt: string | null; recruitmentDeadlineAt: string;
  budgetAmount: number; skillIds: string[]; pricingAnalysisId?: string | null;
};

type ReopenRecruitmentInput = {
  recruitmentDeadlineAt: string;
  expectedProjectVersion?: number;
};

// 내부 계약 공통
type ContractEnvelope = {
  requestId: string; idempotencyKey: string; occurredAt: string;
  expectedProjectVersion?: number;
};
type ContractResult = {
  alreadyProcessed: boolean; processedAt: string;
  changed: boolean; projectVersion: number;
};

type RestoreResult = ContractResult & {
  projectId: string; negotiationId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  reopened: boolean;
  notReopenedReason: null | 'DEADLINE_PASSED' | 'PENDING_APPLICATIONS_REMAIN';
  restoredFields: string[];
};

type PostActionResult = 'DONE' | 'NOT_NEEDED' | 'FAILED';
type CancelProjectResponse = {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  canceledAt: string;
  postActions: { applicationRejection: PostActionResult; contractInvalidation: PostActionResult };
};
```

---

# 비고

원본 근거는 `docs/domain/reference/prd-v6.4.md` §13이며, 이 문서는 그중 project-management 범위를 옮긴 것이다. API 설계는 구현을 마친 뒤 팀장이 통합 단계에서 확정하므로 그전까지는 작업 가설로 취급한다.
