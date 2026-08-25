# docs/domain/ — 도메인 공유 자산 통합 지침 (팀장 전용)

이 폴더(ERD, API 계약, 상태 모델)는 팀장이 각 기능 폴더의 원본을 검토해 반영하는 통합 결과물입니다.
팀원은 이 폴더를 직접 수정하지 않습니다. 각자 담당 기능 폴더 안에서 작성한 원본을 팀장이 반영합니다.

## API 계약 문서 통합

공통 통합 워크플로우(diff 확인 → 반영 → sync-log 기록)는 `sdd-framework/integration-workflow.md` 참고.
반영 대상은 `docs/domain/api-spec/{기능}.md`이고, 4개 기능 문서가 모두 최신이면
`docs/domain/api-spec/openapi.yaml`(통합본)도 갱신한다.

## ERD

D-06 절차에 따라 팀장이 초안을 작성하고 전원 리뷰를 받는다. (근거: PRD §6.10)
- 엔티티·불변식·관계도는 각 도메인 담당자 검토 후 확정한다.
- ERD 이미지(PNG/PDF)는 RFP 제출 산출물이다.
- 요약은 `docs/domain/erd.md`, 원본은 `docs/domain/reference/erd-v1.4.html`
  (DBML: `docs/domain/reference/erd-v1.4.dbml`) 참고 (2026-08-25 갱신, 구현 초안 확정).

## PRD

요약은 `docs/domain/prd.md`, 원본은 `docs/domain/reference/prd-v6.4.md` 참고 (HTML판
`prd-v6.4.html`도 같은 내용이지만, 검색·부분 읽기가 쉬운 마크다운판을 우선 연다. 2026-08-25 갱신).
상태 enum 실제 값의 정본은 `docs/domain/erd.md`다 — `docs/naming-convention.md` §9는 값을
중복 정의하지 않는다.
