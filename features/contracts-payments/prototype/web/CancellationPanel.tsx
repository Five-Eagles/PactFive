import { useState, type ReactNode, Fragment } from "react";
import type { GetCancellationResponse } from "../server/public-api.types";
import {
  toCancellationViewModel,
  type CancellationClientOverlay,
  type CancellationDetailViewModel,
  type CancellationLoadError,
  type CancellationPrimaryAction,
  type CancellationUiState,
  type CancellationViewerRole,
  type CancellationViewerSession,
} from "./cancellation.view-model";
import { Badge, Button, Notice, type FeedbackTone } from "./ui";

export type CancellationPanelProps = {
  vm?: CancellationDetailViewModel;
  uiState?: CancellationUiState;
  loading?: boolean;
  viewerRole?: CancellationViewerRole;
  initialModal?: "confirm" | "payment" | "followup";
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";

const LOAD_ERROR_STATES: ReadonlySet<CancellationUiState> = new Set([
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

const OVERLAY_STATES: ReadonlySet<CancellationUiState> = new Set([
  "SUBMITTING",
  "ALREADY_CANCELED",
]);

/** 취소 결과 페이지. A-07 POST는 부르지 않는다. */
export function CancellationPanel({
  vm,
  uiState = "CANCEL_AVAILABLE",
  loading = false,
  viewerRole,
  initialModal,
}: CancellationPanelProps) {
  const source = vm ?? fixtureViewModel(uiState, viewerRole ?? "CLIENT");
  const [confirmOpen, setConfirmOpen] = useState(initialModal === "confirm");
  const [paymentOpen, setPaymentOpen] = useState(
    initialModal === "payment" || source.uiState === "PAYMENT_STARTED",
  );
  const [followupOpen, setFollowupOpen] = useState(
    initialModal === "followup" || source.uiState === "CANCELED_FOLLOWUP_PENDING",
  );

  if (loading) return <CancellationLoadingPage />;

  const hide = LOAD_ERROR_STATES.has(source.uiState);

  return (
    <>
      <article className="cancellation-page">
        <CancellationPageHead uiState={source.uiState} />
        <div className="cancellation-grid">
          <aside className="cancellation-side">
            <section className="panel">
              <h2 className="agreement-card-title">취소 상태</h2>
              {hide ? null : (
                <>
                  {source.canceledAtLabel ? (
                    <p className="caption">취소 시각 {source.canceledAtLabel}</p>
                  ) : (
                    <p className="caption">{source.projectTitle}</p>
                  )}
                </>
              )}
              <CancellationCta
                action={source.primaryAction}
                uiState={source.uiState}
                canCancel={source.canCancel}
                onConfirm={() => setConfirmOpen(true)}
              />
            </section>
          </aside>
          <div className="cancellation-main">
            <CancellationMain vm={source} />
          </div>
        </div>
      </article>
      {source.uiState === "CANCEL_AVAILABLE" ? (
        <ConfirmDialog
          open={confirmOpen}
          showPendingImpact={hasContractImpact(source)}
          onClose={() => setConfirmOpen(false)}
        />
      ) : null}
      {source.uiState === "PAYMENT_STARTED" ? (
        <PaymentBlockedDialog open={paymentOpen} onClose={() => setPaymentOpen(false)} />
      ) : null}
      {source.uiState === "CANCELED_FOLLOWUP_PENDING" ? (
        <FollowupDialog open={followupOpen} onClose={() => setFollowupOpen(false)} />
      ) : null}
    </>
  );
}

function hasContractImpact(vm: CancellationDetailViewModel): boolean {
  return vm.impactItems.some((item) => item.kind === "AGREEMENT" || item.kind === "CONTRACT");
}

function fixtureViewModel(
  uiState: CancellationUiState,
  viewerRole: CancellationViewerRole,
): CancellationDetailViewModel {
  const session: CancellationViewerSession = {
    actorUserId: viewerRole === "CLIENT" ? "usr_client" : "usr_freelancer",
    clientId: "usr_client",
  };
  const loadError = LOAD_ERROR_STATES.has(uiState) ? (uiState as CancellationLoadError) : null;
  const overlay = OVERLAY_STATES.has(uiState) ? (uiState as CancellationClientOverlay) : null;
  return toCancellationViewModel(fixtureDto(uiState), session, loadError, overlay);
}

function fixtureDto(uiState: CancellationUiState): GetCancellationResponse | null {
  if (LOAD_ERROR_STATES.has(uiState)) return null;
  const base: GetCancellationResponse = {
    projectId: "prj_preview",
    projectTitle: DEFAULT_TITLE,
    recruitmentStatus: "CLOSED",
    transactionStatus: "CONTRACT_PENDING",
    paymentPendingAt: null,
    canceledAt: null,
    acceptedApplicationId: "app_preview",
    agreementStatus: "PROPOSED",
    contractStatus: "DRAFT",
    hasSignatureAudit: false,
    postActions: null,
  };
  if (uiState === "PAYMENT_STARTED") {
    return { ...base, paymentPendingAt: "2026-09-04T00:00:00Z", agreementStatus: "ACCEPTED" };
  }
  if (uiState === "IN_PROGRESS") {
    return {
      ...base,
      transactionStatus: "IN_PROGRESS",
      agreementStatus: "ACCEPTED",
      contractStatus: "SIGNED",
    };
  }
  if (uiState === "COMPLETED") {
    return { ...base, transactionStatus: "COMPLETED", agreementStatus: "ACCEPTED", contractStatus: "SIGNED" };
  }
  if (uiState === "CANCELED_FOLLOWUP_PENDING") {
    return {
      ...base,
      transactionStatus: "CANCELED",
      canceledAt: "2026-09-04T00:00:00Z",
      agreementStatus: "REJECTED",
      contractStatus: "CANCELED",
      hasSignatureAudit: true,
      postActions: { applicationRejection: "NOT_NEEDED", contractInvalidation: "FAILED" },
    };
  }
  if (
    uiState === "CANCELED_COMPLETE" ||
    uiState === "ALREADY_CANCELED"
  ) {
    return {
      ...base,
      transactionStatus: "CANCELED",
      canceledAt: "2026-09-04T00:00:00Z",
      agreementStatus: "REJECTED",
      contractStatus: "CANCELED",
      hasSignatureAudit: true,
      postActions: { applicationRejection: "NOT_NEEDED", contractInvalidation: "DONE" },
    };
  }
  if (uiState === "SUBMITTING" || uiState === "CANCEL_AVAILABLE") return base;
  return base;
}

function CancellationPageHead({ uiState }: { uiState: CancellationUiState }) {
  const badge = badgeFor(uiState);
  return (
    <header className="cancellation-page-head">
      <div className="cancellation-page-head-copy">
        <h1 className="page-title">프로젝트 취소</h1>
        <p className="cancellation-page-links">
          <a href="#project">내 프로젝트</a>
        </p>
      </div>
      {badge ? <Badge tone={badge.tone} label={badge.label} /> : null}
    </header>
  );
}

function badgeFor(uiState: CancellationUiState): { tone: FeedbackTone; label: string } | null {
  switch (uiState) {
    case "CANCELED_COMPLETE":
      return { tone: "success", label: "취소 완료" };
    case "ALREADY_CANCELED":
      return { tone: "success", label: "이미 취소됨" };
    case "CANCELED_FOLLOWUP_PENDING":
    case "SUBMITTING":
      return { tone: "warning", label: "후속 처리 중" };
    case "PAYMENT_STARTED":
    case "IN_PROGRESS":
    case "COMPLETED":
      return { tone: "danger", label: "취소 불가" };
    case "CANCEL_AVAILABLE":
      return { tone: "neutral", label: "취소 가능" };
    default:
      return null;
  }
}

function CancellationLoadingPage() {
  return (
    <article className="cancellation-page" aria-busy="true">
      <header className="cancellation-page-head">
        <div className="cancellation-page-head-copy">
          <h1 className="page-title">프로젝트 취소</h1>
        </div>
      </header>
      <div className="cancellation-grid">
        <aside className="cancellation-side">
          <section className="panel">
            <p className="helper">취소 정보를 불러오는 중입니다.</p>
            <div className="skeleton" />
          </section>
        </aside>
        <div className="cancellation-main">
          <section className="panel">
            <div className="skeleton" />
          </section>
        </div>
      </div>
    </article>
  );
}

function CancellationCta({
  action,
  uiState,
  canCancel,
  onConfirm,
}: {
  action: CancellationPrimaryAction;
  uiState: CancellationUiState;
  canCancel: boolean;
  onConfirm: () => void;
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
  if (uiState === "SUBMITTING") {
    return (
      <div className="btn-row">
        <Button variant="danger" disabled busy>
          취소 처리 중
        </Button>
      </div>
    );
  }
  if (canCancel && action === "OPEN_CONFIRM") {
    return (
      <div className="btn-row">
        <Button variant="danger" onClick={onConfirm}>
          프로젝트 취소
        </Button>
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
  return (
    <div className="btn-row">
      <Button variant="primary">내 프로젝트</Button>
    </div>
  );
}

function CancellationMain({ vm }: { vm: CancellationDetailViewModel }) {
  const hide = LOAD_ERROR_STATES.has(vm.uiState);
  return (
    <section className="panel" id="cancellation">
      <CancellationStatusBanner uiState={vm.uiState} />
      {hide ? null : (
        <>
          <dl className="facts">
            <dt>프로젝트 제목</dt>
            <dd>{vm.projectTitle}</dd>
            {vm.canceledAtLabel ? (
              <>
                <dt>취소 시각</dt>
                <dd>{vm.canceledAtLabel}</dd>
              </>
            ) : null}
          </dl>
          {vm.impactItems.length > 0 ? (
            <>
              <h2 className="agreement-card-title">영향</h2>
              <ul className="notes">
                {vm.impactItems.map((item) => (
                  <li key={item.kind}>{item.label}</li>
                ))}
              </ul>
            </>
          ) : null}
          {vm.postActions.length > 0 ? (
            <>
              <h2 className="agreement-card-title">처리 내역</h2>
              <dl className="facts">
                {vm.postActions.map((item) => (
                  <Fragment key={item.key}>
                    <dt>{item.key === "applicationRejection" ? "지원" : "합의·계약"}</dt>
                    <dd>{item.label}</dd>
                  </Fragment>
                ))}
              </dl>
            </>
          ) : null}
          <p className="helper">기존 계약 본문과 서명 기록은 보존됩니다. 이 화면에서 지우지 않습니다.</p>
        </>
      )}
    </section>
  );
}

function CancellationStatusBanner({ uiState }: { uiState: CancellationUiState }): ReactNode {
  switch (uiState) {
    case "LOAD_FAILED":
      return (
        <>
          <Notice tone="danger">취소 정보를 불러오지 못했습니다</Notice>
          <p className="status-copy">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        </>
      );
    case "STALE":
      return (
        <>
          <Notice tone="warning">내용이 바뀌었습니다</Notice>
          <p className="status-copy">최신 상태를 다시 확인한 뒤 이어서 진행하세요.</p>
        </>
      );
    case "FORBIDDEN":
      return (
        <>
          <Notice tone="warning">이 취소를 볼 수 있는 권한이 없습니다</Notice>
          <p className="status-copy">등록 의뢰인과 계약 당사자만 상태를 확인할 수 있습니다.</p>
        </>
      );
    case "NOT_FOUND":
      return (
        <>
          <Notice tone="info">프로젝트를 찾을 수 없습니다</Notice>
          <p className="status-copy">주소가 바뀌었거나 프로젝트가 없을 수 있습니다.</p>
        </>
      );
    case "PAYMENT_STARTED":
      return (
        <>
          <Notice tone="danger">이미 결제가 진행되어 취소할 수 없습니다</Notice>
          <p className="status-copy">결제 상태를 확인해 주세요.</p>
        </>
      );
    case "IN_PROGRESS":
      return (
        <>
          <Notice tone="danger">이미 결제가 완료되어 취소할 수 없습니다</Notice>
          <p className="status-copy">거래가 진행 중입니다.</p>
        </>
      );
    case "COMPLETED":
      return (
        <>
          <Notice tone="info">완료된 거래입니다</Notice>
          <p className="status-copy">이 프로젝트는 취소할 수 없습니다.</p>
        </>
      );
    case "CANCELED_FOLLOWUP_PENDING":
      return (
        <p className="status-copy" role="status">
          취소되었습니다. 일부 후속 처리가 진행 중입니다.
        </p>
      );
    case "ALREADY_CANCELED":
      return (
        <p className="status-copy" role="status">
          이미 취소된 프로젝트입니다.
        </p>
      );
    case "CANCELED_COMPLETE":
      return (
        <p className="status-copy" role="status">
          프로젝트가 취소되었습니다.
        </p>
      );
    case "SUBMITTING":
      return (
        <p className="status-copy" role="status">
          취소 처리 중
        </p>
      );
    default:
      return (
        <p className="status-copy" role="status">
          결제 시작 전에만 프로젝트를 취소할 수 있습니다. 취소 후 되돌릴 수 없습니다.
        </p>
      );
  }
}

function ConfirmDialog({
  open,
  showPendingImpact,
  onClose,
}: {
  open: boolean;
  showPendingImpact: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={open ? "overlay-backdrop open" : "overlay-backdrop"}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="can-m01-title">
        <h2 className="title" id="can-m01-title">
          프로젝트를 취소할까요?
        </h2>
        <p className="status-copy">취소 후 되돌릴 수 없습니다.</p>
        {showPendingImpact ? (
          <p className="status-copy">
            선정 프리랜서에게 안내가 가고, 합의는 종료되며 계약 진행도 종료됩니다. 기존 서명
            기록은 보존됩니다.
          </p>
        ) : null}
        <div className="field-row">
          <label className="label" htmlFor="cancel-reason">
            취소 사유 (선택)
          </label>
          <textarea
            className="field"
            id="cancel-reason"
            name="reason"
            maxLength={500}
            rows={3}
            placeholder="민감정보는 적지 마세요. 이 내용은 서버로 보내지 않습니다."
          />
        </div>
        <div className="btn-row">
          <Button variant="quiet" onClick={onClose}>
            계속 진행
          </Button>
          <Button variant="danger" onClick={onClose}>
            프로젝트 취소
          </Button>
        </div>
      </div>
    </div>
  );
}

function PaymentBlockedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      className={open ? "overlay-backdrop open" : "overlay-backdrop"}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="can-m02-title">
        <h2 className="title" id="can-m02-title">
          지금은 취소할 수 없습니다
        </h2>
        <p className="status-copy" role="alert">
          이미 결제가 진행되어 취소할 수 없습니다.
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

function FollowupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div
      className={open ? "overlay-backdrop open" : "overlay-backdrop"}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="can-m03-title">
        <h2 className="title" id="can-m03-title">
          후속 처리가 진행 중입니다
        </h2>
        <p className="status-copy">
          취소되었습니다. 일부 후속 처리가 진행 중입니다. 프로젝트는 이미 취소 상태입니다.
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
