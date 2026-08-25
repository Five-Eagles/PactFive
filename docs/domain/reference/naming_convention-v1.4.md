# PactFive 네이밍 컨벤션

> 대상: PactFive 풀스택 TypeScript 프로젝트 참여 개발자 5명  
> 목적: 코드, API, DB, Git에서 같은 개념을 같은 이름으로 표현하여 협업 비용과 오류를 줄인다.

## 개정 이력

| 버전 | 개정일 | 주요 변경 내용 |
| --- | --- | --- |
| `v1.2` | 2026-08-13 | WorkBridge 기준 네이밍 규칙과 Git·AI 통제 절차 정리 |
| **`v1.3`** | **2026-08-19** | 서비스명을 PactFive로 변경, `/api/v1` 확정, `engagement` 범위 정의, `PROJECT_CANCELED` 추가, 금액 매개변수와 `client` 용어 원칙 보강 |
| **`v1.4`** | **2026-08-25** | TypeScript 기준 확정, `NotificationType`을 ERD v1.4와 동일한 13값으로 고정, enum 값 목록의 정본 위치 원칙 보강 |

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
| --- | --- | --- |
| 변수·함수 | `camelCase` | `agreedAmount`, `confirmPayment` |
| Boolean | `is/has/can/should` + `camelCase` | `isPaid`, `canWriteReview` |
| React 컴포넌트 | `PascalCase` | `ContractDetail` |
| 타입·인터페이스 | `PascalCase` | `PaymentStatus`, `ContractResponse` |
| 상수 | `UPPER_SNAKE_CASE` | `PLATFORM_FEE_RATE` |
| enum 값 | `UPPER_SNAKE_CASE` | `DELIVERY_REQUESTED` |
| React 컴포넌트 파일 | `PascalCase.tsx` | `PaymentHistory.tsx` |
| 일반 TypeScript 파일 | `kebab-case` + 역할 접미사 | `payment.service.ts` |
| 폴더 | `kebab-case` | `contracts-payments` |
| REST 경로 | 소문자 복수 명사, `kebab-case` | `/payment-histories` |
| URL 파라미터 | `camelCase` | `:contractId` |
| 쿼리 파라미터 | `camelCase` | `minBudget`, `sortBy` |
| DB 테이블·컬럼 | `snake_case` | `payments`, `agreed_amount` |
| Git 브랜치 | `<type>/<kebab-case>` | `feature/payment-confirmation` |
| 환경 변수 | `UPPER_SNAKE_CASE` | `PG_SECRET_KEY` |
| 테스트 | 대상 + 동작/조건 | `payment.service.test.ts` |

## 3. PactFive 표준 도메인 용어

아래 용어를 프로젝트 전체의 표준으로 사용한다.

| 한국어 개념 | 표준 영어 | 사용 금지 또는 지양 |
| --- | --- | --- |
| 사용자 | `user` | `member`, `accountUser` |
| 의뢰인 | `client` | `customer`, `employer`, `owner` |
| 프리랜서 | `freelancer` | `worker`, `seller`, `provider` |
| 프로젝트 | `project` | `job`, `post`, `task` |
| 지원서 | `application` | `apply`, `proposal` |
| 지원자 | `applicant` | `candidateUser` |

> 주의: 코드에서 `application`은 **지원서**만 의미한다. 애플리케이션(앱)은 `app` / `client`로 표현하고 `application`과 혼용하지 않는다.
| 북마크 | `bookmark` | `favorite`, `wish` |
| 알림 | `notification` | `notice`, `alarm` |
| 단가 분석 | `pricingAnalysis` | `priceCheck`, `aiPrice` |
| 금액 합의 | `agreement` | `negotiation` (MVP는 **1회** 금액 제안→수락/거절만. 다회차 협상 엔티티를 만들지 않는다) |
| 합의 금액 | `agreedAmount` | `finalPrice`, `dealPrice` |
| 계약 | `contract` | `document`, `deal` |
| 결제 | `payment` | `pay`, `billing` |
| 납품 | `delivery` | `submit`, `result` |
| 완료 승인 | `deliveryApproval` | `confirmResult` |
| 플랫폼 수수료 | `platformFee` | `commission`, `serviceCharge` |
| 정산액 | `settlementAmount` | `payout`, `income` |
| 정산 처리 | `settlement` | `transfer` (실제 이체 미구현) |
| 리뷰 | `review` | `ratingRecord`, `evaluation` |

### 도메인 폴더 `engagement`

`engagement`는 프로젝트의 **북마크와 추천 기능만** 묶는 도메인 이름이다. 지원서(`application`), 계약(`contract`), 결제(`payment`), 리뷰(`review`)는 포함하지 않는다. 같은 범위를 `favorite`, `wish`, `discovery` 등의 이름으로 새로 만들지 않는다.

### 역할 값

```ts
type UserRole = 'CLIENT' | 'FREELANCER';
```

- 코드 변수: `client`, `freelancer`
- DB/enum 값: `CLIENT`, `FREELANCER`
- 사용자 문구: `의뢰인`, `프리랜서`

## 4. 변수와 함수

### 변수

명사를 사용하고 단위나 의미를 포함한다.

```ts
const agreedAmount = 1_000_000;
const platformFeeRate = 0.1;
const settlementAmount = agreedAmount - platformFeeAmount;
const recruitmentDeadlineAt = new Date();
```

```ts
// 지양
const data = 1_000_000;
const value = 0.1;
const date = new Date();
const recruitmentDeadline = new Date(); // At/Date 접미사 누락
```

배열은 복수형으로 작성한다.

```ts
const projects = [];
const pendingApplications = [];
const unreadNotifications = [];
```

ID는 대상명을 포함한다.

```ts
const userId = '...';
const projectId = '...';
const contractId = '...';
```

일반 코드에서는 단독 `id` 사용을 지양한다. 함수 내부에서 대상이 하나뿐일 때만 허용한다.

### Boolean

질문처럼 읽히도록 접두사를 사용한다.

| 접두사 | 의미 | 예시 |
| --- | --- | --- |
| `is` | 현재 상태 | `isPaid`, `isDeleted` |
| `has` | 보유 여부 | `hasSigned`, `hasApplied` |
| `can` | 권한·가능 여부 | `canEditProject`, `canWriteReview` |
| `should` | 처리 필요 여부 | `shouldRefreshToken` |

```ts
// 지양
const paid = true;
const reviewAvailable = true;
```

### 함수

동사로 시작하고 한 가지 행위를 표현한다.

| 행위 | 권장 동사 |
| --- | --- |
| 단건 조회 | `get` |
| 목록 조회 | `get...List`로 통일 (`list` 금지). 단, 도메인 명사 자체가 이력·목록 의미면 `List`를 중복하지 않는다 (`getPaymentHistory`) |
| 생성 | `create` |
| 수정 | `update` |
| 삭제 | `delete`; 소프트 삭제는 `softDelete` |
| 상태 확인 | `is`, `has`, `can` |
| 검증 | `validate`, `verify` |
| 계산 | `calculate` |
| 승인 | `approve` |
| 거절 | `reject` |
| 서명 | `sign` |
| 결제 확정 | `confirm` |

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

`handle`은 UI 이벤트 처리에만 사용한다.

```tsx
const handlePaymentSubmit = () => {};
const handleContractSign = () => {};
```

서비스 함수에 `handlePayment()`처럼 모호한 이름을 사용하지 않는다.

## 5. 프론트엔드 네이밍

### React 컴포넌트

`PascalCase` 명사형으로 작성한다.

```text
ProjectCard.tsx
ProjectFilterForm.tsx
ApplicationStatusBadge.tsx
ContractDetail.tsx
PaymentCheckout.tsx
DeliveryApprovalDialog.tsx
```

페이지는 `Page`, 레이아웃은 `Layout`, 폼은 `Form`, 모달은 `Modal` 또는 `Dialog` 접미사를 사용한다.

```text
ProjectListPage.tsx
ContractDetailPage.tsx
ClientDashboardLayout.tsx
PaymentForm.tsx
ContractSignDialog.tsx
```

### Hooks

반드시 `use`로 시작한다.

```ts
useAuth();
useProjectFilters();
useContract();
usePaymentConfirmation();
```

### 이벤트 Props

- 컴포넌트가 받는 콜백: `on`으로 시작
- 컴포넌트 내부 처리 함수: `handle`로 시작

```tsx
type PaymentFormProps = {
  onConfirm: (payment: Payment) => void;
};

const handleSubmit = () => {
  onConfirm(payment);
};
```

### 상태와 setter

```tsx
const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('READY');
const [isSubmitting, setIsSubmitting] = useState(false);
```

### API 함수

HTTP 메서드가 아닌 비즈니스 행위 중심으로 작성한다.

```ts
getContract(contractId);
signContract(contractId);
createPayment(contractId);
confirmPayment(input);
getPaymentHistory();
requestDelivery(contractId, input);
approveDelivery(deliveryId);
```

`callApi`, `requestData`, `fetchData`처럼 대상을 알 수 없는 이름은 금지한다.

## 6. 백엔드 네이밍

### 권장 파일명

```text
contract.controller.ts
contract.service.ts
contract.repository.ts
contract.routes.ts
contract.schema.ts
contract.types.ts
contract.constants.ts
contract.service.test.ts
```

### 계층별 함수 예시

```ts
// controller
export async function confirmPayment(req, res) {}

// service
export async function confirmPayment(input: ConfirmPaymentInput) {}

// repository
export async function findPaymentByOrderId(orderId: string) {}
export async function updatePaymentStatus(paymentId: string, status: PaymentStatus) {}
```

Repository에서는 DB 행위를 나타내는 `find`, `exists`, `insert`, `update`를 사용할 수 있다. Service에서는 비즈니스 행위를 사용한다.

### DTO·요청·응답 타입

```ts
type CreateContractInput = {};
type ConfirmPaymentInput = {};
type ContractResponse = {};
type PaymentHistoryItem = {};
```

- 서버 내부 입력: `...Input`
- HTTP 요청 본문 타입: `...Request`
- HTTP 응답 타입: `...Response`
- 목록 항목: `...Item`
- 검색 조건: `...Filter` 또는 `...Query`

## 7. REST API 네이밍

### 기본 규칙

1. 경로는 소문자 복수 명사를 사용한다.
2. 단어가 둘 이상이면 `kebab-case`를 사용한다.
3. HTTP 메서드로 CRUD 행위를 표현한다.
4. URL에 `get`, `create`, `update`, `delete`를 넣지 않는다.
5. 파라미터는 대상명을 포함한 `camelCase`를 사용한다.

```http
GET    /projects
POST   /projects
GET    /projects/:projectId
PATCH  /projects/:projectId
DELETE /projects/:projectId

GET    /projects/:projectId/applications
POST   /projects/:projectId/applications
GET    /contracts/:contractId
GET    /payments/:paymentId
```

### 상태 변경 액션

MVP에서는 의미가 중요한 상태 변경에 동사형 하위 경로를 허용한다. 팀 전체에서 아래 형태를 통일한다.

```http
POST /applications/:applicationId/accept
POST /applications/:applicationId/reject
POST /contracts/:contractId/sign
POST /payments/confirm
POST /contracts/:contractId/deliveries
POST /deliveries/:deliveryId/approve
POST /notifications/read-all
```

### 쿼리 파라미터

```http
GET /projects?keyword=react&category=DEVELOPMENT&minBudget=500000&maxBudget=3000000&sortBy=deadline&sortOrder=asc&page=1&pageSize=10
```

표준 파라미터:

```text
keyword, category, skills, minBudget, maxBudget,
recruitmentStatus, deadlineBefore,
sortBy, sortOrder, page, pageSize
```

쿼리 값 대소문자:

- enum 값: `UPPER_SNAKE_CASE` (`category=DEVELOPMENT`, `recruitmentStatus=OPEN`)
- 정렬 방향: 소문자 (`sortOrder=asc` | `desc`)
- 그 외 문자열·숫자는 스키마에 정의된 그대로 사용한다.

## 8. 데이터베이스 네이밍

### 테이블

복수형 `snake_case`를 사용한다.

```text
users
projects
applications
contracts
payments
deliveries
reviews
notifications
bookmarks
pricing_analyses
```

### 컬럼

```text
id
user_id
project_id
application_id
contract_id
client_id
freelancer_id
agreed_amount
platform_fee_amount
settlement_amount
client_signed_at
freelancer_signed_at
paid_at
released_at
created_at
updated_at
deleted_at
```

규칙:

- PK: `id`
- FK: `<singular_table>_id`
- 시간: `..._at`
- 날짜만: `..._date`
- Boolean: `is_...`, `has_...`
- 소프트 삭제: `deleted_at`; `is_deleted`와 중복 저장하지 않는다.
- 금액: `..._amount`
- 비율: `..._rate`

코드와 DB 매핑:

| 애플리케이션 | DB |
| --- | --- |
| `agreedAmount` | `agreed_amount` |
| `platformFeeAmount` | `platform_fee_amount` |
| `clientSignedAt` | `client_signed_at` |
| `deletedAt` | `deleted_at` |

## 9. 상태 enum 설계 가이드

네이밍 컨벤션은 **상태 enum의 실제 값 목록을 정의하는 정본이 아니라, 상태 enum을 어떻게 이름 짓고 설계할지 정하는 가이드**다.

> **정본 원칙**: PactFive의 실제 상태 enum과 값 목록은 ERD·`schema.prisma`·`docs/domain/api-spec/*.md`를 정본으로 한다. 이 문서에는 실제 프로젝트 enum 값 목록을 중복 기재하지 않는다.

### 9.1 네이밍 규칙

- enum 타입명은 `PascalCase`를 사용한다.
- enum 값은 `UPPER_SNAKE_CASE`를 사용한다.
- 상태는 **현재 스냅샷**, 이벤트는 **이미 발생한 사실**로 구분한다.
  - 상태 예: `PAID`
  - 이벤트 예: `PAYMENT_COMPLETED`
- 서로 다른 lifecycle을 하나의 enum에 섞지 않는다. 예를 들어 모집 상태와 거래 상태가 독립적으로 전이된다면 별도 enum으로 분리한다.
- 같은 의미의 동의어를 여러 상태명으로 만들지 않는다. 결제 완료 상태는 `PAID`처럼 하나의 표현으로 통일하고 `SUCCESS`, `DONE`, `COMPLETED` 등 유사 표현을 혼용하지 않는다.
- 철자를 표준화한다. 취소 상태는 미국식 철자인 `CANCELED`를 사용하고 `CANCELLED`와 혼용하지 않는다.
- enum이 변경되면 DB·API·프론트 타입을 함께 갱신한다.

### 9.2 언제 enum으로 설계하는가

아래 세 조건을 **모두 만족**하면 enum 사용을 우선 검토한다. 하나라도 맞지 않으면 참조 테이블이나 자유 문자열을 검토한다.

1. 값의 집합이 유한하고 사전에 전체 범위를 알 수 있는가?
2. 값 사이에 전이 규칙이 있어 코드가 허용·금지 전이를 검증해야 하는가?
3. 프론트엔드·백엔드·DB가 동일한 값 집합을 공유해야 정합성이 유지되는가?

반대로 다음과 같은 경우에는 enum으로 고정하지 않는 편이 낫다.

- 사용자 입력에 따라 값이 계속 늘어나는 경우
- 카테고리·태그처럼 운영 중 자주 추가·삭제되는 경우
- 도메인 담당자의 재량으로 값 구성이 자주 바뀌는 경우

이 경우 참조 테이블 또는 문자열 기반 모델을 검토한다.

### 9.3 상태 enum 설계 절차

실제 프로젝트의 상태 값은 아래 절차로 설계하고, **확정 결과는 ERD·스키마·도메인 API 문서에만 기록한다.**

#### Step 1 — 상태인지 이벤트인지 구분한다

- "지금 어느 단계인가"를 나타내면 상태다.
- "무엇이 발생했다"를 나타내면 이벤트다.
- 상태값과 이벤트값을 하나의 enum에 섞지 않는다.

가상 예시:

```ts
// 상태
type OrderStatus = 'PENDING' | 'PAID';

// 이벤트
type OrderEvent = 'PAYMENT_COMPLETED';
```

#### Step 2 — 기존 enum과 같은 lifecycle인지 확인한다

두 상태 집합이 서로 독립적으로 전이될 수 있다면 별도 enum으로 분리한다. 하나의 상태가 다른 상태에 종속되어 자동으로 결정된다면 합칠 수 있는지 검토한다.

예를 들어 주문 상태와 배송 상태가 독립적으로 변한다면 `OrderStatus`와 `ShippingStatus`를 분리한다.

#### Step 3 — 값 목록을 정하고 동의어·금지 표현을 점검한다

값은 `UPPER_SNAKE_CASE`로 작성하고, 기존 enum이나 §15 금지 목록과 대조해 같은 의미의 표현이 중복되지 않는지 확인한다.

```text
PENDING
PAID
SHIPPED
DELIVERED
CANCELED
```

`COMPLETE`와 `COMPLETED`, `PAID`와 `SUCCESS`처럼 같은 의미를 여러 방식으로 표현하지 않는다.

#### Step 4 — 확정된 실제 값은 정본 문서에 기록한다

확정된 enum 값 목록은 다음 위치에 기록한다.

- ERD
- `schema.prisma`
- `docs/domain/api-spec/*.md`

네이밍 컨벤션에는 **설계 원칙과 절차만 유지**하고, 실제 프로젝트 상태 enum 값 목록은 복제하지 않는다.
단, §10의 `NotificationType`은 알림 이벤트 이름의 팀 공통 정본으로 두며 ERD `notification_type`, API 계약, 프론트 타입과 항상 같은 목록이어야 한다.

### 9.4 리뷰 체크

새 상태 enum을 추가하거나 기존 enum을 변경할 때는 다음을 확인한다.

- [ ] 이 값 집합이 정말 enum으로 고정할 대상인가?
- [ ] 상태와 이벤트가 섞이지 않았는가?
- [ ] 기존 enum과 독립 lifecycle인지 확인했는가?
- [ ] 타입명은 `PascalCase`, 값은 `UPPER_SNAKE_CASE`인가?
- [ ] 기존 상태명과 동의어·중복 의미가 없는가?
- [ ] `CANCELED` 등 프로젝트 표준 철자를 따르는가?
- [ ] 실제 상태 enum 값 목록은 ERD·스키마·도메인 API 문서에만 기록했는가? (`NotificationType`은 §10 예외)
- [ ] 변경 내용을 DB·API·프론트 타입에 함께 반영했는가?

## 10. 알림·이벤트 네이밍

이벤트는 이미 발생한 사실이므로 과거형 `UPPER_SNAKE_CASE`를 사용한다.
아래 `NotificationType`은 v1.4 구현 초안의 정본이며 ERD v1.4 `notification_type`과 동일해야 한다.

```ts
enum NotificationType {
  APPLICATION_SUBMITTED = 'APPLICATION_SUBMITTED',
  APPLICATION_ACCEPTED = 'APPLICATION_ACCEPTED',
  APPLICATION_REJECTED = 'APPLICATION_REJECTED',
  APPLICATION_AUTO_REJECTED = 'APPLICATION_AUTO_REJECTED',
  PROJECT_RECRUITMENT_CLOSED = 'PROJECT_RECRUITMENT_CLOSED',
  PROJECT_CANCELED = 'PROJECT_CANCELED',
  AGREEMENT_ACCEPTED = 'AGREEMENT_ACCEPTED',
  AGREEMENT_REJECTED = 'AGREEMENT_REJECTED',
  CONTRACT_SIGNED = 'CONTRACT_SIGNED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  DELIVERY_REQUESTED = 'DELIVERY_REQUESTED',
  DELIVERY_APPROVED = 'DELIVERY_APPROVED',
  REVIEW_REQUESTED = 'REVIEW_REQUESTED',
}
```

이벤트 처리 함수:

```ts
publishApplicationAccepted(event);
createApplicationAcceptedNotification(event);
```

## 11. 금액·날짜·외부 API

### 금액

- 원화는 정수로 저장한다.
- 필드명에 `Amount`를 붙인다.
- `price`, `cost`, `money`를 혼용하지 않는다.

```ts
const paymentAmount = 1_000_000;
const platformFeeAmount = Math.floor(paymentAmount * PLATFORM_FEE_RATE);
const settlementAmount = paymentAmount - platformFeeAmount;
```

### 날짜와 시간

```ts
recruitmentStartAt
recruitmentDeadlineAt
clientSignedAt
paidAt
deliveryRequestedAt
```

날짜만 의미할 때만 `Date`를 사용한다.

### 외부 시스템 ID

```ts
oauthProvider
oauthProviderUserId
pgOrderId
pgPaymentKey
storageObjectKey
```

공급자 이름을 공통 도메인 필드에 박아 넣지 않는다.

```ts
// 지양
tossPaymentKey
googleUserId
```

공급자 전용 어댑터 내부에서는 허용한다.

## 12. 환경 변수

`UPPER_SNAKE_CASE`를 사용하고 목적이 분명해야 한다.

```dotenv
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
LLM_API_KEY=
PG_CLIENT_KEY=
PG_SECRET_KEY=
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
```

- 실제 값은 커밋하지 않는다.
- `.env.example`에는 키 이름과 설명만 포함한다.
- `API_KEY`, `SECRET`처럼 대상이 없는 이름은 금지한다.

## 13. Git 네이밍

### 브랜치

```text
feature/user-login
feature/project-search
feature/contract-signature
feature/payment-confirmation
fix/duplicate-payment
refactor/application-transaction
test/payment-service
docs/api-convention
chore/eslint-config
```

권장 type:

```text
feature, fix, refactor, test, docs, chore, hotfix
```

이슈 번호를 사용하는 경우:

```text
feature/123-payment-confirmation
```

### 커밋

Conventional Commits 형식을 사용한다.

```text
<type>: <한국어 또는 영어 설명>
```

```text
feat: 계약서 전자 서명 기능 추가
fix: 동일 계약의 중복 결제 차단
refactor: 정산 금액 계산 로직 분리
test: 결제 금액 위변조 검증 추가
docs: 계약 API 명세 업데이트
chore: ESLint 설정 추가
```

커밋 type은 아래로 통일한다.

| type | 용도 |
| --- | --- |
| `feat` | 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 구조 개선 |
| `test` | 테스트 추가·수정 |
| `docs` | 문서 변경 |
| `style` | 코드 의미에 영향 없는 형식 변경 |
| `chore` | 설정·의존성·빌드 작업 |

## 14. 테스트 네이밍

테스트 파일은 원본 파일 옆 또는 프로젝트가 정한 테스트 폴더에 배치한다.

```text
payment.service.test.ts
ContractDetail.test.tsx
```

테스트 설명은 조건과 기대 결과가 드러나게 작성한다.

```ts
describe('confirmPayment', () => {
  it('rejects payment when the PG amount differs from the contract amount', () => {});
  it('prevents duplicate payment for an already paid contract', () => {});
});
```

팀이 한국어 테스트명을 선택해도 되지만 한 파일 안에서 언어를 혼용하지 않는다.

## 15. 금지 목록

다음 이름을 새 코드에 사용하지 않는다.

```text
data, info, value, item, temp, test, obj, result
doSomething, handleData, processData, callApi
user1, project2, paymentData
getContractApi, postPaymentApi
SUCCESS (결제 상태), DONE, NORMAL
```

단, `result`처럼 매우 좁은 함수 내부에서 즉시 반환되는 임시 변수는 예외로 허용한다.

## 16. PR 네이밍 체크리스트

PR 작성자와 리뷰어는 아래를 확인한다.

- [ ] 같은 개념에 기존과 동일한 도메인 용어를 사용했는가?
- [ ] 변수·함수만 읽어도 의미와 단위를 알 수 있는가?
- [ ] Boolean이 `is/has/can/should`로 시작하는가?
- [ ] 함수가 동사로 시작하며 한 가지 책임을 표현하는가?
- [ ] 컴포넌트·타입·파일명의 대소문자 규칙이 맞는가?
- [ ] API 경로가 복수 명사 중심이며 기존 패턴과 일치하는가?
- [ ] DB 컬럼이 `snake_case`이고 FK·시간·금액 규칙을 따르는가?
- [ ] enum 값이 기존 상태와 중복되거나 의미가 겹치지 않는가?
- [ ] 민감한 공급자 이름이나 비밀 값이 코드에 노출되지 않았는가?
- [ ] 새 용어를 추가했다면 PR에 정의와 이유를 기록했는가?

## 17. 구현 초안 확정 항목

2026-08-25 기준으로 구현 버전을 고정한다. 비판과 개선 제안은 받을 수 있지만, 구현 중 변경은 PRD·ERD·네이밍 컨벤션을 함께 고친 뒤 진행한다.

### 확정 (본 문서 §2 기준)

- 기술 스택: TypeScript + npm + Node LTS + Prisma + PostgreSQL
- 일반 TypeScript 파일: `kebab-case` + 역할 접미사 (`payment.service.ts`)
- React 컴포넌트 파일: `PascalCase.tsx`
- 폴더: `kebab-case`
- API 버전 접두사: `/api/v1`
- 알림 enum: §10 `NotificationType` 13값

### 구현에서 잠근 항목

1. 프로젝트 모집 상태(`RecruitmentStatus`)와 거래 상태(`ProjectTransactionStatus`)는 분리한다.
2. 계약 상태(`ContractStatus`)는 ERD v1.4 값을 따른다.
3. `AgreementStatus`는 ERD v1.4의 `PROPOSED` · `ACCEPTED` · `REJECTED` 3값을 따른다.
4. `NegotiationStatus`는 DB enum으로 만들지 않고 API 파생 상태로 계산한다.

### 이후에 확정해도 되는 항목

5. 사용할 OAuth·LLM·PG·스토리지 공급자 (코드에는 공급자명을 박지 않음 — §11)
6. 테스트 설명 언어: 한국어 또는 영어 (파일 내 혼용 금지 — §14)
7. 브랜치에 이슈 번호를 필수로 포함할지 여부

### 후속 문서에 보완할 네이밍 (본 문서 범위 밖)

- Mock/API 계약 파일명 (`openapi`, `fixtures` 등)
- feature/spec 폴더명과 CODEOWNERS 매핑
- 공통 에러 코드 형식 (예: `PAYMENT_AMOUNT_MISMATCH`)
- monorepo 패키지명 (예: `@pactfive/client`)

## 18. Git·도구로 공유하고 통제하는 방법

본 문서를 Discord/Notion에만 두면 “공유”는 되지만 “통제”는 되지 않는다.  
**저장소에 두고 → 린트·훅·CI·에이전트 규칙으로 강제**한다. 사람 리뷰는 의미(동의어·도메인)를, 도구는 형식(케이스·경로·커밋)을 담당한다.

### 18.1 원칙

| 구분 | 수단 | 막는 것 |
| --- | --- | --- |
| 공유 | Git에 문서 커밋 | 도구·팀원마다 다른 사본 |
| 형식 통제 | ESLint, commitlint, CI | camelCase/파일명/브랜치/커밋 형식 위반 |
| 계약 통제 | OpenAPI + 스펙 lint | API·필드명 임의 변경 |
| 의미 통제 | 금지 용어 스캔 + PR 리뷰 + AGENT.md | `customer`/`favorite` 등 동의어 이탈 |
| 변경 통제 | CODEOWNERS + 브랜치 보호 | 컨벤션 문서 단독 수정 |

형식은 도구로 막고, `client` vs `customer` 같은 **의미 선택**은 린트만으로 완전 차단하기 어렵다. 금지 목록(§3, §15) + 리뷰 + AI 규칙을 함께 쓴다.

### 18.2 Git으로 공유 (최소 필수)

| 수단 | 역할 |
| --- | --- |
| `docs/naming-convention.md` (본 문서) | 유일한 네이밍 기준. `CONTRIBUTING.md`에서 링크 |
| `CODEOWNERS` | 본 문서 경로 변경 시 리드(또는 전원) 승인 필수 |
| `.github/PULL_REQUEST_TEMPLATE.md` | §16 체크리스트를 PR 본문에 포함 |
| 브랜치 보호 (`main`) | PR 필수, 리뷰 필수, 직접 push 금지 |

Notion/Discord는 안내·회의용으로만 쓰고, **항상 저장소 문서를 정본**으로 한다.

`CODEOWNERS` 예시:

```text
docs/naming-convention.md  @lead-or-all-members
contracts/                 @lead-or-all-members
```

### 18.3 도구로 통제 (효과가 큰 순)

#### A. ESLint / TypeScript — 코드·파일 이름

- `@typescript-eslint/naming-convention`으로 변수 `camelCase`, 타입·컴포넌트 `PascalCase`, 상수 `UPPER_SNAKE_CASE` 강제
- Boolean: `^(is|has|can|should)[A-Z]`
- 일반 파일: `kebab-case` + 역할 접미사 / React 컴포넌트: `PascalCase.tsx` (§2)

변수·타입·파일 케이스 위반은 여기서 차단하는 것이 가장 확실하다. REST 경로·DB 컬럼까지는 ESLint만으로 부족하다.

#### B. OpenAPI / 계약 파일 — API·필드명

- `contracts/openapi.yaml`(또는 동등한 계약)을 API 네이밍 단일 소스
- CI에서 Spectral 등으로 스펙 lint
- 클라이언트·서버·mock(fake server)이 같은 계약을 따르게 하여 `agreedAmount` ↔ `finalPrice` 같은 이탈을 줄인다

#### C. Commit / Branch — Git 진입점

- **commitlint** + Conventional Commits (§13)
- **Husky**(또는 동등 훅): pre-commit에 lint, 필요 시 pre-push에 test
- CI에서 브랜치명 검사: `^(feature|fix|refactor|test|docs|chore|hotfix)/[a-z0-9-]+$`

#### D. PR / CI 게이트

- GitHub Actions 또는 Danger.js 등으로:
  - §3·§15 금지 용어 간단 스캔 (`favorite`, `commission`, 결제 상태 `SUCCESS` 등)
  - 본 문서와 무관한 코드만 바꾸면서 새 도메인 용어를 넣는 PR에 경고
- DB 마이그레이션: 테이블·컬럼 `snake_case` 검사 스크립트(선택)

#### E. AI 에이전트 규칙 — 다중 도구 출력 통일

Cursor / Claude / Copilot / GPT 등 도구가 달라도 같은 기준을 보게 한다.

- `AGENT.md`(또는 `.cursor/rules`, Copilot instructions)에 명시:
  - 네이밍은 `docs/naming-convention.md`를 따른다
  - 새 용어는 PR·팀 합의 없이 만들지 않는다
  - §3 표준 용어와 §15 금지 목록을 지킨다
- **긴 사전은 본 문서 한곳에만** 두고, 에이전트 규칙에는 짧은 강제 문장 + 경로 링크만 둔다. 도구마다 전문을 복붙하면 다시 어긋난다.

### 18.4 도입 순서 (팀 학습 비용 최소화)

과한 자동화부터 넣지 않는다. 어제 합의한 “충돌·지연 줄이기”에 맞춰 단계적으로 도입한다.

```text
1주차  본 문서를 docs/에 커밋 + PR 템플릿 + CODEOWNERS + AGENT.md 한 단락
2주차  ESLint naming + commitlint + 브랜치 네이밍 CI
3주차  OpenAPI + Spectral (API·필드) + mock이 동일 계약 참조
필요시 금지 용어 CI 스캔 + 마이그레이션 snake_case 검사
```

### 18.5 한계

| 잘 막힘 | 잘 안 막힘 → 보완 |
| --- | --- |
| camelCase / PascalCase / snake_case | `client` vs `customer` → §3 금지표 + 리뷰 |
| 커밋·브랜치 형식 | 비즈니스에 맞는 이름인지 → PR 체크리스트 |
| API 경로·OpenAPI 필드 | AI가 enum·필드를 슬쩍 추가 → AGENT.md + CODEOWNERS + CI 스캔 |

Git·린트만으로 “의미”까지 완전 통제할 수 없다. **문서(정본) + 자동 형식 검사 + 계약 + 사람/AI 리뷰**를 세트로 쓰는 것이 PactFive의 통제 방식이다.

### 18.6 운영 체크리스트

- [ ] 본 문서가 저장소 `docs/naming-convention.md`에 있는가?
- [ ] `CODEOWNERS`가 본 문서(및 contracts) 변경을 보호하는가?
- [ ] PR 템플릿에 §16이 포함되는가?
- [ ] `main` 브랜치 보호가 켜져 있는가?
- [ ] ESLint naming / commitlint / 브랜치 CI 중 합의한 항목이 동작하는가?
- [ ] `AGENT.md`(또는 동등 규칙)가 본 문서를 가리키는가?
- [ ] OpenAPI(또는 계약)와 mock·서버·클라이언트가 같은 이름을 쓰는가?

---

## 최종 합의 선언

> PactFive 팀은 이 문서를 코드 리뷰의 기준으로 사용한다. 규칙 변경은 한 명이 임의로 적용하지 않고 PR 또는 팀 회의를 통해 합의한 뒤 문서와 코드를 함께 수정한다. 공유·통제 절차는 §18을 따른다.

| 항목 | 내용 |
| --- | --- |
| 확정일 | `YYYY-MM-DD` |
| 참여자 | `팀원 5명 이름` |
| 문서 버전 | `v1.3` |
| 다음 검토일 | `Phase 1 종료일` |
