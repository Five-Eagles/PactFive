# CR-0004 — `workMode`가 디자인 시스템에만 있다

| | |
|---|---|
| 제기 | 유동우 (project-management) · 2026-08-26 |
| 확인 필요 | 김락원 (팀장 · 디자인 시스템·ERD) |
| 상태 | 제안 — 카드에서 제외하고 진행 |
| 관련 | `design-system/design-tokens.md` §3 `ProjectCardProps` · `docs/domain/erd.md` |

## 요약

디자인 시스템의 `ProjectCardProps`에 `workMode`가 **필수 필드**로 들어 있는데,
ERD·PRD 어디에도 대응하는 컬럼이 없다.

```ts
// design-system/design-tokens.md
export type ProjectCardProps = {
  ...
  workMode: "REMOTE" | "HYBRID" | "ONSITE";   // ← ERD 에 없음
};
```

프리뷰 화면에는 **입력 칸까지 그려져 있다.**

```html
<!-- design-system/design-system-preview.html -->
<label for="workMode">작업 방식</label>
<select id="workMode">
  <option>원격</option><option>주 2회 오피스</option><option>상주</option>
</select>
```

## 확인한 것

| 어디 | `workMode` / `work_mode` |
|---|---|
| `design-system/design-tokens.md` | 있음 (필수) |
| `design-system/design-system-preview.html` | 있음 (등록 폼 입력 칸) |
| `docs/domain/erd.md` · `erd-v1.4.dbml` | **없음** |
| PRD §6.12 · §7.2 · §14 | **없음** |
| `features/project-management/spec.md` | **없음** |

디자인 시스템은 2026-08-24 이후 변경 이력이 없고, ERD 는 2026-08-25 에 v1.4 로
갱신됐다. 나중에 빠졌다기보다 **처음부터 한쪽에만 있었던 것**으로 보인다.

## 지금 상태로 두면

등록 화면에 입력 칸이 있는데 **저장할 곳이 없다.** 사용자가 고른 값이 조용히 사라진다.
탐색 화면에서 프리랜서가 "원격"으로 거르려 해도 걸 데이터가 없다.

## 제안

**카드와 등록 폼에서 뺀다.** `prototype/web/`은 그렇게 만들었고,
`run.tsx`에 `workMode`가 렌더링되지 않는지 확인하는 검사를 넣었다.

## 필요한 값이라면

세 곳을 함께 고쳐야 한다. 한 곳만 고치면 다시 어긋난다.

1. `projects` 테이블에 `work_mode` 컬럼 (ERD)
2. 등록 요청 필드 + 검증 규칙 (`spec.md` 규칙 2 · `api-contract.md`)
3. 목록·상세 응답 필드 (`api-contract.md`)

제 쪽 작업량은 크지 않다. **ERD 가 정해지면 그날 안에 반영할 수 있다.**
