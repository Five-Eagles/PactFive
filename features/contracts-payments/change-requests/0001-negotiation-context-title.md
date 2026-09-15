---
title: "getProjectNegotiationContext에 title을 넣는다"
status: "반영 완료"
requested_by: "조준영 (contracts-payments)"
date: "2026-09-08"
affected_docs: [features/project-management/spec.md, features/project-management/api-contract.md]
affected_features: [project-management, contracts-payments]
---

# 변경 검토요청서 — 협상 컨텍스트 제목 (CR-CP-001)

| | |
|---|---|
| 받는 사람 | 유동우 (project-management) |
| 보내는 사람 | 조준영 (contracts-payments) |
| 날짜 | 2026-09-08 |
| 상태 | **반영 완료 (2026-09-09, 팀장)** |
| ID | `CR-CP-001` |
| 근거 | spec 규칙 20 `project_title_snapshot = projects.title` · feedback 2026-09-07 항목 2 |

> **닫음 (2026-09-09, 팀장).** 제안대로 `NegotiationContext`(project-management)와
> `ProjectNegotiationContextResponse`(contracts-payments 쪽 구조적 타입)에 `title: string`을
> 추가했다. `acceptNegotiationOffer`가 계약 생성 시점에 `ctx.title`을 `projectTitleSnapshot`·
> `termsSnapshot.projectTitle`로 찍는다 — 자리표시자 빈 문자열은 없앴다. 조회 시 세기·별도
> 프로젝트 GET은 그대로 안 쓴다(제안대로).
>
> 확인 — app/server tsc 통과 · 서버 테스트 8/8 (CR-0012·CR-AP-003과 같은 커밋 묶음)

`app/`은 팀장만 수정한다.

## 배경

`getProjectNegotiationContext`에 제목이 없다. 수락 시 `project_title_snapshot`과 공개 GET
4곳(`projectTitle`)이 `''`로 나간다. 화면은 「프로젝트」로 가린다.

## 현재 스펙

PM `NegotiationContext`: `projectId` · `clientId` · 모집·거래 상태 · `acceptedApplicationId` ·
기한·버전. `title` 없음. CP 규칙 20은 스냅샷을 `projects.title`로 적는다.

## 제안하는 변경

`NegotiationContext`에 `title: string`을 넣는다. CP는 그 값으로 스냅샷·GET을 채운다.
빈 값이면 화면 「프로젝트」 유지. 조회 시 세기·별도 프로젝트 GET은 쓰지 않는다.

## 영향 범위

- `features/project-management/` 포트·규칙 42 (유동우)
- CP 규칙 20 스냅샷. `app/` 이식은 팀장

## 대안으로 검토했던 것

- CP가 프로젝트 공개 GET을 또 부른다 — 폴더 간 접점 위반. 기각.
- 시드 제목을 CP Mock에만 둔다 — prototype은 이미 그렇다. app/ 빈 문자열은 안 고쳐진다. 기각.
