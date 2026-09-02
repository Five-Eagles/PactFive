/**
 * project-management 가 호출하는 외부 포트의 잠정 어댑터.
 *
 * 원본: features/project-management/prototype/mock/external.mock.ts (3e4977e)
 *
 * applications(최윤석)·ai-pricing(오민혁)은 아직 app/ 에 통합되지 않았고,
 * user-management 의 프로필 완성 판정과 contracts-payments 의 합의·계약 무효화도
 * 아직 서버 함수로 노출되지 않았다. 실제 구현이 올라오면 **이 파일만** 갈아끼운다
 * (ADR-0009 — 서비스 코드는 project.port.ts 의 인터페이스만 본다).
 *
 * 원본 Mock 의 검증용 장치(호출 기록 `calls`, 강제 실패 `failNext`)는 옮기지 않았다 —
 * 그건 prototype/run.tsx 의 자체 점검용이고 배포 코드에 둘 것이 아니다.
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
  ProjectCatalogPort,
  RejectPendingApplicationsInput,
  RejectPendingApplicationsResult,
  TransactionContext,
} from './project.port';
import type { CategoryRef, ClientPublicProfile, SkillRef } from './project.types';

/* ─────────────── 참조 데이터 ─────────────── */

/** 카테고리 6종 · 기술은 user-management 가 정본이다 (PRD D-12) */
const VALID_CATEGORIES = [
  'WEB_DEVELOPMENT',
  'MOBILE_APP',
  'DESIGN',
  'DATA_AI',
  'PLANNING',
  'MARKETING',
] as const;

/** is_custom = false 인 공식 기술만. 커스텀이 섞이면 422 (규칙 5) */
const OFFICIAL_SKILLS = [
  'REACT', 'NODEJS', 'SQL', 'TYPESCRIPT', 'JAVASCRIPT', 'VUE',
  'SPRING', 'FIGMA', 'FLUTTER', 'PYTHON', 'HTML_CSS', 'AWS',
] as const;

/** 프리랜서가 직접 만든 기술. 프로젝트 요구 기술에 넣을 수 없다 (PRD D-64) */
const CUSTOM_SKILLS = ['MY_OWN_STACK', 'SOME_CUSTOM_TOOL'] as const;

const CATEGORY_LABELS: Record<string, string> = {
  WEB_DEVELOPMENT: '웹 개발',
  MOBILE_APP: '모바일 앱',
  DESIGN: '디자인',
  DATA_AI: '데이터·AI',
  PLANNING: '기획',
  MARKETING: '마케팅',
};

const SKILL_LABELS: Record<string, string> = {
  REACT: 'React',
  NODEJS: 'Node.js',
  SQL: 'SQL',
  TYPESCRIPT: 'TypeScript',
  JAVASCRIPT: 'JavaScript',
  VUE: 'Vue',
  SPRING: 'Spring',
  FIGMA: 'Figma',
  FLUTTER: 'Flutter',
  PYTHON: 'Python',
  HTML_CSS: 'HTML/CSS',
  AWS: 'AWS',
};

export function createInMemoryProjectCatalog(): ProjectCatalogPort {
  return {
    isValidCategory(category: string): boolean {
      return (VALID_CATEGORIES as readonly string[]).includes(category);
    },
    isOfficialSkill(skillId: string): boolean {
      return (OFFICIAL_SKILLS as readonly string[]).includes(skillId);
    },
    isKnownSkill(skillId: string): boolean {
      return (
        (OFFICIAL_SKILLS as readonly string[]).includes(skillId) ||
        (CUSTOM_SKILLS as readonly string[]).includes(skillId)
      );
    },
    toCategoryRef(category: string): CategoryRef {
      return { category, displayName: CATEGORY_LABELS[category] ?? category };
    },
    toSkillRefs(skillIds: string[]): SkillRef[] {
      return skillIds.map((skillId) => ({
        skillId,
        displayName: SKILL_LABELS[skillId] ?? skillId,
      }));
    },
    /**
     * 의뢰인 공개 프로필. user-management 가 정본이다 (PRD D-12).
     * 그쪽이 조회 함수를 노출하기 전까지는 식별자만 채운 자리표시자를 준다 —
     * 없는 값을 지어내지 않는다.
     */
    toClientProfile(clientId: string): ClientPublicProfile {
      return {
        userId: clientId,
        name: '알 수 없음',
        companyName: null,
        profileImageUrl: null,
        averageRating: 0,
        reviewCount: 0,
      };
    },
  };
}

/* ─────────────── 외부 도메인 어댑터 ─────────────── */

/**
 * applications 미통합 — 일괄 거절을 **시도하지 못했다**고 정직하게 응답한다.
 *
 * 성공(`DONE`)으로 가장하지 않는다. 규칙 29 가 `FAILED` 를 202 로 내보내도록 설계돼 있어,
 * 화면이 "지원자 정리가 아직 끝나지 않았다"고 안내할 수 있다. `NOT_NEEDED` 로 두면
 * 정리가 끝난 것처럼 보인다.
 */
function createUnavailableApplicationsPort(): ApplicationsPort {
  return {
    async rejectPendingApplications(
      _projectId: string,
      _input: RejectPendingApplicationsInput,
    ): Promise<RejectPendingApplicationsResult> {
      return { rejectedCount: 0, alreadyProcessed: false, result: 'FAILED' };
    },
  };
}

/** contracts-payments 는 app/ 에 있으나 무효화 함수를 아직 노출하지 않았다 (같은 이유로 FAILED) */
function createUnavailableContractsPort(): ContractsPort {
  return {
    async invalidateAgreementAndContract(
      _projectId: string,
      _input: InvalidateAgreementInput,
    ): Promise<InvalidateAgreementResult> {
      return { alreadyProcessed: false, result: 'FAILED' };
    },
  };
}

/**
 * ai-pricing 미통합 — 분석을 연결할 수 없다.
 *
 * 서비스가 이 실패를 잡아 409 PRICING_ANALYSIS_NOT_APPLICABLE 로 바꾸고
 * 프로젝트 생성까지 되돌린다 (규칙 8). `pricingAnalysisId` 없이 등록하는 경로는 영향받지 않는다.
 */
function createUnavailablePricingPort(): PricingAnalysisClaimPort {
  return {
    async claimPricingAnalysisForCreatedProject(
      _transaction: TransactionContext,
      input: ClaimPricingAnalysisInput,
    ): Promise<ClaimPricingAnalysisResult> {
      throw new Error(`PRICING_ANALYSIS_NOT_CLAIMABLE: ${input.analysisId} (ai-pricing 미통합)`);
    },
    async getPricingAnalysisRecommendation(
      query: PricingRecommendationQuery,
    ): Promise<ClaimPricingAnalysisResult> {
      throw new Error(`PRICING_ANALYSIS_NOT_APPLICABLE: ${query.analysisId} (ai-pricing 미통합)`);
    },
  };
}

/**
 * 프로필 완성 판정 — user-management 가 정본(규칙 7)이나 아직 함수를 노출하지 않았다.
 *
 * **여기서는 COMPLETE 로 통과시킨다.** INCOMPLETE 로 두면 등록(A-01)이 전부 403 이 되어
 * 이번 통합에서 프로젝트 등록 경로 자체를 확인할 수 없다. 되돌리기 싼 잠정 결정이며
 * feedback_loop/2026-08-28/project-management.md 항목 3 에 기록했다.
 */
function createPermissiveProfilePort(): ProfilePort {
  return {
    async getProfileCompletion(_userId: string): Promise<ProfileCompletion> {
      return { status: 'COMPLETE', completedAt: null, missingFields: [] };
    },
  };
}

export function createInMemoryExternalPorts(): ExternalPorts {
  return {
    applications: createUnavailableApplicationsPort(),
    contracts: createUnavailableContractsPort(),
    pricing: createUnavailablePricingPort(),
    profile: createPermissiveProfilePort(),
    catalog: createInMemoryProjectCatalog(),
  };
}

/** 트랜잭션 자리 표시. Prisma 도입 전까지 실제 트랜잭션이 없다 (규칙 52) */
export function createTransactionContext(id = 'tx_in_memory'): TransactionContext {
  return { id };
}
