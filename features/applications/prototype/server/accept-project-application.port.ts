/** 유동우 C-01 스탠드인. 실 HTTP는 Increment 밖이다. */
export type AcceptProjectApplicationResult = {
  projectId: string;
  acceptedApplicationId: string;
  recruitmentStatus: "CLOSED";
  transactionStatus: "CONTRACT_PENDING";
  alreadyProcessed: boolean;
};

export type AcceptProjectApplicationPort = {
  acceptProjectApplication(
    projectId: string,
    applicationId: string,
  ): Promise<AcceptProjectApplicationResult>;
};
