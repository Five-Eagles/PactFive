# applications 이식 지시서 (2026-09-09)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (applications) |
| 목적 | 판단할 것을 남기지 않은 이식 지시. 적용이 기계적인 작업이 되게 함 |

`app/`은 팀장님만 수정하므로 제가 커밋하지 않습니다. 아래는 **어디를 어떻게 바꾸는가**만
적었습니다. 왜 바꾸는가는 각 항목의 근거 링크를 보시면 됩니다.

우선순위는 **1 → 2 → 3** 순서입니다. 1번은 결함이고, 2번은 되돌릴 수 없는 동작이 확인 없이
나가는 문제이며, 3번은 문구·라벨입니다.

---

## 1. `setClosure`가 스칼라 컬럼에 객체를 넣는다 (결함)

**파일** `app/server/src/features/applications/prisma-application.repository.ts`

`create`(`:125`)·`update`(`:130`) 두 분기 모두:

```ts
-      result: result as unknown as Prisma.InputJsonValue,
+      result: result.result,
```

`getClosure`(`:114`)는 캐스팅만 남깁니다:

```ts
-      result: row.result as RejectPendingApplicationsResult['result'],
+      result: row.result as PostActionResult,
```

컬럼 타입을 `varchar(20)`으로 바꾸면 위 수정 없이는 컴파일되지 않습니다. 두 변경은 같이
가야 합니다. 마이그레이션 SQL과 근거는
[CR-AP-004](../change-requests/0004-operation-step-uniqueness-closure-result-type.md).

**증상** 같은 `closure_event_id`로 마감·취소가 재진입하면 `result`가 `"DONE"`이 아니라
`{"rejectedCount":3,...}` 객체로 나갑니다. project-management가 호출하는 포트입니다
(`applications-port.adapter.ts:29`).

---

## 2. 되돌릴 수 없는 동작에 확인 다이얼로그가 없다

### 2-1. 지원 제출

**파일** `app/web/src/features/applications/ApplyPage.tsx`

`handleSubmit`(`:48~56`)이 검증 후 `void submit(input)`을 바로 호출합니다. 시안은 확인
다이얼로그를 거칩니다 — `design/high-fi.html:44~58` (`#submit-overlay`).

붙일 것: `useState`로 `confirmOpen`을 두고, `handleSubmit`은 검증만 한 뒤 다이얼로그를 열고,
「제출하기」에서 `submit(input)`을 호출합니다. 마크업·문구는 원본
`prototype/web/ApplicationPanel.tsx:364~383`을 그대로 쓰시면 됩니다.

- 제목 「지원서를 제출할까요?」
- 본문 「제출 후에는 수정하거나 철회할 수 없습니다. 제안 금액과 예상 기간을 확인해 주세요.」
- `dl.facts`에 희망 금액·예상기간 재표시 (사용자가 입력값을 다시 보고 멈출 수 있어야 함)
- 버튼 「그만두기」 / 「제출하기」

`.overlay-backdrop` + `.dialog` + `role="dialog" aria-modal` 패턴은 이미 같은 폴더의
`ManageApplicantsPage.tsx` 수락 확인이 쓰고 있으므로 그것을 재사용하시면 됩니다.

### 2-2. 지원 거절

**파일** `app/web/src/features/applications/ManageApplicantsPage.tsx`

`:148`에서 `void handleReject(item.applicationId)`를 바로 호출합니다. 파일 주석(`:14`)에
「거절은 **시안대로** 확인 없이 바로 진행한다」고 적혀 있는데, **시안에는 거절 확인
다이얼로그가 있습니다** — `design/high-fi.html:116~124` (`#reject-overlay`).

`integration-workflow.md:27`이 「담당자가 뼈대만 짜두고 시안에서 더 진전시킨 경우가 있어,
둘이 다르면 **시안이 옳다**」로 정해 두었으므로 시안 쪽으로 맞추는 것이 맞습니다.

수락 확인이 이미 `setConfirmTarget` + `confirmTarget` 상태로 구현돼 있으니 같은 구조를
`rejectTarget`으로 한 벌 더 두면 됩니다.

- 제목 「이 지원을 거절할까요?」
- 본문 「거절 후에는 되돌릴 수 없습니다. 자유 사유는 받지 않습니다.」
- 버튼 「그만두기」 / 「거절 확인」

---

## 3. 라벨·문구가 시안과 다르다

### 3-1. 지원 상태 라벨 3종

`spec.md` 규칙 10과 시안(`high-fi.html:168`·`185`·`202`)은 지원자에게 심사 과정을 보여주는
말을 씁니다. `app/`은 시스템 상태를 그대로 노출합니다.

**파일 2곳** — `MyApplicationsPage.tsx:18~22`, `ManageApplicantsPage.tsx:24~28`

```ts
 const STATUS_LABEL: Record<..., string> = {
-  PENDING: '대기',
-  ACCEPTED: '수락됨',
-  REJECTED: '거절됨',
+  PENDING: '검토 중',
+  ACCEPTED: '선정됨',
+  REJECTED: '미선정',
 };
```

「거절됨」과 「미선정」은 프리랜서가 받는 인상이 다릅니다. 자동 거절(다른 지원자가 수락됨)이
전체 거절의 대부분이라 「거절」은 사실과도 어긋납니다.

### 3-2. 거절 사유 4종 문구가 화면에서 쓰이지 않는다

`REJECTION_COPY`가 서버에는 이식돼 있으나(`app/server/.../application.constants.ts:26~31`)
`app/web` 전체에서 사용처가 없습니다. 지원자는 왜 미선정됐는지 알 수 없습니다.

`MyApplicationsPage.tsx`의 상태 배지 옆에 `rejectionType`별 문구를 붙이시면 됩니다. 원본은
`prototype/web/ApplicationPanel.tsx:233~236`입니다.

**서버·웹 타입 모두 준비돼 있습니다** — `listMyApplications`가 `rejectionType`을 내려주고
(`app/server/.../application.service.ts:514`), 웹 타입에도 있습니다
(`app/web/.../application.types.ts:63`). 화면에서 `REJECTION_COPY`를 `app/web`으로
옮겨 붙이는 것만 남았습니다.

### 3-3. 「완료됨」 배지 + 리뷰 CTA

`spec.md` 규칙 10은 `status = ACCEPTED` ∧ `transactionStatus = COMPLETED`일 때 「완료됨」
배지와 `/projects/:projectId/reviews` 링크를 요구합니다.

**파일** `MyApplicationsPage.tsx:88~90` (배지 렌더 지점)

서버는 값을 이미 내려줍니다 — `listMyApplications`가 `transactionStatus`를 포함하고
(`app/server/.../application.service.ts:516`), 웹 타입에도 있습니다
(`application.types.ts:65`). 화면만 쓰지 않고 있습니다.

**이것이 지금 프리랜서의 유일한 리뷰 진입 경로입니다.** 없으면 URL을 직접 입력해야 합니다.
reviews 쪽 웹 라우트가 단수 `/review`라 경로도 함께 어긋나 있으니
[reviews 이식 지시서](../../reviews/review/teamlead-port-instructions-2026-09-09.md)의
라우트 항목과 같이 처리해 주세요.

### 3-4. `PROFILE_INCOMPLETE` 라벨

`ApplyPage.tsx:23~29`의 `BLOCKED_REASON_LABEL`에 이 키가 없습니다. 원본은
`ApplicationPanel.tsx:63~68`, 시안은 `high-fi.html:63~70`(폼 잠금 + 프로필 완성 안내)입니다.

**이 항목은 오민혁님 대기에 물려 있습니다.** `ProfileCompletionPort` 인터페이스는 `app/`에
있으나 제공자가 없어 `profileCompletion`이 `null` 고정입니다. 포트가 붙기 전에는 이 사유가
내려오지 않으므로 라벨만 먼저 넣어도 동작하지 않습니다. 순서는 오민혁님 → 이 항목입니다.

---

## 4. 202 응답 후 operation 폴링이 없다

**파일** `app/web/src/features/applications/api/application.ts`

서버 라우트는 이미 열려 있습니다 — `application.router.ts:105~113`
(`GET /api/v1/application-operations/:operationId`). 웹에서 이 경로를 부르는 코드가 없어서
(`api/application.ts:24~67`이 전부) 후속 처리 중이면 사용자가 직접 새로고침해야 합니다.

`ManageApplicantsPage.tsx:108~112`가 「잠시 후 목록을 새로 고쳐 확인해 주세요」로 안내만
하고 있는데, `postActionsStatus`가 `QUEUED`/`RUNNING`이면 그 `operationId`로 폴링해
`SUCCEEDED`가 되면 목록을 자동 갱신하는 편이 낫습니다.

**급하지 않습니다.** `app/`은 항상 즉시 드레인하므로 거의 항상 `SUCCEEDED`로 끝납니다
(`application.service.ts:264` 주석). 3번까지 끝난 뒤에 보시면 됩니다.

---

## 5. 스키마 2건

[CR-AP-004](../change-requests/0004-operation-step-uniqueness-closure-result-type.md)에
마이그레이션 SQL까지 적어 두었습니다.

- `application_closures.result` → `varchar(20)`. **1번과 함께 가야 합니다.** 기존 행에
  객체가 들어가 있어 타입 변경 전 값 추출이 필요합니다
- `application_operation_steps`에 `(operation_id, name)` 유니크 추가. 현재 구현은 이 제약
  아래에서 그대로 동작하므로 **코드 변경이 필요 없습니다.** 급하지 않습니다

## 확인이 필요한 것

배포 DB의 `application_closures`에 이미 객체가 저장된 행이 있는지 — 있으면 1번 적용 시
값 추출이 먼저입니다. 제가 DB를 조회할 수 없어 확인하지 못했습니다.
