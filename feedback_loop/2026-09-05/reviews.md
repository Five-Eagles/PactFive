# reviews 피드백 — 2026-09-05 app/ 통합 (서버·웹 이식)

반영 커밋(review 기준): 로컬 전용, 브랜치 `review/reviews-merge`(develop 기준 `feature/applications`·
`feature/reviews`·`feature/contracts-payments`(PR #64)를 차례로 merge한 통합 브랜치). **아직 push도
develop 반영도 안 됨** — 팀장이 확인 후 직접 push·PR·merge 진행 필요.
sync-log.md 기록: 없음 — 이 브랜치가 develop에 실제로 merge된 뒤 기록한다.

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — reviews를 app/server·app/web에 이식했다 (확인만 필요)

상태: 미확인

**Fact — 무엇을 했는지**
- 서버: `app/server/src/features/reviews/`에 8개 파일 신설
  (`review.types.ts`·`review.constants.ts`·`in-memory-review.repository.ts`·
  `in-memory-review-event.ts`·`project-review-context.adapter.ts`·`review.service.ts`·
  `review.controller.ts`·`review.router.ts`). 공개 API 3종을
  `/api/v1/projects/:projectId/reviews`(POST/GET)·`/api/v1/users/:userId/review-summary`(GET)로
  `app.ts`에 배선했다.
- 웹: `app/web/src/features/reviews/`에 `ReviewPage` 1화면(작성 폼 + 등록된 리뷰 목록을 한
  화면에 합쳤다) + 훅(`useReviews.ts`) + API 클라이언트를 신설했다. 라우트는
  `/projects/:projectId/review`로 새로 정했다(api-contract.md는 API 경로만 고정).
- `shared/notYetScreens.ts`·`App.tsx`의 `NOT_INTEGRATED_ROUTES`에서 `reviews` 항목을
  뺐다.

**어떻게 채웠는지 — 재해석한 부분 (applications보다 한 단계 더 나갔다)**
- 원본 프로토타입의 `ReviewStore.getProject`가 돌려주던 `ProjectReviewContext`
  (`clientId`·`freelancerId`·`transactionStatus`·`contractStatus`·`contractId`)는 **한
  기능이 통째로 갖고 있지 않다** — `clientId`·`transactionStatus`는 project-management
  (`getProjectNegotiationContext`), `freelancerId`·`contractId`·`contractStatus`는
  contracts-payments(`findContractByProjectId`)가 정본이다. 그래서
  `project-review-context.adapter.ts`가 이 두 delegate를 합성해 하나의 포트로 만든다 —
  이 폴더는 두 폴더 다 직접 import하지 않는다(로컬 구조적 delegate 타입 선언, 실제 구현은
  `app.ts`가 `projectContractService`·`contractsPaymentsRepository`를 그대로 끼운다).
- 원본의 `deps.store.userExists(userId)`(동기)는 user-management가 아직 "사용자가 존재하는가"
  조회 함수를 내놓지 않아, engagement의 `UserReadPort.getUserRole`과 같은 임시 연결
  (`app.ts`의 `roleByUserId` 캐시 — 토큰 검증에 성공한 사용자만 채워진다)을 재사용했다.
  **한계**: 서버가 재시작된 뒤 한 번도 요청을 보내지 않은 사용자는 실제로 존재해도
  `USER_NOT_FOUND`로 잘못 판정될 수 있다 — engagement가 이미 안고 있던 것과 같은 한계이고,
  user-management가 조회 함수를 내놓으면 그때 같이 고친다.
- 검증: `npx tsx features/reviews/prototype/run.tsx` → **PASS 40 / FAIL 0** (재해석 전후 로직
  변화 없음 확인). `app/server`·`app/web` 양쪽 `tsc --noEmit`·`vite build` 통과.

**담당자 메모 (조준영 확인 요청 — 재작업이 아니라 확인만 해주면 됨)**
- 위 재해석(프로젝트 조각 2-delegate 합성, userExists 임시 캐시)이 규칙 7·9와 어긋나지 않는지만
  봐주시면 됩니다. 이상 없으면 상태를 `반영완료`로 바꿔주세요.

---

## 항목 2 — [CR] 이번 반영에서 일부러 하지 않은 것 3가지

상태: 미확인

**Fact**
1. **`publishDueSoloReviews`(14일 경과 단독 리뷰를 스캔해 뒤늦게 공개 이벤트를 보내는 배치
   함수)를 app/server로 옮기지 않았다.** app/에 아직 스케줄러(cron 등) 인프라가 없다 —
   `isReviewPublic` 자체는 조회 시점마다 계산되므로(review.service.ts) 리뷰 자체가 공개로
   "보이는" 데는 문제가 없지만, `REVIEW_CREATED` 이벤트가 그 시점에 딱 맞춰 발행되지는
   않는다(다음에 그 프로젝트로 `createReview`나 `listProjectReviews`가 호출될 때야 뒤늦게
   발행된다).
2. **`getPublishedRatingAggregate`(api-contract.md의 내부 조회, "오민혁이 REVIEW_CREATED
   수신 후 호출")의 HTTP 어댑터를 열지 않았다.** 함수 자체는 `review.service.ts`에 그대로
   있지만, 지금 app/에 이 값을 구독하는 다른 기능이 없다(notifications 폴더가 `.gitkeep`뿐,
   담당 미정).
3. **`ReviewPage`로 들어가는 진입점(프로젝트 상세·관리 화면의 "리뷰 작성" 링크)을 연결하지
   않았다.** 확인해보니 `ProjectDetailPage`가 내려주는 `transactionStatus`는 지금
   `mine`(등록 의뢰인)에게만 있다 — 규칙 9 "거래 상태는 등록 의뢰인에게만 내려온다"는 원래
   `TransactionBadge` 표시를 위한 규칙인데, 그 결과 **프리랜서 쪽 화면은 자기 프로젝트가
   COMPLETED인지 알 방법이 지금 없다**. 그래서 리뷰 작성 링크를 어느 화면에 보여줄지(의뢰인
   쪽만? 프리랜서 쪽엔 다른 값을 새로 내려줘야 하는지?)는 project-management 담당자 확인 없이
   임의로 정하지 않았다. 화면 자체(`/projects/:projectId/review`)는 URL로 바로 들어가면
   동작한다 — 검증 완료.

**어떻게·왜 채웠는지 (Assumption/Opinion)**
- 셋 다 applications의 CR(항목 2, `applicationCount` 갱신 포트 없음)과 같은 원칙 — 다른 기능
  소유자의 결정이 필요하거나 아직 없는 인프라(스케줄러)에 기대는 부분을 리뷰 없이 임의로
  만들지 않았다.

**담당자 메모**
- 1번·2번은 급하지 않으면 그대로 두고 다음 스프린트에서 notifications 담당이 정해질 때 같이
  풀어도 됩니다. 3번(프리랜서에게 거래 완료 여부를 어떻게 알려줄지)은 project-management
  담당자와 먼저 합의가 필요합니다 — 정해지면 팀장이 진입점을 연결합니다.

---
