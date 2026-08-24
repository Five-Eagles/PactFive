# ADR-0010: 매일 Pull→브랜치→PR 루프 강제 방법

| 항목 | 내용 |
|---|---|
| 상태 | 확정 |
| 작성 | 팀장 + AI 협업자 |
| 날짜 | 2026-08-25 |
| 관련 결정 | ADR-0004 리포 구조(대안 D, 일 단위 통합), `sdd-framework/constitution.md` 원칙 4(매일 통합), `docs/naming-convention.md` §13·§18(Git 네이밍·브랜치 보호) |

---

## 1. 배경 (Context)

ADR-0004는 "일 단위로 소규모 통합을 반복한다"를 채택 이유로 명시했고, `constitution.md` 원칙
4도 이를 "매일 통합"으로 못 박고 있다. 그런데 지금까지 이 절차는 문서(`sdd-framework/feature-workflow.md`,
회의 자료의 "초기 이니셜 프롬프트")로만 안내되고 있었고, 실제로 지켜지는지 확인하거나 어긋난
행동을 막는 장치는 없었다. `.github/workflows/ci.yml`, `deploy.yml`은 현재 둘 다 빈 파일이고,
GitHub 저장소의 Branch Protection Rules도 아직 켜져 있는지 확인되지 않았다 —
`docs/naming-convention.md` §18.1이 "브랜치 보호(main) — PR 필수, 직접 push 금지"를 이미
목표로 적어뒀지만, 이는 아직 실행되지 않은 계획이었다.

## 2. 문제 정의 (Problem)

팀원이 세션을 새로 시작할 때 "지금 pull부터 해야 하는지, 어제 하던 브랜치를 이어가야 하는지"를
매번 판단해야 한다. 판단을 사람(또는 AI)의 기억에 맡기면 다음이 실제로 발생할 수 있다.

- main에 직접 커밋하거나 push한다 (보호 설정이 없으면 막을 방법이 없다)
- 어제 만든 브랜치를 잊고 새로 만들어 작업이 흩어진다
- 검증 없이 push해서 깨진 코드로 PR이 열린다
- PR 생성 권한이 없는 팀원이 실습 중 막혀서 그 자리에서 루프가 끊긴다

## 3. 검토한 대안 (Options)

### 대안 A — 문서·프롬프트 안내만 유지 (현재 상태)

장점: 추가 구현 비용이 없다.
단점: 사람이 매번 손으로 따라야 하고, 절차를 생략해도 아무것도 이를 막지 않는다. Claude
세션에서는 문서만으로 워크플로우가 실측 검증됐지만, Codex·Cursor 등 다른 AI 도구가 같은
지침을 그대로 따르는지는 아직 검증되지 않았다(2026-08-24 회의 안건과 동일한 리스크) — 이
불확실성이 그대로 남는다. **기각.**

### 대안 B — GitHub Branch Protection Rules만 설정

장점: 저장소 서버 단에서 걸리므로 실제로 우회할 수 없는 유일한 방식이다. main·develop·release
직접 push를 완전히 막을 수 있다.
단점: "매일 pull → 브랜치 생성 → 커밋 → 검증 → PR"이라는 절차 자체는 로컬(클라이언트)에서
일어나는 일이라 서버가 관여하지 않는다 — 즉 "직접 push 금지"는 강제할 수 있어도 "매일 새로
시작하는 습관"은 강제하지 못한다. **부분적으로만 해결.**

### 대안 C (채택) — 로컬 세션 스크립트 + GitHub Branch Protection Rules 병행

로컬 스크립트(`scripts/daily-session-start.sh`, `scripts/daily-session-finish.sh`)가 절차를
기본 동작으로 만들고, GitHub Branch Protection Rules가 최종 안전망으로 protected 브랜치 직접
push를 서버 단에서 막는다.

장점: 스크립트가 있으면 절차를 매번 손으로 판단할 필요가 없어(대안 A의 문제 해결), 실수로
따라 하지 않을 가능성이 줄어든다. 동시에 스크립트가 실행되지 않거나 우회되더라도, 서버 설정이
protected 브랜치 직접 push를 최종적으로 막는다(대안 B 단독의 한계 보완).
단점: 두 군데(로컬 스크립트, GitHub 저장소 설정)를 모두 갖춰야 하며, GitHub 저장소 설정은
저장소 admin 권한이 있는 사람이 GitHub 웹에서 직접 켜야 한다 — AI 세션에서 대신 설정할 수
없다(이 세션에 GitHub 자격 증명이 없다는 점은 이전 세션에서 이미 확인됨).

## 4. 결정 (Decision)

대안 C를 채택한다.

**로컬 스크립트 2개**를 추가한다. 둘 다 `scripts/mark-synced.sh`와 동일하게 `set -euo pipefail`
bash 스크립트로 작성하고, 브랜치명 규칙은 `docs/naming-convention.md` §13·`scripts/mark-synced.sh`와
동일하게 `<type>/<기능이름>` 형식을 그대로 쓴다(날짜를 붙이지 않는다 — 날짜를 붙이면
`mark-synced.sh`가 커밋 해시를 찾는 데 쓰는 브랜치명 가정이 깨진다).

- `scripts/daily-session-start.sh <기능이름> [브랜치타입]`
  - 현재 브랜치에 아직 push되지 않은 커밋이 있으면 → 그대로 이어서 작업(아무것도 만들지 않음)
  - 없으면 → `main` 체크아웃 + pull → `<type>/<기능이름>` 브랜치로 이동(로컬/원격에 이미
    있으면 그걸 쓰고 `main`을 merge, 없으면 새로 생성)
- `scripts/daily-session-finish.sh [검증할 run.tsx 경로]`
  - 현재 브랜치가 `main`·`develop`·`release`(또는 그 하위 `release/*` 등)면 즉시 중단하고
    아무것도 push하지 않는다
  - `run.tsx` 경로가 주어지면 `npx tsx`로 실행해 통과할 때만 다음 단계로 진행한다(실패 시
    push하지 않음, 커밋은 로컬에 남음)
  - 현재 브랜치를 push한다
  - `gh` CLI가 인증돼 있으면 `gh pr create`로 PR을 자동 생성한다(이미 있으면 새로 만들지
    않음). 인증돼 있지 않거나 생성 권한이 없으면, push까지만 하고 수동 PR 생성 링크
    (`https://github.com/Five-Eagles/PactFive/compare/main...<브랜치>?expand=1`)를 출력한다

**GitHub 저장소 설정(팀장이 직접 진행)**: `Settings → Branches → Branch protection rules`에서
`main`(추후 `develop`·`release`를 실제로 쓰게 되면 그것도 동일하게) 대상으로 "Require a pull
request before merging"과 "Restrict who can push to matching branches"를 켠다. 이 설정이
꺼져 있는 동안은 로컬 스크립트가 유일한 방어선이라는 점을 팀 전체가 인지해야 한다.

## 5. 남은 리스크 (Risk — 미해결)

- 로컬 스크립트는 "실행을 건너뛰면 무력화된다"는 근본적인 한계가 있다 — 이건 절차를 어기기
  어렵게 만드는 장치이지, 어길 수 없게 만드는 장치가 아니다. 진짜 강제는 GitHub Branch
  Protection Rules가 실제로 켜져 있을 때만 완성된다.
- 이 결정 시점에 GitHub 저장소의 Branch Protection Rules가 실제로 켜져 있는지 이 세션에서
  확인하지 못했다(GitHub 웹 접근 권한이 이 세션에는 없음) — 팀장이 직접 확인·설정해야 한다.
- Codex·Cursor 등 팀원별로 다른 AI 도구가 이 스크립트 호출 지침을 실제로 따르는지는 아직
  실측 검증되지 않았다(2026-08-24 회의에서 이미 별도 안건으로 다루고 있는 리스크와 동일).
- `gh` CLI가 팀원 전원의 로컬 환경에 설치·인증돼 있는지 확인되지 않았다 — 안 돼 있으면 항상
  "push까지만" 경로를 타게 되며, 이는 설계상 허용된 동작이지만 PR 자동 생성 효과는 줄어든다.

## 6. 영향받는 문서/구조 — 구현 기록 (참고용, 결정 내용 아님)

> 아래는 이 결정이 실제로 어떻게 실행됐는지에 대한 기록이다. §4~§5의 결정 내용을 바꾸는
> 것이 아니다.

- `scripts/daily-session-start.sh`, `scripts/daily-session-finish.sh` 신규 작성.
- 루트 `AGENTS.md`에 두 스크립트와 이 ADR을 가리키는 한 줄 추가.
