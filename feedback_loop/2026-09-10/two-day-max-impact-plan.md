# PactFive 2일 최대 효과 개선 계획서 (2026-09-10 ~ 09-11)

기준 문서: `PactFive_구현_실행_검토보고서_2026-09-10_v2.0.md`  
실행 원칙: 권한·무결성·거래 진행을 막는 결함을 기능 수보다 우선

## 1. 효과 기준

이틀 후 성공 판정: app에서 아래 시연이 막히지 않는다.

지원·선정 → 합의·서명 → 결제 PAID → **IN_PROGRESS** → 납품 승인 → 정산 RELEASED → COMPLETED·리뷰

가장 비싼 병목: **C-06** (`contractApplicationId`에 `agreementId` 전달 → start 0회).

## 2. 역할

| 역할 | 담당 |
|---|---|
| 팀장 | `app/` 패치·PR(`--base develop`)·migrate/generate |
| 조준영 | 이식 지시서·prototype 회귀·R-07 원본·증거 로그 |
| 유동우 | A-03 반영 후 PM 잠금 확인 |
| 오민혁 | 프로필·userExists(이번 2일 필수 밖). 시연은 COMPLETE 프로필만 |

## 3. Day 1 (9/10) — 시연 파이프 + 권한

### Block A (~3h): C-06 → C-01 → C-13

| 순서 | ID | 작업 | 완료 증거 |
|---|---|---|---|
| 1 | C-06 | 스냅샷이 합의 `applicationId` 사용 | confirm 후 start 1회, IN_PROGRESS |
| 2 | C-01 | requireParty = client 또는 선정 freelancer | 외부 freelancer 차단 |
| 3 | C-13 | 취소 확정 후 invalidate가 CANCELED 허용 | 미결제 취소 → 합의 REJECTED·계약 CANCELED |

### Block B (~3h): A-03 → A-04 → C-11

| 순서 | ID | 작업 | 완료 증거 |
|---|---|---|---|
| 4 | A-03 | bumpApplicationCounts 호출 | 지원 2→누적2/대기2, 선정 후 대기0 |
| 5 | A-04 | 멱등 `projectId:actor:key` + 키 필수 | 타 사용자 격리, 키 없음 거부 |
| 6 | C-11 | 정산은 APPROVED(+IN_PROGRESS)만 | 미승인 PAID에서 RELEASED 불가 |

Day1 게이트: 시나리오 3·6·7·10 + prototype 3종 PASS.

## 4. Day 2 (9/11) — 내구·복구·리뷰 UX

### Block C (~3h): C-02 → C-08 최소 → C-10

| 순서 | ID | 작업 | 완료 증거 |
|---|---|---|---|
| 7 | C-02 | saveAgreement가 기존 offerId 유지 | 재제안 후 offerId 불변 |
| 8 | C-08 | PAID 재confirm 멱등; reprepare pgOrderId 갱신 | T10 유형 통과 |
| 9 | C-10 | prepare된 uploadId/objectKey만 납품 요청 | 임의 키 거부 |

### Block D (~3h): R-07 → G-04 → 증거

| 순서 | ID | 작업 | 완료 증거 |
|---|---|---|---|
| 10 | R-07 | myDirection + 웹 방향 태그·ConfirmDialog | 지시서 2026-09-10 |
| 11 | G-04 | `.success` 토큰 | check:design 통과 |
| 12 | 증거 | audit T01–T25·typecheck·prototype | 잔여 FAIL 목록 기록 |

여유 시: C-07 의뢰인 전용·Toss 대조, A-08 RUNNING lease, PATCH 405.

## 5. 2일 안에 하지 않음

- C-09 실업로드 본구현, C-14 Outbox, A-02 프로필 게이트, G-02 전면 원자성, Toss 키 발급

## 6. 리스크

- C-06만 고치고 C-01 미루면 보안 결함 잔존 → Day1 묶음 필수
- C-13 변경 시 PAID/IN_PROGRESS 취소 금지 회귀(CP 규칙 25·17)
- 작업 전 `app/server`에서 `prisma generate` 고정

## 7. 구현 반영 메모 (2026-09-10 실행)

로컬 `app/`에 Day1·Day2 필수 항목을 반영했다.

| ID | 요지 |
|---|---|
| C-06 | snapshot `applicationId` |
| C-01 | `resolveApplicationFreelancer` + requireParty |
| C-13 | CANCELED 후 invalidate 허용 |
| A-03 | bumpApplicationCounts 호출 |
| A-04 | 멱등 키 필수·스코프 |
| C-11 | APPROVED+IN_PROGRESS 정산 |
| C-02 | offerId 보존 |
| C-08 | PAID 재confirm·pgOrderId |
| C-10 | prepare upload 검증 |
| R-07 | myDirection·확인 모달 |
| G-04 | `.success` 토큰 |

증거: `feedback_loop/2026-09-10/two-day-max-impact-evidence.md`  
typecheck·check:design·prototype 513 PASS.
