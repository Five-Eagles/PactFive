import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function ensurePackagesInstalled(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(directory, "scripts", "ensure-deps.js"))) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("scripts/ensure-deps.js를 찾지 못했습니다.");
    directory = parent;
  }
  execSync(`node ${JSON.stringify(path.join(directory, "scripts", "ensure-deps.js"))}`, {
    stdio: "inherit",
  });
  return directory;
}

async function main(): Promise<void> {
  const repositoryRoot = ensurePackagesInstalled();

  const [
    step1Module,
    typesModule,
    constantsModule,
    serviceModule,
    controllerModule,
    mockModule,
    repositoryModule,
    analyzerModule,
    projectApplicationModule,
    openAiModule,
    apiModule,
    pageModule,
    formModule,
    hookModule,
    reactModule,
    serverModule,
  ] = await Promise.all([
    import("./mock/in-memory-pricing-analysis.adapter"),
    import("./server/pricing-analysis.types"),
    import("./server/pricing-analysis.constants"),
    import("./server/pricing-analysis.service"),
    import("./server/pricing-analysis.controller"),
    import("./mock/pricing-analysis.mock"),
    import("./mock/in-memory-pricing-analysis.repository"),
    import("./mock/deterministic-pricing-analyzer.adapter"),
    import("./server/project-budget-application.port"),
    import("./server/openai.adapter"),
    import("./web/api/pricing-analysis"),
    import("./web/PricingAnalysisPage"),
    import("./web/PricingAnalysisForm"),
    import("./web/usePricingAnalysis"),
    import("react"),
    import("react-dom/server"),
  ]);

  const { InMemoryPricingAnalysisAdapter } = step1Module;
  const { PricingAnalysisContractError, PricingAnalysisApiError } = typesModule;
  const {
    PRICING_ANALYSIS_CATEGORIES,
    PRICING_ANALYSIS_INPUT_SCHEMA_VERSION,
    PRICING_ANALYSIS_SCHEMA_VERSION,
    PRICING_APPLICATION_INPUT_SCHEMA_VERSION,
    isValidPricingIdempotencyKey,
  } = constantsModule;
  const {
    applyPricingAnalysis,
    createPricingAnalysis,
    toPricingAnalysisResponse,
    validatePricingRecommendation,
  } = serviceModule;
  const { parsePricingAnalysisJsonBody } = controllerModule;
  const { createPricingAnalysisApiMock } = mockModule;
  const { InMemoryPricingAnalysisRepository } = repositoryModule;
  const {
    DeterministicPricingAnalyzer,
    createDeterministicRecommendation,
  } = analyzerModule;
  const { ProjectBudgetApplicationError } = projectApplicationModule;
  const { OPENAI_RESPONSE_BODY_MAX_BYTES, OpenAIPricingAnalyzer } = openAiModule;
  const {
    createPricingAnalysisApiClient,
    isApplyPricingAnalysisResponse,
    isPricingAnalysisResponse,
    PricingAnalysisClientError,
  } = apiModule;
  const { PricingAnalysisPage, pricingFocusTargetForStatus } = pageModule;
  const { PricingAnalysisForm } = formModule;
  const {
    getWithinPendingDeadline,
    PENDING_POLL_POLICY,
    canContinuePendingPolling,
    pendingPollDelay,
    PendingPollDeadlineError,
    pollPendingAnalysis,
    selectPricingAnalysisRetryKey,
    shouldRotatePricingAnalysisCreateKey,
  } = hookModule;
  const { createElement } = reactModule;
  const { renderToStaticMarkup } = serverModule;

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

  function approvedStep1Record(id: string, overrides: Record<string, unknown> = {}) {
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

  async function expectApiError(
    operation: () => Promise<unknown>,
    code: string,
    httpStatus?: number,
  ): Promise<InstanceType<typeof PricingAnalysisApiError>> {
    let caught: unknown;
    try {
      await operation();
    } catch (error) {
      caught = error;
    }
    assert(caught instanceof PricingAnalysisApiError, `${code} 오류가 발생하지 않음`);
    assert(caught.body.error.code === code, `오류 코드 불일치: ${caught.body.error.code}`);
    if (httpStatus !== undefined) {
      assert(caught.httpStatus === httpStatus, `HTTP 상태 불일치: ${caught.httpStatus}`);
    }
    return caught;
  }

  const actor = { userId: "usr_client", role: "CLIENT" };
  const validInput = {
    title: " B2B 주문 관리 웹 서비스 구축 ",
    description: " 관리자와 파트너사가 주문과 재고 현황을 관리하는 반응형 웹 서비스입니다. ",
    category: "WEB_DEVELOPMENT",
  };

  await test("S1-R1 claim은 전달된 transaction에서 저장 금액을 연결하고 반환한다", async () => {
    const fixedNow = new Date("2026-08-28T00:00:00.000Z");
    const adapter = new InMemoryPricingAnalysisAdapter(
      [approvedStep1Record("pa_claim")],
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
    assert(adapter.getClaimCalls()[0]?.transaction === transaction, "호출자의 transaction을 교체함");
  });

  await test("S1-R2 claim은 소유자·승인·미적용 조건 위반을 같은 코드로 거부한다", async () => {
    const adapter = new InMemoryPricingAnalysisAdapter([
      approvedStep1Record("pa_owner"),
      approvedStep1Record("pa_pending", { reviewStatus: "PENDING" }),
      approvedStep1Record("pa_applied", {
        projectId: "prj_existing",
        appliedAt: new Date("2026-08-27T00:00:00.000Z"),
      }),
    ]);
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

  await test("S1-R3 같은 분석을 두 번째 프로젝트에 claim할 수 없다", async () => {
    const adapter = new InMemoryPricingAnalysisAdapter([approvedStep1Record("pa_once")]);
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

  await test("S1-R4 기존 프로젝트 추천 조회는 읽기 전용이며 재조회할 수 있다", async () => {
    const appliedAt = new Date("2026-08-27T00:00:00.000Z");
    const adapter = new InMemoryPricingAnalysisAdapter([
      approvedStep1Record("pa_read", { projectId: "prj_existing", appliedAt }),
    ]);
    const before = adapter.findById("pa_read");
    const response = await adapter.getPricingAnalysisRecommendation({
      analysisId: "pa_read",
      projectId: "prj_existing",
      requesterId: "usr_client",
    });
    assert(response.recommendedAmount === 1_500_000, "저장 추천 금액 조회 실패");
    assert(JSON.stringify(adapter.findById("pa_read")) === JSON.stringify(before), "조회가 상태를 변경함");
  });

  await test("S1-R5 조회는 다른 소유자·프로젝트·미승인 분석을 거부한다", async () => {
    const adapter = new InMemoryPricingAnalysisAdapter([
      approvedStep1Record("pa_bound", {
        projectId: "prj_bound",
        appliedAt: new Date("2026-08-27T00:00:00.000Z"),
      }),
      approvedStep1Record("pa_pending_read", { reviewStatus: "PENDING" }),
    ]);
    for (const query of [
      { analysisId: "pa_bound", projectId: "prj_bound", requesterId: "usr_other" },
      { analysisId: "pa_bound", projectId: "prj_other", requesterId: "usr_client" },
      { analysisId: "pa_pending_read", projectId: "prj_new", requesterId: "usr_client" },
    ]) {
      await expectContractError(
        () => adapter.getPricingAnalysisRecommendation(query),
        "PRICING_ANALYSIS_NOT_APPLICABLE",
      );
    }
  });

  await test("S1-R6 Step 1 어댑터는 OpenAI와 project 예산 갱신을 계속 알지 못한다", () => {
    const source = readFileSync(
      path.join(repositoryRoot, "features/ai-pricing/prototype/mock/in-memory-pricing-analysis.adapter.ts"),
      "utf8",
    );
    assert(!source.toLowerCase().includes("openai"), "Step 1 어댑터에 공급자 의존이 생김");
    assert(!source.includes("budgetAmount"), "Step 1 어댑터가 project 예산을 직접 변경함");
    assert(source.includes("claimPricingAnalysisForCreatedProject"), "기존 claim 함수가 사라짐");
    assert(source.includes("getPricingAnalysisRecommendation"), "기존 조회 함수가 사라짐");
  });

  await test("S2-R1 카테고리와 멱등 키 validator는 한 정본의 경계를 지킨다", () => {
    assert(
      JSON.stringify(PRICING_ANALYSIS_CATEGORIES) === JSON.stringify([
        "WEB_DEVELOPMENT", "MOBILE_APP", "DESIGN", "DATA_AI", "PLANNING", "MARKETING",
      ]),
      "현재 앱 6개 category가 아님",
    );
    assert(isValidPricingIdempotencyKey("12345678"), "8자 키를 거부함");
    assert(isValidPricingIdempotencyKey("x".repeat(100)), "100자 키를 거부함");
    assert(!isValidPricingIdempotencyKey("1234567"), "7자 키를 허용함");
    assert(!isValidPricingIdempotencyKey("x".repeat(101)), "101자 키를 허용함");
    assert(!isValidPricingIdempotencyKey("has space"), "공백 키를 허용함");
    assert(!isValidPricingIdempotencyKey("한글키123456"), "non-ASCII 키를 허용함");
  });

  await test("S2-R2 생성은 인증 CLIENT와 입력·unknown field를 검증한다", async () => {
    const api = createPricingAnalysisApiMock();
    await expectApiError(() => api.create(undefined, validInput, "create-key-0001"), "AUTH_REQUIRED", 401);
    await expectApiError(
      () => api.create({ userId: "usr_freelancer", role: "FREELANCER" }, validInput, "create-key-0002"),
      "PRICING_ANALYSIS_ROLE_REQUIRED",
      403,
    );
    await expectApiError(
      () => api.create(actor, { ...validInput, title: "짧음" }, "create-key-0003"),
      "VALIDATION_ERROR",
      422,
    );
    await expectApiError(
      () => api.create(actor, { ...validInput, category: "APP_DEVELOPMENT" }, "create-key-0004"),
      "INVALID_CATEGORY",
      422,
    );
    await expectApiError(
      () => api.create(actor, { ...validInput, extra: true } as typeof validInput, "create-key-0005"),
      "VALIDATION_ERROR",
      422,
    );
    assert(
      JSON.stringify(parsePricingAnalysisJsonBody(JSON.stringify(validInput))) === JSON.stringify(validInput),
      "정상 JSON body 파싱 실패",
    );
    let malformedJsonError: unknown;
    try { parsePricingAnalysisJsonBody('{"title":'); } catch (error) { malformedJsonError = error; }
    assert(malformedJsonError instanceof PricingAnalysisApiError, "malformed JSON이 API 오류가 아님");
    assert(malformedJsonError.body.error.code === "MALFORMED_JSON", "malformed JSON 코드 불일치");
    assert(malformedJsonError.httpStatus === 400, "malformed JSON HTTP 상태 불일치");
    assert(!JSON.stringify(malformedJsonError.body).includes('{"title":'), "malformed JSON 원문 노출");
  });

  await test("S2-R3 생성은 PENDING 예약 후 분석하고 공개 DTO만 반환한다", async () => {
    const recommendation = createDeterministicRecommendation();
    let repositorySeen: InstanceType<typeof InMemoryPricingAnalysisRepository> | null = null;
    let pendingSeen = false;
    const analyzer = {
      model: "internal-model-do-not-publish",
      configured: true,
      async analyze() {
        const rows = repositorySeen?.getAllRecords() ?? [];
        pendingSeen = rows.length === 1 && rows[0]?.reviewStatus === "PENDING" && rows[0]?.result === null;
        return recommendation;
      },
    };
    const api = createPricingAnalysisApiMock({ analyzer });
    repositorySeen = api.repository;
    const response = await api.create(actor, validInput, "create-key-0010");
    assert(pendingSeen, "analyzer 호출 전에 PENDING을 저장하지 않음");
    assert(response.httpStatus === 201, "최초 성공이 201이 아님");
    assert(response.body.reviewStatus === "APPROVED", "APPROVED가 아님");
    assert(response.body.inputSnapshot.title === validInput.title.trim(), "제목 trim snapshot 실패");
    assert(response.body.reviewedAt !== null, "분석 완료 시각 누락");
    const serialized = JSON.stringify(response.body);
    for (const privateField of ["model", "provider", "promptVersion", "schemaVersion"]) {
      assert(!serialized.includes(privateField), `공개 DTO가 ${privateField}를 노출함`);
    }
  });

  await test("S2-R4 동시 exact replay는 202 PENDING이고 analyzer는 한 번만 호출된다", async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    let calls = 0;
    const analyzer = {
      model: "blocking-mock",
      configured: true,
      async analyze() {
        calls += 1;
        started?.();
        await gate;
        return createDeterministicRecommendation();
      },
    };
    const api = createPricingAnalysisApiMock({ analyzer });
    const first = api.create(actor, validInput, "create-key-0020");
    await entered;
    const replay = await api.create(actor, validInput, "create-key-0020");
    assert(replay.httpStatus === 202, "처리 중 replay가 202가 아님");
    assert(replay.body.reviewStatus === "PENDING", "처리 중 DTO가 PENDING이 아님");
    assert(calls === 1, "exact replay가 analyzer를 다시 호출함");
    release?.();
    const completed = await first;
    assert(completed.httpStatus === 201, "최초 호출이 완료되지 않음");
    const terminalReplay = await api.create(actor, validInput, "create-key-0020");
    assert(terminalReplay.httpStatus === 200, "terminal replay가 200이 아님");
    assert(terminalReplay.body.pricingAnalysisId === completed.body.pricingAnalysisId, "다른 ID를 반환함");
  });

  await test("S2-R5 같은 생성 키의 다른 fingerprint는 409이며 재분석하지 않는다", async () => {
    const analyzer = new DeterministicPricingAnalyzer();
    const api = createPricingAnalysisApiMock({ analyzer });
    await api.create(actor, validInput, "create-key-0030");
    await expectApiError(
      () => api.create(actor, { ...validInput, description: `${validInput.description} 다른 범위` }, "create-key-0030"),
      "IDEMPOTENCY_KEY_REUSED",
      409,
    );
    assert(analyzer.getCalls().length === 1, "충돌 요청이 analyzer를 호출함");
    const otherActor = { userId: "usr_other_client", role: "CLIENT" };
    const other = await api.create(otherActor, validInput, "create-key-0030");
    assert(other.httpStatus === 201, "다른 사용자의 동일 키를 전역 충돌로 처리함");
    assert(other.body.pricingAnalysisId !== api.repository.getAllRecords()[0]?.analysisId, "사용자별 새 분석을 만들지 않음");
    assert(analyzer.getCalls().length === 2, "다른 사용자의 동일 키 분석을 생략함");
  });

  await test("S2-R6 잘못된 breakdown과 합계는 검증을 통과하지 못한다", async () => {
    const valid = createDeterministicRecommendation();
    assert(validatePricingRecommendation(valid), "정상 결과를 거부함");
    assert(!validatePricingRecommendation({ ...valid, recommendedAmount: 1_500_001 }), "합계 불일치 허용");
    assert(!validatePricingRecommendation({ ...valid, recommendedAmount: 1.5 }), "소수 금액 허용");
    assert(!validatePricingRecommendation({ ...valid, breakdown: [] }), "빈 breakdown 허용");
    assert(!validatePricingRecommendation({
      ...valid,
      breakdown: [{ ...valid.breakdown[0], amount: -1 }],
      recommendedAmount: -1,
    }), "음수 금액 허용");
    assert(!validatePricingRecommendation({
      ...valid,
      breakdown: Array.from({ length: 21 }, (_, index) => ({
        name: `항목 ${index}`,
        description: "설명",
        amount: 1,
        rationale: "근거",
      })),
      recommendedAmount: 21,
    }), "breakdown 20개 상한을 넘김");
    assert(!validatePricingRecommendation({
      ...valid,
      breakdown: [{ ...valid.breakdown[0], name: "가".repeat(101), amount: 1_500_000 }],
    }), "name 100자 상한을 넘김");
    assert(!validatePricingRecommendation({
      ...valid,
      breakdown: [{ ...valid.breakdown[0], description: "가".repeat(501), amount: 1_500_000 }],
    }), "description 500자 상한을 넘김");
    assert(!validatePricingRecommendation({
      ...valid,
      breakdown: [{ ...valid.breakdown[0], rationale: "가".repeat(1_001), amount: 1_500_000 }],
    }), "rationale 1000자 상한을 넘김");
    assert(!validatePricingRecommendation({
      ...valid,
      providerSecret: "must-not-leak",
    }), "결과 root의 알 수 없는 필드를 허용함");
    assert(!validatePricingRecommendation({
      ...valid,
      breakdown: valid.breakdown.map((item, index) =>
        index === 0 ? { ...item, providerTrace: "must-not-leak" } : item),
    }), "breakdown의 알 수 없는 필드를 허용함");

    const api = createPricingAnalysisApiMock();
    await api.create(actor, validInput, "create-key-schema-01");
    const seeded = api.repository.getAllRecords()[0];
    if (seeded) {
      let corruptRowError: unknown;
      try {
        toPricingAnalysisResponse({
          ...seeded,
          inputSnapshot: {
            ...seeded.inputSnapshot,
            providerSecret: "must-not-leak",
          } as typeof seeded.inputSnapshot,
        });
      } catch (error) {
        corruptRowError = error;
      }
      assert(corruptRowError instanceof PricingAnalysisApiError, "손상된 저장 row를 fail-closed하지 않음");
      assert(corruptRowError.body.error.code === "PRICING_ANALYSIS_STORAGE_FAILED", "손상 row 오류 코드 불일치");
      assert(!JSON.stringify(corruptRowError.body).includes("providerSecret"), "입력 snapshot 추가 필드 노출");

      let reboundFingerprintError: unknown;
      try {
        toPricingAnalysisResponse({
          ...seeded,
          inputSnapshot: {
            ...seeded.inputSnapshot,
            title: "변조됐지만 형식은 유효한 프로젝트 제목",
          },
        });
      } catch (error) {
        reboundFingerprintError = error;
      }
      assert(reboundFingerprintError instanceof PricingAnalysisApiError, "snapshot과 fingerprint 재결합 실패");
      assert(
        reboundFingerprintError.body.error.code === "PRICING_ANALYSIS_STORAGE_FAILED",
        "snapshot fingerprint 불일치를 저장 오류로 닫지 않음",
      );
    }
  });

  await test("S2-R7 공급자 시간초과는 안전한 REJECTED이고 exact replay 후 새 키 재시도는 새 행이다", async () => {
    const analyzer = new DeterministicPricingAnalyzer();
    analyzer.enqueueError("TIMEOUT");
    const api = createPricingAnalysisApiMock({ analyzer });
    const firstError = await expectApiError(
      () => api.create(actor, validInput, "create-key-0040"),
      "PRICING_ANALYSIS_TIMEOUT",
      504,
    );
    const rejected = firstError.body.error.details?.analysis;
    assert(rejected?.reviewStatus === "REJECTED", "REJECTED 공개 상태 누락");
    assert(rejected.failure?.retryable === true, "재시도 가능 표시 누락");
    const firstId = rejected.pricingAnalysisId;
    const replayedError = await expectApiError(
      () => api.create(actor, validInput, "create-key-0040"),
      "PRICING_ANALYSIS_TIMEOUT",
      504,
    );
    assert(
      JSON.stringify(replayedError.body) === JSON.stringify(firstError.body),
      "REJECTED exact replay의 최초 오류 body가 달라짐",
    );
    const corruptFailureRow = api.repository.getAllRecords()[0];
    if (corruptFailureRow) {
      let unknownFailureCodeError: unknown;
      try {
        toPricingAnalysisResponse({
          ...corruptFailureRow,
          failureCode: "RAW_PROVIDER_ERROR" as never,
        });
      } catch (error) {
        unknownFailureCodeError = error;
      }
      assert(unknownFailureCodeError instanceof PricingAnalysisApiError, "unknown 저장 failure code를 허용함");
      assert(
        unknownFailureCodeError.body.error.code === "PRICING_ANALYSIS_STORAGE_FAILED",
        "unknown 저장 failure code 오류 분류 실패",
      );
    }
    const rejectedRow = api.repository.getAllRecords()[0];
    assert(rejectedRow?.failureHttpStatus === 504, "최초 실패 HTTP 상태 snapshot 누락");
    assert(
      rejectedRow.failureSnapshot?.message === firstError.body.error.message,
      "최초 공개 실패 body snapshot 누락",
    );
    assert(analyzer.getCalls().length === 1, "실패 exact replay가 analyzer를 다시 호출함");
    const retried = await api.create(actor, validInput, "create-key-0041");
    assert(retried.body.pricingAnalysisId !== firstId, "REJECTED 행을 재활성화함");
    assert(api.repository.getAllRecords().length === 2, "재시도 새 행이 없음");
  });

  await test("S2-R8 무효 analyzer 출력은 502 REJECTED로 저장한다", async () => {
    const analyzer = new DeterministicPricingAnalyzer();
    const invalid = createDeterministicRecommendation();
    invalid.recommendedAmount += 1;
    analyzer.setDefaultResult(invalid);
    const api = createPricingAnalysisApiMock({ analyzer });
    const error = await expectApiError(
      () => api.create(actor, validInput, "create-key-0050"),
      "PRICING_ANALYSIS_INVALID_RESULT",
      502,
    );
    assert(error.body.error.details?.analysis?.result === null, "무효 결과를 공개함");
    assert(api.repository.getAllRecords()[0]?.failureCode === "INVALID_PROVIDER_RESPONSE", "실패 분류 누락");
  });

  await test("S2-R9 GET은 owner만 허용하고 입력 snapshot을 복제해 반환한다", async () => {
    const api = createPricingAnalysisApiMock();
    const created = await api.create(actor, validInput, "create-key-0060");
    created.body.inputSnapshot.title = "클라이언트가 바꾼 값";
    const loaded = await api.get(actor, created.body.pricingAnalysisId);
    assert(loaded.inputSnapshot.title === validInput.title.trim(), "저장 snapshot이 외부 변경됨");
    await expectApiError(
      () => api.get({ userId: "usr_other", role: "CLIENT" }, created.body.pricingAnalysisId),
      "PRICING_ANALYSIS_NOT_FOUND",
      404,
    );
  });

  await test("S2-R10 analyzer 설정 누락은 신규 행을 만들지 않지만 기존 결과 replay는 허용한다", async () => {
    const first = createPricingAnalysisApiMock();
    const created = await first.create(actor, validInput, "create-key-0070");
    const seed = first.repository.getAllRecords();
    const unconfigured = {
      model: "",
      configured: false,
      async analyze() { return createDeterministicRecommendation(); },
    };
    const replayApi = createPricingAnalysisApiMock({ seed, analyzer: unconfigured });
    const replay = await replayApi.create(actor, validInput, "create-key-0070");
    assert(replay.httpStatus === 200 && replay.body.pricingAnalysisId === created.body.pricingAnalysisId, "설정 없이 replay 실패");
    await expectApiError(
      () => replayApi.create(actor, validInput, "create-key-0071"),
      "PRICING_ANALYZER_UNAVAILABLE",
      503,
    );
    assert(replayApi.repository.getAllRecords().length === 1, "설정 누락인데 PENDING을 생성함");

    let malformedConfiguredCalls = 0;
    const malformedConfiguredApi = createPricingAnalysisApiMock({
      analyzer: {
        model: "model-test",
        configured: "true" as never,
        async analyze() {
          malformedConfiguredCalls += 1;
          return createDeterministicRecommendation();
        },
      },
    });
    await expectApiError(
      () => malformedConfiguredApi.create(actor, validInput, "create-key-0072"),
      "PRICING_ANALYZER_UNAVAILABLE",
      503,
    );
    assert(malformedConfiguredCalls === 0, "malformed configured 값으로 analyzer를 호출함");
    assert(malformedConfiguredApi.repository.getAllRecords().length === 0, "malformed 설정으로 PENDING을 생성함");
  });

  await test("S2-R11 저장소 오류는 원문을 숨긴 안전한 500으로 매핑된다", async () => {
    const repository = new InMemoryPricingAnalysisRepository();
    repository.findByIdempotency = async () => { throw new Error("database-secret-detail"); };
    const analyzer = new DeterministicPricingAnalyzer();
    const error = await expectApiError(
      () => createPricingAnalysis(
        { repository, analyzer, now: () => "2026-09-04T09:00:00.000Z", nextAnalysisId: () => "pra_storage" },
        actor,
        validInput,
        "create-key-0080",
      ),
      "PRICING_ANALYSIS_STORAGE_FAILED",
      500,
    );
    assert(!JSON.stringify(error.body).includes("database-secret-detail"), "저장소 오류 원문 노출");

    const spoofedApiErrorRepository = new InMemoryPricingAnalysisRepository();
    spoofedApiErrorRepository.findByIdempotency = async () => {
      throw new PricingAnalysisApiError(
        "VALIDATION_ERROR",
        "database-secret-api-error",
        { fields: [{ field: "internalColumn", reason: "invalid" }] },
      );
    };
    const spoofedStorageError = await expectApiError(
      () => createPricingAnalysis(
        {
          repository: spoofedApiErrorRepository,
          analyzer,
          now: () => "2026-09-04T09:00:00.000Z",
          nextAnalysisId: () => "pra_storage_spoof",
        },
        actor,
        validInput,
        "create-key-0080b",
      ),
      "PRICING_ANALYSIS_STORAGE_FAILED",
      500,
    );
    assert(!JSON.stringify(spoofedStorageError.body).includes("database-secret"), "저장소가 던진 API 오류를 신뢰함");

    const malformedReservation = createPricingAnalysisApiMock();
    malformedReservation.repository.reservePending = async () => ({ kind: "unexpected" } as never);
    await expectApiError(
      () => malformedReservation.create(actor, validInput, "create-key-0081"),
      "PRICING_ANALYSIS_STORAGE_FAILED",
      500,
    );
    assert(
      (malformedReservation.analyzer as InstanceType<typeof DeterministicPricingAnalyzer>).getCalls().length === 0,
      "malformed 예약 결과 뒤 analyzer를 호출함",
    );

    const malformedCas = createPricingAnalysisApiMock();
    malformedCas.repository.markApprovedIfPending = async () => "changed" as never;
    await expectApiError(
      () => malformedCas.create(actor, validInput, "create-key-0082"),
      "PRICING_ANALYSIS_STORAGE_FAILED",
      500,
    );

    const wrongReplay = createPricingAnalysisApiMock();
    wrongReplay.repository.markApprovedIfPending = async () => false;
    const originalFindById = wrongReplay.repository.findById.bind(wrongReplay.repository);
    wrongReplay.repository.findById = async (analysisId) => {
      const pending = await originalFindById(analysisId);
      return pending ? {
        ...pending,
        analysisId: "pra_wrong_replay",
        reviewStatus: "APPROVED" as const,
        result: createDeterministicRecommendation(),
        reviewedAt: "2026-09-04T09:00:01.000Z",
      } : null;
    };
    await expectApiError(
      () => wrongReplay.create(actor, validInput, "create-key-0083"),
      "PRICING_ANALYSIS_STORAGE_FAILED",
      500,
    );
  });

  await test("S2-R12 apply는 고정 키로 예산·분석·멱등 결과를 원자 반영하고 exact replay한다", async () => {
    const api = createPricingAnalysisApiMock();
    const created = await api.create(actor, validInput, "create-key-0090");
    const analysisId = created.body.pricingAnalysisId;
    const applyKey = `pricing-apply-${analysisId}`;
    const applied = await api.apply(
      actor,
      analysisId,
      { projectId: "prj_existing", expectedBudgetAmount: 900_000, expectedProjectVersion: 3 },
      applyKey,
    );
    assert(applied.budgetAmount === 1_500_000 && applied.changed, "추천 예산 반영 실패");
    assert(api.repository.getAllRecords()[0]?.appliedAt === applied.appliedAt, "분석 적용 시각 누락");
    assert(api.projectBudgetApplication.findProject("prj_existing")?.budgetAmount === 1_500_000, "project 예산 미변경");
    api.setNow("2026-09-04T10:00:00.000Z");
    const replay = await api.apply(
      actor,
      analysisId,
      { projectId: "prj_existing", expectedBudgetAmount: 900_000, expectedProjectVersion: 3 },
      applyKey,
    );
    assert(JSON.stringify(replay) === JSON.stringify(applied), "apply exact replay가 최초 body를 재생하지 않음");
    assert(api.projectBudgetApplication.getCalls().length === 1, "apply replay가 mutation을 재실행함");
  });

  await test("S2-R13 apply는 키 누락·다른 fingerprint·owner 위반을 거부한다", async () => {
    const api = createPricingAnalysisApiMock();
    const created = await api.create(actor, validInput, "create-key-0100");
    const analysisId = created.body.pricingAnalysisId;
    await expectApiError(
      () => api.apply(actor, analysisId, { projectId: "prj_existing", expectedBudgetAmount: 900_000 }),
      "IDEMPOTENCY_KEY_REQUIRED",
      422,
    );
    const key = `pricing-apply-${analysisId}`;
    await api.apply(actor, analysisId, { projectId: "prj_existing", expectedBudgetAmount: 900_000, expectedProjectVersion: 3 }, key);
    await expectApiError(
      () => api.apply(actor, analysisId, { projectId: "prj_existing", expectedBudgetAmount: 900_000, expectedProjectVersion: 2 }, key),
      "IDEMPOTENCY_KEY_REUSED",
      409,
    );
    await expectApiError(
      () => api.apply({ userId: "usr_other", role: "CLIENT" }, analysisId, { projectId: "prj_existing", expectedBudgetAmount: 900_000 }, key),
      "PRICING_ANALYSIS_NOT_FOUND",
      404,
    );
  });

  await test("S2-R14 원자 apply 포트가 없으면 양쪽 데이터를 바꾸지 않고 503이다", async () => {
    const api = createPricingAnalysisApiMock({ withProjectBudgetApplication: false });
    const created = await api.create(actor, validInput, "create-key-0110");
    const before = api.repository.getAllRecords()[0];
    await expectApiError(
      () => api.apply(
        actor,
        created.body.pricingAnalysisId,
        { projectId: "prj_existing", expectedBudgetAmount: 900_000 },
        `pricing-apply-${created.body.pricingAnalysisId}`,
      ),
      "PRICING_APPLICATION_UNAVAILABLE",
      503,
    );
    const after = api.repository.getAllRecords()[0];
    assert(after?.appliedAt === before?.appliedAt && after?.projectId === before?.projectId, "분석만 부분 갱신됨");
    assert(api.projectBudgetApplication.findProject("prj_existing")?.budgetAmount === 900_000, "project만 부분 갱신됨");

    const storageApi = createPricingAnalysisApiMock();
    const storageCreated = await storageApi.create(actor, validInput, "create-key-0111");
    const storageError = await expectApiError(
      () => applyPricingAnalysis(
        {
          repository: storageApi.repository,
          analyzer: storageApi.analyzer,
          projectBudgetApplication: {
            async applyPricingAnalysisBudget() { throw new Error("transaction-secret-detail"); },
          },
          now: () => "2026-09-04T09:30:00.000Z",
          nextAnalysisId: () => "pra_unused",
        },
        actor,
        storageCreated.body.pricingAnalysisId,
        { projectId: "prj_existing", expectedBudgetAmount: 900_000 },
        `pricing-apply-${storageCreated.body.pricingAnalysisId}`,
      ),
      "PRICING_APPLICATION_STORAGE_FAILED",
      500,
    );
    assert(!JSON.stringify(storageError.body).includes("transaction-secret-detail"), "transaction 오류 원문 노출");
    assert(storageApi.repository.getAllRecords()[0]?.appliedAt === null, "transaction 실패 뒤 분석 부분 갱신");

    const malformedPortApi = createPricingAnalysisApiMock();
    const malformedPortCreated = await malformedPortApi.create(actor, validInput, "create-key-0112");
    await expectApiError(
      () => applyPricingAnalysis(
        {
          repository: malformedPortApi.repository,
          analyzer: malformedPortApi.analyzer,
          projectBudgetApplication: {
            async applyPricingAnalysisBudget(input) {
              return {
                pricingAnalysisId: "pra_wrong",
                projectId: input.projectId,
                budgetAmount: input.recommendedAmount,
                currency: "KRW" as const,
                appliedAt: input.appliedAt,
                processedAt: input.processedAt,
                changed: true as const,
                projectVersion: 4,
                extra: "must-not-pass",
              } as never;
            },
          },
          now: () => "2026-09-04T09:30:00.000Z",
          nextAnalysisId: () => "pra_unused",
        },
        actor,
        malformedPortCreated.body.pricingAnalysisId,
        { projectId: "prj_existing", expectedBudgetAmount: 900_000 },
        `pricing-apply-${malformedPortCreated.body.pricingAnalysisId}`,
      ),
      "PRICING_APPLICATION_STORAGE_FAILED",
      500,
    );
    assert(malformedPortApi.repository.getAllRecords()[0]?.appliedAt === null, "malformed port 결과 뒤 분석 부분 갱신");

    const spoofedPortApi = createPricingAnalysisApiMock();
    const spoofedPortCreated = await spoofedPortApi.create(actor, validInput, "create-key-0112b");
    const spoofedPortError = await expectApiError(
      () => applyPricingAnalysis(
        {
          repository: spoofedPortApi.repository,
          analyzer: spoofedPortApi.analyzer,
          projectBudgetApplication: {
            async applyPricingAnalysisBudget() {
              throw new PricingAnalysisApiError(
                "PROJECT_FORBIDDEN",
                "project-port-secret-api-error",
              );
            },
          },
          now: () => "2026-09-04T09:30:00.000Z",
          nextAnalysisId: () => "pra_unused",
        },
        actor,
        spoofedPortCreated.body.pricingAnalysisId,
        { projectId: "prj_existing", expectedBudgetAmount: 900_000 },
        `pricing-apply-${spoofedPortCreated.body.pricingAnalysisId}`,
      ),
      "PRICING_APPLICATION_STORAGE_FAILED",
      500,
    );
    assert(!JSON.stringify(spoofedPortError.body).includes("project-port-secret"), "포트가 던진 API 오류를 신뢰함");

    const unknownCodeApi = createPricingAnalysisApiMock();
    const unknownCodeCreated = await unknownCodeApi.create(actor, validInput, "create-key-0113");
    await expectApiError(
      () => applyPricingAnalysis(
        {
          repository: unknownCodeApi.repository,
          analyzer: unknownCodeApi.analyzer,
          projectBudgetApplication: {
            async applyPricingAnalysisBudget() {
              throw new ProjectBudgetApplicationError("UNKNOWN_PORT_CODE" as never);
            },
          },
          now: () => "2026-09-04T09:30:00.000Z",
          nextAnalysisId: () => "pra_unused",
        },
        actor,
        unknownCodeCreated.body.pricingAnalysisId,
        { projectId: "prj_existing", expectedBudgetAmount: 900_000 },
        `pricing-apply-${unknownCodeCreated.body.pricingAnalysisId}`,
      ),
      "PRICING_APPLICATION_STORAGE_FAILED",
      500,
    );
  });

  await test("S2-R15 project lock·version·budget CAS는 부분 갱신 없이 구분된다", async () => {
    const locked = createPricingAnalysisApiMock({
      projects: [{
        projectId: "prj_locked", clientId: "usr_client", budgetAmount: 800_000,
        projectVersion: 4, recruitmentOpen: true, hasPendingApplications: true,
      }],
    });
    const lockedAnalysis = await locked.create(actor, validInput, "create-key-0120");
    await expectApiError(
      () => locked.apply(
        actor,
        lockedAnalysis.body.pricingAnalysisId,
        { projectId: "prj_locked", expectedBudgetAmount: 800_000, expectedProjectVersion: 4 },
        `pricing-apply-${lockedAnalysis.body.pricingAnalysisId}`,
      ),
      "PROJECT_EDIT_LOCKED",
      409,
    );
    assert(locked.repository.getAllRecords()[0]?.appliedAt === null, "lock 실패 뒤 분석이 적용됨");
    assert(locked.projectBudgetApplication.findProject("prj_locked")?.budgetAmount === 800_000, "lock 실패 뒤 예산 변경됨");

    const versioned = createPricingAnalysisApiMock();
    const versionAnalysis = await versioned.create(actor, validInput, "create-key-0121");
    await expectApiError(
      () => versioned.apply(
        actor,
        versionAnalysis.body.pricingAnalysisId,
        { projectId: "prj_existing", expectedBudgetAmount: 900_000, expectedProjectVersion: 99 },
        `pricing-apply-${versionAnalysis.body.pricingAnalysisId}`,
      ),
      "PROJECT_VERSION_CONFLICT",
      409,
    );
    assert(versioned.repository.getAllRecords()[0]?.appliedAt === null, "version 실패 뒤 분석이 적용됨");

    const budgetChanged = createPricingAnalysisApiMock();
    const budgetAnalysis = await budgetChanged.create(actor, validInput, "create-key-0122");
    await expectApiError(
      () => budgetChanged.apply(
        actor,
        budgetAnalysis.body.pricingAnalysisId,
        { projectId: "prj_existing", expectedBudgetAmount: 700_000 },
        `pricing-apply-${budgetAnalysis.body.pricingAnalysisId}`,
      ),
      "PROJECT_BUDGET_CONFLICT",
      409,
    );
    assert(budgetChanged.repository.getAllRecords()[0]?.appliedAt === null, "budget CAS 실패 뒤 분석이 적용됨");

    const competing = createPricingAnalysisApiMock();
    const firstAnalysis = await competing.create(actor, validInput, "create-key-0123");
    const secondAnalysis = await competing.create(actor, { ...validInput, title: "두 번째 주문 관리 웹 서비스" }, "create-key-0124");
    const outcomes = await Promise.allSettled([
      competing.apply(
        actor,
        firstAnalysis.body.pricingAnalysisId,
        { projectId: "prj_existing", expectedBudgetAmount: 900_000 },
        `pricing-apply-${firstAnalysis.body.pricingAnalysisId}`,
      ),
      competing.apply(
        actor,
        secondAnalysis.body.pricingAnalysisId,
        { projectId: "prj_existing", expectedBudgetAmount: 900_000 },
        `pricing-apply-${secondAnalysis.body.pricingAnalysisId}`,
      ),
    ]);
    assert(outcomes.filter((outcome) => outcome.status === "fulfilled").length === 1, "경쟁 apply 둘 다 성공함");
    const rejectedOutcome = outcomes.find((outcome) => outcome.status === "rejected");
    assert(
      rejectedOutcome?.status === "rejected" &&
        rejectedOutcome.reason instanceof PricingAnalysisApiError &&
        rejectedOutcome.reason.body.error.code === "PROJECT_BUDGET_CONFLICT",
      "경쟁 loser가 budget CAS 409가 아님",
    );
    assert(competing.repository.getAllRecords().filter((row) => row.appliedAt !== null).length === 1, "경쟁 loser 분석까지 적용됨");
  });

  await test("S2-R16 OpenAI adapter는 Responses strict json_schema와 timeout 경계를 사용한다", async () => {
    let requestBody: any = null;
    const adapter = new OpenAIPricingAnalyzer({
      apiKey: "secret-test-key",
      model: "  model-test  ",
      schemaCompatibleModels: ["model-test"],
      maxOutputTokens: 1234,
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
          object: "response",
          status: "completed",
          error: null,
          incomplete_details: null,
          output: [{
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{
              type: "output_text",
              text: JSON.stringify(createDeterministicRecommendation()),
            }],
          }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      },
    });
    const result = await adapter.analyze({
      title: validInput.title.trim(),
      description: validInput.description.trim(),
      category: "WEB_DEVELOPMENT",
    });
    assert(adapter.model === "model-test", "model trim 실패");
    assert(requestBody?.instructions && typeof requestBody.input === "string", "top-level instructions/input 누락");
    assert(requestBody?.text?.format?.type === "json_schema", "Responses text.format 미사용");
    assert(requestBody?.text?.format?.strict === true, "strict schema가 아님");
    assert(requestBody?.store === false, "공급자 응답 저장 비활성화 누락");
    assert(requestBody?.max_output_tokens === 1234, "max_output_tokens 누락");
    const resultSchema = requestBody?.text?.format?.schema;
    assert(resultSchema?.properties?.breakdown?.maxItems === 20, "breakdown maxItems 누락");
    assert(resultSchema?.properties?.breakdown?.items?.properties?.name?.maxLength === 100, "name maxLength 누락");
    assert(resultSchema?.properties?.breakdown?.items?.properties?.description?.maxLength === 500, "description maxLength 누락");
    assert(resultSchema?.properties?.breakdown?.items?.properties?.rationale?.maxLength === 1_000, "rationale maxLength 누락");
    assert(resultSchema?.properties?.recommendedAmount?.maximum === 2_147_483_647, "금액 INT32 상한 누락");
    assert(validatePricingRecommendation(result), "구조화 결과 파싱 실패");
    assert(result.recommendedAmount === 1_500_000, "구조화 추천 금액 불일치");

    const invalidJsonAdapter = new OpenAIPricingAnalyzer({
      apiKey: "secret-invalid-json-key",
      model: "model-test",
      schemaCompatibleModels: ["model-test"],
      fetchImpl: async () => new Response("provider raw invalid json", { status: 200 }),
    });
    let invalidJsonError: unknown;
    try {
      await invalidJsonAdapter.analyze({
        title: validInput.title.trim(), description: validInput.description.trim(), category: "WEB_DEVELOPMENT",
      });
    } catch (error) {
      invalidJsonError = error;
    }
    assert(invalidJsonError instanceof Error, "invalid JSON 경계 오류가 아님");
    assert((invalidJsonError as Error & { kind?: string }).kind === "INVALID_RESPONSE", "invalid JSON 분류 실패");
    assert(!invalidJsonError.message.includes("provider raw"), "invalid JSON 원문 노출");

    let declaredBodyCancelled = false;
    const declaredOversizeAdapter = new OpenAIPricingAnalyzer({
      apiKey: "secret-declared-size-key",
      model: "model-test",
      schemaCompatibleModels: ["model-test"],
      fetchImpl: async () => new Response(new ReadableStream({
        cancel() { declaredBodyCancelled = true; },
      }), {
        status: 200,
        headers: { "Content-Length": String(OPENAI_RESPONSE_BODY_MAX_BYTES + 1) },
      }),
    });
    let declaredOversizeError: unknown;
    try {
      await declaredOversizeAdapter.analyze({
        title: validInput.title.trim(), description: validInput.description.trim(), category: "WEB_DEVELOPMENT",
      });
    } catch (error) {
      declaredOversizeError = error;
    }
    assert(
      declaredOversizeError instanceof Error &&
        (declaredOversizeError as Error & { kind?: string }).kind === "INVALID_RESPONSE",
      "Content-Length body 상한 검사 실패",
    );
    assert(declaredBodyCancelled, "초과 Content-Length 응답 body를 취소하지 않음");

    const streamedOversizeAdapter = new OpenAIPricingAnalyzer({
      apiKey: "secret-streamed-size-key",
      model: "model-test",
      schemaCompatibleModels: ["model-test"],
      fetchImpl: async () => new Response("x".repeat(OPENAI_RESPONSE_BODY_MAX_BYTES + 1), {
        status: 200,
      }),
    });
    let streamedOversizeError: unknown;
    try {
      await streamedOversizeAdapter.analyze({
        title: validInput.title.trim(), description: validInput.description.trim(), category: "WEB_DEVELOPMENT",
      });
    } catch (error) {
      streamedOversizeError = error;
    }
    assert(
      streamedOversizeError instanceof Error &&
        (streamedOversizeError as Error & { kind?: string }).kind === "INVALID_RESPONSE",
      "stream 누적 body 상한 검사 실패",
    );

    for (const malformedOutput of [{}, [{ type: "message", status: "completed", role: "assistant", content: {} }]]) {
      const malformedShapeAdapter = new OpenAIPricingAnalyzer({
        apiKey: "secret-malformed-shape-key",
        model: "model-test",
        schemaCompatibleModels: ["model-test"],
        fetchImpl: async () => new Response(JSON.stringify({
          object: "response",
          status: "completed",
          error: null,
          incomplete_details: null,
          output: malformedOutput,
        }), { status: 200 }),
      });
      let malformedShapeError: unknown;
      try {
        await malformedShapeAdapter.analyze({
          title: validInput.title.trim(), description: validInput.description.trim(), category: "WEB_DEVELOPMENT",
        });
      } catch (error) {
        malformedShapeError = error;
      }
      assert(
        malformedShapeError instanceof Error &&
          (malformedShapeError as Error & { kind?: string }).kind === "INVALID_RESPONSE",
        "malformed output/content 배열 분류 실패",
      );
    }

    const validMessageOutput = [{
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(createDeterministicRecommendation()) }],
    }];
    for (const providerStatus of ["incomplete", "failed", "in_progress", "cancelled", "queued"]) {
      const nonCompletedAdapter = new OpenAIPricingAnalyzer({
        apiKey: "secret-non-completed-key",
        model: "model-test",
        schemaCompatibleModels: ["model-test"],
        fetchImpl: async () => new Response(JSON.stringify({
          object: "response",
          status: providerStatus,
          output: validMessageOutput,
        }), { status: 200 }),
      });
      let nonCompletedError: unknown;
      try {
        await nonCompletedAdapter.analyze({
          title: validInput.title.trim(), description: validInput.description.trim(), category: "WEB_DEVELOPMENT",
        });
      } catch (error) {
        nonCompletedError = error;
      }
      assert(
        nonCompletedError instanceof Error &&
          (nonCompletedError as Error & { kind?: string }).kind === "INVALID_RESPONSE",
        `${providerStatus} Responses envelope를 승인함`,
      );
    }

    const refusalAdapter = new OpenAIPricingAnalyzer({
      apiKey: "secret-refusal-key",
      model: "model-test",
      schemaCompatibleModels: ["model-test"],
      fetchImpl: async () => new Response(JSON.stringify({
        object: "response",
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [{
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "refusal", refusal: "provider refusal text" }],
        }],
      }), { status: 200 }),
    });
    let refusalError: unknown;
    try {
      await refusalAdapter.analyze({
        title: validInput.title.trim(), description: validInput.description.trim(), category: "WEB_DEVELOPMENT",
      });
    } catch (error) {
      refusalError = error;
    }
    assert(
      refusalError instanceof Error &&
        (refusalError as Error & { kind?: string }).kind === "INVALID_RESPONSE",
      "Responses refusal content를 승인함",
    );

    let rejectedBodyCancelled = false;
    const rejectedResponseAdapter = new OpenAIPricingAnalyzer({
      apiKey: "secret-rejected-response-key",
      model: "model-test",
      schemaCompatibleModels: ["model-test"],
      fetchImpl: async () => new Response(new ReadableStream({
        cancel() { rejectedBodyCancelled = true; },
      }), { status: 429 }),
    });
    let rejectedResponseError: unknown;
    try {
      await rejectedResponseAdapter.analyze({
        title: validInput.title.trim(), description: validInput.description.trim(), category: "WEB_DEVELOPMENT",
      });
    } catch (error) {
      rejectedResponseError = error;
    }
    assert(
      rejectedResponseError instanceof Error &&
        (rejectedResponseError as Error & { kind?: string }).kind === "UNAVAILABLE",
      "non-2xx 공급자 응답 분류 실패",
    );
    assert(rejectedBodyCancelled, "non-2xx 공급자 응답 body를 취소하지 않음");

    const unlistedModelAdapter = new OpenAIPricingAnalyzer({
      apiKey: "secret-unlisted-key",
      model: "model-test",
      schemaCompatibleModels: ["different-base-model"],
    });
    const fineTunedModelAdapter = new OpenAIPricingAnalyzer({
      apiKey: "secret-ft-key",
      model: "ft:model-test",
      schemaCompatibleModels: ["ft:model-test"],
    });
    assert(!unlistedModelAdapter.configured, "스키마 호환 allowlist 밖 모델이 활성화됨");
    assert(!fineTunedModelAdapter.configured, "fine-tuned 모델이 활성화됨");

    const timeoutAdapter = new OpenAIPricingAnalyzer({
      apiKey: "secret-timeout-key",
      model: "model-test",
      schemaCompatibleModels: ["model-test"],
      timeoutMs: 2,
      fetchImpl: (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("provider raw secret")));
      }),
    });
    let timeoutError: unknown;
    try {
      await timeoutAdapter.analyze({
        title: validInput.title.trim(), description: validInput.description.trim(), category: "WEB_DEVELOPMENT",
      });
    } catch (error) {
      timeoutError = error;
    }
    assert(timeoutError instanceof Error, "timeout 경계 오류가 아님");
    assert((timeoutError as Error & { kind?: string }).kind === "TIMEOUT", "timeout 분류 실패");
    assert(!timeoutError.message.includes("secret"), "공급자 원문이나 키 노출");
  });

  await test("S2-R17 브라우저 API는 route·헤더·body와 구조화 오류를 처리한다", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const approvedApiBody = {
      pricingAnalysisId: "pra_http",
      reviewStatus: "APPROVED" as const,
      inputSnapshot: {
        title: validInput.title.trim(), description: validInput.description.trim(), category: "WEB_DEVELOPMENT" as const,
      },
      result: createDeterministicRecommendation(),
      failure: null,
      createdAt: "2026-09-04T09:00:00.000Z",
      reviewedAt: "2026-09-04T09:00:01.000Z",
      appliedAt: null,
    };
    assert(isPricingAnalysisResponse(approvedApiBody), "정상 분석 DTO를 거부함");
    assert(!isPricingAnalysisResponse({ ...approvedApiBody, providerTrace: "secret" }), "분석 DTO 추가 필드 허용");
    assert(!isPricingAnalysisResponse({
      ...approvedApiBody,
      inputSnapshot: { ...approvedApiBody.inputSnapshot, title: "     " },
    }), "공백뿐인 저장 title을 브라우저가 허용함");
    assert(!isPricingAnalysisResponse({
      ...approvedApiBody,
      inputSnapshot: { ...approvedApiBody.inputSnapshot, description: ` ${approvedApiBody.inputSnapshot.description} ` },
    }), "정규화되지 않은 저장 description을 브라우저가 허용함");
    assert(!isPricingAnalysisResponse({
      ...approvedApiBody,
      reviewStatus: "PENDING",
      result: null,
      reviewedAt: null,
      appliedAt: "2026-09-04T09:00:02.000Z",
    }), "PENDING의 appliedAt 불변식 위반 허용");
    const client = createPricingAnalysisApiClient(async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(approvedApiBody), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }, () => "test-access-token");
    await client.create(validInput, "create-key-0130");
    assert(calls[0]?.url === "/api/v1/pricing-analyses", "생성 route 불일치");
    assert((calls[0]?.init?.headers as Record<string, string>)["Idempotency-Key"] === "create-key-0130", "생성 키 누락");
    assert((calls[0]?.init?.headers as Record<string, string>).Authorization === "Bearer test-access-token", "Bearer 인증 누락");

    const applyApiBody = {
      pricingAnalysisId: "pra_http", projectId: "prj_http", budgetAmount: 1_500_000,
      currency: "KRW" as const, appliedAt: "2026-09-04T09:00:02.000Z",
      processedAt: "2026-09-04T09:00:02.000Z", changed: true as const, projectVersion: 3,
    };
    assert(isApplyPricingAnalysisResponse(applyApiBody), "정상 apply DTO를 거부함");
    assert(!isApplyPricingAnalysisResponse({ ...applyApiBody, extra: true }), "apply DTO 추가 필드 허용");
    const applyClient = createPricingAnalysisApiClient(async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(applyApiBody), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }, () => "test-access-token");
    await applyClient.apply("pra_http", "prj_http", 900_000, 3);
    const applyCall = calls[1];
    assert((applyCall?.init?.headers as Record<string, string>)["Idempotency-Key"] === "pricing-apply-pra_http", "apply 키 누락");
    assert(!String(applyCall?.init?.body).includes('"budgetAmount"'), "브라우저가 추천 금액을 전송함");
    assert(String(applyCall?.init?.body).includes('"expectedBudgetAmount":900000'), "현재 예산 CAS 값 누락");

    const expectUnknownClientError = async (
      operation: () => Promise<unknown>,
      message: string,
    ): Promise<void> => {
      let error: unknown;
      try { await operation(); } catch (caught) { error = caught; }
      assert(error instanceof PricingAnalysisClientError, `${message}: client error가 아님`);
      assert(error.code === "UNKNOWN_ERROR", `${message}: fail-closed 코드 불일치`);
    };
    const wrongCreateStatus = createPricingAnalysisApiClient(
      async () => new Response(JSON.stringify(approvedApiBody), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
      () => "test-access-token",
    );
    await expectUnknownClientError(
      () => wrongCreateStatus.create(validInput, "create-key-0132"),
      "APPROVED 202 응답",
    );
    const malformedApply = createPricingAnalysisApiClient(
      async () => new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      () => "test-access-token",
    );
    await expectUnknownClientError(
      () => malformedApply.apply("pra_http", "prj_http", 900_000, 3),
      "빈 apply 성공 응답",
    );
    const wrongGetIdentity = createPricingAnalysisApiClient(
      async () => new Response(JSON.stringify({ ...approvedApiBody, pricingAnalysisId: "pra_other" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      () => "test-access-token",
    );
    await expectUnknownClientError(
      () => wrongGetIdentity.get("pra_http"),
      "GET 분석 ID 불일치",
    );
    const wrongApplyIdentity = createPricingAnalysisApiClient(
      async () => new Response(JSON.stringify({ ...applyApiBody, projectId: "prj_other" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
      () => "test-access-token",
    );
    await expectUnknownClientError(
      () => wrongApplyIdentity.apply("pra_http", "prj_http", 900_000, 3),
      "apply 프로젝트 ID 불일치",
    );

    const errorClient = createPricingAnalysisApiClient(async () => new Response(JSON.stringify({
      error: { code: "IDEMPOTENCY_KEY_REUSED", message: "키 충돌", details: null },
    }), { status: 409, headers: { "Content-Type": "application/json" } }), () => "test-access-token");
    let clientError: unknown;
    try { await errorClient.create(validInput, "create-key-0131"); } catch (error) { clientError = error; }
    assert(clientError instanceof PricingAnalysisClientError, "구조화 client error가 아님");
    assert(clientError.code === "IDEMPOTENCY_KEY_REUSED", "client error code 파싱 실패");

    const unsafeErrorClient = createPricingAnalysisApiClient(async () => new Response(JSON.stringify({
      error: { code: "IDEMPOTENCY_KEY_REUSED", message: "키 충돌", details: null, providerTrace: "secret" },
    }), { status: 409, headers: { "Content-Type": "application/json" } }), () => "test-access-token");
    let unsafeClientError: unknown;
    try { await unsafeErrorClient.create(validInput, "create-key-0133"); } catch (error) { unsafeClientError = error; }
    assert(unsafeClientError instanceof PricingAnalysisClientError, "unsafe error가 client error가 아님");
    assert(unsafeClientError.code === "UNKNOWN_ERROR", "추가 필드 오류를 신뢰함");
    assert(!unsafeClientError.message.includes("secret"), "unsafe error 세부정보 노출");

    let unauthenticatedFetchCalled = false;
    const unauthenticatedClient = createPricingAnalysisApiClient(async () => {
      unauthenticatedFetchCalled = true;
      return new Response(null, { status: 204 });
    }, () => null);
    let authError: unknown;
    try { await unauthenticatedClient.get("pra_http"); } catch (error) { authError = error; }
    assert(authError instanceof PricingAnalysisClientError, "토큰 누락 client error가 아님");
    assert(authError.code === "AUTH_REQUIRED" && authError.httpStatus === 401, "토큰 누락 분류 실패");
    assert(!unauthenticatedFetchCalled, "토큰 없이 보호 API를 호출함");
  });

  await test("S2-R18 PENDING 폴링은 같은 분석 GET·backoff·상한·deadline·취소를 지킨다", async () => {
    assert(
      [0, 1, 2, 3, 4].map(pendingPollDelay).join(",") === "400,800,1600,1600,1600",
      "400ms 시작 지수 backoff 또는 상한 불일치",
    );
    assert(PENDING_POLL_POLICY.maxAttempts === 5, "최대 폴링 횟수 불일치");
    assert(PENDING_POLL_POLICY.deadlineMs === 5_000, "전체 폴링 deadline 불일치");
    assert(canContinuePendingPolling(0, 0), "첫 폴링이 허용되지 않음");
    assert(!canContinuePendingPolling(3, 4_000), "deadline을 넘는 폴링이 허용됨");
    assert(!canContinuePendingPolling(5, 0), "최대 횟수를 넘는 폴링이 허용됨");

    const pending = {
      pricingAnalysisId: "pra_poll",
      reviewStatus: "PENDING" as const,
      inputSnapshot: {
        title: validInput.title.trim(),
        description: validInput.description.trim(),
        category: "WEB_DEVELOPMENT" as const,
      },
      result: null,
      failure: null,
      createdAt: "2026-09-04T09:00:00.000Z",
      reviewedAt: null,
      appliedAt: null,
    };
    const approved = {
      ...pending,
      reviewStatus: "APPROVED" as const,
      result: createDeterministicRecommendation(),
      reviewedAt: "2026-09-04T09:00:01.000Z",
    };
    const rejectedAnalysis = {
      ...pending,
      reviewStatus: "REJECTED" as const,
      failure: {
        code: "PRICING_ANALYSIS_TIMEOUT" as const,
        message: "새 요청으로 다시 시도해 주세요.",
        retryable: true,
      },
      reviewedAt: "2026-09-04T09:00:01.000Z",
    };
    const ambiguousError = new PricingAnalysisClientError(
      "UNKNOWN_ERROR",
      "응답을 확인하지 못했습니다.",
      500,
    );
    const rejectedError = new PricingAnalysisClientError(
      "PRICING_ANALYSIS_TIMEOUT",
      rejectedAnalysis.failure.message,
      504,
      { analysis: rejectedAnalysis },
    );
    assert(!shouldRotatePricingAnalysisCreateKey(ambiguousError), "모호한 실패에서 create 키를 회전함");
    assert(shouldRotatePricingAnalysisCreateKey(rejectedAnalysis), "manual GET REJECTED 뒤 새 키 정책 누락");
    assert(shouldRotatePricingAnalysisCreateKey(rejectedError), "REJECTED 오류 snapshot 뒤 새 키 정책 누락");
    assert(
      shouldRotatePricingAnalysisCreateKey(new PricingAnalysisClientError(
        "IDEMPOTENCY_KEY_REUSED", "키 충돌", 409,
      )),
      "키 충돌 뒤 새 키 정책 누락",
    );
    assert(
      selectPricingAnalysisRetryKey("stable-create-key", false, () => "new-create-key") === "stable-create-key",
      "모호한 실패 retry가 기존 키를 보존하지 않음",
    );
    assert(
      selectPricingAnalysisRetryKey("stable-create-key", true, () => "new-create-key") === "new-create-key",
      "확정된 REJECTED retry가 새 키를 만들지 않음",
    );
    let createCalls = 0;
    let getCalls = 0;
    const fetchedIds: string[] = [];
    const pollingClient: ReturnType<typeof createPricingAnalysisApiClient> = {
      async create() { createCalls += 1; return pending; },
      async get(analysisId: string) {
        getCalls += 1;
        fetchedIds.push(analysisId);
        return getCalls === 1 ? pending : approved;
      },
      async apply() { throw new Error("apply must not be called"); },
    };
    let fakeNow = 0;
    const waits: number[] = [];
    const runtime: Parameters<typeof pollPendingAnalysis>[4] = {
      now: () => fakeNow,
      async wait(_signal: AbortSignal, delayMs: number) {
        waits.push(delayMs);
        fakeNow += delayMs;
      },
      async getWithinDeadline(
        pollClient,
        analysisId: string,
        signal: AbortSignal,
        _remainingMs: number,
      ) {
        return pollClient.get(analysisId, signal);
      },
    };
    const polled = await pollPendingAnalysis(
      pollingClient,
      pending,
      new AbortController().signal,
      () => undefined,
      runtime,
    );
    assert(polled.reviewStatus === "APPROVED", "PENDING에서 terminal 결과로 전환하지 않음");
    assert(getCalls === 2 && fetchedIds.every((id) => id === "pra_poll"), "같은 분석 ID로 GET하지 않음");
    assert(createCalls === 0, "PENDING 폴링이 새 분석 POST를 호출함");
    assert(waits.join(",") === "400,800", "실제 폴링 backoff 순서 불일치");

    fakeNow = 0;
    getCalls = 0;
    waits.length = 0;
    const alwaysPendingClient: ReturnType<typeof createPricingAnalysisApiClient> = {
      ...pollingClient,
      async get(analysisId: string) {
        getCalls += 1;
        assert(analysisId === "pra_poll", "deadline 폴링이 다른 분석 ID를 조회함");
        return pending;
      },
    };
    const exhausted = await pollPendingAnalysis(
      alwaysPendingClient,
      pending,
      new AbortController().signal,
      () => undefined,
      runtime,
    );
    assert(exhausted.reviewStatus === "PENDING", "deadline 뒤 PENDING을 terminal로 추정함");
    assert(getCalls === 4 && waits.join(",") === "400,800,1600,1600", "deadline 전 제한 GET 횟수 불일치");

    let inFlightAborted = false;
    const hangingClient: ReturnType<typeof createPricingAnalysisApiClient> = {
      ...pollingClient,
      async get(_analysisId: string, signal?: AbortSignal) {
        return new Promise<typeof pending>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            inFlightAborted = true;
            reject(new Error("aborted"));
          }, { once: true });
        });
      },
    };
    let deadlineError: unknown;
    try {
      await getWithinPendingDeadline(
        hangingClient,
        "pra_poll",
        new AbortController().signal,
        5,
      );
    } catch (error) {
      deadlineError = error;
    }
    assert(deadlineError instanceof PendingPollDeadlineError, "in-flight GET deadline 분류 실패");
    assert(inFlightAborted, "deadline에서 in-flight GET을 abort하지 않음");
  });

  await test("S2-R19 등록·기존 프로젝트·오류 상태 SSR에 필수 문구와 접근성 상태가 있다", () => {
    const registrationContext = {
      kind: "registration" as const,
      onUseRecommendation: () => undefined,
      onUseDirectInput: () => undefined,
      onBack: () => undefined,
    };
    const registration = renderToStaticMarkup(createElement(PricingAnalysisPage, { context: registrationContext }));
    for (const text of [
      "AI 단가 분석",
      "프로젝트 정보를 확인하고 추천 예산을 요청하세요.",
      "분석에 사용할 프로젝트 정보",
      "추천 금액은 확정된 예산이 아닙니다.",
      "결과에서 산정 내역을 확인하고 직접 선택합니다.",
      "예산 직접 입력하기",
      "분석 요청하기",
      "프로젝트 등록으로 돌아가기",
      "aria-live=\"polite\"",
    ]) assert(registration.includes(text), `등록 SSR 필수 요소 누락: ${text}`);

    const invalidForm = renderToStaticMarkup(createElement(PricingAnalysisForm, {
      draft: { title: "", description: "", category: "" as const },
      errors: {
        title: "제목을 확인해 주세요.",
        category: "카테고리를 확인해 주세요.",
        description: "설명을 확인해 주세요.",
      },
      onChange: () => undefined,
      onSubmit: () => undefined,
    }));
    for (const text of [
      'id="pricing-error-summary"',
      'role="alert"',
      'tabindex="-1"',
      'href="#pricing-title"',
      'href="#pricing-category"',
      'href="#pricing-description"',
      "입력한 내용을 확인해 주세요",
    ]) assert(invalidForm.includes(text), `오류 요약 SSR 필수 요소 누락: ${text}`);

    const readyRegistration = renderToStaticMarkup(createElement(PricingAnalysisPage, { context: registrationContext, previewState: "ready" }));
    for (const text of [
      "분석 완료",
      "추천 예산",
      "이 금액은 추천안입니다. 산정 내역을 확인한 뒤 적용 여부를 선택하세요.",
      "입력 출처",
      "분석 완료 시각",
      "통화",
      "산정 내역",
      "항목 합계",
      "분석에 사용한 입력",
      "항목명",
      "설명",
      "산정 이유",
      "추천 금액",
      "이 추천 예산 사용하기",
      "직접 예산 입력하기",
      "아직 프로젝트 예산에 반영되지 않았습니다.",
      "분석 기준과 한계",
    ]) {
      assert(readyRegistration.includes(text), `결과 SSR 필수 요소 누락: ${text}`);
    }

    const existing = renderToStaticMarkup(createElement(PricingAnalysisPage, {
      previewState: "ready",
      context: {
        kind: "existing-project", projectId: "prj_existing", projectVersion: 3,
        currentBudgetAmount: 900_000, onApplied: () => undefined, onBack: () => undefined,
      },
    }));
    for (const text of [
      "현재 예산",
      "권장 예산",
      "변경 금액",
      "반영을 선택하기 전까지 현재 예산은 유지됩니다.",
      "프로젝트 예산에 반영",
      "반영하지 않기",
    ]) {
      assert(existing.includes(text), `기존 프로젝트 SSR 필수 요소 누락: ${text}`);
    }

    const states = [
      ["loading", "분석 결과를 불러오는 중입니다"],
      ["submitting", "분석 요청을 처리하고 있습니다"],
      ["rejected", "분석 결과를 안전하게 제공하지 못했습니다"],
      ["conflict", "분석 요청을 다시 확인해야 합니다"],
      ["error", "분석 요청을 완료하지 못했습니다"],
    ] as const;
    for (const [previewState, text] of states) {
      const html = renderToStaticMarkup(createElement(PricingAnalysisPage, { context: registrationContext, previewState }));
      assert(html.includes(text), `${previewState} SSR 문구 누락`);
    }
    const applied = renderToStaticMarkup(createElement(PricingAnalysisPage, {
      previewState: "applied",
      context: {
        kind: "existing-project", projectId: "prj_existing", currentBudgetAmount: 900_000,
        onApplied: () => undefined, onBack: () => undefined,
      },
    }));
    for (const text of [
      "프로젝트 예산에 반영했습니다",
      "변경 전",
      "이 화면에서 확인할 수 없음",
      "변경 후",
      "반영 시각",
      "프로젝트 최신 상태 보기",
      "분석 결과 다시 보기",
    ]) assert(applied.includes(text), `적용 완료 SSR 필수 요소 누락: ${text}`);
    assert(!applied.includes("반영하지 않기"), "적용 완료 뒤 반영 거부 행동이 남음");
    assert(!applied.includes("반영을 선택하기 전까지"), "적용 완료 뒤 적용 전 문구가 남음");
    assert(!applied.includes("분석 요청하기"), "적용 완료 뒤 새 분석 form action이 남음");
    assert(!applied.includes("조건 바꿔 다시 분석"), "적용 완료 뒤 새 분석 report action이 남음");
    assert(!applied.includes("적용 여부를 선택하세요"), "적용 완료 뒤 적용 전 안내가 남음");

    const applying = renderToStaticMarkup(createElement(PricingAnalysisPage, {
      previewState: "applying",
      context: {
        kind: "existing-project", projectId: "prj_existing", currentBudgetAmount: 900_000,
        onApplied: () => undefined, onBack: () => undefined,
      },
    }));
    assert(applying.includes('id="pricing-applying-title"'), "applying 제목 포커스 대상 누락");
    assert(applying.includes('aria-busy="true"'), "applying busy 상태 누락");

    const existingConflict = renderToStaticMarkup(createElement(PricingAnalysisPage, {
      previewState: "conflict",
      context: {
        kind: "existing-project", projectId: "prj_existing", currentBudgetAmount: 900_000,
        onApplied: () => undefined, onBack: () => undefined,
      },
    }));
    assert(existingConflict.includes("프로젝트의 최신 상태를 확인해야 합니다"), "apply 충돌 문구 누락");
    assert(existingConflict.includes("프로젝트 최신 상태 보기"), "apply 충돌 복구 행동 누락");
    const applyFailed = renderToStaticMarkup(createElement(PricingAnalysisPage, {
      previewState: "error",
      context: {
        kind: "existing-project", projectId: "prj_existing", currentBudgetAmount: 900_000,
        onApplied: () => undefined, onBack: () => undefined,
      },
    }));
    assert(applyFailed.includes("추천 예산"), "apply 오류에서 보고서가 사라짐");
    assert(applyFailed.includes("프로젝트 최신 상태 보기"), "apply 오류 최신 상태 복구 행동 누락");
    assert(applyFailed.includes("반영 다시 시도"), "apply 오류 재시도 행동 누락");

    const focusTargets = {
      idle: null,
      loading: "pricing-loading-title",
      submitting: "pricing-submitting-title",
      ready: "pricing-report-title",
      rejected: "pricing-status-title",
      conflict: "pricing-status-title",
      error: "pricing-status-title",
      applying: "pricing-applying-title",
      applied: "pricing-applied-title",
    } as const;
    for (const [focusStatus, target] of Object.entries(focusTargets)) {
      assert(
        pricingFocusTargetForStatus(focusStatus as keyof typeof focusTargets) === target,
        `${focusStatus} 상태 포커스 대상 불일치`,
      );
    }
  });

  await test("S2-R20 run preflight와 OpenAI 서버 격리가 정적으로 유지된다", () => {
    const prototypeRoot = path.join(repositoryRoot, "features/ai-pricing/prototype");
    const runSource = readFileSync(path.join(prototypeRoot, "run.tsx"), "utf8");
    assert(!/^import .*react/m.test(runSource), "preflight 전 React 정적 import가 있음");
    assert(!runSource.includes("return (\n    <"), "run.tsx에 JSX가 있음");
    assert(runSource.indexOf("ensurePackagesInstalled();") < runSource.indexOf('import("react")'), "preflight보다 React import가 빠름");
    const serviceSource = readFileSync(path.join(prototypeRoot, "server/pricing-analysis.service.ts"), "utf8");
    const webSources = [
      "web/api/pricing-analysis.ts", "web/usePricingAnalysis.ts", "web/PricingAnalysisPage.tsx",
      "web/PricingAnalysisForm.tsx", "web/PricingAnalysisReport.tsx",
    ].map((file) => readFileSync(path.join(prototypeRoot, file), "utf8")).join("\n");
    const previewCss = readFileSync(path.join(prototypeRoot, "web/preview.css"), "utf8");
    assert(!serviceSource.includes("openai.adapter"), "service가 OpenAI adapter를 직접 import함");
    assert(!webSources.includes("openai.adapter"), "브라우저 코드가 OpenAI adapter를 import함");
    assert(!/apiKey|OPENAI_API_KEY|LLM_API_KEY/.test(webSources), "브라우저 코드에 공급자 키 참조가 있음");
    assert(webSources.includes("PENDING_POLL_POLICY") && webSources.includes("client.get"), "PENDING 제한 폴링이 없음");
    assert(webSources.includes("pendingPollDelay") && webSources.includes("deadlineMs"), "PENDING backoff/deadline이 없음");
    assert(webSources.includes("getWithinPendingDeadline") && webSources.includes("AbortController"), "GET 자체 deadline 취소가 없음");
    assert(webSources.includes("이 분석 상태 다시 확인"), "PENDING 수동 복구 경로가 없음");
    assert(webSources.includes("lastCreateKey") && webSources.includes("retryNeedsNewCreateKey"), "모호한 생성 실패 exact replay 키 보존이 없음");
    assert(webSources.includes("requestAnimationFrame") && webSources.includes("#pricing-error-summary"), "상단 오류 요약 포커스 이동이 없음");
    assert(webSources.includes('tabIndex={-1}'), "상태 전환 제목의 프로그래밍 포커스 대상이 없음");
    assert(
      new Set([
        PRICING_ANALYSIS_INPUT_SCHEMA_VERSION,
        PRICING_APPLICATION_INPUT_SCHEMA_VERSION,
        PRICING_ANALYSIS_SCHEMA_VERSION,
      ]).size === 3,
      "생성 입력·적용 입력·결과 스키마 버전이 분리되지 않음",
    );
    assert(serviceSource.includes("PRICING_ANALYSIS_INPUT_SCHEMA_VERSION"), "생성 fingerprint 입력 스키마 버전 누락");
    assert(serviceSource.includes("PRICING_APPLICATION_INPUT_SCHEMA_VERSION"), "적용 fingerprint 입력 스키마 버전 누락");
    assert(previewCss.includes('@import "../../design/_tokens.css"'), "정본 디자인 토큰 import 누락");
    assert(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(previewCss), "기능 CSS에 raw color가 남아 있음");
    assert(existsSync(path.join(prototypeRoot, "web/index.tsx")), "web default entry 누락");
  });

  await test("S2-R21 사용자별 한도는 신규 키만 소비하고 동시 exact replay는 한 번만 계산한다", async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const entered = new Promise<void>((resolve) => { started = resolve; });
    let calls = 0;
    const analyzer = {
      model: "rate-limit-gate",
      configured: true,
      async analyze() {
        calls += 1;
        started?.();
        await gate;
        return createDeterministicRecommendation();
      },
    };
    const api = createPricingAnalysisApiMock({ analyzer, maxNewAnalysesPerUser: 1 });
    const first = api.create(actor, validInput, "create-key-rate-01");
    await entered;
    const pendingReplay = await api.create(actor, validInput, "create-key-rate-01");
    assert(pendingReplay.httpStatus === 202, "동시 exact replay가 rate limit 대신 202여야 함");
    assert(api.rateLimit.consumedBy("usr_client") === 1, "동시 exact replay가 quota를 중복 소비함");
    release?.();
    await first;
    const terminalReplay = await api.create(actor, validInput, "create-key-rate-01");
    assert(terminalReplay.httpStatus === 200, "terminal replay가 한도 소진 뒤 재생되지 않음");
    const rateLimitKeyConflict = await api.rateLimit.consumeNewAnalysis({
      requesterId: "usr_client",
      idempotencyKey: "create-key-rate-01",
      requestFingerprint: "different-fingerprint-after-storage-failure",
    });
    assert(
      rateLimitKeyConflict === "IDEMPOTENCY_KEY_REUSED",
      "rate-limit 멱등 예약이 같은 키의 다른 fingerprint를 허용함",
    );
    assert(api.rateLimit.consumedBy("usr_client") === 1, "rate-limit 키 충돌이 quota를 바꿈");
    await expectApiError(
      () => api.create(actor, validInput, "create-key-rate-02"),
      "PRICING_ANALYSIS_RATE_LIMITED",
      429,
    );
    assert(calls === 1, "rate-limited 요청이 analyzer를 호출함");
    assert(api.repository.getAllRecords().length === 1, "rate-limited 요청이 행을 생성함");

    const failClosed = createPricingAnalysisApiMock();
    await expectApiError(
      () => createPricingAnalysis(
        {
          repository: failClosed.repository,
          analyzer: failClosed.analyzer,
          now: () => "2026-09-04T09:00:00.000Z",
          nextAnalysisId: () => "pra_rate_missing",
        },
        actor,
        validInput,
        "create-key-rate-03",
      ),
      "PRICING_ANALYSIS_RATE_LIMIT_UNAVAILABLE",
      503,
    );
    assert(failClosed.repository.getAllRecords().length === 0, "rate-limit capability 없이 행을 생성함");

    const malformedDecision = createPricingAnalysisApiMock();
    await expectApiError(
      () => createPricingAnalysis(
        {
          repository: malformedDecision.repository,
          analyzer: malformedDecision.analyzer,
          rateLimit: {
            async consumeNewAnalysis() {
              return undefined as never;
            },
          },
          now: () => "2026-09-04T09:00:00.000Z",
          nextAnalysisId: () => "pra_rate_malformed",
        },
        actor,
        validInput,
        "create-key-rate-04",
      ),
      "PRICING_ANALYSIS_RATE_LIMIT_UNAVAILABLE",
      503,
    );
    assert(
      malformedDecision.repository.getAllRecords().length === 0,
      "잘못된 rate-limit decision으로 행을 생성함",
    );
    assert(
      (malformedDecision.analyzer as InstanceType<typeof DeterministicPricingAnalyzer>).getCalls().length === 0,
      "잘못된 rate-limit decision으로 analyzer를 호출함",
    );

    const tupleScopeRateLimit = createPricingAnalysisApiMock().rateLimit;
    const firstTupleDecision = await tupleScopeRateLimit.consumeNewAnalysis({
      requesterId: "usr",
      idempotencyKey: "part:12345678",
      requestFingerprint: "fingerprint-a",
    });
    const secondTupleDecision = await tupleScopeRateLimit.consumeNewAnalysis({
      requesterId: "usr:part",
      idempotencyKey: "12345678",
      requestFingerprint: "fingerprint-b",
    });
    assert(
      firstTupleDecision === "ALLOWED" && secondTupleDecision === "ALLOWED",
      "requester와 key tuple을 구분자 문자열로 합쳐 다른 사용자 scope가 충돌함",
    );
    assert(
      tupleScopeRateLimit.consumedBy("usr") === 1 && tupleScopeRateLimit.consumedBy("usr:part") === 1,
      "tuple scope별 quota가 분리되지 않음",
    );
  });

  console.log(`=== 결과: PASS ${passed}, FAIL ${failed}, TOTAL ${passed + failed} ===`);
  if (failed > 0) process.exitCode = 1;
}

void main();
