# CR-0013 — 서버가 만드는 id 가 스키마 varchar(30) 을 6자 넘는다

| | |
|---|---|
| 제기 | 유동우 (project-management) · 2026-09-09 |
| 대상 | 김락원 (팀장 · `docs/domain/` · `app/server/prisma/schema.prisma`) |
| 상태 | 제안 — **배포 차단 건.** `DATABASE_URL` 을 붙이는 순간 등록이 실패한다 |
| 관련 | notifications CR-0001 §5 (같은 문제를 `User.id` 에서 지적) · `app/server/src/express-app.ts:196` |

## 요약

`randomId()` 가 UUID 에서 하이픈만 뺀 **32자**를 주고, 접두어 4자가 붙어 **36자**가 된다.
그런데 스키마의 해당 컬럼은 **varchar(30)** 이다.

```
express-app.ts:196   randomUUID().replace(/-/g, '')   → 32자
                     `prj_${randomId()}`              → 36자
schema.prisma:517    Project.id  @db.VarChar(30)      → 30자
```

## 어디가 걸리나

| 만드는 값 | 길이 | 스키마 | 소유 |
|---|---|---|---|
| `prj_` + UUID32 | 36 | `Project.id` varchar(30) | project-management |
| `bkm_` + UUID32 | 36 | `Bookmark.id` varchar(30) | engagement |
| `pra_` + UUID32 | 36 | `PricingAnalysis.id` varchar(30) | ai-pricing |

세 개 모두 `express-app.ts` 의 같은 `randomId()` 를 쓴다. 다른 기능에도 같은 패턴이
있는지는 확인하지 않았다 — 팀장이 전수로 보는 편이 낫다.

## 지금은 왜 안 터지나

인메모리 저장소에는 길이 검사가 없다. `DATABASE_URL` 이 없으면 그쪽으로 붙는다
(`express-app.ts:253`). 그래서 로컬·현재 배포에서는 통과한다.

**Postgres 에 붙는 순간 insert 가 실패한다.** 프로젝트 등록·북마크·AI 분석이
전부 막히고, 이 셋은 발표 시연 동선의 첫 단계다.

## 같은 문제가 이미 한 번 지적됐다

notifications CR-0001 §5 가 `usr_` + UUID32 = 36자와 `User.id` varchar(30) 의 충돌을
"공통 식별자 길이 블로커"로 올렸다. **범위가 사용자 ID 하나로만 잡혀 있었을 뿐,
같은 생성 규칙을 쓰는 곳이 최소 세 군데 더 있다.**

## 제안

**컬럼을 varchar(36) 으로 늘린다.**

| | 컬럼 늘리기 | id 줄이기 |
|---|---|---|
| 고칠 곳 | `schema.prisma` · ERD | `express-app.ts` + 이미 만들어진 데이터 |
| 위험 | 낮음 | 중간 — 다른 기능이 이 id 를 참조한다 |
| 남은 시간과 | 맞음 | 안 맞음 |

외래키로 이 id 를 받는 컬럼들(`project_id` 등)도 같이 늘려야 한다.

## 담당자가 결정할 것

CR-0001 §5 가 이미 "생성 규칙·기존 데이터·스키마 정책을 팀장이 맞춰야 한다"고 남겨
두었다. **그 결정에 위 세 개를 같이 넣어 주면 된다.**

`docs/domain/` 과 `schema.prisma` 는 담당자가 직접 고치지 않는 영역이라 요청으로만 남긴다.
결정되면 제 쪽 코드에 반영할 것이 있는지 다시 보겠다 — 컬럼을 늘리는 쪽이면 없다.
