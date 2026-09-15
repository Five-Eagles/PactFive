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
- `../reference/project-management/*.html`(목록/상세류를 포함한 화면 7장, 개별 파일): 위
  `reference-main.html`이 메인/홈 화면만 다루고 목록·상세 화면에는 구현 예시가 없다는 공백을
  메우는 **구현 예시** (2026-09-03 추가, 2026-09-03 고정본으로 전환). **AI 툴은 이 폴더의
  개별 파일만 읽는다** — 필요한 화면 하나만 골라 읽으면 된다. 같은 폴더의
  `project-management-bundle.html`(화면 10장을 base64 이미지까지 인라인해 하나로 합친
  400KB 파일, 최대 줄 길이 6만 자)은 **사람이 브라우저로 인터랙션을 확인할 때만** 열고, AI가
  구조 참고용으로 통째로 읽지 않는다 — `reference-main.html`을 base64로 만들었다가 파일
  읽기·git diff가 전부 깨졌던 2026-09-02 사례와 같은 문제라 개별 파일로 분리해 두었다.
  `features/project-management/design/reference-proposal/`(담당자 유동우가 계속 갱신하는
  살아있는 원본)을 직접 가리키던 것을 **2026-09-03에 고정 스냅샷으로 바꿨다** — 여러 기능
  담당자가 동시에 구현하는 스프린트 기간 동안 참고 기준이 계속 바뀌면 혼란이 생기기 때문이다
  (원본은 담당자 본인의 계속되는 작업 기준으로 그대로 살아있다. 다른 기능 담당자만 고정본을
  본다). 고정 시점·범위·다시 얼리는 절차는 `../reference/README.md` 참고.
  **`reference-main.html`과 다른 점**: 이 파일들은 처음부터 `design-tokens.md` 정본 토큰만
  쓰도록 만들어졌다(본문 원시 색상값 0개, `npm run check:design` 통과) — 색상 불일치 문제가
  없다.
