# engagement 피드백 — 2026-08-28 통합

반영 커밋(prototype 기준): 3e4977e
sync-log.md 기록: 있음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — `UserReadPort.getUserRole`을 토큰 검증 결과로 잠정 연결했다

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- 규칙 5·33은 프리랜서 판정을 user-management에 맡기고 `users.role`을 직접 읽지 말라고 한다.
  `ports/project-read.port.ts`의 `UserReadPort.getUserRole(userId)`가 그 자리다.
- user-management는 app/에 통합돼 있으나 **`userId`로 역할을 조회하는 함수를 노출하지 않는다.**
  노출된 것은 Access Token을 검증해 `{ userId, role }`을 돌려주는 경로뿐이다.

**어떻게 채웠는지**
- `app/server/src/app.ts`에 `roleByUserId` Map을 두고, 공용 토큰 검증 함수가 성공할 때마다
  거기에 역할을 기록한다. engagement의 `userRead` 어댑터가 그 Map을 읽는다.
- **모르면 `null`을 준다.** 서비스는 `null`을 "프리랜서가 아님"으로 보고 403을 낸다 (규칙 5) —
  모르는 것을 통과시키지 않는다.

**왜 그렇게 채웠는지 (근거)**
- 이 Map은 캐시일 뿐 정본이 아니다. 서버리스에서는 인스턴스마다 비어 있고, 요청이 인증
  미들웨어를 지난 직후에만 채워진다. 북마크 3종은 전부 `requireAuth` 뒤에 있어 실제로는 항상
  채워진 상태에서 읽히지만, **다른 기능이 이 Map을 신뢰하면 안 된다.**
- **근거 없음(팀장 판단)** — user-management에 조회 함수가 생기면 이 Map을 지우고 그 함수를
  부르는 것이 맞다. `docs/domain/` 규약에 "역할 조회" 계약이 아직 없어 새로 만들지 않았다.

**담당자 메모**

잠정 연결에 동의한다. **"모르면 `null` 을 주고 서비스가 403 을 낸다"** 가
핵심이고, 그 방향이 맞다 — 모르는 것을 통과시키지 않는다.

Map 이 캐시일 뿐 정본이 아니라는 것도 맞다. 북마크 3종이 전부 `requireAuth` 뒤에
있어 실제로는 항상 채워진 상태에서 읽히는 것도 확인했다. 추천 조회는
`optionalAuth` 이고 역할을 쓰지 않으므로 영향이 없다.

user-management 에 조회 함수가 생기면 Map 을 지우고 그것을 부르는 것이 맞다.
그 요청은 제 쪽에서 의사결정 요청 문서에 이미 올려뒀다.

---

## 항목 2 — 두 기능의 `ui.tsx`를 `shared/ui/`로 합치며 `EmptyState` 형태를 하나로 골랐다

상태: 반영완료

**Fact — 기능 간 충돌**
- `features/engagement/prototype/web/ui.tsx`와
  `features/project-management/prototype/web/ui.tsx`가 거의 같은 컴포넌트를 각자 갖고 있다.
  `design/_tokens.css`도 두 벌이다.
- 두 파일의 `EmptyState` 시그니처가 다르다 — engagement는 `{ title, body, action }`,
  project-management는 `{ message, action }`. `Chip`은 engagement에만 있다.

**어떻게 채웠는지**
- `app/web/src/shared/ui/primitives.tsx`와 `shared/ui/tokens.css`로 한 벌만 남겼다.
- `EmptyState`는 **engagement 쪽 3분할(title·body·action)** 을 택했다. `Chip`도 가져왔다.
- project-management 화면의 한 줄짜리 호출은 `title`만 넘기면 그대로 동작한다.

**왜 그렇게 채웠는지 (근거)**
- `app/web/AGENTS.md` "폴더 간 접점" — 기능 폴더끼리 import할 수 없으므로 공유하려면
  `shared/`로 올려야 하고, 같은 것이 두 번째로 필요해진 시점이 바로 지금이다.
- 3분할을 택한 이유는 ux-philosophy §6 "복구 가능성"이다. "저장한 프로젝트가 없습니다" 한 줄만
  두면 다음에 무엇을 할지 알 수 없다. 제목·설명·행동 셋이 다 있어야 빈 화면이 안내가 된다.

**담당자 메모**

**engagement 쪽 3분할을 고르신 판단이 맞다.** 근거로 드신 §6 복구 가능성이
정확하다 — "저장한 프로젝트가 없습니다" 한 줄만 두면 다음에 무엇을 할지 알 수 없다.

project-management 쪽 한 줄 시그니처는 제가 먼저 만든 것이고 더 얕았다.
`Chip` 을 가져가신 것도 맞다.

**prototype 쪽도 3분할로 맞춘다.** 지금은 두 도메인의 `ui.tsx` 가 서로 다른
`EmptyState` 를 갖고 있어, app/ 은 통일됐는데 원본은 갈라진 상태다.
다음 통합에서 같은 판단을 또 하게 된다.

---

## 항목 3 — `BookmarkButton`·`RecommendationSection`을 슬롯으로 끼운다

상태: 반영완료

**Fact — 기능 간 충돌**
- 두 컴포넌트는 독립 화면이 아니라 **project-management 화면 안에 붙는 조각**이다.
  `BookmarkButton`은 SCR-B01 카드와 SCR-B02 상세에, `RecommendationSection`은 SCR-B02 하단에
  들어간다 (spec.md 규칙 16·30).
- 그런데 `app/web/AGENTS.md`는 기능 폴더끼리 직접 import를 금지한다. project-management 화면이
  engagement 컴포넌트를 import할 수 없다.

**어떻게 채웠는지**
- project-management의 `ProjectBrowsePage`·`ProjectDetailPage`가 `renderBookmark` ·
  `renderRecommendations` 슬롯(render prop)만 열어 두고, 실제 컴포넌트는 조립 지점인
  `app/web/src/App.tsx`가 끼운다.
- 반대 방향도 같다 — engagement의 `MyBookmarksPage`·`RecommendationSection`은 프로젝트 상세
  경로를 모르므로 `browseHref` · `detailHref`를 주입받는다.

**왜 그렇게 채웠는지 (근거)**
- `app/server/src/app.ts`가 engagement 서비스에 project-read 어댑터를 주입하는 것과 같은
  방식이다. 서버와 화면이 같은 규칙으로 기능을 잇는다.
- 대안(배럴을 두거나 `shared/`로 올리기)은 둘 다 나쁘다 — 배럴은 AGENTS.md가 금지하고,
  북마크 버튼을 `shared/`에 두면 engagement 도메인 로직이 공용 폴더로 새 나간다.

**담당자 메모**

슬롯(render prop)이 맞다. 대안 두 개가 나쁜 이유도 그대로 동의한다 —
배럴은 AGENTS.md 가 금지하고, 북마크 버튼을 `shared/` 에 두면 engagement 도메인
로직이 공용 폴더로 새 나간다.

**서버가 engagement 에 project-read 어댑터를 주입하는 것과 같은 방식**이라는 정리가
특히 좋다. 서버와 화면이 같은 규칙으로 이어지면 나중에 도메인을 떼어낼 때 한 곳만 본다.

역방향으로 `browseHref`·`detailHref` 를 주입한 것도 맞다. engagement 는 프로젝트
경로를 알 이유가 없다.

---

## 항목 4 — 낙관적 반영의 초기 상태(`initialBookmarked`)를 아직 채우지 못한다

상태: 반영완료

**Fact — spec/api-contract에 없던 부분**
- `BookmarkButton`은 `initialBookmarked`를 받아 별의 초기 모양을 정한다. 이 값의 출처는
  project-management 응답의 `isBookmarked`인데(api-contract.md `PublicProjectItem`),
  **서버가 그 키를 채우지 않는다.** project-management 서비스가 engagement를 부르면 서버
  기능 간 직접 의존이 생기기 때문이다 (`project.service.ts` `toPublicDetail` 주석).
- 목록/상세를 볼 때 "이미 저장한 프로젝트"의 별이 빈 별로 보인다. 눌러서 저장하면 서버는
  규칙 1대로 성공을 주지만(중복이 생기지는 않는다), 화면은 방금 저장한 것처럼 보인다.

**어떻게 채웠는지**
- 채우지 않았다. `initialBookmarked`의 기본값 `false`로 두고, 화면은 사용자가 누른 뒤의 상태만
  정확히 반영한다.

**왜 그렇게 채웠는지 (근거)**
- 이 값을 채우려면 셋 중 하나가 필요하다: (a) 목록 응답에 북마크 여부를 합치는 서버 쪽 합성
  지점, (b) 화면이 `GET /api/v1/bookmarks`를 함께 불러 대조, (c) project-management가
  engagement를 직접 호출. (c)는 경계 위반이고, (a)는 두 도메인의 응답 합성 규칙을 새로 정해야
  해서 "되돌리기 비싼 것"에 가깝다. **팀장이 임의로 정하지 않고 남겨 둔다.**
- 담당자 의견을 듣고 (a)/(b) 중 하나로 정하는 것이 좋겠다.

**담당자 메모**

**(b) 로 정한다. 화면이 별도 조회로 대조한다.**

(a) 서버 합성을 택하지 않은 이유는 지적하신 그대로다 — 응답 합성 규칙을 새로 정해야
하고 그것이 "되돌리기 비싼 것"에 가깝다. (c) 는 경계 위반이다.

다만 `GET /api/v1/bookmarks` 를 그대로 쓰는 것은 문제가 있다. 그 응답은 페이지
단위라(10개/페이지, 규칙 11) 목록에 있는 프로젝트가 2페이지에 있으면 대조에서 빠진다.

**그래서 id 만 주는 경량 조회를 하나 더 만든다.**

```
GET /api/v1/bookmarks/ids   →  { projectIds: ["prj_a", "prj_b", ...] }
```

- 프리랜서 본인 것만. 페이지를 나누지 않는다 — id 문자열이라 수백 건도 가볍다
- 화면이 한 번 불러 `Set` 으로 갖고 카드마다 대조한다
- engagement 안에서 끝난다. 경계를 넘지 않고 응답 합성 규칙도 새로 만들지 않는다

**`PublicProjectItem.isBookmarked` 는 계약에서 뺀다.** 서버가 채우지 않을 값을
계약에 남겨두면 다음 사람이 또 채우려 든다. 화면이 만드는 값이라는 것을
`api-contract.md` 에 적는다.

제 쪽에서 `spec.md` 규칙 · `api-contract.md` · `prototype/` 을 고쳐 올린다.

