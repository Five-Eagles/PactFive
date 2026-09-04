import { createPricingAnalysisController } from "../server/pricing-analysis.controller";
import {
  applyPricingAnalysis,
  createPricingAnalysis,
  getPricingAnalysis,
  type PricingAnalysisServiceDeps,
} from "../server/pricing-analysis.service";
import type {
  ApplyPricingAnalysisInput,
  CreatePricingAnalysisInput,
  PricingAnalysisActor,
  PricingAnalysisRow,
} from "../server/pricing-analysis.types";
import {
  DeterministicPricingAnalyzer,
} from "./deterministic-pricing-analyzer.adapter";
import type { PricingAnalyzerPort } from "../server/pricing-analyzer.port";
import { InMemoryPricingAnalysisRepository } from "./in-memory-pricing-analysis.repository";
import { InMemoryPricingAnalysisRateLimit } from "./in-memory-pricing-analysis-rate-limit.mock";
import {
  InMemoryProjectBudgetApplicationPort,
  type MockProjectBudgetRecord,
} from "./project-budget-application.mock";

export type PricingAnalysisApiMockOptions = {
  now?: string;
  seed?: PricingAnalysisRow[];
  projects?: MockProjectBudgetRecord[];
  analyzer?: PricingAnalyzerPort;
  withProjectBudgetApplication?: boolean;
  maxNewAnalysesPerUser?: number;
};

/** 서비스·controller를 실제로 거치는 fresh mock 조립점이다. */
export function createPricingAnalysisApiMock(options: PricingAnalysisApiMockOptions = {}) {
  const repository = new InMemoryPricingAnalysisRepository(options.seed);
  const analyzer = options.analyzer ?? new DeterministicPricingAnalyzer();
  const rateLimit = new InMemoryPricingAnalysisRateLimit(options.maxNewAnalysesPerUser);
  let currentNow = options.now ?? "2026-09-04T09:00:00.000Z";
  let sequence = 0;
  const projectBudgetApplication = new InMemoryProjectBudgetApplicationPort(
    options.projects ?? [
      {
        projectId: "prj_existing",
        clientId: "usr_client",
        budgetAmount: 900_000,
        projectVersion: 3,
        recruitmentOpen: true,
        hasPendingApplications: false,
      },
    ],
    repository,
  );
  const deps: PricingAnalysisServiceDeps = {
    repository,
    analyzer,
    rateLimit,
    now: () => currentNow,
    nextAnalysisId: () => {
      sequence += 1;
      return `pra_mock_${sequence}`;
    },
    ...(options.withProjectBudgetApplication === false ? {} : { projectBudgetApplication }),
  };
  const controller = createPricingAnalysisController(deps);

  return {
    repository,
    analyzer,
    rateLimit,
    projectBudgetApplication,
    controller,
    setNow(nextNow: string): void {
      currentNow = nextNow;
    },
    async create(
      actor: PricingAnalysisActor | undefined,
      input: CreatePricingAnalysisInput,
      idempotencyKey?: string,
    ) {
      return createPricingAnalysis(deps, actor, input, idempotencyKey);
    },
    async get(actor: PricingAnalysisActor | undefined, analysisId: string) {
      return getPricingAnalysis(deps, actor, analysisId);
    },
    async apply(
      actor: PricingAnalysisActor | undefined,
      analysisId: string,
      input: ApplyPricingAnalysisInput,
      idempotencyKey?: string,
    ) {
      return applyPricingAnalysis(deps, actor, analysisId, input, idempotencyKey);
    },
  };
}
