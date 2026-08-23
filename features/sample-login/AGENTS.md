# sample-login — 작업 지침

**이 폴더는 샘플입니다.** 실제 MVP 8개 기능이 아니라 `sdd-framework/feature-workflow.md`
워크플로우 검증용으로 만들었습니다. `app/`에 통합되지 않으며 CODEOWNERS·sync-log 대상도
아닙니다.

## 작업 흐름

다른 기능과 동일하게 `sdd-framework/feature-workflow.md`를 따랐습니다: SPEC → API 계약/디자인
시안(병렬) → Mock+구현 초안 코드.

- `spec.md`: 무엇을 만들지
- `api-contract.md`: API 계약 (`docs/naming-convention.md` §6·§7 패턴)
- `design/low-fi.html`: 디자인 시안 (design-system 미확정 → low-fi)
- `prototype/server/`: 컨트롤러·서비스·레포지토리 계층 구현 초안
- `prototype/mock/`: 계약대로 동작하는 Mock
- `prototype/run.tsx`: 로컬 실행 스크립트 (`npx tsx prototype/run.tsx`)
- `prototype/web/`: 컴포넌트·훅·API 클라이언트 구현 초안

## 참고 엔티티

`docs/domain/erd.md`의 `users` 테이블.
