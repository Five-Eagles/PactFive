/**
 * scripts/lib/seed-skill-catalog.ts
 *
 * 2026-09-10 발견 — 실제로 원인을 찾은 버그: `POST /api/v1/projects`가 skillIds(예:
 * "REACT","NODEJS")를 받으면 project.service.ts의 validateSkills()가
 * in-memory-external.adapter.ts의 하드코딩 목록(OFFICIAL_SKILLS 12종)으로 "유효한
 * 기술"이라고 통과시킨다. 그런데 실제 저장은 PrismaProjectRepository.insert()가
 * `projectSkills: { create: [{ skillId, ... }] } }`로 project_skills 조인 테이블에 행을
 * 넣는데, project_skills.skill_id는 skills.id를 참조하는 진짜 FK다(schema.prisma
 * ProjectSkill 모델). skills 테이블에 그 코드로 된 행이 한 번도 seed된 적이 없어서(리포
 * 전체에서 INSERT INTO skills/prisma.skill.create 실사용 0건 확인) 이 nested create가
 * Postgres FK 위반으로 죽고, project.controller.ts의 sendDomainError()가 그걸 원인
 * 로깅 없이 그냥 500 INTERNAL_ERROR로 뭉개서 "예상하지 못한 오류입니다"만 보였다.
 *
 * 즉 이건 시드 스크립트만의 문제가 아니라 **실제 배포 앱에서도 재현되는 버그**다 —
 * 지금 프로덕션에서 누구든 "React"를 요구 기술로 골라 프로젝트를 등록하면 똑같이
 * 500이 난다. in-memory 카탈로그(검증)와 Prisma DB(저장)가 서로 다른 진실을 갖고
 * 있었던 것 — in-memory-external.adapter.ts 파일 헤더 주석이 이미 "실제 구현이 올라올
 * 때까지의 잠정 어댑터"라고 밝히고 있었는데, DB 쪽 참조 데이터를 채우는 걸 아무도 하지
 * 않았다.
 *
 * 이 스크립트는 in-memory-external.adapter.ts의 OFFICIAL_SKILLS·SKILL_LABELS와 정확히
 * 같은 12개 코드를 skills 테이블에 upsert한다(멱등 — 몇 번을 실행해도 안전). groupCode는
 * 코드 어디에도 아직 쓰이지 않는 표시용 필드라(nameKey와 동일) 합리적으로 배정했다.
 *
 * 사용: tsx scripts/lib/seed-skill-catalog.ts
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPrismaClient } from '../../app/server/src/shared/prisma-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// bootstrap-seed-user.ts와 동일한 최소 .env 로더 — DATABASE_URL 등을 process.env에 채운다.
function loadRootEnv(): void {
  const envPath = resolve(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// in-memory-external.adapter.ts의 OFFICIAL_SKILLS·SKILL_LABELS와 반드시 코드가
// 일치해야 한다 — 여기 값을 바꾸려면 그 파일도 같이 바꿔야 한다(정본은 그 파일).
const OFFICIAL_SKILLS: Array<{ id: string; name: string; groupCode: string; displayOrder: number }> = [
  { id: 'REACT', name: 'React', groupCode: 'FRONTEND', displayOrder: 1 },
  { id: 'NODEJS', name: 'Node.js', groupCode: 'BACKEND', displayOrder: 2 },
  { id: 'SQL', name: 'SQL', groupCode: 'DATA_INFRA', displayOrder: 3 },
  { id: 'TYPESCRIPT', name: 'TypeScript', groupCode: 'FRONTEND', displayOrder: 4 },
  { id: 'JAVASCRIPT', name: 'JavaScript', groupCode: 'FRONTEND', displayOrder: 5 },
  { id: 'VUE', name: 'Vue', groupCode: 'FRONTEND', displayOrder: 6 },
  { id: 'SPRING', name: 'Spring', groupCode: 'BACKEND', displayOrder: 7 },
  { id: 'FIGMA', name: 'Figma', groupCode: 'DESIGN', displayOrder: 8 },
  { id: 'FLUTTER', name: 'Flutter', groupCode: 'MOBILE', displayOrder: 9 },
  { id: 'PYTHON', name: 'Python', groupCode: 'DATA_INFRA', displayOrder: 10 },
  { id: 'HTML_CSS', name: 'HTML/CSS', groupCode: 'FRONTEND', displayOrder: 11 },
  { id: 'AWS', name: 'AWS', groupCode: 'DATA_INFRA', displayOrder: 12 },
];

async function main(): Promise<void> {
  loadRootEnv();
  const prisma = getPrismaClient();
  try {
    let created = 0;
    let alreadyExisted = 0;
    for (const skill of OFFICIAL_SKILLS) {
      const result = await prisma.skill.upsert({
        where: { id: skill.id },
        update: {}, // 이미 있으면 손대지 않는다 — 누가 수동으로 고친 값을 덮어쓰지 않는다.
        create: {
          id: skill.id,
          name: skill.name,
          nameKey: skill.id.toLowerCase(),
          groupCode: skill.groupCode as never,
          displayOrder: skill.displayOrder,
          isCustom: false,
          isActive: true,
        },
      });
      if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
      else alreadyExisted += 1;
    }
    process.stdout.write(
      `${JSON.stringify({ total: OFFICIAL_SKILLS.length, created, alreadyExisted })}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(1);
});
