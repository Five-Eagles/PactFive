/**
 * 다른 도메인에 제공하는 읽기 함수 3종 (CR-0001)
 *
 * 원본: features/project-management/prototype/server/project-read.service.ts (3e4977e)
 *
 * ## 왜 공개 API 와 따로 두나
 *
 * 이 셋은 브라우저가 아니라 **같은 서버 안의 다른 기능**이 부른다.
 * HTTP 를 거치지 않으므로 `Responded<T>` 껍데기를 쓰지 않고 값을 바로 준다.
 *
 * ## 지금 부르는 곳
 *
 * `app/server/src/features/engagement/` — 북마크 목록의 카드와 추천 후보.
 * 근거: features/engagement/change-requests/0001-project-card-read-ports.md
 *
 * engagement 는 이 파일을 **직접 import 하지 않는다.** 자기 쪽
 * `bookmark.port.ts` 의 `ProjectReadPort` 만 보고, 두 쪽을 잇는 어댑터는
 * 조립 지점(`app/server/src/app.ts`)에서 만든다 — 기능 폴더 간 직접 import 금지.
 */

import type { ProjectRepository } from './project.repository';
import type { ProjectCatalogPort } from './project.port';
import type { ProjectRecord, RecruitmentStatus } from './project.types';

/**
 * 카드 한 장에 필요한 것.
 *
 * **`transactionStatus` 를 넣지 않는다.** engagement 응답에 그 키가 나가면 안 되는데
 * (engagement 규칙 27), 애초에 주지 않으면 실수로 내보낼 수 없다.
 * `deletedAt` 도 없다 — 삭제 여부는 "`null` 인가"로 전달한다.
 */
export type ProjectCardData = {
  projectId: string;
  title: string;
  category: { category: string; displayName: string };
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  /** 조회 시점 기준으로 판정한 값이다. 저장값이 아니다 (규칙 14) */
  recruitmentStatus: RecruitmentStatus;
  skills: { skillId: string; displayName: string }[];
  applicationCount: number;
  /** 부르는 쪽이 동점 정렬에 쓴다 */
  createdAt: string;
};

export type RecommendationCandidateQuery = {
  excludeProjectId: string;
  category: string;
  skillIds: string[];
};

export type ProjectReadDeps = {
  repo: ProjectRepository;
  catalog: ProjectCatalogPort;
  now: () => string;
};

export type ProjectReadService = ReturnType<typeof createProjectReadService>;

export function createProjectReadService(deps: ProjectReadDeps) {
  const { repo, catalog, now } = deps;

  /**
   * 규칙 14 — 저장값이 아니라 조회 시점 기준으로 판정한다.
   *
   * `project.service.ts` 에도 같은 계산이 있다. 원본이 두 곳에 둔 것을 그대로 옮겼다 —
   * 한쪽으로 모으면 두 서비스 사이에 의존 방향이 생긴다. 두 구현이 어긋나지 않는지는
   * 담당자 쪽 `prototype/run.tsx` 가 대조한다.
   */
  function effectiveRecruitmentStatus(p: ProjectRecord, at: string): RecruitmentStatus {
    const t = new Date(at).getTime();
    if (p.recruitmentStatus === 'SCHEDULED' && p.recruitmentStartAt !== null) {
      if (new Date(p.recruitmentStartAt).getTime() <= t) {
        return new Date(p.recruitmentDeadlineAt).getTime() <= t ? 'CLOSED' : 'OPEN';
      }
      return 'SCHEDULED';
    }
    if (p.recruitmentStatus === 'OPEN' && new Date(p.recruitmentDeadlineAt).getTime() <= t) {
      return 'CLOSED';
    }
    return p.recruitmentStatus;
  }

  function toCard(p: ProjectRecord, at: string): ProjectCardData {
    return {
      projectId: p.projectId,
      title: p.title,
      category: catalog.toCategoryRef(p.category),
      budgetAmount: p.budgetAmount,
      recruitmentDeadlineAt: p.recruitmentDeadlineAt,
      recruitmentStatus: effectiveRecruitmentStatus(p, at),
      skills: catalog.toSkillRefs(p.skillIds),
      applicationCount: p.applicationCount,
      createdAt: p.createdAt,
    };
  }

  return {
    /**
     * 삭제됐으면 `null`.
     *
     * **마감·거래 중·취소된 것은 정상적으로 준다.** 부르는 쪽이 담아둔 것을
     * 보여줘야 하기 때문이다 (engagement 규칙 7·13). 공개 목록과 다르다.
     */
    async getProjectCardData(projectId: string): Promise<ProjectCardData | null> {
      const project = repo.findById(projectId);
      return project ? toCard(project, now()) : null;
    },

    /**
     * 여러 장을 한 번에. **삭제된 id 는 결과에 없다.**
     *
     * 건별로 두면 북마크 목록 한 페이지(10건)에 왕복이 10번 생긴다.
     * 부르는 쪽은 빠진 id 를 보고 목록에서 걸러낸다.
     */
    async getProjectCardDataBulk(projectIds: string[]): Promise<Map<string, ProjectCardData>> {
      const at = now();
      const found = new Map<string, ProjectCardData>();
      for (const id of projectIds) {
        const project = repo.findById(id);
        if (project) found.set(id, toCard(project, at));
      }
      return found;
    },

    /**
     * 추천 후보를 걸러서 준다.
     *
     * **여기서 하는 것은 거르기까지다.** 우선순위 계산·정렬·건수 자르기는
     * 부르는 쪽 규칙이다 (engagement 규칙 20~23).
     */
    async findRecommendationCandidates(
      query: RecommendationCandidateQuery,
    ): Promise<ProjectCardData[]> {
      const at = now();
      return repo
        .findAll()
        .filter((p) => p.projectId !== query.excludeProjectId)
        // 모집 상태는 조회 시점 기준으로 본다. 저장값으로 걸러내면
        // 마감 시각이 지났는데 배치가 안 돈 프로젝트가 추천에 남는다.
        .filter((p) => effectiveRecruitmentStatus(p, at) === 'OPEN')
        .filter(
          (p) =>
            p.category === query.category || p.skillIds.some((s) => query.skillIds.includes(s)),
        )
        .map((p) => toCard(p, at));
    },
  };
}
