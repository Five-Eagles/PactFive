# 패널 이식성 확정 요청 — 팀장 (ADR-0012)

| | |
|---|---|
| 받는 사람 | 팀장 (ADR-0012 · 메인 셸) |
| 보내는 사람 | 조준영 · contracts-payments · reviews |
| 날짜 | 2026-09-02 |
| 정본 | `review/reference-panel-gap-2026-09-02.md` · `docs/decisions/0012-reference-screens-adoption-gate.md` |
| 목적 | 메인 확정 전, 패널만 유지한 이식 범위를 예/아니오로 확정 |

합의·서명·결제·리뷰는 **패널만**이다. 레퍼런스 4화면은 앱 셸이다. 셸을 베끼지 않았다.
옮긴 것: 오버레이 240ms(딤+본체), `prefers-reduced-motion`, 버튼 마이크로 100ms.
넣지 않은 것: `.frame` 헤더, 카드 그리드 stagger, 상세 2단, 등록 3단계, SCR-B10 재모집 모달.

게이트 통과를 주장하지 않는다. 조준영 확인 기록은 `reference-panel-gap-2026-09-02.md`다.

---

## Discord

조준영(contracts-payments · reviews)입니다. 레퍼런스 2파일을 리포에서 열었습니다. 합의·서명·결제·리뷰는 **패널만** 유지하고, 오버레이 240ms·reduced-motion만 이식했습니다. 앱 셸·카드 stagger는 넣지 않았습니다. ADR-0012 게이트 통과는 주장하지 않습니다. (1) 메인 확정 전까지 패널만·셸 금지 방향이 맞는지. (2) 오버레이·reduced-motion만으로 충분한지. (3) reviews가 리듬만 쓴 것을 「4기능 중 1개가 레퍼런스를 구현에 씀」의 조준영 몫으로 인정하는지. (4) 남은 게이트(전원 확인·회의 동의·≤900px)는 팀장/전원이 진행하는지. 정본: `features/contracts-payments/review/teamlead-panel-portability-2026-09-02.md`.

---

## 해당 없음

`app/` 수정, 레퍼런스 HTML 개작, Toss 키(`teamlead-pg-sandbox-keys.md`), ADR-0012 상태 변경.

---

## 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| P1 | 메인 확정 전까지 패널만 유지하고 앱 셸을 베끼지 않는 방향이 맞는가 | | | |
| P2 | 오버레이·reduced-motion만 이식한 범위로 충분한가 (카드 stagger·2단 상세·재모집 모달 제외) | | | |
| P3 | reviews가 리듬만 쓴 것을 ADR-0012 「4기능 중 1개가 레퍼런스를 구현에 씀」의 조준영 몫으로 인정하는가 | | | |
| P4 | 남은 게이트(전원 확인·회의 동의·≤900px)는 팀장/전원이 진행하는가 | | | |

회신 전에도 패널 CSS는 유지한다. 메인이 확정되면 그때 셸 안에 끼운다.
