import { useState } from "react";
import "../../design/_tokens.css";
import "../../design/panel.css";
import "./preview.css";
import { AgreementPanel, type AgreementView } from "./AgreementPanel";
import type { AgreementUiState } from "./agreement.view-model";
import { ContractSignPanel } from "./ContractSignPanel";
import type { ContractUiState } from "./contract.view-model";
import { DeliveryPanel } from "./DeliveryPanel";
import type { DeliveryUiState } from "./delivery.view-model";
import { PaymentPanel } from "./PaymentPanel";
import type { PaymentUiState } from "./payment.view-model";
import { SettlementPanel } from "./SettlementPanel";
import type { SettlementUiState } from "./settlement.view-model";
import { CancellationPanel } from "./CancellationPanel";
import type { CancellationUiState } from "./cancellation.view-model";

export {
  AgreementPanel,
  ContractSignPanel,
  DeliveryPanel,
  PaymentPanel,
  SettlementPanel,
  CancellationPanel,
};

type PreviewScreen =
  | {
      id: "payment";
      label: string;
      slug: string;
      uiState?: PaymentUiState;
      loading?: boolean;
      modal?: "prepare";
      viewerRole?: "CLIENT" | "FREELANCER";
      view?: "keyMissing";
    }
  | {
      id: "sign";
      label: string;
      slug: string;
      uiState?: ContractUiState;
      loading?: boolean;
      modal?: "sign" | "signed";
    }
  | { id: "agreement"; label: string; slug: string; uiState?: AgreementUiState; view?: AgreementView; amountError?: boolean; viewerRole?: "CLIENT" | "FREELANCER"; offerRound?: number }
  | {
      id: "delivery";
      label: string;
      slug: string;
      uiState?: DeliveryUiState;
      loading?: boolean;
      modal?: "deliver" | "approve" | "download";
    }
  | {
      id: "settlement";
      label: string;
      slug: string;
      uiState?: SettlementUiState;
      loading?: boolean;
      modal?: "help" | "review";
      viewerRole?: "CLIENT" | "FREELANCER";
    }
  | {
      id: "cancellation";
      label: string;
      slug: string;
      uiState?: CancellationUiState;
      loading?: boolean;
      modal?: "confirm" | "payment" | "followup";
    };

const PREVIEW_SCREENS: PreviewScreen[] = [
  { id: "payment", label: "결제 · 가능", slug: "pay-ready", uiState: "PAYMENT_AVAILABLE" },
  { id: "payment", label: "결제 · M01", slug: "pay-m01", uiState: "PAYMENT_AVAILABLE", modal: "prepare" },
  { id: "payment", label: "결제 · 창 준비", slug: "pay-opening", uiState: "WINDOW_OPENING" },
  { id: "payment", label: "결제 · 확인 중", slug: "pay-confirming", uiState: "PAYMENT_CONFIRMING" },
  { id: "payment", label: "결제 · 완료", slug: "pay-paid", uiState: "PAID" },
  { id: "payment", label: "결제 · 동기화", slug: "pay-syncing", uiState: "PAID_SYNCING" },
  { id: "payment", label: "결제 · 실패", slug: "pay-failed", uiState: "FAILED_RETRYABLE" },
  { id: "payment", label: "결제 · 취소됨", slug: "pay-canceled", uiState: "PROJECT_CANCELED" },
  { id: "payment", label: "결제 · 미체결", slug: "pay-unsigned", uiState: "CONTRACT_NOT_SIGNED" },
  { id: "payment", label: "결제 · 프리랜서", slug: "pay-freelancer", uiState: "PAYMENT_AVAILABLE", viewerRole: "FREELANCER" },
  { id: "payment", label: "결제 · 불러오는 중", slug: "pay-loading", loading: true },
  { id: "payment", label: "결제 · 403", slug: "pay-403", uiState: "FORBIDDEN" },
  { id: "payment", label: "결제 · 키 없음", slug: "pay-key", view: "keyMissing" },
  { id: "sign", label: "서명 · 미서명", slug: "ctr-ready", uiState: "READY_TO_SIGN" },
  { id: "sign", label: "서명 · M01", slug: "ctr-m01", uiState: "READY_TO_SIGN", modal: "sign" },
  { id: "sign", label: "서명 · 상대 대기", slug: "ctr-wait", uiState: "WAITING_COUNTERPART" },
  { id: "sign", label: "서명 · 결제 필요", slug: "ctr-pay", uiState: "SIGNED_PAYMENT_REQUIRED" },
  { id: "sign", label: "서명 · 결제 대기", slug: "ctr-paywait", uiState: "SIGNED_PAYMENT_WAIT" },
  { id: "sign", label: "서명 · M02", slug: "ctr-m02", uiState: "SIGNED_PAYMENT_REQUIRED", modal: "signed" },
  { id: "sign", label: "서명 · 작업 중", slug: "ctr-progress", uiState: "IN_PROGRESS" },
  { id: "sign", label: "서명 · 불러오는 중", slug: "ctr-loading", loading: true },
  { id: "sign", label: "서명 · 실패", slug: "ctr-fail", uiState: "LOAD_FAILED" },
  { id: "sign", label: "서명 · 409", slug: "ctr-stale", uiState: "STALE" },
  { id: "sign", label: "서명 · 취소", slug: "ctr-canceled", uiState: "PROJECT_CANCELED" },
  { id: "sign", label: "서명 · 403", slug: "ctr-403", uiState: "FORBIDDEN" },
  { id: "sign", label: "서명 · 404", slug: "ctr-404", uiState: "NOT_FOUND" },
  { id: "agreement", label: "합의 · 제안 전", slug: "agr-create", uiState: "NOT_PROPOSED" },
  { id: "agreement", label: "합의 · 입력 오류", slug: "agr-error", uiState: "NOT_PROPOSED", amountError: true },
  { id: "agreement", label: "합의 · 응답 대기", slug: "agr-wait", uiState: "WAITING_RESPONSE" },
  { id: "agreement", label: "합의 · 프리랜서 응답", slug: "agr-respond", uiState: "ACTION_REQUIRED" },
  { id: "agreement", label: "합의 · 재제안", slug: "agr-counter", uiState: "ACTION_REQUIRED" },
  { id: "agreement", label: "합의 · 의뢰인 응답", slug: "agr-client-action", uiState: "ACTION_REQUIRED", viewerRole: "CLIENT", offerRound: 2 },
  { id: "agreement", label: "합의 · 완료", slug: "agr-done", uiState: "AGREED" },
  { id: "agreement", label: "합의 · 거절 재개", slug: "agr-reopen", uiState: "REJECTED_REOPENED" },
  { id: "agreement", label: "합의 · 거절 종료", slug: "agr-closed", uiState: "REJECTED_CLOSED" },
  { id: "agreement", label: "합의 · 불러오는 중", slug: "agr-loading", view: "loading" },
  { id: "agreement", label: "합의 · 실패", slug: "agr-fail", uiState: "LOAD_FAILED" },
  { id: "agreement", label: "합의 · 409", slug: "agr-stale", uiState: "STALE" },
  { id: "agreement", label: "합의 · 취소", slug: "agr-canceled", uiState: "PROJECT_CANCELED" },
  { id: "agreement", label: "합의 · 403", slug: "agr-403", uiState: "FORBIDDEN" },
  { id: "agreement", label: "합의 · 404", slug: "agr-404", uiState: "NOT_FOUND" },
  { id: "delivery", label: "납품 · 납품 전", slug: "dlv-ready", uiState: "READY_TO_DELIVER" },
  { id: "delivery", label: "납품 · M01", slug: "dlv-m01", uiState: "READY_TO_DELIVER", modal: "deliver" },
  { id: "delivery", label: "납품 · 작업 중", slug: "dlv-work", uiState: "WORK_IN_PROGRESS" },
  { id: "delivery", label: "납품 · 검토 대기", slug: "dlv-wait", uiState: "WAITING_REVIEW" },
  { id: "delivery", label: "납품 · 의뢰인 검토", slug: "dlv-action", uiState: "ACTION_REQUIRED" },
  { id: "delivery", label: "납품 · M03", slug: "dlv-m03", uiState: "ACTION_REQUIRED", modal: "download" },
  { id: "delivery", label: "납품 · M02", slug: "dlv-m02", uiState: "ACTION_REQUIRED", modal: "approve" },
  { id: "delivery", label: "납품 · 정산 대기", slug: "dlv-settle", uiState: "SETTLEMENT_PENDING" },
  { id: "delivery", label: "납품 · 완료", slug: "dlv-done", uiState: "COMPLETED" },
  { id: "delivery", label: "납품 · 불러오는 중", slug: "dlv-loading", loading: true },
  { id: "delivery", label: "납품 · 실패", slug: "dlv-fail", uiState: "LOAD_FAILED" },
  { id: "delivery", label: "납품 · 409", slug: "dlv-stale", uiState: "STALE" },
  { id: "delivery", label: "납품 · 취소", slug: "dlv-canceled", uiState: "PROJECT_CANCELED" },
  { id: "delivery", label: "납품 · 403", slug: "dlv-403", uiState: "FORBIDDEN" },
  { id: "delivery", label: "납품 · 404", slug: "dlv-404", uiState: "NOT_FOUND" },
  { id: "settlement", label: "정산 · 결제 전", slug: "set-waitpay", uiState: "WAITING_PAYMENT" },
  { id: "settlement", label: "정산 · 납품 대기", slug: "set-waitdlv", uiState: "WAITING_DELIVERY" },
  { id: "settlement", label: "정산 · 승인 대기", slug: "set-waitappr", uiState: "WAITING_APPROVAL" },
  { id: "settlement", label: "정산 · 가능", slug: "set-eligible", uiState: "ELIGIBLE" },
  { id: "settlement", label: "정산 · 동기화", slug: "set-syncing", uiState: "COMPLETION_SYNCING" },
  { id: "settlement", label: "정산 · 완료", slug: "set-released", uiState: "RELEASED" },
  { id: "settlement", label: "정산 · 금액 확인", slug: "set-review", uiState: "REVIEW_REQUIRED" },
  { id: "settlement", label: "정산 · M01", slug: "set-m01", uiState: "WAITING_DELIVERY", modal: "help" },
  { id: "settlement", label: "정산 · 의뢰인", slug: "set-client", uiState: "ELIGIBLE", viewerRole: "CLIENT" },
  { id: "settlement", label: "정산 · 프리랜서", slug: "set-freelancer", uiState: "ELIGIBLE", viewerRole: "FREELANCER" },
  { id: "settlement", label: "정산 · 불러오는 중", slug: "set-loading", loading: true },
  { id: "settlement", label: "정산 · 403", slug: "set-403", uiState: "FORBIDDEN" },
  { id: "settlement", label: "정산 · 취소", slug: "set-canceled", uiState: "PROJECT_CANCELED" },
  { id: "cancellation", label: "취소 · 가능", slug: "can-available", uiState: "CANCEL_AVAILABLE" },
  { id: "cancellation", label: "취소 · M01", slug: "can-m01", uiState: "CANCEL_AVAILABLE", modal: "confirm" },
  { id: "cancellation", label: "취소 · 처리 중", slug: "can-pending", uiState: "SUBMITTING" },
  { id: "cancellation", label: "취소 · 완료", slug: "can-complete", uiState: "CANCELED_COMPLETE" },
  { id: "cancellation", label: "취소 · 후처리", slug: "can-followup", uiState: "CANCELED_FOLLOWUP_PENDING" },
  { id: "cancellation", label: "취소 · M02", slug: "can-m02", uiState: "PAYMENT_STARTED", modal: "payment" },
  { id: "cancellation", label: "취소 · 진행 중", slug: "can-progress", uiState: "IN_PROGRESS" },
  { id: "cancellation", label: "취소 · 불러오는 중", slug: "can-loading", loading: true },
  { id: "cancellation", label: "취소 · 403", slug: "can-403", uiState: "FORBIDDEN" },
  { id: "cancellation", label: "취소 · 이미 취소", slug: "can-canceled", uiState: "ALREADY_CANCELED" },
];

function initialScreenIndex(): number {
  if (typeof window === "undefined") return 0;
  const wanted = new URLSearchParams(window.location.search).get("screen");
  if (!wanted) return 0;
  const match = PREVIEW_SCREENS.findIndex((opt) => opt.slug === wanted);
  return match >= 0 ? match : 0;
}

/** preview:dev. 기본은 결제 패널. 합의·납품은 상태 전환으로 본다. 앱 셸은 없다. */
export default function PaymentsPreview() {
  const [screenIndex, setScreenIndex] = useState(initialScreenIndex);
  const screen = PREVIEW_SCREENS[screenIndex] ?? PREVIEW_SCREENS[0];

  return (
    <div className="preview-root">
      <div className="preview-switcher" role="toolbar" aria-label="contracts-payments 화면">
        {PREVIEW_SCREENS.map((opt, index) => (
          <button
            key={`${opt.label}-${index}`}
            type="button"
            aria-pressed={screenIndex === index}
            onClick={() => setScreenIndex(index)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {screen.id === "payment" ? (
        <PaymentPanel
          key={screen.label}
          uiState={screen.uiState}
          loading={screen.loading}
          initialModal={screen.modal}
          viewerRole={screen.viewerRole}
          view={screen.view}
        />
      ) : null}
      {screen.id === "sign" ? (
        <ContractSignPanel
          key={screen.label}
          uiState={screen.uiState}
          loading={screen.loading}
          initialModal={screen.modal}
        />
      ) : null}
      {screen.id === "agreement" ? (
        <AgreementPanel
          key={screen.label}
          uiState={screen.uiState}
          view={screen.view}
          amountError={screen.amountError}
          viewerRole={screen.viewerRole}
          offerRound={screen.offerRound}
        />
      ) : null}
      {screen.id === "delivery" ? (
        <DeliveryPanel
          key={screen.label}
          uiState={screen.uiState}
          loading={screen.loading}
          initialModal={screen.modal}
        />
      ) : null}
      {screen.id === "settlement" ? (
        <SettlementPanel
          key={screen.label}
          uiState={screen.uiState}
          loading={screen.loading}
          initialModal={screen.modal}
          viewerRole={screen.viewerRole}
        />
      ) : null}
      {screen.id === "cancellation" ? (
        <CancellationPanel
          key={screen.label}
          uiState={screen.uiState}
          loading={screen.loading}
          initialModal={screen.modal}
        />
      ) : null}
    </div>
  );
}
