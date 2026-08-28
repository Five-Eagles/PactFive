# PactFive

프리랜서와 클라이언트를 연결하는 매칭 플랫폼입니다. 프로젝트 등록부터 지원, 계약·에스크로
결제, 완료 후 상호 리뷰까지 하나의 서비스에서 처리합니다. 코드잇 창업가 과정 2기 3팀이
22일 동안 만드는 MVP입니다.

## 핵심 기능

- **회원가입·로그인**: 이메일 가입, Google·Kakao 소셜 로그인
- **프로젝트 등록·탐색**: 카테고리·예산·기술 스택·마감일 필터, 키워드 검색, 북마크
- **지원·매칭**: 프리랜서 지원 → 클라이언트 검토·수락/거절 → 계약 체결
- **AI 단가 분석**: 프로젝트 설명을 분석해 단위 기능별·전체 예상 단가를 제안
- **계약·결제**: 전자 서명 계약, 에스크로 선결제(sandbox), 완료 승인 후 정산
- **리뷰**: 완료된 프로젝트에 대한 클라이언트 ↔ 프리랜서 상호 평가
- **알림**: 지원·수락·계약·정산 등 주요 이벤트 인앱 알림

## 기술 스택

| 영역 | 선택 |
|---|---|
| 프론트엔드 | React, TypeScript, Vite, Tailwind CSS, React Router |
| 백엔드 | Express(TypeScript), Vercel Serverless Functions |
| DB | Supabase (PostgreSQL) |
| 인증 | Supabase Auth (이메일 + Google·Kakao OAuth) |
| 결제 | 토스페이먼츠 (sandbox) |
| AI | OpenAI API (단가 분석) |
| 배포 | Vercel (프론트·백엔드 각각 별도 프로젝트, 모노레포) |

스택 선택 이유와 검토한 대안은 `docs/decisions/`의 ADR을 참고하세요 (예: 백엔드 배포 방식은
ADR-0007, 인증 방식은 ADR-0008, 외부 벤더 연동 원칙은 ADR-0009).

## 팀 구성

| 담당자 | 역할 |
|---|---|
| 김락원 (팀장) | 전체 조율, 병목 해결, QA, `app/` 통합 |
| 오민혁 | user-management · ai-pricing |
| 유동우 | project-management · engagement |
| 최윤석 | applications · notifications |
| 조준영 | contracts-payments · reviews |

## 진행 상황

| 마일스톤 | 목표 |
|---|---|
| M0 설계 준비 완료 | 도메인·워크플로우 문서 확정 |
| M1 핵심 도메인 절반 | ERD·PRD 기준 핵심 기능 설계 |
| M2 기본 필수 완성 | 회원가입~알림까지 기본 기능 동작 |
| M3 심화 기능 절반 | 계약·결제·리뷰 등 진행 |
| M4 고급 필수 완성 + 배포 | 전체 시나리오 배포 완료 |

세부 일정과 근거는 `docs/decisions/0001-mvp-scope.md` 참고.

## 폴더 구조

기능별 상세 위치는 `index.md`에 있습니다. 요약하면:

```
features/{기능}/     담당자가 실제로 작업하는 곳 (spec, api-contract, design, prototype)
app/web/, app/server/  통합된 실제 서비스 코드 (팀장 전용 반영)
docs/domain/          ERD·PRD·API 계약 (팀장 전용 반영)
docs/decisions/        ADR (아키텍처·기술 스택 결정 기록)
sdd-framework/         작업 흐름·컨벤션 문서
```

## 로컬에서 확인하기

### 통합 앱 (`app/web` + `app/server`)

```bash
npm run dev
```

`app/server`(http://localhost:3000)와 `app/web`(http://localhost:5174)을 함께 띄우고 Ctrl+C로
한 번에 종료합니다. 브라우저에서는 **http://localhost:5174** 로 접속하세요. `app/web`의 vite
proxy가 `/api` 요청을 3000번으로 넘기므로 `VITE_API_BASE_URL`이나 CORS 설정 없이 동작합니다.

두 앱의 `node_modules`는 `predev`(`scripts/ensure-app-deps.js`)가 없을 때 자동으로 설치합니다 —
npm workspaces를 쓰지 않으므로(ADR-0007) 루트·`app/server`·`app/web` 세 곳이 각자 의존성을
갖습니다.

인증은 `AUTH_PROVIDER_MODE`를 지정하지 않으면 로컬 mock 모드로 동작해 Supabase 자격증명 없이
실행됩니다. 개발용 고정 토큰은 `Bearer pactfive-mock-client-01`(의뢰인) ·
`Bearer pactfive-mock-freelancer-01`(프리랜서) 두 개입니다.

`/internal/v1/...`(서버 간 내부 계약)까지 확인하려면 서비스 토큰을 함께 넘깁니다. 값이 없으면
열어주는 대신 503을 반환합니다(fail-closed, `app/server/src/shared/require-service-token.ts`).

```bash
INTERNAL_SERVICE_TOKEN=dev-token npm run dev     # macOS · Linux · Git Bash
$env:INTERNAL_SERVICE_TOKEN='dev-token'; npm run dev   # PowerShell
```

> bash 스크립트를 선호하면 `scripts/run-integrated-app.sh`도 같은 일을 합니다. 다만 Windows
> PowerShell에서 `bash`는 WSL을 가리켜 실패할 수 있으므로(`npm run dev`에는 해당 없음)
> `& "C:\Program Files\Git\bin\bash.exe" scripts/run-integrated-app.sh`처럼 전체 경로를 씁니다.

### 프로토타입 화면 (`features/*/prototype/web`)

```bash
npm install
npm run preview:dev   # 프로토타입 화면을 브라우저에서 확인 (tools/preview, 5173)
```

의존성 설치는 `prototype/run.tsx` 실행이나 `npm run preview:dev` 실행 시 자동으로 확인·설치됩니다
(`scripts/ensure-deps.js`). 개별 기능 프로토타입 검증은 각 `features/{기능}/prototype/run.tsx`를
`npx tsx`로 실행하면 됩니다.

실제 배포 URL은 배포 착수 후 이 섹션에 추가됩니다.

## 더 알아보기

작업 방식(담당자별 워크플로우, 완료 조건 등)은 `AGENTS.md`와
`sdd-framework/feature-workflow.md`에 있습니다.
