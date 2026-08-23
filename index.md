# PactFive 폴더 인덱스

기능 이름 → 실제 위치 매핑만 담습니다. 각 기능의 상세 구성은 해당 기능 폴더의 `index.md`를 참고하세요.

**담당자가 실제로 작업하는 곳은 "구현 초안" 열입니다.** "통합 결과물" 열(`app/web`, `app/server`)은
팀장이 검토해 반영한 사본이며, 팀원은 직접 수정하지 않습니다. (근거: ADR-0006)

| 기능 | 스펙 | 구현 초안 (담당자 작업) | 통합 결과물 (팀장 전용 반영) |
|---|---|---|---|
| user-management | features/user-management/ | features/user-management/prototype/ | app/web·server/src/features/user-management/ |
| project-management | features/project-management/ | features/project-management/prototype/ | app/web·server/src/features/project-management/ |
| applications | features/applications/ | features/applications/prototype/ | app/web·server/src/features/applications/ |
| notifications | features/notifications/ | features/notifications/prototype/ | app/web·server/src/features/notifications/ |
| engagement | features/engagement/ | features/engagement/prototype/ | app/web·server/src/features/engagement/ |
| ai-pricing | features/ai-pricing/ | features/ai-pricing/prototype/ | app/web·server/src/features/ai-pricing/ |
| contracts-payments | features/contracts-payments/ | features/contracts-payments/prototype/ | app/web·server/src/features/contracts-payments/ |
| reviews | features/reviews/ | features/reviews/prototype/ | app/web·server/src/features/reviews/ |

API 계약 문서도 같은 원리입니다: `features/{기능}/api-contract.md`(담당자 원본) → `docs/domain/api-spec/`(팀장 반영 사본).

공용 문서: `docs/domain/`(ERD·API·상태모델, 팀장 전용 반영), `docs/decisions/`(ADR), `change-requests/`(공용 문서 변경 신청), `design-system/`(디자인 토큰·프리뷰, UI·UX 담당자), `ux-philosophy/`(UX 철학, UI·UX 담당자)

네이밍 규칙: `docs/naming-convention.md`. PRD·ERD: `docs/domain/prd.md`, `docs/domain/erd.md` (원본은 `docs/domain/reference/`).

`features/sample-login/`은 위 8개 기능에 포함되지 않는 샘플입니다 — `sdd-framework/feature-workflow.md` 워크플로우 검증용으로만 존재하며 `app/`에 통합되지 않습니다.

`features/login_sample_{claude,codex,cursor}/`도 8개 기능이 아닙니다 — 서로 다른 AI 툴이 대화 세션 없이 리포 문서만으로 같은 기능(로그인)을 독립적으로 구현해도 일정 품질을 내는지 검증한 시뮬레이션입니다. 전부 `app/`에 통합되지 않습니다.
