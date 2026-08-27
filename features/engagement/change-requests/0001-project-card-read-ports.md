# CR-0001 — engagement 가 필요한 프로젝트 조회 3종

| | |
|---|---|
| 제기 | 유동우 (engagement) · 2026-08-27 |
| 대상 | 유동우 (project-management) — **같은 담당자** |
| 상태 | 제안 — Mock 어댑터로 진행, project-management 구현 후 교체 |
| 관련 | `features/engagement/spec.md` 규칙 6·12·18·25 · PRD §4.5 |

## 요약

engagement 는 프로젝트를 **읽기만 한다** (PRD §4.0). 그런데 지금 project-management 가
가진 공개 API 9종으로는 필요한 세 가지를 채울 수 없다.

## 왜 기존 API 로 안 되나

| 필요한 것 | 가장 가까운 기존 API | 왜 안 맞나 |
|---|---|---|
| 카드 1장 | `GET /api/v1/projects/:projectId` | HTTP 왕복이다. 같은 프로세스 안에서 부를 함수가 필요하다 |
| 카드 여러 장 | 위를 반복 호출 | 북마크 목록 한 페이지가 10건이라 **왕복 10번**이 된다 |
| 추천 후보 | `GET /api/v1/projects` | 필터에 "자기 자신 제외"가 없고, 카테고리·기술 조건을 OR 로 걸 수 없다 |

## 제안

`project-management` 가 세 함수를 제공한다. HTTP 가 아니라 **함수**다 — 같은 서버 안에서 부른다.

```ts
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

// 삭제됐으면 null. 마감·취소된 것은 정상적으로 준다 (engagement 규칙 7·13)
getProjectCardData(projectId: string): Promise<ProjectCardData | null>;

// 삭제된 id 는 결과 Map 에 없다 (engagement 규칙 12)
getProjectCardDataBulk(projectIds: string[]): Promise<Map<string, ProjectCardData>>;

type RecommendationCandidateQuery = {
  excludeProjectId: string;
  category: string;
  skillIds: string[];
};

// 삭제 안 됨 · OPEN · 자기 자신 제외까지 걸러서 준다
findRecommendationCandidates(
  query: RecommendationCandidateQuery,
): Promise<ProjectCardData[]>;
```

## 경계를 어디에 그었나

| | 누가 |
|---|---|
| "삭제 안 됨 · `OPEN`" 판정 | **project-management** |
| 우선순위 1·2·3순위 계산 | **engagement** |
| 동점 시 최근 등록순 | engagement |
| 4건 자르기 | engagement |

**후보 거르기를 project-management 에 둔 이유**: 모집 상태는 저장값이 아니라 조회 시점
기준으로 판정한다(project-management 규칙 14). 그 로직은 그쪽에 있다. engagement 가
원시 데이터를 받아 다시 판정하면 같은 규칙이 두 곳에 생긴다.

**우선순위를 engagement 에 둔 이유**: 그건 추천의 규칙이지 프로젝트의 규칙이 아니다.
project-management 에 넣으면 추천 방식을 바꿀 때마다 남의 도메인을 고쳐야 한다.

## `transactionStatus` 를 넣지 않는다

`ProjectCardData` 에 거래 상태가 없다. engagement 응답에 그 키가 나가면 안 되는데
(engagement 규칙 27), 애초에 받지 않으면 실수로 내보낼 수 없다.

## 담당자가 같은데 왜 문서로 남기나

같은 사람이 두 도메인을 맡고 있어도 **경계는 유지한다** (PRD §4.0). 이 요청을 문서 없이
그냥 구현하면, 나중에 도메인이 갈라질 때 무엇이 경계를 넘는 호출이었는지 알 수 없다.

## 현재 구현

`features/engagement/prototype/server/ports/project-read.port.ts` 에 위 형태로 선언하고,
`prototype/mock/` 에 어댑터를 둔다. project-management 구현이 올라오면
**어댑터 한 곳만 교체한다** (ADR-0009).
