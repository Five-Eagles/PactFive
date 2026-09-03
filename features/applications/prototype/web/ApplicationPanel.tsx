export type ApplicationView = "apply" | "manage" | "conflict" | "mine" | "loading" | "loadFailed";

type ApplicationPanelProps = {
  view?: ApplicationView;
};

/** 지원 화면. view로 규칙 10 UX 상태를 재현한다. 앱 셸은 넣지 않는다. */
export function ApplicationPanel({ view = "apply" }: ApplicationPanelProps) {
  if (view === "loading") {
    return (
      <article className="panel" aria-busy="true">
        <div className="panel-head">
          <h2 className="title">지원하기</h2>
        </div>
        <p className="helper">지원 화면을 불러오는 중입니다.</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </article>
    );
  }

  if (view === "loadFailed") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">지원하기</h2>
        </div>
        <p className="notice danger" role="alert">
          불러오지 못했습니다
        </p>
        <p className="status-copy">네트워크를 확인한 뒤 다시 시도해 주세요.</p>
        <div className="btn-row">
          <button type="button" className="btn primary">
            다시 시도
          </button>
        </div>
      </article>
    );
  }

  if (view === "conflict") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">지원자 관리</h2>
          <span className="badge warning">이미 수락됨</span>
        </div>
        <p className="notice warning" role="status">
          다른 지원자가 먼저 수락되었습니다
        </p>
        <p className="status-copy">목록을 새로 고친 뒤 남은 지원만 확인하세요.</p>
      </article>
    );
  }

  if (view === "manage") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">지원자 관리</h2>
          <span className="badge info">대기 1</span>
        </div>
        <p className="status-copy">
          <strong>지원자 목록</strong>에서 한 명을 고르면 나머지는 자동으로 거절됩니다. 수락은 되돌릴 수
          없습니다.
        </p>
        <dl className="facts">
          <dt>지원자 목록</dt>
          <dd>usr_freelancer_b · 1,000,000원 · 30일</dd>
        </dl>
        <div className="btn-row">
          <button type="button" className="btn primary">
            수락
          </button>
          <button type="button" className="btn">
            거절
          </button>
        </div>
      </article>
    );
  }

  if (view === "mine") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">내 지원 현황</h2>
          <span className="badge info">대기</span>
        </div>
        <p className="status-copy">
          제출한 지원은 프로젝트 상태와 함께 남습니다. 의뢰인이 삭제해도 이 목록에서 지워지지 않습니다.
        </p>
        <dl className="facts">
          <dt>프로젝트</dt>
          <dd>prj_open</dd>
          <dt>상태</dt>
          <dd>PENDING</dd>
        </dl>
      </article>
    );
  }

  return (
    <form className="panel">
      <div className="panel-head">
        <h2 className="title">지원하기</h2>
        <span className="badge info">모집 중</span>
      </div>
      <p className="status-copy">
        모집 중인 프로젝트에만 지원할 수 있습니다. 제출하면 같은 프로젝트에는 다시 넣을 수 없습니다.
      </p>
      <div className="field-row">
        <label className="label" htmlFor="cover">
          자기소개
        </label>
        <textarea className="field" id="cover" name="coverLetter" placeholder="자기소개" />
      </div>
      <div className="field-row">
        <label className="label" htmlFor="amount">
          희망 금액
        </label>
        <input className="field" id="amount" name="expectedAmount" placeholder="희망 금액" />
      </div>
      <div className="field-row">
        <label className="label" htmlFor="days">
          예상기간
        </label>
        <input className="field" id="days" name="expectedDurationDays" placeholder="예상기간" />
      </div>
      <div className="btn-row">
        <button type="submit" className="btn primary">
          지원하기
        </button>
      </div>
    </form>
  );
}
