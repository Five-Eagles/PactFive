#!/usr/bin/env bash
# scripts/mark-synced.sh — app/ 통합을 마친 뒤 sync-log.md에 기록
#
# 사용법: scripts/mark-synced.sh <기능이름> ["비고"]
# 예:     scripts/mark-synced.sh user-management "로그인 플로우 반영"
#
# 전제: 기능별 prototype 작업은 "feature/<기능이름>" 브랜치에서 이뤄진다는 규칙을 따름.
#       브랜치 명명 규칙이 다르면 아래 PROTOTYPE_BRANCH 라인을 팀 규칙에 맞게 수정할 것.

set -euo pipefail

FEATURE="${1:?기능 이름을 입력하세요 (예: user-management)}"
NOTE="${2:-}"
DATE=$(date +%Y-%m-%d)
PROTOTYPE_BRANCH="feature/${FEATURE}"

COMMIT_HASH=$(git rev-parse --short "${PROTOTYPE_BRANCH}" 2>/dev/null || echo "확인필요")

echo "| ${DATE} | ${FEATURE} | ${COMMIT_HASH} | ${NOTE} |" >> sync-log.md

echo "sync-log.md 기록 완료: ${FEATURE} @ ${COMMIT_HASH} (${DATE})"
