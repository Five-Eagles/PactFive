#!/usr/bin/env node
'use strict';

// npm run dev — server+web을 띄우기 전에 "mock 인증으로 띄울까요?"를 한 번 묻는다.
//
// 왜: `.env`의 AUTH_PROVIDER_MODE는 보통 실 Supabase 인증 검증용으로 `supabase`가 고정돼
// 있는데, app/web의 DevAuthToggle(로그인 화면 없이 바로 클릭 테스트하는 위젯,
// features/user-management/DevAuthToggle.tsx)은 서버가 mock 모드일 때만 통하는 고정
// 토큰(auth.mock.ts)을 쓴다. 처음엔 `npm run dev`/`npm run dev:mock-auth` 두 명령으로
// 나눴는데(scripts/dev-mock-auth.js), 매번 물어보는 쪽이 낫겠다는 판단으로(2026-09-07)
// `npm run dev` 자체가 프롬프트를 띄우도록 합쳤다.
//
// AUTH_PROVIDER_MODE가 이미 환경변수로 와 있으면(예: dev-mock-auth.js가 미리 세팅, CI,
// 셸에서 직접 export) 묻지 않고 그 값을 그대로 존중한다 — dev-mock-auth.js는 그래서 이
// 스크립트를 고치지 않고도 여전히 "물어보지 않는 mock 지름길"로 동작한다. 표준입력이
// TTY가 아닐 때도(CI, 파이프) 답할 사람이 없으니 건너뛰고 `.env` 값(또는 서버 쪽 기본값)에
// 맡긴다.
//
// 실제 concurrently 기동은 package.json의 `dev:run`에 그대로 남겨 뒀다 — 그 스크립트는
// 이미 검증된 형태라 여기서 다시 손으로 조립하지 않고 `npm run dev:run`으로 그대로
// 재호출한다. `predev`(의존성·git hook 점검)는 최상위 `npm run dev` 호출에만 붙어 있으므로
// (npm의 pre<script> 관례) 한 번만, 이 스크립트가 실행되기 전에 이미 끝나 있다.

const { spawn } = require('node:child_process');
const readline = require('node:readline');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function resolveAuthMode() {
  if (process.env.AUTH_PROVIDER_MODE) return process.env.AUTH_PROVIDER_MODE;
  if (!process.stdin.isTTY) return undefined; // 물어볼 수 없다 — .env/서버 기본값에 맡긴다.

  const answer = await ask(
    '[dev] mock 인증으로 띄울까요? 로그인 화면 없이 DevAuthToggle로 바로 화면을 테스트할 수 있습니다. (y/N) ',
  );
  return answer === 'y' || answer === 'yes' ? 'mock' : undefined;
}

async function main() {
  const mode = await resolveAuthMode();
  if (mode) process.env.AUTH_PROVIDER_MODE = mode;

  console.log(`[dev] AUTH_PROVIDER_MODE=${process.env.AUTH_PROVIDER_MODE || '(.env 값 사용)'}`);

  const child = spawn('npm', ['run', 'dev:run'], {
    stdio: 'inherit',
    env: process.env,
    shell: true, // Windows에서 npm.cmd를 곧바로 찾지 못하는 문제를 피한다.
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
