# CR-0011 — 대표페이지(홈/랜딩) 담당을 유동우로

| | |
|---|---|
| 제기 | 유동우 (project-management) · 2026-09-03 |
| 대상 | 김락원 (팀장 · `docs/domain/api-spec/`) · PRD §7.1 |
| 상태 | 제안 — 이미 만들고 있다 |
| 근거 | 실제 작업 상태 |

## 요약

PRD §7.1 화면 목록은 **홈/랜딩을 오민혁**으로 적고 있다.
**유동우로 바꾼다.**

## 왜

이미 유동우가 만들고 있다.

| 무엇 | 어디 |
|---|---|
| 대표페이지 시안 | `features/project-management/design/reference-proposal/main.html` |
| 기획전 슬라이드 · 카테고리 10종 · 추천 전문가 | 같은 파일 |
| 데이터·규칙 엔진 | `design/reference-proposal/demo/` |

**이 화면의 본론이 project-management 데이터다.** "지금 모집 중인 프로젝트"가
`GET /api/v1/projects` 로 채워지고, 카드 규격(정보 9개 그룹)도 이쪽 명세다.
카테고리 버튼은 `project_category` 6종이고, 검색창은 목록 화면으로 간다.

담당을 나누면 **화면 하나를 두 사람이 고치게 된다.** 지금까지 손댄 것도 전부
이쪽이라 이관하는 편이 오히려 비용이다.

## 오민혁 담당으로 남는 것

| 화면 | 담당 |
|---|---|
| 로그인 · 회원가입 | 오민혁 |
| 프로필 | 오민혁 |
| AI 단가 분석 | 오민혁 |

대표페이지 안에서도 **로그인은 오민혁 쪽 연결점**이다.
`design/reference-proposal/demo/session.js` 가 그 자리이고, 화면 코드는
"지금 누가 보는가"만 물어본다 — 실제 로그인이 붙으면 `signIn()` 안쪽만 바뀐다.

## 요청

1. PRD §7.1 화면 목록에서 `홈/랜딩` 의 담당을 **유동우**로
2. `docs/domain/api-spec/` 에 같은 취지가 적혀 있으면 함께

## 이미 반영한 것

| 파일 | 무엇 |
|---|---|
| `design/reference-proposal/README.md` | 화면 표 두 곳의 담당을 유동우로. "이관 전까지 제안" 문구 삭제 |
| `design/reference-proposal/main.html` | 머리 주석에 소유와 시안 출처를 구분해 적음 |

시안을 처음 그린 사람은 오민혁이다(`ux-philosophy/ux-philosophy.png`, 8/24).
**그린 사람과 소유자는 다르다** — 그 사실은 문서에 그대로 남겼다.
