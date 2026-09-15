#!/usr/bin/env node
'use strict';

// app/server, app/web의 node_modules를 확인하고 없으면 설치한다. 또한 app/server의
// schema.prisma가 마지막으로 생성된 Prisma client보다 최신이면 재생성한다.
//
// scripts/ensure-deps.js와 나란한 역할이지만 대상이 다르다 — 그쪽은 리포 루트(프로토타입
// 실행·프리뷰 하네스용)이고, 이쪽은 실제 배포되는 두 앱이다. 루트는 npm workspaces를
// 도입하지 않기로 했으므로(app/server/AGENTS.md "모노레포 배포 설정") 세 곳의 node_modules가
// 각자 존재하며, 하나의 npm install로 한꺼번에 설치되지 않는다.
//
// package.json의 "predev"가 npm의 pre<script> 관례로 이 파일을 먼저 실행한다.

const { existsSync, statSync } = require('node:fs');
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
    // app/server/package.json의 postinstall이 이미 prisma generate를 돌리므로, 방금 설치가
    // 끝났다면 아래 ensurePrismaClientFresh()가 다시 돌 필요는 없다(mtime이 최신이라 스킵됨).
  }
}

// 2026-09-09 추가 — CR-0013 등 schema.prisma 변경을 develop에서 pull만 받고 이미
// node_modules가 있는 사람(팀원 대부분)은 위 ensureAppDepsInstalled()가 아무것도 하지
// 않는다. app/server/package.json의 "postinstall"이 prisma generate를 돌려주는 건 최초
// npm install 시점뿐이라, 이후 스키마가 바뀔 때마다 각자 손으로 npx prisma generate를
// 다시 돌려야 했다(이번 세션에서도 여러 번 반복된 요청 — #176 등). git이 추적하지 않는
// app/server/src/generated/prisma(.gitignore)의 mtime과 추적되는 schema.prisma의 mtime을
// 비교해서, pull로 schema.prisma가 새로 갱신된 뒤인데 아직 재생성 전이면 자동으로 돌린다.
function ensurePrismaClientFresh() {
  const serverDir = path.join(REPO_ROOT, 'app/server');
  const schemaPath = path.join(serverDir, 'prisma/schema.prisma');
  // generator client의 output(schema.prisma "generator client" 블록)과 같은 경로 —
  // 이 파일 하나만 있어도 전체 생성 여부·최신 시각의 대표값으로 충분하다.
  const generatedMarker = path.join(serverDir, 'src/generated/prisma/client.ts');

  if (!existsSync(schemaPath)) return; // 이 리포 구조가 아니면 손대지 않는다.
  if (!existsSync(path.join(serverDir, 'node_modules'))) return; // 방금 npm install했으면 postinstall이 이미 처리함.

  const schemaMtime = statSync(schemaPath).mtimeMs;
  const generatedMtime = existsSync(generatedMarker) ? statSync(generatedMarker).mtimeMs : 0;
  if (generatedMtime >= schemaMtime) return; // 이미 최신 — 조용히 통과.

  console.log('[setup] schema.prisma가 마지막 Prisma client 생성 이후 바뀌었습니다 — npx prisma generate를 다시 실행합니다...');
  execSync('npm run prisma:generate', { cwd: serverDir, stdio: 'inherit' });
}

module.exports = { ensureAppDepsInstalled, ensurePrismaClientFresh };

if (require.main === module) {
  ensureAppDepsInstalled();
  ensurePrismaClientFresh();
}
