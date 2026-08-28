/**
 * engagement 가 다른 도메인에서 읽어 오는 포트
 *
 * 원본: features/engagement/prototype/server/ports/project-read.port.ts (3e4977e)
 *
 * ## 담당자가 같은데 왜 포트를 두나
 *
 * engagement 는 프로젝트를 **읽기만 한다** (PRD §4.0). 같은 사람이 두 도메인을 맡고
 * 있어도 직접 import 하지 않는다. 섞으면 "북마크를 눌렀더니 프로젝트 상태가 바뀌는"
 * 결함이 생길 수 있고, 나중에 떼어내기도 어려워진다.
 *
 * project-management 의 `project-read.service.ts` 가 이 세 함수를 그대로 구현한다
 * (CR-0001). 두 파일을 잇는 어댑터는 조립 지점(`app/server/src/app.ts`)에 있다 —
 * **이 폴더가 project-management 폴더를 import 하지 않는다.**
 *
 * 근거: ADR-0009, app/web/AGENTS.md "폴더 간 접점"과 같은 원칙.
 */

/**
 * 카드 한 장에 필요한 것.
 *
 * **`transactionStatus` 가 없다.** engagement 응답에 그 키가 나가면 안 되는데
 * (spec.md 규칙 27), 애초에 받지 않으면 실수로 내보낼 수 없다.
 * `deletedAt` 도 없다 — 삭제 여부는 "값이 null 인가"로 전달한다.
 */
export type ProjectCardData = {
  projectId: string;
  title: string;
  category: { category: string; displayName: string };
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  /** 조회 시점 기준으로 판정된 값이다. 저장값이 아니다 (project-management 규칙 14) */
  recruitmentStatus: 'SCHEDULED' | 'OPEN' | 'CLOSED';
  skills: { skillId: string; displayName: string }[];
  applicationCount: number;
  /** 추천 동점 정렬 기준 (spec.md 규칙 21) */
  createdAt: string;
};

/**
 * 추천 후보 조회 조건.
 *
 * **거르기는 project-management 가 한다** — 삭제 안 됨 · `OPEN` · 자기 자신 제외.
 * **우선순위 계산은 engagement 가 한다** (규칙 20·21).
 */
export type RecommendationCandidateQuery = {
  excludeProjectId: string;
  category: string;
  skillIds: string[];
};

export interface ProjectReadPort {
  /** 삭제됐으면 null. 마감·취소된 것은 정상적으로 준다 (규칙 7·13) */
  getProjectCardData(projectId: string): Promise<ProjectCardData | null>;

  /**
   * 여러 장을 한 번에. 삭제된 id 는 결과에 없다 (규칙 12).
   * 건별 호출로 두면 북마크 목록 한 페이지(10건)에 왕복이 10번 생긴다.
   */
  getProjectCardDataBulk(projectIds: string[]): Promise<Map<string, ProjectCardData>>;

  /** 후보를 걸러서 준다. 정렬과 4건 자르기는 이쪽에서 한다 */
  findRecommendationCandidates(query: RecommendationCandidateQuery): Promise<ProjectCardData[]>;
}

/* ─────────────── user-management ─────────────── */

export interface UserReadPort {
  /** 규칙 5·33 의 프리랜서 판정. `users.role` 을 직접 읽지 않는다 */
  getUserRole(userId: string): Promise<'CLIENT' | 'FREELANCER' | null>;
}

/** 모든 외부 의존을 한 묶음으로 넘긴다 — 서비스가 포트를 직접 import 하지 않게 */
export type EngagementPorts = {
  projectRead: ProjectReadPort;
  userRead: UserReadPort;
};
