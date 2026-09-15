---
title: "설계서 v2.0 후속 — eligibility·202/outbox·GAP-01·프로필"
status: "반영중"
requested_by: "조준영 (applications)"
date: "2026-09-07"
updated: "2026-09-08"
affected_docs: [features/applications/spec.md, features/applications/api-contract.md, docs/domain/erd.md]
affected_features: [applications, project-management, contracts-payments, notifications]
---

# 변경 검토요청서 — 설계서 v2.0 후속 (CR-AP-002)

| | |
|---|---|
| 받는 사람 | 팀장 · 유동우(PM) · 오민혁(프로필) · 조준영(CP) |
| 보내는 사람 | 조준영 (applications) |
| 날짜 | 2026-09-07 |
| 상태 | applications 반영완료 (Mock·spec·시안). GAP-04 포트는 이식됨·게이트 보류(화면 대기). 그 외 `app/`·ERD 잔여 |
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

## 진행 상황 (2026-09-08)

**applications 쪽은 닫혔다.** 위 "제안하는 변경" 5개 항목이 Mock·spec·시안에 다 들어가
있고 `npx tsx features/applications/prototype/run.tsx` → PASS 97 / FAIL 0으로 검증된다.
`REJECTION_COPY` 4종 문구도 `application.constants.ts`·`ApplicationPanel.tsx`·`high-fi.html`에
있고 `run.tsx`가 네 문구를 각각 대조한다.

**남은 것은 전부 다른 담당이다.** 이 CR을 열어 둔 채로 대기한다.

| 남은 항목 | 담당 | 막힌 이유 |
|---|---|---|
| GAP-01 `rejection_type` NULL CHECK | 김락원 · 팀장 | ERD CHECK 미확정. Mock은 NULL로 진행 |
| GAP-02 실 outbox worker·스케줄러 | 팀장 | 서버리스. 이번 Increment 밖 |
| GAP-04 `getProfileCompletion` 포트 | 오민혁 · 팀장 | **포트 이식 완료 · 게이트 보류 (2026-09-09 RW).** 프로필 입력 화면이 없어 켜면 전 지원 차단. 화면 후 express·applications 연결 |
| 상태 이력 테이블 | 김락원 · 팀장 | ERD 신설 필요. Mock은 메모리 append-only |
| `app/` 이식 (eligibility·단건 GET·operation·202) | 팀장 | `app/`은 팀장만 수정 |
| `app/web` 거절 4종 문구 | 팀장 | `MyApplicationsPage`는 상태 라벨만. `REJECTION_COPY` 미이식 |

`app/` 미이식 항목은 CR-AP-001(지원 건수)·CR-AP-003(모집 상태 보정값)과 같은 통합 슬라이스에서
함께 처리하는 쪽이 낫다 — 세 건 모두 `application.service.ts` 한 파일과
`ProjectApplicationContextPort` 한 타입을 건드린다.

