import { useState, type ReactNode } from "react";
import {
  RATING_HELPER,
  toReviewViewModel,
  type ReviewFormViewModel,
  type ReviewUiState,
  type ReviewViewerRole,
} from "./review.view-model";

/** run.tsx 규칙 11이 아직 이 이름을 쓴다. 내부는 uiState로 변환한다. */
export type ReviewView =
  | "empty"
  | "loading"
  | "loadFailed"
  | "duplicate"
  | "incomplete"
  | "canceled"
  | "submitted";

export type ReviewPanelProps = {
  vm?: ReviewFormViewModel;
  uiState?: ReviewUiState;
  loading?: boolean;
  view?: ReviewView;
  viewerRole?: ReviewViewerRole;
  surface?: "form" | "public";
  initialModal?: "confirm";
  averageRating?: number | null;
  reviewCount?: number;
};

const DEFAULT_TITLE = "쇼핑몰 웹사이트 구축";
const SOLO_PUBLIC_COPY = "상대가 없으면 첫 리뷰 후 14일이 지나면 이 리뷰가 공개됩니다.";

function uiStateFromView(view: ReviewView): ReviewUiState {
  switch (view) {
    case "loadFailed":
      return "LOAD_FAILED";
    case "duplicate":
      return "ALREADY_SUBMITTED";
    case "incomplete":
      return "NOT_AVAILABLE";
    case "canceled":
      return "CANCELED";
    case "submitted":
      return "SUBMITTED_BLIND";
    default:
      return "AVAILABLE";
  }
}

function fixtureVm(overrides: Partial<ReviewPanelProps>): ReviewFormViewModel {
  const uiState = overrides.uiState ?? (overrides.view ? uiStateFromView(overrides.view) : "AVAILABLE");
  const viewerRole = overrides.viewerRole ?? "CLIENT";
  const overlay = uiState === "SUBMITTING" ? "SUBMITTING" : uiState === "ALREADY_SUBMITTED" ? "ALREADY_SUBMITTED" : null;
  const loadError =
    uiState === "FORBIDDEN" || uiState === "NOT_FOUND" || uiState === "LOAD_FAILED" ? uiState : null;
  const myPublic = uiState === "PUBLISHED";
  const myBlind = uiState === "SUBMITTED_BLIND";
  return toReviewViewModel({
    loadError,
    overlay,
    projectId: "prj_preview",
    projectTitle: DEFAULT_TITLE,
    transactionStatus: uiState === "CANCELED" ? "CANCELED" : uiState === "NOT_AVAILABLE" ? "IN_PROGRESS" : "COMPLETED",
    contractStatus: uiState === "CANCELED" ? "CANCELED" : "SIGNED",
    viewerRole: uiState === "FORBIDDEN" ? "OUTSIDER" : viewerRole,
    items:
      myPublic || myBlind
        ? [
            {
              reviewId: "rvw_preview",
              direction: viewerRole === "FREELANCER" ? "FREELANCER_TO_CLIENT" : "CLIENT_TO_FREELANCER",
              rating: 5,
              comment: "일정과 품질이 좋았습니다.",
              tags: viewerRole === "FREELANCER" ? ["REQUIREMENT_CLARITY"] : ["DELIVERABLE_QUALITY"],
              isPublic: myPublic,
              createdAt: "2026-09-04T00:00:00Z",
            },
          ]
        : [],
    averageRating: overrides.averageRating,
    reviewCount: overrides.reviewCount,
  });
}

function ConfirmDialog({
  open,
  vm,
  onClose,
}: {
  open: boolean;
  vm: ReviewFormViewModel;
  onClose: () => void;
}) {
  const ratingLabel = vm.rating ? `${vm.rating}점 · ${RATING_HELPER[vm.rating]}` : "별점 없음";
  const tagLabels = vm.allowedTags.filter((tag) => vm.selectedTags.includes(tag.code)).map((tag) => tag.label);
  return (
    <div className={`overlay-backdrop${open ? " open" : ""}`} role={open ? "presentation" : undefined}>
      <div className="dialog" role="dialog" aria-modal={open} aria-labelledby="review-confirm-title">
        <h2 id="review-confirm-title" className="title">
          리뷰를 제출할까요?
        </h2>
        <p className="status-copy">
          {vm.revieweeDisplayName} · {ratingLabel}
        </p>
        {tagLabels.length > 0 ? <p className="helper">{tagLabels.join(" · ")}</p> : null}
        {vm.comment.trim() ? <p className="helper">{vm.comment}</p> : null}
        <p className="helper">제출하면 내용을 바꿀 수 없습니다. 공개 조건이 충족되면 함께 공개됩니다.</p>
        <div className="btn-row">
          <button type="button" className="btn primary">
            리뷰 제출
          </button>
          <button type="button" className="btn secondary" onClick={onClose}>
            다시 확인
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingGroup({
  rating,
  onChange,
}: {
  rating: 1 | 2 | 3 | 4 | 5 | null;
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <fieldset className="field-row rating-fieldset">
      <legend className="label">별점</legend>
      <div className="rating-stars" role="radiogroup" aria-label="별점">
        {([1, 2, 3, 4, 5] as const).map((value) => (
          <label key={value} className="rating-star">
            <input
              type="radio"
              name="rating"
              value={value}
              checked={rating === value}
              onChange={() => onChange(value)}
              aria-label={`${value}점`}
            />
            <span aria-hidden="true">★</span>
          </label>
        ))}
      </div>
      <p className="helper">{rating ? `${rating}점 · ${RATING_HELPER[rating]}` : "1점부터 5점까지. 기본값은 없습니다."}</p>
    </fieldset>
  );
}

function TagPicker({
  vm,
  onToggle,
}: {
  vm: ReviewFormViewModel;
  onToggle: (code: string) => void;
}) {
  return (
    <fieldset className="field-row">
      <legend className="label">태그</legend>
      <p className="helper">선택 · 최대 5개. 역할에 맞는 태그만 고릅니다.</p>
      <div className="tag-list">
        {vm.allowedTags.map((tag) => {
          const pressed = vm.selectedTags.includes(tag.code);
          return (
            <button
              key={tag.code}
              type="button"
              className={`chip${pressed ? " selected" : ""}`}
              aria-pressed={pressed}
              onClick={() => onToggle(tag.code)}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function PublicReviews({ vm }: { vm: ReviewFormViewModel }) {
  const empty = vm.ratingSummaryLabel === "아직 받은 리뷰 없음";
  return (
    <div className="review-page">
      <header className="review-page-head">
        <div className="review-page-head-copy">
          <h1 className="page-title">받은 리뷰</h1>
        </div>
      </header>
      <p className="review-summary" aria-label="평균 별점">
        {vm.ratingSummaryLabel}
      </p>
      {empty ? (
        <p className="status-copy">아직 받은 리뷰 없음</p>
      ) : (
        <article className="panel review-card">
          <p className="review-summary">★ 4.3</p>
          <p className="helper">결과물 품질이 좋아요</p>
          <p className="status-copy">일정과 품질이 좋았습니다.</p>
        </article>
      )}
    </div>
  );
}

/** 리뷰 화면. 앱 셸은 넣지 않고 ViewModel 상태만 그린다. */
export function ReviewPanel(props: ReviewPanelProps) {
  const loading = props.loading || props.view === "loading";
  const resolved = props.vm ?? fixtureVm(props);
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(resolved.rating);
  const [selectedTags, setSelectedTags] = useState<string[]>(resolved.selectedTags);
  const [comment, setComment] = useState(resolved.comment);
  const [confirmOpen, setConfirmOpen] = useState(props.initialModal === "confirm");

  const vm: ReviewFormViewModel = {
    ...resolved,
    rating,
    selectedTags,
    comment,
    canSubmit: resolved.canReview && rating !== null && selectedTags.length <= 5,
  };

  if (loading) {
    return (
      <article className="review-page panel" aria-busy="true">
        <div className="panel-head">
          <h1 className="page-title">리뷰</h1>
        </div>
        <p className="helper">리뷰 화면을 불러오는 중입니다.</p>
        <div className="skeleton" />
        <div className="skeleton" />
      </article>
    );
  }

  if (props.surface === "public") {
    return <PublicReviews vm={resolved} />;
  }

  if (vm.uiState === "LOAD_FAILED") {
    return (
      <article className="review-page panel">
        <div className="panel-head">
          <h1 className="page-title">리뷰</h1>
        </div>
        <p className="notice danger" role="alert">
          리뷰를 불러오지 못했습니다
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

  if (vm.uiState === "FORBIDDEN" || vm.uiState === "NOT_FOUND") {
    return (
      <article className="review-page panel">
        <div className="panel-head">
          <h1 className="page-title">리뷰</h1>
        </div>
        <p className="notice danger" role="alert">
          {vm.uiState === "FORBIDDEN" ? "이 리뷰에 접근할 수 없습니다" : "리뷰를 찾을 수 없습니다"}
        </p>
        <div className="btn-row">
          <button type="button" className="btn secondary">
            내 프로젝트
          </button>
        </div>
      </article>
    );
  }

  if (vm.uiState === "NOT_AVAILABLE") {
    return (
      <article className="review-page panel">
        <div className="panel-head">
          <h1 className="page-title">리뷰</h1>
          <span className="badge warning">거래 미완료</span>
        </div>
        <p className="notice warning" role="status">
          거래가 완료되지 않았습니다
        </p>
        <p className="status-copy">거래가 완료되면 리뷰를 작성할 수 있습니다. 지금은 완료를 기다려 주세요.</p>
        <div className="btn-row">
          <button type="button" className="btn secondary">
            내 프로젝트
          </button>
        </div>
      </article>
    );
  }

  if (vm.uiState === "CANCELED") {
    return (
      <article className="review-page panel">
        <div className="panel-head">
          <h1 className="page-title">리뷰</h1>
          <span className="badge danger">취소됨</span>
        </div>
        <p className="notice danger" role="alert">
          취소된 거래는 리뷰할 수 없습니다
        </p>
        <p className="status-copy">이 프로젝트는 취소되었습니다. 리뷰를 남길 수 있는 거래가 아닙니다.</p>
        <div className="btn-row">
          <button type="button" className="btn secondary">
            내 프로젝트
          </button>
        </div>
      </article>
    );
  }

  if (vm.uiState === "ALREADY_SUBMITTED") {
    return <ResultPage badge="작성 완료" title="이미 작성한 리뷰입니다" vm={vm} />;
  }

  if (vm.uiState === "PUBLISHED") {
    return <ResultPage badge="공개됨" title="리뷰가 공개되었습니다." vm={vm} />;
  }

  if (vm.uiState === "SUBMITTED_BLIND") {
    return (
      <ResultPage
        badge="제출됨"
        title="리뷰가 제출되었습니다. 공개 조건이 충족되면 공개됩니다."
        vm={vm}
        extra={<p className="helper">{SOLO_PUBLIC_COPY}</p>}
      />
    );
  }

  const submitting = vm.uiState === "SUBMITTING";

  function toggleTag(code: string): void {
    setSelectedTags((current) => {
      if (current.includes(code)) return current.filter((item) => item !== code);
      if (current.length >= 5) return current;
      return [...current, code];
    });
  }

  return (
    <div className="review-page">
      <header className="review-page-head">
        <div className="review-page-head-copy">
          <h1 className="page-title">리뷰</h1>
          <p className="helper">{vm.projectTitle}</p>
        </div>
        <span className="badge info">{submitting ? "제출 중" : "작성 전"}</span>
      </header>
      <div className="review-grid">
        <aside className="review-side">
          <article className="panel">
            <p className="label">평가 대상</p>
            <p className="body-strong">
              {vm.revieweeDisplayName} · {vm.revieweeRoleLabel}
            </p>
            <p className="helper">공개 조건이 충족되면 함께 공개됩니다.</p>
            <p className="helper">{SOLO_PUBLIC_COPY}</p>
            <div className="btn-row">
              <button
                type="button"
                className="btn primary"
                disabled={!vm.canSubmit || submitting}
                aria-busy={submitting}
                onClick={() => setConfirmOpen(true)}
              >
                리뷰 제출
              </button>
              <button type="button" className="btn quiet">
                나중에 작성
              </button>
            </div>
          </article>
        </aside>
        <form className="review-main panel" onSubmit={(event) => event.preventDefault()}>
          <p className="status-copy">거래가 완료되었습니다. 별점과 태그를 고른 뒤 리뷰 제출을 누르세요.</p>
          <RatingGroup rating={vm.rating} onChange={setRating} />
          <TagPicker vm={vm} onToggle={toggleTag} />
          <div className="field-row">
            <label className="label" htmlFor="review-comment">
              리뷰 내용
            </label>
            <textarea
              className="field"
              id="review-comment"
              name="comment"
              maxLength={1000}
              rows={5}
              value={vm.comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="선택 · 1~1,000자"
            />
            <p className="helper" id="review-comment-count">
              {vm.comment.length} / 1000 · 이메일·전화번호·계좌번호는 적지 마세요.
            </p>
          </div>
        </form>
      </div>
      <ConfirmDialog open={confirmOpen || submitting} vm={vm} onClose={() => setConfirmOpen(false)} />
    </div>
  );
}

function ResultPage({
  badge,
  title,
  vm,
  extra,
}: {
  badge: string;
  title: string;
  vm: ReviewFormViewModel;
  extra?: ReactNode;
}) {
  return (
    <article className="review-page panel">
      <div className="panel-head">
        <h1 className="page-title">리뷰</h1>
        <span className="badge success">{badge}</span>
      </div>
      <p className="notice info" role="status">
        {title}
      </p>
      {extra}
      {vm.myRating != null ? (
        <dl className="facts">
          <dt>별점</dt>
          <dd className="money">{vm.myRating}</dd>
        </dl>
      ) : null}
    </article>
  );
}
