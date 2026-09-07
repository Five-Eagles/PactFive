# CR-0007 — `projects` 에 `budget_source` 컬럼 추가

| | |
|---|---|
| 제기 | 유동우 (project-management) · 2026-09-02 |
| 대상 | 김락원 (팀장 · ERD) |
| 상태 | **반영 완료 (2026-09-04)** — Prisma 스키마 설계 시점에 ERD(`erd-v1.4.dbml` E-31)·`app/server/prisma/schema.prisma`에 정식 컬럼으로 반영됨. 마이그레이션(실 DB 연결)은 별도 — 기능 완성 이후 진행 |
| 근거 | CR-0006 결함 2 · `ux-philosophy.md` §6 근거 이해 |

## ⚠ 이것은 조용히 지나가면 안 된다

지금은 서버가 인메모리라 이 필드가 **스키마를 건드리지 않는다.** 그래서 코드에 먼저
들어가 있다 (`ProjectRecord` · `ClientProjectDetail`).

**Prisma 스키마를 처음 쓰는 시점이 게이트다.** 그때 "이미 코드가 있으니 컬럼만
추가하면 된다"고 넘기지 말고 ERD 변경으로 정식 검토해 달라.

컬럼을 안 넣기로 하면 `MoneyBreakdown` 을 걷어내야 하고, 그러면 CR-0006 결함 2가
되살아난다 — **예산이 내가 넣은 값인지 AI 가 바꾼 값인지 화면에서 알 수 없게 된다.**
어느 쪽이든 그때 결정할 일이다.

(feedback_loop 2026-09-03 project-management 항목 3)

## 요약

`projects` 에 두 컬럼을 추가한다.

```sql
budget_source     budget_source  NOT NULL DEFAULT 'CLIENT_INPUT'
budget_source_at  timestamptz    NOT NULL DEFAULT now()

CREATE TYPE budget_source AS ENUM ('CLIENT_INPUT', 'AI_ANALYSIS');
```

## 왜 필요한가

규칙 8 은 `pricingAnalysisId` 가 있으면 **사용자가 입력한 금액을 버리고 AI 분석 금액으로
덮어쓴다.** 서버 동작은 맞다 — 클라이언트가 보낸 값을 신뢰하지 않는다.

문제는 **덮어썼다는 사실이 아무데도 남지 않는다**는 것이다.

등록을 마친 의뢰인이 수정 화면에서 보는 `4,800,000원` 이 자기가 넣은 값인지 AI 가
바꾼 값인지 구분할 방법이 없다. 제품 컨셉이 `Trust by Evidence` 인데 가장 중요한 숫자에
출처가 없다.

`ux-philosophy.md` §6 의 **근거 이해** — "금액·추천·승인의 출처와 확정 수준을 구분한다" —
를 이 컬럼 없이는 충족할 수 없다.

## 컬럼 없이 풀 수 있나 — 검토했다

| 방법 | 왜 안 되나 |
|---|---|
| `pricing_analyses.project_id` 로 역조회 | ai-pricing 테이블이다. 매 조회마다 남의 도메인을 읽어야 하고, 포트가 하나 더 필요하다 |
| 등록 시점만 알고 안 저장 | 조회할 때는 알 수 없다. 수정 화면이 못 쓴다 |
| 응답에서만 계산 | 계산할 근거가 없다. 결국 위 둘 중 하나로 돌아온다 |

**자기 테이블에 두는 것이 가장 단순하다.** 프로젝트의 예산이 어디서 왔는지는
프로젝트의 사실이다.

## 영향 범위

| | |
|---|---|
| 테이블 | `projects` — **project-management 소유** |
| 읽는 곳 | `ClientProjectDetail` 뿐. **등록 의뢰인만 본다** |
| 다른 도메인 | 영향 없음. 공개 응답·계약 함수에는 넣지 않았다 |

**공개 응답에 넣지 않은 이유**: 의뢰인이 AI 를 썼는지는 프리랜서가 알 필요가 없고,
알면 지원 금액 판단에 영향을 준다. `run.tsx` 에 비로그인·프리랜서 응답에 키가 없는지
확인하는 검사를 넣었다.

## 이미 한 것

Mock 기준으로 끝까지 동작한다. 마이그레이션만 있으면 그대로 붙는다.

```
project.types.ts        BudgetSource 타입 · ProjectRecord · ClientProjectDetail
project.service.ts      등록 시 CLIENT_INPUT, 분석 연결 시 AI_ANALYSIS 로 갱신
mock/seeds.ts           시드 18종 기본값
web/MoneyBreakdown.tsx  화면 표시
run.tsx                 검사 12건
```

## 마이그레이션 전까지

Mock 에서만 값이 유지된다. 실제 DB 에 붙기 전에는 조회 결과가 항상 기본값이다.
**동작이 깨지지는 않는다** — 화면이 출처를 모르면 아무 말도 하지 않도록 만들었다.
