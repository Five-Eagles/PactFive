/**
 * applications 응답 타입 — app/server/src/features/applications/application.types.ts와
 * 같은 모양을 화면이 필요로 하는 만큼만 옮긴다 (app/web/AGENTS.md "폴더 간 접점" — 서버 폴더를
 * 직접 import하지 않는다).
 *
 * 2026-09-07 PR #83 이식(서버 커밋 6a7278f) — eligibility·단건GET·페이지네이션·outbox를
 * 화면이 쓰는 만큼만 옮겼다. 서버 쪽과 마찬가지로 `PROFILE_INCOMPLETE`/`profileCompletion`
 * 강제는 이번에 빠졌다(user-management에 프로필 포트 없음) — 타입엔 있지만 서버가 절대
 * 채우지 않는다.
 */

export type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type ApplicationRejectionType =
  | 'DIRECT'
  | 'AUTO_OTHER_ACCEPTED'
  | 'AUTO_RECRUITMENT_CLOSED'
  | 'AGREEMENT_DECLINED';
export type ProjectNotice = 'NONE' | 'CANCELED' | 'DELETED';
export type EligibilityBlockedReason =
  | 'ALREADY_APPLIED'
  | 'PROJECT_CANCELED'
  | 'RECRUITMENT_NOT_OPEN'
  | 'DEADLINE_PASSED'
  | 'PROFILE_INCOMPLETE';
export type OperationStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export type CreateApplicationInput = {
  coverLetter: string;
  expectedAmount: number;
  expectedDurationDays: number;
};

export type ApplicationItem = {
  applicationId: string;
  projectId?: string;
  freelancerId?: string;
  coverLetter?: string;
  expectedAmount?: number;
  expectedDurationDays?: number;
  status: ApplicationStatus;
  rejectionType: ApplicationRejectionType | null;
  createdAt: string;
};

export type CreateApplicationResponse = ApplicationItem & { projectId: string; freelancerId: string };

export type ListPageMeta = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type ListProjectApplicationsResponse = ListPageMeta & {
  projectId: string;
  items: ApplicationItem[];
};

export type MyApplicationItem = {
  applicationId: string;
  projectId: string;
  status: ApplicationStatus;
  rejectionType: ApplicationRejectionType | null;
  createdAt: string;
  transactionStatus: string | null;
  projectNotice: ProjectNotice;
};

export type ListMyApplicationsResponse = ListPageMeta & {
  items: MyApplicationItem[];
};

/** 지원 가능 여부(신규) — `profileCompletion`은 서버가 항상 null로 채운다(위 헤더 주석). */
export type EligibilityResponse = {
  projectId: string;
  canApply: boolean;
  blockedReasons: EligibilityBlockedReason[];
  existingApplicationId: string | null;
  profileCompletion: null;
};

export type AcceptedApplicationHandoff = {
  projectId: string;
  acceptedApplicationId: string;
  transactionStatus: 'CONTRACT_PENDING';
};

export type AcceptApplicationResponse = {
  httpStatus: 200 | 202;
  applicationId: string;
  projectId: string;
  status: 'ACCEPTED';
  decision: 'ACCEPTED';
  decidedAt: string;
  operationId: string;
  postActionsStatus: OperationStatus;
  replayed: boolean;
  handoff: AcceptedApplicationHandoff;
};

export type RejectApplicationResponse = {
  httpStatus: 200 | 202;
  applicationId: string;
  status: 'REJECTED';
  rejectionType: 'DIRECT';
  decision: 'REJECTED';
  decidedAt: string | null;
  operationId: string | null;
  postActionsStatus: OperationStatus | null;
  replayed: boolean;
};
