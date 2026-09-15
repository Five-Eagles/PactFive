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

캐시(규칙 56 분담, CR-AP-001): `projects.application_count`(누적, 표시용, 올라가기만 함),
`projects.pending_application_count`(PENDING만, 잠금용). 생성 +1/+1 · `DIRECT` −1은
applications. 수락·마감·취소의 대기는 PM이 0. `AUTO_*`에서 applications는 빼지 않는다.
원본과 어긋나면 원본이 옳다.

유동우: `acceptProjectApplication` — `recruitmentStatus → CLOSED`,
`transactionStatus → CONTRACT_PENDING`, `acceptedApplicationId`.
모집 상태 읽기 (`OPEN`만 생성·수락). 프로젝트 조각(`clientId` ·
`recruitmentStatus` · `transactionStatus` · `acceptedApplicationId`)은 PM 정본이다.
Mock은 같은 저장소에서 동기 조회하고, app/은 `ProjectApplicationContextPort`로
비동기 읽기만 한다. 권한(규칙 9)·OPEN(규칙 5)의 판정 입력은 같다.
받는 `recruitmentStatus`는 **PM 규칙 14의 조회 시점 보정값**이어야 한다 (CR-AP-003) —
저장값을 그대로 받으면 모집이 시작된 예약 프로젝트에 지원할 수 없다.

알림: `APPLICATION_SUBMITTED` · `APPLICATION_ACCEPTED` · `APPLICATION_REJECTED` ·
`APPLICATION_AUTO_REJECTED`를 포트에 쌓기만 한다. 발송은 notifications.

## 규칙

번호는 `api-contract.md`·`prototype/`에서 "규칙 N"으로 참조한다.

1. **생성은 `recruitmentStatus = OPEN`만** (D-46). 프리랜서. 본문은 `coverLetter` ·
   `expectedAmount` · `expectedDurationDays`만. `freelancerId`·`status`·첨부가 있으면
   거부(`VALIDATION_ERROR`). 자기소개는 공백 제거·LF 정규화 후 100~3,000자(공백뿐이면
   거부). 금액 10,000~1,000,000,000 정수. 기간 1~365 정수. 예산보다 높은 금액은 허용.
   프로필은 `getProfileCompletion` 포트로 재검증. INCOMPLETE면 409, 포트 없음·UNAVAILABLE이면
   503. COMPLETE 우회 금지. `SCHEDULED`·`CLOSED`·없으면 409/404.

2. **같은 프로젝트·같은 프리랜서 1건.** 재POST는 409. 멱등 키가 같아도 본문이 다르면 409.
   성공 INSERT는 1행. 그때만 `application_count` +1, `pending_application_count` +1.
   멱등 200(기존 행)은 올리지 않는다.

3. **수락 순서 (A1).** 의뢰인이 1명을 수락하면 ① `acceptProjectApplication` 성공 ② 나머지
   `PENDING`을 `REJECTED` + `AUTO_OTHER_ACCEPTED` ③ 알림 발행. 순서가 반대면 안 된다.
   C-01 실패 시 거절·알림을 하지 않는다. ②③은 인메모리 outbox. 기본 Mock은 같은 틱에서
   drain해 200. `holdOutbox`면 202. 실패해도 ACCEPTED는 롤백하지 않는다.
   **한 operation의 단계는 이름당 최대 1행이다** — `ACCEPT`는 `REJECT_OTHERS` ·
   `CREATE_NOTIFICATIONS` · `ENSURE_NEGOTIATION_CONTEXT` 3개, `REJECT`는
   `CREATE_NOTIFICATIONS` 1개로 고정이고 재시도해도 늘지 않는다. 저장은 덮어쓰기이며
   append가 아니다 (CR-AP-004).

4. **C-01 멱등 — 같은 지원인지 먼저** (D-41, PM 규칙 55). 같은 `applicationId`면 200.
   그 다음에 상태 조건을 본다. 다른 지원자가 이미 수락됐거나 `recruitmentStatus`가
   `OPEN`이 아니면 409 (D-29). 화면 문구는 **「다른 지원자가 먼저 수락되었습니다」**.

5. **OPEN이 아닌 생성·수락은 409.** 규칙 1과 같다. 수락은 `OPEN` + `transactionStatus = NONE`만.

6. **수락 1건 · 손잡이.** 프로젝트당 `acceptedApplicationId` 1개 (A4). 성공 후 손잡이는
   `AcceptedApplicationHandoff` (`projectId` · `acceptedApplicationId` ·
   `transactionStatus: "CONTRACT_PENDING"`). 수락 전 `acceptedApplicationId`는 null (A3).
   수락된 행 `ACCEPTED`. 대기 건수는 PM `acceptProjectApplication`이 0으로 둔다.
   applications는 `AUTO_OTHER_ACCEPTED`에서 카운트를 빼지 않는다. start 본문에
   applicationId를 다시 싣지 않는다 (A2).

7. **거절 사유 4종.** 의뢰인 개별 거절 `DIRECT`. 수락 부수 `AUTO_OTHER_ACCEPTED`.
   마감 일괄 `AUTO_RECRUITMENT_CLOSED`. 합의 결렬 일괄 `AGREEMENT_DECLINED` (B4).
   `DIRECT`로 새로 거절한 경우만 `pending_application_count` −1 (바닥 0).
   `AUTO_*`와 이미 `REJECTED` 멱등 200은 빼지 않는다 (B1).

8. **`rejectPendingApplications`** (PM 규칙 57). 입력 `closureEventId` ·
   `reason`(`RECRUITMENT_CLOSED` / `PROJECT_CANCELED`) · `occurredAt`.
   응답 `rejectedCount` · `alreadyProcessed` · `result`(`DONE` / `NOT_NEEDED` / `FAILED`).
   같은 `closureEventId`는 멱등. `PENDING`이 없으면 `NOT_NEEDED`. 행만 거절하고
   대기 건수는 PM이 호출 뒤 0으로 둔다. 마감은 `AUTO_RECRUITMENT_CLOSED`. 취소(GAP-01
   Mock)는 `rejectionType=null`. 이미 `REJECTED`는 덮지 않는다. 실패해도 마감·취소를
   되돌리지 않는다 (B2).

9. **API·권한.** `Authorization: Bearer <accessToken>`. 상태 변경 POST는 `Idempotency-Key` 필수.
   생성·내 지원·eligibility = 해당 프리랜서. 목록·수락·거절·operation = 해당 의뢰인.
   단건 GET은 본인 또는 해당 의뢰인, 그 외 404. 비당사자 목록 403. 무인증 401.
   공개 경로는 `/api/v1/applications/me` · `/:id/accept|reject` 유지.

10. **UX 필수 요소.** 지원하기: 자기소개 · 희망 금액 · 예상기간 · `지원하기`.
    제출 확인 제목 `지원서를 제출할까요?` · `제출 후에는 수정하거나 철회할 수 없습니다.`
    · `제출하기` / `그만두기` · 금액·기간 재표시. 프로필 미완성은 폼 잠금.
    지원자 관리: 지원자 목록 · `수락` · `거절`. 거절 확인: 되돌릴 수 없음.
    수락 후속 미완료 「선정은 완료되었으며 후속 처리를 진행 중입니다」.
    빈 목록 「아직 지원자가 없습니다」. 내 지원: PENDING `검토 중` · ACCEPTED `선정됨`
    · REJECTED `미선정` + 거절 4종. `ACCEPTED` ∧ `COMPLETED`만 「완료됨」→
    `/projects/:projectId/reviews`. 삭제 「의뢰인이 삭제한 프로젝트입니다.」
    취소 「프로젝트가 취소되었습니다.」 수락 확인 · `취소`. 409 위 문구.
    로딩 「불러오는 중」, 실패 「불러오지 못했습니다」. 패널만. 앱 셸 없음.

## 비고

알림 발송·Kakao는 Increment 밖. 재개 후 새 지원은 규칙 1과 같은 `PENDING` (B3).
`application_count`는 잠금에 쓰지 않는다.
