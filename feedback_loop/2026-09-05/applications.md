# applications 피드백 — 2026-09-05 app/ 통합 (서버·웹 이식)

반영 커밋(review 기준): 로컬 전용, 브랜치 `review/reviews-merge`(develop 기준 `feature/applications`·
`feature/reviews`·`feature/contracts-payments`(PR #64)를 차례로 merge한 통합 브랜치). **아직 push도
develop 반영도 안 됨** — 팀장이 확인 후 직접 push·PR·merge 진행 필요.
sync-log.md 기록: 없음 — 이 브랜치가 develop에 실제로 merge된 뒤 기록한다.

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — applications를 app/server·app/web에 이식했다 (확인만 필요)

상태: 미확인

**Fact — 무엇을 했는지**
- 서버: `app/server/src/features/applications/`에 8개 파일 신설
  (`application.types.ts`·`application.constants.ts`·`in-memory-application.repository.ts`·
  `in-memory-application-notification.ts`·`project-application-context.adapter.ts`·
  `accept-project-application.adapter.ts`·`applications-port.adapter.ts`·
  `application.service.ts`·`application.controller.ts`·`application.router.ts`). 공개 API 5종을
  `/api/v1/projects/:projectId/applications`(POST/GET)·`/api/v1/applications/me`(GET)·
  `/api/v1/applications/:applicationId/accept|reject`(POST)로 `app.ts`에 배선했다.
- `in-memory-external.adapter.ts`의 `createUnavailableApplicationsPort()`(항상 `FAILED`를
  돌려주던 자리표시자)를 실제 `createApplicationsPortAdapter(...)`로 교체했다 — 모집 마감·취소
  시 대기 지원 일괄 거절이 이제 실제로 동작한다.
- 웹: `app/web/src/features/applications/`에 `ApplyPage`·`ManageApplicantsPage`·
  `MyApplicationsPage` 3화면 + 훅(`useApplications.ts`) + API 클라이언트를 신설했다. 라우트는
  `/projects/:projectId/apply`·`/projects/:projectId/applicants`·`/applications/me`로 새로 정했다
  (api-contract.md는 API 경로만 고정, 화면 URL은 이번에 처음 정함).
- `ProjectDetailPage`(상세)의 "지원하기" 버튼과 `ProjectManagePage`(내 프로젝트)에 "지원자 관리"
  링크를 실제로 연결했다 — 둘 다 지금까지 있었지만 동작하지 않던 자리였다. 두 프로젝트-관리
  화면은 applications 폴더를 직접 import하지 않고, `App.tsx`가 슬롯(`applyHref`·
  `applicantsHref`)으로 실제 경로를 끼운다(engagement의 renderBookmark와 같은 패턴).
- `shared/notYetScreens.ts`·`App.tsx`의 `NOT_INTEGRATED_ROUTES`에서 `applications` 항목을
  뺐다(ai-pricing 때와 같은 정리).

**어떻게 채웠는지 — 재해석한 부분**
- 원본 프로토타입의 `ApplicationStore`는 프로젝트 조각(`clientId`·`recruitmentStatus`·
  `transactionStatus`·`acceptedApplicationId`)까지 동기 함수로 갖고 있었다(단일 프로세스 Mock).
  app/에서는 프로젝트가 project-management 소유라, 그 부분만 비동기
  `ProjectApplicationContextPort`로 분리했다. `ApplicationRepository`는 지원 행만 갖는다.
- 검증: `npx tsx features/applications/prototype/run.tsx` → **PASS 35 / FAIL 0** (재해석 전후 로직
  변화 없음 확인). `app/server`·`app/web` 양쪽 `tsc --noEmit`·`vite build` 통과.

**담당자 메모 (조준영 확인 요청 — 재작업이 아니라 확인만 해주면 됨)**
- 위 재해석(동기 → 비동기 프로젝트 조회)이 규칙 9·10의 의도와 어긋나지 않는지만 봐주시면
  됩니다. 이상 없으면 상태를 `반영완료`로 바꿔주세요.

---

## 항목 2 — [CR] applicationCount·pendingApplicationCount 갱신 주체가 applications인데 쓰기 포트가 없다

상태: 미확인

**Fact**
- `project.types.ts`의 `ProjectRecord.applicationCount`·`pendingApplicationCount` 필드에
  "갱신 주체는 applications (규칙 56)"라는 주석이 있다. 하지만 grep으로 확인한 결과 이 두
  필드는 초기화(0)와 읽기(표시·잠금 판정)만 있을 뿐, applications가 이 값을 쓸 수 있는 포트가
  project-management 쪽에 없다.
- `application.service.ts`를 확인한 결과, applications 자기 자신의 로직(생성·수락·거절 판정)은
  이 두 필드를 전혀 참조하지 않는다 — `clientId`·`recruitmentStatus`·`transactionStatus`·
  `acceptedApplicationId`만 쓴다. 그래서 이번 반영에서 빠뜨려도 applications 자체 기능은
  정상 동작한다(회귀 없음, 직접 확인함).

**어떻게 채웠는지 (Assumption)**
- 이번 반영에서는 새 쓰기 포트를 만들지 않았다 — 다른 기능 소유자(project-management)의 이미
  동작하는 코드를 리뷰 없이 고치는 위험보다, 계약을 명확히 남기고 후속 작업으로 미루는 쪽을
  택했다(ai-pricing CR-0012와 같은 원칙).

**왜 그렇게 채웠는지 (근거)**
- 근거 없음 — 팀장(AI 협업자) 판단. `applicationCount`·`pendingApplicationCount`는 지금
  프로젝트 상세·관리 화면에 표시되는 값이라(`ProjectDetailPage`의 "지원 현황", `ProjectManagePage`의
  "지원 N건") 계속 0으로 남아 있으면 화면이 사실과 다른 숫자를 보여주게 된다 — 기능적으로는
  안전하지만 표시값은 이번 반영으로 고쳐지지 않는다는 점을 분명히 남긴다.

**담당자 메모**
- project-management·applications 두 담당자가 함께 "쓰기 포트를 새로 열지, 아니면 이 두 필드를
  project-management가 자기 저장소에서 직접 카운트하는 방식으로 바꿀지"를 정해주시면 됩니다.
  정해지면 팀장이 반영합니다. 결정 전까지는 화면의 지원 건수 표시가 부정확합니다 —
  급하면 `재이슈`로 올려주세요.

---
