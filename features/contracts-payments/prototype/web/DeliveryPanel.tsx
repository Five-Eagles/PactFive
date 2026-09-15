import { useState, type ReactNode } from "react";
import type {
  ContractStatus,
  DeliveryPaymentStatus,
  DeliveryStatus,
  GetDeliveryResponse,
} from "../server/public-api.types";
import {
  toDeliveryViewModel,
  type DeliveryDetailViewModel,
  type DeliveryLoadError,
  type DeliveryUiState,
  type DeliveryViewerRole,
  type DeliveryViewerSession,
} from "./delivery.view-model";
import { Badge, Button, Money, Notice, type FeedbackTone } from "./ui";

export type DeliveryPanelProps = {
  vm?: DeliveryDetailViewModel;
  uiState?: DeliveryUiState;
  loading?: boolean;
  maxFileSizeMiB?: number;
  projectTitle?: string;
  amount?: number;
  initialModal?: "deliver" | "approve" | "download";
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";
const DEFAULT_AMOUNT = 1_000_000;
const DEFAULT_FILE = {
  fileName: "final-deliverable.zip",
  mimeType: "application/zip",
  sizeBytes: 1_048_576,
};

const LOAD_ERROR_STATES: ReadonlySet<DeliveryUiState> = new Set([
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

/** 납품 상세 페이지. ViewModel의 uiState로만 분기한다. */
export function DeliveryPanel({
  vm,
  uiState = "READY_TO_DELIVER",
  loading = false,
  maxFileSizeMiB = 100,
  projectTitle = DEFAULT_TITLE,
  amount = DEFAULT_AMOUNT,
  initialModal,
}: DeliveryPanelProps) {
  const source = vm ?? fixtureViewModel(uiState, projectTitle, amount);
  const resolved = {
    ...source,
    permissions: {
      ...source.permissions,
      canRequestDelivery: source.uiState === "READY_TO_DELIVER",
      canApprove: source.uiState === "ACTION_REQUIRED",
      canReview: source.uiState === "COMPLETED",
    },
  };
  const [deliverOpen, setDeliverOpen] = useState(initialModal === "deliver");
  const [approveOpen, setApproveOpen] = useState(initialModal === "approve");
  const [downloadOpen, setDownloadOpen] = useState(initialModal === "download");

  if (loading) return <DeliveryLoadingPage />;

  const { permissions } = resolved;
  const showFixedCta = permissions.canRequestDelivery || permissions.canApprove;

  return (
    <>
      <article className={showFixedCta ? "delivery-page has-fixed-cta" : "delivery-page"}>
        <DeliveryPageHead
          uiState={resolved.uiState}
          showLinks={Boolean(resolved.project.id)}
        />
        <div className="delivery-grid">
          <div className="delivery-main">
            <DeliveryMain vm={resolved} onDownload={() => setDownloadOpen(true)} />
          </div>
          <aside className="delivery-side">
            <DeliverySide vm={resolved} />
          </aside>
          {showFixedCta ? (
            <div className="delivery-cta-bar btn-row">
              {permissions.canApprove && resolved.permissions.canDownload ? (
                <Button variant="secondary" onClick={() => setDownloadOpen(true)}>
                  다운로드
                </Button>
              ) : null}
              {permissions.canRequestDelivery ? (
                <Button variant="primary" onClick={() => setDeliverOpen(true)}>
                  결과물 납품
                </Button>
              ) : null}
              {permissions.canApprove ? (
                <Button variant="primary" onClick={() => setApproveOpen(true)}>
                  완료 승인
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
      {permissions.canRequestDelivery ? (
        <DeliverDialog
          open={deliverOpen}
          maxFileSizeMiB={maxFileSizeMiB}
          onClose={() => setDeliverOpen(false)}
        />
      ) : null}
      {permissions.canApprove ? (
        <ApproveDialog
          open={approveOpen}
          fileName={resolved.delivery.file?.fileName ?? DEFAULT_FILE.fileName}
          amount={resolved.contract.amount || amount}
          onClose={() => setApproveOpen(false)}
        />
      ) : null}
      {resolved.permissions.canDownload ? (
        <DownloadDialog
          open={downloadOpen}
          file={resolved.delivery.file ?? DEFAULT_FILE}
          onClose={() => setDownloadOpen(false)}
        />
      ) : null}
    </>
  );
}

function fixtureViewModel(
  uiState: DeliveryUiState,
  projectTitle: string,
  amount: number,
): DeliveryDetailViewModel {
  const viewerRole: DeliveryViewerRole =
    uiState === "READY_TO_DELIVER" || uiState === "WAITING_REVIEW" ? "FREELANCER" : "CLIENT";
  const session: DeliveryViewerSession = {
    actorUserId: viewerRole === "CLIENT" ? "usr_client" : "usr_freelancer",
    clientId: "usr_client",
  };
  const loadError = LOAD_ERROR_STATES.has(uiState) ? (uiState as DeliveryLoadError) : null;
  return toDeliveryViewModel(fixtureDto(uiState, projectTitle, amount), session, loadError);
}

function fixtureDto(
  uiState: DeliveryUiState,
  projectTitle: string,
  amount: number,
): GetDeliveryResponse | null {
  if (LOAD_ERROR_STATES.has(uiState)) return null;
  const file = { ...DEFAULT_FILE };
  const requested: GetDeliveryResponse["delivery"] = {
    deliveryId: "dlv_preview",
    status: "DELIVERY_REQUESTED",
    version: 1,
    message: "작업 산출물을 첨부했습니다.",
    requestedAt: "2026-09-03T00:00:00Z",
    approvedAt: null,
    file,
  };
  const base = {
    contractId: "ctr_preview",
    projectId: "prj_preview",
    projectTitle,
    transactionStatus: "IN_PROGRESS" as const,
    canceledAt: null as string | null,
    contractStatus: "SIGNED" as ContractStatus,
    agreedAmount: amount,
    paymentStatus: "PAID" as DeliveryPaymentStatus,
    downloadUrl: null as string | null,
    canRequestDelivery: false,
    canApprove: false,
    canDownload: false,
    canReview: false,
  };
  if (uiState === "READY_TO_DELIVER" || uiState === "WORK_IN_PROGRESS") {
    return {
      ...base,
      delivery: {
        deliveryId: "dlv_preview",
        status: "IN_PROGRESS",
        version: 0,
        message: null,
        requestedAt: null,
        approvedAt: null,
        file: null,
      },
    };
  }
  if (uiState === "WAITING_REVIEW" || uiState === "ACTION_REQUIRED") {
    return { ...base, delivery: requested, downloadUrl: "https://example/short", canDownload: true };
  }
  if (uiState === "SETTLEMENT_PENDING") {
    return {
      ...base,
      delivery: { ...requested, status: "APPROVED" as DeliveryStatus, approvedAt: "2026-09-03T01:00:00Z" },
      canDownload: true,
    };
  }
  if (uiState === "COMPLETED") {
    return {
      ...base,
      transactionStatus: "COMPLETED",
      paymentStatus: "RELEASED",
      delivery: { ...requested, status: "APPROVED", approvedAt: "2026-09-03T01:00:00Z" },
      canDownload: true,
      canReview: true,
    };
  }
  if (uiState === "PROJECT_CANCELED") {
    return {
      ...base,
      transactionStatus: "CANCELED",
      canceledAt: "2026-09-01T00:00:00Z",
      delivery: null,
    };
  }
  return { ...base, delivery: null };
}

/** 제목과 계약·프로젝트·정산 텍스트 링크. 앱 셸은 넣지 않는다. */
function DeliveryPageHead({
  uiState,
  showLinks,
  showBadge = true,
}: {
  uiState: DeliveryUiState;
  showLinks: boolean;
  showBadge?: boolean;
}) {
  return (
    <header className="delivery-page-head">
      <div className="delivery-page-head-copy">
        <h2 className="page-title">납품 관리</h2>
        {showLinks ? (
          <p className="delivery-page-links">
            <a href="#project">프로젝트</a>
            <a href="#contract">계약</a>
            {uiState === "SETTLEMENT_PENDING" || uiState === "COMPLETED" ? (
              <a href="#settlement">정산 확인</a>
            ) : null}
          </p>
        ) : null}
      </div>
      {showBadge ? <DeliveryBadge uiState={uiState} /> : null}
    </header>
  );
}

function DeliveryBadge({ uiState }: { uiState: DeliveryUiState }) {
  const badge = badgeFor(uiState);
  return badge ? <Badge tone={badge.tone} label={badge.label} /> : null;
}

function badgeFor(uiState: DeliveryUiState): { tone: FeedbackTone; label: string } | null {
  switch (uiState) {
    case "READY_TO_DELIVER":
    case "WORK_IN_PROGRESS":
      return { tone: "info", label: "작업 중" };
    case "WAITING_REVIEW":
    case "ACTION_REQUIRED":
      return { tone: "warning", label: "검토 요청" };
    case "SETTLEMENT_PENDING":
      return { tone: "success", label: "승인" };
    case "COMPLETED":
      return { tone: "success", label: "완료" };
    case "PROJECT_CANCELED":
      return { tone: "danger", label: "취소됨" };
    default:
      return null;
  }
}

function DeliveryLoadingPage() {
  return (
    <article className="delivery-page" aria-busy="true">
      <DeliveryPageHead uiState="WORK_IN_PROGRESS" showLinks={false} showBadge={false} />
      <div className="delivery-grid">
        <div className="delivery-main">
          <section className="panel">
            <p className="helper">납품 내용을 불러오는 중입니다.</p>
            <div className="skeleton" />
            <div className="skeleton" />
          </section>
        </div>
        <aside className="delivery-side">
          <section className="panel">
            <div className="skeleton" />
          </section>
        </aside>
      </div>
    </article>
  );
}

function DeliveryMain({
  vm,
  onDownload,
}: {
  vm: DeliveryDetailViewModel;
  onDownload: () => void;
}) {
  const { uiState, permissions, delivery } = vm;
  return (
    <section className="panel">
      <DeliveryStatusBanner uiState={uiState} />
      {delivery.file && !LOAD_ERROR_STATES.has(uiState) ? (
        <div className="delivery-file">
          <p className="file-name">{delivery.file.fileName}</p>
          <p className="caption">{fileMeta(delivery.file)}</p>
        </div>
      ) : null}
      {delivery.message && !LOAD_ERROR_STATES.has(uiState) ? (
        <p className="status-copy">{delivery.message}</p>
      ) : null}
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
      {uiState === "WAITING_REVIEW" && permissions.canDownload ? (
        <div className="btn-row">
          <Button variant="secondary" onClick={onDownload}>
            다운로드
          </Button>
        </div>
      ) : null}
      {uiState === "SETTLEMENT_PENDING" ? (
        <div className="btn-row after-offer">
          {permissions.canDownload ? (
            <Button variant="secondary" onClick={onDownload}>
              다운로드
            </Button>
          ) : null}
          <a className="caption" href="#settlement">
            정산 확인
          </a>
        </div>
      ) : null}
      {uiState === "COMPLETED" ? (
        <div className="btn-row after-offer">
          {permissions.canDownload ? (
            <Button variant="secondary" onClick={onDownload}>
              다운로드
            </Button>
          ) : null}
          <a className="caption" href="#settlement">
            정산 확인
          </a>
          <Button variant="primary">리뷰 작성</Button>
        </div>
      ) : null}
    </section>
  );
}

function fileMeta(file: { mimeType: string; sizeBytes: number }): string {
  const mb = file.sizeBytes / (1024 * 1024);
  const size = mb >= 1 ? `${mb.toFixed(1)}MB` : `${Math.max(1, Math.round(file.sizeBytes / 1024))}KB`;
  const kind = file.mimeType.includes("zip") ? "ZIP" : file.mimeType;
  return `${kind} · ${size}`;
}

function DeliveryStatusBanner({ uiState }: { uiState: DeliveryUiState }) {
  switch (uiState) {
    case "LOAD_FAILED":
      return (
        <>
          <Notice tone="danger">납품 내용을 불러오지 못했습니다</Notice>
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
          <p className="status-copy">이 프로젝트는 더 이상 납품하거나 승인할 수 없습니다.</p>
        </>
      );
    case "FORBIDDEN":
      return (
        <>
          <Notice tone="warning">이 납품을 볼 수 있는 권한이 없습니다</Notice>
          <p className="status-copy">계약 당사자만 파일과 메시지를 확인할 수 있습니다.</p>
        </>
      );
    case "NOT_FOUND":
      return (
        <>
          <Notice tone="info">납품을 찾을 수 없습니다</Notice>
          <p className="status-copy">
            주소가 바뀌었거나 계약이 없을 수 있습니다. 프로젝트 화면에서 다시 들어와 주세요.
          </p>
        </>
      );
    case "READY_TO_DELIVER":
      return (
        <p className="status-copy" role="status">
          계약과 결제가 끝났습니다. <strong>결과물을 납품</strong>하면 의뢰인이 확인하고
          승인합니다. 제출 뒤에는 파일을 바꿀 수 없습니다.
        </p>
      );
    case "WORK_IN_PROGRESS":
      return (
        <p className="status-copy" role="status">
          프리랜서가 작업 중입니다. 결과물이 도착하면 여기에서 확인하고 승인할 수 있습니다.
        </p>
      );
    case "WAITING_REVIEW":
      return (
        <p className="status-copy" role="status">
          결과물을 제출했습니다. <strong>의뢰인의 완료 승인</strong>을 기다리는 중입니다.
        </p>
      );
    case "ACTION_REQUIRED":
      return (
        <p className="status-copy" role="status">
          프리랜서가 결과물을 보냈습니다. 파일을 확인한 뒤 <strong>완료 승인</strong>할 수
          있습니다. 승인하면 되돌릴 수 없습니다.
        </p>
      );
    case "SETTLEMENT_PENDING":
      return (
        <p className="status-copy" role="status">
          납품이 승인되었습니다. <strong>정산 처리 중</strong>입니다. 정산이 끝나야 거래가
          완료됩니다.
        </p>
      );
    case "COMPLETED":
      return (
        <p className="status-copy" role="status">
          정산까지 끝났습니다. 이 거래는 <strong>완료</strong>입니다. 상대를 평가해 주세요.
        </p>
      );
  }
}

function DeliverySide({ vm }: { vm: DeliveryDetailViewModel }) {
  const hide = LOAD_ERROR_STATES.has(vm.uiState) || !vm.project.title;
  return (
    <>
      {hide ? null : (
        <>
          <section className="panel">
            <h3 className="agreement-card-title">거래 진행</h3>
            <ProgressList vm={vm} />
          </section>
          <section className="panel" id="project">
            <h3 className="agreement-card-title">프로젝트</h3>
            <dl className="facts">
              <dt>프로젝트 제목</dt>
              <dd>{vm.project.title}</dd>
              <dt>거래</dt>
              <dd>{TRANSACTION_LABEL[vm.project.transactionStatus] ?? vm.project.transactionStatus}</dd>
            </dl>
            <p className="caption">
              <a id="contract" href="#contract">
                계약 확인
              </a>
            </p>
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

/** 끝난 단계만 완료 라벨을 쓴다. PAID는 정산 완료로 보이지 않는다. */
function ProgressList({ vm }: { vm: DeliveryDetailViewModel }) {
  const items: Array<[boolean, string, string]> = [
    [vm.progress.contractDone, "계약", "계약 완료"],
    [vm.progress.paymentDone, "결제", "결제 완료"],
    [vm.progress.requested, "납품", "결과물 제출"],
    [vm.progress.approved, "승인", "완료 승인"],
    [vm.progress.released, "정산", "정산 완료"],
  ];
  return (
    <ol className="progress-steps">
      {items.map(([done, stage, doneLabel]) => (
        <li key={stage} className={done ? "done" : undefined}>
          <span>{stage}</span>
          <span>{done ? doneLabel : "대기"}</span>
        </li>
      ))}
    </ol>
  );
}

function notesFor(uiState: DeliveryUiState): ReactNode {
  switch (uiState) {
    case "READY_TO_DELIVER":
      return (
        <>
          <li>납품은 한 번만 할 수 있습니다. 반려·재납품은 없습니다.</li>
          <li>의뢰인이 승인하면 정산이 시작됩니다.</li>
        </>
      );
    case "WORK_IN_PROGRESS":
      return <li>지금은 납품하거나 승인할 수 없습니다.</li>;
    case "WAITING_REVIEW":
      return <li>제출한 파일은 바꿀 수 없습니다.</li>;
    case "ACTION_REQUIRED":
      return <li>승인 후 납품을 되돌리거나 반려할 수 없으며 정산 절차가 시작됩니다.</li>;
    case "SETTLEMENT_PENDING":
      return <li>지금은 납품하거나 다시 승인할 수 없습니다.</li>;
    case "COMPLETED":
      return <li>리뷰는 거래가 완료된 뒤에만 작성합니다.</li>;
    case "PROJECT_CANCELED":
      return <li>취소된 프로젝트에서는 납품·승인을 할 수 없습니다.</li>;
    case "LOAD_FAILED":
      return <li>다시 불러온 뒤 이어서 진행할 수 있습니다.</li>;
    case "STALE":
      return <li>오래된 내용으로는 납품하거나 승인할 수 없습니다.</li>;
    case "FORBIDDEN":
      return <li>권한이 없는 화면에는 파일과 금액을 보여 주지 않습니다.</li>;
    case "NOT_FOUND":
      return <li>없는 납품 주소로는 파일을 보여 주지 않습니다.</li>;
  }
}

function DeliverDialog({
  open,
  maxFileSizeMiB,
  onClose,
}: {
  open: boolean;
  maxFileSizeMiB: number;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <div
      className={open ? "overlay-backdrop open" : "overlay-backdrop"}
      aria-hidden={open ? "false" : "true"}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog dialog-md" role="dialog" aria-modal="true" aria-labelledby="deliver-title">
        <h2 className="title" id="deliver-title">
          결과물 납품
        </h2>
        <p className="status-copy">
          파일 1개와 메시지를 보낸 뒤에는 교체할 수 없습니다. 서버가 허용한 형식만 올릴 수
          있습니다. 크기 상한은 {maxFileSizeMiB}MB입니다.
        </p>
        <p className="caption">제출하면 파일 안전성 검사를 진행합니다.</p>
        {submitting ? (
          <p className="status-copy" role="status">
            파일 안전성 검사를 진행하고 있습니다.
          </p>
        ) : null}
        <div className="field-row">
          <label className="label" htmlFor="deliver-file">
            결과물 파일
          </label>
          <input className="field" id="deliver-file" name="file" type="file" disabled={submitting} />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="deliver-message">
            납품 메시지
          </label>
          <textarea
            className="field"
            id="deliver-message"
            name="message"
            maxLength={1000}
            rows={4}
            placeholder="전달할 내용을 적어 주세요."
            disabled={submitting}
          />
        </div>
        <label className="choice">
          <input type="checkbox" name="confirm-once" disabled={submitting} />
          <span>제출 후 파일 교체·재납품이 불가함을 확인했습니다</span>
        </label>
        <div className="btn-row">
          <Button variant="quiet" onClick={onClose}>
            닫기
          </Button>
          <Button
            variant="primary"
            disabled={submitting}
            onClick={() => {
              if (submitting) return;
              setSubmitting(true);
            }}
          >
            납품 요청
          </Button>
        </div>
      </div>
    </div>
  );
}

function ApproveDialog({
  open,
  fileName,
  amount,
  onClose,
}: {
  open: boolean;
  fileName: string;
  amount: number;
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
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="approve-title">
        <h2 className="title" id="approve-title">
          납품을 승인할까요?
        </h2>
        <p className="status-copy">
          파일 <strong>{fileName}</strong>, 금액{" "}
          <strong>
            <Money amount={amount} />
          </strong>
          . 승인 후 납품을 되돌리거나 반려할 수 없으며 정산 절차가 시작됩니다.
        </p>
        <div className="btn-row">
          <Button variant="quiet" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={onClose}>
            완료 승인
          </Button>
        </div>
      </div>
    </div>
  );
}

function DownloadDialog({
  open,
  file,
  onClose,
}: {
  open: boolean;
  file: { fileName: string; mimeType: string; sizeBytes: number };
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
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="download-title">
        <h2 className="title" id="download-title">
          결과물을 받을까요?
        </h2>
        <p className="status-copy">
          {file.fileName} · {fileMeta(file)}. 받은 파일은 브라우저에서 자동으로 실행하지 마세요.
        </p>
        <div className="btn-row">
          <Button variant="quiet" onClick={onClose}>
            닫기
          </Button>
          <Button variant="primary" onClick={onClose}>
            다운로드
          </Button>
        </div>
      </div>
    </div>
  );
}
