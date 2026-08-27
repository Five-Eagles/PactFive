/**
 * 다른 도메인에 제공하는 읽기 함수 3종
 *
 * ## 왜 공개 API 와 따로 두나
 *
 * 이 셋은 브라우저가 아니라 **같은 서버 안의 다른 기능**이 부른다.
 * HTTP 를 거치지 않으므로 `Responded<T>` 껍데기를 쓰지 않고 값을 바로 준다.
 *
 * `project.service.ts` 에 섞으면 "이건 HTTP 인가 함수 호출인가"가 흐려진다.
 *
 * ## 지금 부르는 곳
 *
 * `features/engagement/` — 북마크 목록의 카드와 추천 후보에 쓴다.
 * engagement 요청으로 만들었다 (`features/engagement/change-requests/0001`).
 *
 * engagement 쪽 `ports/project-read.port.ts` 에 같은 모양이 선언돼 있다.
 * **서로 import 하지 않는다** — 기능 폴더 간 직접 import 금지 (2026-08-28 팀 표준).
 * 통합 단계에서 어느 한쪽을 정본으로 삼고 다른 쪽이 참조하게 된다.
 */

import type { ProjectRepository } from "../mock/project.mock";
import { toCategoryRef, toSkillRefs } from "../mock/project.mock";
import type { ProjectRecord, RecruitmentStatus } from "./project.types";

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
  now: () => string;
};

export function createProjectReadService(deps: ProjectReadDeps) {
  const { repo, now } = deps;

  /**
   * 규칙 14 — 저장값이 아니라 조회 시점 기준으로 판정한다.
   *
   * `project.service.ts` 에도 같은 계산이 있다. 한쪽으로 모으면 좋지만,
   * 지금 옮기면 두 파일의 의존 방향이 생겨 통합 때 더 번거로워진다.
   * **둘이 어긋나지 않는지는 `run.tsx` 가 대조한다.**
   */
  function effectiveRecruitmentStatus(p: ProjectRecord, at: string): RecruitmentStatus {
    const t = new Date(at).getTime();
    if (p.recruitmentStatus === "SCHEDULED" && p.recruitmentStartAt !== null) {
      if (new Date(p.recruitmentStartAt).getTime() <= t) {
        return new Date(p.recruitmentDeadlineAt).getTime() <= t ? "CLOSED" : "OPEN";
      }
      return "SCHEDULED";
    }
    if (p.recruitmentStatus === "OPEN" && new Date(p.recruitmentDeadlineAt).getTime() <= t) {
      return "CLOSED";
    }
    return p.recruitmentStatus;
  }

  function toCard(p: ProjectRecord, at: string): ProjectCardData {
    return {
      projectId: p.projectId,
      title: p.title,
      category: toCategoryRef(p.category),
      budgetAmount: p.budgetAmount,
      recruitmentDeadlineAt: p.recruitmentDeadlineAt,
      recruitmentStatus: effectiveRecruitmentStatus(p, at),
      skills: toSkillRefs(p.skillIds),
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
      const p = repo.findById(projectId);
      return p ? toCard(p, now()) : null;
    },

    /**
     * 여러 장을 한 번에. **삭제된 id 는 결과에 없다.**
     *
     * 건별로 두면 북마크 목록 한 페이지(10건)에 왕복이 10번 생긴다.
     * 부르는 쪽은 빠진 id 를 보고 목록에서 걸러낸다.
     */
    async getProjectCardDataBulk(projectIds: string[]): Promise<Map<string, ProjectCardData>> {
      const at = now();
      const out = new Map<string, ProjectCardData>();
      for (const id of projectIds) {
        const p = repo.findById(id);
        if (p) out.set(id, toCard(p, at));
      }
      return out;
    },

    /**
     * 추천 후보를 걸러서 준다.
     *
     * **여기서 하는 것은 거르기까지다.** 우선순위 계산·정렬·건수 자르기는
     * 부르는 쪽 규칙이다 (engagement 규칙 20~23). 그것까지 여기서 하면
     * 추천 방식을 바꿀 때마다 이 도메인을 고쳐야 한다.
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
        .filter((p) => effectiveRecruitmentStatus(p, at) === "OPEN")
        .filter(
          (p) =>
            p.category === query.category ||
            p.skillIds.some((s) => query.skillIds.includes(s)),
        )
        .map((p) => toCard(p, at));
    },
  };
}
