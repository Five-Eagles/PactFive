export type ContractSignView = "draft" | "canceled";

type ContractSignPanelProps = {
  view?: ContractSignView;
};

/** 서명 화면. 취소되면 서명하기를 숨긴다. */
export function ContractSignPanel({ view = "draft" }: ContractSignPanelProps) {
  if (view === "canceled") {
    return <p>프로젝트가 취소되었습니다.</p>;
  }
  return (
    <div>
      <h1>계약 조건</h1>
      <p>terms_snapshot</p>
      <button type="button">서명하기</button>
    </div>
  );
}
