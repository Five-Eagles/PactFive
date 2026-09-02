import { Badge, Button, Money, Notice } from "./ui";

export type PaymentView = "checkout" | "keyMissing" | "pending" | "paid" | "failed";

type PaymentPanelProps = {
  view?: PaymentView;
  amount?: number;
  projectTitle?: string;
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";

/** 규칙 19 · D-14. GET DTO는 amount만 있어 화면에서 같은 공식으로 나눈다. */
function splitPaymentAmount(amount: number) {
  const platformFeeAmount = Math.floor(amount * 0.1);
  return {
    platformFeeAmount,
    settlementAmount: amount - platformFeeAmount,
  };
}

function PaymentFacts({ amount, projectTitle }: { amount: number; projectTitle: string }) {
  const { platformFeeAmount, settlementAmount } = splitPaymentAmount(amount);
  return (
    <dl className="facts">
      <dt>프로젝트 제목</dt>
      <dd>{projectTitle}</dd>
      <dt>결제 금액</dt>
      <dd>
        <Money amount={amount} />
      </dd>
      <dt>플랫폼 수수료</dt>
      <dd>
        <Money amount={platformFeeAmount} />
      </dd>
      <dt>정산액</dt>
      <dd>
        <Money amount={settlementAmount} />
      </dd>
    </dl>
  );
}

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

  if (view === "pending") {
    return (
      <article className="panel" aria-busy="true">
        <div className="panel-head">
          <h2 className="title">결제</h2>
          <Badge tone="warning" label="처리 중" />
        </div>
        <p className="status-copy">
          결제를 확인하고 있습니다. <strong>잠시만 기다려 주세요</strong>.
        </p>
        <PaymentFacts amount={amount} projectTitle={projectTitle} />
        <div className="btn-row">
          <Button variant="primary" disabled>
            결제하기
          </Button>
        </div>
      </article>
    );
  }

  if (view === "paid") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">결제</h2>
          <Badge tone="success" label="결제 완료" />
        </div>
        <p className="status-copy">
          결제가 완료되었습니다. 거래가 <strong>진행 중</strong>입니다.
        </p>
        <PaymentFacts amount={amount} projectTitle={projectTitle} />
      </article>
    );
  }

  if (view === "failed") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">결제</h2>
          <Badge tone="danger" label="결제 실패" />
        </div>
        <Notice tone="danger">결제 실패</Notice>
        <p className="status-copy">실패한 결제는 쓰지 않고, 같은 결제로 다시 시도합니다.</p>
        <PaymentFacts amount={amount} projectTitle={projectTitle} />
        <div className="btn-row">
          <Button variant="primary">다시 결제</Button>
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
        의뢰인이 결제하면 거래가 <strong>진행 중</strong>으로 바뀝니다.
      </p>
      <PaymentFacts amount={amount} projectTitle={projectTitle} />
      <p className="helper">
        이 금액은 합의에서 확정된 값입니다. 수수료는 10%(원 미만 버림)이며 화면에서 바꾸지
        않습니다.
      </p>
      <div className="btn-row">
        <Button variant="primary">결제하기</Button>
      </div>
    </article>
  );
}
