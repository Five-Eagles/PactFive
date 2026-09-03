# project-management 피드백 — 2026-09-04 통합 (대표 페이지 이식)

반영 대상: `features/project-management/design/reference-proposal/main.html` → `app/web/src/features/project-management/HomePage.tsx` + `home/`
sync-log.md 기록: 있음
설계 문서: `features/project-management/design/homepage-transplant-plan.md`

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

대표 페이지는 CR-0011로 담당이 유동우로 바뀌었다 — 아래 항목은 그 담당자 확인 대상이다.

---

## 항목 1 — 헤더를 AppShell 대신 시안 자신의 헤더로 갈아 끼웠다 (Option C)

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `main.html`은 자기 헤더(`.hdr`, 로고+4메뉴)를 갖고 있는데, 실제 앱의 `HomePage.tsx`는
  이미 `App.tsx`가 두르는 공용 `AppShell`(로고+2메뉴) 안에서 렌더된다. 그대로 옮기면 헤더가
  두 번 나온다.

**어떻게 채웠는지**
- `App.tsx`의 `AppRoutes()`가 현재 경로가 `/`(홈)일 때만 `AppShell`로 감싸지 않는다
  (`location.pathname === APP_ROUTES.home`). 홈은 `home/Header.tsx`가 시안의 헤더를 그대로
  그린다. 다른 화면은 전부 그대로 `AppShell`을 쓴다.

**왜 그렇게 채웠는지 (근거)**
- 팀장 판단 + 팀장 지시(2026-09-04). 처음엔 "AppShell 유지, 자체 헤더 미이식(Option A)"을
  추천했었다 — 이유는 "전문가 찾기·이용 방법" 메뉴가 죽은 링크가 된다는 것뿐이었다. 그런데
  이 통합에서 NotYetDialog(항목 2)를 만들면서 그 문제가 풀렸고, 팀장이 "이 화면이 디자인의
  루트"라고 명시적으로 정하면서 Option C로 바꿨다. 다른 화면과 헤더 모양이 달라지는
  비일관성은 감수하기로 했다 — AppShell 전체를 이 헤더로 승격할지는 이번 범위 밖의 별도
  결정이다(homepage-transplant-plan.md 4번 절 Decision).

**담당자 메모**
-

---

## 항목 2 — "미구현 버튼" 처리를 신규 사이트 전역 정책으로 만들었다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- 시안에 있지만 실제로 없는 화면(전문가 찾기·이용 방법·안전한 거래·푸터 3개, 추천 전문가
  카드)을 어떻게 처리할지는 어느 문서에도 정의돼 있지 않았다.

**어떻게 채웠는지**
- `shared/notYetScreens.ts`(이름·담당·명세 위치 레지스트리) + `shared/ui/NotYetDialog.tsx`
  (화면 자체가 없는 경우 — 제자리에서 모달만) + `shared/ui/ComingSoonOverlay.tsx`(경로는
  있는데 로직이 없는 경우 — 이동은 시키고 블러+강제 모달)를 새로 만들었다. `App.tsx`의
  `NOT_INTEGRATED_ROUTES`(applications·ai-pricing·reviews·notifications)도 이번에
  `ComingSoonOverlay`로 바꿨다. `app/web/AGENTS.md`·`sdd-framework/integration-workflow.md`에
  앞으로 모든 기능이 따를 표준 정책으로 기록했다.

**왜 그렇게 채웠는지 (근거)**
- 팀장 지시(2026-09-04) + 전례. `reference-proposal/bundle.html`의 `demo/notyet.js`가 이미
  같은 문제를 같은 방식(다이얼로그로 담당·명세를 말해준다)으로 풀어 둔 걸 발견했다 — 그
  철학과 마크업을 React로 그대로 옮겼다.

**담당자 메모**
-

---

## 항목 3 — 카테고리 매핑을 잘못 알고 있다가 구현 중 서버에 직접 물어 정정했다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- README "확인이 필요한 것" 표는 "카테고리 10종 vs ERD 6종" 질문만 남겨 뒀지, ERD 6종의
  정확한 값 목록까지는 이 통합 작업 범위에서 다시 확인하지 않았다.

**어떻게 채웠는지**
- 처음에 `MOBILE_APP`→`APP_DEVELOPMENT`, `데이터·AI`→`ETC`로 옮기는 설계를 세웠다가,
  구현 중 로컬 서버에 `GET /api/v1/projects?category=ETC`를 직접 던져 422
  `INVALID_CATEGORY`를 받고서야 틀린 걸 알았다. `app/server/src/features/project-management/
  in-memory-external.adapter.ts`의 `VALID_CATEGORIES`를 확인해 실제 값
  (`WEB_DEVELOPMENT`·`MOBILE_APP`·`DESIGN`·`DATA_AI`·`PLANNING`·`MARKETING`)으로 고쳤다 —
  `APP_DEVELOPMENT`·`ETC`는 애초에 없었다. `home/categories.ts` 참고.

**왜 그렇게 채웠는지 (근거)**
- 잘못된 기억(이전 세션 요약)을 그대로 설계 문서에 옮겨 적은 것이 원인이었다. 구현 중
  실제 서버로 검증하지 않았다면 배포 후에나 발견됐을 문제다 — 이후 비슷한 "ERD 값"류
  판단은 문서만 보지 말고 서버 코드나 실제 응답으로 재확인하는 편이 안전하다는 교훈만 남긴다.

**담당자 메모**
-

---

## 항목 4 — 히어로 검색·카테고리·인기 검색어가 목록 화면에 쿼리스트링으로 넘어가게 새로 연결했다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `api-contract.md`는 `GET /api/v1/projects`의 `keyword`·`category` 쿼리 파라미터를
  정의하지만, 화면 간에 그 값을 어떻게 넘길지(URL 모양)는 정의하지 않았다.
  `ProjectBrowsePage.tsx`도 지금까지 자기 화면 안의 로컬 상태로만 검색어를 다뤘다.

**어떻게 채웠는지**
- `home/Hero.tsx`·`home/CategoryGrid.tsx`가 각각 `/projects?keyword=...`·
  `/projects?category=...`로 이동시키고, `ProjectBrowsePage.tsx`는 `useSearchParams()`로
  최초 진입 값만 읽어 초기 상태로 쓴다(이후 화면 안에서 검색하면 URL은 갱신하지 않는다 —
  뒤로가기 히스토리를 늘리지 않으려는 기존 설계와 일관되게 맞췄다).

**왜 그렇게 채웠는지 (근거)**
- 시안 원본(`main.html`)은 정적 데모라 해시(`#keyword=`)를 썼다 — 실제 SPA에서는 그 대신
  쿼리스트링 + 초기값 읽기가 자연스러운 대응이라 판단했다(project.routes.tsx의 "자원 id를
  경로에 두고 화면 진입 시 서버가 파생값을 채운다" 패턴과 같은 결의 판단).

**담당자 메모**
-

---

## 항목 5 — 헤더 오른쪽(로그인 상태) 영역: "마이페이지"가 없어 실제 화면으로 대신 연결했다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `bundle.html`의 `demo/session.js`(`paintHeader`)가 로그인 시 "이름 → 마이페이지" 링크를
  그리는데, 실제 앱엔 마이페이지 화면(`/mypage`)이 없다(원본도 `#/mypage` 해시일 뿐 실제
  화면은 없다 — `mypage.html`은 프로토타입 전용).

**어떻게 채웠는지**
- `home/Header.tsx`의 "이름" 링크를 의뢰인은 `PROJECT_ROUTES.manage`(내 프로젝트), 프리랜서는
  `ENGAGEMENT_ROUTES.myBookmarks`(내 북마크)로 보냈다 — `App.tsx`가 이미 `AppShell` nav에서
  쓰던 것과 같은 역할 분기다.

**왜 그렇게 채웠는지 (근거)**
- 마이페이지가 없다고 NotYet 다이얼로그로 막으면 로그인한 사용자가 "내 활동"에 갈 방법이
  대표 페이지엔 아예 없어진다(AppShell을 안 쓰기 때문에). 실제로 존재하는 같은 목적의 화면을
  대신 연결하는 쪽이 더 나은 판단이라고 봤다.

**담당자 메모**
-

---

## 항목 6 — 배너 이미지 3장을 시안 자산 그대로 복사해 썼다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- 최종 배포용 배너 이미지 자산이 아직 없다.

**어떻게 채웠는지**
- `reference-proposal/assets/banner-b2b.jpg`·`expert-dashboard.jpg`·`expert-branding.jpg`를
  그대로 `app/web/public/images/home/`에 복사해 썼다.

**왜 그렇게 채웠는지 (근거)**
- 근거 없음 — 팀장 판단. 빈 이미지보다는 시안 제작자가 이미 골라 둔 이미지를 쓰는 쪽이
  낫다고 봤다. 최종 자산으로 교체할지는 `homepage-transplant-plan.md` 9번 Decision 항목.

**담당자 메모**
-

---

## 항목 7 — [참고] `--gap-*`·`--r-*`·`--shadow-*` 토큰 이름 체계가 기존 화면들과 다르다

상태: 미확인

**Fact**
- `home.css`가 새로 쓰는 반경·간격·그림자 스케일(`--r-sm`~`--r-pill`, `--gap-1`~`--gap-6`,
  `--shadow-card`/`-raise`/`-hero`)은 기존 `shared/ui/tokens.css`의 이름 체계
  (`--card-radius`·`--btn-radius`처럼 컴포넌트별 이름, 하드코딩 px)와 다르다.

**어떻게 채웠는지**
- `home.css` 로컬로만 선언했다(전역 `tokens.css`에 섞지 않았다). `campaign` 기본 3색만
  `design-tokens.md` 정본에 있어 `shared/ui/tokens.css`로 옮겼고, 파생 색조(`-soft`/`-edge`/
  `-deep`)·`--ico-*`·`--page-w`는 홈 전용으로 남겼다.

**왜 그렇게 채웠는지 (근거)**
- contracts-payments의 BEM vs 공백 클래스 표기 불일치(2026-09-03 기록)와 같은 종류의
  판단이다 — 토큰 체계를 하나로 합치는 건 이 통합 범위를 넘는 팀 논의가 필요해 지금은
  공존시켰다.

**담당자 메모**
-
