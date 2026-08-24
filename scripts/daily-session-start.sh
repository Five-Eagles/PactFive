#!/usr/bin/env bash
# scripts/daily-session-start.sh — 오늘 세션을 시작할 때 가장 먼저 실행하는 사전 점검 스크립트
#
# 사용법: scripts/daily-session-start.sh <기능이름> [브랜치타입]
# 예:     scripts/daily-session-start.sh user-management
#         scripts/daily-session-start.sh payment-confirmation fix
#
# 하는 일:
#   1. 현재 브랜치에 아직 push되지 않은 커밋이 있으면 → 그 브랜치에서 그대로 이어서 작업한다
#      (아무것도 새로 만들지 않는다).
#   2. 없으면 → main을 체크아웃·pull해서 최신화한 뒤, "<브랜치타입>/<기능이름>" 브랜치로
#      이동한다. 그 브랜치가 로컬/원격에 이미 있으면 그대로 재사용하고 main을 merge해서
#      최신 상태로 맞추며, 없으면 새로 만든다.
#
# 브랜치명 규칙: docs/naming-convention.md §13, scripts/mark-synced.sh와 동일하게
# "<type>/<기능이름>"을 그대로 쓴다. 날짜를 붙이지 않는다 — 날짜를 붙이면
# mark-synced.sh가 커밋 해시를 찾을 때 쓰는 브랜치명 가정("feature/<기능이름>")이 깨진다.
#
# 절대 하지 않는 것: main·develop·release 브랜치로의 직접 커밋. (근거: docs/decisions/0010-daily-session-branch-enforcement.md)

set -euo pipefail

FEATURE="${1:?기능 이름을 입력하세요 (예: user-management)}"
BRANCH_TYPE="${2:-feature}"
TARGET_BRANCH="${BRANCH_TYPE}/${FEATURE}"
PROTECTED=("main" "develop" "release")

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
echo "[daily-session-start] 현재 브랜치: $CURRENT"

UNPUSHED=0
if git rev-parse --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  if [ "$(git rev-list '@{u}..HEAD' --count)" -gt 0 ]; then
    UNPUSHED=1
  fi
elif [ -n "$(git log --oneline -1 2>/dev/null || true)" ] && ! is_protected "$CURRENT"; then
  # 원격 추적 브랜치가 아예 없는 로컬 브랜치 — 커밋이 하나라도 있으면 "안 올라간 작업"으로 취급
  UNPUSHED=1
fi

if [ "$UNPUSHED" -eq 1 ] && ! is_protected "$CURRENT"; then
  echo "[daily-session-start] '$CURRENT'에 아직 push되지 않은 커밋이 있습니다."
  echo "[daily-session-start] 새 브랜치를 만들지 않고 여기서 이어서 작업합니다."
  exit 0
fi

echo "[daily-session-start] push되지 않은 커밋이 없습니다 — main을 최신화합니다."
git checkout main
git pull origin main

if git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}"; then
  echo "[daily-session-start] 로컬에 '${TARGET_BRANCH}'가 이미 있습니다 — 이동 후 main을 merge합니다."
  git checkout "${TARGET_BRANCH}"
  git merge main --no-edit
elif git ls-remote --exit-code --heads origin "${TARGET_BRANCH}" >/dev/null 2>&1; then
  echo "[daily-session-start] 원격에 '${TARGET_BRANCH}'가 있습니다 — 로컬로 받아온 뒤 main을 merge합니다."
  git checkout -b "${TARGET_BRANCH}" "origin/${TARGET_BRANCH}"
  git merge main --no-edit
else
  echo "[daily-session-start] '${TARGET_BRANCH}'를 새로 만듭니다."
  git checkout -b "${TARGET_BRANCH}"
fi

echo "[daily-session-start] 준비 완료 — 현재 브랜치: $(git rev-parse --abbrev-ref HEAD)"
