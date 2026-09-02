# 레퍼런스 vs 패널 — 조준영 확인 (2026-09-02)

| | |
|---|---|
| 날짜 | 2026-09-02 |
| 담당 | 조준영 (`contracts-payments` · `reviews`) |
| 목적 | ADR-0012 「팀원 전원 확인」+ 다음 UX 이식 제안 |
| 연 파일 | `design-system/reference-snapshot.html`, `design-system/reference-screens.html` |
| 정본 | `design-system/design-tokens.md` §13. HTML은 참고용(게이트 미통과) |
| 대상 | `AgreementPanel` · `ContractSignPanel` · `PaymentPanel` · `ReviewPanel` |

Windows `file:///D:/...` 는 쓰지 않았다. 리포 파일을 열었다.

---

## 1. 이해한 것

레퍼런스 4화면(찾기·상세·내 프로젝트·등록)은 **project-management 앱 셸**이다.
합의·서명·결제·리뷰는 **패널만**이다. 메인 확정 전이라 셸을 베끼지 않는다(이식성).

정본은 계속 §13이다. 스냅샷은 모션 규칙 설명판, 스크린은 화면 조립 프리뷰다.
둘 다 2026-08-28~09-02 project-management 고정본이지 살아있는 코드가 아니다.

---

## 2. 쓸 수 있는 것 — 이번 세션에서 옮김

토큰 **값**은 가져왔고, 클래스 **이름**은 시안을 유지했다 (`.btn.primary`, BEM 아님).

| 항목 | 어디에 |
|---|---|
| 모션 토큰 | `_tokens.css` `:root` — `--dur-fast` 100ms, `--dur-normal` 160ms, `--dur-slow` 240ms, easing 3종 |
| overlay 색 | `_tokens.css` `:root` — `--overlay`, `--shadow-overlay`. hex는 여기만 |
| 오버레이 | `panel.css` `.overlay-backdrop` + `.dialog`. 딤과 본체 동시 240ms. 닫힘 `pointer-events: none` |
| reduced-motion | `panel.css` — duration 0, 즉시 최종 상태. `.btn` 전환도 0 |
| 마이크로 | `_tokens.css` `.btn` hover/focus 100ms |
| 금액 | 카운트업 없음. `Money` 즉시 표시 유지 |
| 미리보기 | `agreement.html` · `reviews/design/high-fi.html` 메타의 「오버레이 리듬」. 제품 상태 아님 |

상태 UX의 정본은 계속 `design/*.html`이다. `.empty` 클래스는 CSS만 있고 4탭에서는 쓰이지 않는다.

---

## 3. 안 맞는 것 (넣지 않음)

| 레퍼런스 | 이유 |
|---|---|
| `.frame > header`(로고·프로젝트 찾기·내 프로젝트) | 앱 셸. 패널 시안은 셸 없음 |
| 카드 그리드 stagger (8개까지 40ms, 9번째부터 즉시, 최초 진입만) | 우리 화면은 카드 목록이 아님 |
| 상세 2단 (`1fr` + 사이드바 320px sticky) | SCR-B02 프로젝트 상세. 패널은 `max-width: 560px` 1단 |
| 등록 3단계 `.steps` | 프로젝트 등록 플로우 |
| SCR-B10 「다시 모집하기」 모달 | PM 전용. 합의·서명·결제·리뷰에 재모집 없음 |
| 북마크 · 3열 그리드 · 페이지네이션 | 탐색/관리 화면 |

스냅샷의 취소 다이얼로그·스크린의 재모집 다이얼로그는 **리듬만** 참고한다
(240ms, 딤+본체, reduced-motion). 문구·필드·PM 액션은 가져오지 않는다.

---

## 4. 패널별

| 패널 | 셸 | 어긋남 | 이번 이식 |
|---|---|---|---|
| 합의 | 없음. 맞음 | 거절 확인 제품 플로우는 없음 | 시안 메타에서 overlay 리듬만. 거절 확인은 안 만듦 |
| 서명 | 없음. 맞음 | 로딩/`LOAD_FAILED` 뷰 없음 | 마이크로 100ms. 셸 없음 |
| 결제 | `PaymentPanel`은 시안과 같음 | `PaymentCheckoutPanel`은 스텁 | 스텁을 레퍼런스 셸로 채우지 않음 |
| 리뷰 | 없음. 맞음 | stagger 해당 없음 | §2만 옮김. 4화면 레이아웃은 안 씀 |

`PaymentCheckoutPanel`은 규칙 17 텍스트 검사 잔여물이다. high-fi 정본은 `PaymentPanel`이다.

---

## 5. 이식 결과 (2026-09-02 UX)

1. `_tokens.css`에 `--dur-*` · easing · `--overlay`만 추가했다. primitive hex는 `:root`만.
2. `panel.css`에 overlay·dialog·`prefers-reduced-motion`만 옮겼다. stagger·`.frame`·`.grid--cols3`·`.steps`는 넣지 않았다.
3. 금액에 카운트업을 넣지 않았다.
4. reviews는 §2만 썼다. 셸·카드 그리드는 넣지 않았다. 레퍼런스가 방해되지는 않았다.

패널 상태 언어의 근거는 계속 `design/agreement.html` · `design/contract-sign.html` ·
`design/payment.html` · `features/reviews/design/high-fi.html`이다.

---

## 6. ADR-0012 게이트

- [x] 조준영: 두 파일을 열고 이해했다. 이 문서가 그 기록이다.
- [x] reviews가 화면을 만들 때 레퍼런스 **오버레이·reduced-motion 리듬만** 구현에 썼다.
      4화면 레이아웃은 쓰지 않았다. 「방해됐다」는 없다.
- 게이트 통과를 주장하지 않는다. 회의 동의·좁은 화면 확인은 팀장/전원 몫이다.
