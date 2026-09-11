# applications — 2026-09-11 세션 (조준영)

## 1. 로컬 QA

| 검증 | 결과 |
|---|---|
| `npx tsx features/applications/prototype/run.tsx` | **PASS 97 / FAIL 0** |
| `bumpApplicationCounts` create +1/+1 | `application.service.ts` 호출 있음 |
| DIRECT 거절 pending −1 | 호출 있음 |
| 브라우저/시드 E2E | **미실행** — 로컬 API(`localhost:3000`) 미기동. 별도 `npm run dev`(Supabase) + seed 필요 |

참고: 지시서는 bump 실패 시 throw를 권했지만, 현재 develop 코드는 try/catch로 삼킨다.
지원 INSERT와 건수 갱신의 원자성은 ADR-0015 **R-001**로 남아 있다.

## 2. 문서 갱신

- [waiting-board](../../features/contracts-payments/review/waiting-board-2026-09-10.md) #1 닫음
- [건수 지시서](../../features/applications/review/teamlead-port-instructions-2026-09-10-application-count.md) 상태: 반영 확인
- `features/applications/index.md` changelog

## 3. 신규·잔여 이슈 (우선순위 제안)

| ID | 내용 | 출처 | 제안 |
|---|---|---|---|
| **R-001** | 지원 행↔건수 bump 동일 `$transaction` 미적용 | ADR-0015 | 팀장 결정 후 app 작업 — 오늘 담당 범위면 CR/피드백으로 요청 |
| **A-02 / ADR-0014 §2.3** | 프로필 게이트 RW 보류 | 현황판 #2 | 화면(오민혁) 대기 — **켜지 말 것** |
| **알림 연결** | applications→notifications delivery 어댑터 | ADR-0015 · #112 | develop에 어댑터 있음 — 시드+브라우저로 목록 비어 있지 않은지 스모크 |
| **역할 차단** | CLIENT 지원 생성 403 | ADR-0015 검증 체크리스트 | 브라우저/시드 때 함께 확인 |
| **CR-CP-003** | 멱등 payload | 현황판 #3 | CP 트랙 — 오늘 AP 밖 |

### 바로 이어서 할 일 (추천)

1. `npm run dev`(Supabase) → `seed:dev-accounts` → 의뢰인/프리랜서로 **건수 1/1·CLIENT 403·알림** 스모크  
2. R-001을 오늘 손볼지 팀장에 확인 (트랜잭션 경계는 app/ 팀장 영역)
