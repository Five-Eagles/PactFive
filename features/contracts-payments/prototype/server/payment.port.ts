// 외부 벤더(PG) 연동 인터페이스. 컨트롤러·서비스는 이 인터페이스 타입만 참조하고, 벤더별 구현은
// {벤더명}.adapter.ts로 분리한다 (docs/naming-convention.md §6,
// docs/decisions/0009-external-vendor-interface-layer.md, constitution.md 원칙 10).
//
// 도메인 용어로 추상화한다 — 토스페이먼츠 SDK의 함수명을 그대로 베끼지 않는다.

export type ConfirmPaymentRequest = {
  pgOrderId: string;
  pgPaymentKey: string;
  paymentAmount: number;
};

export type ConfirmPaymentResult =
  | { outcome: "APPROVED"; paidAt: string; rawResponse: unknown }
  | { outcome: "FAILED"; failureCode: string; failureMessage: string; rawResponse: unknown };

export interface PaymentGateway {
  confirmPayment(request: ConfirmPaymentRequest): Promise<ConfirmPaymentResult>;
}
