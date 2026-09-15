# 대표 페이지(main.html) 이식 설계

작성: 팀장 · 2026-09-03(갱신 2026-09-04) · 상태: **논의 중 — 팀 결정 대기**

> **2026-09-04 갱신**: 팀장이 방향을 제시했다 — "전체적인 디자인/스타일은
> `main.html`을 그대로 따르되, 구현되지 않은 버튼은 드러내지 않거나(숨김) 다이얼로그로
> 안내한다. 이 화면이 이제 디자인의 루트이기 때문이다." 이 방향이 4번(헤더)·5번(섹션 범위)·
> 신규 6번(미구현 버튼 정책) 절을 바꿨다 — 옛 내용은 취소선 대신 "이전 안"으로 남기고 바로
> 아래 최종안을 적었다.

> 이 문서는 `HomePage.tsx`(현재는 PR #57이 옮겨 놓기만 한 임시 화면)에
> `features/project-management/design/reference-proposal/main.html`을 실제로 옮겨 심기
> **전에** 먼저 정리한 설계다. 여기 있는 Decision 항목이 확정돼야 구현을 시작한다.

---

## 1. Context — 왜 이 문서가 필요한가

- 회의(9/3)에서 대표 페이지는 새 기능 폴더를 만들지 않고 **project-management 폴더에서 계속
  작업**하기로 결정됐다.
- PR #57(`68037aa`)이 오늘 머지되면서 `App.tsx`에 있던 임시 `HomePage()`를
  `features/project-management/HomePage.tsx`로 **위치만** 옮겼다. 그 파일 자체 주석에
  "확정된 시안을 옮겨 심는 일은 다음 단계다"라고 명시돼 있다 — 이 문서가 그 다음 단계다.
- `features/project-management/prototype/web/`에는 홈 화면 프로토타입이 없다. 즉 이번 이식은
  다른 화면들과 달리 **`design/reference-proposal/main.html` 하나가 유일한 소스**다
  (spec.md·api-contract.md 같은 정본 문서가 화면 구조를 규정하지 않는다).

## 2. Fact — 지금 코드/시안이 실제로 어떤 상태인가

- `main.html`은 635줄, 6개 섹션으로 구성: 검색 히어로 → 기획전 배너 캐러셀 → (로그인 시) 내
  프로젝트 요약 → 카테고리 10종 → **지금 모집 중인 프로젝트**(실제 `GET /api/v1/projects`
  연동, 유일하게 진짜 동적인 구간) → 추천 전문가(목업) → 푸터.
- `main.html`은 자기 자신의 `<header class="hdr">`를 갖고 있다(로고 + "프로젝트 찾기 · 전문가
  찾기 · 이용 방법 · 안전한 거래" 4개 nav).
- 지금 `HomePage.tsx`는 `AppShell`(로고 + "프로젝트 찾기 · 내 북마크/내 프로젝트" 2개 nav,
  로그인 상태에 따라 항목이 바뀜)로 **이미 감싸인 채로** 렌더된다 — `App.tsx`가 모든 라우트를
  `<AppShell>...</AppShell>` 안에 넣기 때문에 `HomePage.tsx`가 이걸 벗어날 수 없다(벗어나려면
  `App.tsx`/`AppShell.tsx` 자체를 고쳐야 한다).
- 즉 지금 그대로 옮기면 **헤더가 위아래로 두 번** 나온다. 이건 반드시 풀어야 하는 충돌이다.
- `main.html`의 페이지 폭은 로컬 오버라이드로 `--page-w: 1412px`다. 나머지 화면들이 쓰는
  `_tokens.css` 정본값은 `--page-max: 1180px`다. `AppShell`의 `PageBody`도 1180px 계열
  폭으로 렌더된다(다른 화면과 동일).
- 카테고리 10종은 ERD `project_category`의 실제 값 6개(`WEB_DEVELOPMENT`·`APP_DEVELOPMENT`·
  `DESIGN`·`MARKETING`·`PLANNING`·`ETC`)보다 많다 — `main.html` 자체가 4개를 `DESIGN`에
  근사시켜 만든 시안이다(README "확인이 필요한 것" 표에 이미 적혀 있음, 팀장 확인 필요로
  표시돼 있었다).
- "이번 주 추천 전문가" 섹션은 데이터 소스가 없다(PRD에 전문가 추천 화면 자체가 없음, 담당자
  미정). "지금 모집 중인 프로젝트" 카드(`.pcard`)는 `ProjectBrowsePage.tsx` 안에 이미 있는
  마크업과 거의 동일한데, 지금은 그 파일 안에 인라인돼 있어 재사용할 수 있는 별도 컴포넌트가
  아니다.
- 색상 토큰 중 `campaign`(yellow/plum/lavender)은 `design-tokens.md` 정본에 이미 정의돼
  있지만 `app/web/src/shared/ui/tokens.css`(실제 CSS)에는 아직 옮겨진 적이 없다(어떤 기존
  화면도 안 썼기 때문). `--ico-*`(카테고리 아이콘 10색)와 `--page-max`/`--page-w`는
  `design-tokens.md`에 아예 없다 — 이 시안이 처음 쓴 값이다.

## 3. Concept — 쉬운 말로

- **AppShell**이란: 모든 화면 위에 공통으로 씌우는 "테두리"다. 지금은 로고 + 메뉴 2개짜리
  얇은 헤더 하나가 전부이고, 로그인 여부에 따라 메뉴 이름이 자동으로 바뀐다. 새 화면을 만들
  때 이 테두리를 다시 그릴 필요가 없게 하려고 만든 공용 부품이다.
- 그런데 `main.html`은 원래 **독립된 한 장짜리 시안**으로 그려졌기 때문에, 자기만의 완전한
  헤더(로고+메뉴 4개)를 통째로 갖고 있다. 실제 앱에 붙이는 순간 이 두 헤더가 겹친다 — 마치
  이미 액자가 있는 그림 위에 또 다른 액자를 씌우는 것과 같다. 둘 중 하나만 남겨야 한다.
- **PageBody**란: AppShell 테두리 안쪽, 실제 콘텐츠가 들어가는 자리의 폭을 통일해 주는
  부품이다(1180px). `main.html`은 배너가 화면 끝까지 꽉 차는 넓은 레이아웃(1412px)으로
  그려졌기 때문에 이 좁은 자리에 그냥 넣으면 배너가 좁게 눌려 보인다.

## 4. Options — 헤더 충돌을 어떻게 풀 것인가

**Option A — AppShell 유지, `main.html`의 자체 헤더는 이식하지 않는다 (추천)**
`<header class="hdr">`는 버리고, `<main>` 이하 콘텐츠만 옮긴다. 로고/메뉴는 지금 AppShell
그대로 쓴다.

**Option B — AppShell 자체를 `main.html` 수준(로고+4메뉴, sticky)으로 업그레이드한다**
모든 화면의 헤더가 한꺼번에 바뀐다.

**Option C — 홈 화면만 AppShell을 벗어나 자기 헤더를 쓰게 한다**
`App.tsx`/`AppShell.tsx`에 "이 라우트는 공용 셸을 생략한다" 옵션을 새로 만들어야 한다.

### 비교

| 기준 | A. AppShell 유지 | B. AppShell 업그레이드 | C. 홈만 셸 생략 |
|---|---|---|---|
| 구현 난이도 | 낮음 — `HomePage.tsx`만 수정 | 높음 — 전체 화면 헤더 재작업 + 회귀 확인 | 중간 — 라우팅/셸 구조 변경 필요 |
| 영향 범위 | 홈 1개 화면 | 전체 화면 | 홈 1개 화면(구조는 전체에 영향) |
| Dead link 문제 | 없음 (전문가 찾기·이용 방법 링크 자체가 안 나옴) | 여전히 남음 (그 두 메뉴를 빼거나 죽은 링크로 둬야 함) | 여전히 남음 |
| 로그인 인식 nav | 그대로 재사용 (이미 구현돼 있음) | 새 헤더에 다시 구현해야 함 | 다시 구현해야 함(홈 전용) |
| 사용자 경험 일관성 | 좋음 — 모든 화면 헤더 동일 | 좋음 — 전체가 새 스타일로 통일 | 나쁨 — 홈만 헤더가 바뀌었다가 다른 화면 가면 또 바뀜 |
| 지금 규모에 적합한가 | 적합 | 과함(전문가 찾기·이용 방법 화면 자체가 없는데 헤더부터 승격) | 부적합(구조 비용 대비 이득 적음) |

### 팀장 의견 (Opinion, 근거 있음 — 최종 결정 아님)

A를 추천한다. `.hdr`의 "전문가 찾기"·"이용 방법" 링크는 대응하는 화면이 없어서(README에
이미 팀장 확인 필요로 남아있던 항목) 지금 그대로 이식하면 죽은 링크가 생긴다. AppShell은
이미 로그인 상태로 메뉴를 바꾸는 로직이 있어 다시 만들 필요가 없다. B·C는 지금 이 결정과
무관하게 나중에 "전문가 찾기" 화면을 실제로 만들기로 할 때 다시 검토하면 된다.

**단, 폭 문제(1412px vs 1180px)는 헤더 문제와 별개로 남는다.** `PageBody`를 그대로 쓰면
배너가 좁아진다. → `HomePage.tsx`는 `PageBody`를 쓰지 않고 자체 wrapper(`.home-wrap`류)를
새로 두는 것을 제안한다. AppShell의 헤더/푸터 테두리는 그대로, 그 **안의 콘텐츠 폭만** 홈
화면이 직접 정한다 — 이것도 팀장 의견이며 아래 Decision에 넣는다.

### 2026-09-04 결정 — Option A → **Option C**로 변경

A를 추천했던 유일한 이유는 "전문가 찾기·이용 방법 링크가 없는 화면을 가리켜 죽은 링크가
된다"였다. 그런데 이 시안 폴더(`reference-proposal/`) 자체가 이미 이 문제를 풀어 둔 부품을
갖고 있었다 — `demo/notyet.js`(`bundle.html` 3259~3360줄에 실제 코드가 있다). 없는 화면을
누르면 "○○ 화면은 아직 없습니다 / 담당 / 명세 위치"를 보여 주는 다이얼로그이고, 자기
철학까지 주석으로 적혀 있다: *"링크를 `href=#`로 두면 눌러도 아무 일이 없다. 사용자는
고장으로 읽는다. 없다는 것을 말하고, 누가 만들며 명세가 어디 있는지까지 준다."*

이 부품을 실제 앱에 그대로 들여오면(6번 절 참고) A의 유일한 근거가 사라진다. 그러면 남는
건 "왜 시안의 절반(콘텐츠)만 옮기고 헤더는 버리는가"라는 질문뿐이고, 팀장이 오늘 이 화면을
디자인의 루트로 정했다는 방향과도 어긋난다. **그래서 Option C로 바꾼다 — 홈 화면은
`main.html`의 헤더를 그대로(로고 4개 메뉴) 이식하고, AppShell을 쓰지 않는다.** 전문가
찾기·이용 방법·안전한 거래 3개 메뉴는 실제 경로로 보내는 대신 NotYet 다이얼로그를 연다.

**단서**: 이건 홈 1개 화면에 한정한 결정이다. 다른 화면(목록·상세·계약 등)은 여전히
AppShell을 쓴다 — 로그인하고 홈에서 목록으로 넘어가면 헤더 모양이 바뀐다는 뜻이다. 이
비일관성을 감수할지, 아니면 AppShell 자체를 이 헤더로 승격하는 별도 작업을 언제 할지는
Decision에 남겨 둔다(지금 이 통합의 범위에는 넣지 않는다 — 블라스트 반경이 전체 화면이라
별도 논의가 필요하다).

## 5. 섹션별 범위 — 이번에 만들 것 / 보류할 것

**2026-09-04 갱신**: "디자인 그대로 따르되 안 되는 버튼만 숨기거나 다이얼로그로" 방향에 따라
아래 표를 바꿨다. 이전 안(추천 전문가·카테고리 축소)은 취소하고 오른쪽 열에 이유를 남긴다.

| 섹션 | 이번에 포함 | 근거 |
|---|---|---|
| 검색 히어로 | ✅ 포함 | 정적 콘텐츠 + `PROJECT_ROUTES.browse`로 라우팅, 데이터 의존 없음 |
| 기획전 배너 캐러셀 | ✅ 포함(단, 이미지 자산 경로 미확정 — Decision 참고) | 정적 콘텐츠. CTA 3개 중 1개(등록하기)는 실제 경로, 2개(전문가 확인·안전한 거래)는 NotYet 다이얼로그(6번 참고) |
| 카테고리 10종 | ✅ 포함 — **시안 그대로 10칸, 클릭 목적지만 실제 ERD 값으로 교정** | ~~ERD 6종으로 줄인다(이전 안)~~ → 시각은 그대로 두고 목적지만 고친다. **2026-09-04 구현 중 정정**: `MOBILE_APP`→`APP_DEVELOPMENT`, `DATA_AI`→`ETC`로 옮기려 했으나 틀렸다 — 서버(`in-memory-external.adapter.ts`)에 직접 물어보니(`category=ETC` → 422) 실제 `VALID_CATEGORIES`는 `WEB_DEVELOPMENT`·`MOBILE_APP`·`DESIGN`·`DATA_AI`·`PLANNING`·`MARKETING`이다. `APP_DEVELOPMENT`·`ETC`는 애초에 없다 — 시안의 "앱 개발"·"데이터·AI"는 값을 안 바꿔도 이미 맞았다. `UX·UI`/`브랜딩`/`영상·사진`/`콘텐츠` 4개만 `DESIGN`으로 근사한다(README 제안 그대로, 유일하게 남는 근사) |
| 내 프로젝트 요약 | ❌ 보류 (빈 자리만 마운트) | **이건 "버튼이 없는" 문제가 아니라 "데이터 자체가 없는" 문제다** — 조준영 Step 2 포트가 생기기 전까진 다이얼로그로도 대체할 내용이 없다. 정책이 안 바뀐다 |
| 지금 모집 중인 프로젝트 | ✅ 포함 | 유일하게 실제 API로 되는 구간, `ProjectBrowsePage`의 카드 재사용 |
| 추천 전문가 | ✅ 포함(시각 전체 — 목업 카드까지) — 카드 클릭·전체 보기는 NotYet 다이얼로그 | ~~섹션 자체를 렌더링하지 않는다(이전 안)~~ → 디자인 루트 방침에 따라 섹션은 그대로 보여주고, 실제로 갈 곳이 없는 상호작용만 다이얼로그로 막는다 |
| 푸터 | ⚠️ 조건부 — 이번엔 홈 전용으로만 추가 | 사이트 전체 푸터로 승격할지는 별도 결정 사항(Decision 참고). 메뉴(이용약관·개인정보처리방침·고객센터) 3개도 전부 미구현 → NotYet |

## 6. 미구현 버튼/링크 처리 정책 — NotYet 다이얼로그

> **2026-09-04 추가 갱신**: 팀장이 정책을 두 갈래로 나눴다 — "화면 자체가 없으면 제자리에서
> '준비 중입니다' 다이얼로그, 화면은 있는데 핵심 로직이 안 끝났으면 그 화면으로 이동시키고
> 화면을 블러 처리한 채 다이얼로그 + 뒤로가기 버튼." 아래 원안(포트 계획)은 그대로 두고,
> 그 뒤에 이 두 갈래를 어떻게 나눠 적용하는지를 추가했다.

**Fact:** `reference-proposal/` 폴더 자체가 이 문제를 이미 풀어 놓은 부품을 갖고 있다.
`bundle.html`(고정 스냅샷)의 3259~3360줄에 `demo/notyet.js` 전체 코드가 있다 —
`data-notyet="키"`가 붙은 요소를 누르면 실제 이동 대신 "○○ 화면은 아직 없습니다 / 담당 /
명세 위치"를 보여 주는 `role="alertdialog"` 모달을 띄운다. `browse.html`이 이미 이 방식을
쓰고 있다(로그인·지원하기 버튼). `main.html` 자신은 아직 이 방식을 안 쓰고 있다 — 헤더
nav와 배너 CTA가 그냥 정적 `href`로 남아 있다(정적 프로토타입이라 죽은 링크가 눌러도
404만 날 뿐 무해했기 때문일 것이다).

**결정: 이 부품을 실제 앱(`app/web`)에 포트해서 쓴다.** "숨기기"와 "다이얼로그" 중 다이얼로그
쪽을 기본으로 삼는다 — 시안 자신의 철학 주석과도 맞고("숨기면 고장처럼 보인다"), 팀장이
말한 "피드백 루프에 적용하거나 리스크로 남긴다"도 이 다이얼로그의 담당/명세 정보 자체가
곧 그 기록이기 때문이다(화면에 상시 노출되는 리스크 기록판인 셈이다). "숨기기"는 다이얼로그
로도 대체할 내용 자체가 없는 경우(내 프로젝트 요약처럼 데이터가 없는 경우)에만 쓴다 —
버튼은 있는데 목적지만 없는 경우가 아니라,애초에 보여줄 것이 없는 경우다.

**만들 것: `shared/ui/NotYetDialog.tsx` + `shared/notYetScreens.ts`**

- `shared/notYetScreens.ts`: `{ [key]: { name, owner, where, note } }` 레지스트리.
  `bundle.html`의 `SCREENS` 객체와 같은 모양이지만 지금 앱 상태에 맞게 다시 쓴다 —
  `login`·`myproject`는 이미 실제 라우트가 생겼으니 레지스트리에서 뺀다(더 이상 notyet이
  아니다). 이번에 새로 필요한 키:
  - `experts` — 전문가 찾기. 담당 미정, 근거: README "확인이 필요한 것" 1번(원본 그대로)
  - `guide` — 이용 방법. 담당 미정 — **Decision 항목** (아래 참고)
  - `safety` — 안전한 거래. 담당 미정 — **Decision 항목**
  - `footer-terms`/`footer-privacy`/`footer-support` — 이용약관·개인정보처리방침·고객센터.
    담당 미정 — **Decision 항목**(굳이 3개를 다 만들지, 하나로 묶을지도 팀 판단 필요)
- `shared/ui/NotYetDialog.tsx`: `bundle.html`의 마크업·접근성 처리(포커스 트랩, Esc로 닫기,
  `role="alertdialog"`)를 그대로 옮기되 React 컴포넌트로. `shared/ui/tokens.css`의 기존
  `.overlay-backdrop`/`.dialog`를 재사용한다(contracts-payments가 이미 같은 방식으로
  재사용한 전례가 있다 — feedback_loop/2026-09-03/contracts-payments.md 항목 4).
- 쓰는 쪽: `<NotYetTrigger screenKey="experts">전문가 찾기</NotYetTrigger>` 같은 얇은 래퍼로
  감싸서, 겉모습은 보통 링크/버튼과 같지만 클릭하면 실제 이동 대신 다이얼로그를 연다.

**적용 지점 (main.html 기준 전수 확인):**

| 위치 | 목적지(시안) | 처리 |
|---|---|---|
| 헤더 nav "전문가 찾기" | `experts.html` | NotYet(`experts`) |
| 헤더 nav "이용 방법" | `guide.html` | NotYet(`guide`) |
| 헤더 nav "안전한 거래" | `guide.html#safety` | NotYet(`safety`) |
| 배너 1 CTA "전문가 확인하기" | `experts.html#category=...` | NotYet(`experts`) |
| 배너 2 CTA "등록하고 확인하기" | `register.html` | ✅ 실제 경로 — `PROJECT_ROUTES.register` 이미 있음 |
| 배너 3 CTA "진행 방식 보기" | `guide.html#safety` | NotYet(`safety`) |
| 추천 전문가 "전체 보기" + 카드 4장 | `experts.html` | NotYet(`experts`) |
| 푸터 이용약관/개인정보처리방침/고객센터 | — | NotYet(각 키) — Decision 필요 |
| 카테고리 10종 | `browse.html#category=...` | ✅ 실제 경로(값 교정, 5번 표 참고) — notyet 아님 |
| "지금 모집 중인 프로젝트" · "전체 보기" | `browse.html` | ✅ 실제 경로 |

### 6-1. 두 갈래 — "화면 없음" vs "화면 있음·로직 미완성"

**Fact — 이 앱엔 이미 두 가지 다른 상황이 실제로 존재한다:**

- **화면 자체가 없다**: 전문가 찾기·이용 방법·안전한 거래·푸터 3개 — `app/web/src/features/`
  어디에도 폴더조차 없다. spec.md도 없다(전문가 찾기는 PRD §7.1에 화면 자체가 없다).
- **경로는 등록돼 있고 기능 폴더·spec·prototype도 있는데, 웹 화면이 `app/`에 아직 안 붙었다**:
  `App.tsx`의 `NOT_INTEGRATED_ROUTES`(`applications`·`ai-pricing`·`reviews`·`notifications`)가
  정확히 이 상태다. 지금은 `shared/NotIntegratedPage.tsx`가 `EmptyState` 하나로 때운다
  (블러도 다이얼로그도 없다).

이 구분이 팀장이 말한 두 갈래와 정확히 겹친다. **화면이 아예 없는 경우(Case 1)만 이번 홈
통합의 대상이다** — main.html이 가리키는 죽은 링크(전문가 찾기 등)는 전부 여기 해당하고,
`NOT_INTEGRATED_ROUTES`로 가는 링크는 main.html 어디에도 없다(홈 화면 자체는 Case 2
대상을 안 가리킨다). 그래도 정책은 같이 정해 두는 게 낫다 — 나중에 다른 화면에서 Case 2
버튼(예: 프로젝트 상세의 "지원하기")을 만들 때 매번 새로 고민하지 않도록.

**Case 1 — 화면 없음 → `NotYetDialog`(원안 그대로)**
제자리에서 모달만 뜬다. 이동하지 않는다. `닫기` 버튼으로 그냥 닫힌다(뒤로 갈 곳이 없다 —
애초에 아무 데도 안 갔으니까). 6번 절 위쪽 표의 모든 지점이 이 경우다.

**Case 2 — 화면 있음·로직 미완성 → 신규 `shared/ui/ComingSoonOverlay.tsx`**
실제 라우팅은 그대로 일어난다(주소창이 `/applications`로 바뀐다 — 가짜가 아니다). 그 라우트가
렌더링하는 내용(지금은 `EmptyState`, 나중엔 진짜 화면 일부) 위에 블러(`filter: blur`)를
씌우고 `inert`로 포커스·스크린리더 접근을 막은 뒤, 같은 스타일의 모달을 강제로 띄운다.
`NotYetDialog`와 다른 점은 닫는 방법이 "뒤로가기" 버튼 하나뿐이라는 것이다(바깥을 눌러도
Esc를 눌러도 안 닫힌다 — 이 화면 자체가 아직 쓸 게 없으니 눌러 봤자 할 게 없다는 걸
분명히 한다). 뒤로가기는 `navigate(-1)`, 방문 기록이 없으면(주소를 직접 쳐서 들어온 경우)
`APP_ROUTES.home`으로 보낸다.

**적용 범위 판단**: `notYetScreens.ts` 레지스트리를 그대로 쓰되, 각 항목에
`hasRoute: boolean`을 추가해 둘 다 같은 데이터(이름·담당·명세 위치)를 공유하게 한다.
`hasRoute: false`(전문가 찾기 등)는 `NotYetTrigger`가 다이얼로그만 열고, `hasRoute: true`
(applications 등)는 `App.tsx`가 그 라우트에 `ComingSoonOverlay`로 감싼 컴포넌트를 건다.

**이번 통합의 실제 범위**: `ComingSoonOverlay` 자체는 설계만 해 두고 만들지 않는다 — 홈
화면(main.html)이 Case 2 대상을 가리키지 않기 때문이다. `NotIntegratedPage`를 이걸로
바꿀지는 별도 결정(Decision 참고) — 지금은 블러로 가릴 실제 콘텐츠가 없어서(EmptyState
문구 하나뿐) 블러 처리 자체가 큰 의미가 없다. 각 기능의 `design/high-fi.html`을 정적으로
포트해서 블러 배경으로 쓸지, 아니면 지금처럼 빈 화면에 다이얼로그만 강제로 띄울지도 같이
정해야 한다.

## 7. 폴더 구조 — 재사용 가능하게 만드는 절차

**Fact:** `main.html` 하나가 약 11,000자 마크업이고 시각적으로 독립된 섹션이 6개다. 이걸
`HomePage.tsx` 한 파일에 다 넣으면 이후 유지보수(배너 문구 교체, 카테고리 아이콘 수정 등)를
할 때마다 600줄짜리 파일 전체를 열어야 한다. 반대로 이 프로젝트의 다른 화면들
(`ProjectEditPage`, `ProjectManagePage` 등)은 지금까지 화면당 파일 하나로 충분했다 — 섹션이
1~2개뿐이었기 때문이다. 즉 "섹션이 여러 개인 화면"은 이번이 처음이라, 지금 컨벤션을 정해
두면 앞으로 비슷한 화면(예: "전문가 찾기" 메인, 대시보드류)이 생겼을 때 매번 새로 고민하지
않아도 된다.

**제안 규칙 (`app/web/AGENTS.md`에 추가할 문구 초안):**

> 한 화면의 JSX가 대략 300줄을 넘거나, 시각적으로 독립된 섹션이 3개 이상이면
> `{screenName}/` 하위 폴더를 만들어 섹션별로 쪼갠다. 최상위 `{Screen}Page.tsx`는 데이터
> 패칭·상태·섹션 조립만 하고, 각 섹션 파일은 props로 받은 것만 그린다(자체 fetch 금지 —
> Page가 내려준다). 배너 캐러셀처럼 화면 밖으로 나갈 일 없는 로컬 UI 상태(현재 슬라이드
> 인덱스 등)는 섹션 파일이 직접 가져도 된다.

**이번 이식에 적용한 폴더 구조:**

```
features/project-management/
  HomePage.tsx                  # 섹션 조립 + "모집 중인 프로젝트" fetch만 담당
  home/
    Header.tsx                  # main.html 자체 헤더 이식 (Option C) — 실제 경로 3개는 그대로,
                                 #   나머지는 NotYetTrigger로 감쌈
    Hero.tsx                    # 검색 폼 + 카피 (상태 없음)
    PromoCarousel.tsx           # 배너 3장, 캐러셀 로컬 상태. CTA는 실제 경로/NotYetTrigger 혼합
    ResumeSummary.tsx           # 로그인 시 자리만 (조준영 데이터 붙기 전까지 빈 상태)
    CategoryGrid.tsx            # 시안 10칸, 목적지만 실제 ERD 값으로 교정
    categories.ts                # 라벨·아이콘·(교정된) 카테고리 값 매핑 데이터 (컴포넌트 아님)
    RecruitingProjects.tsx      # "모집 중인 프로젝트" 6건, ProjectCard 재사용
    RecommendedExperts.tsx      # 목업 카드 4장, 클릭은 NotYetTrigger("experts")
    Footer.tsx                  # 홈 전용 푸터, 메뉴 3개는 NotYetTrigger
  ProjectCard.tsx                # 신규 추출 — ProjectBrowsePage와 Home이 공유
shared/
  ui/NotYetDialog.tsx            # 6번 절 — 사이트 어디서든 재사용 가능하게 shared에 둠
  notYetScreens.ts               # 레지스트리도 sitewide (nav 항목이 여러 기능에 걸침)
```

**선행 작업(홈 구현보다 먼저 해야 함):**
1. `ProjectBrowsePage.tsx`의 149~180번째 줄에 인라인돼 있는 `.pcard` 마크업을
   `ProjectCard.tsx`로 그대로 추출한다. 로직 변경 없이 옮기기만 하는 기계적 리팩터라 위험이
   낮고, 이걸 먼저 해야 홈 화면이 카드를 새로 베껴 쓰지 않고 재사용할 수 있다.
2. `shared/ui/NotYetDialog.tsx` + `shared/notYetScreens.ts`를 `bundle.html` 3259~3360줄
   기준으로 포트한다 — 홈 화면 6개 지점(6번 절 표)이 전부 이걸 의존하므로 먼저 있어야 한다.

## 8. 통합 플로우 — pull이 가능한가

**Fact:** 오늘 머지된 6개 PR(#52~#57)을 이미 받았다 — `develop`을 `origin/develop`
(`68037aa`)까지 fast-forward했고, 이 작업을 하던 `feature/contracts-payments-app-integration`
브랜치를 그 위로 rebase했다. 충돌 없이 끝났고 (`App.tsx`에서 내 변경과 #57의 변경이 서로
다른 줄이라 자동 병합됨), 서버·웹 양쪽 `tsc --noEmit` 재검증도 통과했다. 아직 push는 안 했다.

**남은 것:** #53(contracts-payments/reviews 프로토타입 쪽 UX 변경)이 오늘 반영분과 별개로
더 있다 — `teamlead-public-api-panels-2026-09-03.md`류 문서가 새로 생겼는데 아직 안 읽었다.
이번 홈 화면 작업과는 무관하니 별도로 처리한다.

## 9. Decision — 팀 확인이 필요한 것

- [ ] **헤더 Option C**: 홈만 `main.html`의 자체 헤더를 쓰고 AppShell을 벗어나는 것 승인 여부.
      곁들여 — 다른 화면과 헤더 모양이 달라지는 비일관성을 감수하는지, AppShell 전체를 이
      헤더로 승격하는 건 별도 후속 작업으로 미루는 게 맞는지
- [ ] **NotYetDialog 채택**: `bundle.html`의 `demo/notyet.js` 패턴을 `shared/ui/`로 포트해서
      쓰는 것 승인 여부(6번 절) — 승인되면 이번 홈 통합뿐 아니라 다른 화면(지원하기 버튼 등)도
      점진적으로 이 방식으로 옮겨갈 수 있다
- [ ] **Case 2(`ComingSoonOverlay`) 지금 만들지 여부**: 홈 통합엔 필요 없다(6-1절) — 그래도
      `NOT_INTEGRATED_ROUTES`(applications·ai-pricing·reviews·notifications)를 지금 같이
      업그레이드할지, 아니면 각 기능이 실제 통합될 때 그때그때 붙일지. 만든다면 블러 배경으로
      각 기능의 `design/high-fi.html`을 정적 포트할지, 빈 화면 그대로 블러만 씌울지도 결정
- [ ] **guide/safety 담당**: "이용 방법"·"안전한 거래" 화면을 누가·언제 만들지 아직 정해진 게
      없다 — NotYet 다이얼로그에 "담당 미정"으로 띄워도 되는지, 아니면 지금 담당을 배정할지
- [ ] **푸터 3개 링크 담당**: 이용약관·개인정보처리방침·고객센터도 같은 질문
- [x] **~~DATA_AI 카테고리 매핑~~**: 2026-09-04 구현 중 정정 완료 — `DATA_AI`·`MOBILE_APP`
      모두 실제 ERD 값이었다(위 5번 절 참고). 팀 확인 불필요, 매핑 그대로 진행함
- [ ] **폭**: 홈 화면만 `PageBody`(1180px) 대신 자체 wrapper(1412px 또는 다른 값)를 쓰는 것에
      동의하는지 — 동의하면 `--page-max`/`--page-w`를 `design-tokens.md` 정본에 추가할지도
      같이 결정
- [ ] **campaign 색상**: `design-tokens.md`엔 이미 있으니 `shared/ui/tokens.css`에 CSS 변수로
      옮기는 것 — 이견 없으면 바로 진행
- [ ] **배너 이미지 자산**: `assets/banner-b2b.jpg` 등 3장이 아직 `app/web/public/`에 없음 —
      실제 이미지 준비 담당/일정
- [ ] **푸터 범위**: 이번엔 홈 전용으로만 넣고 사이트 전체 적용은 나중에 별도 결정하는 것에
      동의하는지
- [ ] **폴더 구조 규칙**: 7번 제안 문구를 `app/web/AGENTS.md`에 그대로 추가할지

## 10. Next Action

1. 위 Decision 항목 확정 (팀장)
2. `ProjectCard.tsx` 추출 + `shared/ui/NotYetDialog.tsx`·`shared/notYetScreens.ts` 포트 (선행)
3. `home/` 하위 파일 작성(Header 포함) + `HomePage.tsx` 조립
4. `campaign` 색상 `shared/ui/tokens.css` 반영, `--page-max`/`--page-w` 처리 방식 확정분 반영
5. `npm run check:design` + `tsc` + `vite build` 검증
6. `sync-log.md` 기록 + `feedback_loop/2026-09-03/project-management.md`에 이번 문서 링크와
   남는 리스크(내 프로젝트 요약 데이터 부재, guide/safety/footer 담당 미정, DATA_AI 매핑,
   헤더 비일관성) 남기기
