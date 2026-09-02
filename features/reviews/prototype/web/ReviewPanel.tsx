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

/** 리뷰 화면. view로 규칙 11 UX 상태를 재현한다. 앱 셸은 넣지 않는다. */
export function ReviewPanel({ view = "empty" }: ReviewPanelProps) {
  if (view === "loading") {
    return (
      <article className="panel" aria-busy="true">
        <div className="panel-head">
          <h2 className="title">리뷰</h2>
        </div>
        <p className="helper">리뷰 화면을 불러오는 중입니다.</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </article>
    );
  }

  if (view === "loadFailed") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">리뷰</h2>
        </div>
        <p className="notice danger" role="alert">
          리뷰를 불러오지 못했습니다
        </p>
        <p className="status-copy">
          네트워크를 확인한 뒤 다시 시도해 주세요.
        </p>
        <div className="btn-row">
          <button type="button" className="btn primary">
            다시 시도
          </button>
        </div>
      </article>
    );
  }

  if (view === "duplicate") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">리뷰</h2>
          <span className="badge success">작성 완료</span>
        </div>
        <p className="notice info" role="status">
          이미 작성한 리뷰입니다
        </p>
        <p className="status-copy">
          이 거래의 리뷰는 한 번만 작성할 수 있습니다. 제출한 내용은 바꿀 수 없습니다.
        </p>
      </article>
    );
  }

  if (view === "incomplete") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">리뷰</h2>
          <span className="badge warning">거래 미완료</span>
        </div>
        <p className="notice warning" role="status">
          거래가 완료되지 않았습니다
        </p>
        <p className="status-copy">
          거래가 완료되면 리뷰를 작성할 수 있습니다. 지금은 완료를 기다려 주세요.
        </p>
      </article>
    );
  }

  if (view === "canceled") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">리뷰</h2>
          <span className="badge danger">취소됨</span>
        </div>
        <p className="notice danger" role="alert">
          취소된 거래는 리뷰할 수 없습니다
        </p>
        <p className="status-copy">
          이 프로젝트는 취소되었습니다. 리뷰를 남길 수 있는 거래가 아닙니다.
        </p>
      </article>
    );
  }

  if (view === "submitted") {
    // 제출 뒤에는 수정 버튼을 두지 않는다. "수정" 문구도 넣지 않는다.
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">리뷰</h2>
          <span className="badge success">제출됨</span>
        </div>
        <p className="status-copy">제출한 리뷰는 다시 작성할 수 없습니다.</p>
        <p className="helper">
          상대가 없으면 첫 리뷰 후 14일이 지나면 이 리뷰가 공개됩니다.
        </p>
        <dl className="facts">
          <dt>별점</dt>
          <dd className="money">5</dd>
        </dl>
      </article>
    );
  }

  return (
    <form className="panel">
      <div className="panel-head">
        <h2 className="title">리뷰</h2>
        <span className="badge info">작성 전</span>
      </div>
      <p className="status-copy">
        거래가 완료되었습니다. <strong>상대가 작성하기 전</strong>에는 상대 리뷰가 보이지
        않습니다. 별점을 입력한 뒤 리뷰 작성을 누르세요.
      </p>
      <div className="field-row">
        <label className="label" htmlFor="rating">
          별점
        </label>
        <input className="field" id="rating" name="rating" placeholder="별점" />
        <p className="helper">1부터 5까지. 제출하면 바꿀 수 없습니다.</p>
      </div>
      <p className="notice info" role="status">
        상대 리뷰는 아직 없습니다
      </p>
      <p className="helper">
        상대가 없으면 첫 리뷰 후 14일이 지나면 이 리뷰가 공개됩니다.
      </p>
      <div className="btn-row">
        <button type="submit" className="btn primary">
          리뷰 작성
        </button>
      </div>
    </form>
  );
}
