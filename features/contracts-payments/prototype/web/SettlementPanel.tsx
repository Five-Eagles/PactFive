import { useState, type ReactNode } from "react";
import type { GetSettlementResponse } from "../server/public-api.types";
import {
  toSettlementViewModel,
  type SettlementClientOverlay,
  type SettlementDetailViewModel,
  type SettlementLoadError,
  type SettlementPrimaryAction,
  type SettlementUiState,
  type SettlementViewerRole,
  type SettlementViewerSession,
} from "./settlement.view-model";
import { Badge, Button, Money, Notice, type FeedbackTone } from "./ui";

export type SettlementPanelProps = {
  vm?: SettlementDetailViewModel;
  uiState?: SettlementUiState;
  loading?: boolean;
  viewerRole?: SettlementViewerRole;
  initialModal?: "help" | "review";
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";
const DEFAULT_PAYMENT = 100_000;
const DEFAULT_FEE = 10_000;
const DEFAULT_SETTLEMENT = 90_000;

const LOAD_ERROR_STATES: ReadonlySet<SettlementUiState> = new Set([
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

const OVERLAY_STATES: ReadonlySet<SettlementUiState> = new Set([
  "PROCESSING",
  "RELEASE_SYNCING",
  "FAILED",
]);

/** 정산·수수료 페이지. 지급 실행 버튼은 두지 않는다. */
export function SettlementPanel({
  vm,
  uiState = "WAITING_DELIVERY",
  loading = false,
  viewerRole,
  initialModal,
}: SettlementPanelProps) {
  const source = vm ?? fixtureViewModel(uiState, viewerRole ?? "CLIENT");
  const resolved = source;
  const [helpOpen, setHelpOpen] = useState(initialModal === "help");
  const [reviewOpen, setReviewOpen] = useState(
    initialModal === "review" || resolved.uiState === "REVIEW_REQUIRED",
  );

  if (loading) return <SettlementLoadingPage />;

  const hideMoney = LOAD_ERROR_STATES.has(resolved.uiState);

  return (
    <>
      <article className="settlement-page">
        <SettlementPageHead uiState={resolved.uiState} onHelp={() => setHelpOpen(true)} />
        <p className="sandbox-banner">
          <Badge tone="info" label="Sandbox 정산 시뮬레이션" />
          <span>실제 계좌 입금이 아닙니다.</span>
        </p>
        <div className="settlement-grid">
          <aside className="settlement-side">
            <section className="panel">
              <h2 className="agreement-card-title">
                {resolved.viewerRole === "FREELANCER" ? "정산 예정액" : "결제액"}
              </h2>
              <p className="caption">MANUAL_SIMULATION</p>
              {hideMoney ? null : (
                <p className="offer-amount">
                  <Money amount={resolved.primaryAmount} />
                </p>
              )}
              <SettlementCta action={resolved.primaryAction} uiState={resolved.uiState} />
            </section>
          </aside>
          <div className="settlement-main">
            <SettlementMain vm={resolved} />
          </div>
        </div>
      </article>
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      {resolved.uiState === "REVIEW_REQUIRED" ? (
        <ReviewDialog open={reviewOpen} onClose={() => setReviewOpen(false)} />
      ) : null}
    </>
  );
}

function fixtureViewModel(
  uiState: SettlementUiState,
  viewerRole: SettlementViewerRole,
): SettlementDetailViewModel {
  const session: SettlementViewerSession = {
    actorUserId: viewerRole === "CLIENT" ? "usr_client" : "usr_freelancer",
    clientId: "usr_client",
  };
  const loadError = LOAD_ERROR_STATES.has(uiState) ? (uiState as SettlementLoadError) : null;
  const overlay = OVERLAY_STATES.has(uiState) ? (uiState as SettlementClientOverlay) : null;
  return toSettlementViewModel(fixtureDto(uiState), session, loadError, overlay);
}

function fixtureDto(uiState: SettlementUiState): GetSettlementResponse | null {
  if (LOAD_ERROR_STATES.has(uiState)) return null;
  const base: GetSettlementResponse = {
    paymentId: "pay_preview",
    contractId: "ctr_preview",
    projectId: "prj_preview",
    projectTitle: DEFAULT_TITLE,
    environment: "SANDBOX",
    provider: "MANUAL_SIMULATION",
    currency: "KRW",
    paymentAmount: DEFAULT_PAYMENT,
    platformFeeRateBps: 1000,
    platformFeeAmount: DEFAULT_FEE,
    settlementAmount: DEFAULT_SETTLEMENT,
    paymentStatus: "READY",
    deliveryStatus: null,
    projectTransactionStatus: "IN_PROGRESS",
    canceledAt: null,
  };
  if (uiState === "PROJECT_CANCELED") {
    return { ...base, projectTransactionStatus: "CANCELED", canceledAt: "2026-09-01T00:00:00Z" };
  }
  if (uiState === "REVIEW_REQUIRED") {
    return { ...base, paymentStatus: "PAID", platformFeeAmount: 7_000, settlementAmount: 90_000 };
  }
  if (uiState === "WAITING_PAYMENT") return base;
  if (uiState === "WAITING_DELIVERY" || uiState === "PROCESSING" || uiState === "FAILED") {
    return { ...base, paymentStatus: "PAID" };
  }
  if (uiState === "WAITING_APPROVAL") {
    return { ...base, paymentStatus: "PAID", deliveryStatus: "DELIVERY_REQUESTED" };
  }
  if (uiState === "ELIGIBLE" || uiState === "RELEASE_SYNCING") {
    return { ...base, paymentStatus: "PAID", deliveryStatus: "APPROVED" };
  }
  if (uiState === "COMPLETION_SYNCING") {
    return { ...base, paymentStatus: "RELEASED", deliveryStatus: "APPROVED" };
  }
  if (uiState === "RELEASED") {
    return {
      ...base,
      paymentStatus: "RELEASED",
      deliveryStatus: "APPROVED",
      projectTransactionStatus: "COMPLETED",
    };
  }
  return base;
}

function SettlementPageHead({
  uiState,
  onHelp,
}: {
  uiState: SettlementUiState;
  onHelp: () => void;
}) {
  const badge = badgeFor(uiState);
  return (
    <header className="settlement-page-head">
      <div className="settlement-page-head-copy">
        <h1 className="page-title">정산·수수료</h1>
        <p className="settlement-page-links">
          <a href="#delivery">납품</a>
          <a href="#project">프로젝트</a>
          <button type="button" className="settlement-help" onClick={onHelp}>
            무슨 뜻인가요?
          </button>
        </p>
      </div>
      {badge ? <Badge tone={badge.tone} label={badge.label} /> : null}
    </header>
  );
}

function badgeFor(uiState: SettlementUiState): { tone: FeedbackTone; label: string } | null {
  switch (uiState) {
    case "ELIGIBLE":
      return { tone: "success", label: "정산 가능" };
    case "RELEASED":
      return { tone: "success", label: "시뮬레이션 완료" };
    case "PROCESSING":
    case "RELEASE_SYNCING":
    case "COMPLETION_SYNCING":
    case "WAITING_APPROVAL":
    case "WAITING_DELIVERY":
      return { tone: "warning", label: "처리 대기" };
    case "FAILED":
    case "REVIEW_REQUIRED":
      return { tone: "danger", label: "확인 필요" };
    case "PROJECT_CANCELED":
      return { tone: "danger", label: "정산 불가" };
    case "WAITING_PAYMENT":
      return { tone: "neutral", label: "결제 전" };
    default:
      return null;
  }
}

function SettlementLoadingPage() {
  return (
    <article className="settlement-page" aria-busy="true">
      <header className="settlement-page-head">
        <div className="settlement-page-head-copy">
          <h1 className="page-title">정산·수수료</h1>
        </div>
      </header>
      <p className="sandbox-banner">
        <Badge tone="info" label="Sandbox 정산 시뮬레이션" />
        <span>실제 계좌 입금이 아닙니다.</span>
      </p>
      <div className="settlement-grid">
        <aside className="settlement-side">
          <section className="panel">
            <p className="helper">정산 정보를 불러오는 중입니다.</p>
            <div className="skeleton" />
          </section>
        </aside>
        <div className="settlement-main">
          <section className="panel">
            <div className="skeleton" />
          </section>
        </div>
      </div>
    </article>
  );
}

function SettlementCta({
  action,
  uiState,
}: {
  action: SettlementPrimaryAction;
  uiState: SettlementUiState;
}) {
  if (uiState === "LOAD_FAILED") {
    return (
      <div className="btn-row">
        <Button variant="primary">다시 시도</Button>
      </div>
    );
  }
  if (uiState === "STALE") {
    return (
      <div className="btn-row">
        <Button variant="primary">다시 불러오기</Button>
      </div>
    );
  }
  if (action === "WRITE_REVIEW") {
    return (
      <div className="btn-row">
        <Button variant="primary">리뷰 작성</Button>
      </div>
    );
  }
  if (action === "VIEW_PAYMENT") {
    return (
      <div className="btn-row">
        <Button variant="primary">결제 확인</Button>
      </div>
    );
  }
  if (action === "VIEW_DELIVERY") {
    return (
      <div className="btn-row">
        <Button variant="primary">납품 확인</Button>
      </div>
    );
  }
  if (action === "VIEW_PROJECT") {
    return (
      <div className="btn-row">
        <Button variant="primary">내 프로젝트</Button>
      </div>
    );
  }
  return null;
}

function SettlementMain({ vm }: { vm: SettlementDetailViewModel }) {
  const hide = LOAD_ERROR_STATES.has(vm.uiState);
  return (
    <section className="panel" id="settlement">
      <SettlementStatusBanner uiState={vm.uiState} role={vm.viewerRole} />
      {hide ? null : (
        <>
          <dl className="facts">
            <dt>프로젝트 제목</dt>
            <dd>{vm.projectTitle}</dd>
            <dt>결제 금액</dt>
            <dd>
              <Money amount={vm.paymentAmount} />
            </dd>
            <dt>플랫폼 수수료</dt>
            <dd>
              <Money amount={vm.platformFeeAmount} />
              <span className="caption"> ({vm.platformFeeRateLabel})</span>
            </dd>
            <dt>정산 예정액</dt>
            <dd>
              <Money amount={vm.settlementAmount} />
            </dd>
          </dl>
          <h2 className="agreement-card-title">진행 단계</h2>
          <ol className="progress-steps">
            {vm.timeline.map((step) => (
              <li key={step.id} className={step.done ? "done" : undefined}>
                <span>{step.label}</span>
                <span>{step.statusLabel}</span>
              </li>
            ))}
          </ol>
          {vm.blockedReasonLabel ? <p className="helper">{vm.blockedReasonLabel}</p> : null}
          <p className="helper">
            이 금액은 결제 시점 서버 값입니다. 화면에서 바꾸지 않으며 PG 비용을 정산액에서 더 빼지
            않습니다.
          </p>
          <p className="helper">원천징수·세금계산서는 이 화면에서 계산하지 않습니다.</p>
        </>
      )}
    </section>
  );
}

function SettlementStatusBanner({
  uiState,
  role,
}: {
  uiState: SettlementUiState;
  role: SettlementViewerRole;
}): ReactNode {
  switch (uiState) {
    case "LOAD_FAILED":
      return (
        <>
          <Notice tone="danger">정산 정보를 불러오지 못했습니다</Notice>
          <p className="status-copy">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        </>
      );
    case "STALE":
      return (
        <>
          <Notice tone="warning">내용이 바뀌었습니다</Notice>
          <p className="status-copy">최신 정산을 다시 확인한 뒤 이어서 진행하세요.</p>
        </>
      );
    case "FORBIDDEN":
      return (
        <>
          <Notice tone="warning">이 정산을 볼 수 있는 권한이 없습니다</Notice>
          <p className="status-copy">계약 당사자만 금액과 상태를 확인할 수 있습니다.</p>
        </>
      );
    case "NOT_FOUND":
      return (
        <>
          <Notice tone="info">정산 정보를 찾을 수 없습니다</Notice>
          <p className="status-copy">결제가 없거나 주소가 바뀌었을 수 있습니다.</p>
        </>
      );
    case "PROJECT_CANCELED":
      return (
        <>
          <Notice tone="danger">프로젝트가 취소되었습니다</Notice>
          <p className="status-copy">이 거래는 정산을 진행할 수 없습니다.</p>
        </>
      );
    case "REVIEW_REQUIRED":
      return (
        <>
          <Notice tone="danger">정산 금액과 상태를 확인하고 있습니다</Notice>
          <p className="status-copy">숫자를 화면에서 고치지 않습니다. 운영 확인이 필요합니다.</p>
        </>
      );
    case "WAITING_PAYMENT":
      return (
        <p className="status-copy" role="status">
          결제 완료가 필요합니다. 의뢰인 결제가 끝나야 정산 단계로 갑니다.
        </p>
      );
    case "WAITING_DELIVERY":
      return (
        <p className="status-copy" role="status">
          결제 승인 완료. 납품 승인 후 정산 가능합니다.
        </p>
      );
    case "WAITING_APPROVAL":
      return (
        <p className="status-copy" role="status">
          의뢰인 승인을 기다리는 중입니다. 승인 후 정산이 가능해집니다.
        </p>
      );
    case "ELIGIBLE":
      return (
        <p className="status-copy" role="status">
          정산 가능한 상태입니다. 처리는 운영 시뮬레이션이며 이 화면에서 지급하지 않습니다.
        </p>
      );
    case "PROCESSING":
    case "RELEASE_SYNCING":
      return (
        <p className="status-copy" role="status">
          정산 결과를 확인하고 있습니다. 다시 실행하지 않습니다.
        </p>
      );
    case "COMPLETION_SYNCING":
      return (
        <p className="status-copy" role="status">
          내부 정산 처리가 완료되었습니다. 프로젝트 완료를 확인하고 있습니다.
        </p>
      );
    case "FAILED":
      return (
        <>
          <Notice tone="danger">정산 처리를 끝내지 못했습니다</Notice>
          <p className="status-copy">운영 확인이 필요합니다. 이 화면에서 다시 지급하지 않습니다.</p>
        </>
      );
    case "RELEASED":
      return (
        <p className="status-copy" role="status">
          정산 시뮬레이션이 완료되었습니다.
          {role === "FREELANCER" ? " 실제 입금이 아닙니다." : ""} 거래가 <strong>완료</strong>입니다.
        </p>
      );
    default:
      return (
        <p className="status-copy" role="status">
          정산 상태를 확인하고 있습니다.
        </p>
      );
  }
}

function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      className={open ? "overlay-backdrop open" : "overlay-backdrop"}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="set-m01-title">
        <h2 className="title" id="set-m01-title">
          정산 상태가 궁금하신가요?
        </h2>
        <p className="status-copy">
          Sandbox에서는 실제 계좌 입금이 없습니다. 결제 승인은 의뢰인 결제 완료이고, 정산
          시뮬레이션은 내부 처리이며, 거래 완료는 납품 승인과 정산이 모두 끝난 상태입니다.
        </p>
        <div className="btn-row">
          <Button variant="primary" onClick={onClose}>
            확인
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      className={open ? "overlay-backdrop open" : "overlay-backdrop"}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="set-m02-title">
        <h2 className="title" id="set-m02-title">
          확인이 필요한 정산입니다
        </h2>
        <p className="status-copy" role="alert">
          자동 처리를 멈췄습니다. 금액을 화면에서 고치거나 다시 실행할 수 없습니다.
        </p>
        <div className="btn-row">
          <Button variant="primary" onClick={onClose}>
            확인
          </Button>
        </div>
      </div>
    </div>
  );
}
