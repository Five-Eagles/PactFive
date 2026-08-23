# ai-pricing — 작업 지침

## 시작하기 전에

`sdd-framework/feature-workflow.md`의 "시작하기 전에 반드시 읽어야 할 문서"를 먼저 읽는다. 막히면
`features/sample-login/`(전체 워크플로우를 실제로 밟은 예시)을 그대로 따라 한다.

## 작업 흐름

이 기능의 AGENTS 작업 흐름은 `sdd-framework/feature-workflow.md`를 따른다 (SPEC → API 계약/디자인
시안 병렬 → Mock+구현 초안 코드 → 테스트 결과 기록 → 팀장 통합). 각 단계의 완료 조건(Definition of Done)도 그 문서에
있다. 아래는 이 기능에만 해당하는 세부 사항이다.

## API 계약 문서

이 기능의 API 계약 문서는 이 폴더 안에 작성한다: `api-contract.md`

- 형식은 `docs/naming-convention.md` §6(DTO 패턴)·§7(REST 규칙)을 따른다. 템플릿은
  `sdd-framework/templates/api-contract-template.md`, 실제 예시는
  `features/sample-login/api-contract.md`.
- 이 파일은 담당자가 계속 갱신하는 원본이다. API 설계는 구현을 마친 뒤 팀장이 통합 단계에서
  확정하므로, 그 전까지는 작업 가설로 취급한다.
- 팀장이 반영한 사본은 `docs/domain/api-spec/`에 있다. 그쪽은 직접 수정하지 않는다.

## 디자인 시안

`design/`에 인터랙티브 HTML로 작성한다 (low-fi도 예외 아님). design-system 확정 전에는 low-fi, 확정 후에는 high-fi로 만든다. 예시는 `features/sample-login/design/low-fi.html`.
