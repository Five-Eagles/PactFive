# project-management 피드백 — 2026-09-03 통합 (CR-0010)

반영 커밋(prototype 기준): 66bc09e (7커밋 46a476b·7c82773·d69e8e8·de5a001·39b7c89·ef1411e·1de2646 +
검색어 규칙 62·63 반영. 3e4977e 이후 CR-0010이 요청한 범위)
sync-log.md 기록: 있음 — mark-synced.sh 실행 후

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — [판단 필요] 확인 다이얼로그를 prototype의 2종이 아니라 design/*.html의 3종으로 반영했다

상태: 반영완료

**Fact — spec/prototype과 design/*.html이 서로 다른 부분**
- prototype의 `DestructiveActionSummary`/`ProjectManage.tsx`(CR-0006 결함 1)는 `CANCEL`·`DELETE`
  둘만 확인 다이얼로그를 거친다. `CLOSE_RECRUITMENT`(모집 마감)는 즉시 실행된다 — 재모집
  (`REOPEN_RECRUITMENT`)으로 되돌릴 수 있다고 본 것으로 보인다.
- 반면 `features/project-management/design/high-fi-manage.html`의 "확인 다이얼로그 3종"
  섹션은 `모집 마감`·`취소`·`삭제` **셋 다** 확인 다이얼로그로 그려 두었고, 세 다이얼로그의
  제목·본문·버튼 정확한 문구까지 정해 두었다.
- `integration-workflow.md`·`app/web/AGENTS.md`는 화면 구조·문구의 정본을 `prototype/web/*.tsx`가
  아니라 `design/*.html`로 못박는다.

**어떻게 채웠는지**
- `app/web/src/features/project-management/DestructiveActionSummary.tsx`(신규)를 만들 때
  `CLOSE_RECRUITMENT`도 포함한 3종으로 만들고, `ProjectManagePage.tsx`의 `DESTRUCTIVE` 집합에
  `CLOSE_RECRUITMENT`를 넣었다 — 모집 마감도 확인을 거친 뒤에만 서버를 부른다.
- 세 다이얼로그의 제목·버튼 문구는 시안의 정확한 텍스트를 그대로 썼다("모집을 마감할까요?" /
  "그만두기" · "마감하기" 등).

**왜 그렇게 채웠는지 (근거)**
- 정본 순서 규칙을 그대로 따랐다 — design/*.html이 옳다.
- 다만 대기 지원 거절(모집 마감 시 함께 일어나는 일)이 "재모집으로 되돌릴 수 있으니 확인이
  필요 없다"는 prototype의 원래 판단에 담당자가 동의하지 않게 된 것인지, 아니면 시안이 그저
  CR-0006 이전에 그려진 것이라 최신 판단을 반영하지 못한 것인지는 근거가 없다 — 팀장 판단으로
  design/*.html 쪽을 따랐다.

**담당자 메모**

**3종이 맞다. prototype 을 고쳤다.**

제 원래 판단(모집 마감은 재모집으로 되돌릴 수 있으니 확인이 필요 없다)이 틀렸습니다.
**되돌아가는 것은 프로젝트 상태뿐입니다.** 마감할 때 대기 지원이 일괄 거절되고,
그 거절 알림은 이미 지원자에게 갑니다. 다시 열어도 거절당한 사람이 또 지원해 주지는
않습니다 — 되돌릴 수 없는 것은 프로젝트가 아니라 **사람 쪽에 남는 일**입니다.

시안이 CR-0006 이전 것이라 낡은 게 아니라, 시안이 맞고 제 판단이 좁았습니다.

고친 것
- `DestructiveActionSummary.tsx` 에 `closeRecruitmentEffects()` 추가
- `ProjectManage.tsx` 의 `DESTRUCTIVE` 에 `CLOSE_RECRUITMENT` 추가
- 테스트 5건 (거절 건수를 숫자로 말하는가 · 지원 0건이면 거절 문구를 빼는가 등)
- 시안(`design/reference-proposal`)도 같은 3종으로 동작합니다

---

## 항목 2 — [판단 필요] 취소(CANCEL) 확인 문구의 지원자·계약 문구 조합 방식을 새로 만들었다

상태: 반영완료

**Fact — design/*.html에 정의되지 않은 부분**
- `design/high-fi-manage.html`의 취소 다이얼로그 데모는 "선정된 프리랜서에게 취소 알림이
  전송되고, 진행 중이던 계약이 무효 처리됩니다"라는 **하나의** 조건절만 보여준다(진행 중인
  계약이 있는 경우로 보인다). "본문의 지원자·계약 문구는 조건에 따라 붙거나 빠진다"는 helper
  문장은 있지만, 대기 지원자 거절 문구가 정확히 어떤 형태로 붙는지는 시안에 없다.
- 반면 prototype의 `cancelEffects()`(CR-0006 결함 1)는 대기 지원 거절과 계약 무효화를
  **별개의 조건절**로 다뤘다("대기 중인 지원 N건이 모두 거절되고..." / "진행 중이던 금액
  합의와 계약이 무효가 됩니다").
- app의 `CancelProjectResponse.postActions`가 `applicationRejection`·`contractInvalidation`을
  분리해서 확인해 주는 걸 보면, 취소가 실제로 두 가지 다른 부작용을 낼 수 있다는 것은
  맞다(서버 사실).

**어떻게 채웠는지**
- `DestructiveActionSummary.tsx`의 `bodyText()`에서 두 조건을 합성했다 — 대기 지원이 있으면
  "대기 중인 지원 N건이 거절 처리됩니다"(모집 마감 문구와 같은 톤으로 새로 지음), 진행 중인
  계약이 있으면 시안의 문구를 그대로("선정된 프리랜서에게 취소 알림이 전송되고, 진행 중이던
  계약이 무효 처리됩니다") 붙인다. 둘 다 있으면 두 문장을 이어 붙인다.
- `hasContract`는 `ClientProjectDetail.transactionStatus === 'CONTRACT_PENDING'`으로 판정했다
  — prototype의 `ManageItem`에는 거래 상태가 없어 항상 `hasContract: false`로 두었던 것과
  달리, app의 `ClientProjectDetail`은 이미 `transactionStatus`를 갖고 있어 실제로 판정할 수
  있었다.

**왜 그렇게 채웠는지 (근거)**
- 근거 없음 — 팀장 판단. 서버 응답(`postActions`)이 실제로 두 부작용을 구분하고 있어 화면도
  구분해 보여주는 것이 사실에 더 가깝다고 보았지만, 정확한 문장 합성 방식(순서·연결 어미)은
  시안이 확정하지 않은 부분이다.

**담당자 메모**

**합성 방식에 동의합니다. 순서를 시안에 못 박았습니다.**

두 부작용을 별개 조건절로 나눈 것이 맞습니다 — 서버 `postActions` 가 실제로 둘을
구분하고, 사용자에게도 다른 일이기 때문입니다.

**순서가 정해져 있지 않았던 것이 문제**였습니다. 아래로 확정하고
`design/high-fi-manage.html` 에 적었습니다.

```text
① 대기 지원 거절  → ② 계약 무효  → ③ 프로젝트 상태
```

**사람에게 가는 일이 먼저입니다.** 읽는 사람이 가장 먼저 알아야 하는 것은
"내 결정이 남에게 무엇을 하는가"이지 프로젝트가 어떻게 되는가가 아닙니다.

`hasContract` 를 `transactionStatus` 로 판정한 것도 맞습니다. prototype 의
`ManageItem` 에 그 값이 없어 항상 false 로 뒀던 것은 **없는 값을 추측하지 않으려던
것**이지 계약을 안 본다는 뜻이 아니었습니다. app 에 값이 있으면 쓰는 게 맞습니다.

---

## 항목 3 — [확인 필요] `budgetSource`/`budgetSourceAt`를 ERD 반영 없이 인메모리 타입에만 추가했다

상태: 반영완료

**Fact — 되돌리기 비싼 것(DB 스키마) 영역**
- CR-0007이 `projects.budget_source`·`projects.budget_source_at` 컬럼 추가를 제안했지만
  상태가 "제안"이고, `docs/domain/erd.md`에는 아직 이 컬럼이 없다.
- CR-0010의 이관 대상 표는 `project.types.ts`를 "고친 파일"로 명시했고, 이 필드 없이는
  `MoneyBreakdown`(CR-0006 결함 2, 예산 출처 표시)이 동작하지 않는다.

**어떻게 채웠는지**
- `app/server/.../project.types.ts`의 `ProjectRecord`·`ClientProjectDetail`에
  `budgetSource: BudgetSource`·`budgetSourceAt: string`를 추가했다. 지금 서버가
  `InMemoryProjectRepository`뿐이라(Prisma 스키마 없음, 시드 데이터도 없음 — 매 프로젝트는
  `createProject`로만 생겨서 이 필드가 항상 채워진다) 실제 DB 스키마에는 영향이 없다.

**왜 그렇게 채웠는지 (근거)**
- `sdd-framework/integration-workflow.md`가 DB 스키마 변경은 "되돌리기 비싼 것"으로 분류해
  멈추고 물으라고 하지만, 지금 시점에는 진짜 DB가 없어 이 필드 추가가 스키마를 건드리지
  않는다고 판단해 진행했다. **다만 Prisma 도입 시점에는 CR-0007을 먼저 확정해야 한다** —
  그때 가서 "이미 코드가 있으니 그대로 컬럼만 추가하면 된다"고 넘기지 않고, ERD 변경으로
  정식 검토해 달라.

**담당자 메모**

**동의합니다. Prisma 도입 전에 CR-0007 을 먼저 확정합니다.**

지금 DB 가 없어 스키마를 건드리지 않는다는 판단이 맞습니다.

다만 **"이미 코드가 있으니 컬럼만 추가하면 된다"로 넘어가지 않게** CR-0007 에
못을 박아 두었습니다 — Prisma 스키마를 처음 쓰는 시점이 게이트입니다.
그때 컬럼을 안 넣기로 하면 `MoneyBreakdown` 을 걷어내야 하고, 그건 CR-0006 결함 2
(예산이 내가 넣은 값인지 AI 가 바꾼 값인지 알 수 없다)가 되살아난다는 뜻입니다.
어느 쪽이든 그때 결정할 일이고, 조용히 지나가면 안 됩니다.

---

## 항목 4 — CR-0005(env.example)를 CR-0010 표대로 옮기지 않고 문서만 보강했다

상태: 반영완료

**Fact — CR-0010 이관 대상 표와 실제로 다르게 판단한 부분**
- CR-0010 표는 `features/project-management/prototype/server/config.ts`(신규)를
  `app/server/src/features/project-management/`로 옮기라고 적었다.
- 실제로 확인해 보니 app은 이미 `app/server/src/shared/require-service-token.ts` +
  `app.ts`의 `createRequireServiceToken(process.env.INTERNAL_SERVICE_TOKEN)`으로
  **project-management보다 상위(공유) 계층에서** 같은 문제(코드에 박힌 토큰 대신 `.env`
  주입, 없으면 fail-closed)를 이미 풀고 있었다(2026-08-28 통합에서 `/internal/v1` 소유권을
  이관할 때 같이 들어온 것으로 보인다).
- 다만 루트 `.env.example`에는 `INTERNAL_SERVICE_TOKEN` 항목 자체가 없었다 — CR-0005가
  지적한 "무엇을 넣어야 하는지 적을 곳이 없다"는 문제는 실제로 남아 있었다.

**어떻게 채웠는지**
- `config.ts`를 project-management 폴더로 옮기지 않았다 — 이미 있는 공유 미들웨어와
  중복된 개념(둘 다 `INTERNAL_SERVICE_TOKEN` fail-closed 판정)을 만드는 것이라 판단했다.
- 대신 루트 `.env.example`에 `INTERNAL_SERVICE_TOKEN` 섹션을 추가해 CR-0005가 실제로
  지적한 문서 공백만 메웠다.

**왜 그렇게 채웠는지 (근거)**
- `app/AGENTS.md`/`app/server/AGENTS.md`의 재해석 원칙 — 원본을 그대로 옮기지 않고 대상의
  현재 상태·컨벤션에 맞게 다시 구현한다. 이미 더 엄격한(503 fail-closed) 구현이 있는데
  기능이 겹치는 별도 파일을 또 만들면 두 곳에서 같은 토큰을 다르게 검증하게 될 위험이 있다.

**담당자 메모**

**동의합니다. CR-0010 표에서 그 줄을 뺐습니다.**

공유 계층에 이미 더 엄격한 구현(`require-service-token.ts`, 503 fail-closed)이 있는데
project-management 폴더에 같은 개념을 또 두면 **같은 토큰을 두 곳에서 다르게 검증**하게
됩니다. 재해석 원칙대로 하신 게 맞습니다.

제 `prototype/server/config.ts` 는 그대로 둡니다 — 프로토타입 안에서만 쓰이고,
app 에는 이미 대응물이 있습니다. **CR-0010 이관 표에서 그 줄을 지웠습니다.**
남겨두면 다음 사람이 또 옮기려 듭니다.

`.env.example` 에 `INTERNAL_SERVICE_TOKEN` 을 넣어 주신 것으로 CR-0005 는 닫습니다.

---

## 항목 5 — `reference-proposal/`의 2026-09-03 버전을 프로젝트 공통 참고 자료로 고정했다

상태: 미확인

**Fact — 원본은 그대로, 다른 기능이 보는 참고 자료만 스냅샷으로 바꿨다**
- `reference-proposal/`은 계속 유동우가 갱신하는 살아있는 원본이다. **이 원본은 건드리지
  않았다.**
- 리포 루트에 `reference/` 폴더를 새로 만들고, 2026-09-03 시점(`39a5e14`, PR #46)의 화면을
  두 형태로 고정했다.
  - `reference/project-management/*.html` — 확정 7장(main·browse·detail·register·mypage·
    edit·reopen)을 원본과 동일하게 개별 파일로 복사(+`_tokens.css`, 필요한 이미지). **AI가
    구조 참고용으로 읽는 대상은 이쪽이다.**
  - `reference/project-management-bundle.html` — `bundle.html`을 그대로 복사. 화면 10장이
    base64 이미지까지 인라인된 400KB 단일 파일이라, 사람이 브라우저로 인터랙션까지 확인하고
    싶을 때만 쓴다.
  - 처음에는 `bundle.html`만 고정해 AI 참고 대상으로도 가리켰는데, 파일이 400KB에 최대 줄이
    6만 자라 AI가 읽으면 토큰을 크게 낭비한다는 지적을 받고 그날 바로 개별 파일 쪽을 추가해
    분리했다 — `sdd-framework/feature-workflow.md`가 이미 같은 이유로 금지해 둔 base64 인라인
    문제(2026-09-02, `reference-main.html` 사례)를 이 스냅샷에서 그대로 반복할 뻔했다.
- `ux-philosophy/AGENTS.md`·`sdd-framework/feature-workflow.md`·`design-system/design-tokens.md`·
  `app/web/AGENTS.md` 4곳이 목록·상세류 구현 예시로 가리키던 대상을
  `reference-proposal/browse.html`·`detail.html`(원본, 실시간)에서
  `reference/project-management/*.html`(고정본, 개별 파일)로 바꿨다.

**어떻게·왜 그렇게 했는지**
- 여러 기능 담당자가 동시에 화면을 구현하는 스프린트 기간에는 참고 기준이 계속 바뀌는 것보다
  고정된 기준이 낫다고 판단했다 — 팀장 의견, 담당자(유동우)도 현재 버전으로 고정해 진행하는
  데 동의함(대화로 확인).
- **원본 쪽 담당자 작업에는 영향이 없다** — 계속 `reference-proposal/`을 갱신하면 된다.
  다른 기능이 보는 것만 2026-09-03 버전에 멈춰 있다는 뜻이다.
- 번들 10장 중 `experts.html`·`expert.html`·`guide.html` 3장은 ERD·PRD 근거·담당자가 없어
  `reference/README.md`에 "향후 검토 대상, 확정 참고 자료 아님"으로 별도 표시했다 — 지금은
  다른 기능의 구현 근거로 쓰지 않는다.
- 다시 얼리는 절차(재고정)는 `sdd-framework/integration-workflow.md`의 "UX 레퍼런스 재고정
  절차" 참고 — 팀 판단으로 필요할 때만 하고, 자동 갱신은 아니다.

**담당자 메모** (확인 후 위 `상태:` 값만 바꿔 주세요 — 본문은 팀장 소유입니다)
