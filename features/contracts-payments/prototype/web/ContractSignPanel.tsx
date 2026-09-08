import { useState, type ReactNode } from "react";
import type { GetContractResponse } from "../server/public-api.types";
import {
  toContractViewModel,
  type ContractDetailViewModel,
  type ContractLoadError,
  type ContractUiState,
  type ContractViewerRole,
  type ContractViewerSession,
} from "./contract.view-model";
import { Badge, Button, Money, Notice, type FeedbackTone } from "./ui";

/** run.tsx 규칙 17이 아직 이 이름을 쓴다. 내부는 uiState로 변환한다. */
export type ContractSignView = "ready" | "waiting" | "canceled" | "loading" | "loadFailed";

export type ContractSignPanelProps = {
  vm?: ContractDetailViewModel;
  uiState?: ContractUiState;
  loading?: boolean;
  view?: ContractSignView;
  amount?: number;
  projectTitle?: string;
  initialModal?: "sign" | "signed";
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";
const DEFAULT_AMOUNT = 1_000_000;
const DEFAULT_PERIOD = { startDate: "2026-09-03", endDate: "2026-09-30" };

const LOAD_ERROR_STATES: ReadonlySet<ContractUiState> = new Set([
  "FORBIDDEN",
  "NOT_FOUND",
  "LOAD_FAILED",
  "STALE",
]);

const TRANSACTION_LABEL: Record<string, string> = {
  NONE: "거래 전",
  CONTRACT_PENDING: "계약 대기",
  IN_PROGRESS: "작업 중",
  COMPLETED: "완료",
  CANCELED: "취소됨",
};

function uiStateFromView(view: ContractSignView): ContractUiState {
  switch (view) {
    case "waiting":
      return "WAITING_COUNTERPART";
    case "canceled":
      return "PROJECT_CANCELED";
    case "loadFailed":
      return "LOAD_FAILED";
    default:
      return "READY_TO_SIGN";
  }
}

/** 종료·대기에서 서명·결제 버튼을 권한값과 관계없이 닫는다. */
function mutationPermissions(vm: ContractDetailViewModel): ContractDetailViewModel["permissions"] {
  if (LOAD_ERROR_STATES.has(vm.uiState) || vm.uiState === "PROJECT_CANCELED") {
    return { canSign: false, canPay: false };
  }
  if (vm.uiState === "WAITING_COUNTERPART" || vm.uiState === "SIGNED_PAYMENT_WAIT") {
    return { canSign: false, canPay: false };
  }
  if (vm.uiState === "IN_PROGRESS") return { canSign: false, canPay: false };
  return {
    canSign: vm.uiState === "READY_TO_SIGN",
    canPay: vm.uiState === "SIGNED_PAYMENT_REQUIRED",
  };
}

/** 계약 서명 페이지. ViewModel의 uiState로만 분기한다. */
export function ContractSignPanel({
  vm,
  uiState,
  loading = false,
  view = "ready",
  amount = DEFAULT_AMOUNT,
  projectTitle = DEFAULT_TITLE,
  initialModal,
}: ContractSignPanelProps) {
  const isLoading = loading || view === "loading";
  const source = vm ?? fixtureViewModel(uiState ?? uiStateFromView(view), projectTitle, amount);
  const resolved = { ...source, permissions: mutationPermissions(source) };
  const [signOpen, setSignOpen] = useState(initialModal === "sign");
  const [signedOpen, setSignedOpen] = useState(initialModal === "signed");
  const [consent, setConsent] = useState(false);

  if (isLoading) return <ContractLoadingPage />;

  const { permissions } = resolved;
  const showFixedCta = permissions.canSign || permissions.canPay;

  return (
    <>
      <article className={showFixedCta ? "contract-page has-fixed-cta" : "contract-page"}>
        <ContractPageHead uiState={resolved.uiState} showLinks={Boolean(resolved.project.id)} />
        <div className="contract-grid">
          <div className="contract-main">
            <ContractMain vm={resolved} />
          </div>
          <aside className="contract-side">
            <ContractSide vm={resolved} />
          </aside>
          {showFixedCta ? (
            <div className="contract-cta-bar btn-row">
              {permissions.canSign ? (
                <Button variant="primary" onClick={() => setSignOpen(true)}>
                  서명하기
                </Button>
              ) : null}
              {permissions.canPay ? (
                <Button variant="primary">결제하기</Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
      {permissions.canSign ? (
        <SignDialog
          open={signOpen}
          consent={consent}
          title={resolved.project.title || projectTitle}
          amount={resolved.contract.amount || amount}
          workPeriod={resolved.workPeriod}
          onConsentChange={setConsent}
          onClose={() => {
            setConsent(false);
            setSignOpen(false);
          }}
        />
      ) : null}
      {resolved.uiState === "SIGNED_PAYMENT_REQUIRED" ||
      resolved.uiState === "SIGNED_PAYMENT_WAIT" ||
      resolved.uiState === "IN_PROGRESS" ? (
        <SignedDialog
          open={signedOpen}
          signedAt={resolved.signedAt}
          viewerRole={resolved.viewerRole}
          onClose={() => setSignedOpen(false)}
        />
      ) : null}
    </>
  );
}

function fixtureViewModel(
  uiState: ContractUiState,
  projectTitle: string,
  amount: number,
): ContractDetailViewModel {
  const viewerRole: ContractViewerRole =
    uiState === "SIGNED_PAYMENT_WAIT" || uiState === "WAITING_COUNTERPART"
      ? "FREELANCER"
      : "CLIENT";
  const session: ContractViewerSession = {
    actorUserId: viewerRole === "CLIENT" ? "usr_client" : "usr_freelancer",
    clientId: "usr_client",
  };
  const loadError = LOAD_ERROR_STATES.has(uiState) ? (uiState as ContractLoadError) : null;
  return toContractViewModel(fixtureDto(uiState, projectTitle, amount), session, loadError);
}

function fixtureDto(
  uiState: ContractUiState,
  projectTitle: string,
  amount: number,
): GetContractResponse | null {
  if (LOAD_ERROR_STATES.has(uiState)) return null;
  const termsSnapshot = { schemaVersion: 1 as const, amount, currency: "KRW" as const, projectTitle };
  const base: GetContractResponse = {
    contractId: "ctr_preview",
    projectId: "prj_preview",
    status: "DRAFT",
    termsSnapshot,
    workStartDate: DEFAULT_PERIOD.startDate,
    workEndDate: DEFAULT_PERIOD.endDate,
    clientSignedAt: null,
    freelancerSignedAt: null,
    signedAt: null,
    transactionStatus: "CONTRACT_PENDING",
    canceledAt: null,
    paymentStatus: null,
  };
  if (uiState === "READY_TO_SIGN") return base;
  if (uiState === "WAITING_COUNTERPART") {
    return {
      ...base,
      status: "SIGNING",
      freelancerSignedAt: "2026-09-03T00:00:00Z",
    };
  }
  if (uiState === "SIGNED_PAYMENT_REQUIRED" || uiState === "SIGNED_PAYMENT_WAIT") {
    return {
      ...base,
      status: "SIGNED",
      clientSignedAt: "2026-09-03T00:00:00Z",
      freelancerSignedAt: "2026-09-03T01:00:00Z",
      signedAt: "2026-09-03T01:00:00Z",
      paymentStatus: "READY",
    };
  }
  if (uiState === "IN_PROGRESS") {
    return {
      ...base,
      status: "SIGNED",
      clientSignedAt: "2026-09-03T00:00:00Z",
      freelancerSignedAt: "2026-09-03T01:00:00Z",
      signedAt: "2026-09-03T01:00:00Z",
      transactionStatus: "IN_PROGRESS",
      paymentStatus: "PAID",
    };
  }
  if (uiState === "PROJECT_CANCELED") {
    return {
      ...base,
      status: "CANCELED",
      transactionStatus: "CANCELED",
      canceledAt: "2026-09-01T00:00:00Z",
    };
  }
  return base;
}

function ContractPageHead({
  uiState,
  showLinks,
  showBadge = true,
}: {
  uiState: ContractUiState;
  showLinks: boolean;
  showBadge?: boolean;
}) {
  return (
    <header className="contract-page-head">
      <div className="contract-page-head-copy">
        <h2 className="page-title">계약 서명</h2>
        {showLinks ? (
          <p className="contract-page-links">
            <a href="#project">프로젝트</a>
          </p>
        ) : null}
      </div>
      {showBadge ? <ContractBadge uiState={uiState} /> : null}
    </header>
  );
}

function ContractBadge({ uiState }: { uiState: ContractUiState }) {
  const badge = badgeFor(uiState);
  return badge ? <Badge tone={badge.tone} label={badge.label} /> : null;
}

function badgeFor(uiState: ContractUiState): { tone: FeedbackTone; label: string } | null {
  switch (uiState) {
    case "READY_TO_SIGN":
      return { tone: "neutral", label: "작성 중" };
    case "WAITING_COUNTERPART":
      return { tone: "warning", label: "서명 중" };
    case "SIGNED_PAYMENT_REQUIRED":
    case "SIGNED_PAYMENT_WAIT":
      return { tone: "success", label: "체결" };
    case "IN_PROGRESS":
      return { tone: "success", label: "체결" };
    case "PROJECT_CANCELED":
      return { tone: "danger", label: "무효" };
    default:
      return null;
  }
}

function ContractLoadingPage() {
  return (
    <article className="contract-page" aria-busy="true">
      <ContractPageHead uiState="READY_TO_SIGN" showLinks={false} showBadge={false} />
      <div className="contract-grid">
        <div className="contract-main">
          <section className="panel">
            <p className="helper">계약 내용을 불러오는 중입니다.</p>
            <div className="skeleton" />
            <div className="skeleton" />
          </section>
        </div>
        <aside className="contract-side">
          <section className="panel">
            <div className="skeleton" />
          </section>
        </aside>
      </div>
    </article>
  );
}

function ContractMain({ vm }: { vm: ContractDetailViewModel }) {
  const { uiState, contract, workPeriod } = vm;
  return (
    <section className="panel">
      <ContractStatusBanner uiState={uiState} />
      {LOAD_ERROR_STATES.has(uiState) || uiState === "PROJECT_CANCELED" ? null : (
        <dl className="facts">
          <dt>프로젝트 제목</dt>
          <dd>{vm.project.title}</dd>
          <dt>합의 금액</dt>
          <dd>
            <Money amount={contract.amount} />
          </dd>
          <dt>작업 기간</dt>
          <dd>
            {workPeriod.startDate} ~ {workPeriod.endDate}
          </dd>
        </dl>
      )}
      {uiState === "LOAD_FAILED" ? (
        <div className="btn-row">
          <Button variant="primary">다시 시도</Button>
        </div>
      ) : null}
      {uiState === "STALE" ? (
        <div className="btn-row">
          <Button variant="primary">다시 불러오기</Button>
        </div>
      ) : null}
      {uiState === "FORBIDDEN" || uiState === "NOT_FOUND" ? (
        <div className="btn-row after-offer">
          <Button variant="primary">프로젝트 확인</Button>
        </div>
      ) : null}
      {uiState === "IN_PROGRESS" ? (
        <div className="btn-row after-offer">
          <Button variant="primary">프로젝트 확인</Button>
        </div>
      ) : null}
      {LOAD_ERROR_STATES.has(uiState) || uiState === "PROJECT_CANCELED" ? null : (
        <p className="helper">
          이 서명은 플랫폼 내부 전자 동의입니다. 공증이나 공인전자서명을 뜻하지 않습니다.
        </p>
      )}
    </section>
  );
}

function ContractStatusBanner({ uiState }: { uiState: ContractUiState }) {
  switch (uiState) {
    case "LOAD_FAILED":
      return (
        <>
          <Notice tone="danger">계약 내용을 불러오지 못했습니다</Notice>
          <p className="status-copy">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        </>
      );
    case "STALE":
      return (
        <>
          <Notice tone="warning">내용이 바뀌었습니다</Notice>
          <p className="status-copy">최신 계약을 다시 확인한 뒤 이어서 진행하세요.</p>
        </>
      );
    case "PROJECT_CANCELED":
      return (
        <>
          <Notice tone="danger">프로젝트가 취소되었습니다</Notice>
          <p className="status-copy">프로젝트가 취소되었습니다. 기존 서명 기록은 보존됩니다.</p>
        </>
      );
    case "FORBIDDEN":
      return (
        <>
          <Notice tone="warning">이 계약을 볼 수 있는 권한이 없습니다</Notice>
          <p className="status-copy">계약 당사자만 내용과 금액을 확인할 수 있습니다.</p>
        </>
      );
    case "NOT_FOUND":
      return (
        <>
          <Notice tone="info">계약을 찾을 수 없습니다</Notice>
          <p className="status-copy">주소가 바뀌었거나 계약이 없을 수 있습니다. 프로젝트 화면에서 다시 들어와 주세요.</p>
        </>
      );
    case "READY_TO_SIGN":
      return (
        <p className="status-copy" role="status">
          합의된 조건입니다. 내용을 확인한 뒤 <strong>서명하기</strong>를 누르면 이 계약에
          동의합니다. 상대도 같은 조건에 서명해야 결제가 시작됩니다.
        </p>
      );
    case "WAITING_COUNTERPART":
      return (
        <p className="status-copy" role="status">
          내 서명은 완료되었습니다. <strong>상대방의 서명</strong>을 기다리는 중입니다.
          양쪽이 서명하면 결제로 넘어갑니다.
        </p>
      );
    case "SIGNED_PAYMENT_REQUIRED":
      return (
        <p className="status-copy" role="status">
          양측 서명이 끝났습니다. <strong>결제</strong>가 끝나야 작업이 시작됩니다.
        </p>
      );
    case "SIGNED_PAYMENT_WAIT":
      return (
        <p className="status-copy" role="status">
          양측 서명이 끝났습니다. <strong>의뢰인 결제</strong>를 기다리는 중입니다.
        </p>
      );
    case "IN_PROGRESS":
      return (
        <p className="status-copy" role="status">
          계약과 결제가 끝났습니다. 이 거래는 <strong>작업 중</strong>입니다.
        </p>
      );
  }
}

function ContractSide({ vm }: { vm: ContractDetailViewModel }) {
  const hide = LOAD_ERROR_STATES.has(vm.uiState) || !vm.project.title;
  return (
    <>
      {hide ? null : (
        <>
          <section className="panel">
            <h3 className="agreement-card-title">서명 현황</h3>
            <ol className="progress-steps">
              {vm.parties.map((party) => (
                <li key={party.role} className={party.signedAt ? "done" : undefined}>
                  <span>{party.role === "CLIENT" ? "의뢰인" : "프리랜서"}</span>
                  <span>
                    {party.statusLabel}
                    {party.signedAt ? ` · ${party.signedAt.slice(0, 10)}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section className="panel" id="project">
            <h3 className="agreement-card-title">프로젝트</h3>
            <dl className="facts">
              <dt>프로젝트 제목</dt>
              <dd>{vm.project.title}</dd>
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
        <ul className="notes">{notesFor(vm.uiState)}</ul>
      </section>
    </>
  );
}

function notesFor(uiState: ContractUiState): ReactNode {
  switch (uiState) {
    case "READY_TO_SIGN":
      return (
        <>
          <li>서명 뒤에는 이 금액을 바꿀 수 없습니다.</li>
          <li>누구나 먼저 서명할 수 있습니다.</li>
        </>
      );
    case "WAITING_COUNTERPART":
      return <li>서명은 한 번만 기록됩니다. 상대가 서명할 때까지 기다려 주세요.</li>;
    case "SIGNED_PAYMENT_REQUIRED":
      return <li>결제가 끝나야 작업이 시작됩니다. 체결만으로 작업을 시작하지 않습니다.</li>;
    case "SIGNED_PAYMENT_WAIT":
      return <li>의뢰인이 결제해야 작업이 시작됩니다.</li>;
    case "IN_PROGRESS":
      return <li>계약과 결제가 모두 끝난 뒤에만 작업을 시작합니다.</li>;
    case "PROJECT_CANCELED":
      return <li>취소된 프로젝트에서는 서명할 수 없습니다.</li>;
    case "LOAD_FAILED":
      return <li>다시 불러온 뒤 이어서 진행할 수 있습니다.</li>;
    case "STALE":
      return <li>오래된 내용으로는 서명할 수 없습니다.</li>;
    case "FORBIDDEN":
      return <li>권한이 없는 화면에는 금액과 조건을 보여 주지 않습니다.</li>;
    case "NOT_FOUND":
      return <li>없는 계약 주소로는 금액을 보여 주지 않습니다.</li>;
  }
}

function SignDialog({
  open,
  consent,
  title,
  amount,
  workPeriod,
  onConsentChange,
  onClose,
}: {
  open: boolean;
  consent: boolean;
  title: string;
  amount: number;
  workPeriod: { startDate: string; endDate: string };
  onConsentChange: (value: boolean) => void;
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
      <div className="dialog dialog-md" role="dialog" aria-modal="true" aria-labelledby="sign-title">
        <h2 className="title" id="sign-title">
          계약 내용에 동의하고 서명할까요?
        </h2>
        <p className="status-copy">
          {title}, 금액{" "}
          <strong>
            <Money amount={amount} />
          </strong>
          , 기간 {workPeriod.startDate} ~ {workPeriod.endDate}.
        </p>
        <label className="choice">
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(event) => onConsentChange(event.target.checked)}
          />
          <span>본인이 계약 당사자이며 현재 표시된 내용에 동의합니다</span>
        </label>
        <div className="btn-row">
          <Button variant="quiet" onClick={onClose}>
            계약서 다시 보기
          </Button>
          <Button variant="primary" disabled={!consent} onClick={onClose}>
            동의하고 서명하기
          </Button>
        </div>
      </div>
    </div>
  );
}

function SignedDialog({
  open,
  signedAt,
  viewerRole,
  onClose,
}: {
  open: boolean;
  signedAt: string | null;
  viewerRole: ContractViewerRole;
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
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="signed-title">
        <h2 className="title" id="signed-title">
          양측 서명이 완료되었습니다
        </h2>
        <p className="status-copy">
          {signedAt ? `${signedAt.slice(0, 10)}에 체결되었습니다.` : "계약이 체결되었습니다."} 체결만으로
          작업이 시작되지 않습니다.
        </p>
        <div className="btn-row">
          <Button variant="quiet" onClick={onClose}>
            닫기
          </Button>
          {viewerRole === "CLIENT" ? (
            <Button variant="primary" onClick={onClose}>
              결제하기
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose}>
              프로젝트 확인
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
