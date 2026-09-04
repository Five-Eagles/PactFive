# engagement — API 계약

담당: 유동우
근거: PRD §4 · `spec.md` 규칙 1~34 · `docs/naming-convention.md` §6·§7

**전부 공개 API(`/api/v1`)다.** 다른 도메인이 부르는 내부 계약은 없다 — 이 기능은 아무의 상태도 바꾸지 않는다.

## 공통 규약

식별자는 접두어가 붙은 문자열이다 (`bkm_...` · `prj_...` · `usr_...`).

목록 응답은 project-management 와 같은 껍데기를 쓴다.

```json
{ "items": [], "page": 1, "pageSize": 10, "totalCount": 0, "totalPages": 0 }
```

오류 응답도 같은 형태다.

```json
{ "error": { "code": "BOOKMARK_ROLE_REQUIRED", "message": "프리랜서만 저장할 수 있습니다.", "details": null } }
```

**모든 응답에 `transactionStatus` 키가 없다** (규칙 27). `null` 로도 내려보내지 않는다.

---

# 공개 API

## PUT /api/v1/projects/:projectId/bookmarks — 북마크 추가

권한: 프리랜서

요청: 본문 없음

응답 200:

```json
{
  "projectId": "prj_p01",
  "bookmarked": true,
  "bookmarkedAt": "2026-08-25T10:00:00Z",
  "changed": true
}
```

| 필드 | 뜻 |
|---|---|
| `bookmarked` | 이 호출이 끝난 뒤의 상태. 항상 `true` |
| `bookmarkedAt` | **최초 저장 시각.** 재호출해도 갱신하지 않는다 (규칙 3) |
| `changed` | 이번 호출로 실제로 생겼는가. 이미 있었으면 `false` |

> **`POST` 가 아니라 `PUT` 을 쓴다.** `POST` 는 "새로 만든다"라서 반복 호출하면 여러 개가 생기는 것이 자연스럽고, `PUT` 은 "이 상태로 만든다"라서 반복 호출해도 결과가 같은 것이 자연스럽다. 토글 UI 는 더블클릭과 재시도가 특히 잦다.
>
> 이미 저장돼 있어도 `200` 이다. `201` 과 나누지 않는다 — 화면이 두 코드를 똑같이 처리하게 되고, 그러면 나눈 의미가 없다. 구분이 필요하면 `changed` 를 본다.

에러: 401 `AUTH_REQUIRED` · **403 `BOOKMARK_ROLE_REQUIRED`**(의뢰인) · 404 `PROJECT_NOT_FOUND`(없거나 삭제됨)

## DELETE /api/v1/projects/:projectId/bookmarks — 북마크 제거

권한: 프리랜서

요청: 본문 없음

응답 200:

```json
{
  "projectId": "prj_p01",
  "bookmarked": false,
  "changed": true
}
```

> **`204` 가 아니라 `200` + 본문이다.** 토글 UI 는 응답으로 아이콘 상태를 확정해야 하는데, `204` 는 본문이 없어 "지금 어느 상태인가"를 응답만 보고 알 수 없다.
>
> 저장돼 있지 않아도 `200` 이고 `changed: false` 다 (규칙 2). 없는 것을 지우는 것은 오류가 아니다 — 사용자가 원한 결과("저장 안 된 상태")가 이미 이뤄져 있다.

에러: 401 `AUTH_REQUIRED` · 403 `BOOKMARK_ROLE_REQUIRED` · 404 `PROJECT_NOT_FOUND`

## GET /api/v1/bookmarks — 내 북마크 목록

권한: 프리랜서 (본인 것만)

쿼리: `page` · `pageSize`

| 파라미터 | 제약 | 기본 |
|---|---|---|
| `page` | 1~1000 | 1 |
| `pageSize` | 1~50 | **10** |

> **경로에 사용자 id 가 없다.** `GET /users/:userId/bookmarks` 로 두면 남의 id 를 넣어 시도해볼 수 있는 주소가 생긴다. 토큰의 주인 것만 돌려주므로 애초에 다른 사람을 가리킬 방법을 만들지 않는다 (규칙 9).

응답 200:

```json
{
  "items": [
    {
      "bookmarkId": "bkm_001",
      "bookmarkedAt": "2026-08-25T10:00:00Z",
      "project": {
        "projectId": "prj_p01",
        "title": "쇼핑몰 웹사이트 구축",
        "category": { "category": "WEB_DEVELOPMENT", "displayName": "웹 개발" },
        "budgetAmount": 5000000,
        "recruitmentDeadlineAt": "2026-09-16T14:59:59Z",
        "recruitmentStatus": "CLOSED",
        "skills": [{ "skillId": "REACT", "displayName": "React" }],
        "applicationCount": 3
      },
      "canApply": false
    }
  ],
  "page": 1,
  "pageSize": 10,
  "totalCount": 1,
  "totalPages": 1
}
```

| 필드 | 뜻 |
|---|---|
| `bookmarkedAt` | 정렬 기준. **최근 저장순** (규칙 10) |
| `canApply` | 서버가 판정한다. 화면이 모집 상태로 다시 계산하지 않는다 (규칙 14) |

> **마감된 프로젝트도 목록에 남는다** (규칙 13). 공개 목록과 반대다 — 공개 목록은 "찾는 곳"이고 내 북마크는 "내가 담아둔 것"이다.
> **삭제된 프로젝트는 빠진다** (규칙 12). 북마크 행 자체는 남는다.
> 비어 있어도 `200` 이다. `items: []` 와 `totalCount: 0` 을 그대로 준다.

에러: 401 `AUTH_REQUIRED` · 403 `BOOKMARK_ROLE_REQUIRED` · 422 `VALIDATION_ERROR`(범위 밖 페이지)

## GET /api/v1/bookmarks/ids — 저장한 프로젝트 id

권한: 프리랜서 (본인 것만)

쿼리 없음. **페이지를 나누지 않는다.**

응답 200:

```json
{ "projectIds": ["prj_p01", "prj_p07", "prj_p12"] }
```

에러: 401 `AUTH_REQUIRED` · 403 `BOOKMARK_ROLE_REQUIRED`

### 왜 목록과 따로 두는가

목록·상세 카드의 북마크 아이콘은 **화면이 초기 상태를 만든다** (규칙 35). 그 대조에
`GET /api/v1/bookmarks` 를 쓰면 10개씩 끊기므로(규칙 11) 2페이지에 있는 항목이 빈 별로
보인다. 누르면 서버는 규칙 1대로 성공을 주지만 화면은 방금 저장한 것처럼 보인다.

id 문자열만 담으므로 수백 건이어도 가볍다. 화면은 한 번 받아 `Set` 으로 갖고 카드마다
대조한다.

**삭제된 프로젝트 id 도 걸러내지 않는다.** 걸러내려면 프로젝트를 조회해야 하는데, 이 조회의
목적은 "지금 보고 있는 카드가 저장돼 있는가"뿐이다. 화면에 없는 id 가 섞여 있어도 대조
결과는 같다. 목록(규칙 12)과 다른 이유가 이것이다 — 목록은 카드를 그리므로 걸러야 한다.

## GET /api/v1/projects/:projectId/recommendations — 추천 프로젝트

권한: **불필요.** 비로그인도 볼 수 있다

쿼리: 없음

> **건수 파라미터를 받지 않는다.** 4건 고정이다 (규칙 22). 파라미터로 열어두면 화면마다 다른 값을 쓰게 되고, 그 순간 "상세 하단 보조 섹션"이라는 전제가 깨진다.

응답 200:

```json
{
  "items": [
    {
      "projectId": "prj_p02",
      "title": "배달 앱 UI 개선",
      "category": { "category": "WEB_DEVELOPMENT", "displayName": "웹 개발" },
      "budgetAmount": 3400000,
      "recruitmentDeadlineAt": "2026-09-20T14:59:59Z",
      "recruitmentStatus": "OPEN",
      "skills": [{ "skillId": "REACT", "displayName": "React" }],
      "applicationCount": 1,
      "reason": "SAME_CATEGORY_AND_SKILL",
      "matchedSkills": ["React"]
    }
  ]
}
```

> **목록 껍데기(`page`·`totalCount`)를 쓰지 않는다.** 페이지를 넘길 수 없는 고정 4건이라, 넘길 수 없는 값을 내려보내면 화면이 페이지네이션을 붙이려 든다.
>
> **`recruitmentStatus` 는 언제나 `OPEN` 이다** (규칙 18). 그래도 필드를 넣는 것은 카드 컴포넌트가 북마크 목록과 같은 것을 쓰기 때문이다.
>
> **내부 점수와 순위값을 넣지 않는다** (규칙 28). 순위는 배열 순서로만 표현한다.
>
> 대신 `reason`(`SAME_CATEGORY_AND_SKILL` / `SAME_CATEGORY` / `SHARED_SKILL`)과
> 겹친 기술 이름을 준다. 규칙 28 이 금지한 것은 숫자이지 사유가 아니다 —
> 순서로만 표현하면 사용자는 왜 하필 이 4건인지 알 수 없다 (§6 근거 이해).
>
> 후보가 없으면 `items: []` 이고 `200` 이다. 화면이 섹션을 감춘다 (규칙 24).

에러: 404 `PROJECT_NOT_FOUND`(없거나 삭제됨)

---

# 오류 코드

| 코드 | 상태 | 언제 |
|---|---|---|
| `AUTH_REQUIRED` | 401 | 비로그인 북마크 시도 |
| `BOOKMARK_ROLE_REQUIRED` | 403 | 의뢰인이 북마크 시도 |
| `PROJECT_NOT_FOUND` | 404 | 없거나 삭제된 프로젝트 |
| `VALIDATION_ERROR` | 422 | 범위 밖 페이지·크기 |

**북마크 자체에 대한 409 가 없다.** 규칙 1·2 때문에 "이미 있음"과 "이미 없음"이 전부 성공이다.

---

# 다른 도메인에 부르는 것

이 기능이 **호출하는** 쪽이다. 전부 읽기다.

| 함수 | 제공 | 언제 |
|---|---|---|
| `getProjectCardData(projectId)` | 유동우 (project-management) | 북마크 추가 전 존재 확인 · 카드 표시 |
| `getProjectCardDataBulk(projectIds)` | 유동우 | 북마크 목록 — 건별 호출이면 10번 왕복한다 |
| `findRecommendationCandidates(query)` | 유동우 | 추천 후보 수집 (규칙 18) |
| `getUserRole(userId)` | 오민혁 (user-management) | 규칙 5 의 프리랜서 판정 |

**전부 `prototype/server/ports/` 뒤에 둔다** (ADR-0009).

## project-management 에 요청하는 조회 3종

같은 담당자지만 **새로 만들어야 하는 함수들이다.** 지금 project-management 의 공개 API 로는 이 세 가지를 채울 수 없다.

```ts
// 카드 한 장에 필요한 것. 삭제됐으면 null
type ProjectCardData = {
  projectId: string;
  title: string;
  category: { category: string; displayName: string };
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  recruitmentStatus: "SCHEDULED" | "OPEN" | "CLOSED";
  skills: { skillId: string; displayName: string }[];
  applicationCount: number;
  createdAt: string;
};

getProjectCardData(projectId: string): Promise<ProjectCardData | null>;
getProjectCardDataBulk(projectIds: string[]): Promise<Map<string, ProjectCardData>>;

// 추천 후보. 삭제 안 됨 · OPEN · 자기 자신 제외까지 걸러서 준다
type RecommendationCandidateQuery = {
  excludeProjectId: string;
  category: string;
  skillIds: string[];
};

findRecommendationCandidates(
  query: RecommendationCandidateQuery,
): Promise<ProjectCardData[]>;
```

> **후보 거르기를 project-management 쪽에 두는 이유**: "삭제 안 됨 · `OPEN`"은 조회 시점 기준으로 판정해야 하는데(project-management 규칙 14), 그 판정 로직은 그쪽에 있다. engagement 가 원시 데이터를 받아 다시 판정하면 같은 규칙이 두 곳에 생긴다.
>
> **우선순위 계산(규칙 20·21)은 engagement 가 한다.** 그건 이 기능의 규칙이지 프로젝트의 규칙이 아니다.

## 아직 없는 것

위 세 함수는 **project-management 에 아직 구현돼 있지 않다.** `change-requests/0001` 로 기록했고, 그때까지는 `prototype/mock/` 의 어댑터가 대신한다.
