import { useEffect, useRef, useState } from "react";

export type ApplicationView =
  | "apply"
  | "manage"
  | "manageEmpty"
  | "conflict"
  | "mine"
  | "mineDeleted"
  | "loading"
  | "loadFailed";

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

  if (view === "manageEmpty") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">지원자 관리</h2>
          <span className="badge info">대기 0</span>
        </div>
        <p className="status-copy">
          아직 지원자가 없습니다. 모집이 열려 있으면 프리랜서가 지원할 수 있습니다.
        </p>
      </article>
    );
  }

  if (view === "manage") {
    return <ManagePanel />;
  }

  if (view === "mineDeleted") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">내 지원 현황</h2>
          <span className="badge neutral">삭제됨</span>
        </div>
        <p className="notice warning" role="status">
          의뢰인이 삭제한 프로젝트입니다.
        </p>
        <p className="status-copy">
          지원 이력은 이 목록에 남습니다. 프로젝트 화면으로는 들어갈 수 없습니다.
        </p>
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
          <dd>랜딩 페이지 리뉴얼</dd>
          <dt>상태</dt>
          <dd>대기</dd>
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

/** 수락은 확인 다이얼로그 뒤에만 진행한다. 거절은 다이얼로그 없이 둔다. */
function ManagePanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const acceptTriggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  // 열리면 수락 확인으로 초점을 옮기고, 닫히면 수락으로 되돌린다.
  useEffect(() => {
    if (confirmOpen) {
      confirmRef.current?.focus();
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      acceptTriggerRef.current?.focus();
      wasOpenRef.current = false;
    }
  }, [confirmOpen]);

  // Esc로 닫는다. 숨겨진 다이얼로그에 초점이 남지 않게 한다.
  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setConfirmOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  return (
    <>
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
          <dd>김하린 · 1,000,000원 · 30일</dd>
        </dl>
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            ref={acceptTriggerRef}
            onClick={() => setConfirmOpen(true)}
          >
            수락
          </button>
          <button type="button" className="btn">
            거절
          </button>
        </div>
      </article>
      <div
        className={confirmOpen ? "overlay-backdrop open" : "overlay-backdrop"}
        aria-hidden={confirmOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) setConfirmOpen(false);
        }}
      >
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="accept-title">
          <h2 className="title" id="accept-title">
            이 지원자를 수락할까요?
          </h2>
          <p className="status-copy">
            수락하면 나머지 지원은 거절되고 <strong>되돌릴 수 없습니다</strong>.
          </p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setConfirmOpen(false)}>
              취소
            </button>
            <button
              type="button"
              className="btn primary"
              ref={confirmRef}
              onClick={() => setConfirmOpen(false)}
            >
              수락 확인
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
