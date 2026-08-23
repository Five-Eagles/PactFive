import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 주의: 이 파일 안에서는 JSX 문법을 쓰지 않는다 (설치 확인보다 jsx-runtime import가 먼저
// 해석되는 문제 방지). 대신 React.createElement를 직접 쓴다.
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

  console.log("=== login_sample_claude prototype 로컬 실행 ===");

  try {
    const res = await mockLogin({ email: "test@pactfive.com", password: "password123" });
    report(true, "Mock: 정상 로그인", res);
  } catch (e) {
    report(false, "Mock: 정상 로그인이 실패함", String(e));
  }

  try {
    await mockLogin({ email: "test@pactfive.com", password: "wrong" });
    report(false, "Mock: 잘못된 비밀번호가 거부되지 않음");
  } catch (e) {
    report(true, "Mock: 잘못된 비밀번호 거부됨", String(e));
  }

  try {
    await mockLogin({ email: "withdrawn@pactfive.com", password: "password123" });
    report(false, "Mock: 탈퇴 계정이 거부되지 않음 (spec.md 규칙 2)");
  } catch (e) {
    report(true, "Mock: 탈퇴 계정 거부됨 (spec.md 규칙 2)", String(e));
  }

  try {
    await mockLogin({ email: "social@pactfive.com", password: "anything" });
    report(false, "Mock: 소셜 전용 계정이 거부되지 않음 (spec.md 규칙 3)");
  } catch (e) {
    report(true, "Mock: 소셜 전용 계정 거부됨 (spec.md 규칙 3)", String(e));
  }

  const html = renderToStaticMarkup(React.createElement(LoginForm));
  for (const text of ["이메일", "비밀번호", "로그인"]) {
    report(html.includes(text), `UI: "${text}" 렌더링 됨`);
  }

  if (failed) {
    console.log("=== 실패 항목 있음 ===");
    process.exitCode = 1;
  } else {
    console.log("=== 전부 통과 ===");
  }
}

main();
