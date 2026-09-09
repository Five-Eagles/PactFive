---
title: "closure 결과 컬럼이 객체를 담고 있다 · operation 단계 유니크 (E-41~E-45 후속)"
status: "반영 완료"
requested_by: "조준영 (applications)"
date: "2026-09-09"
affected_docs: [docs/domain/erd.md, app/server/prisma/schema.prisma]
affected_features: [applications]
---

# 변경 검토요청서 — operation 단계 유니크 · closure 결과 타입 (CR-AP-004)

| | |
|---|---|
| 받는 사람 | 팀장 |
| 보내는 사람 | 조준영 (applications) |
| 날짜 | 2026-09-09 |
| 상태 | **반영 완료 (2026-09-09, 팀장).** 변경 2는 #195(같은 날 앞선 단위)에서, 변경 1은
| ID | `CR-AP-004` |
| 근거 | 2026-09-08 feedback 항목 1 대조 결과 · applications 규칙 3 |

> **닫음 (2026-09-09, 팀장).** A1~A5 확인 질문에 전부 답한다.
>
> - **A1(예)** — `setClosure`가 `result.result`를 넣도록 이미 고쳤다(#195,
>   `prisma-application.repository.ts` create·update 두 분기).
> - **A2(예)** — `application_closures.result`를 `varchar(20)`으로 바꿨다(#195,
>   마이그레이션 `20260909090000_application_closures_result_scalar`). 기존 행에 객체가
>   들어가 있을 수 있어 타입 변경 전 스칼라 추출 UPDATE를 먼저 실행하는 순서를 지켰다.
> - **A3(예)** — `application_operation_steps`에 `UNIQUE(operation_id, name)`을
>   추가했다(`uq_operation_step_name`, 마이그레이션
>   `20260909130000_application_operation_step_name_unique`). 코드 변경은 없다 — CR 본문
>   그대로 방어용 제약만 추가했다.
> - **A4(예)** — `seq` 유니크(`uq_operation_step_seq`)는 순서 보존용으로 그대로 뒀다.
> - **A5(아니오, 통일하지 않는다)** — `application_idempotency_keys.key`는 `varchar(160)`
>   그대로 둔다. `CR-CP-002`가 제안한 `payment_idempotency_records.idempotency_key
>   varchar(120)`는 별개 기능(contracts-payments)의 별개 테이블이다. 기존 스키마에도
>   `project_contract_idempotency_records.idempotency_key varchar(100)`·
>   `notifications.dedupe_key varchar(120)`처럼 테이블마다 길이가 다르다 — 이미 통일돼
>   있지 않았고, 통일해야 할 기술적 이유(예: 같은 컬럼에 조인·비교)도 없다. 각 테이블은
>   자신의 실제 키 생성 규칙에 맞는 길이만 지키면 된다.
>
> `application_operation_steps`·`application_closures` ERD 표(`docs/domain/erd.md`,
> `erd-v1.4.dbml`)도 함께 갱신했다 — `result` 행이 그동안 `jsonb`로 남아 있었다(#195에서
> 스키마는 고쳤지만 이 문서 표를 갱신하지 않았다).
>
> 확인 — `app/server` tsc는 새 스키마 컬럼·모델 반영 전이라 당장은 통과하지 않는다
> (`prisma generate` 재실행 필요, 아래 CR-CP-002 닫음 메모와 같은 사유). `applications`
> 코드 변경은 없으므로 그쪽 검증에는 영향이 없다.
>
> 아래는 제기 당시 기록이다.

`app/`은 팀장만 수정한다. applications 쪽에는 고칠 것이 없다 — 원본은 이미 두 불변식을
지키고 있고, 스키마로 옮기는 과정에서 빠진 것을 되돌려 달라는 요청이다.

## 배경

2026-09-08 통합에서 E-41~E-45 다섯 테이블이 신설됐다. 필드 단위로 대조한 결과 원본과
일치하며, `steps` 배열을 자식 테이블로 정규화하고 순서 보존용 `seq`를 추가한 판단에도
동의한다. 아래 두 곳만 원본의 의미가 스키마에 옮겨지지 않았다.

**2026-09-09 정정.** 첫 판은 「`app/`에 operation·closure를 쓰는 코드가 없다」는 잘못된
전제 위에 있었다. 이식은 이미 끝나 있다(`prisma-application.repository.ts`). 그 전제를
바로잡으면서 두 항목의 성격이 뒤바뀌었다.

- **변경 2가 실제 결함이 됐다** — `setClosure`가 스칼라 컬럼에 객체를 넣고 있고, 마감·취소
  멱등 재진입에서 깨진 값이 나간다. **먼저 고쳐야 한다.**
- **변경 1은 결함이 아니다** — 현재 이식본이 불변식을 지키고 있다. 제약은 구현이 바뀔 때를
  위한 방어이며 급하지 않다.

## 변경 1 — `application_operation_steps`에 `(operation_id, name)` 유니크 추가

**현재**

```
@@unique([operationId, seq], name: "uq_operation_step_seq")
```

**불변식** — 한 operation의 단계는 **이름당 최대 1행**이다. `ACCEPT`는 `REJECT_OTHERS` ·
`CREATE_NOTIFICATIONS` · `ENSURE_NEGOTIATION_CONTEXT` 3개, `REJECT`는
`CREATE_NOTIFICATIONS` 1개로 고정이다 (`application.service.ts:262` `queuedSteps`).
원본에서는 `saveOperation`이 `steps` 배열을 통째로 덮어써서 구조적으로 보장됐다
(`application.mock.ts:223·226`). `spec.md` 규칙 3에 이번 CR과 함께 명시해 두었다.

**현재 이식본도 이 불변식을 지키고 있다** — `seq`를 배열 인덱스로 주고(`seq: index`),
`deleteMany` + `create`를 하나의 `upsert` 호출 안에서 처리한다
(`prisma-application.repository.ts:176~185`). Prisma가 중첩 쓰기를 한 트랜잭션으로 묶으므로
중복이 생기지 않고, 파일 주석(`:31~36`)도 그 의도를 밝혀 두었다.

**그래도 유니크를 요청하는 이유 — 지금은 결함이 아니라 방어다**

불변식이 **스키마가 아니라 리포지토리 구현 한 곳에 의존해 있다.** `seq` 유니크는 `seq`를
고정 위치로 계산할 때만 중복을 막는다. 나중에 누가 성능을 이유로 `deleteMany`를 없애고
바뀐 단계만 갱신하도록 고치면서 `seq`를 `max(seq) + 1`로 부여하면, 같은 이름이 다른 `seq`로
들어가고 유니크는 걸리지 않는다. 그 형태로 깨지면 `ACCEPT` 한 건의 단계가 3행이 아니라
여러 행이 되어 규칙 3의 후속 처리 판정과 `postActionsStatus` 집계가 같은 단계를 여러 번
세고, 화면 문구(「선정은 완료되었으며 후속 처리를 진행 중입니다」)가 끝나지 않는다.

즉 **지금 고쳐야 하는 결함은 아니다.** 우선순위는 변경 2보다 낮다. 다만 제약을 걸어 두면
불변식이 구현 방식과 무관해지고, 원본이 배열로 공짜로 얻던 보장을 테이블에서도 얻는다.

**제안** — `(operation_id, name)` 유니크를 추가하고 `seq` 유니크는 순서 보존용으로 그대로
둔다. 현재 구현은 이 제약 아래에서 그대로 동작하므로 **코드 변경 없이 제약만 추가하면
된다.**

## 변경 2 — `result` 컬럼이 객체를 담고 있다 (결함, 우선)

`PostActionResult`는 3값 리터럴이다 — `"DONE" | "NOT_NEEDED" | "FAILED"`
(`application.types.ts:18`). 객체도 배열도 아니다. 그런데 컬럼이 `Json`이고, 이식본은
스칼라 자리에 **결과 객체 전체**를 넣는다.

```ts
// prisma-application.repository.ts:118~131 (create·update 두 분기 동일)
      rejectedCount: result.rejectedCount,
      alreadyProcessed: result.alreadyProcessed,
      result: result as unknown as Prisma.InputJsonValue,   // ← result.result 이어야 한다
```

스키마는 `RejectPendingApplicationsResult`를 세 컬럼으로 풀어 놓았으므로 `result`에는
`result.result`(= `"DONE"`)가 들어가야 한다. 지금은
`{"rejectedCount":3,"alreadyProcessed":false,"result":"DONE"}`가 저장된다.

읽는 쪽은 그것을 다시 스칼라로 캐스팅한다.

```ts
// prisma-application.repository.ts:108~115
return {
  rejectedCount: row.rejectedCount,
  alreadyProcessed: row.alreadyProcessed,
  result: row.result as RejectPendingApplicationsResult['result'],   // 객체를 문자열로 캐스팅
};
```

**증상** — 같은 `closure_event_id`로 마감·취소가 재진입하면(멱등 경로, 규칙 8)
`result`가 `"DONE"`이 아니라 중첩 객체로 나간다. 이 포트는 project-management가
프로젝트 마감·취소 때 호출한다(`applications-port.adapter.ts:29`
`rejectPendingApplications`). 최초 호출은 메모리의 값을 그대로 반환하므로 정상이고,
**재진입에서만** 어긋난다 — 그래서 지금까지 드러나지 않았다.

**`varchar(20)`이면 이 결함이 애초에 컴파일되지 않는다.** Prisma가 `result`를 `string`으로
타이핑하므로 객체를 넣으려면 `as unknown as`로 두 번 우회해야 한다. `Json`은
`InputJsonValue`가 객체를 정상적으로 받아들여 한 번의 캐스팅으로 통과했다. 타입을 좁히는
것이 곧 이 부류의 결함을 막는 장치다. 팀장님이 `type`·`status`에 `varchar`를 쓴 판단과도
같은 방향이다 — `result`만 `Json`일 이유가 없다.

**제안**

`varchar(20)`으로 바꾸고, `setClosure`가 `result.result`를 넣도록 함께 고친다. 컬럼만
바꾸면 위 이식 코드가 컴파일되지 않으므로 두 변경은 같이 가야 한다.

```ts
// prisma-application.repository.ts — create·update 두 분기 모두
result: result.result,
```

`getClosure`의 캐스팅도 지운다 — `row.result`가 이미 `string`이므로 도메인 리터럴로
좁히는 캐스팅만 남기면 된다.

## 영향 범위

- `docs/domain/erd.md` E-43(`application_operation_steps`) · E-45(`application_closures`)
- `app/server/prisma/schema.prisma` 같은 두 모델 (팀장 이식)
- `app/server/src/features/applications/prisma-application.repository.ts` —
  `setClosure` 2곳(`:125`·`:130`), `getClosure` 1곳(`:114`)
- applications — 고칠 것 없음. 원본은 두 불변식을 이미 지킨다. `run.tsx` PASS 97 / FAIL 0
- 다른 기능 — 없음. 두 테이블은 applications 전용이다

## 마이그레이션 (2026-09-09 정정 — 첫 판의 「빈 테이블」 주장은 틀렸다)

첫 판에서 나는 두 테이블에 데이터가 없어 마이그레이션이 공짜라고 적었다. 근거로 든
「`app/`에 쓰는 코드가 없다」가 사실이 아니므로 **그 주장을 철회한다.** 배포 환경에서
수락·거절·마감이 한 번이라도 돌았다면 행이 있다. 실제 DB 상태는 내가 확인할 수 없다.

- **`(operation_id, name)` 유니크** — 추가 전에 중복 확인이 필요하다. 현재 구현이 한
  트랜잭션에서 전량 삭제 후 재삽입하므로 중복이 없을 것으로 보지만, 제약 추가는 중복이
  하나라도 있으면 실패한다.

  ```sql
  SELECT operation_id, name, COUNT(*) FROM application_operation_steps
  GROUP BY operation_id, name HAVING COUNT(*) > 1;
  ```

- **`result` 컬럼 타입 변경** — 기존 행에는 위 결함으로 **객체가 들어가 있다.**
  `varchar`로 바꾸기 전에 중첩된 값을 꺼내야 한다.

  ```sql
  -- 객체로 저장된 행에서 스칼라만 남긴다
  UPDATE application_closures
     SET result = result -> 'result'
   WHERE jsonb_typeof(result::jsonb) = 'object';
  ```

  그 다음 타입을 바꾼다. 순서를 바꾸면 `{"rejectedCount":...}` 전체가 문자열로 들어가
  20자를 넘긴다.

## 확인 질문

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| A1 | `setClosure`가 `result.result`를 넣도록 고치는 것이 맞는가 (**결함, 우선**) | 예 | | #195에서 반영 |
| A2 | `application_closures.result`를 `varchar(20)`으로 바꾸는 것이 맞는가 | 예 | | #195에서 반영 |
| A3 | `(operation_id, name)` 유니크를 추가하는 것이 맞는가 (방어, 급하지 않음) | 예 | | #202에서 반영 |
| A4 | `seq` 유니크를 함께 남기는 것이 맞는가 (순서 보존) | 예 | | 그대로 유지 |
| A5 | 멱등 키 길이를 `varchar(160)`으로 통일하는가 (`CR-CP-002`는 120으로 제안) | | 아니오 | 서로 다른 테이블 — 통일 불필요 |

## 대안으로 검토했던 것

- **`steps`를 `Json` 컬럼 하나로 되돌린다.** 원본 배열과 가장 가깝고 중복이 원천적으로
  불가능하다. 그러나 단계별 조회·집계가 안 되고, 팀장님이 정규화한 의도(단계 상태를
  DB에서 직접 보기)를 되돌린다. 기각.
- **유니크 없이 이식 코드의 규약으로만 지킨다.** 지금 이식본은 실제로 이 규약을 지키고
  있고(전량 삭제 후 재삽입), 파일 주석에도 적혀 있다. 그래서 이 안은 **현재로서는
  성립한다** — 변경 1의 우선순위를 낮춘 이유다. 다만 불변식이 구현 한 곳에만 있으면
  다음 사람이 성능 최적화로 그 방식을 바꿀 때 함께 사라진다. 제약 추가는 코드 변경이
  필요 없으므로 걸어 두는 편이 싸다.
- **`result`를 Prisma enum으로 만든다.** 값 검증은 되지만 팀장님이 리터럴 유니온에
  `varchar`를 쓰기로 한 판단과 어긋나고, 값이 늘 때 마이그레이션이 필요하다. 기각 —
  `varchar(20)`이 기존 원칙과 맞다.
- **`application_closures`에 `project_id`·`reason`도 함께 넣는다.** 필요하지만 이 CR과
  성격이 다르다. 원본 스토어도 결과만 저장하므로 **내 설계에서 온 것**이고, 규칙 8의
  마감·취소 구분 근거를 남기는 문제로 따로 정리한다. 이번 범위에서 제외.
