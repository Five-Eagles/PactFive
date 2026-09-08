---
title: "협상 컨텍스트도 조회 시점 모집 상태를 준다 (SCHEDULED 프로젝트에 지원 불가)"
status: "제안"
requested_by: "조준영 (applications)"
date: "2026-09-08"
affected_docs: [features/project-management/spec.md, features/project-management/api-contract.md]
affected_features: [applications, project-management, contracts-payments]
---

# 변경 검토요청서 — 협상 컨텍스트의 모집 상태 (CR-AP-003)

| | |
|---|---|
| 받는 사람 | 유동우 (project-management) · 팀장 |
| 보내는 사람 | 조준영 (applications) |
| 날짜 | 2026-09-08 |
| 상태 | 제안 |
| ID | `CR-AP-003` |
| 근거 | 실서비스 재현 2건 (2026-09-08) · PM 규칙 14 · applications 규칙 1 |

`app/`은 팀장만 수정한다. applications 쪽에는 고칠 것이 없다 — 판정 근거를 PM에서 받는다.

## 배경 (왜 필요한가)

**모집 기간이 남은 프로젝트에 지원하면 「모집이 마감되었습니다」 409가 난다.** 2026-09-08에
두 건 재현됐다(마감 84일 전 · 23일 전). 화면은 「모집 중」이고 `지원하기`도 활성이다.

원인은 applications가 보는 모집 상태와 화면이 보는 모집 상태가 다른 것이다.

- 화면(공개 목록·상세·`canApply`)은 **조회 시점으로 보정한 값**을 쓴다 — PM 규칙 14,
  `project.service.ts` / `project-read.service.ts`의 `effectiveRecruitmentStatus`
- applications는 `getProjectNegotiationContext`가 주는 **저장값**을 쓴다 —
  `project-contract.service.ts`가 `p.recruitmentStatus`를 그대로 반환한다

applications 규칙 1은 `OPEN`이 아니면 409다. 그 판정 자체는 바꿀 이유가 없다. 문제는
**같은 프로젝트가 화면에서는 `OPEN`, 계약 조회에서는 `SCHEDULED`** 로 보인다는 점이다.

## 현재 스펙

- PM 규칙 14 — `SCHEDULED`는 `recruitment_start_at`이 지나면 **조회 시점에** `OPEN`으로
  보이고, `OPEN`은 `recruitment_deadline_at`이 지나면 `CLOSED`로 보인다.
- PM 규칙 42 — `getProjectNegotiationContext`는 협상 진입 판정용 조회다. 규칙 14를 적용하는지
  적어 있지 않다.
- applications 규칙 1 — 생성은 `recruitmentStatus = OPEN`만. `SCHEDULED`·`CLOSED`는 409.
- 저장값을 `SCHEDULED → OPEN`으로 바꾸는 배치·스케줄러는 없다.

## 재현 (두 경로 모두 같은 결과)

**경로 1 — 수정으로 시작일을 앞당긴 경우**

1. 등록 시 모집 시작일 10/1 → 미래이므로 저장값 `SCHEDULED` (`project.service.ts`
   `startsLater ? 'SCHEDULED' : 'OPEN'`)
2. 프로젝트 수정으로 시작일을 9/2로 변경 → `updateProject`는 `recruitmentStartAt`만 덮어쓰고
   `recruitmentStatus`를 다시 쓰지 않는다. 계속 `SCHEDULED`
3. 9/8 상세 조회 → 규칙 14 보정으로 `OPEN` · 「모집 중」 · `canApply: true`
4. 지원 제출 → 저장값이 `SCHEDULED`라 409 `PROJECT_TRANSITION_CONFLICT`

**경로 2 — 수정하지 않아도 같다**

시작일을 미래로 두고 등록한 프로젝트는 그 시각이 지나도 저장값이 `SCHEDULED`로 남는다.
**수정과 무관하게, 예약 모집 프로젝트는 모집이 시작된 뒤에도 지원을 받을 수 없다.**

## 제안하는 변경

**1. `getProjectNegotiationContext`가 `effectiveRecruitmentStatus`를 반환한다** (핵심)

규칙 14를 조회에만 적용하고 계약 함수에는 적용하지 않을 근거가 없다. 배치가 없는 동안
저장값은 "아직 반영되지 않은 값"이고, 규칙 14가 정한 보정값이 정본이다. 부르는 쪽
(applications 생성·수락, contracts-payments 협상 진입)이 전부 같은 값을 본다.

`acceptProjectApplication`의 `OPEN + NONE` 판정(규칙 36)도 같은 보정값을 쓴다 — 모집이
시작된 예약 프로젝트의 지원을 수락할 수 없는 문제가 함께 닫힌다.

**2. `updateProject`가 모집 일정을 바꿀 때 저장값도 다시 쓴다** (보완)

등록과 같은 규칙으로 계산한다 — 새 시작일이 미래면 `SCHEDULED`, 아니면 `OPEN`.
1번만 해도 증상은 사라지지만, 저장값과 보정값이 계속 어긋난 채로 남는 것은 규칙 14의
의도(배치 지연 흡수)를 넘어선다. 마감(규칙 22)·재모집(규칙 33)은 저장값을 정확히 쓰므로
수정만 예외로 둘 이유가 없다.

**3. 시작일 입력이 UTC 하루 끝으로 저장된다** (같은 증상을 키우는 별개 결함)

`app/web/src/shared/date.ts`의 `toIsoOrEmpty`는 날짜를 `T23:59:59Z`로 바꾼다. 마감일용으로
만든 함수인데 **시작일에도 그대로 쓴다**(`project-registration-draft.ts`,
`ProjectEditPage.tsx`). 시작일 9/2는 `2026-09-02T23:59:59Z` = KST 9/3 08:59가 된다.
화면은 문자열 앞 10자리만 잘라 「9. 2.」로 보여주므로 이 차이가 드러나지 않는다.

저장·판단은 UTC 유지가 맞다(PRD §13.1). 바꿀 것은 **한국 달력일 → UTC 변환**이다.
시작일은 KST 0시, 마감일은 KST 그날 끝으로 해석해야 한다. 시작일과 마감일에 같은
`23:59:59Z`를 쓰면 안 된다.

## 영향 범위

- `features/project-management/spec.md` 규칙 42(보정 적용 명시) · 규칙 16~18(수정 시 상태 재계산)
- `features/project-management/prototype/server/project-contract.service.ts` ·
  `project.service.ts` · 시작일 변환
- `app/server/src/features/project-management/` 같은 두 파일 (팀장 이식)
- `app/web/src/shared/date.ts` — 마감일 동작을 바꾸면 재모집(SCR-B10)도 함께 확인 필요
- applications — 고칠 것 없음. `ProjectApplicationContextPort`로 받는 값만 달라진다
- contracts-payments — `getProjectNegotiationContext`를 같이 쓰므로 협상 진입 판정도 함께 정확해진다

## 확인 질문

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| A1 | `getProjectNegotiationContext`가 규칙 14 보정값을 주는 것이 맞는가 | | | |
| A2 | `acceptProjectApplication`의 `OPEN` 판정도 같은 보정값을 쓰는가 | | | |
| A3 | `updateProject`가 일정 변경 시 `recruitmentStatus`를 재계산하는가 | | | |
| A4 | 시작일·마감일 변환을 KST 달력일 기준으로 나누는 것이 맞는가 | | | |

## 대안으로 검토했던 것

- **applications가 마감일을 직접 보고 판정한다.** 모집 상태 정본은 PM이다. 같은 판정을 두
  기능이 각자 하면 어긋난다(지금 증상이 정확히 그 형태다). 기각.
- **`SCHEDULED → OPEN` 배치를 만든다.** 규칙 14가 배치 없이도 맞게 보이도록 만든 장치인데,
  배치를 다시 도입하면 두 장치가 겹친다. 서버리스에서 스케줄러는 이번 Increment 밖이다. 기각.
- **화면에서 `canApply`를 저장값 기준으로 낮춘다.** 오류는 사라지지만 **모집이 시작된
  프로젝트에 아무도 지원할 수 없게** 된다. 증상을 증상으로 덮는 안이다. 기각.
- **DB를 KST로 저장한다.** 저장·비교가 전부 UTC 전제다(PRD §13.1). 기각.
