import { useState, type FormEvent, type ReactNode } from "react";
import type { CurrentNegotiationOfferResponse } from "../server/public-api.types";
import {
  toAgreementViewModel,
  type AgreementDetailViewModel,
  type AgreementLoadError,
  type AgreementUiState,
  type AgreementViewerRole,
  type AgreementViewerSession,
} from "./agreement.view-model";
import { Badge, Button, Money, Notice, type FeedbackTone } from "./ui";

/** run.tsx 규칙 17이 아직 이 이름을 쓴다. 내부는 uiState로 변환한다. */
export type AgreementView =
  | "create"
  | "loading"
  | "loadFailed"
  | "stale"
  | "canceled"
  | "proposed"
  | "respond";

export type AgreementPanelProps = {
  vm?: AgreementDetailViewModel;
  uiState?: AgreementUiState;
  loading?: boolean;
  amountError?: boolean;
  view?: AgreementView;
  amount?: number;
  projectTitle?: string;
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";
const DEFAULT_AMOUNT = 1_000_000;
const PROPOSE_FORM_ID = "agreement-propose-form";
const REJECT_REASON_CODES = [
  { value: "PRICE_NOT_ACCEPTABLE", label: "금액이 맞지 않음" },
  { value: "TERMS_NOT_ACCEPTABLE", label: "조건이 맞지 않음" },
  { value: "OTHER", label: "기타" },
] as const;

const VIEW_TO_UI_STATE: Record<Exclude<AgreementView, "loading">, AgreementUiState> = {
  create: "NOT_PROPOSED",
  loadFailed: "LOAD_FAILED",
  stale: "STALE",
  canceled: "PROJECT_CANCELED",
  proposed: "WAITING_RESPONSE",
  respond: "ACTION_REQUIRED",
};

const RECRUITMENT_LABEL: Record<string, string> = {
  SCHEDULED: "모집 예정",
  OPEN: "모집 중",
  CLOSED: "모집 마감",
};

const TRANSACTION_LABEL: Record<string, string> = {
  NONE: "거래 전",
  CONTRACT_PENDING: "계약 대기",
  IN_PROGRESS: "작업 중",
  COMPLETED: "완료",
  CANCELED: "취소됨",
};

const LOAD_ERROR_STATES: ReadonlySet<AgreementUiState> = new Set([
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

const TERMINAL_UI_STATES: ReadonlySet<AgreementUiState> = new Set([
  "AGREED",
  "REJECTED_REOPENED",
  "REJECTED_CLOSED",
  "PROJECT_CANCELED",
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

/** 변경 버튼은 uiState로만 연다. 종료·대기에서 권한값이 틀려도 그리지 않는다. */
function mutationPermissions(vm: AgreementDetailViewModel): AgreementDetailViewModel["permissions"] {
  if (TERMINAL_UI_STATES.has(vm.uiState) || vm.uiState === "WAITING_RESPONSE") {
    return { canPropose: false, canAccept: false, canReject: false };
  }
  return {
    canPropose: vm.uiState === "NOT_PROPOSED" && vm.viewerRole === "CLIENT",
    canAccept: vm.uiState === "ACTION_REQUIRED",
    canReject: vm.uiState === "ACTION_REQUIRED",
  };
}

/** 금액 합의 페이지. ViewModel의 uiState로만 분기한다. */
export function AgreementPanel({
  vm,
  uiState,
  loading = false,
  amountError: amountErrorProp = false,
  view = "create",
  amount = DEFAULT_AMOUNT,
  projectTitle = DEFAULT_TITLE,
}: AgreementPanelProps) {
  const isLoading = loading || view === "loading";
  const source = vm ?? fixtureViewModel(uiState ?? uiStateFromView(view), amount, projectTitle);
  const resolved = { ...source, permissions: mutationPermissions(source) };
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [amountError, setAmountError] = useState(amountErrorProp);

  if (isLoading) return <AgreementLoadingPage />;

  const { permissions } = resolved;
  const showFixedCta = permissions.canPropose || permissions.canAccept || permissions.canReject;

  return (
    <>
      <article className={showFixedCta ? "agreement-page has-fixed-cta" : "agreement-page"}>
        <AgreementPageHead uiState={resolved.uiState} />
        <div className="agreement-grid">
          <div className="agreement-main">
            <AgreementMain
              vm={resolved}
              amountError={amountError}
              onProposeSubmit={(event) => {
                event.preventDefault();
                const raw = String(new FormData(event.currentTarget).get("amount") ?? "").trim();
                setAmountError(raw.length === 0);
              }}
            />
            <AgreementHistory history={resolved.history} uiState={resolved.uiState} />
          </div>
          <aside className="agreement-side">
            <AgreementSide vm={resolved} />
          </aside>
          {showFixedCta ? (
            <AgreementCtaBar
              vm={resolved}
              onAccept={() => setAcceptOpen(true)}
              onReject={() => setRejectOpen(true)}
            />
          ) : null}
        </div>
      </article>
      {permissions.canAccept ? (
        <AcceptConfirmDialog
          open={acceptOpen}
          amount={resolved.currentOffer?.amount ?? amount}
          onClose={() => setAcceptOpen(false)}
        />
      ) : null}
      {permissions.canReject ? (
        <RejectConfirmDialog open={rejectOpen} onClose={() => setRejectOpen(false)} />
      ) : null}
    </>
  );
}

function uiStateFromView(view: AgreementView): AgreementUiState {
  if (view === "loading") return "NOT_PROPOSED";
  return VIEW_TO_UI_STATE[view];
}

/** 프리뷰·규칙 17용 픽스처. 서버 DTO를 화면이 직접 쓰지 않게 어댑터를 탄다. */
function fixtureViewModel(
  uiState: AgreementUiState,
  amount: number,
  projectTitle: string,
): AgreementDetailViewModel {
  const viewerRole: AgreementViewerRole =
    uiState === "ACTION_REQUIRED" ? "FREELANCER" : "CLIENT";
  const session: AgreementViewerSession = {
    actorUserId: viewerRole === "CLIENT" ? "usr_client" : "usr_freelancer",
    clientId: "usr_client",
  };
  const loadError = LOAD_ERROR_STATES.has(uiState) ? (uiState as AgreementLoadError) : null;
  return toAgreementViewModel(fixtureDto(uiState, amount, projectTitle), session, loadError);
}

function fixtureDto(
  uiState: AgreementUiState,
  amount: number,
  projectTitle: string,
): CurrentNegotiationOfferResponse | null {
  if (LOAD_ERROR_STATES.has(uiState)) return null;
  const offer = {
    offerId: "off_preview",
    round: 1,
    amount,
    currency: "KRW" as const,
    offeredByUserId: "usr_client",
  };
  const base: CurrentNegotiationOfferResponse = {
    projectId: "prj_preview",
    agreementId: "agr_preview",
    agreementStatus: "PROPOSED",
    offer,
    contractId: null,
    contractStatus: null,
    projectTitle,
    recruitmentStatus: "CLOSED",
    transactionStatus: "CONTRACT_PENDING",
    canceledAt: null,
    applicationId: "app_preview",
    reopened: null,
    notReopenedReason: null,
  };
  if (uiState === "NOT_PROPOSED") {
    return {
      ...base,
      agreementId: null,
      agreementStatus: null,
      offer: null,
      applicationId: "app_preview",
    };
  }
  if (uiState === "AGREED") {
    return {
      ...base,
      agreementStatus: "ACCEPTED",
      contractId: "ctr_preview",
      contractStatus: "DRAFT",
    };
  }
  if (uiState === "REJECTED_REOPENED") {
    return {
      ...base,
      agreementStatus: "REJECTED",
      recruitmentStatus: "OPEN",
      transactionStatus: "NONE",
      reopened: true,
      notReopenedReason: null,
    };
  }
  if (uiState === "REJECTED_CLOSED") {
    return {
      ...base,
      agreementStatus: "REJECTED",
      transactionStatus: "NONE",
      reopened: false,
      notReopenedReason: "DEADLINE_PASSED",
    };
  }
  if (uiState === "PROJECT_CANCELED") {
    return {
      ...base,
      transactionStatus: "CANCELED",
      canceledAt: "2026-09-01T00:00:00Z",
    };
  }
  return base;
}

function AgreementPageHead({ uiState }: { uiState: AgreementUiState }) {
  const badge = badgeFor(uiState);
  return (
    <header className="agreement-page-head">
      <h2 className="page-title">금액 합의</h2>
      {badge ? <Badge tone={badge.tone} label={badge.label} /> : null}
    </header>
  );
}

function badgeFor(uiState: AgreementUiState): { tone: FeedbackTone; label: string } | null {
  switch (uiState) {
    case "NOT_PROPOSED":
      return { tone: "neutral", label: "제안 전" };
    case "WAITING_RESPONSE":
    case "ACTION_REQUIRED":
      return { tone: "warning", label: "응답 대기" };
    case "AGREED":
      return { tone: "success", label: "합의 완료" };
    case "REJECTED_REOPENED":
      return { tone: "warning", label: "모집 재개" };
    case "REJECTED_CLOSED":
      return { tone: "neutral", label: "모집 종료" };
    case "PROJECT_CANCELED":
      return { tone: "danger", label: "취소됨" };
    default:
      return null;
  }
}

function AgreementLoadingPage() {
  return (
    <article className="agreement-page" aria-busy="true">
      <header className="agreement-page-head">
        <h2 className="page-title">금액 합의</h2>
      </header>
      <div className="agreement-grid">
        <div className="agreement-main">
          <section className="panel">
            <p className="helper">합의 내용을 불러오는 중입니다.</p>
            <div className="skeleton" />
            <div className="skeleton" />
          </section>
        </div>
        <aside className="agreement-side">
          <section className="panel">
            <div className="skeleton" />
            <div className="skeleton" />
          </section>
        </aside>
      </div>
    </article>
  );
}

function AgreementMain({
  vm,
  amountError,
  onProposeSubmit,
}: {
  vm: AgreementDetailViewModel;
  amountError: boolean;
  onProposeSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { uiState, permissions, currentOffer } = vm;
  return (
    <section className="panel">
      <AgreementStatusBanner uiState={uiState} />
      {uiState === "NOT_PROPOSED" && permissions.canPropose ? (
        <ProposeForm amountError={amountError} onSubmit={onProposeSubmit} />
      ) : null}
      <AgreementOfferCard uiState={uiState} amount={currentOffer?.amount ?? null} />
      <AgreementInlineActions vm={vm} />
    </section>
  );
}

function AgreementStatusBanner({ uiState }: { uiState: AgreementUiState }) {
  switch (uiState) {
    case "LOAD_FAILED":
      return (
        <>
          <Notice tone="danger">합의 내용을 불러오지 못했습니다</Notice>
          <p className="status-copy">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        </>
      );
    case "STALE":
      return (
        <>
          <Notice tone="warning">내용이 바뀌었습니다</Notice>
          <p className="status-copy">
            다른 당사자가 먼저 응답했거나 프로젝트가 바뀌었습니다. 최신 내용을 확인한 뒤
            이어서 진행하세요.
          </p>
        </>
      );
    case "PROJECT_CANCELED":
      return (
        <>
          <Notice tone="danger">프로젝트가 취소되었습니다</Notice>
          <p className="status-copy">
            이 프로젝트는 더 이상 조건을 바꿀 수 없습니다. 새로운 거래가 필요하면 의뢰인이
            다시 모집해야 합니다.
          </p>
        </>
      );
    case "FORBIDDEN":
      return (
        <>
          <Notice tone="warning">이 합의를 볼 수 있는 권한이 없습니다</Notice>
          <p className="status-copy">
            프로젝트 당사자만 금액과 제안을 확인할 수 있습니다. 다른 계정으로 들어왔다면 당사자
            계정으로 다시 들어와 주세요.
          </p>
        </>
      );
    case "NOT_FOUND":
      return (
        <>
          <Notice tone="info">합의를 찾을 수 없습니다</Notice>
          <p className="status-copy">
            주소가 바뀌었거나 아직 제안이 없을 수 있습니다. 프로젝트 화면에서 다시 들어와 주세요.
          </p>
        </>
      );
    case "NOT_PROPOSED":
      return (
        <p className="status-copy" role="status">
          아직 제안이 없습니다. <strong>의뢰인이 금액을 제안</strong>하면 프리랜서가 수락하거나
          거절합니다.
        </p>
      );
    case "WAITING_RESPONSE":
      return (
        <p className="status-copy" role="status">
          의뢰인이 금액을 제안했습니다. <strong>프리랜서의 수락 또는 거절</strong>을 기다리는
          중입니다.
        </p>
      );
    case "ACTION_REQUIRED":
      return (
        <p className="status-copy" role="status">
          의뢰인이 아래 금액을 제안했습니다. <strong>지금 수락하거나 거절</strong>할 수 있습니다.
          거절하면 이 거래는 끝납니다.
        </p>
      );
    case "AGREED":
      return (
        <p className="status-copy" role="status">
          금액이 <strong>확정</strong>되었습니다. 이 금액이 계약과 결제의 근거입니다. 계약서를
          확인해 주세요.
        </p>
      );
    case "REJECTED_REOPENED":
      return (
        <p className="status-copy" role="status">
          프리랜서가 제안을 거절했습니다. <strong>모집이 다시 열렸습니다</strong>. 조건을 수정한
          뒤 다른 지원자를 받을 수 있습니다.
        </p>
      );
    case "REJECTED_CLOSED":
      return (
        <p className="status-copy" role="status">
          프리랜서가 제안을 거절했습니다. 모집 마감이 지나 <strong>프로젝트는 종료 상태</strong>로
          남습니다.
        </p>
      );
  }
}

function ProposeForm({
  amountError,
  onSubmit,
}: {
  amountError: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form id={PROPOSE_FORM_ID} onSubmit={onSubmit}>
      <div className="field-row">
        <label className="label" htmlFor="agreement-amount">
          합의 금액
        </label>
        <input
          className={amountError ? "field error" : "field"}
          id="agreement-amount"
          name="amount"
          inputMode="numeric"
          placeholder="금액"
          aria-invalid={amountError ? "true" : undefined}
          aria-describedby={amountError ? "agreement-amount-error-msg" : undefined}
        />
        {amountError ? (
          <p className="helper error" id="agreement-amount-error-msg">
            금액을 입력해 주세요.
          </p>
        ) : (
          <p className="helper">단위는 원입니다. 제안한 금액이 계약과 결제의 근거가 됩니다.</p>
        )}
      </div>
    </form>
  );
}

function AgreementOfferCard({
  uiState,
  amount,
}: {
  uiState: AgreementUiState;
  amount: number | null;
}) {
  const kicker = offerKicker(uiState);
  if (kicker == null || amount == null) return null;
  return (
    <>
      <p className="caption offer-kicker">{kicker}</p>
      <p className="offer-amount">
        <Money amount={amount} />
      </p>
      {uiState === "WAITING_RESPONSE" ? (
        <p className="helper after-amount">
          지금은 바꿀 수 없습니다. 프리랜서가 응답하면 다음 단계로 갑니다.
        </p>
      ) : null}
    </>
  );
}

function offerKicker(uiState: AgreementUiState): string | null {
  if (uiState === "WAITING_RESPONSE" || uiState === "ACTION_REQUIRED") return "최신 제안";
  if (uiState === "AGREED") return "확정 금액";
  if (uiState === "REJECTED_REOPENED" || uiState === "REJECTED_CLOSED") return "거절된 제안";
  return null;
}

function AgreementInlineActions({ vm }: { vm: AgreementDetailViewModel }) {
  const { uiState } = vm;
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
  if (uiState === "FORBIDDEN" || uiState === "NOT_FOUND" || uiState === "REJECTED_CLOSED") {
    return (
      <div className="btn-row after-offer">
        <Button variant="primary">프로젝트 확인</Button>
      </div>
    );
  }
  if (uiState === "REJECTED_REOPENED") {
    return (
      <div className="btn-row after-offer">
        <Button variant="secondary">프로젝트 확인</Button>
        {vm.viewerRole === "CLIENT" ? <Button variant="primary">프로젝트 수정</Button> : null}
      </div>
    );
  }
  if (uiState === "AGREED") {
    return (
      <div className="btn-row after-offer">
        <Button variant="primary">계약서 확인</Button>
      </div>
    );
  }
  return null;
}

function AgreementCtaBar({
  vm,
  onAccept,
  onReject,
}: {
  vm: AgreementDetailViewModel;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { permissions } = vm;
  return (
    <div className="agreement-cta-bar btn-row">
      {permissions.canPropose ? (
        <Button variant="primary" type="submit" form={PROPOSE_FORM_ID}>
          제안하기
        </Button>
      ) : null}
      {permissions.canAccept ? (
        <Button variant="primary" onClick={onAccept}>
          수락하기
        </Button>
      ) : null}
      {permissions.canReject ? (
        <Button variant="danger" onClick={onReject}>
          거절하기
        </Button>
      ) : null}
    </div>
  );
}

function AgreementHistory({
  history,
  uiState,
}: {
  history: AgreementDetailViewModel["history"];
  uiState: AgreementUiState;
}) {
  if (history.length === 0 || LOAD_ERROR_STATES.has(uiState)) return null;
  return (
    <section className="panel">
      <h3 className="agreement-card-title">제안 이력</h3>
      <ol className="history">
        {history.map((item) => (
          <li key={item.round}>
            <span>{item.label}</span>
            <Money amount={item.amount} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function AgreementSide({ vm }: { vm: AgreementDetailViewModel }) {
  const hideProject = LOAD_ERROR_STATES.has(vm.uiState) || !vm.project.title;
  return (
    <>
      {hideProject ? null : (
        <>
          <section className="panel">
            <h3 className="agreement-card-title">프로젝트</h3>
            <dl className="facts">
              <dt>프로젝트 제목</dt>
              <dd>{vm.project.title}</dd>
              <dt>모집</dt>
              <dd>{RECRUITMENT_LABEL[vm.project.recruitmentStatus] ?? vm.project.recruitmentStatus}</dd>
              <dt>거래</dt>
              <dd>{TRANSACTION_LABEL[vm.project.transactionStatus] ?? vm.project.transactionStatus}</dd>
            </dl>
          </section>
          <section className="panel">
            <h3 className="agreement-card-title">상대방</h3>
            <p className="body-strong">{vm.counterpart.displayName}</p>
            <p className="caption">{vm.viewerRole === "CLIENT" ? "프리랜서" : "의뢰인"}</p>
          </section>
        </>
      )}
      <section className="panel">
        <h3 className="agreement-card-title">유의사항</h3>
        <NotesList uiState={vm.uiState} />
      </section>
    </>
  );
}

function NotesList({ uiState }: { uiState: AgreementUiState }) {
  return <ul className="notes">{notesFor(uiState)}</ul>;
}

function notesFor(uiState: AgreementUiState): ReactNode {
  switch (uiState) {
    case "NOT_PROPOSED":
      return (
        <>
          <li>
            금액은 프리랜서가 수락할 때까지 <strong>제안</strong>입니다.
          </li>
          <li>수락하면 이 금액이 계약과 결제의 근거가 됩니다.</li>
          <li>거절하면 이 거래는 끝납니다.</li>
        </>
      );
    case "WAITING_RESPONSE":
      return (
        <>
          <li>이 금액은 아직 제안입니다. 프리랜서가 수락해야 계약 근거가 됩니다.</li>
          <li>응답 전에는 금액을 수정할 수 없습니다.</li>
        </>
      );
    case "ACTION_REQUIRED":
      return (
        <>
          <li>수락하면 이 금액이 계약과 결제의 근거가 됩니다. 이후 금액을 바꿀 수 없습니다.</li>
          <li>거절하면 이 거래는 끝납니다.</li>
        </>
      );
    case "AGREED":
      return (
        <>
          <li>이 금액은 더 이상 제안이 아니라 계약 근거입니다.</li>
          <li>서명 단계로 이동합니다. 양쪽이 서명해야 결제가 시작됩니다.</li>
        </>
      );
    case "REJECTED_REOPENED":
      return (
        <>
          <li>이 거래는 끝났습니다. 같은 제안으로 이어갈 수 없습니다.</li>
          <li>모집 마감 전에 거절되어 프로젝트가 다시 열렸습니다.</li>
        </>
      );
    case "REJECTED_CLOSED":
      return (
        <>
          <li>이 거래는 끝났습니다. 같은 제안으로 이어갈 수 없습니다.</li>
          <li>모집 마감 이후라 프로젝트를 다시 열지 않습니다.</li>
        </>
      );
    case "PROJECT_CANCELED":
      return <li>취소된 프로젝트에서는 제안·수락·거절을 할 수 없습니다.</li>;
    case "LOAD_FAILED":
      return <li>입력한 내용은 사라지지 않습니다. 다시 불러온 뒤 이어서 진행할 수 있습니다.</li>;
    case "STALE":
      return (
        <>
          <li>오래된 내용으로는 수락하거나 거절할 수 없습니다.</li>
          <li>최신 상태를 확인한 뒤에만 다음 행동을 고릅니다.</li>
        </>
      );
    case "FORBIDDEN":
      return <li>권한이 없는 화면에는 금액과 제안 이력을 보여 주지 않습니다.</li>;
    case "NOT_FOUND":
      return <li>없는 합의 주소로는 금액을 보여 주지 않습니다.</li>;
  }
}

function AcceptConfirmDialog({
  open,
  amount,
  onClose,
}: {
  open: boolean;
  amount: number;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      className={open ? "overlay-backdrop open" : "overlay-backdrop"}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="accept-title">
        <h2 className="title" id="accept-title">
          합의를 수락할까요?
        </h2>
        <p className="status-copy">
          제안 금액{" "}
          <strong>
            <Money amount={amount} />
          </strong>
          을 수락하면 이 금액이 계약과 결제의 근거가 됩니다. 수락 뒤에는 금액을 바꿀 수 없습니다.
        </p>
        <div className="btn-row">
          <Button variant="quiet" onClick={onClose}>
            닫기
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onClose();
              setBusy(false);
            }}
          >
            수락하기
          </Button>
        </div>
      </div>
    </div>
  );
}

function RejectConfirmDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [reasonCode, setReasonCode] = useState<(typeof REJECT_REASON_CODES)[number]["value"]>(
    "PRICE_NOT_ACCEPTABLE",
  );
  const [busy, setBusy] = useState(false);
  return (
    <div
      className={open ? "overlay-backdrop open" : "overlay-backdrop"}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog dialog-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-title"
      >
        <h2 className="title" id="reject-title">
          합의를 거절할까요?
        </h2>
        <p className="status-copy">
          거절하면 <strong>이 거래는 끝납니다</strong>. 프로젝트는 합의 전 상태로 돌아가고, 이
          제안은 되돌릴 수 없습니다.
        </p>
        <fieldset className="choice-list">
          <legend>거절 사유</legend>
          {REJECT_REASON_CODES.map((option) => (
            <label className="choice" key={option.value}>
              <input
                type="radio"
                name="reject-reason"
                value={option.value}
                checked={reasonCode === option.value}
                onChange={() => setReasonCode(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
        {reasonCode === "OTHER" ? (
          <div className="field-row">
            <label className="label" htmlFor="reject-reason-text">
              상세 사유
            </label>
            <textarea
              className="field"
              id="reject-reason-text"
              name="reason"
              maxLength={500}
              rows={4}
              placeholder="자세한 이유를 적어 주세요."
            />
            <p className="helper">기타를 고르면 상세 사유를 권장합니다. 최대 500자입니다.</p>
          </div>
        ) : null}
        <div className="btn-row">
          <Button variant="quiet" onClick={onClose}>
            닫기
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              onClose();
              setBusy(false);
            }}
          >
            거절 확인
          </Button>
        </div>
      </div>
    </div>
  );
}
