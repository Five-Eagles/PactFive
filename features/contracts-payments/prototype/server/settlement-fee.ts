export const DEFAULT_PLATFORM_FEE_RATE_BPS = 1000;
export const DEFAULT_FEE_POLICY_VERSION = "fee-policy-v1";

export type SettlementAmountSnapshot = {
  platformFeeAmount: number;
  settlementAmount: number;
};

/** 플랫폼 수수료는 정수 원 버림이다. 과거 결제는 다시 나누지 않는다. */
export function splitSettlementAmounts(
  paymentAmount: number,
  platformFeeRateBps: number = DEFAULT_PLATFORM_FEE_RATE_BPS,
): SettlementAmountSnapshot {
  const platformFeeAmount = Math.floor((paymentAmount * platformFeeRateBps) / 10_000);
  return { platformFeeAmount, settlementAmount: paymentAmount - platformFeeAmount };
}
