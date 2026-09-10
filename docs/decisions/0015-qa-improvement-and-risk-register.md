# QA 결과 기반 통합 개선 및 잔여 리스크

| 항목 | 내용 |
|---|---|
| 상태 | 통합 개선 반영, 최신 develop 재검증 대기 |
| 기준 | 2026-09-10 QA 결과 4종과 PR #109 이후 `origin/develop` |
| 범위 | `app/` 조립·연결부·공통 UX 및 팀장 의사결정 |
| 원칙 | 기능 담당자의 도메인 내부 구현은 유지하고 연결부만 보완 |

## 1. 이번 통합에서 반영한 개선

### 지원 권한과 상태 전이

- 지원 생성·자격 확인 시 `CLIENT` 역할을 서버에서 차단한다. 화면의 버튼 상태만으로 권한을 판단하지 않는다.
- `PENDING`가 아닌 지원은 다시 수락할 수 없도록 서버 전이를 제한한다. 이미 거절된 지원을 재수락해 두 개의 `ACCEPTED`가 생기는 경로를 닫는다.
- 합의 거절로 프로젝트가 계약 전 상태로 복원될 때 기존 `ACCEPTED` 지원도 `AGREEMENT_DECLINED`로 복구한다. 프로젝트의 `acceptedApplicationId`를 비우는 것과 지원 행 상태가 어긋나지 않게 하는 연결 포트를 추가했다.

### 알림 생산자 연결

- applications의 제출·수락·거절 사건을 notifications의 영속 delivery 포트로 전달하는 app 조립 어댑터를 연결했다.
- 알림 전달 실패는 지원 상태 변경을 되돌리지 않는다. 기존 outbox/재처리 정책을 따르며, 수신자와 프로젝트 제목은 프로젝트 문맥 포트에서 읽는다.

### 프로젝트 상세 UX

- 의뢰인 상세 DTO에 `acceptedApplicationId`를 포함해 거래 상태 화면이 서버 정본을 사용할 수 있게 했다. 공개 프리랜서 DTO에는 노출하지 않는다.
- 리뷰가 한 건도 없을 때 `평점 0` 대신 `평점 없음`을 표시한다.

## 2. 재검증 순서

QA 보고서는 `38ab13c`에서 실행됐고, 이후 인증 상태 동기화·알림 ID 호환 PR #109가 `origin/develop`에 머지됐다. 따라서 다음 순서로 최신 develop 기준을 다시 확인한다.

1. Prisma 모드에서 Google OAuth 콜백, 세션 복원, 보호 라우트 새로고침을 확인한다.
2. 의뢰인으로 지원 생성 API가 403인지 확인하고, 프리랜서 지원 후 건수가 `1/1`인지 확인한다.
3. 수락 후 합의 거절→프로젝트 복원→같은 지원 재수락 시도가 거절되는지 확인한다.
4. 제출·수락·거절 각각에서 알림 목록과 미읽음 수가 실제 DB에 기록되는지 확인한다.
5. 결제 `PAID` fixture를 사용해 납품 요청과 리뷰 `COMPLETED` 경로를 재실행한다.

## 3. 추가 설계로 해결한 항목

| QA 관찰 | 결정 | 적용 위치 |
|---|---|---|
| 의뢰인이 지원 가능 | 역할은 서버 권한으로 판정 | `applications/application.service.ts` |
| 거절 지원 재수락 가능 | 수락 입력은 `PENDING`만 허용 | `applications/application.service.ts` |
| 합의 거절 후 예전 지원이 ACCEPTED로 남음 | 계약 복원 포트에서 지원 상태도 복원 | `project-management/project.port.ts`, applications adapter |
| 알림 목록이 비어 있음 | app 조립 시 applications→notifications delivery 연결 | `express-app.ts`, `applications/notification.adapter.ts` |
| 리뷰 없음이 평점 0으로 표시 | reviewCount 기준 빈 상태 문구 | `web/.../ProjectDetailPage.tsx` |

## 4. 남은 리스크와 팀장 결정

### R-001. 지원 행과 프로젝트 건수의 트랜잭션 경계

현재 포트 호출 순서는 연결됐지만 지원 행 저장과 프로젝트 건수 갱신을 하나의 Prisma `$transaction`으로 묶지 않았다. 중간 실패 시 `applicationCount`와 실제 행 수가 달라질 수 있다.

**결정:** PRD 수준 QA에서는 허용한다. 운영 전환 시 repository가 transaction context를 받는 단일 유스케이스로 승격한다. 지금은 기능 담당자에게 재작업을 요청하지 않고 app 통합 작업으로 추적한다.

### R-002. 실제 결제·완료 fixture 부재

QA seed가 `FAILED` 또는 `READY`에 머물면 `PAID → IN_PROGRESS → COMPLETED → 리뷰` 전체를 검증할 수 없다. 가짜 paymentKey를 실제 결제 성공으로 취급하는 것은 안전하지 않다.

**결정:** 운영 결제 연동 없이 이 경로를 통과시키는 설계는 하지 않는다. 테스트 PG sandbox credential 또는 서버 전용 `COMPLETED` fixture가 준비되기 전까지 전체 E2E는 차단 리스크로 기록한다.

### R-003. 보호 라우트 새로고침과 세션 동기화

PR #109가 수정했으므로 최신 develop에서 재검증한다. 실패가 재현되면 원인은 기능별 화면이 아니라 auth provider 초기화와 API client의 공통 세션 복원 경계로 한정해 팀장 통합 이슈로 처리한다.

### R-004. 예약 모집·납품 가능 상태 불일치

기존 보고서에는 미래 `recruitmentStartAt` 저장과 `READY` 결제에서 `canRequestDelivery`가 열린 사례가 있다. 현재 코드에는 예약 상태 재계산과 `IN_PROGRESS` 기준이 반영되어 있으므로 최신 develop에서 재현 여부를 먼저 판정한다. 재현되지 않으면 과거 커밋의 회귀로 종료하고, 재현되면 상태 snapshot을 한 곳에서 계산하는 adapter를 추가한다.

### R-005. 계약·지원 화면 진입점

직접 URL로만 계약·결제 화면에 진입한 QA 결과가 있다. PRD가 요구하는 사용자 여정에 진입 버튼이 포함되는지 팀장이 결정해야 한다. 포함한다면 `my/projects`와 의뢰인 상세의 `availableActions`를 단일 서버 상태로 연결한다. 포함하지 않는다면 직접 URL은 운영 지원 경로로 명시하고 E2E 기대값에서 제외한다.

### R-006. 알림 전달 재시도 관찰성

이번 연결은 delivery 호출까지이며, 재시도 큐가 운영에서 실제로 드레인되는지는 별도 검증이 필요하다. 알림 실패가 핵심 상태를 되돌리지 않는 정책은 유지하되, `retry_required` 건수와 마지막 실패 사유를 운영 로그에서 확인할 수 있어야 한다.

## 5. 팀장 승인 후 다음 작업

1. 최신 `origin/develop`로 위 재검증 5단계를 실행한다.
2. R-002가 해소되면 결제·리뷰 전체 E2E를 QA 완료 기준에 포함한다.
3. R-001·R-006은 운영 전환 직전 통합 backlog로 승격한다.
4. R-005의 제품 결정을 확정한 뒤 필요한 화면 진입점만 app/web에 추가한다.

이 문서는 기능 담당자에게 내부 도메인 수정 작업을 배정하는 문서가 아니라, 팀장이 통합 상태와 잔여 리스크를 전파하기 위한 결정 기록이다.
