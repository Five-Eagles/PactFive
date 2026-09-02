/**
 * project-management — 도메인 타입 정본
 *
 * 근거: features/project-management/api-contract.md · spec.md
 * 필드명은 docs/domain/erd.md 의 projects 컬럼과 1:1 대응한다 (camelCase 변환).
 *
 * 상태가 두 축이라는 것이 이 도메인의 핵심이다 (spec.md 규칙 46).
 * projects 에 status 라는 단일 필드는 존재하지 않는다.
 */

/* ─────────────── 상태 ─────────────── */

export type RecruitmentStatus = "SCHEDULED" | "OPEN" | "CLOSED";

/**
 * 예산이 어디서 왔는가.
 *
 * 규칙 8 이 AI 분석 금액으로 사용자 입력을 덮어쓰는데, 그 사실을 화면이 알 방법이
 * 없었다 (CR-0006 결함 2). 값을 저장해 등록 의뢰인에게만 내려보낸다.
 */
export type BudgetSource = "CLIENT_INPUT" | "AI_ANALYSIS";

export type ProjectTransactionStatus =
  | "NONE"
  | "CONTRACT_PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELED";

/* ─────────────── 엔티티 ─────────────── */

/** projects 한 행. ERD v1.4 Table projects 와 필드가 1:1 대응한다. */
export type ProjectRecord = {
  projectId: string;
  clientId: string;
  title: string;
  description: string;
  category: string;
  budgetAmount: number;
  /** ERD 추가 요청 중 — projects.budget_source (CR-0007) */
  budgetSource: BudgetSource;
  /** 그 출처가 정해진 시각. AI 분석이면 분석 연결 시각이다 */
  budgetSourceAt: string;
  recruitmentStartAt: string | null;
  recruitmentDeadlineAt: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  /** 누적 지원 수. 표시 전용 — 잠금 판정에 쓰지 않는다 (규칙 15) */
  applicationCount: number;
  /** 대기 중 지원 수. 잠금 판정용. 갱신 주체는 applications (규칙 56) */
  pendingApplicationCount: number;
  recruitmentClosedAt: string | null;
  canceledAt: string | null;
  deadlineNotifiedAt: string | null;
  /** 수락 멱등 판정 근거 (규칙 36) */
  acceptedApplicationId: string | null;
  /** 결제 시작 통보 시각. 있으면 취소 불가 (규칙 27) */
  paymentPendingAt: string | null;
  /** 낙관적 잠금. 상태 축이 실제로 바뀔 때만 +1 (규칙 44) */
  projectVersion: number;
  skillIds: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/* ─────────────── 공개 API DTO ─────────────── */

export type SkillRef = { skillId: string; displayName: string };
export type CategoryRef = { category: string; displayName: string };

export type ClientPublicProfile = {
  userId: string;
  name: string;
  companyName: string | null;
  profileImageUrl: string | null;
  averageRating: number;
  reviewCount: number;
};

/** 목록 카드. transactionStatus 가 없다 — 키 자체를 넣지 않는다 (규칙 9) */
export type PublicProjectItem = {
  projectId: string;
  title: string;
  category: CategoryRef;
  budgetAmount: number;
  recruitmentDeadlineAt: string;
  recruitmentStatus: RecruitmentStatus;
  skills: SkillRef[];
  applicationCount: number;
  client: ClientPublicProfile;
  /*
   * 북마크 여부는 여기에 없다 (2026-09-02 확정).
   *
   * 채우려면 이 서비스가 engagement 를 불러야 하는데, 그것은 담당 경계를 넘는다.
   * 화면이 `GET /api/v1/bookmarks/ids` 로 대조한다 (engagement 규칙 35·36).
   * PRD v6.4 와 어긋나는 부분은 CR-0008 로 요청했다.
   */
};

export type PublicProjectDetail = PublicProjectItem & {
  description: string;
  recruitmentStartAt: string | null;
  canApply?: boolean;
};

export type ProjectAction =
  | "EDIT"
  | "CLOSE_RECRUITMENT"
  | "CANCEL"
  | "DELETE"
  | "REOPEN_RECRUITMENT";

/** 등록 의뢰인 전용. 거래 상태는 여기에만 들어간다 (규칙 9) */
export type ClientProjectDetail = PublicProjectDetail & {
  transactionStatus: ProjectTransactionStatus;
  /**
   * 예산 출처. **공개 응답에는 넣지 않는다** — 의뢰인이 AI 를 썼는지는
   * 프리랜서가 알 필요가 없고, 알면 지원 금액 판단에 영향을 준다.
   */
  budgetSource: BudgetSource;
  budgetSourceAt: string;
  pendingApplicationCount: number;
  recruitmentClosedAt: string | null;
  canceledAt: string | null;
  projectVersion: number;
  /** 서버가 계산한다. 화면이 잠금 규칙을 다시 계산하지 않는다 (규칙 13) */
  editableFields: string[];
  availableActions: ProjectAction[];
};

export type ProjectListResponse = {
  items: PublicProjectItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type CreateProjectInput = {
  title: string;
  description: string;
  category: string;
  recruitmentStartAt: string | null;
  recruitmentDeadlineAt: string;
  budgetAmount: number;
  skillIds: string[];
  /** 있으면 AI 분석을 연결하고 추천 금액으로 덮어쓴다 (규칙 8) */
  pricingAnalysisId?: string | null;
};

export type UpdateProjectInput = Partial<
  Pick<
    CreateProjectInput,
    | "title"
    | "description"
    | "category"
    | "recruitmentStartAt"
    | "recruitmentDeadlineAt"
    | "budgetAmount"
    | "skillIds"
  >
>;

export type ProjectListQuery = {
  keyword?: string;
  category?: string;
  skills?: string[];
  minBudget?: number;
  maxBudget?: number;
  recruitmentStatus?: RecruitmentStatus;
  deadlineBefore?: string;
  sortBy?: "latest" | "deadline" | "budget";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

export type ReopenRecruitmentInput = {
  recruitmentDeadlineAt: string;
  expectedProjectVersion?: number;
};

export type CloseRecruitmentResponse = {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  rejectedApplicationCount: number;
  closedAt: string;
};

/** 후처리 결과 3분할. "할 일이 없었다"와 "실패했다"를 구분한다 (규칙 29) */
export type PostActionResult = "DONE" | "NOT_NEEDED" | "FAILED";

export type CancelProjectResponse = {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  canceledAt: string;
  postActions: {
    applicationRejection: PostActionResult;
    contractInvalidation: PostActionResult;
  };
};

export type ReopenRecruitmentResponse = {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  transactionStatus: ProjectTransactionStatus;
  recruitmentStartAt: string;
  recruitmentDeadlineAt: string;
  projectVersion: number;
  reopened: boolean;
};

/* ─────────────── 오류 ─────────────── */

/** §8.3 오류 코드 중 이 도메인이 쓰는 것 */
export type ProjectErrorCode =
  | "AUTH_REQUIRED"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_FORBIDDEN"
  | "PROJECT_CREATE_ROLE_REQUIRED"
  | "PROJECT_PROFILE_REQUIRED"
  | "PROJECT_EDIT_LOCKED"
  | "PROJECT_EDIT_CLOSED"
  | "PROJECT_DELETE_HAS_APPLICATIONS"
  | "PROJECT_DELETE_IN_TRANSACTION"
  | "PROJECT_CANCEL_AFTER_PAYMENT"
  | "PROJECT_TRANSITION_CONFLICT"
  | "PROJECT_VERSION_CONFLICT"
  | "PROJECT_ALREADY_RESTORED"
  | "PRICING_ANALYSIS_NOT_APPLICABLE"
  | "VALIDATION_ERROR"
  | "DEADLINE_MUST_BE_FUTURE"
  | "DEADLINE_BELOW_MINIMUM"
  | "DEADLINE_EXCEEDS_LIMIT"
  | "DEADLINE_BEFORE_START"
  | "BUDGET_MUST_BE_POSITIVE"
  | "INVALID_CATEGORY"
  | "INVALID_SKILL"
  | "SKILL_REQUIRED"
  | "CUSTOM_SKILL_NOT_ALLOWED";

export type ErrorBody = {
  error: { code: ProjectErrorCode; message: string; details: unknown };
};

/**
 * 4xx 는 이 오류를 throw 한다.
 * contracts-payments 의 DomainContractError 와 같은 형태다 —
 * 통합 시점에 한쪽으로 합칠 수 있게 필드를 맞춰 둔다.
 */
export class ProjectContractError extends Error {
  readonly status: number;
  readonly body: ErrorBody;

  constructor(status: number, code: ProjectErrorCode, message: string, details: unknown = null) {
    super(message);
    this.name = "ProjectContractError";
    this.status = status;
    this.body = { error: { code, message, details } };
  }
}

export function isProjectContractError(e: unknown): e is ProjectContractError {
  return e instanceof ProjectContractError;
}
