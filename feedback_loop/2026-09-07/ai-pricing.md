# ai-pricing 피드백 — 2026-09-07 프로젝트 등록 분석 ID handoff 수정

반영 커밋(prototype 기준): `a9881bd`
통합 기준: `origin/develop 69c182b`, 작업 브랜치 `fix/auth-pricing-integration`
sync-log.md 기록: 있음

> 사용자 승인 범위·공통 검증 결과·배포 미완료 구분은 같은 날짜 `user-management.md` 참조.

## 항목 1 — [충돌] AI 추천 금액과 분석 ID를 등록 요청까지 함께 보존한다

상태: 미확인

**Fact — 원본과 통합 코드의 차이**
- 기존 `ProjectRegisterForm.tsx`는 복귀 query의 금액만 sessionStorage 초안에 저장했다.
  분석 ID는 안내용 React 상태에만 있어 새로고침으로 사라졌고 최종 등록 요청에도 없었다.
- 프로젝트 서버는 이미 선택 필드 `pricingAnalysisId`를 받으면 소유자·승인·미적용 조건을
  검증하고 서버 추천 금액으로 저장하도록 구현돼 있다. ID가 남은 채 예산만 수정하면 서버가
  수동 입력을 덮어쓰므로 ID 전송만 추가해서는 충분하지 않다.

**어떻게 채웠는지**
- `app/web/src/features/project-management/project-registration-draft.ts`에 추천 적용·수동
  변경·등록 요청 생성 순수 함수를 두고 실제 폼에서 사용한다. 기능 간 직접 import는 없다.
- 예산과 분석 ID를 같은 초안 갱신에서 저장한다. 기존 v1 초안은 optional 필드 추가로 호환하며
  이미 작성한 제목·설명·일정·기술을 버리지 않는다. 오래된 초안에 없던 ID를 추측해 복원하지 않는다.
- 최종 POST에 채택한 ID를 전달한다. 수동 금액 변경·빈값·잘못된 값은 ID를 해제하며 숫자상
  동일한 쉼표/공백 서식 변경은 유지한다. 변경 뒤 원금액을 재입력해도 자동 재연결하지 않는다.
- 불완전·중복·유효하지 않은 추천 query는 초안을 덮어쓰지 않는다. 추천용 query 두 개만
  제거하고 다른 query는 보존한다. 최종 권한·추천 금액 판단은 기존 서버가 담당한다.
- 실패 후 입력·ID를 유지하고 기존 `discard`/성공 후 `clear`는 초안과 함께 ID도 지운다.

**왜 그렇게 채웠는지 (근거)**
- `features/ai-pricing/spec.md`의 “프로젝트 등록 중 채택” 및 project-management 규칙 8,
  `api-contract.md`의 “ID가 있으면 budgetAmount는 표시용” 계약을 복구했다.
- 날짜·API 경로·요청 필드 정의·DB 스키마·서버 소스는 바꾸지 않았다. 새 화면을 만들지 않고
  기존 SCR-B03~B05의 상태/요청 연결만 수정했다.

**검증 — 2026-09-07**
- 초안/요청 회귀 12/12 PASS: 추천 채택, 직렬화 복원, 기존 v1 호환, 수동/서식 변경,
  재선택, 무효 query, StrictMode 반복 적용, 오류 후 재시도.
- 실제 앱 controller→service→claim adapter→두 메모리 저장소 회귀 8/8 PASS:
  AI 출처·서버 금액·claim 기록, 직접 입력, 타 사용자·미승인·없는/재사용 분석 거절·롤백.
- 브라우저에서 추천 반영→query 정리→새로고침→최종 POST의 ID/금액을 loopback 수신기로
  확인했다. 503 후 입력이 남고, 수동 예산 변경 후 POST에는 ID 없이 변경 금액이 들어갔다.
  이는 요청 연결 검증이며 실서비스에 프로젝트를 등록한 검증은 아니다.

**담당자 메모**
- 기존 프로젝트 적용 CR-0012, 상세 화면 AI 진입 링크, 9/5 통합 UI 단순화 검토는 범위 밖이다.
- 기본 단위/서버 테스트는 `npm run test:integration`으로 재실행한다.
