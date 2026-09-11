# applications — 2026-09-11 세션 (조준영)

## 1. 로컬 QA

| 검증 | 결과 |
|---|---|
| `npx tsx features/applications/prototype/run.tsx` | **PASS 97 / FAIL 0** |
| `bumpApplicationCounts` create +1/+1 | `application.service.ts` 호출 있음 |
| DIRECT 거절 pending −1 | 호출 있음 |
| `npm run seed:dev-accounts` | **성공** (10계정 재사용) |
| API 스모크 (`applications-api-smoke.json`) | **5 PASS / 0 FAIL** (시드 가드·Idempotency-Key 수정 후) |

### API 스모크 상세 (서버 기동·시드 후)

| 케이스 | 결과 |
|---|---|
| recruiting OPEN + counts 1/1 | PASS |
| 목록이 시드 프리랜서와 일치 | PASS (items=1) |
| CLIENT 지원 POST | PASS **403** |
| 프리랜서 `/applications/me` | PASS |
| CLOSED 누적 건수 ≥1 | PASS (`applicationCount=1`) |

R-001 원인·조치: [applications-r001.md](./applications-r001.md)

## 2. 문서 갱신

- [waiting-board](../../features/contracts-payments/review/waiting-board-2026-09-10.md) #1 닫음
- [건수 지시서](../../features/applications/review/teamlead-port-instructions-2026-09-10-application-count.md) 상태: 반영 확인
- `features/applications/index.md` changelog

## 3. 신규·잔여 이슈 (우선순위)

| ID | 내용 | 출처 | 제안 |
|---|---|---|---|
| **R-001** | 지원 행↔건수 bump 동일 `$transaction` 미적용 + 실측 drift | ADR-0015 · 오늘 스모크 | **다음 app 작업 후보** |
| **CLOSED 건수 0** | 마감 시나리오 누적 건수 미유지 | 오늘 스모크 FAIL | 시드·스윕·표시 경로 추적 |
| **알림 items=0** | delivery 연결됐으나 목록 비어 있음 | ADR-0015 | 사건 발행 여부 추가 확인 |
| **A-02 / ADR-0014 §2.3** | 프로필 게이트 RW 보류 | 현황판 #2 | 화면 대기 — **켜지 말 것** |
| **CR-CP-003** | 멱등 payload | 현황판 #3 | CP 트랙 |

### 다음 액션

1. R-001 + CLOSED 건수 0 을 팀장/app 트랙으로 올릴지 결정  
2. 알림 0건은 notifications 어댑터 호출 로그로 추가 확인  
3. 프로필 게이트는 계속 보류
