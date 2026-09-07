# PRD (제품 요구사항 정의서)

| 항목 | 내용 |
|---|---|
| 원본 | `docs/domain/reference/prd-v6.4.md` (HTML판: `prd-v6.4.html`, 파일명은 v6.4 유지·내용은 v6.6) |
| 작성 | 유동우 (project-management · engagement 도메인 담당) |
| 버전 | v6.6 |
| 반영일 | 2026-08-25 (v6.5 개정: 2026-09-04, v6.6 개정: 2026-09-04, 팀장) |
| 스키마 정본 | **ERD v1.6** — PRD와의 경계는 원본 §6.11, 매핑은 §6.12 |
| 상태 | **구현 초안 확정** — 미확정 0건 · 블로커 0건. PRD v6.6 · ERD v1.6 · 네이밍 컨벤션 v1.4
  세 문서가 같은 값을 가리킨다 |

이 문서는 원본을 요약한 포인터입니다. 전체 내용(§0~§17, 부록 포함)은 원본을 직접 엽니다 —
**`prd-v6.4.md`(마크다운판)를 우선 열 것**. HTML판과 내용은 같지만 검색·부분 읽기가 쉽습니다.
아래는 다른 기능 담당자·AI가 매번 원본 전체를 열지 않고도 참고할 수 있는 최소 요약입니다.

## 왜 project-management·engagement 담당자 문서인데 docs/domain/에 있는가

이 PRD는 유동우 개인 담당 도메인 PRD이지만, §0(결정 현황)·§2(상태 정본)·§6(데이터 모델)이
8개 기능 전체에 걸친 교차 도메인 계약을 정의합니다. `docs/domain/erd.md`의 19개 엔티티가 전부
이 문서의 §6을 근거로 합니다 — 그래서 `features/project-management/`가 아니라 이곳에 둡니다.

## 핵심 구조

- **§0 결정 현황**: 확정된 정책 16건 + 이후 감사·구현 초안 확정 결정(D-40~D-90), 도메인 경계 결정,
  구현 단계(Step 1/2/3), 팀 운영 항목
- **§2 상태 정본**: `RecruitmentStatus`(모집 상태) · `ProjectTransactionStatus`(거래 상태) — 두
  상태를 혼동하지 않는 규칙(§2.6)이 핵심. **§2.1에 상태 10종의 값 목록이 있다** (저장 enum의
  정본은 ERD, `NegotiationStatus`는 저장하지 않는 API 파생값 — D-88)
- **§3~ project-management**: Project 필드 사전, 등록 3단계 퍼널, 조회, 재모집(A-13, D-83·D-90)
- **§6 데이터 모델**: 엔티티 19종 (`auth_sessions`·`negotiation_offer` 신설 포함, D-62·D-70·D-78
  종결로 엔티티 수 고정 원칙 폐기), ERD 매핑표(§6.12)는 "ERD가 바뀌면 여기만 고친다"는 원칙 유지
- **§8 공통 코드**: 카테고리 6종(§8.1) · 기술 스택 32종(§8.2) · 오류 코드 24종(§8.3)
- **§13 API 스키마**: project-management·engagement API **13종** (A-01~A-13)
- **engagement**: 북마크·추천 (범위는 `sdd-framework/feature-workflow.md`의 engagement 정의와
  동일 — 지원서·계약·결제·리뷰는 포함하지 않음)

## v6.6에서 바뀐 것 (2026-09-04)

오민혁이 ai-pricing Step 2(동기식 MVP) 구현을 마치며 제기한 CR 6건(카테고리는 D-91로 이미
해결) 중 나머지 5건을 검토해 전부 채택했습니다(D-92·D-93). `pricing_analyses` 결과 컬럼
nullable화·실패 재생 스냅샷·멱등키 범위 정정 4건은 오민혁의 프로토타입이 이미 구현·테스트한
모양으로 ERD를 맞추는 정정이고, 기존 프로젝트 적용의 교차 도메인 원자성(`pricing_application_
receipts` 신설)만 새 설계 판단이었습니다 — 같은 Postgres DB를 쓰므로 saga/outbox 없이 단일
DB 트랜잭션으로 단순화해 채택했습니다. 상세 경위는 부록 E D-92·D-93, ERD의 E-32~E-37 참고.

## v6.5에서 바뀐 것 (2026-09-04)

Prisma 스키마를 처음 설계하면서(팀장) project-management 실제 구현과 대조하다 발견한 1건
(D-91)입니다. **기능 범위 변경은 없고**, 카테고리 6종 값을 실제 구현에 맞춰 정정하는
작업입니다 — `APP_DEVELOPMENT`→`MOBILE_APP`, `ETC`→`DATA_AI` (§8.1·§14.3). ERD의
`business_field`도 D-63(세 곳이 같은 목록 공유)에 따라 같이 맞췄습니다. 상세 경위는
§14.3, ERD의 E-27, `feedback_loop/2026-09-04/project-management.md` 항목 3 참고.

## v6.4에서 바뀐 것 (2026-08-25)

v6.3 구현 초안을 ERD v1.4·네이밍 컨벤션 v1.4와 대조하며 나온 3건입니다. **기능 범위 변경은
없고**, 값·표기를 맞추는 작업입니다.

- **D-90 — 재모집(A-13)의 `recruitmentStartAt` 갱신 규칙을 A-13 스펙 안에 명시.** 재모집이
  성공하면 서버가 시작 시각을 현재 시각으로 갱신하고, 마감일 365일 상한을 **갱신된 시작 시각
  기준**으로 검증한다. 처리 순서(갱신 → 상한 검증)가 뒤바뀌면 오래된 프로젝트가 재모집되지
  않는다. 응답에도 `recruitmentStartAt`이 포함된다
  - 이전에는 이 지시가 ERD 컬럼 주석에만 있어서 PRD만 읽고 구현하면 놓치는 구조였다
- **I-28 결정 번호 통일** — `D-84` → **`D-85`** (`D-84`는 §15 감사 재실행 결정으로 남는다)
- **API 수량 표기** — 7곳의 `12종` → **`13종`** (A-13 반영)

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
