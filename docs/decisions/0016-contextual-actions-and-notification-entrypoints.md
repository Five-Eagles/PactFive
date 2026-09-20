# 0016. 대상 선택 기반 액션과 알림 진입점 통합 명세

상태: 팀장 결정  
작성일: 2026-09-14  
적용 범위: `app/web`, `app/server`, `features/notifications`, `features/contracts-payments`, `features/applications`

## 1. 목적

목록에서 첫 번째 프로젝트나 첫 번째 지원자를 암묵적으로 선택해 액션을 실행하는 UX를 제거한다. 모든 상태 변경·금전 액션은 사용자가 선택한 대상과 화면에 표시된 대상이 일치해야 한다. 알림은 읽음 처리만 제공하지 않고, 사건을 해결할 수 있는 실제 화면으로 이동시킨다.

이 문서는 다른 AI가 구현할 수 있도록 데이터 접점, 라우트, 상태 판정, UI 규칙, 검증 기준을 고정한다.

## 2. 공통 원칙

1. 전역 앱바에는 대상 없는 액션을 두지 않는다.
2. 목록 액션은 반드시 같은 행의 대상 이름과 함께 표시한다.
3. 여러 대상이 있으면 자동으로 첫 항목을 선택하지 않는다.
4. 결제·서명·수락·거절·납품 승인·리뷰 작성은 URL의 식별자와 서버 권한 검사를 모두 사용한다.
5. 웹은 다른 기능 폴더의 구현 파일을 import하지 않는다. 라우트는 각 기능의 `*.routes.tsx`, 공유 UI는 `shared/`에 둔다.
6. 알림 링크는 서버가 생성한 내부 상대 경로만 허용한다. 외부 URL과 임의 query는 거부한다.

## 3. 액션 진입점 명세

### 3.1 프로젝트 목록

`ProjectManagePage`의 각 프로젝트 행이 거래 액션의 유일한 목록 진입점이다.

| 상태 | 버튼 | 목적지 |
|---|---|---|
| `CONTRACT_PENDING` | 금액 합의 계속하기 | `/projects/{projectId}/agreements` |
| `SIGNED` + `READY` | `{projectTitle} 결제하기` | 계약 조회 후 `/contracts/{contractId}/payment` |
| `IN_PROGRESS` | 거래 계속하기 | `/projects/{projectId}/transaction` |
| `COMPLETED` | 리뷰 작성, 정산 확인 | 프로젝트 리뷰·계약 정산 |
| `CANCELED` | 취소 결과 보기 | `/projects/{projectId}/cancellation` |

앱바·홈·프로젝트 목록 상단에는 `결제하기` 단독 버튼을 두지 않는다.

### 3.2 결제 선택 화면

결제 전용 목록이 필요한 경우 `/payments`를 사용한다. 이 화면은 결제창이 아니라 선택 화면이다.

- 대상이 0개면 `결제할 프로젝트가 없습니다`와 `내 프로젝트 보기`를 표시한다.
- 대상이 1개여도 프로젝트명·상대방·금액을 보여주고 명시적 선택을 요구한다.
- 대상이 2개 이상이면 어떤 항목도 기본 선택하지 않는다.
- 선택 전 결제 버튼은 disabled다.
- 버튼 문구는 `선택한 프로젝트 결제하기`로 표시한다.
- 선택된 `projectId`로 서버에서 `contractId`를 재조회한 뒤 결제 페이지로 이동한다.

기존 `/contracts/{contractId}/payment` 직접 진입은 유지하되 `PaymentPage`가 계약·사용자·결제 상태를 서버에서 다시 확인한다. 잘못된 대상이면 결제 버튼을 숨기고 권한 오류를 표시한다.

### 3.3 지원자 액션

`/projects/{projectId}/applicants`의 각 지원자 행에만 수락·거절을 표시한다. 확인 모달에는 프로젝트명, 지원자 이름, 지원서 요약을 함께 표시한다. 목록 밖의 수락·거절 버튼은 만들지 않는다.

### 3.4 계약·납품·리뷰

계약·납품·리뷰 화면은 `contractId` 또는 `projectId`를 URL에 포함한다. 화면 제목에 프로젝트명을 표시하고, 액션 버튼에는 대상 이름 또는 프로젝트명을 포함한다. `TransactionResumePage`는 전달받은 `projectId`의 현재 상태만 해석하며 다른 프로젝트를 선택하지 않는다.

## 4. API 접점

## 4.1 이번 반영의 실제 구현

- 알림 서버가 사건 종류에 따라 목적지를 생성한다. 지원 접수는 지원자 관리, 지원 결과는 내 지원, 취소는 취소 결과, 납품·후기는 해당 계약 또는 프로젝트 화면으로 연결한다.
- 웹은 서버가 반환한 상대 경로를 내부 라우트 allowlist로 검증한다. 허용되지 않은 외부 URL·임의 query는 렌더링하지 않는다.
- 알림 버튼 문구를 사건별 목적에 맞게 표시한다(`지원자 관리`, `납품 검토하기`, `후기 작성하기` 등).
- 프로젝트 관리 화면의 거래 진입은 프로젝트 행의 `projectId`를 사용한다. `CONTRACT_PENDING`은 금액 합의, 이후 단계는 거래 재개 화면이 현재 계약 상태를 조회해 서명·결제로 분기한다.

다음 단계에서 결제 전용 목록을 도입할 때에도 기존 계약별 결제 URL과 서버 권한 검사를 유지한다.

초기 구현은 기존 API를 우선 재사용한다. 새 목록 API가 필요할 때만 아래 응답을 추가한다.

```text
GET /api/v1/payments/available-projects
```

응답:

```json
{
  "items": [
    {
      "projectId": "prj_...",
      "contractId": "ctr_...",
      "projectTitle": "쇼핑몰 웹사이트 구축",
      "counterpartyName": "홍길동",
      "amount": 5000000,
      "paymentStatus": "READY"
    }
  ]
}
```

서버의 `paymentEligible` 판정은 다음을 모두 만족해야 한다.

```text
viewer.role === CLIENT
contract.status === SIGNED
payment.status === READY
contract.canceledAt === null
```

웹은 `paymentEligible`을 표시 제어에만 사용하고, 서버가 최종 권한·상태를 판정한다.

## 5. 알림 액션 명세

현재 `NotificationService`는 모든 알림의 `linkUrl`을 `/projects/{projectId}`로 고정한다. 이를 사건별 목적지로 변경한다.

| 타입 | 필요한 리소스 | `linkUrl` | CTA |
|---|---|---|---|
| `APPLICATION_SUBMITTED` | `projectId` | `/projects/{projectId}/applicants` | 지원자 관리 |
| `APPLICATION_ACCEPTED` | `projectId` | `/applications/me` | 내 지원 현황 |
| `APPLICATION_REJECTED` | `projectId` | `/applications/me` | 결과 확인 |
| `APPLICATION_AUTO_REJECTED` | `projectId` | `/applications/me` | 결과 확인 |
| `PROJECT_RECRUITMENT_CLOSED` | `projectId` | `/projects/{projectId}` | 프로젝트 보기 |
| `PROJECT_CANCELED` | `projectId` | `/projects/{projectId}/cancellation` | 취소 결과 보기 |
| `AGREEMENT_ACCEPTED` | `projectId` | `/projects/{projectId}/transaction` | 거래 계속하기 |
| `AGREEMENT_REJECTED` | `projectId` | `/projects/{projectId}/agreements` | 합의 확인 |
| `CONTRACT_SIGNED` | `contractId` | `/contracts/{contractId}/payment` 또는 `/contracts/{contractId}/sign` | 다음 단계 보기 |
| `PAYMENT_COMPLETED` | `contractId` | `/contracts/{contractId}/delivery` | 납품 진행 |
| `DELIVERY_REQUESTED` | `contractId` | `/contracts/{contractId}/delivery` | 납품 검토 |
| `DELIVERY_APPROVED` | `contractId` | `/contracts/{contractId}/settlement` | 정산 확인 |
| `REVIEW_REQUESTED` | `projectId` | `/projects/{projectId}/reviews` | 리뷰 작성 |

`NotificationItem`에 `actionLabel`을 추가할 수 있지만, 1차 구현에서는 웹이 `type`으로 CTA 문구를 매핑하고 서버가 안전한 `linkUrl`을 제공해도 된다. 계약·결제 알림은 `contractId`를 이벤트 입력과 저장 레코드에 보존해야 한다.

알림 클릭 동작:

1. CTA 클릭 전에 해당 알림을 읽음 처리한다.
2. 읽음 처리 실패 시에도 목적지 이동은 막지 않는다.
3. 목적지에서 권한·상태 오류가 나면 해당 기능의 안내 화면을 표시한다.
4. 존재하지 않는 리소스는 프로젝트 목록 또는 알림 목록으로 돌아가는 fallback을 제공한다.

## 6. 서버 구현 순서

1. 알림 이벤트 union에 합의·계약 이벤트와 `contractId`를 추가한다.
2. 각 원천 도메인 어댑터가 프로젝트명·프로젝트 ID·계약 ID를 전달하도록 수정한다.
3. `NotificationService`에 `notificationLink(event)`를 만들고 타입별 allowlist를 적용한다.
4. 저장소와 DTO 검증이 새 내부 경로를 허용하도록 수정한다.
5. 결제 가능 프로젝트 조회 응답에 프로젝트명·상대방 이름·계약 ID를 포함한다.
6. 결제·계약 API에서 사용자와 리소스의 소유권을 다시 검사한다.

## 7. 웹 구현 순서

1. 전역 결제 CTA를 제거한다.
2. `ProjectManagePage` 행에 결제 가능 상태 CTA를 추가한다.
3. 필요하면 `PaymentSelectionPage`와 `payment.routes.tsx`를 추가한다.
4. `PaymentPage`는 준비 응답의 제목·상대방·금액을 `PaymentPanel`에 전달한다.
5. `NotificationListPage`의 `프로젝트 보기`를 타입별 CTA로 교체한다.
6. CTA 클릭 시 읽음 처리와 이동을 연결한다.
7. 잘못된 ID, 만료 세션, 삭제된 프로젝트의 fallback을 추가한다.

## 8. 검증 기준

- 프로젝트 2개 이상에서 첫 항목이 자동 결제 대상이 되지 않는다.
- 프로젝트 행에서 누른 결제 버튼의 제목·금액·계약 ID가 동일한 프로젝트다.
- 다른 사용자의 계약 ID를 직접 입력해도 결제 준비가 `403` 또는 `404`로 거부된다.
- 알림 13개 타입이 모두 빈 링크나 단순 프로젝트 상세로 끝나지 않는다.
- 지원 도착 알림은 지원자 관리로, 납품 검토 알림은 납품 화면으로 이동한다.
- 알림 CTA 클릭 후 읽음 상태가 갱신된다.
- 대상이 없는 상태에서 액션 버튼이 활성화되지 않는다.
- 서버 typecheck, 웹 typecheck, 통합 테스트와 다중 프로젝트 E2E를 통과한다.

## 9. 구현하지 않을 것

- 결제·알림 이벤트를 프론트 상태만으로 판정하지 않는다.
- 첫 번째 프로젝트·지원자·알림을 암묵적으로 대상화하지 않는다.
- 알림에 외부 URL을 저장하거나 임의 URL을 그대로 렌더링하지 않는다.
- 결제 성공을 위한 가짜 성공 버튼이나 로컬 전용 승인 우회는 추가하지 않는다.
