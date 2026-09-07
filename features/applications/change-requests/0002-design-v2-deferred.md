---
title: "설계서 v2.0 후속 — eligibility·202/outbox·GAP-01·프로필"
status: "반영중"
requested_by: "조준영 (applications)"
date: "2026-09-07"
affected_docs: [features/applications/spec.md, features/applications/api-contract.md, docs/domain/erd.md]
affected_features: [applications, project-management, contracts-payments, notifications]
---

# 변경 검토요청서 — 설계서 v2.0 후속 (CR-AP-002)

| | |
|---|---|
| 받는 사람 | 팀장 · 유동우(PM) · 오민혁(프로필) · 조준영(CP) |
| 보내는 사람 | 조준영 (applications) |
| 날짜 | 2026-09-07 |
| 상태 | 반영중 (`feature/applications` Mock. `app/`·ERD 미반영) |
| ID | `CR-AP-002` |
| 근거 | Applications 설계서 v2.0 (`APP-DOC-01`~`08`) GAP-01~04 |

`app/`은 팀장만 수정한다. **Mock만** `features/applications/`에 반영한다. `docs/domain/erd.md` CHECK·신설 테이블은 아직이다.

## 배경 (왜 필요한가)

설계서 v2.0은 구현 검토용이다. 입력 범위·제출 확인·거절 한국어·선정됨 카피는 Increment
정본에 맞췄다. 아래는 ERD·타 기능 확정 또는 공개 경로 재설계가 필요해서 이번 슬라이스에
넣지 못한 항목이다.

## 현재 스펙

- 공개 경로: `GET /api/v1/applications/me`, `POST /api/v1/applications/:id/accept|reject`.
  웹 `/applications/me`, `/projects/:id/applicants`. 설계서 `/me/applications` 등을 쓰지 않는다.
- 취소 일괄: `PROJECT_CANCELED` → `AUTO_RECRUITMENT_CLOSED` (규칙 8).
- 알림은 포트 발행만. 스케줄러·outbox worker 없음. 수락은 동기 200.
- 프로필 게이트·eligibility HTTP 없음. 생성은 `OPEN` + 입력 범위만 본다.
- 목록 페이지네이션·단건 GET·operation 조회 없음.
- 손잡이 `AcceptedApplicationHandoff`의 `negotiationId`는 CP가 유지 (GAP-03).

## 제안하는 변경

`features/applications` Mock에 반영했다. `app/`·ERD는 팀장 확정 후.

1. **GAP-01** 취소 `rejection_type=NULL` (Mock). ERD CHECK는 미확정.
2. **GAP-02** 인메모리 outbox·operation·수락 202(`holdOutbox`). 실 스케줄러 없음.
3. **GAP-04** `getProfileCompletion` 포트. COMPLETE 우회 없음. 코드는 Mock 로컬.
4. **APP-API-01·05·08** eligibility, 단건 GET, operation. 목록 페이지 메타.
5. **상태 이력** 메모리 append-only. HTTP·ERD 테이블 없음.

## 영향 범위

- applications spec 규칙 8·9, api-contract 신규 경로
- PM 취소 호출 계약, notifications outbox, 오민혁 프로필 포트
- ERD CHECK · 신설 테이블은 김락원·팀장

## 대안으로 검토했던 것

설계서 URL로 공개 경로를 뒤집는 안 — `app/` 이식본과 충돌. 기각.
취소 enum을 임의 NULL로 바꾸는 안 — CHECK 미확정. 기각.
eligibility를 COMPLETE 우회로 Mock하는 안 — 설계서가 금지. 기각.

## Mock 반영 (2026-09-07)

경로 유지. 취소 NULL·eligibility·페이지·단건 GET·202/outbox는 prototype만. `app/` 이식 금지.

