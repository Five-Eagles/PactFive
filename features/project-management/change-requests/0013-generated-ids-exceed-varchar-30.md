# CR-0013 — 서버가 만드는 id 가 스키마 varchar(30) 을 6자 넘는다

| | |
|---|---|
| 제기 | 유동우 (project-management) · 2026-09-09 |
| 대상 | 김락원 (팀장 · `docs/domain/` · `app/server/prisma/schema.prisma`) |
| 상태 | **반영 완료 (2026-09-09, 팀장 — 컬럼 늘리기 채택, B안).** |
| 관련 | notifications CR-0001 §5 (같은 문제를 `User.id` 에서 지적) · `app/server/src/express-app.ts:196` |

> **닫음 (2026-09-09, 팀장).** 제안대로 컬럼을 늘렸다 — id 줄이기는 하지 않았다.
>
> **전수 조사 결과, 세 곳이 아니라 훨씬 넓었다.** `express-app.ts`의 `randomId()`뿐 아니라
> `contractsPaymentsRandomId(prefix)`(agr_·ctr_·dlv_·ofr_·pay_)와 각 기능의
> `prisma-*.repository.ts`에 흩어진 개별 `randomUUID()` 호출(app_·appop_·aos_·apse_·rvw_·
> nof_·csa_·usr_·ses_)까지 전부 같은 "접두어 + UUID32" 패턴을 쓴다. 가장 긴 값은
> `ApplicationOperation.id`의 `appop_` + 32자 = **38자**다. 그래서 36이 아니라
> **40자**로 넉넉히 잡았다 — PK뿐 아니라 그 id를 받는 모든 FK 컬럼(`project_id`,
> `application_id` 등)도 같은 폭으로 함께 늘렸다. 총 70개 컬럼, 30개 테이블 전부.
>
> **컬럼 폭을 지정하지 않은 예외 2건.** `application_closures.closure_event_id`는
> project-management가 `close-${projectId}-${at}`로 직접 조립하는 합성 문자열이고,
> `invalidations.cancellation_id`는 클라이언트가 그대로 넘기는 값이라 길이를 예측할 수
> 없다 — 둘 다 40자가 아니라 이 스키마의 다른 이벤트/멱등 키 컬럼과 같은 **160자**로
> 늘렸다.
>
> **enum으로 이미 승격된 항목은 건드리지 않았다.** `auth_sessions.revoked_reason`은
> ERD 문서에는 여전히 `varchar(30)`으로 남아 있지만 `schema.prisma`에서는 이미
> `SessionRevokedReason` enum이다 — 실제 타입 불일치가 없어 스키마는 그대로 두고 ERD
> 주석만 참고용이라고 표시했다.
>
> **반영한 파일**: `app/server/prisma/schema.prisma`(70컬럼) ·
> `app/server/prisma/migrations/20260909150000_widen_generated_id_columns_cr_0013/` ·
> `docs/domain/reference/erd-v1.4.dbml`(70) · `docs/domain/erd.md`(70, `##`/`####`/`#####`
> 세 단계 헤딩에 흩어져 있어 스크립트 1차 통과 후 수동으로 12곳 보완) ·
> `prisma-review.repository.ts` 주석 1곳.
>
> **아직 안 한 것.** 이 마이그레이션은 `ALTER COLUMN ... TYPE VARCHAR(n)`로 넓히기만
> 해서 기존 행을 다시 쓰지 않는 안전한 방향이지만, 실제 Postgres에 아직 적용해보지
> 않았다 — 배포 전 스테이징에서 프로젝트 등록 1건이 실제로 성공하는지 스모크 테스트가
> 필요하다(팀 회의 자료의 "D-2 액션" 항목). `npx prisma generate`도 이 샌드박스에서
> 네트워크 제약으로 못 돌렸다 — 로컬에서 한 번 돌리면 타입이 이 변경과 맞물린다.

## 요약

`randomId()` 가 UUID 에서 하이픈만 뺀 **32자**를 주고, 접두어 4자가 붙어 **36자**가 된다.
그런데 스키마의 해당 컬럼은 **varchar(30)** 이다.

```
express-app.ts:196   randomUUID().replace(/-/g, '')   → 32자
                     `prj_${randomId()}`              → 36자
schema.prisma:517    Project.id  @db.VarChar(30)      → 30자
```

## 어디가 걸리나

| 만드는 값 | 길이 | 스키마 | 소유 |
|---|---|---|---|
| `prj_` + UUID32 | 36 | `Project.id` varchar(30) | project-management |
| `bkm_` + UUID32 | 36 | `Bookmark.id` varchar(30) | engagement |
| `pra_` + UUID32 | 36 | `PricingAnalysis.id` varchar(30) | ai-pricing |

세 개 모두 `express-app.ts` 의 같은 `randomId()` 를 쓴다. 다른 기능에도 같은 패턴이
있는지는 확인하지 않았다 — 팀장이 전수로 보는 편이 낫다.

## 지금은 왜 안 터지나

인메모리 저장소에는 길이 검사가 없다. `DATABASE_URL` 이 없으면 그쪽으로 붙는다
(`express-app.ts:253`). 그래서 로컬·현재 배포에서는 통과한다.

**Postgres 에 붙는 순간 insert 가 실패한다.** 프로젝트 등록·북마크·AI 분석이
전부 막히고, 이 셋은 발표 시연 동선의 첫 단계다.

## 같은 문제가 이미 한 번 지적됐다

notifications CR-0001 §5 가 `usr_` + UUID32 = 36자와 `User.id` varchar(30) 의 충돌을
"공통 식별자 길이 블로커"로 올렸다. **범위가 사용자 ID 하나로만 잡혀 있었을 뿐,
같은 생성 규칙을 쓰는 곳이 최소 세 군데 더 있다.**

## 제안

**컬럼을 varchar(36) 으로 늘린다.**

| | 컬럼 늘리기 | id 줄이기 |
|---|---|---|
| 고칠 곳 | `schema.prisma` · ERD | `express-app.ts` + 이미 만들어진 데이터 |
| 위험 | 낮음 | 중간 — 다른 기능이 이 id 를 참조한다 |
| 남은 시간과 | 맞음 | 안 맞음 |

외래키로 이 id 를 받는 컬럼들(`project_id` 등)도 같이 늘려야 한다.

## 담당자가 결정할 것

CR-0001 §5 가 이미 "생성 규칙·기존 데이터·스키마 정책을 팀장이 맞춰야 한다"고 남겨
두었다. **그 결정에 위 세 개를 같이 넣어 주면 된다.**

`docs/domain/` 과 `schema.prisma` 는 담당자가 직접 고치지 않는 영역이라 요청으로만 남긴다.
결정되면 제 쪽 코드에 반영할 것이 있는지 다시 보겠다 — 컬럼을 늘리는 쪽이면 없다.
