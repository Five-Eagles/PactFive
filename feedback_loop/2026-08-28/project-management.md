# project-management 피드백 — 2026-08-28 통합

반영 커밋(prototype 기준): 3e4977e
sync-log.md 기록: 있음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — [충돌] `/internal/v1/projects/*` 소유권을 project-management로 이관했다

상태: 미확인

**Fact — 무엇이 어긋났나**
- 2026-08-27 통합에서 contracts-payments가 `/internal/v1/projects/:projectId/...` 5종을 임시로
  서빙했다. `in-memory-project-transaction.adapter.ts`가 project-management 서버 역할을 흉내 냈고,
  controller·routes도 그 폴더에 있었다. 그때 남긴 기록이
  `feedback_loop/2026-08-27/contracts-payments.md` 항목 2이며, "project-management 통합 시
  이 controller/routes를 그쪽 폴더로 옮기는 걸 검토해야 한다"로 끝났다.
- `features/project-management/api-contract.md`와 `prototype/server/ports/project-transaction.port.ts`는
  이 경로의 구현자가 project-management라고 명시한다 (PRD §5.1 원칙 1 — 상태에는 주인이 있다).

**어떻게 채웠는지**
- 팀장이 소유권 이관을 결정했다. 이번 통합에서:
  - `app/server/src/features/contracts-payments/`의 `project-transaction.controller.ts`,
    `project-transaction.routes.ts`, `in-memory-project-transaction.adapter.ts`를 **삭제**했다.
  - `app/server/src/features/project-management/project-contract.controller.ts`,
    `project.routes.ts`를 새로 만들고 원본 `project-contract.service.ts`를 실제 백엔드로 연결했다.
    **경로·요청/응답 형태는 그대로다** — "되돌리기 비싼 것"을 이관하면서 바꾸지 않았다.
  - 원본에 없던 7번째 주소 `POST /internal/v1/projects/:projectId/accept-application`도
    api-contract.md에 있는 대로 함께 열었다 (이전 반영에는 5종만 있었다).
  - contracts-payments는 순수 호출자가 됐다. `project-management.adapter.ts`(신규)가
    조립 지점에서 project-management의 계약 서비스를 delegate로 받는다 — 두 기능 폴더는
    서로 import하지 않는다.

**왜 그렇게 채웠는지 (근거)**
- `features/project-management/api-contract.md` "내부 계약 — `/internal/v1`" 및
  `prototype/server/ports/project-transaction.port.ts` 상단 주석("이 구현이 올라간 뒤에는
  그쪽이 이 포트를 import 한다"). 원래 설계로 되돌린 것이지 새 결정이 아니다.

**담당자 메모**
-

---

## 항목 2 — 참조 데이터(카테고리·기술·의뢰인 프로필)를 포트로 드러냈다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `isOfficialSkill` · `isKnownSkill` · `isValidCategory` · `toCategoryRef` · `toSkillRefs` ·
  `toClientProfile`이 `prototype/mock/project.mock.ts`(저장소 Mock 파일) 안의 상수 테이블로
  들어가 있고, `project.service.ts`가 그 파일을 직접 import한다. spec.md는 이 값들의 정본이
  user-management(PRD D-12)라고만 적고 어떤 경로로 읽을지는 정하지 않았다.

**어떻게 채웠는지**
- `app/server/src/features/project-management/project.port.ts`에 `ProjectCatalogPort`를 만들고
  서비스가 `ports.catalog`를 거치게 했다. 구현은 `in-memory-external.adapter.ts`의
  `createInMemoryProjectCatalog()`이며 원본의 상수 테이블을 그대로 옮겼다.
- **`toClientProfile`만 값을 바꿨다.** 원본은 `usr_client_a` = "김의뢰"처럼 사람 이름이 든
  고정 테이블을 갖고 있었는데, app/에 그대로 두면 실제 사용자에게 없는 이름이 표시된다.
  식별자만 채우고 나머지는 빈 값(`name: "알 수 없음"`, `averageRating: 0`)으로 두었다.

**왜 그렇게 채웠는지 (근거)**
- `app/server/AGENTS.md` "외부 벤더 연동"과 ADR-0009 — 다른 도메인의 데이터는 포트 뒤에 둔다.
  저장소 구현 파일 안에 숨겨두면 user-management가 실제 조회 함수를 내놓았을 때 갈아끼울
  지점을 찾기 어렵다.
- 이름 값 제거는 "없는 값을 지어내지 않는다" — 근거 없는 표시 데이터를 배포 코드에 두지 않는다.

**담당자 메모**
-

---

## 항목 3 — 프로필 완성 판정(규칙 7)을 잠정적으로 통과시킨다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- 규칙 7은 등록 전 `getProfileCompletion`을 호출해 프로필 완성을 확인하라고 정한다.
  user-management는 app/에 통합돼 있으나 **이 판정 함수를 아직 노출하지 않는다.**

**어떻게 채웠는지**
- `in-memory-external.adapter.ts`의 `createPermissiveProfilePort()`가 항상 `COMPLETE`를 준다.
- 함께 있는 applications·contracts·ai-pricing 포트는 반대로 **`FAILED` / 예외**를 준다.

**왜 그렇게 채웠는지 (근거)**
- 두 방향이 다른 이유: 프로필 포트를 `INCOMPLETE`로 두면 A-01 등록이 전부 403이 되어 이번
  통합에서 등록 경로 자체를 확인할 수 없다. 반면 일괄 거절·계약 무효화는 실패로 두는 쪽이
  정직하다 — 규칙 29가 `FAILED`를 202로 내보내도록 이미 설계돼 있어, 화면이 "지원자 정리가
  아직 끝나지 않았다"고 안내할 수 있다. `NOT_NEEDED`나 `DONE`으로 위장하면 정리가 끝난 것처럼
  보인다.
- **근거 없음(팀장 판단)** — 등록 경로를 막지 않기 위한 잠정 결정이다. user-management가
  판정 함수를 내놓는 즉시 이 어댑터를 교체해야 하며, 그전에 배포하면 프로필 미완성 의뢰인도
  프로젝트를 등록할 수 있다.

**담당자 메모**
-

---

## 항목 4 — 비로그인도 볼 수 있는 라우트를 위해 `optionalAuth`를 새로 만들었다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- 규칙 9·13은 "비로그인·다른 사용자는 `PublicProjectDetail`, 등록 의뢰인은 `ClientProjectDetail`"을
  요구한다. 즉 A-03 상세는 **토큰이 없어도 200이어야 하고, 있으면 더 많이 줘야 한다.**
- `app/server/src/shared/require-auth.ts`는 토큰이 없으면 401로 끊는다. 이걸 붙이면 비로그인이
  프로젝트를 못 보고, 아무것도 안 붙이면 등록 의뢰인이 관리 정보를 못 받는다.

**어떻게 채웠는지**
- `app/server/src/shared/optional-auth.ts`를 새로 만들었다 — 토큰이 있으면 검증해 `req.user`를
  채우고, 없거나 틀리면 그냥 통과시킨다. A-03과 engagement의 추천 조회에 쓴다.
- 틀린 토큰도 401로 끊지 않는다. 이 라우트들에서 인증은 "더 보여줄지"의 판단 재료일 뿐이고,
  만료된 토큰을 든 사용자에게 공개 정보마저 막을 이유가 없다.

**왜 그렇게 채웠는지 (근거)**
- spec.md 규칙 9·13이 요구하는 동작을 기존 미들웨어 두 개(require-auth / 없음)로는 표현할 수
  없다. `shared/`에 둔 것은 engagement도 같은 것이 필요해서다 (app/web/AGENTS.md의 "같은 것이
  두 번째로 필요해질 때 shared/로 올린다"와 같은 기준).

**담당자 메모**
-

---

## 항목 5 — 화면 구조를 시안이 아닌 프로토타입 코드 기준으로 만들었다

상태: 미확인

**Fact — 무엇이 어긋났나**
- `design/high-fi-browse.html`의 SCR-B02(프로젝트 상세)에는 화면 구조가 전부 정의돼 있다 —
  2단 그리드(`.detail { grid-template-columns: 1fr 320px }`), sticky 사이드바(의뢰인 카드 +
  지원하기/북마크), `.kv` 키-값 행, `.frame > header` 앱 셸.
- 반면 `prototype/web/ProjectBrowse.tsx`의 `ProjectDetail`은 `<article>` + `<dl>` 뼈대뿐이다.
- **팀장이 프로토타입 코드를 기준으로 통합해 시안의 구조가 통째로 빠졌다.**
  `design/_tokens.css`(162줄)에서도 토큰 변수(`:root`)만 옮기고 그 아래 컴포넌트 클래스
  100여 줄을 빠뜨려, `.frame` · `.kv` · `.h2` · `.steps` 등 25개 클래스가 `app/web`에 없다.
- 영향은 상세만이 아니다 — B01의 `.pcard`·정렬 버튼 그룹·페이지네이션, B03~B05의 단계
  표시(`.steps`), 그리고 앱 셸(로고+nav)이 전부 없다.

**어떻게 채웠는지 (재발 방지 장치)**
- 먼저 재발 방지 장치를 넣었다:
  - `app/web/AGENTS.md`에 "무엇이 무엇의 정본인가" 표를 추가했다 — 화면 구조의 정본은
    `design/*.html`이고 `prototype/web/*.tsx`가 아니라는 것, 둘이 다르면 시안이 옳다는 것을 명시.
  - 같은 문서의 "통합 시 확인"에 **화면이 시안과 같은가** 항목 4개를 추가했다.
    기존 8개 항목은 전부 코드 규칙이었고 구조를 묻는 항목이 하나도 없었다.
  - `sdd-framework/integration-workflow.md` 3단계와 반영 완료 체크에 같은 내용을 반영했다.
  - `npm run check:design`(`scripts/check-design-drift.js`) 신규 — 시안 클래스 누락과
    원시 색상값을 기계로 잡는다. 지금 돌리면 25개 누락이 나온다.
  - Claude Code PostToolUse 훅(`.claude/settings.json` +
    `scripts/claude-hooks/design-source-notice.js`) 신규 — `app/web`의 화면 파일을 고칠 때
    그 기능의 시안 경로를 알린다.

**왜 그렇게 채웠는지 (근거)**
- 원인이 문서에 있었다. `app/web/AGENTS.md`가 `design/*.html`을 "필수 요소 목록"으로만
  지칭해서, 그 파일이 문구 체크리스트로 읽혔다. 어느 쪽이 구조의 정본인지 정하는 문장이
  없었던 것이 실제 원인이라, 그 문장을 넣는 것이 가장 직접적인 처방이다.
- 검사 스크립트를 git 훅이나 CI가 아니라 `npm run`으로 둔 이유: 이 실수는 커밋 전에 이미
  끝나 있었다. 커밋·푸시 시점 장치는 늦다. (참고: 이 저장소는 비공개 + 무료 플랜이라 브랜치
  보호를 쓸 수 없어 CI가 머지를 막지도 못한다.)

**어떻게 채웠는지 (화면)**
- 장치를 넣은 뒤 화면을 시안 구조로 다시 짰다. `design/_tokens.css`의 컴포넌트 클래스와
  각 `high-fi-*.html`의 `<style>` 블록을 `app/web/src/shared/ui/tokens.css`로 옮기고
  (`npm run check:design` 통과), 아래를 반영했다.

  | 화면 | 시안에서 가져온 구조 |
  |---|---|
  | 전체 | 앱 셸 `.frame > header`(로고 + nav) — 1차에는 헤더 자체가 없었다 |
  | SCR-B01 | `.toolbar`(검색·필터·`.sorts` 3버튼) → `.grid--cols3`의 `.pcard` → `.pager` |
  | SCR-B02 | `.detail` 2단(1fr 320px) · 설명 카드 · `.kv` 4행 · `.side` sticky 사이드바 |
  | SCR-B03~B05 | `.steps` 1-2-3 단계 표시 |
  | SCR-B07 | `.card` 안의 `.row` 목록(`.row__main`·`.row__badges`·`.row__acts`) |
  | SCR-B08 | `.pcard` + `.pcard__foot`, 마감분 `.pcard--dim` |
  | SCR-B09 | `.reco` 4열 그리드의 축소 `.pcard` |

- 시안에 있으나 1차에 없던 **거래 상태 배지**(`계약 대기`·`작업 중`·`완료`·`취소됨`)와
  **재모집 가능 배지**를 `TransactionBadge`·`ReopenBadge`로 추가했다. 규칙 9대로 내 프로젝트
  화면에만 나온다.

**시안과 다르게 한 것 — 확인 필요**
- **nav 두 번째 항목을 역할에 따라 바꿨다.** 시안은 "프로젝트 찾기 · 내 프로젝트" 고정인데,
  프리랜서에게 "내 프로젝트"는 의뢰인 전용이라 누를 수 없다. 프리랜서에게는 "내 북마크"를
  보여준다. 누를 수 없는 메뉴를 두지 않는다는 판단이며, 시안 수정이 필요할 수 있다.
- **`PermissionAwareActions`의 차단 사유를 `title` 속성으로 옮겼다.** 시안 SCR-B07의 행
  레이아웃은 버튼만 늘어놓는 구조라 사유를 텍스트로 붙이면 행이 깨진다. 화면에 보이지 않으므로
  접근성 측면에서 더 나은 표현이 있으면 알려 달라.

**시안 자체의 결함**
- `features/engagement/design/high-fi-bookmarks.html`의 `.pcard.dim`이 `--surface-muted`를
  참조하는데 그 변수가 `_tokens.css`에 **정의돼 있지 않다.** `--surface-subtle`로 대체했다.
  시안 쪽을 고칠지 토큰을 추가할지 정해야 한다.

**남은 일**
- SCR-B06(프로젝트 수정)·SCR-B10(재모집 다이얼로그)은 여전히 화면이 없다. 담당자 원본
  (`prototype/web/ProjectManage.tsx`)에는 두 컴포넌트가 이미 있고, 팀장이 이번 통합 범위에서
  뺀 것이다 — 담당자가 판단할 것이 없어 `sync-log.md` 비고에만 적었다.
  `내 프로젝트`의 `수정`·`다시 모집하기` 버튼은 아직 아무 동작도 하지 않는다.
- SCR-B01의 `필터` 버튼은 필터 화면이 없어 검색 제출로 동작한다 (항목 6).

**담당자 메모**
-

---

## 항목 6 — SCR-B01의 `필터` 버튼에 대응하는 화면이 없다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `design/high-fi-browse.html`의 필수 요소 목록에 버튼 `필터`가 있다. 그런데 필터 화면(어떤
  조건을 어떤 UI로 고르는지)은 시안에도 spec.md에도 없다.
- `api-contract.md`는 쿼리 파라미터로 `category` · `skills` · `minBudget` · `maxBudget` ·
  `deadlineBefore`를 이미 받는다. 즉 **서버는 준비돼 있고 화면만 없다.**

**어떻게 채웠는지**
- 버튼은 시안대로 두되 검색 제출과 같은 동작을 하게 했다. 없는 화면을 지어내지 않았다.

**왜 그렇게 채웠는지 (근거)**
- 필터 UI는 조건 5종을 어떻게 배치할지(사이드 패널 · 모달 · 인라인)에 따라 화면이 크게
  달라진다. 근거 없이 정하면 나중에 통째로 갈아엎게 된다 — 담당자가 시안으로 정해 주는 것이 맞다.

**담당자 메모**
-
