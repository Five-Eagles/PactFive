# PactFive — 프로젝트 전역 작업 지침

이 파일은 모든 AI 코딩 도구(Claude Code, Cursor, Copilot 등)가 공통으로 참고하는 최상위 지침입니다.
폴더별 세부 지침은 각 폴더의 AGENTS.md를 우선 참고하세요 (progressive disclosure).
프로젝트 전체를 관통하는 원칙은 `sdd-framework/constitution.md` 참고.

## 폴더 구조 참고

- 각 기능이 어디에 있는지는 루트 `index.md` 참고
- `app/` 작업 규칙(접근 권한, 통합 워크플로우)은 `app/AGENTS.md` 참고
- 도메인 공유 문서(ERD·API 계약) 통합 규칙은 `docs/domain/AGENTS.md` 참고
- 공통 통합 워크플로우(diff 확인 → 반영 → sync-log 기록) 원리는 `sdd-framework/integration-workflow.md` 참고
- **기능 담당자가 `features/{기능}/` 안에서 작업하는 순서(SPEC → API 계약/디자인 시안 → Mock+구현
  초안 코드)는 `sdd-framework/feature-workflow.md` 참고 (2026-08-20 추가)**
- ADR을 새로 써야 할지 판단하는 기준은 `sdd-framework/adr-process.md` 참고 (2026-08-20 추가)
- 새 문서를 만들지 기존 문서를 확장할지 판단하는 기준은 `sdd-framework/evolution-rules.md` 참고 (2026-08-20 추가)
- 이름 규칙(변수·API·DB·Git)은 `docs/naming-convention.md` 참고 (2026-08-20 추가)
- PRD·ERD 요약은 각각 `docs/domain/prd.md`, `docs/domain/erd.md` 참고 (2026-08-20 추가, 원본은 `docs/domain/reference/`)
- 기능 담당자 워크플로우를 실제로 밟은 동작 예시는 `features/sample-login/` 참고 — 팀장과의 대화 없이 다른 AI가 작업해도 이 예시와 `sdd-framework/feature-workflow.md`의 완료 조건만으로 충분해야 한다 (2026-08-20 추가)
- `prototype/web/`을 브라우저에서 실제로 보고 싶으면 리포 루트에서 `npm run preview:dev` (`tools/preview/`, 전체 기능 공용 프리뷰 하네스) 참고 (2026-08-21 추가)
- **main/develop/production에는 사람이든 AI든 직접 push하지 않는다 — 항상 PR로만 반영한다.**
  GitHub CODEOWNERS 필수 리뷰는 유료 플랜이 없어 쓸 수 없어서(`.github/CODEOWNERS` 참고), 대신
  `scripts/git-hooks/pre-push`가 세 브랜치로의 직접 push를 로컬에서 차단한다. 이 훅은
  `scripts/ensure-deps.js`가 모든 진입점에서 자동으로 설치하므로 별도 설정이 필요 없다
  (2026-08-24 추가)

## features/*/prototype/, features/*/design/ 정의 (2026-08-20 갱신)

`features/{기능}/prototype/`은 디자인 프로토타입이 아니라 **실제 구현 초안 코드 + Mock 레포지토리**입니다
(ADR-0006, 2026-08-18 재정의). 화면 디자인 시안은 `features/{기능}/design/`에 작성하며, design-system
확정 전에는 low-fi, 확정 후에는 high-fi로 만듭니다. 팀원이 `prototype/`, `design/`, `api-contract.md`,
`spec.md`에서 작업하고, 팀장이 검토해 `app/`에 반영합니다. `app/`은 팀장만 직접 수정합니다.
자세한 절차는 `sdd-framework/feature-workflow.md`, `app/AGENTS.md` 참고.

## design-system/, ux-philosophy/ (2026-08-20 추가)

UI·UX 담당자가 만드는 산출물입니다. 만드는 방법은 각각
`sdd-framework/templates/design-system-guide-template.md`,
`sdd-framework/templates/ux-philosophy-guide-template.md` 참고. 두 폴더는 의도적으로 분리되어
있습니다 — ux-philosophy는 design-system의 특정 컴포넌트와 결합되지 않도록 추상 수준을
유지합니다.

## API 계약 문서 (2026-08-19 갱신)

각 기능의 API 계약 문서는 `features/{기능}/api-contract.md`에 작성합니다. `docs/domain/api-spec/`는
팀장이 반영한 사본이며 팀원이 직접 수정하지 않습니다. 자세한 통합 절차는 `docs/domain/AGENTS.md` 참고.
