# CR-0009 — `npm run dev` 가 새로 받은 리포에서 실패한다

| | |
|---|---|
| 제기 | 유동우 (project-management) · 2026-09-02 |
| 대상 | 김락원 (팀장 · `scripts/` · 루트 `package.json`) |
| 상태 | 제안 — 한 줄 수정 |
| 영향 | **전원.** 리포를 새로 받은 사람이 앱을 띄우지 못한다 |

## 증상

```
> predev
> node scripts/ensure-app-deps.js

> dev
> concurrently --names server,web ...

'concurrently'은(는) 내부 또는 외부 명령, 실행할 수 있는 프로그램, 또는
배치 파일이 아닙니다.
```

오늘 통합 앱을 띄우다가 실제로 만났다. `npm install` 을 루트에서 한 번 돌리면 사라진다.

## 원인

설치 확인 스크립트가 두 개인데 **`predev` 가 한쪽만 부른다.**

| 스크립트 | 설치 대상 | `predev` 가 부르는가 |
|---|---|---|
| `scripts/ensure-app-deps.js` | `app/server` · `app/web` | ✅ |
| `scripts/ensure-deps.js` | **리포 루트** | ❌ |

`concurrently` 는 루트 `devDependencies` 에만 있다. 실제로 확인했다.

| 위치 | `node_modules/.bin/concurrently` |
|---|---|
| 리포 루트 | 있음 |
| `app/server` | 없음 |
| `app/web` | 없음 |

`dev` 스크립트를 실행하는 것은 루트이므로 루트 `node_modules` 가 있어야 하는데,
`predev` 는 그것을 확인하지 않는다.

npm workspaces 를 쓰지 않기로 했으므로(`app/server/AGENTS.md`) 세 곳의 `node_modules`
가 각자 있어야 한다 — `ensure-app-deps.js` 주석도 그렇게 적고 있다. 그 셋 중
**루트만 자동 설치에서 빠져 있다.**

## 제안

루트 `package.json` 의 `predev` 한 줄을 고친다.

```diff
- "predev": "node scripts/ensure-app-deps.js",
+ "predev": "node scripts/ensure-deps.js && node scripts/ensure-app-deps.js",
```

`ensure-deps.js` 는 `node_modules/react` 유무로 판정하므로 이미 설치된 환경에서는
아무 일도 하지 않는다. 부작용이 없다.

**덤으로 하나 더 해결된다.** `ensure-deps.js` 는 `git core.hooksPath` 를
`scripts/git-hooks` 로 잡아 `main`·`develop`·`production` 직접 push 를 막는다.
지금은 `npm run preview:dev` 를 돌려 본 사람만 그 훅이 걸린다. `predev` 에 넣으면
앱을 한 번이라도 띄운 사람은 전부 걸린다.

## 대안 — `scripts/run-integrated-app.sh`

이 스크립트는 `concurrently` 를 쓰지 않고 두 프로세스를 직접 띄우므로 지금도 동작한다.
다만 bash 라 Windows 기본 셸에서는 바로 안 된다. `npm run dev` 를 고치는 쪽이 낫다.

## 확인 방법

루트 `node_modules` 를 지우고 `npm run dev` 를 실행한다. 수정 전에는 위 오류가 나고,
수정 후에는 설치가 먼저 돌고 서버·웹이 뜬다.

## 이 CR 이 아닌 것

`app/` 코드에는 문제가 없다. 오늘 전부 확인했다.

| 검사 | 결과 |
|---|---|
| `app/server` typecheck | 통과 |
| `app/web` typecheck | 통과 |
| 프로토타입 6개 테스트 | PASS 585 · FAIL 0 |

막히는 것은 실행 진입점 한 곳뿐이다.
