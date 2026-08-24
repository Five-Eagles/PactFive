import type { Request, Response } from "express";
import * as contractService from "./contract.service";
import { TossPaymentsAdapter } from "./toss-payments.adapter";
import type { ConfirmPaymentInput, ProposeAgreementInput, RequestDeliveryInput, SignContractInput } from "./contract.types";

// 컨트롤러는 payment.port.ts의 인터페이스 타입만 참조한다. 구체 어댑터 연결은 앱 조립 지점에서
// 하는 것이 원칙이지만(ADR-0009), 이 prototype에는 조립 지점(app.ts)이 없으므로 여기서 직접
// 인스턴스화한다 — 팀장 통합 시 composition root로 옮겨진다.
const paymentGateway = new TossPaymentsAdapter();

function handleError(err: unknown, res: Response): void {
  if (err instanceof contractService.NotFoundError) {
    res.status(404).json({ message: err.message });
    return;
  }
  if (err instanceof contractService.ForbiddenError) {
    res.status(403).json({ message: err.message });
    return;
  }
  if (err instanceof contractService.ConflictError) {
    res.status(409).json({ message: err.message });
    return;
  }
  res.status(500).json({ message: "예상하지 못한 오류입니다" });
}

export async function proposeAgreementHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as ProposeAgreementInput;
  try {
    const agreement = await contractService.proposeAgreement(input);
    res.status(201).json(agreement);
  } catch (err) {
    handleError(err, res);
  }
}

export async function acceptAgreementHandler(req: Request, res: Response): Promise<void> {
  const { agreementId } = req.params;
  const { responderId, projectId, clientId, freelancerId, projectTitle } = req.body;
  try {
    const result = await contractService.acceptAgreement(agreementId, responderId, {
      projectId,
      clientId,
      freelancerId,
      projectTitle,
    });
    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
}

export async function rejectAgreementHandler(req: Request, res: Response): Promise<void> {
  const { agreementId } = req.params;
  const { responderId, projectId } = req.body;
  try {
    const result = await contractService.rejectAgreement(agreementId, responderId, projectId);
    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
}

export async function signContractHandler(req: Request, res: Response): Promise<void> {
  const { contractId } = req.params;
  const input = { ...req.body, contractId } as SignContractInput;
  try {
    const contract = await contractService.signContract(input);
    res.status(200).json(contract);
  } catch (err) {
    handleError(err, res);
  }
}

export async function confirmPaymentHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as ConfirmPaymentInput;
  try {
    const payment = await contractService.confirmPayment(input, paymentGateway);
    res.status(200).json(payment);
  } catch (err) {
    handleError(err, res);
  }
}

export async function requestDeliveryHandler(req: Request, res: Response): Promise<void> {
  const input = req.body as RequestDeliveryInput;
  try {
    const delivery = await contractService.requestDelivery(input);
    res.status(201).json(delivery);
  } catch (err) {
    handleError(err, res);
  }
}

export async function approveDeliveryHandler(req: Request, res: Response): Promise<void> {
  const { deliveryId } = req.params;
  const { contractId } = req.body;
  try {
    const result = await contractService.approveDelivery({ deliveryId }, contractId);
    res.status(200).json(result);
  } catch (err) {
    handleError(err, res);
  }
}
