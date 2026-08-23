# sdd-framework/ — 작업 지침

이 폴더는 팀 전체가 공유하는 규칙·워크플로우·템플릿을 담습니다: `constitution.md`(원칙),
`integration-workflow.md`·`feature-workflow.md`(작업 절차), `adr-process.md`·`evolution-rules.md`
(문서를 어떻게 늘려갈지), `templates/`(각종 템플릿).

## 이 폴더의 문서를 고칠 때

이 폴더의 문서는 정의상 팀 전체에 영향을 미친다 — `adr-process.md`의 ADR 필요 조건 1번("여러
영역에 걸치는 결정")에 거의 항상 해당한다. 수정하기 전에:

1. 새 문서를 만들지 기존 문서를 확장할지 `evolution-rules.md`로 먼저 판단한다.
2. 그 판단·수정이 ADR급 결정인지 `adr-process.md`로 확인한다. 해당하면 `docs/decisions/`에 ADR을
   먼저 쓰고, 이 폴더의 문서는 그 ADR을 반영하는 결과물로 고친다.
3. `constitution.md`는 가장 변경 비용이 높은 문서다 — 원칙 자체를 바꾸는 것이므로 팀 논의 없이
   혼자 수정하지 않는다.

## 이 폴더는 팀원의 일상 작업에서 직접 수정 대상이 아니다

`features/{기능}/`에서 작업하는 담당자는 이 폴더를 참고만 하고 직접 고치지 않는다. 이 폴더의
내용이 실제 작업과 안 맞으면 `change-requests/`에 변경 신청을 남긴다
(`sdd-framework/templates/spec-change-request-template.md` 참고).

(2026-08-20 작성)
