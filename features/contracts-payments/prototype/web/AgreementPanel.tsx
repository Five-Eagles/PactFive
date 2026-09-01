export type AgreementView = "empty" | "loading" | "loadFailed" | "stale" | "canceled" | "proposed";

type AgreementPanelProps = {
  view?: AgreementView;
};

/** 합의 화면. view로 Increment 1 UX 상태를 재현한다. */
export function AgreementPanel({ view = "empty" }: AgreementPanelProps) {
  if (view === "loading") {
    return <p>로딩</p>;
  }
  if (view === "loadFailed") {
    return (
      <div>
        <p>합의를 불러오지 못했습니다.</p>
        <button type="button">다시 시도</button>
      </div>
    );
  }
  if (view === "stale") {
    return (
      <div>
        <p>프로젝트 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.</p>
        <button type="button">다시 조회</button>
      </div>
    );
  }
  if (view === "canceled") {
    return <p>프로젝트가 취소되었습니다.</p>;
  }
  if (view === "proposed") {
    return (
      <div>
        <p>제안 금액</p>
        <p>100000 KRW</p>
        <button type="button">수락</button>
        <button type="button">거절</button>
      </div>
    );
  }
  return (
    <form>
      <label>
        제안 금액
        <input name="amount" placeholder="제안 금액" />
      </label>
      <button type="submit">제안하기</button>
    </form>
  );
}
