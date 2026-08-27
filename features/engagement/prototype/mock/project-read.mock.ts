/**
 * project-management · user-management 읽기 포트의 Mock 어댑터
 *
 * 실제 구현이 올라오면 이 파일만 교체한다 (CR-0001).
 * 서비스 코드는 `ports/project-read.port.ts` 의 인터페이스만 본다.
 *
 * ## 프로젝트 데이터를 왜 여기 다시 두나
 *
 * `features/project-management/prototype/mock/seeds.ts` 를 import 하면
 * 편하지만, 그 순간 **기능 폴더 간 직접 import** 가 된다 (2026-08-28 팀 표준).
 * id 만 맞춰두면 통합할 때 같은 프로젝트를 가리킨다.
 */

import type {
  ProjectCardData,
  ProjectReadPort,
  RecommendationCandidateQuery,
  UserReadPort,
} from "../server/ports/project-read.port";

const NOW = "2026-08-28T09:00:00Z";

function card(o: Partial<ProjectCardData> & { projectId: string; title: string }): ProjectCardData {
  return {
    category: { category: "WEB_DEVELOPMENT", displayName: "웹 개발" },
    budgetAmount: 5_000_000,
    recruitmentDeadlineAt: "2026-09-16T14:59:59Z",
    recruitmentStatus: "OPEN",
    skills: [{ skillId: "REACT", displayName: "React" }],
    applicationCount: 0,
    createdAt: "2026-08-01T00:00:00Z",
    ...o,
  };
}

/**
 * id 는 project-management 시드와 맞췄다.
 * `prj_deleted` 는 여기 **없다** — 삭제된 프로젝트는 조회에 안 나오는 게 맞다.
 */
const PROJECTS: ProjectCardData[] = [
  card({
    projectId: "prj_open_free",
    title: "배달 앱 UI 개선",
    category: { category: "DESIGN", displayName: "디자인" },
    budgetAmount: 3_400_000,
    skills: [{ skillId: "FIGMA", displayName: "Figma" }],
    createdAt: "2026-08-10T00:00:00Z",
  }),
  card({
    projectId: "prj_closed",
    title: "쇼핑몰 웹사이트 구축",
    recruitmentStatus: "CLOSED",
    applicationCount: 2,
    skills: [
      { skillId: "REACT", displayName: "React" },
      { skillId: "NODEJS", displayName: "Node.js" },
    ],
    createdAt: "2026-08-05T00:00:00Z",
  }),
  card({
    projectId: "prj_scheduled",
    title: "사내 관리 시스템 리뉴얼",
    recruitmentStatus: "SCHEDULED",
    budgetAmount: 8_200_000,
    skills: [{ skillId: "TYPESCRIPT", displayName: "TypeScript" }],
    createdAt: "2026-08-08T00:00:00Z",
  }),

  /* 추천 후보 — 기준 프로젝트는 prj_open_free (DESIGN · FIGMA) */

  /** 1순위: 같은 카테고리 + 기술 겹침 */
  card({
    projectId: "prj_reco_1",
    title: "브랜드 리뉴얼 디자인",
    category: { category: "DESIGN", displayName: "디자인" },
    skills: [{ skillId: "FIGMA", displayName: "Figma" }],
    createdAt: "2026-08-20T00:00:00Z",
  }),
  /** 1순위 · 위보다 최근 — 동점 정렬 검증용 (규칙 21) */
  card({
    projectId: "prj_reco_2",
    title: "모바일 앱 화면 개선",
    category: { category: "DESIGN", displayName: "디자인" },
    skills: [
      { skillId: "FIGMA", displayName: "Figma" },
      { skillId: "REACT", displayName: "React" },
    ],
    createdAt: "2026-08-26T00:00:00Z",
  }),
  /** 2순위: 카테고리만 같음 */
  card({
    projectId: "prj_reco_3",
    title: "포스터 시리즈 제작",
    category: { category: "DESIGN", displayName: "디자인" },
    skills: [{ skillId: "PYTHON", displayName: "Python" }],
    createdAt: "2026-08-24T00:00:00Z",
  }),
  /** 3순위: 기술만 겹침 */
  card({
    projectId: "prj_reco_4",
    title: "랜딩 페이지 제작",
    skills: [{ skillId: "FIGMA", displayName: "Figma" }],
    createdAt: "2026-08-25T00:00:00Z",
  }),
  /** 후보 아님 — 카테고리도 기술도 안 겹침. 5순위가 없다는 것을 확인한다 */
  card({
    projectId: "prj_reco_none",
    title: "데이터 파이프라인 구축",
    category: { category: "DATA_AI", displayName: "데이터·AI" },
    skills: [{ skillId: "PYTHON", displayName: "Python" }],
    createdAt: "2026-08-27T00:00:00Z",
  }),
  /** 후보 아님 — 마감됐다. 겹치는데도 빠지는지 확인한다 (규칙 18·19) */
  card({
    projectId: "prj_reco_closed",
    title: "이벤트 페이지 디자인",
    category: { category: "DESIGN", displayName: "디자인" },
    recruitmentStatus: "CLOSED",
    skills: [{ skillId: "FIGMA", displayName: "Figma" }],
    createdAt: "2026-08-27T00:00:00Z",
  }),
];

export type ProjectReadMock = ProjectReadPort & {
  calls: { bulk: string[][]; candidates: RecommendationCandidateQuery[] };
};

export function createProjectReadMock(): ProjectReadMock {
  const calls: ProjectReadMock["calls"] = { bulk: [], candidates: [] };
  const byId = new Map(PROJECTS.map((p) => [p.projectId, p]));

  return {
    calls,

    async getProjectCardData(projectId) {
      return byId.get(projectId) ?? null;
    },

    async getProjectCardDataBulk(projectIds) {
      calls.bulk.push([...projectIds]);
      const out = new Map<string, ProjectCardData>();
      for (const id of projectIds) {
        const found = byId.get(id);
        // 삭제된 id 는 결과에 넣지 않는다. 호출자가 빠진 것을 보고 걸러낸다 (규칙 12).
        if (found) out.set(id, found);
      }
      return out;
    },

    async findRecommendationCandidates(query) {
      calls.candidates.push(query);
      // 거르기는 project-management 몫이다 (규칙 18).
      // 정렬·자르기는 하지 않는다 — 그건 engagement 규칙이다.
      return PROJECTS.filter(
        (p) =>
          p.projectId !== query.excludeProjectId &&
          p.recruitmentStatus === "OPEN" &&
          (p.category.category === query.category ||
            p.skills.some((s) => query.skillIds.includes(s.skillId))),
      );
    },
  };
}

const ROLES: Record<string, "CLIENT" | "FREELANCER"> = {
  usr_free_1: "FREELANCER",
  usr_free_2: "FREELANCER",
  usr_client_a: "CLIENT",
};

export function createUserReadMock(): UserReadPort {
  return {
    async getUserRole(userId) {
      return ROLES[userId] ?? null;
    },
  };
}

export const MOCK_NOW = NOW;
