#!/usr/bin/env node
'use strict';

/**
 * scripts/seed-all.js
 *
 * scripts/seed-dev-accounts.js와 scripts/seed-contractable-project.js를 순서대로 한 번에
 * 실행한다. 둘 다 DB에 값을 직접 꽂지 않고 실제 서버 API를 호출해 데이터를 만드는
 * 스크립트라 — 이 파일은 그 둘을 "한 번에 실행"하는 오케스트레이션만 한다. 새 시딩 로직은
 * 여기에 넣지 않는다(로직은 각 스크립트에 그대로 두고, 여기서는 순서·실패 처리만 다룬다).
 *
 * 왜 둘 다 필요한가:
 *   - seed-dev-accounts.js: 기능별로 이미 적절한 상태를 갖춘 고정 계정 10개(idempotent) —
 *     DEV 위젯에서 클릭 한 번으로 골라 쓰는 "주력" 시드. 재실행해도 계정이 늘지 않는다.
 *   - seed-contractable-project.js: 매번 새 이메일로 의뢰인·프리랜서 1쌍 + CONTRACT_PENDING
 *     프로젝트 1개를 추가로 만든다(non-idempotent) — 시드 계정을 건드리지 않고 "새로운"
 *     계약 대기 상태가 하나 더 필요할 때(예: 동시성 테스트, 여러 계약 병행 확인) 쓴다.
 *   대부분의 QA는 seed-dev-accounts.js 하나로 충분하다 — seed-contractable-project.js는
 *   추가로 독립된 계약 시나리오가 필요할 때만 의미가 있다.
 *
 * 실행 전제는 두 스크립트와 같다(로컬 서버가 AUTH_PROVIDER_MODE=supabase로 떠 있어야 함,
 * 리포 루트 .env에 SUPABASE_*·WEB_ORIGIN 필요) — 이 파일 자체는 별도 전제조건이 없다,
 * 각 스크립트가 실행 시점에 알아서 검증하고 없으면 바로 종료한다.
 *
 * 실행:
 *   npm run seed:all
 *   node scripts/seed-all.js                     — 둘 다 실행 (기본)
 *   node scripts/seed-all.js --only=dev-accounts  — seed-dev-accounts.js만
 *   node scripts/seed-all.js --only=contractable  — seed-contractable-project.js만
 *
 * 이 스크립트도 샌드박스 안에서는 실행되지 않는다 — Supabase/DB로 나가는 네트워크가 여기
 * 세션에는 없다. 팀장/각 담당자의 로컬 환경에서 실행해야 한다.
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

const STEPS = [
  {
    key: 'dev-accounts',
    label: 'seed-dev-accounts.js — 기능별 고정 계정 10개 (idempotent)',
    file: path.join(__dirname, 'seed-dev-accounts.js'),
  },
  {
    key: 'contractable',
    label: 'seed-contractable-project.js — 신규 CONTRACT_PENDING 시나리오 1개 추가',
    file: path.join(__dirname, 'seed-contractable-project.js'),
  },
];

function parseOnlyFlag(argv) {
  const arg = argv.find((a) => a.startsWith('--only='));
  if (!arg) return null;
  const value = arg.slice('--only='.length).trim();
  if (!STEPS.some((s) => s.key === value)) {
    console.error(
      `[seed-all] --only=${value} 는 알 수 없는 값입니다. 사용 가능: ${STEPS.map((s) => s.key).join(', ')}`,
    );
    process.exit(1);
  }
  return value;
}

function runStep(step, index, total) {
  console.log('\n========================================');
  console.log(`[seed-all] (${index + 1}/${total}) ${step.label}`);
  console.log('========================================\n');

  // spawnSync + stdio:'inherit' — 각 스크립트가 콘솔에 그대로 찍는 진행 로그(비밀번호,
  // curl 안내 등)를 실시간으로 그대로 보여준다. execSync로 출력을 모았다가 한 번에 찍으면
  // 오래 걸리는 마감 대기(ensureRecruitmentClosed의 6초 대기 등) 동안 아무것도 안 보여
  // 멈춘 것처럼 보인다.
  const result = spawnSync(process.execPath, [step.file], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw new Error(`[seed-all] ${step.key} 실행 자체에 실패했습니다: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `[seed-all] ${step.key}가 status ${result.status}로 종료했습니다 — 위 로그에서 원인을 확인하세요.`,
    );
  }
}

function main() {
  const only = parseOnlyFlag(process.argv.slice(2));
  const steps = only ? STEPS.filter((s) => s.key === only) : STEPS;

  steps.forEach((step, i) => runStep(step, i, steps.length));

  console.log('\n========================================');
  console.log(`[seed-all] 완료 — ${steps.map((s) => s.key).join(', ')} 전부 성공.`);
  console.log('========================================');
  if (steps.some((s) => s.key === 'dev-accounts')) {
    console.log('- 고정 계정 10개: npm run dev 후 DEV 위젯의 "시드 계정" 구역에서 바로 로그인.');
  }
  if (steps.some((s) => s.key === 'contractable')) {
    console.log('- 신규 계약대기 계정 1쌍: 위 로그에 출력된 email/password/accessToken을 따로 보관해 두세요');
    console.log('  (매번 새로 생성되고, DEV 위젯에는 뜨지 않습니다 — seed-dev-accounts.js 쪽만 위젯에 노출됩니다).');
  }
}

try {
  main();
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
