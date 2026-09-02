import { Badge, Button, Money, Notice } from "./ui";

export type AgreementView =
  | "create"
  | "loading"
  | "loadFailed"
  | "stale"
  | "canceled"
  | "proposed"
  | "respond";

type AgreementPanelProps = {
  view?: AgreementView;
  amount?: number;
  projectTitle?: string;
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";
const DEFAULT_AMOUNT = 1_000_000;

/** 금액 합의 패널. 앱 셸 없이 상태 분기만 둔다. 문구는 design/agreement.html 과 같다. */
export function AgreementPanel({
  view = "create",
  amount = DEFAULT_AMOUNT,
  projectTitle = DEFAULT_TITLE,
}: AgreementPanelProps) {
  if (view === "loading") {
    return (
      <article className="panel" aria-busy="true">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
        </div>
        <p className="status-copy">로딩</p>
        <p className="helper">합의 내용을 불러오는 중입니다.</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </article>
    );
  }

  if (view === "loadFailed") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
        </div>
        <Notice tone="danger">LOAD_FAILED</Notice>
        <p className="status-copy">
          합의 내용을 불러오지 못했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.
        </p>
        <div className="btn-row">
          <Button variant="primary">다시 시도</Button>
        </div>
      </article>
    );
  }

  if (view === "stale") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
        </div>
        <Notice tone="warning">내용이 바뀌었습니다</Notice>
        <p className="status-copy">
          다른 당사자가 먼저 응답했거나 프로젝트가 바뀌었습니다. 최신 내용을 확인한 뒤
          이어서 진행하세요.
        </p>
        <div className="btn-row">
          <Button variant="primary">다시 불러오기</Button>
        </div>
      </article>
    );
  }

  if (view === "canceled") {
    // 취소 뒤에는 제안·수락·거절을 숨긴다 (규칙 17).
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
          <Badge tone="danger" label="취소됨" />
        </div>
        <Notice tone="danger">프로젝트가 취소되었습니다</Notice>
        <p className="status-copy">
          이 프로젝트는 더 이상 조건을 바꿀 수 없습니다. 새로운 거래가 필요하면 의뢰인이
          다시 모집해야 합니다.
        </p>
      </article>
    );
  }

  if (view === "proposed") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
          <Badge tone="warning" label="응답 대기" />
        </div>
        <p className="status-copy">
          의뢰인이 금액을 제안했습니다. <strong>프리랜서의 수락 또는 거절</strong>을 기다리는
          중입니다.
        </p>
        <dl className="facts">
          <dt>프로젝트 제목</dt>
          <dd>{projectTitle}</dd>
          <dt>합의 금액</dt>
          <dd>
            <Money amount={amount} />
          </dd>
        </dl>
        <p className="helper">지금은 바꿀 수 없습니다. 프리랜서가 응답하면 다음 단계로 갑니다.</p>
      </article>
    );
  }

  if (view === "respond") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">금액 합의</h2>
          <Badge tone="warning" label="응답 대기" />
        </div>
        <p className="status-copy">
          의뢰인이 아래 금액을 제안했습니다. <strong>지금 수락하거나 거절</strong>할 수
          있습니다. 거절하면 이 거래는 끝납니다.
        </p>
        <dl className="facts">
          <dt>프로젝트 제목</dt>
          <dd>{projectTitle}</dd>
          <dt>합의 금액</dt>
          <dd>
            <Money amount={amount} />
          </dd>
        </dl>
        <div className="btn-row">
          <Button variant="primary">수락하기</Button>
          <Button variant="danger">거절하기</Button>
        </div>
      </article>
    );
  }

  return (
    <form className="panel">
      <div className="panel-head">
        <h2 className="title">금액 합의</h2>
        <Badge tone="neutral" label="제안 전" />
      </div>
      <p className="status-copy">
        아직 제안이 없습니다. <strong>의뢰인이 금액을 제안</strong>하면 프리랜서가
        수락하거나 거절합니다.
      </p>
      <dl className="facts">
        <dt>프로젝트 제목</dt>
        <dd>{projectTitle}</dd>
      </dl>
      <div className="field-row">
        <label className="label" htmlFor="agreement-amount">
          합의 금액
        </label>
        <input
          className="field"
          id="agreement-amount"
          name="amount"
          inputMode="numeric"
          placeholder="금액"
        />
        <p className="helper">단위는 원입니다. 제안한 금액이 계약과 결제의 근거가 됩니다.</p>
      </div>
      <div className="btn-row">
        <Button variant="primary" type="submit">
          제안하기
        </Button>
      </div>
    </form>
  );
}
