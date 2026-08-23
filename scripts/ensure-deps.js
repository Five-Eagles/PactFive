#!/usr/bin/env node
'use strict';

// 리포 전체가 공유하는 "필수 패키지 확인" 단일 로직.
// - features/*/prototype/run.tsx가 실행 시작 시 이 스크립트를 호출한다.
// - package.json의 preview:dev/preview:build도 npm의 pre<script> 관례로 이 스크립트를 먼저 돌린다
//   (예: "prepreview:dev": "node scripts/ensure-deps.js" — npm run preview:dev를 실행하면
//   npm이 자동으로 prepreview:dev를 먼저 실행한다. 별도 설정 불필요, npm 내장 동작).
// 로직을 여기 한 곳에만 두는 이유: run.tsx가 4개, 앞으로 features/*가 8개 더 생기는데, 설치
// 확인 로직을 파일마다 복사하면 언젠가 하나만 고치고 나머지를 빠뜨리는 사고가 난다
// (sdd-framework/constitution.md 원칙 9: 확장은 파일 1개 + 인덱스 1줄).

const { existsSync } = require('node:fs');
const { execSync } = require('node:child_process');
const path = require('node:path');

function findRepoRoot(startDir) {
  let dir = startDir;
  while (!existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('리포 루트(package.json)를 찾지 못했습니다.');
    }
    dir = parent;
  }
  return dir;
}

function ensureDepsInstalled() {
  const repoRoot = findRepoRoot(__dirname);
  // node_modules/react 존재 여부를 "npm install이 이미 됐는가"의 대표 지표로 쓴다 — package.json이
  // dependencies/devDependencies를 한 번에 설치하므로, react가 있으면 vite·tsx 등 나머지도 같이
  // 설치돼 있다고 본다.
  if (!existsSync(path.join(repoRoot, 'node_modules', 'react'))) {
    console.log('[setup] node_modules/react가 없어 npm install을 자동으로 실행합니다 (최초 1회, 시간이 걸릴 수 있음)...');
    execSync('npm install', { cwd: repoRoot, stdio: 'inherit' });
    console.log('[setup] 설치 완료.\n');
  }
}

module.exports = { ensureDepsInstalled, findRepoRoot };

if (require.main === module) {
  ensureDepsInstalled();
}
