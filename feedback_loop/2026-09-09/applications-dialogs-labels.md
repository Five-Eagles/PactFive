# 2026-09-09 — applications 확인 다이얼로그 2개 + 라벨 4종 (팀장)

브랜치 `feature/teamlead-cr-port-2026-09-09`. 최종 통합일 작업 6번째 단위.
근거: `features/applications/review/teamlead-port-instructions-2026-09-09.md`
(조준영, 원격 브랜치 `origin/feature/applications-cr-0002`에만 있다 — 로컬 미병합).
§1(`setClosure` 결함)은 task #195에서 이미 반영했다. 이번엔 §2·§3만 다뤘다(§4는 지시서
자체가 "급하지 않다"고 명시, §5는 #202로 이관).

## 무엇을 했나

### §2-1 — 지원 제출에 확인 다이얼로그가 없었다

`ApplyPage.tsx`의 `handleSubmit`이 검증 직후 바로 `submit`을 호출하고 있었다. 시안
(`design/high-fi.html #submit-overlay`)은 확인 다이얼로그를 거친다 — 제출은 되돌릴 수
없는 동작인데 확인 없이 나가고 있었다.

- `handleSubmit`은 검증만 하고 `confirmOpen`을 연다. 실제 제출은 새 `handleConfirmSubmit`이
  한다.
- `SubmitConfirmDialog` 컴포넌트 신설 — `ManageApplicantsPage.tsx`의 `AcceptConfirmDialog`와
  같은 `.overlay-backdrop`/`.dialog` + 진입 애니메이션 패턴. 마크업·문구는
  `prototype/web/ApplicationPanel.tsx:364~383` 그대로: 제목 「지원서를 제출할까요?」, 본문
  「제출 후에는 수정하거나 철회할 수 없습니다...」, `dl.facts`에 희망 금액·예상기간 재표시,
  버튼 「그만두기」/「제출하기」.

### §2-2 — 지원 거절에 확인 다이얼로그가 없었다

`ManageApplicantsPage.tsx`의 파일 헤더 주석이 "거절은 시안대로 확인 없이 바로 진행한다"고
적혀 있었는데, 실제 시안(`design/high-fi.html #reject-overlay`)에는 거절 확인 다이얼로그가
있었다 — integration-workflow.md의 "시안이 옳다" 원칙에 따라 시안 쪽으로 맞췄다.

- 기존 `confirmTarget`(수락용)과 같은 구조로 `rejectTarget` 상태를 추가했다. 거절 버튼은
  이제 즉시 `reject()`를 부르지 않고 `rejectTarget`을 세팅해 다이얼로그를 연다.
- `RejectConfirmDialog` 컴포넌트 신설 — 제목 「이 지원을 거절할까요?」, 본문 「거절 후에는
  되돌릴 수 없습니다. 자유 사유는 받지 않습니다.」, 버튼 「그만두기」/「거절 확인」
  (`prototype/web/ApplicationPanel.tsx:467~488`).
- 파일 헤더 주석도 실제 동작에 맞춰 갱신했다.

### §3-1 — 지원 상태 라벨 3종

`STATUS_LABEL`이 시스템 상태(`대기`/`수락됨`/`거절됨`)를 그대로 노출하고 있었다. spec.md
규칙 10과 시안은 프리랜서 관점 문구를 요구한다 — `검토 중`/`선정됨`/`미선정`으로 바꿨다.
**두 파일 모두** 반영했다: `MyApplicationsPage.tsx`, `ManageApplicantsPage.tsx`.

### §3-2 — 거절 사유 4종 문구

서버(`application.constants.ts`)에 `REJECTION_COPY` 4종이 이미 있었지만 `app/web`에서
쓰는 곳이 없었다 — 프리랜서가 왜 미선정됐는지 알 방법이 없었다. `MyApplicationsPage.tsx`에
같은 문구를 그대로 옮겨(웹은 서버 폴더를 직접 import하지 않는다, app/web/AGENTS.md) 상태
배지 옆에 `item.rejectionType`별 안내를 추가했다.

### §3-3 — 「완료됨」 배지 + 리뷰 CTA

`status=ACCEPTED ∧ transactionStatus=COMPLETED`일 때 「완료됨」 배지와
`/projects/:projectId/reviews` 링크를 보여준다(규칙 10). 서버는 두 필드를 이미 내려주고
있었다 — 화면만 쓰지 않고 있었다. `REVIEW_ROUTES.project(projectId)`를 그대로 썼다 — task
#198에서 이미 복수형(`/reviews`)으로 맞춰 둬서 추가 조정이 필요 없었다. **이것이 지금
프리랜서의 유일한 리뷰 진입 경로다.**

### §3-4 — `PROFILE_INCOMPLETE` 라벨

`ApplyPage.tsx`의 `BLOCKED_REASON_LABEL`에 이 키를 추가했다. 지시서가 명시한 대로 —
user-management의 `ProfileCompletionPort` 제공자가 아직 없어(오민혁 대기) 서버가 이 사유를
절대 내려주지 않는다. 라벨만 먼저 넣어 둔다 — 포트가 붙으면 이 화면은 코드 변경 없이
동작한다.

### 안 한 것 (의도적)

- **§4(202 폴링)** — 지시서 자체가 "급하지 않다"고 명시했다(항상 즉시 드레인이라 거의
  `SUCCEEDED`로 끝난다). 이번 9단계 계획에 별도 항목으로 없어 손대지 않았다 — 필요하면
  추가 작업으로 잡는다.
- **§5(스키마 2건)** — #202로 이관(CR-AP-004의 유니크 제약은 코드 변경 불필요, `result`
  컬럼 타입은 이미 #195에서 처리).

## 담당자별 영향·후속 조치

**조준영 (applications)** — 영향 없음, 후속 조치 없음. 본인이 쓴 지시서 §2·3을 그대로
반영했다. 지시서의 "확인이 필요한 것"(배포 DB에 이미 객체가 저장된 `application_closures`
행이 있는지)은 #195 범위라 이번 단위와 무관하다.

**오민혁 (ai-pricing / 프로필)** — 영향 없음, 확인 대기 유지. `PROFILE_INCOMPLETE` 라벨을
먼저 넣어 뒀지만 `ProfileCompletionPort` 제공자가 없는 한 동작하지 않는다 — 순서는
지시서와 같이 오민혁님 포트 연결 → 이 라벨 활성화다.

**최윤석 (reviews)** — 영향 없음. `REVIEW_ROUTES.project()`를 그대로 소비만 했다. 라우트가
이미 복수형이라 어긋날 일이 없다.

## 검증

- `app/web` tsc 통과, vite build 통과
- `app/server/tests/project-pricing-registration.test.ts` 8/8 통과(이번 단위는 서버 변경
  없음 — applications 전용 자동 테스트는 리포에 없다)
