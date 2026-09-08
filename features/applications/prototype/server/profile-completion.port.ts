/** 오민혁 정본. Mock만 COMPLETE/INCOMPLETE/UNAVAILABLE을 명시한다. 기본 COMPLETE 우회 금지. */
export type ProfileCompletionStatus = "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE";

export type ProfileCompletion = {
  status: ProfileCompletionStatus;
  completedAt: string | null;
  missingFields: string[];
};

export type ProfileCompletionPort = {
  getProfileCompletion(userId: string): Promise<ProfileCompletion>;
};
