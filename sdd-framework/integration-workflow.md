# 통합 워크플로우 (팀장 전용)

여러 팀원이 각자 폴더에서 만든 원본을 팀장이 검토해 공유 산출물에 반영하는 공통 절차입니다.
`app/`(코드)와 `docs/domain/api-spec/`(API 계약 문서) 모두 이 절차를 따릅니다. 대상이 늘어나도
같은 절차를 재사용합니다.

## 절차

1. 루트 `sync-log.md`에서 해당 기능의 마지막 반영 커밋을 확인한다.
2. `git diff <마지막 반영 커밋>..HEAD -- <원본 경로>` 로 변경분만 확인한다. git 히스토리는
   선형이라, 중간 커밋 수와 무관하게 누적 변경분이 diff 한 번으로 전부 나온다.
3. 변경점을 대상 위치에 반영한다. 코드는 diff를 그대로 patch apply 하지 않고 AI가 대상의
   현재 상태·컨벤션에 맞게 다시 구현하며, 문서는 원본 내용을 검토해 사본을 갱신한다.
4. 반영 후 `scripts/mark-synced.sh {기능} "비고"`로 `sync-log.md`에 기록한다.
5. 반영 커밋과 sync-log 갱신은 같은 커밋으로 묶는다.

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
