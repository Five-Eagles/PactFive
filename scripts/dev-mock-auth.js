#!/usr/bin/env node
'use strict';

// npm run dev:mock-auth — `.env`를 손대지 않고 이번 실행만 AUTH_PROVIDER_MODE를 mock으로
// 띄운다.
//
// 왜 필요한지: `.env`의 AUTH_PROVIDER_MODE는 팀원이 실 Supabase 인증 흐름을 검증할 때 쓰려고
// `supabase`로 고정해 둔 값이다. 그런데 app/web의 DevAuthToggle(로컬 전용 mock 로그인
// 위젯, features/user-management/DevAuthToggle.tsx)은 app/server가 mock 모드일 때만
// 인정하는 고정 토큰(auth.mock.ts)을 쓴다 — 둘이 같이 있으면 화면 클릭 테스트할 때마다
// `.env`를 mock↔supabase로 손으로 오갔다 되돌려야 했다(2026-09-07 대화 참고).
//
// 이 스크립트는 그 수작업을 없앤다. 자식 프로세스(`npm run dev`)의 환경변수에만
// AUTH_PROVIDER_MODE=mock을 얹어서 넘긴다 — dotenv는 기본적으로 이미 설정된 환경변수를
// 덮어쓰지 않으므로(express-app.ts 주석 "override: false" 참고) `.env` 파일의 `supabase`
// 값은 이 프로세스 트리 안에서만 무시되고, 파일 자체는 전혀 수정되지 않는다. 그래서
// `npm run dev`(실 Supabase 모드)와 `npm run dev:mock-auth`(mock 모드)를 상황에 따라
// 골라 쓰면 된다.
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
