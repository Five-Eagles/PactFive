# project-management 피드백 — 2026-08-29 통합

반영 커밋(prototype 기준): 3e4977e (2026-08-28 1차 반영과 동일 — SCR-B06·B10 코드는 그때도
있었고, 이번에 화면·라우팅만 마저 반영했다)
sync-log.md 기록: 있음 — mark-synced.sh 실행 후

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — [판단 필요] SCR-B10을 모달 오버레이로 반영했다

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- `design/high-fi-manage.html`은 SCR-B06·B10을 다른 화면들과 똑같이 `.frame > .body-pad`
  전체 화면으로 그려 두었다 — 시안 문서 자체가 모든 상태를 개별 스크린으로 나열하는
  형식이라, 이 그림만으로는 "재모집 확인이 별도 페이지인지 오버레이인지" 확정할 수 없다.

**어떻게 채웠는지**
- 원본 `prototype/web/ProjectManage.tsx`의 `ReopenRecruitmentDialog`가
  `role="dialog" aria-modal="true"`로 만들어져 있는 걸 근거로, SCR-B07(내 프로젝트) 목록에서
  "다시 모집하기"를 누르면 뜨는 오버레이로 반영했다(`ReopenRecruitmentDialog.tsx`, 별도 라우트
  없음). SCR-B06(수정)은 반대로 `ProjectEditForm`이 일반 폼 컴포넌트였고 시안도 전체 화면이라
  라우트(`/my/projects/:projectId/edit`)로 반영했다.

**왜 그렇게 채웠는지 (근거)**
- 원본 컴포넌트의 명시적 `aria-modal` 마크업을 시안의 화면 나열 방식보다 우선했다 — 근거
  없음(팀장 판단). `design-tokens.md` §13의 오버레이 모션 규칙(240ms, entrance easing)을
  처음 실제로 적용해 볼 좋은 사례이기도 했다.

**담당자 메모**

오버레이가 맞다. 근거로 드신 `role="dialog" aria-modal="true"` 는 제가 의도해서
넣은 것이다 — 재모집은 목록에서 맥락을 잃지 않고 마감일만 새로 정하는 동작이라
별도 화면으로 나가면 어디서 왔는지 잃는다.

시안이 모든 상태를 개별 스크린으로 나열하는 형식이라 그림만으로는 확정할 수 없다는
지적도 맞다. **컴포넌트 마크업을 시안의 나열 방식보다 우선한 판단이 옳다.**

SCR-B06(수정)을 라우트로 둔 것도 맞다. 고칠 필드가 여러 개라 오버레이에 담기 어렵다.

구조를 바꿀 필요 없다.

> 팀장 메모
> - 재모집 확인이 오버레이가 아니라 별도 화면이어야 한다고 생각하면 알려 달라 — 지금은

  `app/web/src/shared/ui/tokens.css`의 `.overlay-backdrop`·`.dialog`를 걷어내고 라우트 하나로
  바꾸면 된다(구조 변경 비용은 크지 않다).

---

## 항목 2 — SCR-B06 수정 범위를 title·description·budgetAmount로 좁혔다

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- `api-contract.md`의 `PATCH /api/v1/projects/:projectId`는 요청 필드로
  `title · description · category · recruitmentStartAt · recruitmentDeadlineAt ·
  budgetAmount · skillIds 중 바꿀 것만`이라고 적어 두어, 마감일·카테고리·기술도 수정
  가능한 것처럼 읽힌다. 반면 1차 반영에서 이미 만들어진 `UpdateProjectRequest` 타입(app/web)은
  `title · description · category · budgetAmount · skillIds`로 마감일(`recruitmentStartAt`·
  `recruitmentDeadlineAt`)이 빠져 있고, 원본 `prototype/web/ProjectManage.tsx`의
  `ProjectEditForm`도 처음부터 title·description·budgetAmount 세 개만 다뤘다.

**어떻게 채웠는지**
- `ProjectEditPage.tsx`도 이 세 필드만 수정 화면에 넣었다 — 기존에 이미 반영돼 있던 타입·
  프로토타입 범위를 그대로 따른 것이라 이번에 새로 좁힌 것은 아니다.

**왜 그렇게 채웠는지 (근거)**
- 근거 없음 — 이미 존재하던 코드(타입·프로토타입)의 범위를 그대로 이어받았을 뿐, 마감일·
  카테고리·기술을 수정 화면에서 뺀 게 의도적 설계인지 1차 반영 때의 누락인지는 이번 반영에서
  확인하지 못했다.

**담당자 메모**

**마감일은 수정할 수 있어야 한다.** 제 규칙과 어긋나 있었다.

`spec.md` 규칙 15 — "대기 중인 지원이 1건이라도 있으면 `budget_amount`와
**모집 일정**을 수정할 수 없다". 뒤집으면 **대기 지원이 0건이면 모집 일정도 수정 가능**
이라는 뜻이고, `editableFields` 도 그때 `recruitmentStartAt`·`recruitmentDeadlineAt`
를 함께 넣어 내려보낸다.

즉 세 필드로 좁힌 것은 의도적 설계가 아니라 **제 프로토타입의 누락**이다.
`ProjectEditForm` 을 만들 때 서버가 이미 내려보내는 `editableFields` 를
다 쓰지 않았다.

카테고리·기술도 같다. 규칙 15 가 잠그는 것은 예산과 일정뿐이고, 나머지는 마감 전이면
언제든 고칠 수 있다.

**제 쪽에서 `prototype/web/ProjectEditForm` 에 빠진 필드를 넣는다.** 서버가
이미 받는다고 확인해 주셔서 app/web 은 타입과 입력만 더하면 된다 —
prototype 이 먼저 맞아 있어야 다음 통합에서 같은 누락이 반복되지 않는다.

> 팀장 메모
> - 마감일 등을 SCR-B06에서 수정할 수 있어야 하는지 확인해 달라. **서버는 이미 준비돼 있다** —

  `app/server/.../project.controller.ts`의 `update` 핸들러가 `recruitmentStartAt`·
  `recruitmentDeadlineAt`을 이미 받는다(133~134행). app/web만 `UpdateProjectRequest` 타입에
  두 필드를 추가하고 `ProjectEditPage.tsx`에 입력을 더하면 된다 — 서버 쪽 추가 작업은
  필요 없어 보인다.
