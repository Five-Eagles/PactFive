import { useEffect, useRef, useState } from "react";
import { MSG_ACCEPT_QUEUED, MSG_PROFILE_INCOMPLETE, MSG_PROJECT_CANCELED, REJECTION_COPY } from "../server/application.constants";

export type ApplicationView =
  | "apply"
  | "applyBlocked"
  | "manage"
  | "manageEmpty"
  | "conflict"
  | "acceptQueued"
  | "mine"
  | "mineSelected"
  | "mineCompleted"
  | "mineRejected"
  | "mineCanceled"
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

  if (view === "applyBlocked") {
    return (
      <form className="panel" aria-disabled="true" onSubmit={(event) => event.preventDefault()}>
        <div className="panel-head">
          <h2 className="title">지원하기</h2>
          <span className="badge warning">프로필 미완성</span>
        </div>
        <p className="notice warning" role="status">
          {MSG_PROFILE_INCOMPLETE}
        </p>
        <p className="status-copy">필수 프로필을 완성한 뒤에 지원서를 작성할 수 있습니다.</p>
        <div className="field-row">
          <label className="label" htmlFor="cover-blocked">
            자기소개
          </label>
          <textarea className="field" id="cover-blocked" name="coverLetter" placeholder="자기소개" disabled />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="amount-blocked">
            희망 금액
          </label>
          <input className="field" id="amount-blocked" name="expectedAmount" placeholder="희망 금액" disabled />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="days-blocked">
            예상기간
          </label>
          <input className="field" id="days-blocked" name="expectedDurationDays" placeholder="예상기간" disabled />
        </div>
        <div className="btn-row">
          <button type="submit" className="btn primary" disabled>
            지원하기
          </button>
        </div>
      </form>
    );
  }

  if (view === "acceptQueued") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">지원자 관리</h2>
          <span className="badge info">후속 처리</span>
        </div>
        <p className="notice warning" role="status">
          {MSG_ACCEPT_QUEUED}
        </p>
        <p className="status-copy">선정은 확정됐습니다. 나머지 지원 거절과 알림은 이어서 처리합니다.</p>
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

  if (view === "mineCanceled") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">내 지원 현황</h2>
          <span className="badge warning">취소됨</span>
        </div>
        <p className="notice warning" role="status">
          {MSG_PROJECT_CANCELED}
        </p>
        <p className="status-copy">지원 이력은 남습니다. 모집이 취소되어 선정으로 이어지지 않습니다.</p>
      </article>
    );
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

  if (view === "mineCompleted") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">내 지원 현황</h2>
          <span className="badge success">완료됨</span>
        </div>
        <p className="status-copy">
          거래가 완료되었습니다. 리뷰를 작성할 수 있습니다.
        </p>
        <dl className="facts">
          <dt>프로젝트</dt>
          <dd>랜딩 페이지 리뉴얼</dd>
          <dt>상태</dt>
          <dd>완료됨</dd>
        </dl>
        <div className="btn-row">
          <a className="btn primary" href="/projects/prj_completed/reviews">
            리뷰 작성
          </a>
        </div>
      </article>
    );
  }

  if (view === "mineSelected") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">내 지원 현황</h2>
          <span className="badge success">선정됨</span>
        </div>
        <p className="status-copy">선정됨이며 계약 체결 완료가 아닙니다. 금액 합의는 별도 화면에서 이어집니다.</p>
        <dl className="facts">
          <dt>프로젝트</dt>
          <dd>랜딩 페이지 리뉴얼</dd>
          <dt>상태</dt>
          <dd>선정됨</dd>
        </dl>
      </article>
    );
  }

  if (view === "mineRejected") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">내 지원 현황</h2>
          <span className="badge warning">미선정</span>
        </div>
        <p className="status-copy">이번 지원은 미선정입니다. 사유는 정해진 안내만 보여 줍니다.</p>
        <dl className="facts">
          <dt>프로젝트</dt>
          <dd>랜딩 페이지 리뉴얼</dd>
          <dt>상태</dt>
          <dd>미선정</dd>
        </dl>
        <p className="status-copy">{REJECTION_COPY.DIRECT}</p>
        <p className="status-copy">{REJECTION_COPY.AUTO_OTHER_ACCEPTED}</p>
        <p className="status-copy">{REJECTION_COPY.AUTO_RECRUITMENT_CLOSED}</p>
        <p className="status-copy">{REJECTION_COPY.AGREEMENT_DECLINED}</p>
      </article>
    );
  }

  if (view === "mine") {
    return (
      <article className="panel">
        <div className="panel-head">
          <h2 className="title">내 지원 현황</h2>
          <span className="badge info">검토 중</span>
        </div>
        <p className="status-copy">
          제출한 지원은 프로젝트 상태와 함께 남습니다. 의뢰인이 삭제해도 이 목록에서 지워지지 않습니다.
        </p>
        <dl className="facts">
          <dt>프로젝트</dt>
          <dd>랜딩 페이지 리뉴얼</dd>
          <dt>상태</dt>
          <dd>검토 중</dd>
        </dl>
      </article>
    );
  }

  return <ApplyPanel />;
}

function formatWon(raw: string): string {
  const amount = Number(raw.replace(/,/g, ""));
  if (!Number.isInteger(amount)) return raw;
  return `${amount.toLocaleString("ko-KR")}원`;
}

/** 제출 확인 뒤에만 POST한다. 금액·기간을 모달에 다시 보여 준다. */
function ApplyPanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [amount, setAmount] = useState("1000000");
  const [days, setDays] = useState("30");
  const confirmRef = useRef<HTMLButtonElement>(null);
  const submitTriggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (confirmOpen) {
      confirmRef.current?.focus();
      wasOpenRef.current = true;
      return;
    }
    if (wasOpenRef.current) {
      submitTriggerRef.current?.focus();
      wasOpenRef.current = false;
    }
  }, [confirmOpen]);

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
      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          setConfirmOpen(true);
        }}
      >
        <div className="panel-head">
          <h2 className="title">지원하기</h2>
          <span className="badge info">모집 중</span>
        </div>
        <p className="status-copy">
          모집 중인 프로젝트에만 지원할 수 있습니다. 제출하면 같은 프로젝트에는 다시 넣을 수 없습니다.
        </p>
        <p className="helper">프로젝트 예산보다 높은 금액도 제출할 수 있습니다. 최종 계약 금액은 추후 합의합니다.</p>
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
          <input
            className="field"
            id="amount"
            name="expectedAmount"
            placeholder="희망 금액"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="field-row">
          <label className="label" htmlFor="days">
            예상기간
          </label>
          <input
            className="field"
            id="days"
            name="expectedDurationDays"
            placeholder="예상기간"
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </div>
        <div className="btn-row">
          <button type="submit" className="btn primary" ref={submitTriggerRef}>
            지원하기
          </button>
        </div>
      </form>
      <div
        className={confirmOpen ? "overlay-backdrop open" : "overlay-backdrop"}
        aria-hidden={confirmOpen ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) setConfirmOpen(false);
        }}
      >
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <h2 className="title" id="submit-title">
            지원서를 제출할까요?
          </h2>
          <p className="status-copy">제출 후에는 수정하거나 철회할 수 없습니다. 제안 금액과 예상 기간을 확인해 주세요.</p>
          <dl className="facts">
            <dt>희망 금액</dt>
            <dd>{formatWon(amount)}</dd>
            <dt>예상기간</dt>
            <dd>{days}일</dd>
          </dl>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setConfirmOpen(false)}>
              그만두기
            </button>
            <button type="button" className="btn primary" ref={confirmRef} onClick={() => setConfirmOpen(false)}>
              제출하기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** 수락·거절은 확인 다이얼로그 뒤에만 진행한다. 자유 사유는 받지 않는다. */
function ManagePanel() {
  const [dialog, setDialog] = useState<null | "accept" | "reject">(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const acceptTriggerRef = useRef<HTMLButtonElement>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef<null | "accept" | "reject">(null);

  useEffect(() => {
    if (dialog) {
      confirmRef.current?.focus();
      wasOpenRef.current = dialog;
      return;
    }
    if (wasOpenRef.current === "accept") acceptTriggerRef.current?.focus();
    if (wasOpenRef.current === "reject") rejectTriggerRef.current?.focus();
    wasOpenRef.current = null;
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDialog(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog]);

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
          <button type="button" className="btn primary" ref={acceptTriggerRef} onClick={() => setDialog("accept")}>
            수락
          </button>
          <button type="button" className="btn" ref={rejectTriggerRef} onClick={() => setDialog("reject")}>
            거절
          </button>
        </div>
      </article>
      <div
        className={dialog === "accept" ? "overlay-backdrop open" : "overlay-backdrop"}
        aria-hidden={dialog === "accept" ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDialog(null);
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
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              취소
            </button>
            <button type="button" className="btn primary" ref={dialog === "accept" ? confirmRef : undefined} onClick={() => setDialog(null)}>
              수락 확인
            </button>
          </div>
        </div>
      </div>
      <div
        className={dialog === "reject" ? "overlay-backdrop open" : "overlay-backdrop"}
        aria-hidden={dialog === "reject" ? "false" : "true"}
        onClick={(event) => {
          if (event.target === event.currentTarget) setDialog(null);
        }}
      >
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="reject-title">
          <h2 className="title" id="reject-title">
            이 지원을 거절할까요?
          </h2>
          <p className="status-copy">거절 후에는 되돌릴 수 없습니다. 자유 사유는 받지 않습니다.</p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setDialog(null)}>
              그만두기
            </button>
            <button type="button" className="btn primary" ref={dialog === "reject" ? confirmRef : undefined} onClick={() => setDialog(null)}>
              거절 확인
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
