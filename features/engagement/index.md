# engagement Index

## 담당자
- 유동우

## 스펙 (features/engagement/)
- spec.md 핵심 요약: 프리랜서가 프로젝트를 담아두고 발견하는 기능 —
  북마크 토글 · 내 북마크 목록 · 추천 프로젝트. 번호 규칙 34개. **미확정 0건.**
  프로젝트의 등록·수정·상태 변경은 `features/project-management/`.
- api-contract.md: 공개 API 4종(`/api/v1`). **내부 계약 없음** — 아무의 상태도 바꾸지 않는다.
- design/ 구성: `_tokens.css`(project-management 와 같은 사본) ·
  `high-fi-bookmarks.html`(SCR-B08 · SCR-B09). **필수 요소 목록 9개**, 전부 PRD 정본과 대조함.
  8개는 §14 문구표, 1개(`추천 프로젝트`)는 §7.2 화면 이름이라 근거 열을 따로 뒀다.
- prototype/ 구성: **완료** — 데이터 계층 · 서비스 4종 · 화면 3종.
  `run.tsx` **PASS 88 · FAIL 0**. 결과는 `test-report.md`.

## 이 기능의 전제 — 읽기 전용

**engagement 는 프로젝트를 읽기만 한다.** 어떤 경로로도 쓰지 않는다 (PRD §4.0).

`project-management` 와 담당자가 같지만 경계는 그대로 지킨다. 섞으면 "북마크를 눌렀더니
프로젝트 상태가 바뀌는" 결함이 생길 수 있고, 나중에 떼어내기도 어려워진다.

## 상태 모델

북마크에는 상태 컬럼이 없다. **행이 있으면 저장됨, 없으면 해제됨**이다.

```text
추가 = "1건 있는 상태로 만든다"   이미 있으면 아무것도 안 하고 성공
제거 = "0건인 상태로 만든다"      이미 없어도 성공
```

토글 UI 는 더블클릭과 재시도가 잦다. 두 동작 모두 몇 번을 불러도 결과가 같아야 한다.

## 프론트엔드 (prototype/web/)
- 주요 컴포넌트: `BookmarkButton`(보는 사람별 4상태) · `MyBookmarks`(SCR-B08) ·
  `RecommendationSection`(SCR-B09 · 후보 0건이면 렌더링 자체를 안 함)
- 공용 조각: `web/ui.tsx` — Button · Badge · RecruitmentBadge · Money · Chip · EmptyState.
  `features/project-management/prototype/web/ui.tsx` 와 거의 같지만 **직접 import 하지 않는다**
  (기능 폴더 간 직접 import 금지 · 2026-08-28 팀 표준). 통합 시 `app/web/src/shared/` 로 뺄 후보
- Mock 계약 상태: 화면은 서버 응답을 그대로 받는다. `canApply` 도 서버가 판정한다 (규칙 14)

## 백엔드 (prototype/server/)
- 계층 구성: service → repository. controller 는 팀장 통합 영역이다
  - `bookmark.types.ts` — 도메인 타입 · DTO · `EngagementError`(오류 코드 4종)
  - `ports/project-read.port.ts` — project-management · user-management 읽기 3+1종
  - `mock/bookmark.mock.ts` — 저장소 Mock. **UNIQUE 제약을 흉내 낸다**
  - `mock/project-read.mock.ts` — 프로젝트 조회 어댑터. 시드 id 는 project-management 와 맞췄다
  - `bookmark.service.ts` — 공개 API 4종
- 주요 API 엔드포인트: `PUT /projects/:projectId/bookmarks` ·
  `DELETE /projects/:projectId/bookmarks` · `GET /bookmarks` ·
  `GET /projects/:projectId/recommendations`
- 포트: 프로젝트 조회는 전부 `prototype/server/ports/` 뒤에 둔다 (ADR-0009).
  **같은 담당자라도 직접 import 하지 않는다**

## 다른 기능에 의존하는 것

| 함수 | 제공 | 상태 |
|---|---|---|
| `getProjectCardData` | 유동우 (project-management) | ⏳ 미구현 (CR-0001) |
| `getProjectCardDataBulk` | 유동우 | ⏳ 미구현 (CR-0001) |
| `findRecommendationCandidates` | 유동우 | ⏳ 미구현 (CR-0001) |
| `getUserRole` | 오민혁 | ⏳ 확인 필요 |

셋은 **같은 사람이 만들 것**이지만 경계를 남기려고 변경 요청으로 기록했다.

## 동시 요청 — 이 기능의 함정

`bookmarks` 의 `(freelancer_id, project_id)` UNIQUE 는 **ERD v1.4 에 이미 있다**
(`uq_bookmarks_pair`). 따로 요청할 것은 없다.

다만 구현이 **그 제약에 의존해야 한다.** "있는지 조회하고 없으면 삽입"만으로는
더블클릭한 두 요청이 둘 다 조회를 통과한 뒤 둘 다 삽입한다. 추가는 UNIQUE 위반을
잡아서 성공으로 처리한다.

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-27 | 최초 작성 — spec.md 규칙 34개 · api-contract.md 4종 · CR-0001 |
| 2026-08-27 | design/ high-fi 추가 — SCR-B08 · SCR-B09 · 필수 요소 9개 |
| 2026-08-28 | prototype 데이터 계층 + 서비스 4종 — run.tsx PASS 69 |
| 2026-08-28 | 화면 3종 + test-report.md — run.tsx PASS 88 · 필수 요소 9개 전부 · **SDD 산출물 4종 완료** |
