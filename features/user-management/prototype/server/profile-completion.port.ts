/** PRD D-58 / spec PC-01~PC-08. 서버 내부 조회 계약이며 인증을 대신하지 않는다. */
export type ProfileCompletionStatus = "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE";

export type ProfileCompletion = {
  status: ProfileCompletionStatus;
  completedAt: string | null;
  missingFields: string[];
};

export type ProfileCompletionPort = {
  getProfileCompletion(userId: string): Promise<ProfileCompletion>;
};

export type ProfileMissingField =
  | "CLIENT_COMPANY_NAME"
  | "CLIENT_BUSINESS_FIELD"
  | "CLIENT_BUSINESS_FIELD_ETC"
  | "FREELANCER_PRIMARY_CATEGORY"
  | "FREELANCER_CAREER_YEARS"
  | "FREELANCER_SKILLS";
