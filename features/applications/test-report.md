# applications 테스트 결과

담당자: 조준영            테스트 날짜: 2026-09-03
테스트한 커밋: 이 커밋 (`run.tsx` 포함)

## 자동 검증

- [x] `npx tsx prototype/run.tsx` 통과 (PASS 개수: 31, FAIL 개수: 0)

## spec.md 규칙별 확인

| spec 규칙 번호 | 어떻게 확인했나 | 결과 |
|---|---|---|
| 1 OPEN만 생성 | `run.tsx` OPEN 작성 · 마감 거부 | 통과 |
| 2 프리랜서 1건 | 같은 키 멱등 200 · 다른 본문 409 | 통과 |
| 3 수락 순서 | 수락 후 잔여 `AUTO_OTHER_ACCEPTED` · ACCEPTED 발행. C-01 실패 시 PENDING 유지·알림 없음 | 통과 |
| 4 C-01 멱등 | 같은 지원 재시도 200 · 다른 지원 409 | 통과 |
| 5 OPEN 아닌 생성·수락 | CLOSED 수락 409 · SCHEDULED 생성 409 | 통과 |
| 6 손잡이 | `CONTRACT_PENDING` + acceptedApplicationId · pending 0 | 통과 |
| 7 거절 4종 | 개별 거절 `DIRECT`. 일괄은 규칙 8 | 통과 |
| 8 일괄 거절 | DONE 멱등 · PENDING 없으면 NOT_NEEDED | 통과 |
| 9 API·권한 | 401 · 의뢰인 생성 403 · 비의뢰인 목록 403 · 404 | 통과 |
| 10 UX | 필수 요소·로딩·실패·409 문구. 원시 hex 없음 | 통과 |

## ux-philosophy.md §6 자체 점검

| 검증 항목 | 이 화면에서 어떻게 충족하는가 |
|---|---|
| 상태 이해 | 지원하기·대기·이미 수락됨 배지와 상태 문장으로 다음 행동을 적었다 |
| 근거 이해 | 수락 409는 「다른 지원자가 먼저 수락되었습니다」만 쓴다. 금액은 지원자가 넣은 값 |
| 작업 보호 | 멱등 키로 같은 본문 재전송을 유지한다. 입력 복구는 Mock 범위 밖 |
| 복구 가능성 | 불러오지 못했습니다 + 다시 시도. 409 후 목록을 다시 보라는 안내 |
| 선택권 | 의뢰인이 수락 또는 거절을 고른다. 추천 강제 없음 |
| 비파괴성 | 수락은 되돌릴 수 없다고 관리 화면에 적었다 |
| 접근 가능성 | label/htmlFor, role=alert/status. 원시 색상값 없음. 확대 실측은 안 함 |

## 아직 안 되는 것 (Known Issues)

- `prototype/`은 HTTP·DB 없는 Mock이다. `application.repository.ts`는 호출하면 not implemented다.
- 알림은 배열에만 쌓는다. 발송은 notifications.
- `app/` 미통합. 통합 요청: `review/teamlead-public-api-panels-2026-09-03.md`.
  C-01 실제 HTTP는 유동우 포트 Mock이다. 실패 시 거절·알림 금지는 Mock만 검증.

## 팀장에게 물어봐야 하는 것

- `app/` 통합 시점. 조준영은 `features/applications/` DoD만 닫는다.
  요청 전문: `review/teamlead-public-api-panels-2026-09-03.md`.
