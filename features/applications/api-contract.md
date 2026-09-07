# applications — API 계약

형식: `docs/naming-convention.md` §7·§6. Bearer. 쓰기는 `Idempotency-Key`.
Mock: `createApplicationApiMock`. 공개 경로 유지 (`/applications/me`, `/:id/accept|reject`).
PATCH/PUT/DELETE 없음. `PROFILE_*`·`DEPENDENCY_UNAVAILABLE`·`OPERATION_NOT_FOUND`는 Mock 로컬.

## GET /api/v1/projects/:projectId/application-eligibility

프리랜서. 200 `{ projectId, canApply, blockedReasons, existingApplicationId, profileCompletion }`.
불가 사유는 본문(ALREADY_APPLIED · RECRUITMENT_NOT_OPEN · PROJECT_CANCELED · PROFILE_INCOMPLETE).
의뢰인 403. 없음 404. 프로필 의존 실패 503.

## POST /api/v1/projects/:projectId/applications — `createApplication`

3필드만. coverLetter 100~3000, 금액 1만~10억, 기간 1~365. 허용 외 키 422.
프로필 INCOMPLETE 409. 포트 없음·UNAVAILABLE 503. OPEN만. 201 / 멱등 200. 중복 409.

## GET /api/v1/projects/:projectId/applications — `listProjectApplications`

의뢰인. `{ projectId, items, page, pageSize, totalCount, totalPages }`.
page 기본1(1~1000), pageSize 기본10(1~50). `status?`. sort createdAtDesc, 동률 applicationId ASC.
403/404.

## GET /api/v1/applications/me — `listMyApplications`

프리랜서. 같은 페이지 메타. 항목에 `transactionStatus`·`projectNotice`(NONE/CANCELED/DELETED).
삭제 행은 남긴다. COMPLETED 배지 대체로 projectNotice를 쓰지 않는다.

## GET /api/v1/applications/:applicationId

본인 또는 해당 의뢰인. 그 외·없음 404. `{ applicationId, projectId, freelancerId, coverLetter,
expectedAmount, expectedDurationDays, status, rejectionType, createdAt, decidedAt, projectNotice,
transactionStatus }`.

## POST /api/v1/applications/:applicationId/accept — `acceptApplication`

의뢰인. ① C-01+ACCEPTED 커밋 ② 후속 outbox. 기본 Mock은 동기 drain → 200+handoff.
`holdOutbox`면 202 `{ decision, operationId, postActionsStatus, replayed, handoff }`.
같은 지원 재호출 200 + postActionsStatus. 다른 선정 409 `PROJECT_TRANSITION_CONFLICT`.

## POST /api/v1/applications/:applicationId/reject — `rejectApplication`

의뢰인. PENDING만 DIRECT. 후속 알림은 outbox. 이미 거절 멱등 200. 수락 행 409.

## GET /api/v1/application-operations/:operationId

실행 의뢰인. 200 `{ operationId, applicationId, type, status, steps, updatedAt }`.
ACCEPT 단계: REJECT_OTHERS → CREATE_NOTIFICATIONS → ENSURE_NEGOTIATION_CONTEXT(손잡이만).
그 외 404 `OPERATION_NOT_FOUND`. 실패해도 ACCEPTED는 롤백하지 않는다.

## 내부 — `rejectPendingApplications`

```ts
rejectPendingApplications(projectId, { closureEventId, reason: "RECRUITMENT_CLOSED"|"PROJECT_CANCELED", occurredAt })
```

마감 → `AUTO_RECRUITMENT_CLOSED`. 취소 Mock → `rejectionType: null`. 이미 REJECTED 유지.
합의 결렬 일괄은 restore 쪽에서 `AGREEMENT_DECLINED`로 이 함수를 다시 부를 수 있다 (B2).

## DTO (요지)

```ts
type ListPage = { items: unknown[]; page: number; pageSize: number; totalCount: number; totalPages: number };
type Eligibility = { canApply: boolean; blockedReasons: string[]; existingApplicationId: string|null; profileCompletion: object|null };
type AcceptBody = {
  httpStatus: 200|202; status: "ACCEPTED"; decision: "ACCEPTED"; operationId: string;
  postActionsStatus: "QUEUED"|"RUNNING"|"SUCCEEDED"|"FAILED"; replayed: boolean;
  handoff: { projectId: string; acceptedApplicationId: string; transactionStatus: "CONTRACT_PENDING" };
};
```
