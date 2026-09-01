import { Badge, Button, Money, Notice } from "./ui";

export type ContractSignView = "ready" | "waiting" | "canceled";

type ContractSignPanelProps = {
  view?: ContractSignView;
  amount?: number;
  projectTitle?: string;
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";
const DEFAULT_AMOUNT = 1_000_000;

/** 계약 서명 패널. 조건 근거(제목·금액)를 보여 주고 앱 셸은 넣지 않는다. */
export function ContractSignPanel({
  view = "ready",
  amount = DEFAULT_AMOUNT,
  projectTitle = DEFAULT_TITLE,
}: ContractSignPanelProps) {
  if (view === "canceled") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">계약 서명</h2>
          <Badge tone="danger" label="무효" />
        </div>
        <Notice tone="danger">프로젝트가 취소되었습니다</Notice>
        <p className="status-copy">
          서명을 진행할 수 없습니다. 이 계약은 더 이상 유효하지 않습니다.
        </p>
      </article>
    );
  }

  if (view === "waiting") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">계약 서명</h2>
          <Badge tone="warning" label="서명 중" />
        </div>
        <p className="status-copy">
          내 서명은 완료되었습니다. <strong>상대방의 서명</strong>을 기다리는 중입니다.
          양쪽이 서명하면 결제로 넘어갑니다.
        </p>
        <dl className="facts">
          <dt>프로젝트 제목</dt>
          <dd>{projectTitle}</dd>
          <dt>합의 금액</dt>
          <dd>
            <Money amount={amount} />
          </dd>
        </dl>
        <p className="helper">서명은 한 번만 기록됩니다. 상대가 서명할 때까지 기다려 주세요.</p>
      </article>
    );
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2 className="title">계약 서명</h2>
        <Badge tone="neutral" label="작성 중" />
      </div>
      <p className="status-copy">
        합의된 조건입니다. 내용을 확인한 뒤 <strong>서명하기</strong>를 누르면 이 계약에
        동의합니다. 상대도 같은 조건에 서명해야 결제가 시작됩니다.
      </p>
      <dl className="facts">
        <dt>프로젝트 제목</dt>
        <dd>{projectTitle}</dd>
        <dt>합의 금액</dt>
        <dd>
          <Money amount={amount} />
        </dd>
      </dl>
      <p className="helper">서명 뒤에는 이 금액을 바꿀 수 없습니다.</p>
      <div className="btn-row">
        <Button variant="primary">서명하기</Button>
      </div>
    </article>
  );
}
