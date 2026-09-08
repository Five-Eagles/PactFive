#!/usr/bin/env node
'use strict';

// npm run dev:mock-auth — `.env`를 손대지 않고, 묻지도 않고 이번 실행만 AUTH_PROVIDER_MODE를
// mock으로 띄운다. `npm run dev`(scripts/dev.js)가 매번 물어보는 게 번거로울 때 쓰는
// 지름길이다 — dev.js는 AUTH_PROVIDER_MODE가 이미 환경변수로 와 있으면 묻지 않고 그대로
// 쓰므로, 여기서 값을 미리 채워 `npm run dev`를 그대로 재호출하기만 하면 된다.
//
// 왜 필요한지: `.env`의 AUTH_PROVIDER_MODE는 팀원이 실 Supabase 인증 흐름을 검증할 때 쓰려고
// `supabase`로 고정해 둔 값이다. 그런데 app/web의 DevAuthToggle(로컬 전용 mock 로그인
// 위젯, features/user-management/DevAuthToggle.tsx)은 app/server가 mock 모드일 때만
// 인정하는 고정 토큰(auth.mock.ts)을 쓴다(2026-09-07 대화 참고).
//
// 자식 프로세스(`npm run dev`)의 환경변수에만 AUTH_PROVIDER_MODE=mock을 얹어서 넘긴다 —
// dotenv는 기본적으로 이미 설정된 환경변수를 덮어쓰지 않으므로(express-app.ts 주석
// "override: false" 참고) `.env` 파일의 `supabase` 값은 이 프로세스 트리 안에서만
// 무시되고, 파일 자체는 전혀 수정되지 않는다.
//
// 이미 셸에서 AUTH_PROVIDER_MODE를 지정해 실행한 경우(예: CI, 다른 자동화)는 그 값을
// 존중한다 — 여기서 강제로 덮어쓰지 않는다.

const { spawn } = require('node:child_process');

if (!process.env.AUTH_PROVIDER_MODE) {
  process.env.AUTH_PROVIDER_MODE = 'mock';
}

console.log(`[dev:mock-auth] AUTH_PROVIDER_MODE=${process.env.AUTH_PROVIDER_MODE}로 npm run dev를 시작합니다.`);
console.log('[dev:mock-auth] .env 파일은 건드리지 않습니다 — 이 창을 닫으면 원래 설정(.env)으로 돌아갑니다.');

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: true, // Windows에서 npm.cmd를 곧바로 찾지 못하는 문제를 피한다.
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
