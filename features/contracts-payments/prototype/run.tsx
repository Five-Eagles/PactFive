import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// features/contracts-payments/prototype/의 로컬 실행 스크립트.
// 실행: npx tsx prototype/run.tsx (또는 prototype/ 안에서 npx tsx run.tsx)
//
// === 0. 필수 패키지 확인 (sdd-framework/feature-workflow.md "0. 필수 패키지 확인" 참고) ===
// 주의: 이 파일 안에서는 JSX 문법(`<Comp />`)을 쓰지 않는다 — 대신 React.createElement를 쓴다
// (features/sample-login/prototype/run.tsx와 동일한 이유).
function ensurePackagesInstalled(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
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

  const here = path.dirname(fileURLToPath(import.meta.url));
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const mock = await import("./mock/contract.mock");
  const { ContractDetail } = await import("./web/ContractDetail");

  let pass = 0;
  let fail = 0;
  function check(label: string, ok: boolean, detail?: unknown): void {
    if (ok) {
      pass += 1;
      console.log("[PASS]", label);
    } else {
      fail += 1;
      console.error("[FAIL]", label, detail ?? "");
    }
  }

  async function expectError(label: string, fn: () => Promise<unknown>, statusPrefix: string): Promise<void> {
    try {
      await fn();
      check(label, false, "에러가 발생하지 않았습니다");
    } catch (err) {
      const message = (err as Error).message;
      check(label, message.startsWith(statusPrefix), message);
    }
  }

  console.log("=== contracts-payments prototype 로컬 실행 ===");

  // ---- 규칙 1: 금액 합의 제안 ----
  mock.resetMockState();
  mock.seedProject("prj_r1");
  const agreement1 = await mock.mockProposeAgreement({
    applicationId: "app_r1",
    agreedAmount: 1_000_000,
    proposedByUserId: "usr_client_a",
  });
  check("규칙1: 합의 제안 성공 (status=PROPOSED)", agreement1.status === "PROPOSED", agreement1);
  await expectError(
    "규칙1: 같은 지원서에 활성 합의가 있으면 409",
    () => mock.mockProposeAgreement({ applicationId: "app_r1", agreedAmount: 900_000, proposedByUserId: "usr_client_a" }),
    "409",
  );

  // ---- 규칙 2: 합의 수락 → 계약 자동 생성 ----
  mock.resetMockState();
  mock.seedProject("prj_r2");
  const agreement2 = await mock.mockProposeAgreement({
    applicationId: "app_r2",
    agreedAmount: 1_000_000,
    proposedByUserId: "usr_client_a",
  });
  const accepted = await mock.mockAcceptAgreement(agreement2.id, "usr_freelancer_a", {
    projectId: "prj_r2",
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    projectTitle: "쇼핑몰 리뉴얼",
  });
  check(
    "규칙2: 합의 수락 시 계약 DRAFT 자동 생성",
    accepted.agreement.status === "ACCEPTED" && accepted.contract.status === "DRAFT" && accepted.contract.agreedAmount === 1_000_000,
    accepted,
  );
  await expectError(
    "규칙2: 제안한 본인은 수락 불가 → 403",
    () =>
      mock.mockAcceptAgreement(agreement2.id, "usr_client_a", {
        projectId: "prj_r2",
        clientId: "usr_client_a",
        freelancerId: "usr_freelancer_a",
        projectTitle: "쇼핑몰 리뉴얼",
      }),
    "403",
  );

  // ---- 규칙 3: 합의 거절 → restorePreContractProject 호출 ----
  mock.resetMockState();
  mock.seedProject("prj_r3");
  const agreement3 = await mock.mockProposeAgreement({
    applicationId: "app_r3",
    agreedAmount: 1_000_000,
    proposedByUserId: "usr_client_a",
  });
  const rejected = await mock.mockRejectAgreement(agreement3.id, "usr_freelancer_a", "prj_r3");
  check(
    "규칙3: 합의 거절 시 status=REJECTED",
    rejected.agreement.status === "REJECTED",
    rejected,
  );
  check(
    "규칙3: 거절 시 restorePreContractProject 호출됨",
    mock.callLog.some((entry) => entry.startsWith("restorePreContractProject:prj_r3:FREELANCER_REJECTED")),
    mock.callLog,
  );

  // ---- 규칙 4: 계약 서명 ----
  mock.resetMockState();
  mock.seedProject("prj_r4");
  const agreement4 = await mock.mockProposeAgreement({
    applicationId: "app_r4",
    agreedAmount: 1_000_000,
    proposedByUserId: "usr_client_a",
  });
  const { contract: contract4 } = await mock.mockAcceptAgreement(agreement4.id, "usr_freelancer_a", {
    projectId: "prj_r4",
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    projectTitle: "쇼핑몰 리뉴얼",
  });
  const signing = await mock.mockSignContract({
    contractId: contract4.id,
    signerId: "usr_client_a",
    signerRole: "CLIENT",
    ipAddress: "203.0.113.10",
    userAgent: "test-agent",
  });
  check("규칙4: 첫 서명 후 상태 SIGNING", signing.status === "SIGNING", signing);
  const signed = await mock.mockSignContract({
    contractId: contract4.id,
    signerId: "usr_freelancer_a",
    signerRole: "FREELANCER",
    ipAddress: "203.0.113.11",
    userAgent: "test-agent",
  });
  check("규칙4: 양측 서명 후 상태 SIGNED", signed.status === "SIGNED" && !!signed.signedAt, signed);
  await expectError(
    "규칙4: 같은 쪽이 재서명하면 409",
    () =>
      mock.mockSignContract({
        contractId: contract4.id,
        signerId: "usr_client_a",
        signerRole: "CLIENT",
        ipAddress: "203.0.113.10",
        userAgent: "test-agent",
      }),
    "409",
  );

  // ---- 규칙 5: 결제 확정 전제조건 (SIGNED가 아니면 결제 불가) ----
  mock.resetMockState();
  mock.seedProject("prj_r5");
  const agreement5 = await mock.mockProposeAgreement({
    applicationId: "app_r5",
    agreedAmount: 1_000_000,
    proposedByUserId: "usr_client_a",
  });
  const { contract: contract5 } = await mock.mockAcceptAgreement(agreement5.id, "usr_freelancer_a", {
    projectId: "prj_r5",
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    projectTitle: "쇼핑몰 리뉴얼",
  });
  await expectError(
    "규칙5: DRAFT 계약은 결제 불가 → 409",
    () =>
      mock.mockConfirmPayment({
        contractId: contract5.id,
        pgProvider: "TOSS",
        pgOrderId: "order_r5",
        pgPaymentKey: "pg_key_r5",
      }),
    "409",
  );

  // ---- 규칙 6·7·8·9: 결제 확정 happy path (markPaymentPending → PG 승인 → fee 계산 → startProjectTransaction) ----
  mock.resetMockState();
  mock.seedProject("prj_r6");
  const agreement6 = await mock.mockProposeAgreement({
    applicationId: "app_r6",
    agreedAmount: 1_000_001, // 1원 미만 버림(규칙7)을 확인하기 위해 일부러 딱 떨어지지 않는 금액 사용
    proposedByUserId: "usr_client_a",
  });
  const { contract: contract6 } = await mock.mockAcceptAgreement(agreement6.id, "usr_freelancer_a", {
    projectId: "prj_r6",
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    projectTitle: "쇼핑몰 리뉴얼",
  });
  await mock.mockSignContract({ contractId: contract6.id, signerId: "usr_client_a", signerRole: "CLIENT", ipAddress: "1.1.1.1", userAgent: "a" });
  await mock.mockSignContract({ contractId: contract6.id, signerId: "usr_freelancer_a", signerRole: "FREELANCER", ipAddress: "1.1.1.2", userAgent: "a" });

  const payment6 = await mock.mockConfirmPayment(
    { contractId: contract6.id, pgProvider: "TOSS", pgOrderId: "order_r6", pgPaymentKey: "pg_key_r6" },
    "APPROVED",
  );
  check("규칙6: 결제 전 markPaymentPending 호출됨", mock.callLog.includes("markPaymentPending:prj_r6"), mock.callLog);
  check(
    "규칙6: markPaymentPending이 startProjectTransaction보다 먼저 호출됨",
    mock.callLog.indexOf("markPaymentPending:prj_r6") < mock.callLog.indexOf("startProjectTransaction:prj_r6"),
    mock.callLog,
  );
  check(
    "규칙7: 수수료 1원 미만 버림 (1,000,001 × 10% → 100,000)",
    payment6.platformFeeAmount === 100_000 && payment6.settlementAmount === 900_001,
    payment6,
  );
  check("규칙8: PG 승인 시 결제 상태 PAID", payment6.status === "PAID" && !!payment6.paidAt, payment6);
  check(
    "규칙9: 계약 SIGNED+결제 PAID 후 startProjectTransaction 호출됨",
    mock.callLog.includes("startProjectTransaction:prj_r6"),
    mock.callLog,
  );

  // ---- 규칙 8 (실패 케이스): PG 거절 ----
  mock.resetMockState();
  mock.seedProject("prj_r8f");
  const agreement8f = await mock.mockProposeAgreement({
    applicationId: "app_r8f",
    agreedAmount: 500_000,
    proposedByUserId: "usr_client_a",
  });
  const { contract: contract8f } = await mock.mockAcceptAgreement(agreement8f.id, "usr_freelancer_a", {
    projectId: "prj_r8f",
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    projectTitle: "쇼핑몰 리뉴얼",
  });
  await mock.mockSignContract({ contractId: contract8f.id, signerId: "usr_client_a", signerRole: "CLIENT", ipAddress: "1.1.1.1", userAgent: "a" });
  await mock.mockSignContract({ contractId: contract8f.id, signerId: "usr_freelancer_a", signerRole: "FREELANCER", ipAddress: "1.1.1.2", userAgent: "a" });
  const paymentFailed = await mock.mockConfirmPayment(
    { contractId: contract8f.id, pgProvider: "TOSS", pgOrderId: "order_r8f", pgPaymentKey: "pg_key_r8f" },
    "FAILED",
  );
  check(
    "규칙8: PG 거절 시 결제 상태 FAILED (failureCode 포함)",
    paymentFailed.status === "FAILED" && !!paymentFailed.failureCode,
    paymentFailed,
  );

  // ---- 규칙 9 (실패 케이스): 프로젝트가 이미 취소됨 ----
  mock.resetMockState();
  mock.seedProject("prj_r9", { canceled: true });
  const agreement9 = await mock.mockProposeAgreement({
    applicationId: "app_r9",
    agreedAmount: 500_000,
    proposedByUserId: "usr_client_a",
  });
  const { contract: contract9 } = await mock.mockAcceptAgreement(agreement9.id, "usr_freelancer_a", {
    projectId: "prj_r9",
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    projectTitle: "쇼핑몰 리뉴얼",
  });
  await mock.mockSignContract({ contractId: contract9.id, signerId: "usr_client_a", signerRole: "CLIENT", ipAddress: "1.1.1.1", userAgent: "a" });
  await mock.mockSignContract({ contractId: contract9.id, signerId: "usr_freelancer_a", signerRole: "FREELANCER", ipAddress: "1.1.1.2", userAgent: "a" });
  await expectError(
    "규칙9: 프로젝트가 이미 취소되었으면 결제 확정도 409",
    () =>
      mock.mockConfirmPayment(
        { contractId: contract9.id, pgProvider: "TOSS", pgOrderId: "order_r9", pgPaymentKey: "pg_key_r9" },
        "APPROVED",
      ),
    "409",
  );

  // ---- 규칙 10: 취소 시 무효화 (계약 CANCELED, 합의 REJECTED, 서명 기록 보존) ----
  mock.resetMockState();
  mock.seedProject("prj_r10");
  const agreement10 = await mock.mockProposeAgreement({
    applicationId: "app_r10",
    agreedAmount: 500_000,
    proposedByUserId: "usr_client_a",
  });
  const { contract: contract10 } = await mock.mockAcceptAgreement(agreement10.id, "usr_freelancer_a", {
    projectId: "prj_r10",
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    projectTitle: "쇼핑몰 리뉴얼",
  });
  await mock.mockSignContract({ contractId: contract10.id, signerId: "usr_client_a", signerRole: "CLIENT", ipAddress: "1.1.1.1", userAgent: "a" });
  const canceled = mock.mockCancelContractForProjectCancellation(contract10.id);
  check(
    "규칙10: 프로젝트 취소 시 계약 CANCELED + 합의 REJECTED (서명은 그대로 남음)",
    canceled.status === "CANCELED" && !!canceled.canceledAt && !!canceled.clientSignedAt,
    canceled,
  );

  // ---- 규칙 11·12·13: 납품 요청 → 승인 → 정산 → completeProjectTransaction ----
  mock.resetMockState();
  mock.seedProject("prj_r11");
  const agreement11 = await mock.mockProposeAgreement({
    applicationId: "app_r11",
    agreedAmount: 700_000,
    proposedByUserId: "usr_client_a",
  });
  const { contract: contract11 } = await mock.mockAcceptAgreement(agreement11.id, "usr_freelancer_a", {
    projectId: "prj_r11",
    clientId: "usr_client_a",
    freelancerId: "usr_freelancer_a",
    projectTitle: "쇼핑몰 리뉴얼",
  });
  await expectError(
    "규칙11: 서명 전 계약은 납품 요청 불가 → 409",
    () => mock.mockRequestDelivery({ contractId: contract11.id }),
    "409",
  );
  await mock.mockSignContract({ contractId: contract11.id, signerId: "usr_client_a", signerRole: "CLIENT", ipAddress: "1.1.1.1", userAgent: "a" });
  await mock.mockSignContract({ contractId: contract11.id, signerId: "usr_freelancer_a", signerRole: "FREELANCER", ipAddress: "1.1.1.2", userAgent: "a" });
  await mock.mockConfirmPayment(
    { contractId: contract11.id, pgProvider: "TOSS", pgOrderId: "order_r11", pgPaymentKey: "pg_key_r11" },
    "APPROVED",
  );
  const delivery11 = await mock.mockRequestDelivery({ contractId: contract11.id, message: "1차 산출물" });
  check("규칙11: 서명 완료 후 납품 요청 성공 (status=DELIVERY_REQUESTED)", delivery11.status === "DELIVERY_REQUESTED", delivery11);

  const approveResult = await mock.mockApproveDelivery(delivery11.id);
  check(
    "규칙12: 납품 승인 시 delivery=APPROVED, payment=RELEASED",
    approveResult.delivery.status === "APPROVED" && approveResult.payment.status === "RELEASED" && !!approveResult.payment.releasedAt,
    approveResult,
  );
  check(
    "규칙13: 납품 승인 후 completeProjectTransaction 호출됨",
    mock.callLog.includes("completeProjectTransaction:prj_r11"),
    mock.callLog,
  );

  // ---- 규칙 14: 외부 벤더(PG) 의존 격리 — service는 payment.port 타입만 참조, 어댑터를 직접 import하지 않는다 ----
  const servicePath = path.join(here, "server", "contract.service.ts");
  const serviceSource = readFileSync(servicePath, "utf-8");
  check(
    "규칙14: contract.service.ts가 toss-payments.adapter를 직접 import하지 않음 (포트만 참조)",
    !serviceSource.includes("toss-payments.adapter") && serviceSource.includes("./payment.port"),
    serviceSource.match(/^import.*$/m)?.[0],
  );
  const { TossPaymentsAdapter } = await import("./server/toss-payments.adapter");
  const adapter = new TossPaymentsAdapter();
  check(
    "규칙14: TossPaymentsAdapter가 PaymentGateway 인터페이스(confirmPayment)를 구현함",
    typeof adapter.confirmPayment === "function",
  );

  // ---- UI: design/low-fi.html의 "필수 요소 목록"이 전부 렌더링되는가 ----
  function checkWireframeMatch(): boolean {
    const requiredTexts = [
      "계약 상세",
      "합의 금액",
      "계약 서명하기",
      "결제 금액",
      "플랫폼 수수료",
      "정산 예정액",
      "결제하기",
      "납품 상태",
      "납품 요청",
      "납품 승인",
    ];
    const html = renderToStaticMarkup(React.createElement(ContractDetail));

    let ok = true;
    for (const text of requiredTexts) {
      const found = html.includes(text);
      console.log(found ? "[PASS]" : "[FAIL]", `UI: "${text}" 렌더링 ${found ? "됨" : "안 됨"}`);
      if (found) pass += 1;
      else {
        fail += 1;
        ok = false;
      }
    }
    return ok;
  }
  checkWireframeMatch();

  console.log(`=== 결과: PASS ${pass} / FAIL ${fail} ===`);
  if (fail > 0) {
    process.exitCode = 1;
  }
}

main();
