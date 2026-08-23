# PactFive 네이밍 컨벤션

| 항목 | 내용 |
|---|---|
| 대상 | PactFive 풀스택 JavaScript 프로젝트 참여 개발자 5명 |
| 목적 | 코드, API, DB, Git에서 같은 개념을 같은 이름으로 표현하여 협업 비용과 오류를 줄인다 |
| 문서 버전 | v1.3 |
| 반영일 | 2026-08-20 |
| 원본 | `pactfive-naming-convention-v1.3.pdf` (업로드본) |

> ⚠️ **알려진 이슈 (수정 대기, §20 참고)** — 이 문서는 원본 v1.3을 그대로 옮긴 것입니다. 세 가지
> 문제가 이미 논의됐지만 아직 원본 자체는 고쳐지지 않았습니다: ① §3 "client" 이중정의(의뢰인 vs
> 프론트엔드 앱), ② §18 "AGENT.md" 표기가 실제 파일명 `AGENTS.md`와 불일치, ③ §18.3B의
> `contracts/openapi.yaml` 경로가 실제 리포 경로 `docs/domain/api-spec/openapi.yaml`과 다름.
> 자세한 내용과 권장 수정안은 맨 아래 §20을 참고하세요.

## 1. 적용 원칙

1. 이름은 영어로 작성한다. 사용자 화면에 표시되는 문구만 한국어를 사용한다.
2. 축약어보다 의미가 분명한 전체 단어를 우선한다.
3. 같은 비즈니스 개념에는 하나의 단어만 사용한다.
4. 이름만 읽어도 대상과 행위를 추측할 수 있게 작성한다.
5. 신규 용어가 필요하면 PR에서 정의와 선택 근거를 먼저 공유한다.
6. 기존 규칙과 다른 이름을 임의로 추가하지 않는다.
7. 포매팅은 ESLint와 Prettier로 자동화하고, 사람은 의미 있는 이름을 검토한다.
8. 본 문서의 공유·강제 절차는 §18(Git·도구 통제)을 따른다. Discord/Notion 사본을 정본으로 쓰지 않는다.

## 2. 빠른 참조표

| 대상 | 규칙 | 예시 |
|---|---|---|
| 변수·함수 | camelCase | `agreedAmount`, `confirmPayment` |
| Boolean | is/has/can/should + camelCase | `isPaid`, `canWriteReview` |
| React 컴포넌트 | PascalCase | `ContractDetail` |
| 타입·인터페이스 | PascalCase | `PaymentStatus`, `ContractResponse` |
| 상수 | UPPER_SNAKE_CASE | `PLATFORM_FEE_RATE` |
| enum 값 | UPPER_SNAKE_CASE | `DELIVERY_REQUESTED` |
| React 컴포넌트 파일 | PascalCase.tsx | `PaymentHistory.tsx` |
| 일반 TS/JS 파일 | kebab-case + 역할 접미사 | `payment.service.ts` |
| 폴더 | kebab-case | `contracts-payments` |
| REST 경로 | 소문자 복수 명사, kebab-case | `/payment-histories` |
| URL 파라미터 | camelCase | `:contractId` |
| 쿼리 파라미터 | camelCase | `minBudget`, `sortBy` |
| DB 테이블·컬럼 | snake_case | `payments`, `agreed_amount` |
| Git 브랜치 | `<type>/<kebab-case>` | `feature/payment-confirmation` |
| 환경 변수 | UPPER_SNAKE_CASE | `PG_SECRET_KEY` |
| 테스트 | 대상 + 동작/조건 | `payment.service.test.ts` |

## 3. PactFive 표준 도메인 용어

| 한국어 개념 | 표준 영어 | 사용 금지 또는 지양 |
|---|---|---|
| 사용자 | `user` | member, accountUser |
| 의뢰인 | `client` | customer, employer, owner |
| 프리랜서 | `freelancer` | worker, seller, provider |
| 프로젝트 | `project` | job, post, task |
| 지원서 | `application` | apply, proposal |
| 지원자 | `applicant` | candidateUser |
| 북마크 | `bookmark` | favorite, wish |
| 알림 | `notification` | notice, alarm |
| 단가 분석 | `pricingAnalysis` | priceCheck, aiPrice |
| 금액 합의 | `agreement` | negotiation (MVP는 1회 제안→수락/거절만) |
| 합의 금액 | `agreedAmount` | finalPrice, dealPrice |
| 계약 | `contract` | document, deal |
| 결제 | `payment` | pay, billing |
| 납품 | `delivery` | submit, result |
| 완료 승인 | `deliveryApproval` | confirmResult |
| 플랫폼 수수료 | `platformFee` | commission, serviceCharge |
| 정산액 | `settlementAmount` | payout, income |
| 정산 처리 | `settlement` | transfer (실제 이체 미구현) |
| 리뷰 | `review` | ratingRecord, evaluation |

**주의:** 코드에서 `application`은 지원서만 의미한다. 소프트웨어 애플리케이션(프론트엔드 앱)은
**`app`으로만** 표현하고 `application`과 혼용하지 않는다. (원본은 "app / client"라고 썼으나,
`client`는 아래 역할 값에서 "의뢰인"으로 이미 확정되어 있어 충돌한다 — §20 참고)

### 도메인 폴더 engagement

engagement는 프로젝트의 북마크와 추천 기능만 묶는 도메인 이름이다. 지원서(application), 계약
(contract), 결제(payment), 리뷰(review)는 포함하지 않는다. 같은 범위를 favorite, wish, discovery
등의 이름으로 새로 만들지 않는다.

### 역할 값

```ts
type UserRole = 'CLIENT' | 'FREELANCER';
```

- 코드 변수: `client`, `freelancer`
- DB/enum 값: `CLIENT`, `FREELANCER`
- 사용자 문구: 의뢰인, 프리랜서

## 4. 변수와 함수

명사를 사용하고 단위나 의미를 포함한다.

```ts
const agreedAmount = 1_000_000;
const platformFeeRate = 0.1;
const settlementAmount = agreedAmount - platformFeeAmount;
const recruitmentDeadlineAt = new Date();

// 지양
const data = 1_000_000;
const value = 0.1;
const date = new Date();
const recruitmentDeadline = new Date(); // At/Date 접미사 누락
```

배열은 복수형으로: `projects`, `pendingApplications`, `unreadNotifications`.

ID는 대상명을 포함한다: `userId`, `projectId`, `contractId`. 일반 코드에서는 단독 `id` 사용을
지양한다. 함수 내부에서 대상이 하나뿐일 때만 허용한다.

### Boolean

| 접두사 | 의미 | 예시 |
|---|---|---|
| is | 현재 상태 | `isPaid`, `isDeleted` |
| has | 보유 여부 | `hasSigned`, `hasApplied` |
| can | 권한·가능 여부 | `canEditProject`, `canWriteReview` |
| should | 처리 필요 여부 | `shouldRefreshToken` |

### 함수

동사로 시작하고 한 가지 행위를 표현한다.

| 행위 | 권장 동사 |
|---|---|
| 단건 조회 | get |
| 목록 조회 | `get...List`로 통일 (list 금지). 도메인 명사 자체가 이력·목록 의미면 List 생략 (`getPaymentHistory`) |
| 생성 | create |
| 수정 | update |
| 삭제 | delete; 소프트 삭제는 softDelete |
| 상태 확인 | is, has, can |
| 검증 | validate, verify |
| 계산 | calculate |
| 승인 | approve |
| 거절 | reject |
| 서명 | sign |
| 결제 확정 | confirm |

```ts
getProjectById(projectId);
getProjectList(filters);
getPaymentHistory(filters); // History가 목록 의미 → List 접미사 생략
createApplication(input);
acceptApplication(applicationId);
rejectPendingApplications(projectId);
signContract(contractId, signerId);
confirmPayment(paymentKey, orderId, amount);
approveDelivery(deliveryId);
calculateSettlementAmount(paymentAmount);
```

`handle`은 UI 이벤트 처리에만 사용한다. 서비스 함수에 `handlePayment()`처럼 모호한 이름을
사용하지 않는다.

## 5. 프론트엔드 네이밍

React 컴포넌트는 PascalCase 명사형: `ProjectCard.tsx`, `ApplicationStatusBadge.tsx`,
`ContractDetail.tsx`, `PaymentCheckout.tsx`. 페이지는 `Page`, 레이아웃은 `Layout`, 폼은 `Form`,
모달은 `Modal`/`Dialog` 접미사: `ProjectListPage.tsx`, `ClientDashboardLayout.tsx`,
`PaymentForm.tsx`, `ContractSignDialog.tsx`.

Hooks는 반드시 `use`로 시작: `useAuth()`, `useContract()`, `usePaymentConfirmation()`.

이벤트 Props: 컴포넌트가 받는 콜백은 `on`으로, 내부 처리 함수는 `handle`로 시작.

```ts
type PaymentFormProps = { onConfirm: (payment: Payment) => void };
const handleSubmit = () => { onConfirm(payment); };
```

상태와 setter:

```ts
const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('READY');
const [isSubmitting, setIsSubmitting] = useState(false);
```

API 함수는 HTTP 메서드가 아닌 비즈니스 행위 중심: `getContract`, `signContract`, `createPayment`,
`confirmPayment`, `requestDelivery`. `callApi`, `requestData`, `fetchData`처럼 대상을 알 수 없는
이름은 금지한다.

## 6. 백엔드 네이밍

권장 파일명: `contract.controller.ts`, `contract.service.ts`, `contract.repository.ts`,
`contract.routes.ts`, `contract.schema.ts`, `contract.types.ts`, `contract.constants.ts`,
`contract.service.test.ts`.

Repository에서는 DB 행위(`find`, `exists`, `insert`, `update`)를 사용한다. Service에서는
비즈니스 행위를 사용한다.

DTO·요청·응답 타입: 서버 내부 입력은 `...Input`, HTTP 요청 본문은 `...Request`, HTTP 응답은
`...Response`, 목록 항목은 `...Item`, 검색 조건은 `...Filter`/`...Query`.

외부 벤더(인증·결제·AI API 등) 연동 코드는 인터페이스와 벤더 구현을 분리한다:
`{도메인}.port.ts`(인터페이스 정의), `{벤더명}.adapter.ts`(벤더별 구현). 예:
`auth.port.ts` + `supabase-auth.adapter.ts`, `payment.port.ts` + `toss-payments.adapter.ts`.
컨트롤러·서비스는 `.port.ts`의 인터페이스 타입만 참조한다 (근거:
`docs/decisions/0009-external-vendor-interface-layer.md`).

## 7. REST API 네이밍

1. 경로는 소문자 복수 명사를 사용한다.
2. 단어가 둘 이상이면 kebab-case를 사용한다.
3. HTTP 메서드로 CRUD 행위를 표현한다.
4. URL에 get/create/update/delete를 넣지 않는다.
5. 파라미터는 대상명을 포함한 camelCase를 사용한다.

MVP에서는 의미가 중요한 상태 변경에 동사형 하위 경로를 허용한다 (팀 전체 통일):

```
POST /applications/:applicationId/accept
POST /applications/:applicationId/reject
POST /contracts/:contractId/sign
POST /payments/confirm
POST /deliveries/:deliveryId/approve
```

표준 쿼리 파라미터: `keyword, category, skills, minBudget, maxBudget, recruitmentStatus,
deadlineBefore, sortBy, sortOrder, page, pageSize`. enum 값은 UPPER_SNAKE_CASE, 정렬 방향은
소문자(`sortOrder=asc|desc`).

## 8. 데이터베이스 네이밍

테이블은 복수형 snake_case: `users`, `projects`, `applications`, `contracts`, `payments`,
`deliveries`, `reviews`, `notifications`, `bookmarks`, `pricing_analyses`.

- PK: `id`
- FK: `<singular_table>_id`
- 시간: `..._at` / 날짜만: `..._date`
- Boolean: `is_...`, `has_...`
- 소프트 삭제: `deleted_at` (is_deleted와 중복 저장 금지)
- 금액: `..._amount` / 비율: `..._rate`

## 9. 상태 enum 표준

상태 타입은 PascalCase, 상태 값은 UPPER_SNAKE_CASE. **실제 값 목록은 이 문서가 아니라
`docs/domain/erd.md`(정본)를 따른다** — 중복 정의로 인한 불일치를 막기 위해서다.

주의:

- 결제 상태는 `PAID`로 통일. `SUCCESS`, `PAY_COMPLETE`, `COMPLETED_PAYMENT` 금지.
- 결제 이벤트/알림은 과거형 `PAYMENT_COMPLETED`. 상태 값 `PAID`와 혼동 금지.
- 미국식 철자 `CANCELED` 사용, `CANCELLED`와 혼용 금지.
- enum 변경은 DB, API, 프론트 타입에 동시에 반영한다.

## 10. 알림·이벤트 네이밍

이벤트는 이미 발생한 사실이므로 과거형 UPPER_SNAKE_CASE: `APPLICATION_SUBMITTED`,
`CONTRACT_SIGNED`, `PAYMENT_COMPLETED`, `DELIVERY_APPROVED`, `REVIEW_REQUESTED` 등.

이벤트 처리 함수: `publishApplicationAccepted(event)`, `createApplicationAcceptedNotification(event)`.

## 11. 금액·날짜·외부 API

- 원화는 정수로 저장. 필드명에 `Amount`를 붙인다. `price`, `cost`, `money` 혼용 금지.
- 날짜/시간: `recruitmentStartAt`, `clientSignedAt`, `paidAt`. 날짜만 의미할 때만 `Date` 사용.
- 외부 시스템 ID(`oauthProvider`, `pgOrderId`, `storageObjectKey`)에 공급자 이름을 공통 도메인
  필드에 박아 넣지 않는다 (`tossPaymentKey` 지양, 공급자 전용 어댑터 내부에서는 허용).

## 12. 환경 변수

UPPER_SNAKE_CASE, 목적이 분명해야 함: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`OAUTH_CLIENT_ID`, `PG_SECRET_KEY`, `STORAGE_ACCESS_KEY`. 실제 값은 커밋하지 않는다.
`.env.example`에는 키 이름과 설명만. `API_KEY`, `SECRET`처럼 대상 없는 이름 금지.

## 13. Git 네이밍

브랜치: `feature/payment-confirmation`, `fix/duplicate-payment`, `refactor/application-transaction`,
`test/payment-service`, `docs/api-convention`, `chore/eslint-config`. 권장 type: feature, fix,
refactor, test, docs, chore, hotfix. 이슈 번호 사용 시: `feature/123-payment-confirmation`.

커밋은 Conventional Commits: `<type>: <설명>` — feat, fix, refactor, test, docs, style, chore.

## 14. 테스트 네이밍

`payment.service.test.ts`, `ContractDetail.test.tsx`. 설명은 조건과 기대 결과가 드러나게:

```ts
describe('confirmPayment', () => {
  it('rejects payment when the PG amount differs from the contract amount', () => {});
  it('prevents duplicate payment for an already paid contract', () => {});
});
```

한 파일 안에서 언어(한국어/영어) 혼용은 하지 않는다.

## 15. 금지 목록

`data, info, value, item, temp, test, obj, result, doSomething, handleData, processData, callApi,
user1, project2, paymentData, getContractApi, postPaymentApi, SUCCESS(결제 상태), DONE, NORMAL`

단, `result`처럼 매우 좁은 함수 내부에서 즉시 반환되는 임시 변수는 예외로 허용한다.

## 16. PR 네이밍 체크리스트

- [ ] 같은 개념에 기존과 동일한 도메인 용어를 사용했는가?
- [ ] 변수·함수만 읽어도 의미와 단위를 알 수 있는가?
- [ ] Boolean이 is/has/can/should로 시작하는가?
- [ ] 함수가 동사로 시작하며 한 가지 책임을 표현하는가?
- [ ] 컴포넌트·타입·파일명의 대소문자 규칙이 맞는가?
- [ ] API 경로가 복수 명사 중심이며 기존 패턴과 일치하는가?
- [ ] DB 컬럼이 snake_case이고 FK·시간·금액 규칙을 따르는가?
- [ ] enum 값이 기존 상태와 중복되거나 의미가 겹치지 않는가?
- [ ] 민감한 공급자 이름이나 비밀 값이 코드에 노출되지 않았는가?
- [ ] 새 용어를 추가했다면 PR에 정의와 이유를 기록했는가?

## 17. 팀 합의 필요 항목 (원본 §17 기준)

이미 확정: 일반 TS/JS 파일 kebab-case+역할 접미사, React 컴포넌트 파일 PascalCase.tsx, 폴더
kebab-case, API 버전 접두사 `/api/v1`.

이후 확정 가능: 사용할 OAuth·LLM·PG·스토리지 공급자, 테스트 설명 언어, 브랜치 이슈 번호 필수
여부.

## 18. Git·도구로 공유하고 통제하는 방법

문서를 Git에 두고, 형식은 도구(ESLint·commitlint·CI)로, 의미(동의어·도메인 선택)는 금지
목록+PR 리뷰+`AGENTS.md`로 막는다.

| 구분 | 수단 | 막는 것 |
|---|---|---|
| 공유 | Git에 문서 커밋 | 도구·팀원마다 다른 사본 |
| 형식 통제 | ESLint, commitlint, CI | camelCase/파일명/브랜치/커밋 형식 위반 |
| 계약 통제 | OpenAPI + 스펙 lint | API·필드명 임의 변경 |
| 의미 통제 | 금지 용어 스캔 + PR 리뷰 + `AGENTS.md` | customer/favorite 등 동의어 이탈 |
| 변경 통제 | CODEOWNERS + 브랜치 보호 | 컨벤션 문서 단독 수정 |

### 18.1 Git으로 공유 (최소 필수)

- `docs/naming-convention.md`(본 문서) — 유일한 네이밍 기준
- CODEOWNERS — 본 문서 경로 변경 시 리드(또는 전원) 승인 필수
- PR 템플릿 — §16 체크리스트 포함
- 브랜치 보호(main) — PR 필수, 리뷰 필수, 직접 push 금지

### 18.2 도구로 통제

- **ESLint/TypeScript**: `@typescript-eslint/naming-convention`으로 camelCase/PascalCase/
  UPPER_SNAKE_CASE 강제, Boolean 접두사 정규식 검사
- **OpenAPI/계약 파일**: `docs/domain/api-spec/openapi.yaml`을 API 네이밍 단일 소스로, CI에서
  Spectral로 스펙 lint (원본은 `contracts/openapi.yaml`이라고 썼으나 실제 리포 경로로 대체 — §20)
- **Commit/Branch**: commitlint + Conventional Commits, 브랜치명 CI 검사
- **PR/CI 게이트**: 금지 용어 스캔, DB 마이그레이션 snake_case 검사(선택)
- **AI 에이전트 규칙**: `AGENTS.md`(원본은 "AGENT.md"라고 썼으나 실제 파일명으로 대체 — §20)에
  "네이밍은 `docs/naming-convention.md`를 따른다", "새 용어는 PR·팀 합의 없이 만들지 않는다" 명시

### 18.3 도입 순서

1주차: 본 문서 커밋 + PR 템플릿 + CODEOWNERS + AGENTS.md 한 단락
2주차: ESLint naming + commitlint + 브랜치 네이밍 CI
3주차: OpenAPI + Spectral + mock이 동일 계약 참조
필요시: 금지 용어 CI 스캔 + 마이그레이션 검사

## 19. 최종 합의 선언

PactFive 팀은 이 문서를 코드 리뷰의 기준으로 사용한다. 규칙 변경은 한 명이 임의로 적용하지
않고 PR 또는 팀 회의를 통해 합의한 뒤 문서와 코드를 함께 수정한다.

| 항목 | 내용 |
|---|---|
| 확정일 | 2026-08-20 |
| 문서 버전 | v1.3 (본 리포 반영본) |
| 다음 검토일 | Phase 1 종료일 |

## 20. 알려진 이슈 (수정 대기)

이식 과정에서 발견된 이슈이며, 원본 PDF(v1.3)에는 아직 반영되지 않았다. 팀 논의 후 v1.4로
갱신하거나 `change-requests/`에 조정안을 남긴다.

1. **client 이중정의** — §3에서 `client`를 "의뢰인"으로 확정했는데, 같은 절의 주석이 프론트엔드
   앱을 가리키는 대안으로도 `client`를 제시했다. 본 문서(§3)에서는 프론트엔드를 `app`으로만
   쓰도록 수정해서 반영했다.
2. **AGENT.md 표기** — 원본 §18이 "AGENT.md"(단수)라고 썼으나, 이 리포의 실제 파일명은
   `AGENTS.md`(복수)다. 본 문서(§18.2)에서는 실제 파일명으로 수정해서 반영했다.
3. **contracts/openapi.yaml 경로** — 원본 §18.3B가 제안한 `contracts/openapi.yaml` 대신, 이미
   구축된 `docs/domain/api-spec/openapi.yaml`을 단일 소스로 유지하기로 판단했다 (근거: ADR-0006·
   integration-workflow.md가 이미 이 경로를 통제하고 있어 폴더 위치보다 프로세스로 엄격함을
   확보했음). CI 경로 스킵 규칙을 넣게 되면 이 경로를 예외 처리해야 한다.
4. **§9 상태 enum 실제 값** — 원본은 6개 enum의 실제 값 목록을 담고 있었으나, `docs/domain/erd.md`
   와 내용이 겹쳐 정본이 두 곳이 되는 문제가 있었다. 본 문서(§9)에서는 실제 값 목록을 빼고
   ERD를 정본으로 지정했다 (자세한 설계 가이드는
   `outputs/pactfive_naming_convention_feedback_enum_design.md` 참고).
