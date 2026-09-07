# applications — SPEC

이번 세션 범위는 **9/4 Increment**이다. 공개 API Mock · `design/` high-fi 3뷰 · `run.tsx`.
정본: PRD v6.4 §3.2.4 · `acceptProjectApplication` · A1–A4(2026-08-26 예),
ERD v1.4 `applications`, PM 규칙 55–57. 함수명으로만 지칭한다 (D-48).

## 목적

프리랜서가 모집 중인 프로젝트에 지원하고, 의뢰인이 1명을 수락하면 거래가 `CONTRACT_PENDING`으로
들어가게 한다. 수락 뒤에만 잔여 거절과 알림을 발행한다.

## 범위

- 포함: 지원 생성, 중복 1건, 의뢰인 목록·수락·개별 거절, 일괄 거절,
  `acceptProjectApplication` 호출, `AcceptedApplicationHandoff`, 알림 **발행만**,
  공개 API Mock, high-fi 3뷰 (지원하기 · 지원자 관리 · 내 지원 현황).
- 제외: Kakao·알림 발송(notifications), 합의·결제·리뷰, `projects` 직접 UPDATE,
  지원 수정·삭제 UI, `app/` 반영.

## 관련 엔티티 (근거: `docs/domain/erd.md`)

조준영: `applications`. PK 접두어 `app_`.
`application_status` = `PENDING` · `ACCEPTED` · `REJECTED`.
`application_rejection_type` = `DIRECT` · `AUTO_OTHER_ACCEPTED` ·
`AUTO_RECRUITMENT_CLOSED` · `AGREEMENT_DECLINED`.
필드: `freelancer_id`, `cover_letter`, `expected_amount`, `expected_duration_days`,
`decided_at`, `created_at`, `updated_at`.

캐시(조준영이 같은 트랜잭션에서 갱신, 규칙 56): `projects.application_count`(누적, 표시용),
`projects.pending_application_count`(PENDING만, 잠금용). 원본과 어긋나면 원본이 옳다.

유동우: `acceptProjectApplication` — `recruitmentStatus → CLOSED`,
`transactionStatus → CONTRACT_PENDING`, `acceptedApplicationId`.
모집 상태 읽기 (`OPEN`만 생성·수락).

알림: `APPLICATION_SUBMITTED` · `APPLICATION_ACCEPTED` · `APPLICATION_REJECTED` ·
`APPLICATION_AUTO_REJECTED`를 포트에 쌓기만 한다. 발송은 notifications.

## 규칙

번호는 `api-contract.md`·`prototype/`에서 "규칙 N"으로 참조한다.

1. **생성은 `recruitmentStatus = OPEN`만** (D-46). 프리랜서. 본문에 `status` 없음.
   `SCHEDULED`·`CLOSED`·없으면 409/404. 서버가 모집 상태를 읽고 판정한다.

2. **같은 프로젝트·같은 프리랜서 1건.** 재POST는 409. 멱등 키가 같아도 본문이 다르면 409.
   성공 INSERT는 1행. `application_count` +1, `pending_application_count` +1.

3. **수락 순서 (A1).** 의뢰인이 1명을 수락하면 ① `acceptProjectApplication` 성공 ② 나머지
   `PENDING`을 `REJECTED` + `AUTO_OTHER_ACCEPTED` ③ 알림 발행. 순서가 반대면 안 된다.
   C-01 실패 시 거절·알림을 하지 않는다.

4. **C-01 멱등 — 같은 지원인지 먼저** (D-41, PM 규칙 55). 같은 `applicationId`면 200.
   그 다음에 상태 조건을 본다. 다른 지원자가 이미 수락됐거나 `recruitmentStatus`가
   `OPEN`이 아니면 409 (D-29). 화면 문구는 **「다른 지원자가 먼저 수락되었습니다」**.

5. **OPEN이 아닌 생성·수락은 409.** 규칙 1과 같다. 수락은 `OPEN` + `transactionStatus = NONE`만.

6. **수락 1건 · 손잡이.** 프로젝트당 `acceptedApplicationId` 1개 (A4). 성공 후 손잡이는
   `AcceptedApplicationHandoff` (`projectId` · `acceptedApplicationId` ·
   `transactionStatus: "CONTRACT_PENDING"`). 수락 전 `acceptedApplicationId`는 null (A3).
   수락된 행 `ACCEPTED`, `pending_application_count` −1. start 본문에 applicationId를
   다시 싣지 않는다 (A2).

7. **거절 사유 4종.** 의뢰인 개별 거절 `DIRECT`. 수락 부수 `AUTO_OTHER_ACCEPTED`.
   마감 일괄 `AUTO_RECRUITMENT_CLOSED`. 합의 결렬 일괄 `AGREEMENT_DECLINED` (B4).
   거절 시 `pending_application_count` −1. 이미 `REJECTED`인 행은 되살리지 않는다 (B1).

8. **`rejectPendingApplications`** (PM 규칙 57). 입력 `closureEventId` ·
   `reason`(`RECRUITMENT_CLOSED` / `PROJECT_CANCELED`) · `occurredAt`.
   응답 `rejectedCount` · `alreadyProcessed` · `result`(`DONE` / `NOT_NEEDED` / `FAILED`).
   같은 `closureEventId`는 멱등. `PENDING`이 없으면 `NOT_NEEDED`. 실패해도 마감·취소는
   되돌리지 않는다. 재요청을 다시 받을 수 있다 (B2).

9. **API·권한.** `Authorization: Bearer <accessToken>`. 상태 변경 POST는 `Idempotency-Key` 필수.
   생성·내 지원 = 해당 프리랜서. 목록·수락·거절 = 해당 의뢰인. 비당사자 403. 무인증 401.

10. **UX 필수 요소.** 지원하기: 자기소개 · 희망 금액 · 예상기간 · `지원하기`.
    지원자 관리: 지원자 목록 · `수락` · `거절`. 빈 목록 「아직 지원자가 없습니다」.
    내 지원 현황: 프로젝트 · 상태. 삭제된 프로젝트 「의뢰인이 삭제한 프로젝트입니다.」
    수락 전 확인 `수락 확인` · `취소`. 로딩 「불러오는 중」, 실패 「불러오지 못했습니다」,
    수락 409 위 문구. 패널만. 앱 셸 없음.

## 비고

알림 발송·Kakao는 Increment 밖. 재개 후 새 지원은 규칙 1과 같은 `PENDING` (B3).
`application_count`는 잠금에 쓰지 않는다.
