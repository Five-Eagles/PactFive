# applications 테스트 결과

담당자: 조준영            테스트 날짜: 2026-09-07
테스트한 커밋: 커밋 전 (CR-0002 Mock: eligibility·202/outbox·GAP-01 NULL·페이지)

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 97, FAIL 개수: 0)

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 OPEN만 생성 | `run.tsx` OPEN 작성 · 마감 거부 | 통과 |
| 1 입력 범위 | 동기 99/100/3000/3001 · 금액 9999/1만/10억/+1 · 기간 0/1/365/366/1.5 · 공백 · 금지 필드 | 통과 |
| 1 프로필 게이트 | eligibility COMPLETE/INCOMPLETE · 미완성 409 · 포트 없음·UNAVAILABLE 503 | 통과 |
| 2 프리랜서 1건 | 같은 키 멱등 200 · 다른 본문 409 · 생성 +1/+1 · 멱등 미증가 | 통과 |
| 3 수락 순서 | 기본 drain 200 + 잔여 `AUTO_OTHER_ACCEPTED`. C-01 실패 시 PENDING 유지. holdOutbox 202→drain 200 | 통과 |
| 4 C-01 멱등 | 같은 지원 재시도 200 · 다른 지원 409 | 통과 |
| 5 OPEN 아닌 생성·수락 | CLOSED 수락 409 · SCHEDULED 생성 409 | 통과 |
| 6 손잡이 | `CONTRACT_PENDING` + acceptedApplicationId · C-01 스탠드인 pending 0 | 통과 |
| 7 거절 4종 | 개별 거절 `DIRECT` · 대기 0 · 멱등 재차감 없음. 일괄은 규칙 8 | 통과 |
| 8 일괄 거절 | DONE 멱등 · NOT_NEEDED · 취소 `rejectionType` null · 이미 REJECTED 유지 | 통과 |
| 9 API·권한 | 401 · 403 · 404 · 단건 GET · 페이지 메타 · operation 비의뢰인 404 | 통과 |
| 10 UX | 제출 확인 · 프로필 잠금 · 후속 처리 · 취소됨 · 완료됨 `/reviews`. hex 없음 | 통과 |

## ux-philosophy.md §6 자체 점검

| 검증 항목 | 이 화면에서 어떻게 충족하는가 |
|---|---|
| 상태 이해 | 검토 중·선정됨·미선정·완료됨·취소됨·후속 처리 배지와 다음 행동 문장 |
| 근거 이해 | 수락 409는 「다른 지원자가 먼저 수락되었습니다」. 거절 4종·취소 안내만 |
| 작업 보호 | 제출·수락·거절은 확인 뒤. 프로필 미완성은 폼 잠금. 멱등 키 유지 |
| 복구 가능성 | 불러오지 못했습니다 + 다시 시도. 202 후속은 operation 조회로 이어짐 |
| 선택권 | 의뢰인이 수락 또는 거절. 추천 강제 없음 |
| 비파괴성 | 제출 `제출하기`/`그만두기`, 수락 `수락 확인`/`취소`. 거절은 되돌릴 수 없음 |
| 접근 가능성 | label/htmlFor, role=alert/status. 원시 색상값 없음. 확대 실측은 안 함 |

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 HTTP·DB 없는 Mock이다. `application.repository.ts`는 호출하면 not implemented다.
- 알림은 배열에만 쌓는다. 발송은 notifications. 실 outbox worker·스케줄러는 팀장.
- `app/` 미통합. 통합 요청: `review/teamlead-public-api-panels-2026-09-03.md`.
  C-01 실제 HTTP는 유동우 포트 Mock이다. 지원 건수 `app/` 쓰기 포트는 CR-AP-001.
  CR-0002는 Mock만 반영중. `docs/domain/erd.md` CHECK·이력 테이블은 미확정.

## 팀장에게 물어봐야 하는 것

- `app/` 통합 시점. 조준영은 `features/applications/` DoD만 닫는다.
  요청 전문: `review/teamlead-public-api-panels-2026-09-03.md`.
  CR-0002는 Mock만. 공개 경로 유지. `app/` 이식 금지.
