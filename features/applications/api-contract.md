# applications — API 계약

형식은 `docs/naming-convention.md` §7(REST API), §6(DTO 패턴)을 따른다.
브라우저. `Authorization: Bearer <accessToken>`. 상태 변경 POST는 `Idempotency-Key` 필수.
Mock: `prototype/mock/application.mock.ts` (`createApplicationApiMock`).

## POST /api/v1/projects/:projectId/applications — `createApplication`

규칙 1·2·9. 프리랜서. `OPEN`만. 본문에 `status` 없음.

요청:

```json
{
  "coverLetter": "일정과 스택이 맞습니다.",
  "expectedAmount": 1000000,
  "expectedDurationDays": 30
}
```

응답 201:

```json
{
  "applicationId": "app_123",
  "projectId": "prj_123",
  "freelancerId": "usr_freelancer_b",
  "coverLetter": "일정과 스택이 맞습니다.",
  "expectedAmount": 1000000,
  "expectedDurationDays": 30,
  "status": "PENDING",
  "rejectionType": null,
  "createdAt": "2026-09-03T02:00:00Z"
}
```

같은 `Idempotency-Key` + 같은 본문 재호출은 200, 기존 행. 다른 본문은 409.
이미 같은 프리랜서 행이 있으면 409.

에러: 401. 403 의뢰인·비당사자. 404. 409 `APPLICATION_ALREADY_EXISTS` ·
`PROJECT_TRANSITION_CONFLICT`(모집 아님). 422 금액·기간.

---

## GET /api/v1/projects/:projectId/applications — `listProjectApplications`

규칙 9·10. 의뢰인. 해당 프로젝트 지원 목록.

응답 200:

```json
{
  "projectId": "prj_123",
  "items": [
    {
      "applicationId": "app_123",
      "freelancerId": "usr_freelancer_b",
      "coverLetter": "일정과 스택이 맞습니다.",
      "expectedAmount": 1000000,
      "expectedDurationDays": 30,
      "status": "PENDING",
      "rejectionType": null,
      "createdAt": "2026-09-03T02:00:00Z"
    }
  ]
}
```

빈 목록은 `items: []`. 에러: 401. 403 비의뢰인. 404.

---

## GET /api/v1/applications/me — `listMyApplications`

규칙 9·10. 로그인한 프리랜서의 지원. 삭제된 프로젝트 행은 지우지 않는다.

응답 200: `{ "items": [ { "applicationId", "projectId", "status", "rejectionType", "createdAt" } ] }`.
빈 목록 `items: []`. 에러: 401.

---

## POST /api/v1/applications/:applicationId/accept — `acceptApplication`

규칙 3~6·9. 의뢰인. 멱등 키 `application-accept-{applicationId}`.

본문 없음. 성공 200:

```json
{
  "applicationId": "app_123",
  "projectId": "prj_123",
  "status": "ACCEPTED",
  "handoff": {
    "projectId": "prj_123",
    "acceptedApplicationId": "app_123",
    "transactionStatus": "CONTRACT_PENDING"
  }
}
```

같은 키·같은 지원 재호출은 200, `handoff` 유지. 다른 지원이 이미 수락되면 409.
문구: 「다른 지원자가 먼저 수락되었습니다」.

에러: 401. 403. 404. 409 `PROJECT_TRANSITION_CONFLICT`.

---

## POST /api/v1/applications/:applicationId/reject — `rejectApplication`

규칙 7·9. 의뢰인. `PENDING`만. `rejectionType = DIRECT`.

응답 200: `{ "applicationId", "status": "REJECTED", "rejectionType": "DIRECT" }`.
이미 거절이면 멱등 200.

에러: 401. 403. 404. 409 수락된 행.

---

## 내부 — `rejectPendingApplications`

규칙 8. 브라우저 `/api/v1`이 아니다. 유동우가 마감·취소 후 호출한다. 정본은 함수명 (D-48).

```ts
rejectPendingApplications(projectId: string, input: {
  closureEventId: string;
  reason: "RECRUITMENT_CLOSED" | "PROJECT_CANCELED";
  occurredAt: string;
}): Promise<{
  rejectedCount: number;
  alreadyProcessed: boolean;
  result: "DONE" | "NOT_NEEDED" | "FAILED";
}>
```

`RECRUITMENT_CLOSED` → `AUTO_RECRUITMENT_CLOSED`.
`PROJECT_CANCELED` → 거절 사유는 취소 알림용. 합의 결렬 일괄은 조준영 restore 쪽에서
`AGREEMENT_DECLINED`로 이 함수를 다시 부를 수 있다 (B2).

---

PATCH/PUT/DELETE `/applications` 없음.

## DTO

```ts
type ApplicationStatus = "PENDING" | "ACCEPTED" | "REJECTED";
type ApplicationRejectionType =
  | "DIRECT"
  | "AUTO_OTHER_ACCEPTED"
  | "AUTO_RECRUITMENT_CLOSED"
  | "AGREEMENT_DECLINED";

type CreateApplicationInput = {
  coverLetter: string;
  expectedAmount: number;
  expectedDurationDays: number;
};
type ApplicationItem = {
  applicationId: string;
  projectId?: string;
  freelancerId?: string;
  coverLetter?: string;
  expectedAmount?: number;
  expectedDurationDays?: number;
  status: ApplicationStatus;
  rejectionType: ApplicationRejectionType | null;
  createdAt: string;
};
type AcceptApplicationResponse = {
  applicationId: string;
  projectId: string;
  status: "ACCEPTED";
  handoff: {
    projectId: string;
    acceptedApplicationId: string;
    transactionStatus: "CONTRACT_PENDING";
  };
};
```
