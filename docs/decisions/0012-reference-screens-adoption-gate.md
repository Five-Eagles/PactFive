# ADR-0012: reference-screens.html을 프로젝트 전체 구현 레퍼런스로 채택할지 — 의사결정 게이트

| 항목 | 내용 |
|---|---|
| 상태 | **폐기됨 (2026-09-02).** 팀 회의에서 반려 — §7 재검토·폐기조건에 따라 게이트 진행을 멈추고 폐기로 확정. 아래 "폐기 기록" 참고 |
| 작성 | 팀장 + AI 협업자 |
| 날짜 | 2026-09-02 |
| 관련 결정 | `design-system/design-tokens.md` §13, `app/web/AGENTS.md` "무엇이 무엇의 정본인가", 2026-08-28 오후 회의(`pactfive_meeting_0828_pm.html` — 옵션 C "권장 가이드"로 보류했던 안건) |

---

## 1. 배경 (Context)

`design-system/reference-snapshot.html`(모션 규칙 설명판)과 `design-system/reference-screens.html`
(설명 없이 실제 화면 단위로 조립한 프리뷰, 2026-09-02 제작)을 만들었다. 2026-08-28 오후 회의에서는
"대표 페이지를 각 기능 담당자의 AI가 레퍼런스 삼아 구현"하는 워크플로우를 제안했었는데, 그때는
옵션 C(권장 가이드 — 강제 아님)로 정하고 옵션 B(필수 절차화)는 보류했다.

이번에 실제로 화면 단위 레퍼런스(`reference-screens.html`)까지 만들어지면서, "이제 이걸
project-wide 필수 규칙으로 못박을까?"라는 질문이 자연스럽게 따라온다. 그런데 아직 이 레퍼런스를
실제 기능 구현에 써본 적이 한 번도 없다 — applications·ai-pricing·reviews·notifications 4개
기능은 design/prototype 자체가 아직 없다(2026-08-29 기준 확인).

## 2. 문제 정의 (Problem)

두 가지 실패 방향이 있다.

- **지금 바로 project-wide 필수로 못박으면**: 실제로 검증해 본 적 없는 산출물이 전체 팀의 의무
  절차가 된다. 만약 레퍼런스 자체에 결함이 있었다면(이번 세션에서 실제로 pointer-events 버그가
  있었다) 전체 팀이 그 결함을 그대로 따라가게 된다.
- **아무 결정 없이 계속 "참고용"으로만 두면**: 아무도 실제로 쓰지 않고 흐지부지될 수 있다.
  Common Ground 원칙(먼저 지식을 정렬한다)에 맞게 만든 자료가 실제로 안 쓰이면 만든 의미가 없다.

## 3. 게이트란 무엇인가 (Concept)

"게이트"는 이 레퍼런스를 project-wide 필수로 승격시키기 전에 통과해야 하는 명시적 기준이다.
게이트를 통과하기 전에는 §4(지금 상태)가 적용되고, 통과하면 §6(게이트 통과 시 적용될 변경)이
재논의 없이 그대로 실행된다. 즉 "지금 당장 적용"과 "영원히 참고용"의 중간 상태를 명시적으로
만들어 둔다.

## 4. 지금 상태 (게이트 미통과 — 기본값)

- `reference-screens.html` / `reference-snapshot.html`은 **참고용**이다. 어느 기능 담당자도
  이걸 따라야 할 의무가 없다.
- `sdd-framework/feature-workflow.md` · `sdd-framework/integration-workflow.md`에는 이 두
  파일을 참조하라는 필수 절차가 없다(2026-09-02 확인 — 있으면 이 ADR과 모순이므로 즉시 제거).
- `app/web/AGENTS.md` "정본 표"의 두 항목, `design-system/design-tokens.md` 헤더는 "제안
  단계 — 이 ADR의 게이트 통과 전"이라고 명시한다.

## 5. 게이트 통과 기준 (전부 충족해야 통과)

- [ ] 최소 1개 기능(applications · ai-pricing · reviews · notifications 중)이 화면을 만들 때
      `reference-screens.html`을 실제로 구현 참고에 썼고, 실제 화면과 얼마나 어긋났는지 담당자
      피드백을 받았다
- [ ] 그 피드백에 "레퍼런스가 오히려 방해됐다"는 지적이 없었다(있었으면 레퍼런스를 먼저 고치고
      다시 시도한다 — 실패로 게이트를 닫지 않는다)
- [ ] 팀원 전원이 `reference-screens.html`을 한 번은 열어보고 "이해했다"고 확인했다(Common
      Ground 원칙 — 회의에서 구두 확인으로 충분하다)
- [ ] 팀 회의에서 project-wide 필수화에 반대 없이 동의했다(이견이 있으면 기록하고 팀장이
      최종 판단한다 — AI의 추천은 근거일 뿐 최종 결정은 팀 몫이다)
- [ ] 좁은 화면(≤900px)에서 레퍼런스의 레이아웃이 깨지지 않는지 확인했다

## 6. 게이트 통과 시 적용될 변경 (미리 합의 — 통과 즉시 그대로 실행)

게이트를 통과하면 별도 재논의 없이 아래를 그대로 적용한다.

- `sdd-framework/feature-workflow.md`에 "화면 구현 착수 전 `design-system/reference-screens.html`을
  확인한다" 단계를 추가한다
- `app/web/AGENTS.md` 정본 표에서 두 항목의 "제안 단계 — ADR-0012 게이트 통과 전" 문구를 지우고
  "필수 참고"로 승격한다
- `design-system/design-tokens.md` 헤더에서 같은 문구를 지운다
- 이 ADR의 상태를 "채택됨"으로 바꾸고 통과 날짜를 적는다

## 7. 재검토 · 폐기 조건

- 게이트 기준 중 하나라도 서로 다른 기능에서 두 번 이상 반복해서 통과하지 못하면(예: 2개 기능
  이상에서 "방해됐다" 피드백), 이 제안 자체를 폐기하고 "참고용, 강제 아님"으로 영구 확정한다.
  이 경우도 상태를 "폐기됨"으로 바꾸고 이유를 남긴다 — 결정 안 된 채로 방치하지 않는다.

## 8. 영향받는 문서

- `app/web/AGENTS.md` (정본 표)
- `design-system/design-tokens.md` (헤더)
- `sdd-framework/feature-workflow.md` (게이트 통과 시에만 새 단계 추가)

---

## 폐기 기록 (구현 기록 — 결정 내용을 바꾸지 않음, adr-process.md 참고)

- **날짜**: 2026-09-02
- **경위**: §5 게이트 통과 기준(실제 기능에서 써보고 피드백, 팀원 전원 확인 등)을 충족하기 전에
  팀 회의에서 `reference-screens.html`(화면 프리뷰판)이 반려됐다. §7의 "게이트 기준을 반복해서
  통과 못 하면 폐기"까지 가지 않고, 그보다 이른 단계에서 팀이 직접 폐기를 결정한 경우다 — §7의
  취지(결정 안 된 채로 방치하지 않는다)에 따라 이 경우도 명시적으로 "폐기됨"으로 남긴다.
- **함께 폐기된 것**: `reference-snapshot.html`(규칙 설명판)도 같은 목적의 짝 파일이라 함께
  제거했다. 두 파일 모두 `design-system/`에서 삭제했다.
- **대체**: 팀은 "추상적 정책 문서만으로는 부족하고 구체적인 참고 페이지가 필요하다"는 데는
  동의했다 — 다만 그 구체적 참고 페이지는 프로젝트 폴더에 이미 있던 홈페이지 메인 페이지
  형태여야 한다는 의견이 나왔고, 이를 받아들여 `ux-philosophy/reference-main.html`로
  대체했다(§6 "구현 예시" 개념과 동일한 역할, `ux-philosophy.md` §7 참고).
- **반영한 문서**: `app/web/AGENTS.md`(정본 표에서 두 행 제거, `reference-main.html` 행 추가),
  `design-system/design-tokens.md`(헤더·§13 참조 제거), `app/web/src/shared/ui/tokens.css`·
  `ReopenRecruitmentDialog.tsx`(버그 발견 경위 주석에서 파일명만 제거, 설명은 유지) — 전부
  같은 날 반영.
