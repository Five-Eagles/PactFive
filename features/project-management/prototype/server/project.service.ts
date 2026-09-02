/**
 * 공개 API 구현 — 브라우저가 부르는 9종
 *
 * 계약 함수(다른 서버가 부르는 것)는 `project-contract.service.ts` 에 있다.
 * 두 파일을 나눈 이유는 **주소 체계가 다르기 때문**이다 — 공개는 `/api/v1`,
 * 계약은 `/internal/v1` 이고 사용자 로그인 토큰으로는 후자에 닿을 수 없다 (규칙 49).
 *
 * ## 이 파일이 지키는 세 가지
 *
 * 1. **거래 상태는 등록 의뢰인에게만** — 그 외에는 키 자체를 넣지 않는다.
 *    `null` 로도 내려보내지 않는다 (규칙 9).
 * 2. **잠금은 서버가 계산한다** — 화면이 규칙을 다시 계산하지 않도록
 *    `editableFields` · `availableActions` 를 만들어 내려보낸다 (규칙 13).
 * 3. **모르면 잠근다** — 대기 지원 수를 읽지 못하면 0 으로 보지 않고 잠금을 유지한다 (규칙 15).
 */

import {
  isOfficialSkill,
  isKnownSkill,
  isValidCategory,
  toCategoryRef,
  toClientProfile,
  toSkillRefs,
  type ProjectRepository,
} from "../mock/project.mock";
import {
  ProjectContractError,
  type CancelProjectResponse,
  type ClientProjectDetail,
  type CloseRecruitmentResponse,
  type CreateProjectInput,
  type PostActionResult,
  type ProjectAction,
  type ProjectErrorCode,
  type ProjectListQuery,
  type ProjectListResponse,
  type ProjectRecord,
  type PublicProjectDetail,
  type PublicProjectItem,
  type RecruitmentStatus,
  type ReopenRecruitmentInput,
  type ReopenRecruitmentResponse,
  type UpdateProjectInput,
} from "./project.types";
import type { AuthContext, ExternalPorts, TransactionContext } from "./ports/external.port";

const DAY = 24 * 60 * 60 * 1000;
const MAX_RECRUITMENT_DAYS = 365;

/**
 * 검색어 판정 (규칙 62·63).
 *
 * **기술 이름도 본다.** 사람들이 검색창에 가장 먼저 치는 것이 기술 이름인데
 * 제목·설명만 보면 "React" 가 0건으로 나온다 — React 를 요구하는 프로젝트가
 * 실제로 있는데도 그렇다. 2026-09-03 실측으로 확인했다.
 *
 * **띄어쓰기로 끊어 전부 만족하는 것만 남긴다.** 통째로 찾으면
 * "브랜드 디자인" 이 "브랜드 리뉴얼 디자인" 을 못 찾는다. 대표페이지의
 * 인기 검색어 5개가 전부 0건이던 이유가 이것이다.
 *
 * 낱말끼리는 AND 다. OR 로 하면 낱말 하나만 걸려도 나와서 결과가 넓어진다 —
 * 목록의 목적은 지원할 곳을 좁히는 것이다 (규칙 58 의 AND 와 같은 이유).
 */
function matchesKeyword(project: { title: string; description: string; skillIds: string[] }, keyword: string): boolean {
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = [
    project.title,
    project.description,
    // 표시 이름과 코드를 둘 다 넣는다 — "Node.js" 로도 "NODEJS" 로도 찾는다
    ...toSkillRefs(project.skillIds).flatMap((s) => [s.displayName, s.skillId]),
  ]
    .join(" ")
    .toLowerCase();

  return words.every((w) => haystack.includes(w));
}

export type ProjectServiceDeps = {
  repo: ProjectRepository;
  ports: ExternalPorts;
  now: () => string;
  /** 새 프로젝트 id. 실제로는 DB 가 만든다 */
  newProjectId: () => string;
};

/** 응답에 상태 코드를 실어 보낸다. 취소는 202 가 될 수 있다 (규칙 29) */
export type Responded<T> = { status: number; body: T };

export function createProjectService(deps: ProjectServiceDeps) {
  const { repo, ports, now, newProjectId } = deps;

  /* ═══════════ 공통 ═══════════ */

  function fail(status: number, code: ProjectErrorCode, message: string, details: unknown = null) {
    throw new ProjectContractError(status, code, message, details);
  }

  function requireAuth(auth: AuthContext | null): AuthContext {
    if (!auth) fail(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
    return auth as AuthContext;
  }

  function mustFind(projectId: string): ProjectRecord {
    const p = repo.findById(projectId);
    if (!p) fail(404, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.", { projectId });
    return p as ProjectRecord;
  }

  function mustOwn(p: ProjectRecord, auth: AuthContext): void {
    if (p.clientId !== auth.userId) {
      fail(403, "PROJECT_FORBIDDEN", "본인이 등록한 프로젝트가 아닙니다.", {
        projectId: p.projectId,
      });
    }
  }

  /**
   * 규칙 14 — 저장된 값이 아니라 **조회 시점 기준**으로 보이는 모집 상태.
   * 시각이 지났는데 배치가 아직 안 돈 프로젝트가 잘못된 상태로 보이지 않게 한다.
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

  /* ═══════════ 검증 ═══════════ */

  function validateDeadline(deadlineAt: string, startAt: string | null, at: string): void {
    const t = new Date(at).getTime();
    const deadline = new Date(deadlineAt).getTime();
    if (Number.isNaN(deadline)) {
      fail(422, "VALIDATION_ERROR", "마감 일시 형식이 올바르지 않습니다.", {
        field: "recruitmentDeadlineAt",
      });
    }
    // 규칙 3 — 세 조건을 다른 코드로 구분한다. 하나로 뭉치면 화면이 무엇을 고치라고
    // 안내할 수 없다.
    if (deadline <= t) {
      fail(422, "DEADLINE_MUST_BE_FUTURE", "마감 일시는 현재 시각보다 뒤여야 합니다.");
    }
    if (deadline - t < DAY) {
      fail(422, "DEADLINE_BELOW_MINIMUM", "마감 일시는 최소 1일 뒤여야 합니다.");
    }
    // 상한은 **모집 회차 시작 시각** 기준이다. 재모집은 시작 시각이 갱신되므로
    // 갱신 후 값을 넘겨야 한다 (규칙 33).
    const base = startAt === null ? t : new Date(startAt).getTime();
    if (deadline - base > MAX_RECRUITMENT_DAYS * DAY) {
      fail(422, "DEADLINE_EXCEEDS_LIMIT", "모집 기간은 최대 365일입니다.");
    }
    if (startAt !== null && deadline <= new Date(startAt).getTime()) {
      fail(422, "DEADLINE_BEFORE_START", "마감 일시가 모집 시작 시각보다 앞설 수 없습니다.");
    }
  }

  function validateSkills(skillIds: string[]): void {
    if (skillIds.length === 0) fail(422, "SKILL_REQUIRED", "요구 기술을 1개 이상 선택해 주십시오.");
    if (skillIds.length > 10) {
      fail(422, "VALIDATION_ERROR", "요구 기술은 최대 10개입니다.", { field: "skillIds" });
    }
    for (const id of skillIds) {
      if (!isKnownSkill(id)) fail(422, "INVALID_SKILL", "존재하지 않는 기술입니다.", { skillId: id });
      // 규칙 5 — 프리랜서가 직접 만든 기술은 프로젝트 요구 기술이 될 수 없다.
      // 검색·추천이 그 이름을 아무도 모르는 값으로 갈라진다.
      if (!isOfficialSkill(id)) {
        fail(422, "CUSTOM_SKILL_NOT_ALLOWED", "직접 추가한 기술은 선택할 수 없습니다.", {
          skillId: id,
        });
      }
    }
  }

  function validateCommonFields(input: Partial<CreateProjectInput>): void {
    if (input.title !== undefined && (input.title.length < 5 || input.title.length > 100)) {
      fail(422, "VALIDATION_ERROR", "제목은 5~100자여야 합니다.", { field: "title" });
    }
    if (
      input.description !== undefined &&
      (input.description.length < 20 || input.description.length > 5000)
    ) {
      fail(422, "VALIDATION_ERROR", "설명은 20~5000자여야 합니다.", { field: "description" });
    }
    if (input.category !== undefined && !isValidCategory(input.category)) {
      fail(422, "INVALID_CATEGORY", "존재하지 않는 카테고리입니다.", { category: input.category });
    }
    if (input.budgetAmount !== undefined && input.budgetAmount <= 0) {
      fail(422, "BUDGET_MUST_BE_POSITIVE", "예산은 1원 이상이어야 합니다.");
    }
    if (input.skillIds !== undefined) validateSkills(input.skillIds);
  }

  /* ═══════════ 응답 조립 ═══════════ */

  function toPublicItem(p: ProjectRecord, at: string): PublicProjectItem {
    return {
      projectId: p.projectId,
      title: p.title,
      category: toCategoryRef(p.category),
      budgetAmount: p.budgetAmount,
      recruitmentDeadlineAt: p.recruitmentDeadlineAt,
      recruitmentStatus: effectiveRecruitmentStatus(p, at),
      skills: toSkillRefs(p.skillIds),
      applicationCount: p.applicationCount,
      client: toClientProfile(p.clientId),
    };
  }

  function toPublicDetail(p: ProjectRecord, at: string, auth: AuthContext | null) {
    const detail: PublicProjectDetail = {
      ...toPublicItem(p, at),
      description: p.description,
      recruitmentStartAt: p.recruitmentStartAt,
    };
    if (auth?.role === "FREELANCER") {
      // 북마크 여부는 넣지 않는다. 화면이 engagement 조회로 대조한다 (CR-0008)
      detail.canApply = effectiveRecruitmentStatus(p, at) === "OPEN" && p.transactionStatus === "NONE";
    }
    return detail;
  }

  /**
   * 규칙 13·15 — 무엇을 고칠 수 있는지 서버가 계산한다.
   * 화면이 다시 계산하면 두 곳의 규칙이 갈라진다.
   */
  function editableFieldsOf(p: ProjectRecord, at: string): string[] {
    const closed = effectiveRecruitmentStatus(p, at) === "CLOSED";
    if (closed || p.transactionStatus !== "NONE") return [];

    const always = ["title", "description", "category", "skillIds"];
    // 대기 지원이 1건이라도 있으면 예산과 일정이 잠긴다.
    // 지원자가 보고 지원한 조건이 뒤에서 바뀌면 안 된다.
    if (p.pendingApplicationCount > 0) return always;
    return [...always, "budgetAmount", "recruitmentStartAt", "recruitmentDeadlineAt"];
  }

  function availableActionsOf(p: ProjectRecord, at: string): ProjectAction[] {
    const actions: ProjectAction[] = [];
    const recruitment = effectiveRecruitmentStatus(p, at);
    const idle = p.transactionStatus === "NONE";

    if (idle && recruitment !== "CLOSED") {
      actions.push("EDIT", "CLOSE_RECRUITMENT");
    }
    // 규칙 26~28 — 결제가 시작됐거나 거래가 진행 중이면 취소할 수 없다.
    if (
      (p.transactionStatus === "NONE" || p.transactionStatus === "CONTRACT_PENDING") &&
      p.paymentPendingAt === null
    ) {
      actions.push("CANCEL");
    }
    if (idle && p.pendingApplicationCount === 0) actions.push("DELETE");
    // 규칙 32·34 — 협상이 끝나 비어 있고 대기 지원이 없어야 다시 열 수 있다.
    if (idle && recruitment === "CLOSED" && p.pendingApplicationCount === 0 && p.canceledAt === null) {
      actions.push("REOPEN_RECRUITMENT");
    }
    return actions;
  }

  function toClientDetail(p: ProjectRecord, at: string): ClientProjectDetail {
    return {
      ...toPublicItem(p, at),
      description: p.description,
      recruitmentStartAt: p.recruitmentStartAt,
      transactionStatus: p.transactionStatus,
      budgetSource: p.budgetSource,
      budgetSourceAt: p.budgetSourceAt,
      pendingApplicationCount: p.pendingApplicationCount,
      recruitmentClosedAt: p.recruitmentClosedAt,
      canceledAt: p.canceledAt,
      projectVersion: p.projectVersion,
      editableFields: editableFieldsOf(p, at),
      availableActions: availableActionsOf(p, at),
    };
  }

  /* ═══════════ A-01. 등록 ═══════════ */

  async function createProject(
    auth: AuthContext | null,
    input: CreateProjectInput,
    transaction: TransactionContext,
  ): Promise<Responded<ClientProjectDetail>> {
    const me = requireAuth(auth);
    if (me.role !== "CLIENT") {
      fail(403, "PROJECT_CREATE_ROLE_REQUIRED", "의뢰인만 프로젝트를 등록할 수 있습니다.");
    }

    // 규칙 7 — 완성 판정은 user-management 가 한다. 컬럼을 직접 읽지 않는다.
    const profile = await ports.profile.getProfileCompletion(me.userId);
    if (profile.status !== "COMPLETE") {
      fail(403, "PROJECT_PROFILE_REQUIRED", "프로필을 완성한 뒤 등록할 수 있습니다.", {
        missingFields: profile.missingFields,
      });
    }

    const at = now();
    for (const field of ["title", "description", "category", "recruitmentDeadlineAt"] as const) {
      if (!input[field]) fail(422, "VALIDATION_ERROR", `${field} 은(는) 필수입니다.`, { field });
    }
    validateCommonFields(input);
    validateDeadline(input.recruitmentDeadlineAt, input.recruitmentStartAt, at);

    // 규칙 4 — 시작 시각이 없으면 즉시 모집, 미래면 예정. 둘 다 거래는 NONE 이다.
    const startsLater =
      input.recruitmentStartAt !== null &&
      new Date(input.recruitmentStartAt).getTime() > new Date(at).getTime();

    const projectId = newProjectId();
    const created = repo.insert({
      projectId,
      clientId: me.userId,
      title: input.title,
      description: input.description,
      category: input.category,
      budgetAmount: input.budgetAmount,
      // 분석을 연결하면 아래에서 AI_ANALYSIS 로 바뀐다 (규칙 8)
      budgetSource: "CLIENT_INPUT",
      budgetSourceAt: at,
      recruitmentStartAt: input.recruitmentStartAt,
      recruitmentDeadlineAt: input.recruitmentDeadlineAt,
      recruitmentStatus: startsLater ? "SCHEDULED" : "OPEN",
      transactionStatus: "NONE",
      applicationCount: 0,
      pendingApplicationCount: 0,
      recruitmentClosedAt: null,
      canceledAt: null,
      deadlineNotifiedAt: null,
      acceptedApplicationId: null,
      paymentPendingAt: null,
      projectVersion: 1,
      skillIds: [...input.skillIds],
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });

    // 규칙 8 — 분석 연결은 **프로젝트 행이 생긴 뒤**여야 한다.
    // pricing_analyses.project_id 가 projects.id 를 참조하기 때문에 순서를 바꿀 수 없다.
    if (input.pricingAnalysisId) {
      try {
        const claimed = await ports.pricing.claimPricingAnalysisForCreatedProject(transaction, {
          analysisId: input.pricingAnalysisId,
          projectId,
          requesterId: me.userId,
        });
        // 클라이언트가 보낸 금액을 덮어쓴다. 표시용으로만 받았다.
        //
        // **덮어썼다는 사실도 함께 남긴다** (CR-0006 결함 2).
        // 남기지 않으면 의뢰인이 자기 화면의 숫자가 어디서 왔는지 알 수 없다.
        repo.update(projectId, {
          budgetAmount: claimed.recommendedAmount,
          budgetSource: "AI_ANALYSIS",
          budgetSourceAt: at,
        });
      } catch {
        // 연결 실패면 프로젝트 생성까지 되돌린다. 한 트랜잭션이라 중간 값이 밖으로 안 보인다.
        repo.update(projectId, { deletedAt: at });
        fail(409, "PRICING_ANALYSIS_NOT_APPLICABLE", "이 프로젝트에 연결할 수 없는 분석입니다.", {
          pricingAnalysisId: input.pricingAnalysisId,
        });
      }
    }

    const final = repo.findById(projectId) ?? created;
    return { status: 201, body: toClientDetail(final, at) };
  }

  /* ═══════════ A-02. 목록 · 검색 ═══════════ */

  function listProjects(query: ProjectListQuery): Responded<ProjectListResponse> {
    const at = now();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    if (page < 1 || page > 1000) {
      fail(422, "VALIDATION_ERROR", "page 는 1~1000 입니다.", { field: "page" });
    }
    if (pageSize < 1 || pageSize > 50) {
      fail(422, "VALIDATION_ERROR", "pageSize 는 1~50 입니다.", { field: "pageSize" });
    }
    if (query.sortOrder !== undefined && !["asc", "desc"].includes(query.sortOrder)) {
      fail(422, "VALIDATION_ERROR", "sortOrder 는 asc · desc 입니다.", { field: "sortOrder" });
    }
    if (query.category !== undefined && !isValidCategory(query.category)) {
      fail(422, "INVALID_CATEGORY", "존재하지 않는 카테고리입니다.", { category: query.category });
    }
    for (const s of query.skills ?? []) {
      if (!isKnownSkill(s)) fail(422, "INVALID_SKILL", "존재하지 않는 기술입니다.", { skillId: s });
    }

    // findAll 이 이미 삭제분을 뺀다 (규칙 11).
    let rows = repo.findAll();

    // 규칙 10 — 마감된 것은 기본으로 뺀다. 명시했을 때만 넣는다.
    // 판정은 저장값이 아니라 조회 시점 기준이다 (규칙 14).
    if (query.recruitmentStatus === undefined) {
      rows = rows.filter((p) => effectiveRecruitmentStatus(p, at) !== "CLOSED");
    } else {
      rows = rows.filter((p) => effectiveRecruitmentStatus(p, at) === query.recruitmentStatus);
    }

    if (query.keyword) {
      rows = rows.filter((p) => matchesKeyword(p, query.keyword!));
    }
    if (query.category) rows = rows.filter((p) => p.category === query.category);
    if (query.skills?.length) {
      rows = rows.filter((p) => query.skills!.every((s) => p.skillIds.includes(s)));
    }
    if (query.minBudget !== undefined) rows = rows.filter((p) => p.budgetAmount >= query.minBudget!);
    if (query.maxBudget !== undefined) rows = rows.filter((p) => p.budgetAmount <= query.maxBudget!);
    if (query.deadlineBefore) {
      const before = new Date(query.deadlineBefore).getTime();
      rows = rows.filter((p) => new Date(p.recruitmentDeadlineAt).getTime() <= before);
    }

    const dir = query.sortOrder === "asc" ? 1 : -1;
    const key = query.sortBy ?? "latest";
    rows = [...rows].sort((a, b) => {
      if (key === "budget") return (a.budgetAmount - b.budgetAmount) * dir;
      if (key === "deadline") {
        return (
          (new Date(a.recruitmentDeadlineAt).getTime() -
            new Date(b.recruitmentDeadlineAt).getTime()) *
          dir
        );
      }
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    });

    const totalCount = rows.length;
    const start = (page - 1) * pageSize;
    return {
      status: 200,
      body: {
        items: rows.slice(start, start + pageSize).map((p) => toPublicItem(p, at)),
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  }

  /* ═══════════ A-03. 상세 ═══════════ */

  function getProject(
    auth: AuthContext | null,
    projectId: string,
  ): Responded<PublicProjectDetail | ClientProjectDetail> {
    const at = now();
    const p = mustFind(projectId);
    // 등록 의뢰인에게만 거래 상태가 나간다. 그 외에는 키 자체가 없다 (규칙 9).
    if (auth && p.clientId === auth.userId) {
      return { status: 200, body: toClientDetail(p, at) };
    }
    return { status: 200, body: toPublicDetail(p, at, auth) };
  }

  /* ═══════════ A-04. 수정 ═══════════ */

  function updateProject(
    auth: AuthContext | null,
    projectId: string,
    input: UpdateProjectInput,
  ): Responded<ClientProjectDetail> {
    const me = requireAuth(auth);
    const at = now();
    const p = mustFind(projectId);
    mustOwn(p, me);

    // 규칙 16 — 마감됐거나 거래가 시작되면 어떤 필드도 못 고친다.
    if (effectiveRecruitmentStatus(p, at) === "CLOSED" || p.transactionStatus !== "NONE") {
      fail(409, "PROJECT_EDIT_CLOSED", "마감되었거나 거래가 시작되어 수정할 수 없습니다.");
    }

    validateCommonFields(input);

    const editable = editableFieldsOf(p, at);
    const locked = Object.keys(input).filter((f) => !editable.includes(f));
    if (locked.length > 0) {
      fail(409, "PROJECT_EDIT_LOCKED", "지원자가 있어 예산과 일정은 변경할 수 없습니다.", {
        lockedFields: locked,
        pendingApplicationCount: p.pendingApplicationCount,
      });
    }

    if (input.recruitmentDeadlineAt !== undefined) {
      const startAt =
        input.recruitmentStartAt !== undefined ? input.recruitmentStartAt : p.recruitmentStartAt;
      validateDeadline(input.recruitmentDeadlineAt, startAt, at);
    }

    // 규칙 18 — 일반 필드 수정으로는 projectVersion 이 올라가지 않는다.
    // 상태 축이 안 바뀌었는데 올리면 다른 도메인의 낙관적 잠금이 헛돈다.
    const next = repo.update(projectId, {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.budgetAmount !== undefined && { budgetAmount: input.budgetAmount }),
      ...(input.recruitmentStartAt !== undefined && { recruitmentStartAt: input.recruitmentStartAt }),
      ...(input.recruitmentDeadlineAt !== undefined && {
        recruitmentDeadlineAt: input.recruitmentDeadlineAt,
      }),
      ...(input.skillIds !== undefined && { skillIds: [...input.skillIds] }),
    });
    return { status: 200, body: toClientDetail(next, at) };
  }

  /* ═══════════ A-05. 삭제 ═══════════ */

  function deleteProject(auth: AuthContext | null, projectId: string): Responded<null> {
    const me = requireAuth(auth);
    const at = now();

    // 규칙 21 — 이미 삭제된 것을 다시 지워도 204 다. 재시도가 오류로 보이면 안 된다.
    const raw = repo.findByIdIncludingDeleted(projectId);
    if (!raw) fail(404, "PROJECT_NOT_FOUND", "프로젝트를 찾을 수 없습니다.", { projectId });
    const p = raw as ProjectRecord;
    mustOwn(p, me);
    if (p.deletedAt !== null) return { status: 204, body: null };

    if (p.pendingApplicationCount > 0) {
      fail(409, "PROJECT_DELETE_HAS_APPLICATIONS", "지원자가 있어 삭제할 수 없습니다.", {
        pendingApplicationCount: p.pendingApplicationCount,
      });
    }
    if (p.transactionStatus !== "NONE" && p.transactionStatus !== "CANCELED") {
      fail(409, "PROJECT_DELETE_IN_TRANSACTION", "거래가 진행 중이라 삭제할 수 없습니다.", {
        transactionStatus: p.transactionStatus,
      });
    }

    // 규칙 19 — 행을 지우지 않는다. 지원·계약·정산이 이 행을 참조한다.
    repo.update(projectId, { deletedAt: at });
    return { status: 204, body: null };
  }

  /* ═══════════ A-06. 모집 마감 ═══════════ */

  async function closeRecruitment(
    auth: AuthContext | null,
    projectId: string,
  ): Promise<Responded<CloseRecruitmentResponse>> {
    const me = requireAuth(auth);
    const at = now();
    const p = mustFind(projectId);
    mustOwn(p, me);

    if (p.transactionStatus === "CANCELED") {
      fail(409, "PROJECT_TRANSITION_CONFLICT", "취소된 프로젝트는 마감할 수 없습니다.");
    }

    // 규칙 24 — 이미 마감이면 성공으로 처리하고 아무것도 바꾸지 않는다.
    if (p.recruitmentStatus === "CLOSED") {
      return {
        status: 200,
        body: {
          projectId,
          recruitmentStatus: "CLOSED",
          transactionStatus: p.transactionStatus,
          rejectedApplicationCount: 0,
          closedAt: p.recruitmentClosedAt ?? at,
        },
      };
    }

    // 규칙 22 — OPEN 과 SCHEDULED 둘 다 CLOSED 가 된다.
    const next = repo.update(projectId, {
      recruitmentStatus: "CLOSED",
      recruitmentClosedAt: at,
      deadlineNotifiedAt: p.deadlineNotifiedAt ?? at,
      projectVersion: p.projectVersion + 1,
    });

    // 규칙 23 — 후처리가 실패해도 **마감은 되돌리지 않는다.**
    // 마감은 이미 확정됐고, 되돌리면 지원자에게 다시 열린 것처럼 보인다.
    let rejectedApplicationCount = 0;
    if (p.deadlineNotifiedAt === null) {
      const rejected = await ports.applications.rejectPendingApplications(projectId, {
        closureEventId: `close-${projectId}-${at}`,
        reason: "RECRUITMENT_CLOSED",
        occurredAt: at,
      });
      rejectedApplicationCount = rejected.rejectedCount;
    }

    return {
      status: 200,
      body: {
        projectId,
        recruitmentStatus: next.recruitmentStatus,
        transactionStatus: next.transactionStatus,
        rejectedApplicationCount,
        closedAt: at,
      },
    };
  }

  /* ═══════════ A-07. 취소 ═══════════ */

  async function cancelProject(
    auth: AuthContext | null,
    projectId: string,
  ): Promise<Responded<CancelProjectResponse>> {
    const me = requireAuth(auth);
    const at = now();
    const p = mustFind(projectId);
    mustOwn(p, me);

    // 규칙 30 — 이미 취소면 성공 처리.
    if (p.transactionStatus === "CANCELED") {
      return {
        status: 200,
        body: {
          projectId,
          recruitmentStatus: p.recruitmentStatus,
          transactionStatus: "CANCELED",
          canceledAt: p.canceledAt ?? at,
          postActions: { applicationRejection: "NOT_NEEDED", contractInvalidation: "NOT_NEEDED" },
        },
      };
    }
    // 규칙 27 — 결제가 시작됐으면 막는다. 돈이 움직인 뒤의 취소는 환불 문제가 된다.
    if (p.paymentPendingAt !== null) {
      fail(409, "PROJECT_CANCEL_AFTER_PAYMENT", "결제가 시작되어 취소할 수 없습니다.", {
        paymentPendingAt: p.paymentPendingAt,
      });
    }
    // 규칙 28
    if (p.transactionStatus !== "NONE" && p.transactionStatus !== "CONTRACT_PENDING") {
      fail(409, "PROJECT_TRANSITION_CONFLICT", "진행 중인 거래는 취소할 수 없습니다.", {
        transactionStatus: p.transactionStatus,
      });
    }

    const next = repo.update(projectId, {
      recruitmentStatus: "CLOSED",
      transactionStatus: "CANCELED",
      canceledAt: at,
      projectVersion: p.projectVersion + 1,
    });

    const cancellationId = `cxl-${projectId}-${at}`;
    const rejected = await ports.applications.rejectPendingApplications(projectId, {
      closureEventId: cancellationId,
      reason: "PROJECT_CANCELED",
      occurredAt: at,
    });

    let contractInvalidation: PostActionResult = "NOT_NEEDED";
    if (p.transactionStatus === "CONTRACT_PENDING") {
      const invalidated = await ports.contracts.invalidateAgreementAndContract(projectId, {
        cancellationId,
        actorUserId: me.userId,
        reason: "PROJECT_CANCELED",
        projectCanceledAt: at,
      });
      contractInvalidation = invalidated.result;
    }

    const postActions = {
      applicationRejection: rejected.result,
      contractInvalidation,
    };
    // 규칙 29 — 하나라도 실패하면 202. 취소 자체는 되돌리지 않는다.
    // 200 으로 내보내면 화면이 "전부 정리됐다"고 안내하게 된다.
    const anyFailed = Object.values(postActions).includes("FAILED");

    return {
      status: anyFailed ? 202 : 200,
      body: {
        projectId,
        recruitmentStatus: next.recruitmentStatus,
        transactionStatus: next.transactionStatus,
        canceledAt: at,
        postActions,
      },
    };
  }

  /* ═══════════ A-08. 내 프로젝트 ═══════════ */

  function listMyProjects(
    auth: AuthContext | null,
    clientId: string,
    query: Pick<ProjectListQuery, "recruitmentStatus" | "page" | "pageSize"> & {
      transactionStatus?: ProjectRecord["transactionStatus"];
    },
  ): Responded<{ items: ClientProjectDetail[] } & Omit<ProjectListResponse, "items">> {
    const me = requireAuth(auth);
    if (me.userId !== clientId) {
      fail(403, "PROJECT_FORBIDDEN", "본인의 목록만 조회할 수 있습니다.", { clientId });
    }
    const at = now();
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    if (page < 1 || page > 1000 || pageSize < 1 || pageSize > 50) {
      fail(422, "VALIDATION_ERROR", "page 는 1~1000, pageSize 는 1~50 입니다.");
    }

    let rows = repo.findByClientId(clientId);
    if (query.recruitmentStatus) {
      rows = rows.filter((p) => effectiveRecruitmentStatus(p, at) === query.recruitmentStatus);
    }
    if (query.transactionStatus) {
      rows = rows.filter((p) => p.transactionStatus === query.transactionStatus);
    }

    const totalCount = rows.length;
    const start = (page - 1) * pageSize;
    return {
      status: 200,
      body: {
        items: rows.slice(start, start + pageSize).map((p) => toClientDetail(p, at)),
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    };
  }

  /* ═══════════ A-13. 재모집 ═══════════ */

  function reopenRecruitment(
    auth: AuthContext | null,
    projectId: string,
    input: ReopenRecruitmentInput,
  ): Responded<ReopenRecruitmentResponse> {
    const me = requireAuth(auth);
    const at = now();
    const p = mustFind(projectId);
    mustOwn(p, me);

    // 규칙 35 — 이미 OPEN 이면 아무것도 바꾸지 않는다.
    // 여기서 마감일을 갱신하면 모집 기간이 요청할 때마다 늘어난다.
    if (p.recruitmentStatus === "OPEN") {
      return {
        status: 200,
        body: {
          projectId,
          recruitmentStatus: "OPEN",
          transactionStatus: p.transactionStatus,
          recruitmentStartAt: p.recruitmentStartAt ?? p.createdAt,
          recruitmentDeadlineAt: p.recruitmentDeadlineAt,
          projectVersion: p.projectVersion,
          reopened: false,
        },
      };
    }

    if (p.transactionStatus !== "NONE" || p.canceledAt !== null) {
      fail(409, "PROJECT_TRANSITION_CONFLICT", "거래가 있거나 취소된 프로젝트는 재모집할 수 없습니다.", {
        transactionStatus: p.transactionStatus,
      });
    }
    // 규칙 34 — 대기 지원이 남아 있으면 못 연다.
    if (p.pendingApplicationCount > 0) {
      fail(409, "PROJECT_EDIT_LOCKED", "대기 중인 지원이 남아 있어 재모집할 수 없습니다.", {
        pendingApplicationCount: p.pendingApplicationCount,
      });
    }
    if (
      input.expectedProjectVersion !== undefined &&
      input.expectedProjectVersion !== p.projectVersion
    ) {
      fail(409, "PROJECT_VERSION_CONFLICT", "다른 곳에서 먼저 변경되었습니다.", {
        expected: input.expectedProjectVersion,
        current: p.projectVersion,
      });
    }

    // 규칙 33 — 시작 시각을 **먼저** 현재로 갱신하고, 상한은 갱신 후 값 기준으로 본다.
    // 옛 시작 시각으로 재면 이미 소진한 기간만큼 짧게 계산된다.
    const recruitmentStartAt = at;
    validateDeadline(input.recruitmentDeadlineAt, recruitmentStartAt, at);

    const next = repo.update(projectId, {
      recruitmentStatus: "OPEN",
      recruitmentStartAt,
      recruitmentDeadlineAt: input.recruitmentDeadlineAt,
      recruitmentClosedAt: null,
      deadlineNotifiedAt: null,
      projectVersion: p.projectVersion + 1,
    });

    return {
      status: 200,
      body: {
        projectId,
        recruitmentStatus: next.recruitmentStatus,
        transactionStatus: next.transactionStatus,
        recruitmentStartAt,
        recruitmentDeadlineAt: next.recruitmentDeadlineAt,
        projectVersion: next.projectVersion,
        reopened: true,
      },
    };
  }

  return {
    createProject,
    listProjects,
    getProject,
    updateProject,
    deleteProject,
    closeRecruitment,
    cancelProject,
    listMyProjects,
    reopenRecruitment,
  };
}
