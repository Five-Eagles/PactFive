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
- `../features/project-management/design/reference-proposal/browse.html`(목록/브라우즈류 화면)·
  `../features/project-management/design/reference-proposal/detail.html`(상세류 화면): 위
  `reference-main.html`이 메인/홈 화면만 다루고 목록·상세 화면에는 구현 예시가 없다는 공백을
  메우는 **구현 예시** (2026-09-03 추가). `ux-philosophy/` 안에 파일을 복사해 두지 않고 이 두
  파일을 직접 가리킨다 — 담당자(유동우)가 지금도 계속 갱신하는 살아있는 원본이라, 복사본을 두면
  바로 갱신이 어긋난다. 이 파일들이 무엇을 왜 바꿨는지는 같은 폴더의 `README.md`(근거·측정치·
  "확인이 필요한 것" 포함)를 함께 읽는다.
  **`reference-main.html`과 다른 점**: 이 두 파일은 처음부터 `design-tokens.md` 정본 토큰만
  쓰도록 만들어졌다(본문 원시 색상값 0개, `npm run check:design` 통과) — 색상 불일치 문제가
  없다. 다만 **상태는 여전히 "제안, 확정 아님"**이다(`README.md` 상단 표) — 카테고리 10종→6종,
  기획전 배너, 인기 검색 키워드처럼 ERD·PRD 근거가 아직 없어 "확인이 필요한 것"으로 남겨둔
  항목이 있으니, 그 항목들은 구조·원칙 참고용으로만 보고 그대로 베끼지 않는다.
