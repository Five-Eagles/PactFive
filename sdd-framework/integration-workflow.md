# 통합 워크플로우 (팀장 전용)

여러 팀원이 각자 폴더에서 만든 원본을 팀장이 검토해 공유 산출물에 반영하는 공통 절차입니다.
`app/`(코드)와 `docs/domain/api-spec/`(API 계약 문서) 모두 이 절차를 따릅니다. 대상이 늘어나도
같은 절차를 재사용합니다.

## 절차

1. 루트 `sync-log.md`에서 해당 기능의 마지막 반영 커밋과 **비고 칸을 함께** 확인한다.
   - 비고에 "다음 통합 대상"처럼 미반영 항목이 적혀 있으면 그 항목부터 먼저 처리한다 —
     2단계의 git diff보다 우선한다. 원본 prototype 커밋 해시는 그대로인데 지난 통합에서
     의도적으로 범위를 좁혀 일부만 반영한 경우이므로, **diff가 비어 있어도 통합할 게 있을 수
     있다** — "diff 없음 = 할 일 없음"으로 넘기지 않는다(2026-08-29 사례: SCR-B06·B10).
   - 미반영 항목과 새 변경분이 같이 있으면 미반영 항목부터 끝내고 새 변경분을 본다 — 오래
     밀린 항목이 새 diff에 섞여 흐려지는 걸 막는다.
2. `git diff <마지막 반영 커밋>..HEAD -- <원본 경로>` 로 변경분만 확인한다. git 히스토리는
   선형이라, 중간 커밋 수와 무관하게 누적 변경분이 diff 한 번으로 전부 나온다.
3. 변경점을 대상 위치에 반영한다. 코드는 diff를 그대로 patch apply 하지 않고 AI가 대상의
   현재 상태·컨벤션에 맞게 다시 구현하며, 문서는 원본 내용을 검토해 사본을 갱신한다.
   - **대상이 `app/`이고 반영 범위에 화면(UI) 코드가 포함되면**, 반영 전에
     `design-system/design-tokens.md` §14 완료 체크리스트(§13 모션 규칙 포함)와
     `ux-philosophy/ux-philosophy.md` §6
     검증 기준표를 통과하는지 팀장이 직접 확인한다. `features/{기능}/prototype/run.tsx`가
     통과했다는 사실은 이 확인을 대신하지 않는다 — `run.tsx`는 담당자의 자체 점검일 뿐 두 체크리스트
     항목(토큰 사용, 상태 커버리지, 접근성, 5원칙 준수 등)을 검사하지 않는다.
   - **화면 구조의 정본은 `features/{기능}/design/*.html`이다.** `prototype/web/*.tsx`가 아니다.
     담당자가 뼈대만 짜두고 시안에서 더 진전시킨 경우가 있어, 둘이 다르면 시안이 옳다.
     시안 파일의 "필수 요소 목록" 섹션만 보고 닫지 않는다 — 그 파일에는 화면의 실제 마크업과
     CSS(단 나누기·사이드바·카드 경계·앱 셸)가 들어 있고, 그게 옮겨야 할 대상이다.
     자세한 정본 순서는 `app/web/AGENTS.md` "무엇이 무엇의 정본인가" 참고.
     (2026-08-28 추가 — 실제로 이 순서를 어겨 SCR-B02의 레이아웃이 통째로 빠졌다)
   - **시안이 상호작용 방식(모달·별도 페이지·인라인 등)까지 정해 주지 않을 수 있다.**
     `design/*.html`은 모든 화면 상태를 개별 스크린으로 나열하는 정적 목업 형식이라, "이 화면이
     오버레이인지 별도 페이지인지"는 그림만으로 확정되지 않을 때가 있다. 이럴 때는
     `prototype/web/*.tsx`의 명시적 마크업(`role="dialog"`, `aria-modal` 등)을 보조 근거로 쓸 수
     있다 — 구조 자체의 정본은 여전히 시안이고, 이건 시안이 답하지 않은 지점에 대한 **보조
     판단**일 뿐이다. 이렇게 판단했다면 확신이 있어도 반드시 4단계 feedback_loop에 "판단 필요"로
     남긴다 — 정본이 명시하지 않은 것을 AI가 대신 정했기 때문이다(2026-08-29 사례: SCR-B10을
     모달로 판단).
   - 반영 전에 `npm run check:design`을 돌린다. 시안이 쓰는 클래스가 `app/web`에 옮겨졌는지,
     화면 코드에 원시 색상값이 박혔는지를 기계로 확인한다. **통과가 "시안과 같다"는 뜻은 아니다** —
     클래스 존재만 보므로, 구조 대조는 여전히 사람이 시안을 열어서 한다.
   - **대상이 `app/web/`이면** `app/web/AGENTS.md`의 "통합 시 확인" 체크리스트(폴더=기능명·
     파일=도메인명, 라우트 등록, 기능 간 직접 import 금지, `shared/http.ts` 경유 호출,
     `VITE_`에 비밀값 금지 등)도 통과하는지 확인한다.
   - **대상이 `app/server/`이면** `app/server/AGENTS.md`의 이중 진입점·port/adapter 규칙을
     따르는지 확인한다.
   - 체크리스트를 통과하지 못하면 반영을 보류하고 `change-requests/`에 조정안을 기록한다
     (아래 "반영이 밀리면" 원칙과 동일하게 처리).
   - **애매한 지점이 나와도 통합을 멈추지 않는다** — 되돌리기 비싼 것(DB 스키마, API 경로·
     요청/응답 형태, 도메인 용어, 기능 간 책임 경계)만 팀장에게 묻고, 나머지는 잠정 결정한 뒤
     아래 4단계에 기록한다. 판단 기준표는 `feedback_loop/README.md` 참고.
4. **아래에 해당하면 `feedback_loop/{오늘 날짜}/{기능}.md`에 기록한다** (양식:
   `feedback_loop/_template.md`, 배경·상태 규칙: `feedback_loop/README.md`).
   - 원본(`spec.md`/`api-contract.md`/`prototype/`)에 정의되지 않은 공백을 임의로 채운 경우
   - 기능 간 계약·용어·상태 정의가 어긋나 한쪽으로 맞춘 경우 (충돌 항목은 한쪽에만 본문을 쓰고
     다른 쪽엔 참조만 남긴다)
   - **`sync-log.md`에 이미 예고돼 있던 미반영 항목을 마무리하는 경우도 예외가 아니다** — "예고된
     작업이니 새로 판단한 게 없다"고 넘기지 않는다. 마무리 과정에서 상호작용 방식·필드 범위 등
     새로 판단한 지점이 있으면 그대로 기록한다.

   각 항목은 `상태: 미확인`으로 시작한다. 해당 사항이 하나도 없으면 파일을 만들지 않는다.
5. 반영 후 `scripts/mark-synced.sh {기능} "비고"`로 `sync-log.md`에 기록한다.
6. 반영 커밋, sync-log 갱신, (있다면) feedback_loop 파일은 같은 커밋으로 묶는다.

## 반영 완료 체크 (커밋 전 확인)

- [ ] `sync-log.md` 비고에 이 기능의 미반영 항목이 남아 있지 않은지(또는 새로 남겼는지) 확인했다
- [ ] 대상별 AGENTS.md 체크리스트를 통과했다
- [ ] (화면을 반영했다면) `npm run check:design`이 통과하고, `SCR-Bxx → app/web 컴포넌트`
      매핑을 통합 기록에 남겼다. 시안에 있는데 만들지 않은 화면은 이유와 함께 적었다
- [ ] 공백을 채웠거나 기능 간 충돌을 조정했다면 `feedback_loop/`에 기록했다 —
      **이 단계는 유일하게 자동화되지 않아 가장 먼저 빠진다.** 통합했는데 피드백 파일이
      없다면 "정말 아무것도 안 채웠는지" 한 번 더 확인한다
- [ ] `scripts/mark-synced.sh`를 실행했다
- [ ] 위 셋이 같은 커밋에 묶여 있다

## 적용 대상

| 대상 | 원본 | 담당 AGENTS.md |
|---|---|---|
| `app/` (코드) | `features/{기능}/prototype/` | `app/AGENTS.md` |
| `docs/domain/api-spec/` (API 계약) | `features/{기능}/api-contract.md` | `docs/domain/AGENTS.md` |

## 공통 원칙

- 원본은 반영 후에도 지우지 않는다. 담당자가 계속 갱신하는 살아있는 원본이다.
- `features/*/prototype/`, `features/*/api-contract.md` 등 원본 브랜치는 force-push(rebase 등)
  금지 — `sync-log.md`에 기록된 커밋 해시가 무효해질 수 있다.
- 반영이 밀리면(팀장 처리 용량 병목) `change-requests/`에 조정안을 기록하고 팀 논의로 조정한다.

## UX 레퍼런스(reference/) 재고정(re-freeze) 절차 (2026-09-03 추가, 2026-09-03 개정)

`ux-philosophy/AGENTS.md`·`sdd-framework/feature-workflow.md`·`design-system/design-tokens.md`
헤더·`app/web/AGENTS.md` 정본 표, 이 넷이 목록·상세류 화면의 구현 예시로
`reference/project-management/*.html`(리포 루트의 **고정 스냅샷**, 개별 파일 7장)을
가리킨다. 같은 폴더의 `project-management-bundle.html`(화면 10장을 base64 이미지까지
인라인한 400KB 단일 파일)도 같은 시점에 같이 고정해 두지만, 이건 사람이 브라우저로
인터랙션을 확인할 때만 쓰는 것이고 AI가 구조 참고용으로 읽는 대상이 아니다(개별 파일이 훨씬
가볍다 — `reference/README.md` 참고).

**처음엔 `features/project-management/design/reference-proposal/`의 원본 파일을 직접
가리켰다.** 원본은 담당자(유동우)가 계속 갱신하는 살아있는 파일이라 최신성은 보장되지만,
여러 기능 담당자가 동시에 구현하는 스프린트 기간에는 참고 기준이 계속 바뀌는 게 오히려
혼란을 만든다는 판단으로 **2026-09-03에 `reference/`에 고정본을 만들어 전환했다** — 팀장·
담당자(유동우) 확인 완료(`feedback_loop/2026-09-03/project-management.md` 항목 5).

고정본은 **자동으로 갱신되지 않는다.** 원본이 계속 바뀌어도 `reference/`의 파일은 다시
얼리기 전까지 그대로다. 팀이 "지금 버전이 오래돼 실제 구현과 너무 벌어졌다"고 판단하면
아래 절차로 다시 얼린다.

- [ ] 원본 `features/project-management/design/reference-proposal/`에서 확정 7장
      (`main.html`·`browse.html`·`detail.html`·`register.html`·`mypage.html`·`edit.html`·
      `reopen.html`) + `_tokens.css` + 그 화면들이 실제로 쓰는 이미지를
      `reference/project-management/`에 다시 복사한다 (원본은 건드리지 않는다)
- [ ] (선택) `node features/project-management/design/reference-proposal/demo/build-bundle.js`로
      `bundle.html`도 다시 만들어 `reference/project-management-bundle.html`에 덮어쓴다 —
      사람이 인터랙션을 확인할 용도라 매번 갱신이 필수는 아니다
- [ ] `reference/README.md`의 "고정 시점"·"고정 시점 커밋" 표를 갱신한다
- [ ] `reference/README.md`의 "범위" 표 — `experts.html`·`expert.html`·`guide.html` 3장이
      그사이 ERD·PRD 근거가 생기고 담당자가 정해졌는지 확인해 반영한다 (아직이면 그대로 둔다)
- [ ] CR-0011(대표페이지 담당을 유동우로) 상태가 바뀌었는가 — 바뀌었으면 PRD §7.1과 위 넷의
      "담당(유동우)" 표기를 함께 맞춘다
- [ ] `feedback_loop/{오늘 날짜}/project-management.md`에 재고정 사실을 기록한다 (무엇이
      바뀌어서 다시 얼렸는지 — 담당자가 확인할 수 있어야 한다)

이 재고정은 **매 통합마다 자동으로 하는 절차가 아니다** — 위 조건("실제 구현과 너무
벌어졌다")을 팀이 판단했을 때만 한다. 매 통합 시 자동으로 원본과 대조하던 이전 절차(2026-09-03
1차 버전)는 고정 모델로 바뀌면서 더 이상 맞지 않아 이 절차로 대체했다.
