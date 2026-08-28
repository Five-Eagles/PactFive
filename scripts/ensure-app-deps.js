#!/usr/bin/env node
'use strict';

// app/server, app/web의 node_modules를 확인하고 없으면 설치한다.
//
// scripts/ensure-deps.js와 나란한 역할이지만 대상이 다르다 — 그쪽은 리포 루트(프로토타입
// 실행·프리뷰 하네스용)이고, 이쪽은 실제 배포되는 두 앱이다. 루트는 npm workspaces를
// 도입하지 않기로 했으므로(app/server/AGENTS.md "모노레포 배포 설정") 세 곳의 node_modules가
// 각자 존재하며, 하나의 npm install로 한꺼번에 설치되지 않는다.
//
// package.json의 "predev"가 npm의 pre<script> 관례로 이 파일을 먼저 실행한다.

const { existsSync } = require('node:fs');
const { execSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const APPS = ['app/server', 'app/web'];

function ensureAppDepsInstalled() {
  for (const app of APPS) {
    const dir = path.join(REPO_ROOT, app);
    if (existsSync(path.join(dir, 'node_modules'))) continue;

    console.log(`[setup] ${app}/node_modules가 없어 npm install을 실행합니다 (최초 1회)...`);
    execSync('npm install', { cwd: dir, stdio: 'inherit' });
  }
}

module.exports = { ensureAppDepsInstalled };

if (require.main === module) {
  ensureAppDepsInstalled();
}
