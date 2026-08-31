import { Badge, Button, Money, Notice } from "./ui";

export type PaymentView = "checkout" | "keyMissing";

type PaymentPanelProps = {
  view?: PaymentView;
  amount?: number;
  projectTitle?: string;
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";

/** 결제 패널. 시크릿은 읽지 않고 view로 키 없음 상태를 받는다. */
export function PaymentPanel({
  view = "checkout",
  amount = 100_000,
  projectTitle = DEFAULT_TITLE,
}: PaymentPanelProps) {
  if (view === "keyMissing") {
    // 시크릿을 읽지 않는다. 결제하기와 가짜 성공을 두지 않는다.
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">결제</h2>
          <Badge tone="warning" label="연동 준비 중" />
        </div>
        <Notice tone="warning">결제 연동 준비 중</Notice>
        <p className="status-copy">
          지금은 결제를 진행할 수 없습니다. 연동이 끝나면 다시 시도해 주세요.
        </p>
        <div className="btn-row">
          <Button variant="secondary">다시 시도</Button>
        </div>
      </article>
    );
  }

  return (
    <article className="panel">
      <div className="panel-head">
        <h2 className="title">결제</h2>
        <Badge tone="neutral" label="결제 전" />
      </div>
      <p className="status-copy">
        계약이 체결되었습니다. <strong>의뢰인이 결제</strong>하면 작업이 시작됩니다.
      </p>
      <dl className="facts">
        <dt>프로젝트 제목</dt>
        <dd>{projectTitle}</dd>
        <dt>결제 금액</dt>
        <dd>
          <Money amount={amount} />
        </dd>
      </dl>
      <p className="helper">이 금액은 합의에서 확정된 값입니다. 화면에서 바꾸지 않습니다.</p>
      <div className="btn-row">
        <Button variant="primary">결제하기</Button>
      </div>
    </article>
  );
}
