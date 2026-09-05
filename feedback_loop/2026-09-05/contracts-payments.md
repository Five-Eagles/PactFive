# contracts-payments 피드백 — 2026-09-05 통합 (PR #64 충돌 해결 + 브랜치 운영 제안)

반영 커밋(review 기준): 로컬 전용 `51c7465`(브랜치 `review/contracts-payments-merge`, develop
기준 새 브랜치에 `origin/feature/contracts-payments` merge). **아직 push도 develop 반영도
안 됨** — 팀장이 확인 후 직접 push·PR·merge 진행 필요.
sync-log.md 기록: 없음 — 이 브랜치가 develop에 실제로 merge된 뒤 기록한다.

> 상태 값 규칙·담당자 작업 흐름은 `feedback_loop/README.md` 참고.
> `상태:` 줄은 담당자만 고친다. 항목 본문(Fact/근거)은 팀장 소유다.

---

## 항목 1 — PR #64가 develop과 충돌해 팀장이 rebase 대신 merge로 대신 해결했다

상태: 미확인

**Fact — spec/api-contract에 없던 부분**
- PR #64(`feature/contracts-payments`, "합의부터 취소까지... 규칙 23~25로 닫는다")의 분기점은
  `68037aa`로, PR #58("합의 AGR-01·납품 DLV-01", 같은 조준영님의 더 이른 작업)이 develop에
  merge되기 **이전**이었다. 그 뒤로 rebase 없이 17커밋을 더 쌓아, GitHub에서
  `mergeable: false, mergeable_state: dirty`로 막혀 있었다.
- 실제 충돌 파일 15개는 전부 `features/contracts-payments/` 안(spec.md, api-contract.md,
  run.tsx, index.tsx, ui.tsx, AgreementPanel.tsx 등)이었다.

**어떻게 채웠는지**
- 팀장이 각 충돌 파일을 직접 diff해 확인: develop 쪽(PR #58)은 항상 PR #64 쪽 내용의
  **부분집합**이었다 — 예를 들어 `agreement.view-model.ts`는 develop 쪽에 없는 재제안
  권한(`canCounter`)·과거 라운드 표시(`superseded`)·수신자 판별 로직이 PR #64에만 있었고,
  `spec.md`도 develop 쪽엔 "재제안·정산·환불은 Increment 1 밖"이라 적혀 있는데 PR #64가 정확히
  그 항목들을 구현해 완성한 것이었다. 두 사람이 다른 설계를 낸 충돌이 아니라 **같은 사람의 이전
  버전과 이후 버전** 충돌이라고 판단해, `git rebase` 대신 `git merge`(develop 기준 새 브랜치
  `review/contracts-payments-merge`)로 한 번에 처리하고 충돌 15개 파일은 전부 PR #64 쪽
  ("theirs")을 채택했다.
- 검증: `npx tsx features/contracts-payments/prototype/run.tsx` → **PASS 321 / FAIL 2**.
  실패 2건(`규칙 9: sandbox 잘못된 키/retrieve`)은 Toss 결제 sandbox에 실제 네트워크 호출하는
  테스트인데, 이 작업 환경이 해당 도메인에 네트워크 접근이 안 돼서 나는 환경 문제다 — PR #64
  본문의 "PASS 323"과 사실상 동일한 결과로 본다.

**왜 그렇게 채웠는지 (근거)**
- 근거 없음 — 팀장(AI 협업자) 판단. 오늘이 주말이라 조준영님께 즉시 확인받기 어려운 상황에서,
  진행을 막기보다 "완전히 되돌릴 수 있는" 방식(원본 PR #64·브랜치는 손대지 않고, 로컬 새
  브랜치에서만 작업)으로 먼저 풀어두고 사후 확인을 받기로 했다.

**담당자 메모 (조준영 확인 요청 — 재작업이 아니라 확인만 해주면 됨)**
- 확인할 것: `review/contracts-payments-merge` 브랜치(또는 팀장이 develop에 push한 뒤 결과)를
  보고, "충돌 15개 파일에서 PR #64 쪽 내용이 전부 맞게 채택됐는지"만 봐주시면 됩니다. 특히
  `spec.md`·`api-contract.md`는 조준영님이 아니면 의도를 100% 확인하기 어려운 문서라 한 번은
  직접 훑어봐 주세요.
- 이상 없으면 아래 상태를 `반영완료`로 바꿔주시면 이 항목은 닫힙니다. 다른 결정이었어야 했다면
  `재이슈`로 바꾸고 메모에 이유를 남겨주세요.

---

## 항목 2 — [워크플로우 제안] AI 코딩 툴이 merge 이후에도 브랜치 동기화 없이 계속 커밋을 쌓고 있다

상태: 미확인

**Fact — 관찰된 패턴**
- 오늘 확인한 조준영님 소유 브랜치 3개가 전부 같은 패턴을 보였다: `feature/applications`는
  develop 대비 5커밋, `feature/reviews`는 26커밋, `feature/contracts-payments`(PR #64)는
  17커밋이 밀려 있었다. 특히 `feature/reviews`는 이미 PR 5개(#32·#35·#41·#49·#53)가 merge된
  뒤에도 rebase 없이 계속 새 커밋만 쌓여, 실제 파일 diff는 20개 파일(+527/-87)인데 커밋 로그는
  26개나 됐다.
- 세 PR 본문 모두 "Made with Cursor" 표시가 있다 — AI 코딩 에이전트가 커밋을 생성하는 흐름으로
  보인다.

**의견 (Opinion — 팀장 판단, 강제 아님)**
- 사용자가 지적한 대로, PR이 merge된 뒤에도 브랜치가 즉시 재동기화되지 않고 계속 커밋이 쌓이는
  흐름이 반복되고 있다. 이게 쌓이면 오늘처럼 팀장이 한 번에 여러 브랜치·수십 커밋을 뒤늦게
  풀어야 하는 상황이 생기고, 그 과정에서 (오늘처럼) 팀장이 원 작성자 대신 판단해야 하는 부분이
  늘어난다.

**제안하는 워크플로우**
1. **PR이 merge되면 그 자리에서 바로 로컬 브랜치를 `origin/develop`으로 rebase**한 뒤 다음
   작업을 이어간다 — "merge 후 방치"를 금지 규칙으로 둔다.
2. AI 코딩 툴(Cursor 등)에게 맡길 때 "한 세션에 여러 커밋을 계속 쌓아 하나의 거대 PR로
   만들기"보다 **작은 단위로 PR을 자주 열고, merge 직후 바로 동기화 후 다음 작업 지시**하는
   쪽으로 프롬프트/작업 지시 습관을 바꾼다.
3. 새 작업을 시작하기 전 `git fetch && git status -sb`로 "지금 브랜치가 develop 대비 몇 커밋
   뒤처졌는지"를 먼저 확인하는 걸 담당자 개인 습관으로 둔다.
4. (선택, 팀 전체 결정 필요) `sdd-framework/daily-session-start.sh`에 "작업 브랜치가
   `origin/develop` 대비 N커밋 이상 뒤처지면 경고"하는 체크를 추가해 자동으로 알려준다 — 사람이
   매번 기억하지 않아도 되게.

**담당자 메모**
- 이 항목은 조준영님뿐 아니라 팀 전체 작업 습관에 관한 제안입니다. 동의하면 `반영완료`로 바꾸고
  다음 오전 회의 때 팀 규칙으로 올릴지 논의해주세요. 지금 방식이 낫다고 판단되면 `재이슈`로 바꾸고
  이유를 남겨주세요.

---
