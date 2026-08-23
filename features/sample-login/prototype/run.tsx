import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// features/sample-login/prototype/의 로컬 실행 스크립트.
// 실행: npx tsx prototype/run.tsx (또는 prototype/ 안에서 npx tsx run.tsx)
//
// === 0. 필수 패키지 확인 (사람이 직접 실행하든 AI가 실행하든 동일하게 적용) ===
// sdd-framework/feature-workflow.md "0. 필수 패키지 확인"의 자동화 버전이다. 문서에 적힌
// `test -d node_modules/react || npm install`은 그걸 읽고 실행하는 쪽(주로 AI)이 있어야
// 의미가 있는데, 사람이 문서를 안 읽고 바로 `npx tsx run.tsx`를 실행하면 이 확인 자체가
// 건너뛰어진다. 그래서 같은 확인을 스크립트 안으로 옮겨, 누가 어떻게 실행하든 항상 걸리게
// 한다.
//
// 주의: 이 파일 안에서는 JSX 문법(`<Comp />`)을 쓰지 않는다. JSX를 쓰면 컴파일러가 파일
// 맨 위에 `react/jsx-runtime` import를 자동으로 끼워 넣는데, 이건 아래 설치 확인보다 먼저
// 해석되어 버려서 preflight 자체가 무의미해진다. 대신 `React.createElement`를 직접 쓴다.
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

async function main() {
  ensurePackagesInstalled();

  // 설치 확인이 끝난 뒤에만 react/react-dom을 불러온다.
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { mockLogin } = await import("./mock/auth.mock");
  const { LoginForm } = await import("./web/LoginForm");

  // 아래 두 가지를 검증한다.
  //  1) Mock이 계약대로 동작하는가 (server/는 실제 DB가 없어 검증 대상이 아니다 — 구현 초안일 뿐)
  //  2) prototype/web/의 컴포넌트가 design/*.html의 "필수 요소 목록"을 전부 렌더링하는가

  async function checkMock(): Promise<boolean> {
    let ok = true;

    try {
      const result = await mockLogin({ email: "test@pactfive.com", password: "password123" });
      console.log("[PASS] Mock: 정상 로그인:", result);
    } catch (err) {
      console.error("[FAIL] Mock: 정상 로그인이 실패했습니다:", err);
      ok = false;
    }

    try {
      await mockLogin({ email: "test@pactfive.com", password: "wrong-password" });
      console.error("[FAIL] Mock: 잘못된 비밀번호인데도 로그인이 성공했습니다");
      ok = false;
    } catch (err) {
      console.log("[PASS] Mock: 잘못된 비밀번호 거부됨:", (err as Error).message);
    }

    try {
      await mockLogin({ email: "withdrawn@pactfive.com", password: "password123" });
      console.error("[FAIL] Mock: 탈퇴 계정인데도 로그인이 성공했습니다 (spec.md 규칙 2)");
      ok = false;
    } catch (err) {
      console.log("[PASS] Mock: 탈퇴 계정 거부됨 (spec.md 규칙 2):", (err as Error).message);
    }

    try {
      await mockLogin({ email: "social@pactfive.com", password: "anything" });
      console.error("[FAIL] Mock: 소셜 전용 계정인데도 로그인이 성공했습니다 (spec.md 규칙 3)");
      ok = false;
    } catch (err) {
      console.log("[PASS] Mock: 소셜 전용 계정 거부됨 (spec.md 규칙 3):", (err as Error).message);
    }

    return ok;
  }

  function checkWireframeMatch(): boolean {
    const requiredTexts = ["이메일", "비밀번호", "로그인"];
    const html = renderToStaticMarkup(React.createElement(LoginForm));

    let ok = true;
    for (const text of requiredTexts) {
      const found = html.includes(text);
      console.log(found ? "[PASS]" : "[FAIL]", `UI: "${text}" 렌더링 ${found ? "됨" : "안 됨"}`);
      if (!found) ok = false;
    }
    return ok;
  }

  console.log("=== sample-login prototype 로컬 실행 ===");
  const mockOk = await checkMock();
  const uiOk = checkWireframeMatch();

  if (!mockOk || !uiOk) {
    process.exitCode = 1;
  }
}

main();
