# project-management Index

## 담당자
- 유동우

## 스펙 (features/project-management/)
- spec.md 핵심 요약: 프로젝트 게시물의 일생 — 등록(3단계) · 조회·검색 · 수정(조건부 잠금) ·
  소프트 삭제 · 모집 마감 · 취소 · 재모집. 번호 규칙 48개 + 확정 13건(49~57 · 58~61 목록 필터). **미확정 0건.**

  변경 요청 5건 회신 대기 (CR-0002 조준영 · CR-0003 오민혁 · CR-0004·CR-0005·CR-0007 김락원).
  전부 권장안대로 구현해뒀고, 회신이 다르면 각각 한 곳만 고친다.
  북마크·추천은 `features/engagement/`, 지원서·알림·계약·결제는 다른 기능.
- api-contract.md: 공개 API 9종(`/api/v1`) + 내부 계약 8종(`/internal/v1`).
  내부 계약은 브라우저에서 부를 수 없다 (규칙 49).
- design/ 구성: `_tokens.css`(design-system v1.0 → CSS 변수) ·
  `high-fi-register.html`(SCR-B03~B05) · `high-fi-browse.html`(SCR-B01·B02) ·
  `high-fi-manage.html`(SCR-B06·B07·B10). **필수 요소 목록 합계 43개**,
  전부 PRD §14 문구 정본과 일치하는 것까지 기계 대조함.
- prototype/ 구성: **완료** — 데이터 계층 · 계약 함수 7종 · 공개 API 9종 ·
  engagement 제공 읽기 3종 · 화면 6종.
  `run.tsx` **PASS 300 · FAIL 0**. 결과는 `test-report.md`.

## 상태 모델 — 이 기능의 핵심

```text
recruitment_status      SCHEDULED · OPEN · CLOSED           모집 축 (공개)
transaction_status      NONE · CONTRACT_PENDING ·
                        IN_PROGRESS · COMPLETED · CANCELED   거래 축 (등록 의뢰인만)
```

두 축은 별개다. `projects`에 `status` 단일 컬럼은 없다.

## 프론트엔드 (prototype/web/)
- 주요 컴포넌트: `ProjectRegisterForm`(B03·B04·B05) · `ProjectBrowse`·`ProjectDetail`(B01·B02) ·
  `MyProjectList`·`ProjectEditForm`·`ReopenRecruitmentDialog`(B07·B06·B10)
- 공용 조각: `web/ui.tsx` — Button · Field · Badge · DeadlineIndicator · PermissionAwareActions.
  `design-system/` 에 `.tsx` 가 없어 직접 만들었고 props 는 `design-tokens.md` 와 동일하다
- Mock 계약 상태: 화면은 서버 응답 타입을 그대로 받는다. 잠금 계산을 화면에서 다시 하지 않는다 (규칙 13)

## 백엔드 (prototype/server/)
- 계층 구성: controller → service → repository. 서비스 계층까지 작성됨 (controller 는 팀장 통합 영역)
  - `config.ts` — 루트 `.env` 에서 설정을 읽는다. 운영에서 키가 없으면 서버가 뜨지 않는다
  - `project.types.ts` — 도메인 타입 · DTO · `ProjectContractError`(오류 코드 24종)
  - `ports/project-transaction.port.ts` — **내가 제공하는** 계약 함수 7종의 인터페이스
  - `ports/external.port.ts` — **내가 호출하는** 다른 도메인 4종
  - `mock/seeds.ts` — 시드 18종(공유 10 + 전용 8) · `mock/project.mock.ts` · `mock/external.mock.ts`
  - `project-contract.service.ts` — 계약 함수 7종 구현.
    나머지 1종 `cancelProject`는 의뢰인 요청이라 공개 API(A-07)에 있다
  - `project-read.service.ts` — 다른 도메인에 제공하는 읽기 3종. HTTP 가 아니라 함수 호출이다
  - `project.service.ts` — 공개 API 9종 구현. 잠금 계산(`editableFields` · `availableActions`)은
    서버가 하고 화면은 받아 쓰기만 한다 (규칙 13)
- 주요 API 엔드포인트: `POST /projects` · `GET /projects` · `GET /projects/:projectId` ·
  `PATCH /projects/:projectId` · `DELETE /projects/:projectId` ·
  `POST /projects/:projectId/close-recruitment` · `POST /projects/:projectId/cancel` ·
  `GET /clients/:clientId/projects` · `POST /projects/:projectId/reopen-recruitment`
- 포트: 다른 도메인 호출은 전부 `prototype/server/ports/` 뒤에 둔다 (ADR-0009)

## 다른 기능에 의존하는 것

| 함수 | 제공 | 상태 |
|---|---|---|
| `getProfileCompletion` | 오민혁 | ✅ 확정 (PRD D-58) |
| `claimPricingAnalysisForCreatedProject` | 오민혁 | ✅ 확정 (2026-08-25 회신) |
| `getPricingAnalysisRecommendation` | 오민혁 | ⏳ 회신 대기 (CR-0003) |
| `rejectPendingApplications` | 최윤석 | ✅ 확정 (규칙 57 · 무응답 확정) |
| `invalidateAgreementAndContract` | 조준영 | ✅ 확정 (PRD D-89) |

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-25 | 최초 작성 — spec.md · api-contract.md · index.md |
| 2026-08-25 | design/ high-fi 3파일 추가 — 화면 8종 · 필수 요소 43개 |
| 2026-08-26 | prototype/ 데이터 계층 — 타입 · 포트 2종 · Mock 3종 · run.tsx (PASS 33) |
| 2026-08-26 | 계약 함수 7종 구현 — run.tsx PASS 86 · 변경 요청 CR-0002 · CR-0003 |
| 2026-08-26 | 공개 API 9종 구현 — run.tsx PASS 193 · 시드 `prj_closed_pending` 추가 |
| 2026-08-26 | 화면 6종 + test-report.md — run.tsx PASS 242 · 필수 요소 43개 전부 · CR-0004 |
| 2026-08-28 | engagement 제공 읽기 3종 (CR-0001) — run.tsx PASS 257 |
| 2026-09-01 | 환경 변수 주입 (`config.ts`) — 코드에 박힌 토큰 제거 · run.tsx PASS 265 · CR-0005 |
| 2026-09-02 | ux-philosophy §6 결함 3건 개선 (CR-0006) — 확인 화면 · 예산 출처 · 입력 보존 · run.tsx PASS 300 |
| 2026-09-02 | 목록 필터 규칙 58~61 확정 — 시안의 `필터` 버튼에 대응하는 동작이 없었다 |
