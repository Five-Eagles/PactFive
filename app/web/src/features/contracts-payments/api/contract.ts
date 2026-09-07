import { http } from '../../../shared/http';
import type {
  ConfirmPaymentResponse,
  CurrentNegotiationOfferResponse,
  GetContractResponse,
  GetPaymentResponse,
  PreparePaymentResponse,
  SignContractResponse,
} from '../contract.types';

/**
 * contracts-payments 공개 API 호출 함수. 전부 `shared/http.ts`를 거친다.
 * 경로는 `features/contracts-payments/api-contract.md` "공개 API 초안" 절이 고정한 값 그대로다.
 */

export function fetchCurrentOffer(projectId: string): Promise<CurrentNegotiationOfferResponse> {
  return http.get<CurrentNegotiationOfferResponse>(
    `/v1/projects/${projectId}/negotiation-offers/current`,
  );
}

export function proposeOffer(
  projectId: string,
  amount: number,
): Promise<CurrentNegotiationOfferResponse> {
  return http.post<CurrentNegotiationOfferResponse>(
    `/v1/projects/${projectId}/negotiation-offers`,
    { amount, currency: 'KRW' },
  );
}

export function acceptOffer(
  projectId: string,
  offerId: string,
  expectedRound: number,
): Promise<CurrentNegotiationOfferResponse> {
  return http.post<CurrentNegotiationOfferResponse>(
    `/v1/projects/${projectId}/negotiation-offers/${offerId}/accept`,
    { expectedRound },
  );
}

export function rejectOffer(
  projectId: string,
  offerId: string,
  reasonCode: string,
): Promise<CurrentNegotiationOfferResponse> {
  return http.post<CurrentNegotiationOfferResponse>(
    `/v1/projects/${projectId}/negotiation-offers/${offerId}/reject`,
    { reasonCode },
  );
}

export function fetchContract(contractId: string): Promise<GetContractResponse> {
  return http.get<GetContractResponse>(`/v1/contracts/${contractId}`);
}

export function signContract(contractId: string): Promise<SignContractResponse> {
  return http.post<SignContractResponse>(`/v1/contracts/${contractId}/sign`);
}

export function preparePayment(contractId: string): Promise<PreparePaymentResponse> {
  return http.post<PreparePaymentResponse>('/v1/payments', { contractId });
}

export function fetchPayment(paymentId: string): Promise<GetPaymentResponse> {
  return http.get<GetPaymentResponse>(`/v1/payments/${paymentId}`);
}

export function confirmPayment(input: {
  orderId: string;
  amount: number;
  paymentKey: string;
}): Promise<ConfirmPaymentResponse> {
  return http.post<ConfirmPaymentResponse>('/v1/payments/confirm', input);
}
