/**
 * 다른 도메인 포트의 Mock 어댑터
 *
 * 실제 구현이 올라오면 이 파일만 실제 어댑터로 갈아끼운다.
 * 서비스 코드는 `external.port.ts` 의 인터페이스만 보므로 손댈 곳이 없다.
 *
 * 각 Mock 은 호출 기록을 남긴다. "마감할 때 지원 거절을 실제로 불렀는가" 같은 것을
 * 결과값이 아니라 호출 여부로 확인해야 하는 규칙이 있다 (규칙 23·29).
 */

import type {
  ApplicationsPort,
  ClaimPricingAnalysisInput,
  ClaimPricingAnalysisResult,
  ContractsPort,
  ExternalPorts,
  InvalidateAgreementInput,
  InvalidateAgreementResult,
  PricingAnalysisClaimPort,
  PricingRecommendationQuery,
  ProfileCompletion,
  ProfilePort,
  RejectPendingApplicationsInput,
  RejectPendingApplicationsResult,
  TransactionContext,
} from "../server/ports/external.port";

/* ─────────────── 호출 기록 ─────────────── */

export type CallLog<T> = { projectId: string; input: T }[];

export type ExternalMocks = ExternalPorts & {
  calls: {
    rejectPendingApplications: CallLog<RejectPendingApplicationsInput>;
    invalidateAgreementAndContract: CallLog<InvalidateAgreementInput>;
    claimPricingAnalysis: ClaimPricingAnalysisInput[];
    getPricingAnalysisRecommendation: PricingRecommendationQuery[];
    getProfileCompletion: string[];
  };
  /** 다음 호출을 실패시킨다. 규칙 23("실패해도 되돌리지 않는다") 검증용 */
  failNext: {
    rejectPendingApplications: boolean;
    invalidateAgreementAndContract: boolean;
  };
};

/* ─────────────── 고정 데이터 ─────────────── */

/** 오민혁 확정 — 분석 id 별 추천 금액 */
const PRICING_ANALYSES: Record<string, { ownerId: string; amount: number }> = {
  ana_valid: { ownerId: "usr_client_a", amount: 4_800_000 },
  ana_other_owner: { ownerId: "usr_client_b", amount: 4_800_000 },
};

/** 프로필 완성 여부. 규칙 7 검증용 */
const PROFILES: Record<string, ProfileCompletion> = {
  usr_client_a: { status: "COMPLETE", completedAt: "2026-07-01T00:00:00Z", missingFields: [] },
  usr_client_b: { status: "COMPLETE", completedAt: "2026-07-02T00:00:00Z", missingFields: [] },
  usr_incomplete: { status: "INCOMPLETE", completedAt: null, missingFields: ["companyName", "phone"] },
};

/** 프로젝트별 대기 지원 수. 거절 건수 응답에 쓴다 */
const PENDING_BY_PROJECT: Record<string, number> = {
  prj_open_locked: 3,
  prj_pending_apps: 2,
};

export function createExternalMocks(): ExternalMocks {
  const calls: ExternalMocks["calls"] = {
    rejectPendingApplications: [],
    invalidateAgreementAndContract: [],
    claimPricingAnalysis: [],
    getPricingAnalysisRecommendation: [],
    getProfileCompletion: [],
  };

  const failNext: ExternalMocks["failNext"] = {
    rejectPendingApplications: false,
    invalidateAgreementAndContract: false,
  };

  /** 같은 사건 id 로 두 번 오면 두 번째는 alreadyProcessed */
  const seenClosureEvents = new Set<string>();
  const seenCancellations = new Set<string>();

  const applications: ApplicationsPort = {
    async rejectPendingApplications(projectId, input): Promise<RejectPendingApplicationsResult> {
      calls.rejectPendingApplications.push({ projectId, input });

      if (failNext.rejectPendingApplications) {
        failNext.rejectPendingApplications = false;
        return { rejectedCount: 0, alreadyProcessed: false, result: "FAILED" };
      }

      if (seenClosureEvents.has(input.closureEventId)) {
        return { rejectedCount: 0, alreadyProcessed: true, result: "DONE" };
      }
      seenClosureEvents.add(input.closureEventId);

      const count = PENDING_BY_PROJECT[projectId] ?? 0;
      return {
        rejectedCount: count,
        alreadyProcessed: false,
        result: count > 0 ? "DONE" : "NOT_NEEDED",
      };
    },
  };

  const contracts: ContractsPort = {
    async invalidateAgreementAndContract(projectId, input): Promise<InvalidateAgreementResult> {
      calls.invalidateAgreementAndContract.push({ projectId, input });

      if (failNext.invalidateAgreementAndContract) {
        failNext.invalidateAgreementAndContract = false;
        return { alreadyProcessed: false, result: "FAILED" };
      }

      if (seenCancellations.has(input.cancellationId)) {
        return { alreadyProcessed: true, result: "DONE" };
      }
      seenCancellations.add(input.cancellationId);
      return { alreadyProcessed: false, result: "DONE" };
    },
  };

  const pricing: PricingAnalysisClaimPort = {
    async claimPricingAnalysisForCreatedProject(
      _transaction: TransactionContext,
      input: ClaimPricingAnalysisInput,
    ): Promise<ClaimPricingAnalysisResult> {
      calls.claimPricingAnalysis.push(input);

      const found = PRICING_ANALYSES[input.analysisId];
      // 규칙 53 — 없거나 남의 분석이면 갱신 대상이 0건이라 실패한다.
      // 오류 형태는 ai-pricing 이 정한다. 여기서는 서비스가 잡아서
      // PRICING_ANALYSIS_NOT_APPLICABLE 로 바꾸는지만 확인하면 된다.
      if (!found || found.ownerId !== input.requesterId) {
        throw new Error(`PRICING_ANALYSIS_NOT_CLAIMABLE: ${input.analysisId}`);
      }
      return { recommendedAmount: found.amount };
    },

    async getPricingAnalysisRecommendation(query): Promise<ClaimPricingAnalysisResult> {
      calls.getPricingAnalysisRecommendation.push(query);

      const found = PRICING_ANALYSES[query.analysisId];
      if (!found || found.ownerId !== query.requesterId) {
        throw new Error(`PRICING_ANALYSIS_NOT_APPLICABLE: ${query.analysisId}`);
      }
      return { recommendedAmount: found.amount };
    },
  };

  const profile: ProfilePort = {
    async getProfileCompletion(userId): Promise<ProfileCompletion> {
      calls.getProfileCompletion.push(userId);
      return (
        PROFILES[userId] ?? { status: "INCOMPLETE", completedAt: null, missingFields: ["unknown"] }
      );
    },
  };

  return { applications, contracts, pricing, profile, calls, failNext };
}

/** 트랜잭션 자리 표시. 프로토타입에는 실제 트랜잭션이 없다 (규칙 52) */
export function createMockTransaction(id = "tx_mock"): TransactionContext {
  return { id };
}
