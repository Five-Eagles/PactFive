#!/usr/bin/env bash
# scripts/daily-session-finish.sh — 오늘 작업을 마칠 때 실행 (검증 → push → PR)
#
# 사용법: scripts/daily-session-finish.sh [검증할 run.tsx 경로] [PR 대상 브랜치]
# 예:     scripts/daily-session-finish.sh features/user-management/prototype/run.tsx
#
# 하는 일:
#   1. 현재 브랜치가 main·develop·production(또는 그 하위)이면 즉시 중단한다 —
#      이 스크립트는 그런 브랜치에서 절대 push하지 않는다.
#   2. run.tsx 경로가 주어지면 npx tsx로 실행해 통과하는지 확인한다. 실패하면 push하지
#      않는다(커밋은 로컬에 그대로 남는다).
#   3. 현재 브랜치를 원격으로 push한다.
#   4. gh CLI가 인증돼 있으면 develop을 대상으로 PR을 자동 생성한다(이미 있으면 새로
#      만들지 않음). 인증돼 있지 않거나 PR을 열 권한이 없으면, push까지만 하고 수동
#      생성 링크를 출력한다.
#
# PR 대상이 develop인 이유: PRD v6.4 §0.5 T4(팀 결정, 2026-08-17)가 "develop 통합 브랜치"로
# 확정했다. main으로 직접 열지 않는다.
#
# 근거: docs/decisions/0010-daily-session-branch-enforcement.md §7 구현 기록,
#       실제 보호 브랜치 목록은 scripts/git-hooks/pre-push 참고 (main/develop/production)

set -euo pipefail

PROTECTED=("main" "develop" "production")
REPO="Five-Eagles/PactFive"
PR_BASE="${2:-develop}"

is_protected() {
  local b="$1"
  for p in "${PROTECTED[@]}"; do
    if [ "$b" = "$p" ] || [[ "$b" == "$p"/* ]]; then
      return 0
    fi
  done
  return 1
}

CURRENT="$(git rev-parse --abbrev-ref HEAD)"

if is_protected "$CURRENT"; then
  echo "[daily-session-finish] 거부: '$CURRENT'는 보호 브랜치입니다. 이 스크립트는 여기서 push하지 않습니다." >&2
  exit 1
fi

RUN_TSX="${1:-}"
if [ -n "$RUN_TSX" ]; then
  echo "[daily-session-finish] 검증 실행: npx tsx $RUN_TSX"
  if ! npx tsx "$RUN_TSX"; then
    echo "[daily-session-finish] 검증 실패 — push하지 않습니다. 커밋은 로컬에 남아 있습니다." >&2
    exit 1
  fi
else
  echo "[daily-session-finish] 경고: 검증 대상(run.tsx 경로)이 지정되지 않았습니다 — 검증 없이 진행합니다." >&2
fi

# app/ 을 건드렸다면(= 팀장의 통합 작업) feedback_loop 기록이 빠지지 않았는지 확인한다.
# 통합 절차에서 유일하게 자동화되지 않는 단계라 바쁠 때 가장 먼저 빠진다
# (sdd-framework/integration-workflow.md 4단계, feedback_loop/README.md).
if git diff --name-only "origin/${PR_BASE}...HEAD" 2>/dev/null | grep -q "^app/"; then
  if ! git diff --name-only "origin/${PR_BASE}...HEAD" 2>/dev/null | grep -q "^feedback_loop/"; then
    echo "[daily-session-finish] 경고: app/ 변경이 있는데 feedback_loop/ 기록이 없습니다." >&2
    echo "                       원본에 없던 공백을 채웠거나 기능 간 충돌을 조정했다면" >&2
    echo "                       feedback_loop/\$(date +%F)/{기능}.md 에 남겨야 합니다." >&2
    echo "                       정말 아무것도 채우지 않았다면 이 경고는 무시해도 됩니다." >&2
  fi
fi

echo "[daily-session-finish] push: origin/${CURRENT}"
git push -u origin "${CURRENT}"

COMPARE_URL="https://github.com/${REPO}/compare/${PR_BASE}...${CURRENT}?expand=1"

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "[daily-session-finish] gh CLI 인증 확인됨 — PR 생성을 시도합니다. (base: ${PR_BASE})"
  if gh pr view "${CURRENT}" >/dev/null 2>&1; then
    echo "[daily-session-finish] 이 브랜치의 PR이 이미 있습니다 — 새로 만들지 않습니다."
  elif ! gh pr create --fill --base "${PR_BASE}" --head "${CURRENT}"; then
    echo "[daily-session-finish] PR 자동 생성 실패(권한 부족 등) — 아래 링크에서 직접 만드세요:" >&2
    echo "  ${COMPARE_URL}" >&2
  fi
else
  echo "[daily-session-finish] gh CLI 인증(또는 PR 생성 권한)이 없습니다 — push까지만 완료했습니다."
  echo "[daily-session-finish] 아래 링크에서 직접 PR을 생성하세요:"
  echo "  ${COMPARE_URL}"
fi
