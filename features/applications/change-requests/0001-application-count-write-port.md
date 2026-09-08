---
title: "지원 건수 캐시를 생성·DIRECT 거절에서만 갱신한다"
status: "반영중"
requested_by: "조준영 (reviews · contracts-payments)"
date: "2026-09-07"
updated: "2026-09-08"
updated: "2026-09-08"
affected_docs: [features/applications/spec.md, features/project-management/spec.md]
affected_features: [applications, project-management]
---

# 변경 검토요청서 — 지원 건수 캐시 (건 1)

| | |
|---|---|
| 받는 사람 | 조준영 (applications) · 유동우 (project-management) |
| 보내는 사람 | 조준영 (reviews · contracts-payments) |
| 날짜 | 2026-09-07 |
| 상태 | 반영중 (applications Mock 확인 2026-09-08. `app/`·PM 미반영) |
| ID | `CR-AP-001` |
| 근거 | 유동우 `260907 보완사항.md` 건 1 · `feedback_loop/2026-09-05/applications.md` 항목 2 |

`app/`은 팀장만 수정한다.

## 배경 (왜 필요한가)

`projects.application_count` · `pending_application_count`는 초기화(0)와 읽기만 있고
applications가 쓸 포트가 없다. 화면 "지원 N건"이 0이다.

대기 건수는 표시용이 아니다. PM 규칙 15(지원자가 생기면 예산·모집일정 잠금) 판정에 쓰이므로
틀리면 동작이 틀린다.

## 현재 스펙

- applications spec: 캐시는 조준영이 같은 트랜잭션에서 갱신 (규칙 56). 생성 시 둘 다 +1.
- PM 규칙 56: 생성 +1 · 거절 −1 · 수락 −1. 그 상태를 바꾸는 트랜잭션 안에서 함께.
- applications Mock은 인메모리 `saveProject`로 이미 올린다. `app/` 이식본은 쓰기 포트가 없어
  반영되지 않았다 (`feedback_loop/2026-09-05/applications.md` 항목 2).
- Prisma 컬럼은 2026-09-06 PR #61에 있다. 조회 시 세기로 바꾸면 스키마를 되돌려야 한다.

## 제안하는 변경

조회 시 세기는 쓰지 않는다. 컬럼 캐시를 유지하고, 누가 언제 쓰는지만 나눈다.

| 순간 | 시작하는 쪽 | 하는 일 | 담당 |
|---|---|---|---|
| 지원 생성 | applications | `applicationCount` +1, `pendingApplicationCount` +1 | 조준영 |
| 개별 거절 `DIRECT` | applications | `pendingApplicationCount` −1 (바닥 0) | 조준영 |
| 수락 | applications → PM 위임 | `pendingApplicationCount: 0` | 유동우 |
| 마감·취소 | PM → `rejectPendingApplications` | 호출 뒤 `pendingApplicationCount: 0` | 유동우 |

`applicationCount`는 올라가기만 한다. "지금까지 몇 명이 지원했나"다.

수락·마감·취소에서 −1이 아니라 0인 이유: 그 시점에 대기 지원이 전부 정리된다. 하나씩 빼면
중간 실패 때 어긋나고, 0으로 놓으면 어긋날 수 없다.

**applications가 빼면 안 되는 것**

- `acceptApplication`의 `AUTO_OTHER_ACCEPTED`
- `rejectPendingApplications`의 `AUTO_RECRUITMENT_CLOSED`

유동우가 0으로 놓으므로 여기서 −1 하면 두 번 빠진다.

## 조준영 (applications) 할 일

원본은 `features/applications/`. `app/`은 팀장 이식.

1. `createApplication` 저장 직후 전체 +1 · 대기 +1.
2. `rejectApplication`에서 `DIRECT`로 새로 거절한 경우만 대기 −1. 이미 `REJECTED` 멱등 200은 빼지 않는다.
3. spec 규칙 2·캐시 문단에 위 분담을 적는다. `run.tsx`에 생성 +1/+1 · DIRECT −1 시나리오.
4. `acceptApplication`·일괄 거절에서 카운트 감산을 제거한다. C-01 스탠드인이 대기를 0으로 둔다.

## 유동우 (project-management) 할 일

1. `ProjectApplicationContextPort`에 갱신 함수를 열고 `project.repository`에 반영. 음수 방지.
2. `acceptProjectApplication`의 `repo.update`에서 `pendingApplicationCount: 0`.
3. `closeRecruitment` / `cancelProject`에서 `rejectPendingApplications` 결과를 받은 뒤 0.

## 영향 범위

- `features/applications/spec.md` · `prototype/server/application.service.ts` · `run.tsx`
- `features/project-management/` 쓰기 포트 · 수락·마감·취소 (유동우 PR)
- `app/` 이식은 팀장. 담당자가 `app/server`를 직접 고치지 않는다
- 시드 `features/project-management/seed/projects.json`의 `targetApplicationCount`
  (P02=2 · P03=1 · P08=3)로 화면 숫자를 확인한다

## 확인 질문

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| A1 | 생성 +1/+1 · DIRECT −1만 applications가 쓰는가 | | | |
| A2 | 수락·마감·취소의 대기 건수는 PM이 0으로 놓는가 | | | |
| A3 | `AUTO_*` 거절 경로에서 applications는 카운트를 빼지 않는가 | | | |
| A4 | 조회 시 세기·스키마 되돌리기는 하지 않는가 | | | |

## 진행 상황 (2026-09-08 재요청)

**applications 쪽은 끝났다.** 위 "조준영 할 일" 4개 항목 모두 반영됐다.

- spec 규칙 2·56 분담(29~30행 캐시 문단), 규칙 7의 `DIRECT` −1 · `AUTO_*` 제외
- Mock `application.service.ts` 생성 직후 +1/+1, `DIRECT` 거절 −1(바닥 0)
- `run.tsx` 생성 +1/+1 · 멱등 200 미증가 · `DIRECT` −1 · 멱등 재거절 미감산 시나리오
- `npx tsx features/applications/prototype/run.tsx` → PASS 97 / FAIL 0

**막혀 있는 것은 project-management 쪽 쓰기 포트다.** develop `ec1c01f` 기준으로 없다.

- `app/server/src` 전체에서 두 필드를 쓰는 코드가 없다 — 초기화(`project.service.ts` 0)와
  읽기(`project-read.service.ts`)만 있다
- `ProjectTransactionPort`·`ProjectApplicationContextPort`에 갱신 함수가 열려 있지 않다
- 그래서 `app/`은 이 CR을 이식할 수 없다 (`feedback_loop/2026-09-07/applications.md` 항목 1)

**실제 화면 증상** — 지원이 정상 저장돼도 프로젝트 상세의 「지원 N건」이 계속 0이다. 대기
건수도 0이라 **PM 규칙 15의 잠금이 걸리지 않는다.** 지원자가 있는데 예산·모집 일정을 고칠 수
있는 상태가 된다. 표시 문제가 아니라 동작 문제다.

**유동우에게 요청** — "유동우 할 일" 3개 항목과 함께, PM `spec.md`도 갱신이 필요하다.

- 규칙 56이 아직 구 분담(`생성 +1 · 거절 −1 · 수락 −1`)이다. 이 CR의 분담(수락·마감·취소는
  −1이 아니라 0)으로 바꿔야 `AUTO_*` 경로에서 두 번 빠지는 문제가 문서상으로도 닫힌다
- 18·29·130행의 담당자가 아직 `최윤석`이다. applications는 2026-09-03 조준영으로 재배정됐다

## 대안으로 검토했던 것

- **조회 시 COUNT.** 컬럼·규칙 56을 폐기해야 하고 팀장 스키마 + 다른 담당 일정이 밀린다. 기각.
- **건 1을 reviews/CP에서 구현.** 카운트 소유는 applications·PM이다. CTA만 reviews가 계약한다. 기각.
- **수락 때도 applications가 −1.** 잔여 `AUTO_OTHER_ACCEPTED`와 겹친다. 유동우 0안이 안전하다.

## Mock 반영 (2026-09-08 확인)

`features/applications/` 조준영 할 일 1~4는 Mock에 있다. `createApplication` +1/+1,
`DIRECT` −1, `AUTO_*` 비감산, C-01 스탠드인 `pendingApplicationCount: 0`.
`app/` 쓰기 포트와 `acceptProjectApplication`·마감·취소의 0은 유동우·팀장.
