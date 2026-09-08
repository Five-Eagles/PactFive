import { http } from '../../../shared/http';
import type {
  ConfirmPaymentResponse,
  CurrentNegotiationOfferResponse,
  GetCancellationResponse,
  GetContractResponse,
  GetDeliveryResponse,
  GetPaymentResponse,
  GetSettlementResponse,
  PreparePaymentResponse,
  PrepareDeliveryUploadResponse,
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

/** AGR-02 재제안. */
export function counterOffer(
  projectId: string,
  offerId: string,
  amount: number,
  expectedRound: number,
): Promise<CurrentNegotiationOfferResponse> {
  return http.post<CurrentNegotiationOfferResponse>(
    `/v1/projects/${projectId}/negotiation-offers/${offerId}/counter`,
    { amount, currency: 'KRW', expectedRound },
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

export function fetchSettlement(paymentId: string): Promise<GetSettlementResponse> {
  return http.get<GetSettlementResponse>(`/v1/payments/${paymentId}/settlement`);
}

export function confirmPayment(input: {
  orderId: string;
  amount: number;
  paymentKey: string;
}): Promise<ConfirmPaymentResponse> {
  return http.post<ConfirmPaymentResponse>('/v1/payments/confirm', input);
}

export function fetchCancellation(projectId: string): Promise<GetCancellationResponse> {
  return http.get<GetCancellationResponse>(`/v1/projects/${projectId}/cancellation`);
}

export function fetchDelivery(contractId: string): Promise<GetDeliveryResponse> {
  return http.get<GetDeliveryResponse>(`/v1/contracts/${contractId}/delivery`);
}

export function prepareDeliveryUpload(
  contractId: string,
  input: { fileName: string; contentType: string; size: number; sha256: string },
): Promise<PrepareDeliveryUploadResponse> {
  return http.post<PrepareDeliveryUploadResponse>(
    `/v1/contracts/${contractId}/deliveries/upload-prepare`,
    input,
  );
}

/** `Idempotency-Key`는 매 제출마다 새로 만들어 호출자가 넣는다(api-contract.md 규칙 23). */
export function requestDelivery(
  contractId: string,
  input: { objectKey: string; uploadId: string; message: string },
  idempotencyKey: string,
): Promise<GetDeliveryResponse> {
  return http.post<GetDeliveryResponse>(
    `/v1/contracts/${contractId}/deliveries/request`,
    input,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
}

export function approveDelivery(
  contractId: string,
  idempotencyKey: string,
): Promise<GetDeliveryResponse> {
  return http.post<GetDeliveryResponse>(
    `/v1/contracts/${contractId}/deliveries/approve`,
    {},
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
}
