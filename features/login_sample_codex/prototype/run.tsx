import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function ensurePackagesInstalled(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // 실제 설치 여부 확인·npm install 실행 로직은 리포 전체가 공유하는 scripts/ensure-deps.js
  // 하나에만 있다 (여기서 다시 구현하지 않는다 — sdd-framework/constitution.md 원칙 9).
  // npm run preview:dev/build도 package.json의 pre-hook으로 같은 스크립트를 탄다.
  let dir = here;
  while (!existsSync(path.join(dir, "scripts", "ensure-deps.js"))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("scripts/ensure-deps.js를 찾지 못했습니다. 리포 루트 구조를 확인하세요.");
    }
    dir = parent;
  }
  execSync(`node ${JSON.stringify(path.join(dir, "scripts", "ensure-deps.js"))}`, { stdio: "inherit" });
}

let failed = false;
function report(ok: boolean, label: string, detail?: unknown) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail !== undefined ? ": " + JSON.stringify(detail) : ""}`);
  if (!ok) failed = true;
}

async function main() {
  ensurePackagesInstalled();

  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { mockLogin } = await import("./mock/auth.mock");
  const { LoginForm } = await import("./web/LoginForm");

  console.log("=== login_sample_codex run ===");

  try {
    const res = await mockLogin({ email: "test@pactfive.com", password: "password123" });
    report(true, "Mock success", res);
  } catch (e) {
    report(false, "Mock success failed", String(e));
  }

  try {
    await mockLogin({ email: "test@pactfive.com", password: "wrong" });
    report(false, "Mock wrong password not rejected");
  } catch (e) {
    report(true, "Mock wrong password rejected", String(e));
  }

  const html = renderToStaticMarkup(React.createElement(LoginForm));
  for (const text of ["이메일", "비밀번호", "로그인"]) {
    report(html.includes(text), `UI has "${text}"`);
  }

  process.exitCode = failed ? 1 : 0;
}

main();
