export type ReviewView =
  | "empty"
  | "loading"
  | "loadFailed"
  | "duplicate"
  | "incomplete"
  | "canceled"
  | "submitted";

type ReviewPanelProps = {
  view?: ReviewView;
};

/** 리뷰 화면. view로 규칙 11 UX 상태를 재현한다. */
export function ReviewPanel({ view = "empty" }: ReviewPanelProps) {
  if (view === "loading") {
    return <p>로딩</p>;
  }
  if (view === "loadFailed") {
    return (
      <div>
        <p>LOAD_FAILED</p>
        <button type="button">다시 시도</button>
      </div>
    );
  }
  if (view === "duplicate") {
    return <p>이미 작성한 리뷰입니다</p>;
  }
  if (view === "incomplete") {
    return <p>거래가 완료되지 않았습니다</p>;
  }
  if (view === "canceled") {
    return <p>취소된 거래는 리뷰할 수 없습니다</p>;
  }
  if (view === "submitted") {
    // 제출 뒤에는 수정 버튼을 두지 않는다.
    return (
      <div>
        <p>별점</p>
        <p>5</p>
      </div>
    );
  }
  return (
    <form>
      <label>
        별점
        <input name="rating" placeholder="별점" />
      </label>
      <p>상대 리뷰는 아직 없습니다</p>
      <button type="submit">리뷰 작성</button>
    </form>
  );
}
