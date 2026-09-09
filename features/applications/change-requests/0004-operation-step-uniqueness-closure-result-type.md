---
title: "operation 단계 중복 방지와 closure 결과 컬럼 타입 (E-41~E-45 후속)"
status: "제안"
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
| 상태 | 제안 |
| ID | `CR-AP-004` |
| 근거 | 2026-09-08 feedback 항목 1 대조 결과 · applications 규칙 3 |

`app/`은 팀장만 수정한다. applications 쪽에는 고칠 것이 없다 — 원본은 이미 두 불변식을
지키고 있고, 스키마로 옮기는 과정에서 빠진 것을 되돌려 달라는 요청이다.

## 배경

2026-09-08 통합에서 E-41~E-45 다섯 테이블이 신설됐다. 필드 단위로 대조한 결과 원본과
일치하며, `steps` 배열을 자식 테이블로 정규화하고 순서 보존용 `seq`를 추가한 판단에도
동의한다. 아래 두 곳만 원본의 의미가 스키마에 옮겨지지 않았다.

## 변경 1 — `application_operation_steps`에 `(operation_id, name)` 유니크 추가

**현재**

```
@@unique([operationId, seq], name: "uq_operation_step_seq")
```

**원본이 지키던 불변식**

한 operation의 단계는 **이름당 최대 1행**이다. `ACCEPT`는 `REJECT_OTHERS` ·
`CREATE_NOTIFICATIONS` · `ENSURE_NEGOTIATION_CONTEXT` 3개, `REJECT`는
`CREATE_NOTIFICATIONS` 1개로 고정이다 (`application.service.ts:262` `queuedSteps`).
원본에서는 이것이 **구조적으로** 보장됐다 — `saveOperation`이 operation 전체를 받아
`steps` 배열을 통째로 덮어쓰기 때문에(`application.mock.ts:223·226`) 중복이 생길 자리가
없었다.

**왜 `seq` 유니크로는 안 막히는가**

`seq` 유니크는 **`seq`를 단계의 고정 위치로 계산할 때만** 중복을 막는다. 이식하는 쪽이
append의 자연스러운 방식대로 `max(seq) + 1`로 부여하면 같은 이름이 다른 `seq`로 들어가고
유니크는 걸리지 않는다. 원본은 배열 인덱스가 곧 위치였으므로 이 선택지가 없었지만,
테이블에는 있다.

**재시도가 이것을 실제로 밟는다**

`runOperation`은 한 번의 시도에서 `saveOperation`을 **최대 3회** 호출한다 —
시작 시 `RUNNING`(:282), 지원 행이 없으면 `FAILED`(:286), 마지막에 최종 상태(:352).
세 번 모두 `steps`를 포함한 전체 저장이다. 게다가 `attempts: operation.attempts + 1`로
같은 operation을 다시 실행하므로, 시도가 2회면 전체 저장이 최대 6회다.

이것을 `insert`로 옮기면 `ACCEPT` 한 건의 단계가 3행이 아니라 **9행 이상**이 된다.
그러면 규칙 3의 「후속 처리 진행 중」 판정과 `postActionsStatus` 집계가 같은 단계를
여러 번 세게 되고, 화면 문구(규칙 101 「선정은 완료되었으며 후속 처리를 진행 중입니다」)가
끝나지 않는다.

**제안**

`(operation_id, name)` 유니크를 추가한다. `seq` 유니크는 순서 보존용으로 그대로 둔다.
그러면 이식하는 쪽이 `seq`를 어떻게 계산하든 불변식이 DB에서 지켜진다. 저장은
`(operation_id, name)` 기준 upsert가 된다 — 원본의 덮어쓰기와 같은 동작이다.

이 불변식은 `features/applications/spec.md` 규칙 3에 명시해 두었다 (이번 CR과 함께).

## 변경 2 — `application_closures.result`를 `Json` → `varchar(20)`

**현재**

```
result Json
```

**원본**

```ts
export type PostActionResult = "DONE" | "NOT_NEEDED" | "FAILED";   // application.types.ts:18
```

`RejectPendingApplicationsResult.result`는 이 3값 리터럴이다(`:173`). 객체도 배열도 아니다.

**왜 바꿔야 하는가**

- 팀장님이 E-41 주석에 세운 원칙과 어긋난다 — `ApplicationOperation`의 `type`·`status`는
  같은 성격의 리터럴 유니온인데 `varchar`로 두었다. `result`만 `Json`일 이유가 없다.
- `Json`은 DB가 값을 검증하지 못한다. `"DONE"`·`{"result":"DONE"}`·`null`이 전부 들어간다.
- 마감 멱등 재조회가 문자열 비교여야 하는데 JSON 추출을 거친다. `application_closures`는
  같은 `closure_event_id`로 다시 들어온 마감·취소에 **최초 결과를 그대로 돌려주는** 것이
  유일한 용도이므로(규칙 8), 비교가 정확해야 한다.

**제안**

`varchar(20)`으로 바꾼다. `PostActionResult`가 3값이므로 20자면 충분하다.

## 영향 범위

- `docs/domain/erd.md` E-43(`application_operation_steps`) · E-45(`application_closures`)
- `app/server/prisma/schema.prisma` 같은 두 모델 (팀장 이식)
- 마이그레이션 — 두 테이블 모두 **아직 데이터가 없다**. `app/server/src/features/applications/`에
  operation·closure를 쓰는 코드가 없어 빈 테이블이므로, 유니크 추가도 타입 변경도
  기존 행 정리 없이 끝난다. 지금이 가장 싼 시점이다.
- applications — 고칠 것 없음. 원본은 두 불변식을 이미 지킨다. `run.tsx` PASS 97 / FAIL 0
- 다른 기능 — 없음. 두 테이블은 applications 전용이다

## 확인 질문

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| A1 | `(operation_id, name)` 유니크를 추가하는 것이 맞는가 | | | |
| A2 | `seq` 유니크를 함께 남기는 것이 맞는가 (순서 보존) | | | |
| A3 | `application_closures.result`를 `varchar(20)`으로 바꾸는 것이 맞는가 | | | |
| A4 | 멱등 키 길이를 `varchar(160)`으로 통일하는가 (`CR-CP-002`는 120으로 제안) | | | |

## 대안으로 검토했던 것

- **`steps`를 `Json` 컬럼 하나로 되돌린다.** 원본 배열과 가장 가깝고 중복이 원천적으로
  불가능하다. 그러나 단계별 조회·집계가 안 되고, 팀장님이 정규화한 의도(단계 상태를
  DB에서 직접 보기)를 되돌린다. 기각.
- **유니크 없이 이식 코드에서 upsert 규약으로만 지킨다.** 지금 코드가 없으므로 규약을
  적어 둘 대상도 없다. 나중에 다른 사람이 이식하면 규약이 전달되지 않는다. DB가 막는 편이
  싸다. 기각.
- **`result`를 Prisma enum으로 만든다.** 값 검증은 되지만 팀장님이 리터럴 유니온에
  `varchar`를 쓰기로 한 판단과 어긋나고, 값이 늘 때 마이그레이션이 필요하다. 기각 —
  `varchar(20)`이 기존 원칙과 맞다.
- **`application_closures`에 `project_id`·`reason`도 함께 넣는다.** 필요하지만 이 CR과
  성격이 다르다. 원본 스토어도 결과만 저장하므로 **내 설계에서 온 것**이고, 규칙 8의
  마감·취소 구분 근거를 남기는 문제로 따로 정리한다. 이번 범위에서 제외.
