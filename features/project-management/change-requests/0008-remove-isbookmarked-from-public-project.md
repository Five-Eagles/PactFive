# CR-0008 — `PublicProjectItem` 에서 `isBookmarked` 를 뺀다

| | |
|---|---|
| 제기 | 유동우 (project-management · engagement) · 2026-09-02 |
| 대상 | 김락원 (팀장 · `docs/domain/api-spec/`) · PRD v6.4 §4 |
| 상태 | 제안 — 두 도메인 코드에는 이미 반영 |
| 근거 | feedback_loop 2026-08-28 engagement 항목 4 |

## 요약

PRD v6.4 는 `PublicProjectItem` 에 `isBookmarked` 를 둔다 (§4, 4305·4313·4815행).
**이 키를 계약에서 뺀다.** 대신 engagement 에 조회를 하나 추가한다.

```
GET /api/v1/bookmarks/ids  →  { projectIds: ["prj_a", "prj_b", ...] }
```

## 왜

`project-management` 가 `isBookmarked` 를 채우려면 `bookmarks` 를 읽어야 한다. 방법은 셋뿐이다.

| 방법 | 문제 |
|---|---|
| project-management 가 engagement 를 직접 호출 | 서버 기능 간 직접 의존. ADR-0009 위반 |
| 응답 합성 지점을 새로 만든다 | 두 도메인의 응답을 합치는 규칙을 새로 정해야 한다. 되돌리기 비싸다 |
| **화면이 별도 조회로 대조한다** | 조회가 하나 는다. 대신 경계를 넘지 않는다 |

세 번째를 골랐다.

`GET /api/v1/bookmarks` 를 그대로 쓰지 않은 이유는 그 응답이 10개씩 끊기기 때문이다
(engagement 규칙 11). 목록에 있는 프로젝트가 2페이지에 있으면 대조에서 빠지고,
**이미 저장한 프로젝트가 빈 별로 보인다.** 눌러도 서버는 규칙 1대로 성공을 주므로
사용자는 실수를 눈치채지 못한다.

## 계약에서 아예 빼는 이유

`isBookmarked?: boolean` 을 선택 필드로 남겨두면 서버가 채우지 않는 상태 그대로
계약에 남는다. 다음 사람이 그것을 보고 또 채우려 들고, 그때 위 세 방법을 처음부터
다시 검토하게 된다. 지금 빼고 이유를 적어 두는 편이 싸다.

## 이미 반영한 것

| 파일 | 무엇 |
|---|---|
| `features/project-management/api-contract.md` | `isBookmarked` 삭제 · 왜 없는지 주석 |
| `features/project-management/prototype/server/project.types.ts` | 필드 삭제 |
| `features/project-management/prototype/server/project.service.ts` | `detail.isBookmarked = false` 삭제 |
| `features/engagement/spec.md` | 규칙 35·36 추가 |
| `features/engagement/api-contract.md` | `GET /api/v1/bookmarks/ids` 추가 |
| `features/engagement/prototype/server/bookmark.service.ts` | `listBookmarkedProjectIds` |

테스트 9건을 붙였다 (`features/engagement/prototype/run.tsx` — "저장한 프로젝트 id").

## 요청

1. `docs/domain/api-spec/` 의 `PublicProjectItem` 에서 `isBookmarked` 삭제
2. 같은 곳에 `GET /api/v1/bookmarks/ids` 추가
3. PRD v6.4 §4 는 참고 문서라 그대로 두어도 되지만, 어긋난다는 각주가 있으면 좋다

`app/` 쪽 타입 두 곳(`app/server/src/.../project.types.ts:81`,
`app/web/src/.../project.types.ts:44`)에도 같은 필드가 있다. 팀장 통합 영역이라
직접 고치지 않았다.
