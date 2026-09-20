# applications 이식 지시서 — 지원 건수 배선 (2026-09-10)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (applications) |
| 근거 | [CR-AP-001](../change-requests/0001-application-count-write-port.md) |
| 목적 | `bumpApplicationCounts` 포트는 이미 열려 있음. **호출만** 넣으면 됨 |
| **상태 (2026-09-11)** | **app/ 반영 확인 완료** — `createApplication` +1/+1, DIRECT 거절 pending −1. develop 통합본 기준. 트랜잭션 원자성(R-001)은 별도 |

`app/`은 팀장님만 수정합니다. 유동우 쪽 포트·어댑터는 2026-09-09에 끝났습니다.
~~남아 있는 것은 `application.service.ts` 두 줄입니다.~~ → **호출 배선됨.**

---

## 증상

지원이 저장돼도 「지원 N건」이 0이고, `pending_application_count`도 0이라
PM 규칙 15(예산·모집일정 잠금)가 걸리지 않습니다.

## 이미 있는 것 (손대지 마세요)

| 위치 | 상태 |
|---|---|
| `project-contract.service.ts` `bumpApplicationCounts` | 구현됨 (`:542`) |
| `project-application-context.adapter.ts` | delegate 연결됨 (`:53`) |
| `ProjectApplicationContextPort.bumpApplicationCounts` | 타입·주석 있음 (`application.types.ts:367`) |
| `express-app.ts` | `projectApplicationContext` 주입됨 |

## 고칠 곳 — `application.service.ts`만

### 1. 생성 직후 +1/+1

`createApplication` — `insertApplication`·`recordTransition` 다음 (`:458~460` 근처).
지금 주석("CR-AP-001 승인 대기… 포트 미존재")은 **틀렸습니다. 포트를 지우고 아래로 교체**합니다.

```ts
  await deps.repository.insertApplication(row);
  await recordTransition(deps.repository, row, null, nowIso);
  // 성공 INSERT에서만 누적·대기를 올린다 (CR-AP-001 · 규칙 2).
  await deps.projectContext.bumpApplicationCounts(projectId, {
    applicationCount: 1,
    pendingApplicationCount: 1,
  });
  if (idempotencyKey) await deps.repository.setIdempotency(idempotencyKey, bodyHash(parsed), row.applicationId);
```

멱등 200(기존 행 재조회) 경로에는 **부르지 않습니다.**

### 2. DIRECT 신규 거절만 대기 −1

`rejectApplication` — `saveApplication`·`recordTransition` 다음 (`:667~669` 근처).
이미 `REJECTED`인 멱등 200 분기는 그 위에 early-return 하므로 건드리지 않습니다.

```ts
  await deps.repository.saveApplication(rejected);
  await recordTransition(deps.repository, rejected, 'PENDING', nowIso);
  // DIRECT 신규 거절만 대기를 내린다 (CR-AP-001 · 규칙 7). 바닥 0은 포트가 지킨다.
  await deps.projectContext.bumpApplicationCounts(row.projectId, {
    pendingApplicationCount: -1,
  });
```

### 3. 부르면 안 되는 곳

수락·일괄 거절(`rejectPendingApplications`)·마감·취소 — PM이 같은 트랜잭션에서
`pendingApplicationCount: 0`으로 둡니다. 여기서 또 빼면 두 번 빠집니다.
(`application.types.ts:361~362` 주석과 동일)

### 4. 실패 처리

`await` 그대로 두고 **던지게** 해 주세요. 삼키면 지원은 남고 건수만 0인 지금 증상이
다시 납니다. (포트 주석의 "삼킬지 던질지" — 던지는 쪽이 맞습니다.)

### 5. 같이 고쳐 주세요 — 낡은 주석

`application.types.ts` 헤더 `:14~18`과 `application.service.ts` 헤더 `:55~57`이
「포트가 없다」고 적혀 있습니다. 포트는 있습니다. 헤더를 「호출 배선 완료」로
바꿔 주시면 다음 사람이 다시 빼지 않습니다.

---

## 원본 대응

`features/applications/prototype/server/application.service.ts`
- 생성 `:456~460` `saveProject` +1/+1
- DIRECT 거절 `:669~673` `saveProject` pending −1

`run.tsx`에 생성 +1/+1 · 멱등 미증가 · DIRECT −1 · 재거절 미감산 시나리오가 있습니다.
