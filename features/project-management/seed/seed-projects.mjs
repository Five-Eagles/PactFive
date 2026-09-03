/**
 * PRD §9.3 시드 프로젝트 12건을 실제 API 로 넣는다.
 *
 * 실행
 *   node features/project-management/seed/seed-projects.mjs
 *   node features/project-management/seed/seed-projects.mjs --base https://api.example.com
 *
 * **이 스크립트는 project-management 몫만 채운다.**
 *   계정 6개        오민혁 (user-management) — 이 스크립트보다 먼저 돌아야 한다
 *   프로젝트 12건    ← 여기
 *   지원             팀장 (applications)
 *   계약·결제·리뷰    조준영 (contracts-payments · reviews)
 *
 * 순서가 곧 의존성이다. 자세한 것은 같은 폴더의 README.md 참고.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DAY = 24 * 60 * 60 * 1000;

/* ── 실행 옵션 ─────────────────────────────────────────────
   토큰을 코드에 박지 않는다. 기본값은 로컬 mock 인증의 고정 토큰이고,
   배포 환경에서는 --token 이나 SEED_TOKEN 으로 넘긴다. */
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf("--" + name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const BASE = opt("base", process.env.SEED_BASE_URL ?? "http://localhost:3000");
const TOKEN = opt("token", process.env.SEED_TOKEN ?? "pactfive-mock-client-01");
const ORIGIN = opt("origin", process.env.SEED_ORIGIN ?? "http://localhost:5174");
const DRY = args.includes("--dry-run");

const seed = JSON.parse(readFileSync(join(HERE, "projects.json"), "utf8"));

/* ── 호출 ─────────────────────────────────────────────── */

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Origin: ORIGIN,
      Authorization: "Bearer " + TOKEN,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

/**
 * N일 뒤 **그날의 끝**(23:59:59)을 준다.
 *
 * `지금 + N일` 로 하면 P12(마감 = 배포일 + 1일)가 "최소 1일 뒤" 검증에 걸린다 —
 * 딱 24시간은 경계값이라 밀리초 차이로 떨어진다.
 *
 * 그날의 끝으로 잡으면 항상 24시간을 넘고, 무엇보다 **마감일은 원래 시각이 아니라
 * 날짜다.** "9월 4일 마감"이면 그날 하루가 끝날 때까지 지원할 수 있어야 한다.
 */
const iso = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
};

/**
 * 마감일을 항상 미래로 만든다.
 *
 * 등록 API 는 지난 마감일을 받지 않는다. CLOSED 로 두어야 하는 것도
 * **일단 미래로 만든 뒤 close-recruitment 를 부른다** — 상태를 직접 써 넣지 않고
 * 실제 전이를 거치는 편이 안전하다. 저장값과 화면 판정(규칙 14)이 어긋나지 않는다.
 */
function toCreateBody(p) {
  const body = {
    title: p.title,
    description: p.description,
    category: p.category,
    budgetAmount: p.budgetAmount,
    skillIds: p.skillIds,
    recruitmentDeadlineAt: iso(p.deadlineInDays),
  };
  if (p.startInDays) body.recruitmentStartAt = iso(p.startInDays);
  return body;
}

/* ── 본문 ─────────────────────────────────────────────── */

async function main() {
  console.log(`대상 ${BASE}${DRY ? "  (--dry-run: 실제로 보내지 않는다)" : ""}`);
  console.log(`프로젝트 ${seed.projects.length}건 · 출처 ${seed.source}\n`);

  const made = [];
  const failed = [];
  const needsOther = [];

  for (const p of seed.projects) {
    const body = toCreateBody(p);
    if (DRY) {
      console.log(`  [dry] ${p.seedId}  ${p.title}`);
      continue;
    }

    const res = await call("POST", "/api/v1/projects", body);
    if (res.status >= 400) {
      failed.push({ seedId: p.seedId, status: res.status, body: res.body });
      console.log(`  ✗ ${p.seedId}  ${p.title}  →  ${res.status} ${JSON.stringify(res.body)}`);
      continue;
    }

    const id = res.body.projectId;
    let note = res.body.recruitmentStatus;

    // CLOSED 로 두어야 하는 것은 실제 전이를 거친다
    if (p.targetRecruitmentStatus === "CLOSED") {
      const close = await call("POST", `/api/v1/projects/${id}/close-recruitment`, {});
      note = close.status < 400 ? "CLOSED" : `마감 실패 ${close.status}`;
    }

    made.push({ seedId: p.seedId, id, status: note });
    console.log(`  ✓ ${p.seedId}  ${p.title}  →  ${note}`);

    // 이 스크립트가 못 채우는 것을 기록해 둔다 — 조용히 빠뜨리지 않는다
    if (p.targetApplicationCount > 0) {
      needsOther.push(`${p.seedId}  지원 ${p.targetApplicationCount}건 — applications 담당`);
    }
    if (p.targetTransactionStatus) {
      needsOther.push(`${p.seedId}  거래 ${p.targetTransactionStatus} — contracts-payments 담당`);
    }
  }

  if (DRY) return;

  console.log(`\n만든 것 ${made.length}건 · 실패 ${failed.length}건`);

  if (needsOther.length) {
    console.log("\n이 스크립트가 채우지 못하는 것 — 다음 단계에서 채워야 한다");
    for (const line of needsOther) console.log("  · " + line);
  }

  if (failed.length) {
    console.log("\n실패한 것");
    for (const f of failed) console.log(`  · ${f.seedId}  ${f.status}  ${JSON.stringify(f.body)}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("멈췄습니다:", e.message);
  console.error("서버가 떠 있는지 확인해 주세요 —", BASE);
  process.exitCode = 1;
});
