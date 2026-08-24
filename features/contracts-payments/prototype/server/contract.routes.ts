import { Router } from "express";
import {
  acceptAgreementHandler,
  approveDeliveryHandler,
  confirmPaymentHandler,
  proposeAgreementHandler,
  rejectAgreementHandler,
  requestDeliveryHandler,
  signContractHandler,
} from "./contract.controller";

export const contractRouter = Router();

contractRouter.post("/agreements", proposeAgreementHandler);
contractRouter.post("/agreements/:agreementId/accept", acceptAgreementHandler);
contractRouter.post("/agreements/:agreementId/reject", rejectAgreementHandler);
contractRouter.post("/contracts/:contractId/sign", signContractHandler);
contractRouter.post("/payments/confirm", confirmPaymentHandler);
contractRouter.post("/deliveries", requestDeliveryHandler);
contractRouter.post("/deliveries/:deliveryId/approve", approveDeliveryHandler);
