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

/**
 * 예산이 어디서 왔는가. **등록 의뢰인 전용** — 공개 응답에는 없다(CR-0006 결함 2, CR-0007).
 * 의뢰인이 AI 를 썼는지는 프리랜서가 알 필요가 없고, 알면 지원 금액 판단에 영향을 준다.
 */
export type BudgetSource = 'CLIENT_INPUT' | 'AI_ANALYSIS';

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

/*
 * 북마크 여부는 여기에 없다 (CR-0008, 2026-09-03 반영).
 *
 * 채우려면 project-management 서비스가 engagement 를 불러야 하는데, 그것은 담당 경계를
 * 넘는다(app/web/AGENTS.md "폴더 간 접점"과 같은 원칙이 서버에도 적용된다). 화면은
 * engagement 의 `GET /api/v1/bookmarks/ids` 로 대조한다 — `features/engagement/useBookmark.ts`
 * 의 `useBookmarkIds`, 연결은 `App.tsx` 의 `renderBookmark` 슬롯이 한다.
 */
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
  acceptedApplicationId: string | null;
  pendingApplicationCount: number;
  recruitmentClosedAt: string | null;
  canceledAt: string | null;
  projectVersion: number;
  /** 서버가 계산한 잠금 결과. 화면이 다시 계산하지 않는다 (규칙 13·15) */
  editableFields: string[];
  availableActions: ProjectAction[];
  /** 예산 출처. 등록 시 CLIENT_INPUT, AI 분석 연결 시 AI_ANALYSIS 로 서버가 채운다 (CR-0006 결함 2) */
  budgetSource: BudgetSource;
  budgetSourceAt: string;
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
  Pick<
    CreateProjectRequest,
    | 'title'
    | 'description'
    | 'category'
    | 'recruitmentStartAt'
    | 'recruitmentDeadlineAt'
    | 'budgetAmount'
    | 'skillIds'
  >
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

/** PRD v6.6 §8.2 기술 스택 32종 (2026-10-01, ADR-0020 초안). 서버 in-memory-external.adapter.ts 와 같은 목록. */
export const SKILL_GROUPS = [
  { value: 'FRONTEND', label: '프론트엔드' },
  { value: 'BACKEND', label: '백엔드' },
  { value: 'MOBILE', label: '모바일' },
  { value: 'DATA_INFRA', label: '데이터·인프라' },
  { value: 'DESIGN', label: '디자인' },
  { value: 'MARKETING', label: '마케팅' },
  { value: 'PLANNING', label: '기획' },
  { value: 'ETC', label: '기타' },
] as const;

export const SKILL_OPTIONS = [
  { value: 'HTML_CSS', label: 'HTML/CSS', group: 'FRONTEND' },
  { value: 'JAVASCRIPT', label: 'JavaScript', group: 'FRONTEND' },
  { value: 'TYPESCRIPT', label: 'TypeScript', group: 'FRONTEND' },
  { value: 'REACT', label: 'React', group: 'FRONTEND' },
  { value: 'VUE', label: 'Vue', group: 'FRONTEND' },
  { value: 'FRONTEND_ETC', label: '프론트엔드 기타', group: 'FRONTEND' },
  { value: 'NODEJS', label: 'Node.js', group: 'BACKEND' },
  { value: 'JAVA', label: 'Java', group: 'BACKEND' },
  { value: 'PYTHON', label: 'Python', group: 'BACKEND' },
  { value: 'PHP', label: 'PHP', group: 'BACKEND' },
  { value: 'GO', label: 'Go', group: 'BACKEND' },
  { value: 'BACKEND_ETC', label: '백엔드 기타', group: 'BACKEND' },
  { value: 'IOS', label: 'iOS', group: 'MOBILE' },
  { value: 'ANDROID', label: 'Android', group: 'MOBILE' },
  { value: 'CROSS_PLATFORM', label: '크로스플랫폼', group: 'MOBILE' },
  { value: 'SQL', label: 'SQL', group: 'DATA_INFRA' },
  { value: 'NOSQL', label: 'NoSQL', group: 'DATA_INFRA' },
  { value: 'CLOUD', label: '클라우드', group: 'DATA_INFRA' },
  { value: 'DEVOPS', label: 'DevOps', group: 'DATA_INFRA' },
  { value: 'DATA_ANALYSIS', label: '데이터 분석', group: 'DATA_INFRA' },
  { value: 'UI_UX_DESIGN', label: 'UI/UX 디자인', group: 'DESIGN' },
  { value: 'GRAPHIC_DESIGN', label: '그래픽 디자인', group: 'DESIGN' },
  { value: 'BRANDING', label: '브랜딩', group: 'DESIGN' },
  { value: 'VIDEO_MOTION', label: '영상/모션', group: 'DESIGN' },
  { value: 'DESIGN_ETC', label: '디자인 기타', group: 'DESIGN' },
  { value: 'PERFORMANCE_MARKETING', label: '퍼포먼스 마케팅', group: 'MARKETING' },
  { value: 'CONTENT_MARKETING', label: '콘텐츠 마케팅', group: 'MARKETING' },
  { value: 'SEO', label: 'SEO', group: 'MARKETING' },
  { value: 'SNS_MARKETING', label: 'SNS 마케팅', group: 'MARKETING' },
  { value: 'SERVICE_PLANNING', label: '서비스 기획', group: 'PLANNING' },
  { value: 'QA_TEST', label: 'QA/테스트', group: 'ETC' },
  { value: 'ETC_SKILL', label: '기타', group: 'ETC' },
] as const;
