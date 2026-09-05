/**
 * applications 응답 타입 — app/server/src/features/applications/application.types.ts와
 * 같은 모양을 화면이 필요로 하는 만큼만 옮긴다 (app/web/AGENTS.md "폴더 간 접점" — 서버 폴더를
 * 직접 import하지 않는다).
 */

export type ApplicationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type ApplicationRejectionType =
  | 'DIRECT'
  | 'AUTO_OTHER_ACCEPTED'
  | 'AUTO_RECRUITMENT_CLOSED'
  | 'AGREEMENT_DECLINED';

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

export type ListProjectApplicationsResponse = {
  projectId: string;
  items: ApplicationItem[];
};

export type ListMyApplicationsResponse = {
  items: ApplicationItem[];
};

export type AcceptedApplicationHandoff = {
  projectId: string;
  acceptedApplicationId: string;
  transactionStatus: 'CONTRACT_PENDING';
};

export type AcceptApplicationResponse = {
  applicationId: string;
  projectId: string;
  status: 'ACCEPTED';
  handoff: AcceptedApplicationHandoff;
};

export type RejectApplicationResponse = {
  applicationId: string;
  status: 'REJECTED';
  rejectionType: 'DIRECT';
};
