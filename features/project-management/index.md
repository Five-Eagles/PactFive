# project-management Index

## 담당자
- 유동우

## 스펙 (features/project-management/)
- spec.md 핵심 요약: 프로젝트 게시물의 일생 — 등록(3단계) · 조회·검색 · 수정(조건부 잠금) ·
  소프트 삭제 · 모집 마감 · 취소 · 재모집. 번호 규칙 48개 + 확정 6건(49~54).
  북마크·추천은 `features/engagement/`, 지원서·알림·계약·결제는 다른 기능.
- api-contract.md: 공개 API 9종(`/api/v1`) + 내부 계약 8종(`/internal/v1`).
  내부 계약은 브라우저에서 부를 수 없다 (규칙 49).
- design/, prototype/ 구성: 작성 예정 (design/ high-fi 10화면, prototype/ Mock + 구현 초안)

## 상태 모델 — 이 기능의 핵심

```text
recruitment_status      SCHEDULED · OPEN · CLOSED           모집 축 (공개)
transaction_status      NONE · CONTRACT_PENDING ·
                        IN_PROGRESS · COMPLETED · CANCELED   거래 축 (등록 의뢰인만)
```

두 축은 별개다. `projects`에 `status` 단일 컬럼은 없다.

## 프론트엔드 (prototype/web/)
- 주요 컴포넌트: 작성 예정 (SCR-B01~B10)
- 주요 훅: 작성 예정
- Mock 계약 상태: 작성 예정

## 백엔드 (prototype/server/)
- 계층 구성: 작성 예정 (controller → service → repository)
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
| `rejectPendingApplications` | 최윤석 | ⬜ 형태 미확정 (Q-05) |
| `invalidateAgreementAndContract` | 조준영 | ✅ 확정 (PRD D-89) |

## 갱신 이력

| 날짜 | 변경 |
|---|---|
| 2026-08-25 | 최초 작성 — spec.md · api-contract.md · index.md |
