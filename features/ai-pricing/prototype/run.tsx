import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function ensurePackagesInstalled(): void {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "scripts", "ensure-deps.js"))) {
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("scripts/ensure-deps.js를 찾지 못했습니다.");
    }
    directory = parent;
  }
  execSync(`node ${JSON.stringify(path.join(directory, "scripts", "ensure-deps.js"))}`, {
    stdio: "inherit",
  });
}

async function main(): Promise<void> {
  ensurePackagesInstalled();

  const { InMemoryPricingAnalysisAdapter } = await import(
    "./mock/in-memory-pricing-analysis.adapter"
  );
  const { PricingAnalysisContractError } = await import(
    "./server/pricing-analysis.types"
  );

  let passed = 0;
  let failed = 0;

  async function test(name: string, run: () => void | Promise<void>): Promise<void> {
    try {
      await run();
      passed += 1;
      console.log(`[PASS] ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`[FAIL] ${name}:`, error);
    }
  }

  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }

  function approvedRecord(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      requesterId: "usr_client",
      projectId: null,
      recommendedAmount: 1_500_000,
      reviewStatus: "APPROVED" as const,
      appliedAt: null,
      ...overrides,
    };
  }

  async function expectContractError(
    operation: () => Promise<unknown>,
    code: "PRICING_ANALYSIS_NOT_CLAIMABLE" | "PRICING_ANALYSIS_NOT_APPLICABLE",
  ): Promise<void> {
    let caught: unknown;
    try {
      await operation();
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof PricingAnalysisContractError, `${code} 오류가 발생하지 않음`);
    assert(caught.code === code, `오류 코드 불일치: ${caught.code}`);
  }

  await test("R1 claim은 전달된 transaction에서 저장 금액을 연결하고 반환한다", async () => {
    const fixedNow = new Date("2026-08-28T00:00:00.000Z");
    const adapter = new InMemoryPricingAnalysisAdapter(
      [approvedRecord("pa_claim")],
      () => fixedNow,
    );
    const transaction = { id: "tx_project_create" } as const;
    const response = await adapter.claimPricingAnalysisForCreatedProject(transaction, {
      analysisId: "pa_claim",
      projectId: "prj_created",
      requesterId: "usr_client",
    });

    assert(response.recommendedAmount === 1_500_000, "DB 저장 추천 금액을 반환하지 않음");
    assert(adapter.findById("pa_claim")?.projectId === "prj_created", "분석-프로젝트 연결 실패");
    assert(adapter.findById("pa_claim")?.appliedAt?.getTime() === fixedNow.getTime(), "적용 시각 누락");
    assert(adapter.getClaimCalls()[0]?.transaction === transaction, "호출자가 연 transaction을 교체함");
  });

  await test("R2 claim은 소유자·승인·미적용 조건을 하나라도 어기면 같은 코드로 거부한다", async () => {
    const cases = [
      approvedRecord("pa_owner"),
      approvedRecord("pa_pending", { reviewStatus: "PENDING" }),
      approvedRecord("pa_applied", {
        projectId: "prj_existing",
        appliedAt: new Date("2026-08-27T00:00:00.000Z"),
      }),
    ];
    const adapter = new InMemoryPricingAnalysisAdapter(cases);
    await expectContractError(
      () => adapter.claimPricingAnalysisForCreatedProject(
        { id: "tx_owner" },
        { analysisId: "pa_owner", projectId: "prj_new", requesterId: "usr_other" },
      ),
      "PRICING_ANALYSIS_NOT_CLAIMABLE",
    );
    for (const analysisId of ["pa_pending", "pa_applied"]) {
      await expectContractError(
        () => adapter.claimPricingAnalysisForCreatedProject(
          { id: `tx_${analysisId}` },
          { analysisId, projectId: "prj_new", requesterId: "usr_client" },
        ),
        "PRICING_ANALYSIS_NOT_CLAIMABLE",
      );
    }
  });

  await test("R3 같은 분석을 두 번째 프로젝트에 claim할 수 없다", async () => {
    const adapter = new InMemoryPricingAnalysisAdapter([approvedRecord("pa_once")]);
    await adapter.claimPricingAnalysisForCreatedProject(
      { id: "tx_first" },
      { analysisId: "pa_once", projectId: "prj_first", requesterId: "usr_client" },
    );
    await expectContractError(
      () => adapter.claimPricingAnalysisForCreatedProject(
        { id: "tx_second" },
        { analysisId: "pa_once", projectId: "prj_second", requesterId: "usr_client" },
      ),
      "PRICING_ANALYSIS_NOT_CLAIMABLE",
    );
  });

  await test("R4 기존 프로젝트 추천 금액 조회는 읽기 전용이며 같은 프로젝트 재조회가 가능하다", async () => {
    const appliedAt = new Date("2026-08-27T00:00:00.000Z");
    const adapter = new InMemoryPricingAnalysisAdapter([
      approvedRecord("pa_read", { projectId: "prj_existing", appliedAt }),
    ]);
    const before = adapter.findById("pa_read");
    const response = await adapter.getPricingAnalysisRecommendation({
      analysisId: "pa_read",
      projectId: "prj_existing",
      requesterId: "usr_client",
    });
    const after = adapter.findById("pa_read");

    assert(response.recommendedAmount === 1_500_000, "저장 추천 금액 조회 실패");
    assert(JSON.stringify(after) === JSON.stringify(before), "읽기 전용 조회가 분석 상태를 변경함");
    assert(adapter.getRecommendationQueries().length === 1, "조회 호출 기록 누락");
  });

  await test("R5 추천 금액 조회는 다른 소유자·다른 프로젝트·미승인 분석을 거부한다", async () => {
    const adapter = new InMemoryPricingAnalysisAdapter([
      approvedRecord("pa_bound", {
        projectId: "prj_bound",
        appliedAt: new Date("2026-08-27T00:00:00.000Z"),
      }),
      approvedRecord("pa_pending_read", { reviewStatus: "PENDING" }),
    ]);
    const invalidQueries = [
      { analysisId: "pa_bound", projectId: "prj_bound", requesterId: "usr_other" },
      { analysisId: "pa_bound", projectId: "prj_other", requesterId: "usr_client" },
      { analysisId: "pa_pending_read", projectId: "prj_new", requesterId: "usr_client" },
    ];
    for (const query of invalidQueries) {
      await expectContractError(
        () => adapter.getPricingAnalysisRecommendation(query),
        "PRICING_ANALYSIS_NOT_APPLICABLE",
      );
    }
  });

  await test("R6 스텁은 공개 API·OpenAI 호출·projects 갱신을 만들지 않는다", () => {
    const prototypeRoot = path.dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      path.join(prototypeRoot, "mock", "in-memory-pricing-analysis.adapter.ts"),
      "utf8",
    );
    assert(!existsSync(path.join(prototypeRoot, "server", "pricing-analysis.routes.ts")), "공개 route가 추가됨");
    assert(existsSync(path.join(prototypeRoot, "index.ts")), "다른 도메인이 사용할 prototype 공개 입구 누락");
    assert(!source.includes("openai"), "금요일 범위 밖 OpenAI 호출이 추가됨");
    assert(!source.includes("budgetAmount"), "ai-pricing 스텁이 projects 예산을 직접 변경함");
  });

  console.log(`=== 결과: PASS ${passed}, FAIL ${failed}, TOTAL ${passed + failed} ===`);
  if (failed > 0) process.exitCode = 1;
}

void main();
