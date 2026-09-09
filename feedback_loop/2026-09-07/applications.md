# applications 피드백 — 2026-09-07 PR #83 이식

반영 커밋(develop 기준): 6202e16 (`feat(applications): 지원 Mock에 eligibility·202/outbox와 건수 분담을 넣는다 (#83)`)
sync-log.md 기록: 있음

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — 카운트 쓰기(CR-AP-001)를 이번 반영에서 뺐다 (재작업 아님, 예정된 보류)

상태: 반영완료

**Fact**
- `feedback_loop/2026-09-05/applications.md` 항목 2가 이미 지적한 문제(`applicationCount`·
  `pendingApplicationCount`의 쓰기 포트가 project-management 쪽에 없음)가 CR-AP-001로
  정식화됐다. RW(팀장) 확인 결과 아직 승인 대기 — 유동우 쪽 PM 포트 PR이 develop에 없다.
- PR #83의 원본(`features/applications/prototype/server/application.service.ts`)은
  `createApplication`·`rejectApplication`에서 `deps.store.saveProject({ applicationCount,
  pendingApplicationCount })`를 호출한다. app/은 이 두 호출을 그대로 옮기지 않았다.

**어떻게 채웠는지**
- `application.types.ts`의 `ProjectApplicationContext`에 두 필드를 아예 추가하지 않았다 —
  app/은 읽지도 쓰지도 않는다. 서비스 쪽 카운트 증감 로직도 통째로 뺐다(주석으로 위치 표시).

**왜 그렇게 채웠는지 (근거)**
- 2026-09-07 대화에서 RW가 AskUserQuestion으로 "카운트 제외하고 나머지만 먼저(권장)"를
  명시적으로 선택함. CR-AP-001이 머지되면 그때 함께 반영한다.

**담당자 메모**
- 조준영·유동우 — CR-AP-001이 승인·머지되면 팀장에게 알려주세요. `ProjectApplicationContext`
  확장과 `application.service.ts`의 카운트 증감 두 곳만 추가하면 되는 상태로 남겨뒀습니다
  (헤더 주석에 정확한 위치 표시).
- 조준영 2026-09-08 — 보류 결정에 동의합니다. applications 쪽은 더 할 일이 없습니다.
  spec 규칙 2·56 분담과 Mock 생성 +1/+1 · `DIRECT` −1이 이미 들어가 있고 `run.tsx` PASS 97로
  검증됩니다. 남은 선행 조건은 유동우의 쓰기 포트뿐이고, develop `ec1c01f` 기준으로 아직
  없습니다 — CR-AP-001에 재요청 기록을 남겼습니다.
- 화면 증상 확인 — 실제 서비스에서 지원이 들어가도 프로젝트 상세의 「지원 N건」이 0으로
  남습니다. 대기 건수도 0이라 PM 규칙 15(지원자 있으면 예산·모집일정 잠금)가 걸리지
  않습니다. 표시만이 아니라 동작이 틀리는 지점이라 우선순위를 올려 주세요.

---

## 항목 2 — 프로필 완성도 검사(ProfileCompletionPort)도 함께 뺐다 (신규 발견, CR-AP-001과 같은 패턴)

상태: 반영완료

**Fact**
- PR #83 원본은 `createApplication`·`getApplicationEligibility`에서
  `deps.profiles.getProfileCompletion(userId)`를 호출해 `PROFILE_INCOMPLETE`를 판정한다.
  이 포트(`ProfileCompletionPort`, "오민혁 정본")는 user-management 소유인데, app/server의
  user-management 폴더에는 인증(auth) 코드만 있고 프로필 관련 코드가 전혀 없다.
- 원본 포트 파일(`profile-completion.port.ts`) 자체의 주석이 "기본 COMPLETE 우회 금지"라고
  못박아 뒀다 — 가짜 어댑터로 항상 COMPLETE를 반환하게 만드는 건 그 지침을 정면으로 어긴다.

**어떻게 채웠는지**
- 검사 자체를 생략했다. `getApplicationEligibility`의 `profileCompletion`은 항상 `null`,
  `blockedReasons`에 `PROFILE_INCOMPLETE`는 절대 들어가지 않는다. `createApplication`도
  프로필을 확인하지 않는다. 응답 타입(`EligibilityResponse` 등)은 계약 그대로 유지해서,
  나중에 실제 포트가 붙어도 화면 쪽 타입은 안 바뀐다.

**왜 그렇게 채웠는지 (근거)**
- 근거 없음 — 팀장(AI 협업자) 판단. CR-AP-001과 구조적으로 동일한 "아직 없는 외부 포트에
  의존" 패턴이라 같은 방식(보류 + 문서화)으로 처리했다. RW의 "카운트 제외" 결정이 나온
  뒤에 발견해서 별도로 재확인받지 못했다 — 이 항목이 그 확인 요청이다.

**담당자 메모**
- 오민혁 — user-management에 프로필 완성도 관련 스키마·API가 계획돼 있다면 알려주세요.
  포트가 생기면 `application.service.ts`의 `requireProfile` 자리(현재 없음, 원본 참고해
  다시 추가)만 넣으면 됩니다. 급하지 않다면 `상태: 확인` 정도로만 남겨주셔도 됩니다.
- 조준영 2026-09-08 — 가짜 COMPLETE 어댑터를 만들지 않은 판단에 동의합니다. 다만 spec 규칙 1의
  fail-closed(포트 없음·UNAVAILABLE이면 503)는 **그대로 둡니다** — 포트가 없다고 503을 내면
  지원이 전면 불가가 되므로 `app/`에서 검사를 생략한 것은 한시적 이탈로 보고, 스펙을 이탈에
  맞춰 낮추지 않습니다. 오민혁 포트가 붙는 시점에 원본 `requireProfile`을 되돌리면 규칙 1과
  다시 일치합니다.

---

## 항목 3 — GAP-01 정정: 프로젝트 취소 시 일괄 거절의 rejectionType

상태: 반영완료

**Fact**
- 기존 `applications-port.adapter.ts`(PM이 호출하는 반대 방향 포트)는 마감(`RECRUITMENT_CLOSED`)과
  취소(`PROJECT_CANCELED`) 구분 없이 항상 `rejectionType: 'AUTO_RECRUITMENT_CLOSED'`로
  저장했다. PR #83 원본은 취소일 때 `rejectionType: null`로 정정했다("모집 마감"이라는
  구체적 사유가 프로젝트 취소에는 맞지 않는다는 판단으로 보인다).

**어떻게 채웠는지**
- `applications-port.adapter.ts`에 `input.reason === 'PROJECT_CANCELED' ? null :
  'AUTO_RECRUITMENT_CLOSED'` 분기를 추가해 원본과 맞췄다.

**왜 그렇게 채웠는지 (근거)**
- 원본 코드·api-contract.md 최신본이 명시적으로 요구하는 값이라 그대로 따랐다. 별도 판단
  없음.

**담당자 메모**
- 조준영 — 의도한 정정이 맞는지만 확인해 주세요. 화면(`MyApplicationsPage`)의
  `rejectionType`별 안내 문구는 아직 `REJECTED`/`PENDING`/`ACCEPTED` 상태 라벨만 쓰고
  `rejectionType`별 세부 문구(`REJECTION_COPY`)는 반영 전입니다 — 필요하면 다음 반영에서
  추가하겠습니다.
- 조준영 2026-09-08 — 의도한 정정이 맞습니다. 취소는 「모집 마감」이 아니라서 기존 4종
  중에 맞는 값이 없고, 새 enum을 추가하면 ERD 변경이 되므로 GAP-01에서 `null`로 뒀습니다
  (spec 규칙 8). `REJECTION_COPY` 세부 문구는 CR-0002 후속 범위로 함께 다루겠습니다.

---
