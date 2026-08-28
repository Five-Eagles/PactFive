/**
 * project-management 화면이 서버에서 받는 모양.
 *
 * 서버(`app/server/src/features/project-management/project.types.ts`)의 응답 DTO 중
 * **화면이 실제로 쓰는 것만** 옮겼다. 서버 타입을 import 하지 않는다 — app/web 과 app/server 는
 * Vercel 프로젝트가 분리돼 있고 공유 패키지를 두지 않기로 했다 (app/server/AGENTS.md
 * "모노레포 배포 설정" — npm workspaces 미도입).
 *
 * **`transactionStatus` 를 공개 화면 타입에 넣지 않는다** (spec.md 규칙 9).
 * 서버가 등록 의뢰인에게만 보내므로, 의뢰인 전용 타입에만 둔다.
 */

export type RecruitmentStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED';

export type ProjectTransactionStatus =
  | 'NONE'
  | 'CONTRACT_PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELED';

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
  isBookmarked?: boolean;
};

export type PublicProjectDetail = PublicProjectItem & {
  description: string;
  recruitmentStartAt: string | null;
  /** 서버가 판정한다. 화면이 모집 상태로 다시 계산하지 않는다 (규칙 13) */
  canApply?: boolean;
};

export type ProjectAction =
  | 'EDIT'
  | 'CLOSE_RECRUITMENT'
  | 'CANCEL'
  | 'DELETE'
  | 'REOPEN_RECRUITMENT';

export type ClientProjectDetail = PublicProjectDetail & {
  transactionStatus: ProjectTransactionStatus;
  pendingApplicationCount: number;
  recruitmentClosedAt: string | null;
  canceledAt: string | null;
  projectVersion: number;
  /** 서버가 계산한 잠금 결과. 화면이 다시 계산하지 않는다 (규칙 13·15) */
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

export type ClientProjectListResponse = Omit<ProjectListResponse, 'items'> & {
  items: ClientProjectDetail[];
};

export type ProjectListQuery = {
  keyword?: string;
  category?: string;
  skills?: string[];
  minBudget?: number;
  maxBudget?: number;
  recruitmentStatus?: RecruitmentStatus;
  sortBy?: 'latest' | 'deadline' | 'budget';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
};

export type CreateProjectRequest = {
  title: string;
  description: string;
  category: string;
  recruitmentStartAt: string | null;
  recruitmentDeadlineAt: string;
  budgetAmount: number;
  skillIds: string[];
  pricingAnalysisId?: string | null;
};

export type UpdateProjectRequest = Partial<
  Pick<CreateProjectRequest, 'title' | 'description' | 'category' | 'budgetAmount' | 'skillIds'>
>;

export type CloseRecruitmentResponse = {
  projectId: string;
  recruitmentStatus: RecruitmentStatus;
  rejectedApplicationCount: number;
  closedAt: string;
};

export type PostActionResult = 'DONE' | 'NOT_NEEDED' | 'FAILED';

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
  recruitmentStartAt: string;
  recruitmentDeadlineAt: string;
  projectVersion: number;
  reopened: boolean;
};

/** 카테고리·기술 선택지. 정본은 user-management 의 skills 테이블이다 (PRD D-12) */
export const CATEGORY_OPTIONS = [
  { value: 'WEB_DEVELOPMENT', label: '웹 개발' },
  { value: 'MOBILE_APP', label: '모바일 앱' },
  { value: 'DESIGN', label: '디자인' },
  { value: 'DATA_AI', label: '데이터·AI' },
  { value: 'PLANNING', label: '기획' },
  { value: 'MARKETING', label: '마케팅' },
] as const;

export const SKILL_OPTIONS = [
  { value: 'REACT', label: 'React' },
  { value: 'NODEJS', label: 'Node.js' },
  { value: 'SQL', label: 'SQL' },
  { value: 'TYPESCRIPT', label: 'TypeScript' },
  { value: 'FIGMA', label: 'Figma' },
  { value: 'PYTHON', label: 'Python' },
] as const;
