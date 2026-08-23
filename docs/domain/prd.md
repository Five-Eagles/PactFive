# PRD (제품 요구사항 정의서)

| 항목 | 내용 |
|---|---|
| 원본 | `docs/domain/reference/prd-v5.2.html` |
| 작성 | 유동우 (project-management · engagement 도메인 담당) |
| 버전 | v5.2 |
| 반영일 | 2026-08-20 |

이 문서는 원본을 요약한 포인터입니다. 전체 내용(§0~§17, 부록 포함)은 원본 HTML을 직접 엽니다.
아래는 다른 기능 담당자·AI가 매번 원본 전체를 열지 않고도 참고할 수 있는 최소 요약입니다.

## 왜 project-management·engagement 담당자 문서인데 docs/domain/에 있는가

이 PRD는 유동우 개인 담당 도메인 PRD이지만, §0(결정 현황)·§2(상태 정본)·§6(데이터 모델)이
8개 기능 전체에 걸친 교차 도메인 계약을 정의합니다. `docs/domain/erd.md`의 17개 엔티티가 전부
이 문서의 §6을 근거로 합니다 — 그래서 `features/project-management/`가 아니라 이곳에 둡니다.

## 핵심 구조

- **§0 결정 현황**: 확정된 정책 16건, 도메인 경계 결정, 구현 단계(Step 1/2/3), 팀 운영 항목
- **§2 상태 정본**: `RecruitmentStatus`(모집 상태) · `ProjectTransactionStatus`(거래 상태) — 두
  상태를 혼동하지 않는 규칙(§2.6)이 핵심
- **§3~ project-management**: Project 필드 사전, 등록 3단계 퍼널, 조회
- **engagement**: 북마크·추천 (범위는 `sdd-framework/feature-workflow.md`의 engagement 정의와
  동일 — 지원서·계약·결제·리뷰는 포함하지 않음)

## 담당 경계 (§0.2)

| 담당자 | 도메인 |
|---|---|
| 유동우 (본 PRD) | project-management · engagement |
| 오민혁 | user-management · ai-pricing |
| 최윤석 | applications · notifications |
| 조준영 | contracts-payments · reviews |

## 다른 기능 작업 시 이 문서를 언제 열어야 하는가

`RecruitmentStatus`/`ProjectTransactionStatus`를 다루는 기능, 또는 다른 도메인과의 경계·계약
함수(§5 도메인 통합 계약)를 확인해야 할 때만 원본을 연다. 그 외 일반적인 기능 구현에는 필요
없다 (`sdd-framework/feature-workflow.md` 참고).
