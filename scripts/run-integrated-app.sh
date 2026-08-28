#!/usr/bin/env bash
# scripts/run-integrated-app.sh — 통합 앱(app/server + app/web)을 로컬에서 동시에 실행한다
#
# 사용법: scripts/run-integrated-app.sh
#
# 하는 일:
#   1. app/server, app/web 각각 node_modules가 없으면 npm install
#   2. app/server를 3000번 포트, app/web을 5174번 포트에서 동시에 실행
#      (app/web/vite.config.ts가 /api 요청을 3000번으로 프록시하므로 CORS 설정 불필요)
#   3. Ctrl+C 한 번으로 두 프로세스를 함께 종료
#
# 인증 모드: AUTH_PROVIDER_MODE를 따로 지정하지 않으면 app/server/src/app.ts가
# 로컬 개발 기본값(mock)으로 동작한다 — Supabase 자격증명이 없어도 실행된다.
#
# 참고: app/web/AGENTS.md, app/server/AGENTS.md, vite.config.ts

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/app/server"
WEB_DIR="$ROOT_DIR/app/web"

SERVER_PID=""
WEB_PID=""

cleanup() {
  echo ""
  echo "[run-integrated-app] 종료 중..."
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -n "$WEB_PID" ] && kill "$WEB_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

if [ ! -d "$SERVER_DIR/node_modules" ]; then
  echo "[run-integrated-app] app/server 의존성 설치 중..."
  (cd "$SERVER_DIR" && npm install)
fi

if [ ! -d "$WEB_DIR/node_modules" ]; then
  echo "[run-integrated-app] app/web 의존성 설치 중..."
  (cd "$WEB_DIR" && npm install)
fi

echo "[run-integrated-app] app/server 실행 (http://localhost:3000) ..."
(cd "$SERVER_DIR" && npm run dev) &
SERVER_PID=$!

echo "[run-integrated-app] app/web 실행 (http://localhost:5174) ..."
(cd "$WEB_DIR" && npm run dev) &
WEB_PID=$!

echo ""
echo "[run-integrated-app] 준비되면 브라우저에서 http://localhost:5174 접속"
echo "[run-integrated-app] 종료하려면 Ctrl+C"
echo ""

wait
