# app/ — 통합 작업 지침 (팀장 전용)

이 폴더(`app/web/`, `app/server/`)는 실제 배포되는 애플리케이션 코드입니다.

**팀장만 이 폴더를 직접 수정합니다.** 팀원은 이 폴더에 커밋·PR을 내지 않습니다. 각자 담당 기능의
`features/{기능}/prototype/`에 구현 초안을 작성하고, 팀장이 검토해 이 폴더에 반영합니다. (근거: ADR-0006)

## 통합 절차

공통 통합 워크플로우(diff 확인 → 반영 → sync-log 기록)는 `sdd-framework/integration-workflow.md` 참고.
코드 반영 시에는 diff를 그대로 patch apply 하지 않고, app/의 현재 상태와 `docs/domain/` 컨벤션에
맞게 AI가 다시 구현한다.

## 주의사항

- `prisma/schema.prisma`, `src/shared/` 등 여러 기능이 공유하는 파일은 diff 반영 시 특히
  주의해서 검토한다 (기능 간 충돌 위험이 가장 큰 지점).
