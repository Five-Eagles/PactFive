#!/usr/bin/env node
'use strict';

/**
 * scripts/seed-skill-catalog.js
 *
 * 2026-09-10 신설 — `POST /api/v1/projects`가 skillIds(예: "REACT","NODEJS")를 받으면
 * project.service.ts의 validateSkills()는 in-memory-external.adapter.ts의 하드코딩 목록
 * (OFFICIAL_SKILLS 12종)으로 "유효한 기술"이라고 통과시킨다. 그런데 실제 저장은
 * PrismaProjectRepository.insert()가 project_skills 조인 테이블에 행을 넣는데,
 * project_skills.skill_id는 skills.id를 참조하는 진짜 FK다(schema.prisma ProjectSkill
 * 모델). skills 테이블에 이 코드로 된 행이 한 번도 seed된 적이 없어서(리포 전체에서
 * INSERT INTO skills·prisma.skill.create 실사용 0건 확인) 이 nested create가 Postgres FK
 * 위반으로 죽고, project.controller.ts의 sendDomainError()가 원인 로깅 없이 그냥 500
 * INTERNAL_ERROR("예상하지 못한 오류입니다")로 뭉갰다.
 *
 * 이건 시드 스크립트만의 문제가 아니라 **실제 배포 앱에서도 재현되는 버그**다 — 지금
 * 프로덕션에서 누구든 "React"를 요구 기술로 골라 프로젝트를 등록하면 똑같이 500이 난다.
 * in-memory 카탈로그(검증)와 Prisma DB(저장)가 서로 다른 진실을 갖고 있었다.
 *
 * 이 스크립트(scripts/lib/seed-skill-catalog.ts를 tsx로 실행하는 얇은 래퍼)는
 * in-memory-external.adapter.ts의 OFFICIAL_SKILLS·SKILL_LABELS와 정확히 같은 12개
 * 코드를 skills 테이블에 upsert한다(멱등). npm run seed:all이 dev-accounts/contractable
 * 보다 먼저 이걸 실행한다 — 두 스크립트 모두 skillIds가 있는 프로젝트를 만들기 때문이다.
 *
 * 실행: npm run seed:skill-catalog (또는 node scripts/seed-skill-catalog.js)
 * 전제: 리포 루트 .env에 DATABASE_URL (실제 Supabase Postgres, Prisma 연결용).
 */

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
// scripts/lib/bootstrap-seed-user.ts와 같은 이유로 .bin/tsx(확장자 없음) 대신 tsx의 실제
// CLI 엔트리를 node로 직접 실행한다 — Windows cmd.exe가 shebang 스크립트를 못 돌린다.
const TSX_CLI_PATH = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const TARGET_PATH = path.join(__dirname, 'lib', 'seed-skill-catalog.ts');

const result = spawnSync(process.execPath, [TSX_CLI_PATH, TARGET_PATH], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`[seed-skill-catalog] 실행 자체에 실패했습니다: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
