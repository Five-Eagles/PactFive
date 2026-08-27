# contracts-payments 피드백 — 2026-08-27 통합

반영 커밋(prototype 기준): c63d410
sync-log.md 기록: 있음 — mark-synced.sh 실행 후

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — 파일명 불일치: `project-transaction.*` vs `contract-transaction.service.ts`

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- 원본 `prototype/server/`에 `project-transaction.port.ts`, `project-transaction.types.ts`는
  있는데 서비스 파일만 `contract-transaction.service.ts`로 이름이 다르다. `spec.md`·
  `api-contract.md` 본문은 "project" 계열 용어(`ProjectTransactionStatus`,
  `projectVersion`, `getProjectNegotiationContext` 등)만 쓴다.

**어떻게 채웠는지**
- `docs/naming-convention.md` §17 "구현에서 잠근 항목" 1번이 이미
  `거래 상태(ProjectTransactionStatus)`를 확정 용어로 못박아 두었으므로, 그쪽으로 통일했다.
  `app/server/src/features/contracts-payments/project-transaction.service.ts`로 옮기고,
  파일 상단에 원본 파일명과 통일 근거를 주석으로 남겼다.

**왜 그렇게 채웠는지 (근거)**
- `docs/naming-convention.md` §17(정본 확정 문서) — 임의 판단이 아니라 이미 팀이 합의한 용어를
  따랐다.

**담당자 메모**
- 원본 리포(`features/contracts-payments/prototype/server/contract-transaction.service.ts`)의
  파일명도 `project-transaction.service.ts`로 맞춰서 다음 통합부터는 diff에 이 차이가 안 보이게
  해 달라.

---

## 항목 2 — controller/repository/routes를 새로 작성했다 (원본에 없었음)

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- 원본 `prototype/server/`에는 `port.ts`(인터페이스)·`types.ts`·`service.ts`(호출자측 가드
  함수)만 있었다. `api-contract.md`는 "유동우(project-management) Mock이 구현, 조준영
  (contracts-payments) Mock이 호출"이라고 명시한다 — 즉 `/internal/v1/projects/:projectId/...`
  엔드포인트의 **진짜 구현자는 project-management**이고, contracts-payments는 원래 이 포트의
  **호출자**로만 설계됐다. controller·repository·routes가 없는 건 프로토타입 단계의 실수가
  아니라 애초에 project-management 쪽 산출물이라 이 기능 폴더에 없었던 것으로 보인다.

**어떻게 채웠는지 (설계 근거 — 잠정 결정)**
- project-management가 아직 `app/`에 통합되지 않았다. 팀장 통합 지시가 contracts-payments
  server 반영에 controller/repository/routes를 새로 작성하라고 명시적으로 요청했고, 통합을
  멈추지 않는 원칙(`sdd-framework/integration-workflow.md`)에 따라 아래처럼 **잠정** 구현했다.
  - `project-transaction.controller.ts` + `project-transaction.routes.ts`(신규) —
    api-contract.md가 이미 고정한 경로(`/internal/v1/projects/:projectId/negotiation-context`
    등, FACT)를 그대로 쓰되, **project-management가 통합되기 전까지 contracts-payments가
    잠정적으로 대신 서빙**한다. 실제 상태 저장은
    `in-memory-project-transaction.adapter.ts`(원본 `prototype/mock/project-transaction.mock.ts`를
    그대로 이식한 `ProjectTransactionPort` 인메모리 구현)가 담당해 project-management 서버
    역할을 흉내 낸다.
  - `project-transaction.repository.ts` + `in-memory-project-transaction-call-log.repository.ts`
    (신규) — 포트 자체의 멱등 처리(`in-memory-project-transaction.adapter.ts` 내부)와는 별개로,
    contracts-payments가 "언제 어떤 프로젝트에 어떤 전이를 요청했는지" 자체 감사 로그를 남기는
    저장소다. `contracts`/`payments`/`agreements` 테이블이 Prisma 스키마에 생기면 실제 DB로
    옮길 대상.
  - 인증은 `shared/require-auth.ts`(사용자 Access Token)가 아니라 새로 만든
    `shared/require-service-token.ts`를 썼다 — api-contract.md 규칙 1(J1)이 "서버 간 토큰.
    브라우저·사용자 토큰 거부"라고 명시해서다. 팀장 통합 지시는 "인증된 사용자 + 본인 소유
    리소스 검증"을 `req.user` 패턴으로 맞추라고 했는데, 이 라우트는 애초에 사용자가 호출하는
    API가 아니라서 그대로 따르면 스펙(J1)과 충돌한다 — 그래서 `req.user` 대신 서비스 토큰
    검증으로 요구사항의 취지("아무나 호출 못 하게")만 지켰다.
  - `startProjectTransaction`/`completeProjectTransaction` 호출 전 조준영 서버가 직접 대조해야
    하는 값(수락 지원서 일치, 납품 `APPROVED`∧정산 `RELEASED`)은 `contracts`/`agreements`/
    `deliveries`/`payments` 데이터가 있어야 판단할 수 있는데 Prisma 스키마가 비어 있어 이번
    반영에서는 그 캐일러측 가드(`project-transaction.service.ts`의
    `startProjectTransactionIfAccepted`/`completeProjectTransactionIfSettled`)를 컨트롤러에
    연결하지 못했다 — 포트를 직접 호출한다. 컨트롤러 코드에 위치를 주석으로 표시했다.

**왜 그렇게 채웠는지 (근거)**
- 근거 없음(경로 재사용 결정) — api-contract.md가 이미 고정한 경로를 그대로 썼다는 점에서는
  "되돌리기 비싼 API 경로"를 임의로 바꾸지 않았다는 원칙을 지켰지만, "누가 이 경로를 서빙하는가"
  라는 소유권 자체는 팀장 판단으로 뒤집었다(원래 project-management → 지금은 contracts-payments가
  임시 대행). project-management 통합 시 이 controller.ts/routes.ts를 그쪽 폴더로 옮기고
  contracts-payments는 순수 호출자(어댑터)로 되돌리는 걸 검토해야 한다.

**담당자 메모**
- 이 설계가 맞는지 확인해 달라: (1) project-management 통합 전까지 이 잠정 대행 방식이
  괜찮은지, (2) `req.user` 대신 서비스 토큰으로 처리한 인증 방식에 동의하는지, (3) 캐일러측
  가드(수락 지원서 대조, I-30)를 언제 연결할지 — `contracts`/`agreements` 테이블이 Prisma에
  생기는 시점에 맞추면 되는지.

---

## 항목 3 — 웹 화면은 만들지 않았다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- `features/contracts-payments/prototype/`에 `web/` 폴더 자체가 없다. 와이어프레임·디자인
  시안도 없다.

**어떻게 채웠는지**
- `app/web/src/features/contracts-payments/`를 만들지 않았다. 대신 `App.tsx`의
  `/contracts-payments` 경로를 `NotIntegratedPage`(공용 폴백 컴포넌트, 오늘 다른 커밋에서 추가)
  로 연결해 뒀다.

**왜 그렇게 채웠는지 (근거)**
- 팀장 통합 지시가 "웹 쪽은 만들지 마라 — 원본에 prototype/web/이 아예 없다"고 명시적으로
  범위를 제한했다. 근거 없이 화면을 새로 지어내는 과도한 gap-filling을 피했다.

**담당자 메모**
- 애초에 이 기능은 화면·PG·서명 UI가 spec.md 범위 밖("이번 세션 범위는 계약 연동 함수 4개의
  호출 계약이다")이었다 — 화면 설계(금액 합의·서명·PG·납품·정산·리뷰)는 다음 스프린트 항목으로
  별도 spec.md/api-contract.md/design을 작성해야 실제 웹 통합이 가능하다.

---
