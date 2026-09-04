import { useState, type ReactNode } from "react";
import type { GetPaymentResponse } from "../server/public-api.types";
import {
  toPaymentViewModel,
  type PaymentClientOverlay,
  type PaymentLoadError,
  type PaymentPageViewModel,
  type PaymentUiState,
  type PaymentViewerRole,
  type PaymentViewerSession,
} from "./payment.view-model";
import { Badge, Button, Money, Notice, type FeedbackTone } from "./ui";

/** run.tsx 규칙 9가 아직 이 이름을 쓴다. 내부는 uiState로 변환한다. */
export type PaymentView = "checkout" | "keyMissing" | "pending" | "paid" | "failed";

export type PaymentPanelProps = {
  vm?: PaymentPageViewModel;
  uiState?: PaymentUiState;
  loading?: boolean;
  view?: PaymentView;
  amount?: number;
  platformFeeAmount?: number;
  settlementAmount?: number;
  projectTitle?: string;
  viewerRole?: PaymentViewerRole;
  initialModal?: "prepare";
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";
const DEFAULT_AMOUNT = 100_000;
const DEFAULT_FEE = 10_000;
const DEFAULT_SETTLEMENT = 90_000;

const LOAD_ERROR_STATES: ReadonlySet<PaymentUiState> = new Set([
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

function uiStateFromView(view: PaymentView): PaymentUiState {
  switch (view) {
    case "keyMissing":
      return "KEY_MISSING";
    case "pending":
      return "PAYMENT_CONFIRMING";
    case "paid":
      return "PAID";
    case "failed":
      return "FAILED_RETRYABLE";
    default:
      return "PAYMENT_AVAILABLE";
  }
}

function overlayFromView(view: PaymentView): PaymentClientOverlay | null {
  return view === "keyMissing" ? "KEY_MISSING" : null;
}

/** 종료·확인 중에서는 결제 시작을 닫는다. */
function mutationPermissions(vm: PaymentPageViewModel): PaymentPageViewModel["permissions"] {
  if (
    LOAD_ERROR_STATES.has(vm.uiState) ||
    vm.uiState === "PROJECT_CANCELED" ||
    vm.uiState === "PAID" ||
    vm.uiState === "PAID_SYNCING" ||
    vm.uiState === "ALREADY_PAID" ||
    vm.uiState === "PAYMENT_CONFIRMING" ||
    vm.uiState === "CONFIRMING" ||
    vm.uiState === "KEY_MISSING" ||
    vm.uiState === "TEMPORARILY_UNAVAILABLE" ||
    vm.uiState === "CONTRACT_NOT_SIGNED"
  ) {
    return { canStart: false, canRetry: false };
  }
  if (vm.uiState === "WINDOW_OPENING") return { canStart: false, canRetry: false };
  return vm.permissions;
}

/** 결제 페이지. ViewModel의 uiState로만 분기한다. */
export function PaymentPanel({
  vm,
  uiState,
  loading = false,
  view = "checkout",
  amount = DEFAULT_AMOUNT,
  platformFeeAmount = DEFAULT_FEE,
  settlementAmount = DEFAULT_SETTLEMENT,
  projectTitle = DEFAULT_TITLE,
  viewerRole,
  initialModal,
}: PaymentPanelProps) {
  const isLoading = loading;
  const source =
    vm ??
    fixtureViewModel(uiState ?? uiStateFromView(view), {
      projectTitle,
      amount,
      platformFeeAmount,
      settlementAmount,
      overlay: overlayFromView(view),
      viewerRole,
    });
  const resolved = { ...source, permissions: mutationPermissions(source) };
  const [prepareOpen, setPrepareOpen] = useState(initialModal === "prepare");
  const [opening, setOpening] = useState(resolved.uiState === "WINDOW_OPENING");

  if (isLoading) return <PaymentLoadingPage />;

  const canMutate = resolved.permissions.canStart || resolved.permissions.canRetry;
  const showFixedCta = canMutate;
  const pageClass = showFixedCta ? "payment-page has-fixed-cta" : "payment-page";

  return (
    <>
      <article
        className={pageClass}
        aria-busy={opening || resolved.uiState === "PAYMENT_CONFIRMING" || resolved.uiState === "CONFIRMING"}
      >
        <PaymentPageHead uiState={resolved.uiState} />
        <p className="sandbox-banner">
          <Badge tone="info" label="Sandbox 테스트 결제" />
          <span>실제 금액이 청구되지 않습니다.</span>
        </p>
        <div className="payment-grid">
          <aside className="payment-side">
            <PaymentSummary vm={resolved} opening={opening} onStart={() => setPrepareOpen(true)} />
          </aside>
          <div className="payment-main">
            <PaymentMain vm={resolved} />
          </div>
          {showFixedCta ? (
            <div className="payment-cta-bar btn-row">
              <PaymentCta vm={resolved} opening={opening} onStart={() => setPrepareOpen(true)} />
            </div>
          ) : null}
        </div>
      </article>
      {canMutate ? (
        <PrepareDialog
          open={prepareOpen}
          opening={opening}
          title={resolved.projectTitle || projectTitle}
          amount={resolved.amount || amount}
          onClose={() => setPrepareOpen(false)}
          onConfirm={() => {
            setOpening(true);
            setPrepareOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function fixtureViewModel(
  uiState: PaymentUiState,
  input: {
    projectTitle: string;
    amount: number;
    platformFeeAmount: number;
    settlementAmount: number;
    overlay: PaymentClientOverlay | null;
    viewerRole?: PaymentViewerRole;
  },
): PaymentPageViewModel {
  const viewerRole: PaymentViewerRole = input.viewerRole ?? roleFor();
  const session: PaymentViewerSession = {
    actorUserId: viewerRole === "CLIENT" ? "usr_client" : "usr_freelancer",
    clientId: "usr_client",
  };
  const loadError = LOAD_ERROR_STATES.has(uiState) ? (uiState as PaymentLoadError) : null;
  const overlay =
    input.overlay ??
    (uiState === "WINDOW_OPENING" ||
    uiState === "CONFIRMING" ||
    uiState === "USER_CANCELED" ||
    uiState === "KEY_MISSING" ||
    uiState === "TEMPORARILY_UNAVAILABLE" ||
    uiState === "ALREADY_PAID"
      ? uiState
      : null);
  return toPaymentViewModel(
    fixtureDto(uiState, input),
    session,
    loadError,
    overlay,
    uiState !== "CONTRACT_NOT_SIGNED",
  );
}

function roleFor(): PaymentViewerRole {
  return "CLIENT";
}

function fixtureDto(
  uiState: PaymentUiState,
  input: {
    projectTitle: string;
    amount: number;
    platformFeeAmount: number;
    settlementAmount: number;
  },
): GetPaymentResponse | null {
  if (LOAD_ERROR_STATES.has(uiState) || uiState === "CONTRACT_NOT_SIGNED") return null;
  const base: GetPaymentResponse = {
    paymentId: "pay_preview",
    contractId: "ctr_preview",
    orderId: "ord_preview_01",
    amount: input.amount,
    currency: "KRW",
    platformFeeAmount: input.platformFeeAmount,
    settlementAmount: input.settlementAmount,
    status: "READY",
    projectTitle: input.projectTitle,
    projectTransactionStatus: "CONTRACT_PENDING",
    environment: "SANDBOX",
  };
  if (uiState === "PROJECT_CANCELED") {
    return { ...base, projectTransactionStatus: "CANCELED" };
  }
  if (uiState === "PAYMENT_CONFIRMING" || uiState === "CONFIRMING") {
    return { ...base, status: "PENDING" };
  }
  if (uiState === "PAID" || uiState === "ALREADY_PAID") {
    return { ...base, status: "PAID", projectTransactionStatus: "IN_PROGRESS" };
  }
  if (uiState === "PAID_SYNCING") {
    return { ...base, status: "PAID", projectTransactionStatus: "CONTRACT_PENDING" };
  }
  if (uiState === "FAILED_RETRYABLE") {
    return { ...base, status: "FAILED" };
  }
  return base;
}

function PaymentPageHead({ uiState }: { uiState: PaymentUiState }) {
  const badge = badgeFor(uiState);
  return (
    <header className="payment-page-head">
      <div className="payment-page-head-copy">
        <h1 className="page-title">계약 결제</h1>
        <p className="payment-page-links">
          <a href="#contract">계약서</a>
        </p>
      </div>
      {badge ? <Badge tone={badge.tone} label={badge.label} /> : null}
    </header>
  );
}

function badgeFor(uiState: PaymentUiState): { tone: FeedbackTone; label: string } | null {
  switch (uiState) {
    case "PAYMENT_AVAILABLE":
    case "WINDOW_OPENING":
      return { tone: "neutral", label: "결제 전" };
    case "PAYMENT_CONFIRMING":
    case "CONFIRMING":
    case "PAID_SYNCING":
      return { tone: "warning", label: "처리 중" };
    case "PAID":
    case "ALREADY_PAID":
      return { tone: "success", label: "Sandbox 완료" };
    case "FAILED_RETRYABLE":
      return { tone: "danger", label: "결제 실패" };
    case "USER_CANCELED":
      return { tone: "warning", label: "결제 전" };
    case "PROJECT_CANCELED":
      return { tone: "danger", label: "결제 불가" };
    case "KEY_MISSING":
    case "TEMPORARILY_UNAVAILABLE":
      return { tone: "warning", label: "연동 준비 중" };
    default:
      return null;
  }
}

function PaymentLoadingPage() {
  return (
    <article className="payment-page" aria-busy="true">
      <PaymentPageHead uiState="PAYMENT_AVAILABLE" />
      <p className="sandbox-banner">
        <Badge tone="info" label="Sandbox 테스트 결제" />
        <span>실제 금액이 청구되지 않습니다.</span>
      </p>
      <div className="payment-grid">
        <aside className="payment-side">
          <section className="panel">
            <p className="helper">결제 정보를 불러오는 중입니다.</p>
            <div className="skeleton" />
          </section>
        </aside>
        <div className="payment-main">
          <section className="panel">
            <div className="skeleton" />
            <div className="skeleton" />
          </section>
        </div>
      </div>
    </article>
  );
}

function PaymentSummary({
  vm,
  opening,
  onStart,
}: {
  vm: PaymentPageViewModel;
  opening: boolean;
  onStart: () => void;
}) {
  const hideMoney =
    LOAD_ERROR_STATES.has(vm.uiState) ||
    vm.uiState === "CONTRACT_NOT_SIGNED" ||
    vm.uiState === "KEY_MISSING";
  return (
    <section className="panel">
      <h2 className="agreement-card-title">결제 요약</h2>
      <p className="caption">Sandbox 테스트 결제</p>
      {hideMoney ? null : (
        <p className="offer-amount">
          <Money amount={vm.amount} />
        </p>
      )}
      <PaymentCta vm={vm} opening={opening} onStart={onStart} />
    </section>
  );
}

function PaymentCta({
  vm,
  opening,
  onStart,
}: {
  vm: PaymentPageViewModel;
  opening: boolean;
  onStart: () => void;
}) {
  if (vm.uiState === "KEY_MISSING" || vm.uiState === "TEMPORARILY_UNAVAILABLE") {
    return (
      <div className="btn-row">
        <Button variant="secondary">다시 시도</Button>
      </div>
    );
  }
  if (vm.uiState === "LOAD_FAILED") {
    return (
      <div className="btn-row">
        <Button variant="primary">다시 시도</Button>
      </div>
    );
  }
  if (vm.uiState === "STALE") {
    return (
      <div className="btn-row">
        <Button variant="primary">다시 불러오기</Button>
      </div>
    );
  }
  if (vm.uiState === "CONTRACT_NOT_SIGNED") {
    return (
      <div className="btn-row">
        <Button variant="primary">계약서 확인</Button>
      </div>
    );
  }
  if (
    vm.uiState === "PAID" ||
    vm.uiState === "ALREADY_PAID" ||
    vm.uiState === "PROJECT_CANCELED" ||
    vm.uiState === "FORBIDDEN" ||
    vm.uiState === "NOT_FOUND"
  ) {
    return (
      <div className="btn-row">
        <Button variant="primary">내 프로젝트</Button>
      </div>
    );
  }
  if (vm.uiState === "PAYMENT_CONFIRMING" || vm.uiState === "CONFIRMING" || vm.uiState === "PAID_SYNCING") {
    return (
      <div className="btn-row">
        <Button variant="primary" busy>
          상태 확인
        </Button>
      </div>
    );
  }
  if (vm.uiState === "WINDOW_OPENING" || opening) {
    return (
      <div className="btn-row">
        <Button variant="primary" busy>
          결제창 준비 중
        </Button>
      </div>
    );
  }
  if (vm.permissions.canRetry) {
    return (
      <div className="btn-row">
        <Button variant="primary" onClick={onStart}>
          다시 결제
        </Button>
      </div>
    );
  }
  if (vm.permissions.canStart) {
    return (
      <div className="btn-row">
        <Button variant="primary" busy={opening} onClick={onStart}>
          {opening ? "결제창 준비 중" : "테스트 결제 진행"}
        </Button>
      </div>
    );
  }
  return null;
}

function PaymentMain({ vm }: { vm: PaymentPageViewModel }) {
  const hideFacts =
    LOAD_ERROR_STATES.has(vm.uiState) ||
    vm.uiState === "CONTRACT_NOT_SIGNED" ||
    vm.uiState === "KEY_MISSING";
  return (
    <section className="panel" id="contract">
      {vm.viewerRole === "FREELANCER" && vm.uiState === "PAYMENT_AVAILABLE" ? (
        <p className="status-copy" role="status">
          결제 대기. 의뢰인 결제가 끝나면 작업이 시작됩니다.
        </p>
      ) : (
        <PaymentStatusBanner uiState={vm.uiState} />
      )}
      {hideFacts ? null : (
        <dl className="facts">
          <dt>프로젝트 제목</dt>
          <dd>{vm.projectTitle}</dd>
          <dt>결제 금액</dt>
          <dd>
            <Money amount={vm.amount} />
          </dd>
          <dt>플랫폼 수수료</dt>
          <dd>
            <Money amount={vm.platformFeeAmount} />
          </dd>
          <dt>정산액</dt>
          <dd>
            <Money amount={vm.settlementAmount} />
          </dd>
        </dl>
      )}
      {hideFacts ? null : (
        <>
          <p className="helper">
            이 금액은 합의에서 확정된 값입니다. 화면에서 바꾸지 않으며 서버가 보낸 숫자를 그대로
            보여 줍니다.
          </p>
          <p className="helper">결제해도 바로 넘어가지 않습니다. 납품 승인 뒤에 정산됩니다.</p>
          <p className="helper">결제창으로 이동합니다. 카드 정보는 PactFive가 저장하지 않습니다.</p>
        </>
      )}
    </section>
  );
}

function PaymentStatusBanner({ uiState }: { uiState: PaymentUiState }): ReactNode {
  switch (uiState) {
    case "KEY_MISSING":
    case "TEMPORARILY_UNAVAILABLE":
      return (
        <>
          <Notice tone="warning">결제 연동 준비 중</Notice>
          <p className="status-copy">지금은 결제를 진행할 수 없습니다. 연동이 끝나면 다시 시도해 주세요.</p>
        </>
      );
    case "LOAD_FAILED":
      return (
        <>
          <Notice tone="danger">결제 정보를 불러오지 못했습니다</Notice>
          <p className="status-copy">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        </>
      );
    case "STALE":
      return (
        <>
          <Notice tone="warning">내용이 바뀌었습니다</Notice>
          <p className="status-copy">최신 결제를 다시 확인한 뒤 이어서 진행하세요.</p>
        </>
      );
    case "FORBIDDEN":
      return (
        <>
          <Notice tone="warning">이 결제를 볼 수 있는 권한이 없습니다</Notice>
          <p className="status-copy">계약 당사자만 결제 금액을 확인할 수 있습니다.</p>
        </>
      );
    case "NOT_FOUND":
      return (
        <>
          <Notice tone="info">결제를 찾을 수 없습니다</Notice>
          <p className="status-copy">주소가 바뀌었거나 결제가 없을 수 있습니다. 계약 화면에서 다시 들어와 주세요.</p>
        </>
      );
    case "PROJECT_CANCELED":
      return (
        <>
          <Notice tone="danger">프로젝트가 취소되었습니다</Notice>
          <p className="status-copy">결제를 진행할 수 없습니다.</p>
        </>
      );
    case "CONTRACT_NOT_SIGNED":
      return (
        <>
          <Notice tone="warning">양측 서명이 필요합니다</Notice>
          <p className="status-copy">계약서에서 서명을 마친 뒤 결제를 진행해 주세요.</p>
        </>
      );
    case "CONFIRMING":
      return (
        <p className="status-copy" role="status">
          결제를 승인하고 있습니다. 완료로 표시하지 않습니다.
        </p>
      );
    case "PAYMENT_CONFIRMING":
      return (
        <p className="status-copy" role="status">
          결제 결과를 확인하고 있습니다. <strong>잠시만 기다려 주세요</strong>.
        </p>
      );
    case "PAID_SYNCING":
      return (
        <p className="status-copy" role="status">
          결제 완료, 작업 시작 처리 중. 새 결제는 만들지 않습니다.
        </p>
      );
    case "PAID":
    case "ALREADY_PAID":
      return (
        <p className="status-copy" role="status">
          Sandbox 결제가 완료되었습니다. 거래가 <strong>진행 중</strong>입니다.
        </p>
      );
    case "FAILED_RETRYABLE":
      return (
        <>
          <Notice tone="danger">결제 실패</Notice>
          <p className="status-copy">실패한 결제는 쓰지 않고, 같은 결제로 다시 시도합니다.</p>
        </>
      );
    case "USER_CANCELED":
      return (
        <p className="status-copy" role="status">
          결제가 진행되지 않았습니다. 다시 결제하거나 계약서로 돌아갈 수 있습니다.
        </p>
      );
    case "WINDOW_OPENING":
      return (
        <p className="status-copy" role="status">
          결제창을 준비하고 있습니다.
        </p>
      );
    default:
      return (
        <p className="status-copy" role="status">
          의뢰인이 결제하면 거래가 <strong>진행 중</strong>으로 바뀝니다.
        </p>
      );
  }
}

function PrepareDialog({
  open,
  opening,
  title,
  amount,
  onClose,
  onConfirm,
}: {
  open: boolean;
  opening: boolean;
  title: string;
  amount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className={open ? "overlay-backdrop open" : "overlay-backdrop"}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="pay-m01-title">
        <h2 className="title" id="pay-m01-title">
          Sandbox 테스트 결제를 진행할까요?
        </h2>
        <p className="status-copy">
          {title}, 금액{" "}
          <strong>
            <Money amount={amount} />
          </strong>
          . 실제 금액이 청구되지 않습니다.
        </p>
        <div className="btn-row">
          <Button variant="quiet" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" busy={opening} onClick={onConfirm}>
            결제창 열기
          </Button>
        </div>
      </div>
    </div>
  );
}
