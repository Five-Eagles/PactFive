/**
 * scripts/lib/backdate-project-deadline.ts
 *
 * 2026-09-10 추가 — seed-dev-accounts.js의 "마감 처리(CLOSED)" 시나리오는 원래 프로젝트를
 * 등록 직후(6초 뒤) 마감되도록 아주 짧은 recruitmentDeadlineAt으로 만들어서, 실제로 6초
 * 기다렸다가 마감 스윕(/internal/v1/projects/sweep-deadlines)을 부르는 방식이었다. 그런데
 * project.service.ts의 실제 검증(142행, DEADLINE_BELOW_MINIMUM)은 "마감 일시는 최소
 * 1일 뒤여야 한다"를 강제한다 — 이 규칙은 이번에 새로 생긴 게 아니라 원래부터 있던
 * 것인데, 이 시나리오가 처음으로 실제 Prisma 백엔드까지 도달하면서(2026-09-10, 계정
 * 부트스트랩 병목을 푼 뒤) 처음 걸렸다.
 *
 * "최소 1일 뒤"는 project.service.ts의 정식 비즈니스 규칙이라(스킬 카탈로그 FK 문제와
 * 달리 이건 버그가 아니라 의도된 검증) 그 값 자체를 바꾸지 않는다. 대신: 프로젝트는
 * 일단 규칙을 만족하는 정상 마감 시각(1일+α 뒤)으로 등록하고, 지원까지 다 받은
 * 다음에만 이 스크립트로 recruitmentDeadlineAt을 과거로 직접 되돌린다(Prisma 직접
 * UPDATE, HTTP API를 거치지 않는다 — API는 생성 시점에만 이 규칙을 검사하고, 이미
 * 만들어진 행의 timestamp를 DB에서 바꾸는 것 자체를 막을 방법은 없다). 그러면
 * 마감 스윕 API를 실제로 몇 초씩 기다리지 않고 바로 호출할 수 있다 — 스윕 로직
 * 자체(CLOSED 전이, 지원 자동거절)는 정상 API 그대로 실행되므로 테스트하려는 대상
 * (마감 스윕이 실제로 하는 일)은 전혀 우회하지 않는다. 오직 "언제 마감인가"라는 시드
 * 전용 셋업 값만 앞당긴다.
 *
 * 사용: tsx scripts/lib/backdate-project-deadline.ts '{"projectId":"prj_..."}'
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPrismaClient } from '../../app/server/src/shared/prisma-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

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

interface Payload {
  projectId: string;
}

function parsePayload(): Payload {
  const raw = process.argv[2];
  if (!raw) throw new Error('JSON payload 인자가 없습니다 — {"projectId":"..."}');
  const parsed = JSON.parse(raw) as Partial<Payload>;
  if (!parsed.projectId) throw new Error('payload에 projectId가 필요합니다.');
  return parsed as Payload;
}

async function main(): Promise<void> {
  loadRootEnv();
  const { projectId } = parsePayload();
  const prisma = getPrismaClient();
  try {
    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { recruitmentDeadlineAt: new Date(Date.now() - 5000) },
    });
    process.stdout.write(
      `${JSON.stringify({ ok: true, projectId: updated.id, recruitmentDeadlineAt: updated.recruitmentDeadlineAt })}\n`,
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
