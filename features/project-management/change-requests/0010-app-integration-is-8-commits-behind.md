# CR-0010 — `app/` 의 project-management · engagement 반영본이 8/27 에 멈춰 있다

| | |
|---|---|
| 제기 | 유동우 (project-management · engagement) · 2026-09-02 |
| 대상 | 김락원 (팀장 · `app/` 통합) |
| 상태 | 제안 — 이관 요청 |
| 영향 | 배포 화면에 8/27 이후 고친 결함 6건이 반영돼 있지 않다 |

## 무엇이

`app/server` · `app/web` 의 파일 머리 주석이 원본 커밋을 적고 있다.

```
 * 원본: features/project-management/prototype/server/project.service.ts (3e4977e)
```

`3e4977e` 는 **2026-08-27** 커밋이다. 그 뒤로 프로토타입에 7개 커밋이 들어갔다.

| 커밋 | 무엇 |
|---|---|
| `46a476b` | 코드에 박힌 토큰을 `.env` 주입으로 (CR-0005) |
| `7c82773` | 삭제·취소에 확인 단계 (CR-0006 결함 1) |
| `d69e8e8` | 예산 출처 표시 (CR-0006 결함 2) |
| `de5a001` | 등록 입력 보존 (CR-0006 결함 3) |
| `39b7c89` | 추천 사유 표시 (CR-0006) |
| `ef1411e` | feedback_loop 3건 반영 (모집 일정 칸 · aria-label · EmptyState) |
| `1de2646` | `GET /bookmarks/ids` · `isBookmarked` 제거 (CR-0008) |

**지금 배포하면 이 일곱 가지가 화면에 없다.** 특히 앞의 셋은
`ux-philosophy.md` §6 자체 점검에서 결함으로 잡힌 것들이다.

## 이관 대상

### 새로 생긴 파일 4개

| 프로토타입 | 무엇 | `app/` 어디로 |
|---|---|---|
| `web/DestructiveActionSummary.tsx` | 삭제·취소 확인 화면 | `app/web/src/features/project-management/` |
| `web/MoneyBreakdown.tsx` | 예산 출처 표시 | 같은 곳 |
| `web/useDraft.ts` | 등록 입력 보존 | 같은 곳 |
| `server/config.ts` | 환경변수 주입 | `app/server/src/features/project-management/` |

### 고친 파일

| 프로토타입 | `app/` 대응 |
|---|---|
| `server/project.service.ts` · `project.types.ts` | `app/server/src/features/project-management/` 같은 이름 |
| `server/ports/external.port.ts` · `project-transaction.port.ts` | `project.port.ts` · `project-transaction.port.ts` |
| `web/ui.tsx` | `app/web/src/shared/ui/primitives.tsx` (Button 에 `ariaLabel`·`title`) |
| `web/ProjectManage.tsx` | `ProjectManagePage.tsx` · `ProjectEditPage.tsx` |
| `web/ProjectRegisterForm.tsx` | 같은 이름 |
| `web/ProjectBrowse.tsx` | `ProjectBrowsePage.tsx` · `ProjectDetailPage.tsx` |
| `engagement/server/bookmark.service.ts` · `bookmark.types.ts` | `app/server/src/features/engagement/` 같은 이름 |
| `engagement/web/RecommendationSection.tsx` | 같은 이름 |

`app/server/src/features/project-management/project.types.ts:81` 과
`app/web/src/features/project-management/project.types.ts:44` 의 `isBookmarked`
삭제는 CR-0008 과 같은 건이다.

## 왜 제가 직접 하지 않았나

`app/` 은 팀장 통합 영역이다 (`app/web/AGENTS.md` · `app/server/AGENTS.md`).
담당자가 각자 손대면 조립 지점이 흩어진다.

**필요하시면 제가 올리겠습니다.** 어느 쪽이든 말씀만 주시면 됩니다.

## 확인해 둔 것

이관해도 깨지지 않는다는 것은 확인했다.

| 검사 | 결과 |
|---|---|
| `develop` 과 병합 충돌 | **0건** |
| `app/server` typecheck | 통과 |
| `app/web` typecheck | 통과 |
| 프로토타입 6개 도메인 테스트 | PASS 585 · FAIL 0 |
| 내 폴더가 다른 기능 폴더를 import | **없음** (전부 포트 경유, ADR-0009) |

## 함께 볼 것

`CR-0009` — 새로 받은 리포에서 `npm run dev` 가 실패한다. 이관 전에 먼저 고치는 편이 낫다.
