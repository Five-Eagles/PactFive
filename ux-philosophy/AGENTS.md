# ux-philosophy — 작업 지침

이 폴더의 산출물을 만드는 방법은 `sdd-framework/templates/ux-philosophy-guide-template.md`를
따른다 (md 원문 + html·png 시각본 2종 필수).

이 폴더는 `design-system/`과 짝을 이루지만 의도적으로 분리했다 — 디자인 시스템의 특정 컴포넌트가
바뀌어도 이 폴더의 원칙은 바뀌지 않아야 한다. 작성 시 특정 컴포넌트명·색상 hex·px 값을 원칙
서술에 직접 인용하지 않는다.

- `ux-philosophy.md`: AI가 읽는 구조화 원문
- `ux-philosophy.html` 또는 `ux-philosophy.png`: 팀원이 보는 시각 버전
- `reference-main.html`: 다섯 원칙이 실제 화면(PactFive 메인 페이지)에서 어떻게 드러나는지 보여주는
  **구현 예시** (2026-09-02 추가, §7 "현재 구현 예시는 교체될 수 있으며, 원칙의 의미를 제한하지
  않는다"에 해당하는 산출물). 정적 HTML(JS 없음, 인터랙션 버그 위험 없음)이라 어떤 AI 툴이든
  텍스트로 그대로 읽을 수 있다 — `sdd-framework/feature-workflow.md`의 `design/` 시안 작업 전
  참고 대상이다.
  **주의**: 이 파일의 색상 hex·px 값은 스타일 정본이 아니다. 실제로 `--teal:#007a80`(이 파일)과
  `teal[700]: #006D70`(`design-system/design-tokens.md`)이 서로 다르다 — 확인됨(2026-09-02).
  구현 시 실제 색상·컴포넌트 규격은 반드시 `design-system/design-tokens.md`를 따르고, 이 파일은
  "원칙이 화면에서 어떻게 드러나는가"를 볼 때만 참고한다.
