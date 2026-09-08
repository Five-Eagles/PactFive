import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Preflight precedes React/JSX imports; follows the shared sample-login entry point.
function ensurePackagesInstalled(): void {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, "scripts", "ensure-deps.js"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("scripts/ensure-deps.js를 찾지 못했습니다.");
    dir = parent;
  }
  execSync(`node ${JSON.stringify(path.join(dir, "scripts", "ensure-deps.js"))}`, { stdio: "inherit" });
}

async function main() {
  ensurePackagesInstalled();
  let passed = 0;
  let failed = 0;
  const check = async (name: string, fn: () => void | Promise<void>) => {
    try { await fn(); passed++; console.log(`[PASS] ${name}`); }
    catch (error) { failed++; console.error(`[FAIL] ${name}`, error); }
  };
  const { runNotificationServerTests } = await import("./tests/notification-server.test");
  const { runNotificationServerBoundaryTests } = await import("./tests/notification-server-boundary.test");
  const { runNotificationClientTests } = await import("./tests/notification-client.test");
  const { runNotificationUiTests } = await import("./tests/notification-ui.test");
  await runNotificationServerTests(check);
  await runNotificationServerBoundaryTests(check);
  await runNotificationClientTests(check);
  await runNotificationUiTests(check);
  console.log(`notifications: ${passed} PASS / ${failed} FAIL`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
