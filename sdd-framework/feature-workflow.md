# 기능 담당자 작업 흐름 (features/*, AGENTS 공통)

각 기능 담당자가 AGENTS(Codex/Claude/Cursor 등)와 함께 `features/{기능}/` 안에서 작업할 때 따르는
기본 순서입니다. 8개 기능 모두 동일한 절차를 참고하도록 여기 한 곳에 정의합니다.

**이 문서는 팀장과의 대화 없이도 읽는 것만으로 충분해야 합니다.** 실제로 이 순서를 전부 밟아
동작하는 예시가 `features/sample-login/`에 있습니다 — 막히면 그 폴더 구조를 그대로 따라 하십시오.

## 시작하기 전에 반드시 확인·읽어야 할 것

다른 문서를 찾아 헤매지 않도록 순서대로 정리했습니다. AI 도구가 다르거나 이 프로젝트를 처음
보더라도 아래만 따르면 작업을 시작할 수 있습니다.

0. **필수 패키지 설치는 `scripts/ensure-deps.js` 하나가 전부 처리한다 — 사람이든 AI든 신경 쓸
   필요 없다.** 리포 루트에 `node_modules/react`가 있는지 확인하고, 없으면 `npm install`을 스스로
   실행하는 로직이 이 파일 하나에만 있다. 이 로직을 부르는 진입점은 두 곳이다.
   - `prototype/run.tsx`가 실행되자마자(맨 처음에) `node scripts/ensure-deps.js`를 호출한다.
     `features/{기능}/` 폴더 안 어디서 실행하든(`prototype/` 안에서든, 기능 폴더 루트에서든)
     동일하게 작동한다.
   - `npm run preview:dev`/`npm run preview:build`도 마찬가지다 — `package.json`에
     `"prepreview:dev": "node scripts/ensure-deps.js"`가 있어서, npm이 `preview:dev`를 실행하기
     **전에** 자동으로 먼저 실행한다 (`pre<스크립트명>`은 npm 내장 관례이지 이 리포만의 특수
     설정이 아니다).

   새 `prototype/run.tsx`를 작성할 때는 `features/sample-login/prototype/run.tsx`의 preflight
   부분(설치 로직 자체가 아니라 `scripts/ensure-deps.js`를 찾아 호출하는 부분)을 그대로 옮겨
   쓴다 — 설치 확인·설치 로직 자체를 파일마다 다시 구현하지 않는다
   (`sdd-framework/constitution.md` 원칙 9: 확장은 파일 1개 + 인덱스 1줄).

   > 이전 버전은 이 로직을 `run.tsx` 파일마다 각자 복사해서 넣었었다 — 그러다 리팩터링 한 번에
   > 하나만 고치고 나머지를 빠뜨리는 사고가 날 자리였고, 무엇보다 `npm run preview:dev`처럼
   > `run.tsx`를 거치지 않는 진입점은 애초에 이 확인 자체가 없어서 `node_modules`가 없는 상태로
   > `vite`를 바로 실행하면 그대로 깨졌다(2026-08-21 실제 발생 — "vite: command not found" 계열
   > 오류). `scripts/ensure-deps.js` 하나로 합치고 npm pre-hook으로 두 진입점 모두에 걸어서
   > 해결했다.
1. `docs/naming-convention.md` — 변수·API·DB·Git 이름 규칙 (전체)
2. `docs/domain/erd.md` — 내 기능이 다루는 테이블의 필드 정의 (전체를 다 읽을 필요는 없고, 담당
   엔티티만 확인)
3. `docs/domain/prd.md` — 내 도메인과 관련된 절만 (원본 `docs/domain/reference/prd-v5.2.html`)
4. `features/sample-login/` — 이 워크플로우를 실제로 밟은 예시 (spec.md부터 prototype/까지 전부)
5. `sdd-framework/constitution.md` — 프로젝트 전체 원칙 (짧음, 전체를 읽는다)

## 절차

1. **SPEC 작성** — `spec.md`. 템플릿은 `sdd-framework/templates/feature-spec-template.md`.
2. **API 계약 문서 작성 ↔ 디자인 시안 (병렬)** — 두 트랙은 서로 막지 않는다.
   - `api-contract.md`: `docs/naming-convention.md` §6(DTO 패턴)·§7(REST 규칙) 형식을 따른다.
     구조 템플릿은 `sdd-framework/templates/api-contract-template.md`, 실제 예시는
     `features/sample-login/api-contract.md`.
   - `design/`: 화면 시안. **design-system이 아직 없으면 low-fi(뼈대 수준)**로, **design-system이
     나온 뒤에는 high-fi(실제 컴포넌트 적용)**로 만든다. 두 산출물 다 같은 폴더에 쌓인다.
   - **형식은 항상 인터랙티브 HTML이다 (low-fi도 예외 아님).** md 텍스트로 필드를 나열하는 건
     레이아웃(위치·크기·배치)을 보여주지 못해 와이어프레임이 아니다. 팀 Presentation System을
     재사용한다. 예시는 `features/sample-login/design/low-fi.html`.
   - **`design/*.html` 맨 아래에 "필수 요소 목록"을 명시한다.** 기본 렌더링 시 화면에 보여야 하는
     정확한 텍스트(placeholder, 버튼 문구, 라벨 등)를 나열한다. 이 목록이 구현(`prototype/web/`)과
     와이어프레임을 잇는 명시적 계약이다 — 그림만 보고 알아서 맞추라는 게 아니라, 이 목록에 없는
     요소를 구현이 빠뜨리면 실패로 간주한다 (2026-08-20 추가, 근거: 다른 AI가 만든 프로토타입이
     와이어프레임 UI를 따르지 않는 사례가 실제로 발생함).
3. **Mock 레포지토리 + 애플리케이션 코드 작성** — `prototype/`. ERD·API 계약대로 동작하는 Mock과
   실제 구현 초안 코드를 함께 만든다. (`prototype/`의 정의는 루트 `AGENTS.md`, ADR-0006 참고 —
   디자인 프로토타입이 아니라 구현 초안 코드다.) 계층 구조(controller/service/repository, 프론트
   컴포넌트/훅)는 `docs/naming-convention.md` §5·§6과 `features/sample-login/prototype/`을 그대로
   따른다.
   - **`prototype/run.tsx`를 함께 만든다.** 세 가지를 처리하는 스크립트다: ⓪ 위 "0. 필수 패키지
     설치" — 시작하자마자 `node_modules/react` 존재를 확인하고 없으면 스스로 `npm install`을
     실행한다, ① **`spec.md`의 번호 매긴 업무 규칙마다 최소 1개 테스트로** Mock 함수를 호출해
     계약대로 동작하는지(성공 케이스도 규칙 하나로 센다 — "성공·실패 각 1번씩"이 아니라 "규칙
     개수만큼"이 기준이다. 2026-08-21 강화 — 이전 기준으로는 규칙 하나가 spec.md에서 통째로
     빠져도 테스트가 전부 통과해버리는 사례가 실제로 있었다. 로그인 이후 다른 API 호출 방식처럼
     이 기능 자체의 입출력이 아닌 규칙은 예외로 두고 `test-report.md`에 "해당 없음"이라고 남긴다),
     ② 컴포넌트를 `react-dom/server`의 `renderToStaticMarkup`으로 렌더링해서 `design/*.html`의
     "필수 요소 목록"이 전부 텍스트로 나타나는지. 결과는 콘솔에 pass/fail로 찍는다. `npx tsx
     prototype/run.tsx`로 실행한다 (JSX를 쓰므로 확장자는 `.tsx`). 루트 `tsconfig.json`이 JSX를
     렌더링할 수 있게 최소 설정을 제공한다. 실제 서버·DB는 아직 없으므로 `server/`(구현 초안)는
     검증 대상이 아니다. 예시는 `features/sample-login/prototype/run.tsx` — spec.md 규칙 4개
     (해당 없는 1개 제외)를 각각 테스트 하나씩으로 확인한다.
     - **주의**: `run.tsx` 파일 자체(preflight 로직이 있는 최상위 스코프)에는 JSX 문법
       (`<Comp />`)을 직접 쓰지 않는다. JSX가 있으면 컴파일러가 파일 맨 위에
       `react/jsx-runtime` import를 자동으로 끼워 넣는데, 이게 "0. 필수 패키지 설치"보다 먼저
       해석돼 preflight가 무의미해진다. `react`·`react-dom/server`·컴포넌트는 preflight 이후
       동적 `import()`로 불러오고, 렌더링에는 `<Comp />` 대신 `React.createElement(Comp)`를
       쓴다 — `features/sample-login/prototype/run.tsx`가 실제 예시다.
4. **테스트 결과 기록** — `test-report.md`. 템플릿은
   `sdd-framework/templates/test-report-template.md`, 실제 예시는
   `features/sample-login/test-report.md`. `run.tsx`가 통과했다는 사실만으로는 "이 규칙까지
   확인했다"가 자동으로 증명되지 않는다(위 참고) — 그래서 `spec.md`의 규칙 번호마다 무엇으로
   확인했는지 한 줄씩 남긴다. 확인 안 한 규칙이 있으면 숨기지 말고 "안 함"이라고 적는다 — 이게
   팀장이 통합 여부를 판단하는 유일한 근거이므로, 비어 있는 것과 "안 함"이라고 적힌 것은 다른
   정보다.
5. **브라우저에서 눈으로 확인 (선택)** — `run.tsx`는 콘솔에서 pass/fail만 찍고 화면을 띄우지
   않는다. `prototype/web/index.tsx`에 화면 컴포넌트를 `default export`해두면(완료 조건 항목,
   작성 자체는 필수 — 파일 하나짜리 래퍼라 비용이 거의 없다. 예: `export { LoginForm as default }
   from './LoginForm';`), 리포 루트에서 `npm run preview:dev`를 실행하고 좌측 목록에서 기능을
   골라 실제로 브라우저에서 볼 수 있다 (`tools/preview/`, 전체 기능 공용 — 기능마다 따로 dev
   server를 설정하지 않는다). **이 화면을 실제로 열어보는 것 자체는 선택이다** — `prototype/`은
   여전히 "구현 초안 코드"이지 완성된 화면이 아니므로(ADR-0006), 프리뷰도 레이아웃이 조악할 수
   있다. 필수 요소가 다 있는지에 대한 판정은 이미 `run.tsx`의 기계적 검증이 하고 있으므로, 이
   단계를 안 열어봤다고 완료 조건을 못 채우는 건 아니다.
6. **팀장 통합** — 팀장이 `sdd-framework/integration-workflow.md` 절차로 `app/`에 반영한다. Mock이나
   코드가 그대로 쓸 만하면 재사용하고, 아니면 현재 상태·컨벤션에 맞게 다시 구현한다. API 설계는
   각 담당자가 구현을 마친 뒤 팀장이 통합 단계에서 확정한다 — `api-contract.md`는 그 전까지
   담당자의 작업 가설로 취급한다.

## 완료 조건 (Definition of Done)

아래를 전부 충족해야 다음 단계로 넘어간다. 팀장과의 대화 없이도 스스로 점검할 수 있도록
체크 가능한 형태로 정리했다.

**SPEC**
- [ ] 범위(포함/제외)가 명시되어 있다
- [ ] 관련 엔티티가 `docs/domain/erd.md` 필드명과 정확히 일치한다
- [ ] 규칙이 "무엇을·언제·어떤 조건에서"가 드러나게 구체적으로 쓰여 있다 (모호한 서술 금지)

**API 계약**
- [ ] 엔드포인트가 `docs/naming-convention.md` §7(소문자 복수 명사, kebab-case)을 따른다
- [ ] 요청·응답 필드명이 §3 표준 도메인 용어(client/freelancer 등)와 일치한다
- [ ] DTO가 Input/Response 접미사 규칙(§6)을 따른다
- [ ] 에러 케이스(4xx)가 명시되어 있다

**디자인 시안**
- [ ] 인터랙티브 HTML이다 (md 텍스트 아님)
- [ ] low-fi/high-fi 여부가 design-system 확정 상태와 맞는다
- [ ] "필수 요소 목록"이 명시되어 있다

**Mock + 구현 초안 코드**
- [ ] Mock 응답이 api-contract.md의 요청·응답 형태와 정확히 같다
- [ ] 계층 구조(controller/service/repository, 컴포넌트/훅)가 `docs/naming-convention.md`를 따른다
- [ ] 도메인 용어가 §3과 일치한다 — **이게 가장 중요하다.** 통합 단계에서 코드는 다시 구현되지만
      용어는 그대로 옮겨지는 경우가 많아, 여기서 틀리면 통합 이후에도 남는다.
- [ ] `prototype/run.tsx`가 있고, `npx tsx prototype/run.tsx` 실행 시 실패 없이 끝난다
- [ ] `spec.md`의 번호 매긴 업무 규칙마다 최소 1개 테스트가 `run.tsx`에 있다 (해당 없는 규칙은
      `test-report.md`에 "해당 없음"으로 남기고 여기서는 제외한다) — "성공 케이스 1개, 실패
      케이스 1개"로는 부족하다. 규칙이 5개면 테스트도 최소 5개다
- [ ] `prototype/web/`의 컴포넌트가 `design/*.html`의 필수 요소 목록을 전부 렌더링한다 —
      `run.tsx`가 이걸 기계적으로 확인한다. 눈으로 비교해서 "비슷해 보인다"로 통과시키지 않는다
- [ ] `prototype/web/index.tsx`가 있고, 화면 컴포넌트를 `default export`한다 (브라우저 프리뷰용,
      아래 참고)
- [ ] 인증·결제·AI API 등 외부 벤더를 호출하는 코드가 있다면, 벤더 SDK를 직접 부르지 않고
      인터페이스(포트) 뒤에 두었다 — `docs/naming-convention.md`의 `.port.ts`/`.adapter.ts`
      규칙, 근거는 `docs/decisions/0009-external-vendor-interface-layer.md`

**테스트 결과 기록**
- [ ] `test-report.md`가 있고, `sdd-framework/templates/test-report-template.md` 형식을 따른다
- [ ] `spec.md`의 규칙 번호마다 대응하는 줄이 있다 (확인 안 한 규칙은 "안 함"이라고 적어도
      되지만, 줄 자체가 없으면 안 된다 — "확인 안 했다"는 사실도 팀장에게 필요한 정보다)
- [ ] `run.tsx`의 실제 실행 결과(PASS/FAIL 개수)가 적혀 있다

## 폴더 대응표

| 단계 | 산출물 | 위치 |
|---|---|---|
| 1 | 기능 정의 | `features/{기능}/spec.md` |
| 2 | API 계약 | `features/{기능}/api-contract.md` |
| 2 | 화면 시안 (인터랙티브 HTML, low-fi → high-fi) | `features/{기능}/design/` |
| 3 | Mock + 구현 초안 코드 | `features/{기능}/prototype/` |
| 4 | 테스트 결과 기록 | `features/{기능}/test-report.md` |
| 5 | 브라우저 프리뷰 (선택, 전체 기능 공용) | `tools/preview/` (`npm run preview:dev`) |
| 6 | 통합 결과물 | `app/` (팀장 전용, `sdd-framework/integration-workflow.md` 참고) |

## 이 흐름은 기본값이지 강제 규칙이 아니다

특정 기능에서 이 순서가 맞지 않으면 개인 워크플로우 변경을 요청할 수 있고, 전체 팀에 적용할 만한
개선이면 이 문서 자체의 변경도 요청할 수 있다. 두 경우 모두 `change-requests/`에 기록해 추적한다.

(2026-08-20 작성, 2026-08-20 개정 — "시작하기 전에", "완료 조건" 추가: 팀장과의 대화 세션 없이
다른 AI가 읽어도 동일한 품질을 낼 수 있도록)
