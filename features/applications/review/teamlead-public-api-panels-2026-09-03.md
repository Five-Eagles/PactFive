# 공개 API·패널 통합 요청 — 팀장

| | |
|---|---|
| 받는 사람 | 팀장 (`app/` 통합 · ADR-0006) |
| 보내는 사람 | 조준영 · applications |
| 날짜 | 2026-09-03 |
| 정본 | `spec.md` 규칙 1~10 · `design/high-fi.html` · `api-contract.md` · `prototype/` Mock |
| 목적 | app에 없는 지원 패널·공개 API를 팀장이 옮길 때 쓸 한 장 |

조준영은 `app/`을 직접 채우지 않는다. 원본은 `features/applications/`에 있다
(ADR-0006). Increment는 PR [#52](https://github.com/Five-Eagles/PactFive/pull/52).
`npx tsx features/applications/prototype/run.tsx` → PASS 30.

---

## Discord

조준영(applications)입니다. 지원 패널 3뷰와 공개 API가 `app/`에 없습니다. 웹 `/applications`는 `NotIntegratedPage`입니다. 서버 `ApplicationsPort`는 아직 unavailable입니다(`rejectPendingApplications`만 있고 `FAILED`). 시안 정본은 `design/high-fi.html`, prototype 참고는 `ApplicationPanel.tsx`, Mock은 `createApplicationApiMock`입니다. 공개는 create/list/accept/reject, 내부는 `rejectPendingApplications`입니다. PATCH 없습니다. 수락 후 합의 진입은 `AcceptedApplicationHandoff`입니다. 알림은 publish만, 발송은 notifications입니다. 실 C-01 HTTP는 유동우입니다. `app/`은 팀장님만 수정해 주세요. 정본: `features/applications/review/teamlead-public-api-panels-2026-09-03.md`.

---

## 웹 — 패널 3뷰

지금 `app/web`의 `/applications`는 `NotIntegratedPage`다. `ApplicationPanel` import는 app에 없다.

| 화면 | 구조 정본 (시안) | 참고 (prototype) |
|---|---|---|
| 지원하기 | `design/high-fi.html` | `ApplicationPanel.tsx` `view="apply"` |
| 지원자 관리 | `design/high-fi.html` | `view="manage"` · 409는 `view="conflict"` |
| 내 지원 현황 | `design/high-fi.html` | `view="mine"` |

시안이 구조 정본이다. prototype 패널은 동작·카피 참고다. 둘이 다르면 시안이 옳다
(`app/web/AGENTS.md`). 앱 셸·수정·삭제 버튼은 넣지 않는다. 필수 요소는 시안 표
(자기소개·희망 금액·예상기간·지원하기 / 지원자 목록·수락·거절 / 내 지원 현황 /
불러오는 중·불러오지 못했습니다·다시 시도 / 「다른 지원자가 먼저 수락되었습니다」).

로딩·실패 상태도 같은 시안 파일에 있다 (`view="loading"` · `view="loadFailed"`).

---

## 서버 — 공개 API + 내부 일괄 거절

정본: `features/applications/api-contract.md`.
Mock: `createApplicationApiMock` (`prototype/index.ts` export).

| 경로 | 함수 |
|---|---|
| `POST /api/v1/projects/:projectId/applications` | `createApplication` |
| `GET /api/v1/projects/:projectId/applications` | `listProjectApplications` |
| `GET /api/v1/applications/me` | `listMyApplications` |
| `POST /api/v1/applications/:applicationId/accept` | `acceptApplication` |
| `POST /api/v1/applications/:applicationId/reject` | `rejectApplication` |

브라우저. `Authorization: Bearer <accessToken>`. 상태 변경 POST는 `Idempotency-Key` 필수.
생성·내 지원 = 해당 프리랜서. 목록·수락·거절 = 해당 의뢰인.

내부 — `rejectPendingApplications`는 브라우저 `/api/v1`이 아니다. 정본은 함수명 (D-48).
유동우가 마감·취소 후 호출한다. 지금 app `ApplicationsPort`는 이 함수만 있고
`createUnavailableApplicationsPort()`가 `FAILED`를 반환한다. 공개 라우트는 없다.

PATCH/PUT/DELETE `/applications` 없음. 공개 라우트로 다시 만들지 않는다.

수락은 ① `acceptProjectApplication` 성공 ② 잔여 `PENDING` → `REJECTED` +
`AUTO_OTHER_ACCEPTED` ③ 알림 발행. C-01 실패 시 거절·알림을 하지 않는다 (규칙 3).
실 `acceptProjectApplication` HTTP는 유동우. 조준영 Mock은 포트 스탠드인만 쓴다.

---

## 손잡이 · 알림

수락 후 손잡이는 `AcceptedApplicationHandoff`
(`projectId` · `acceptedApplicationId` · `transactionStatus: "CONTRACT_PENDING"`).
contracts-payments는 손잡이가 있을 때만 `proposeNegotiationOffer`에 들어간다.
손잡이 없이 propose를 열지 않는다.

알림 4종(`APPLICATION_SUBMITTED` · `APPLICATION_ACCEPTED` · `APPLICATION_REJECTED` ·
`APPLICATION_AUTO_REJECTED`)은 포트에 **쌓기만** 한다. 발송·Kakao는 notifications.

---

## 해당 없음

`app/web`·`app/server`를 조준영이 수정, PR #52 재작업, 알림 발송,
실 C-01 HTTP, `develop` 직접 push.

---

## 확인

| # | 질문 | 예 | 아니오 | 대안 메모 |
|---|---|---|---|---|
| I1 | `design/high-fi.html`을 패널 구조 정본으로 웹에 넣을 수 있는가 | | | |
| I2 | 공개 create/list/accept/reject만 서빙하고 `ApplicationsPort` unavailable을 연결하는가. PATCH는 없는가 | | | |
| I3 | 합의 진입을 `AcceptedApplicationHandoff` 이후로 묶는가 | | | |
| I4 | 알림은 발행만이고 발송은 notifications인가 | | | |

회신 전에도 `features/applications/` 원본은 유지한다. `app/` 반영은 팀장만 한다.
