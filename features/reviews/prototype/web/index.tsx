import { useState } from "react";
import "../../design/_tokens.css";
import "../../design/panel.css";
import "./preview.css";
import { ReviewPanel } from "./ReviewPanel";
import type { ReviewUiState, ReviewViewerRole } from "./review.view-model";

export { ReviewPanel };

type PreviewScreen = {
  label: string;
  slug: string;
  uiState?: ReviewUiState;
  loading?: boolean;
  viewerRole?: ReviewViewerRole;
  surface?: "form" | "public";
  modal?: "confirm";
  averageRating?: number | null;
  reviewCount?: number;
};

const PREVIEW_SCREENS: PreviewScreen[] = [
  { label: "리뷰 · 가능", slug: "rev-available", uiState: "AVAILABLE" },
  { label: "리뷰 · M01", slug: "rev-m01", uiState: "AVAILABLE", modal: "confirm" },
  { label: "리뷰 · 의뢰인 태그", slug: "rev-tags-client", uiState: "AVAILABLE", viewerRole: "CLIENT" },
  { label: "리뷰 · 프리랜서 태그", slug: "rev-tags-freelancer", uiState: "AVAILABLE", viewerRole: "FREELANCER" },
  { label: "리뷰 · 제출 중", slug: "rev-pending", uiState: "SUBMITTING" },
  { label: "리뷰 · 블라인드", slug: "rev-blind", uiState: "SUBMITTED_BLIND" },
  { label: "리뷰 · 공개", slug: "rev-published", uiState: "PUBLISHED" },
  { label: "리뷰 · 미완료", slug: "rev-incomplete", uiState: "NOT_AVAILABLE" },
  { label: "리뷰 · 취소", slug: "rev-canceled", uiState: "CANCELED" },
  { label: "리뷰 · 불러오는 중", slug: "rev-loading", loading: true },
  { label: "리뷰 · 403", slug: "rev-403", uiState: "FORBIDDEN" },
  { label: "리뷰 · 평균 없음", slug: "rev-summary-empty", surface: "public", averageRating: null, reviewCount: 0 },
  { label: "리뷰 · 평균", slug: "rev-summary", surface: "public", averageRating: 4.26, reviewCount: 7 },
];

function initialScreenIndex(): number {
  const slug = new URLSearchParams(window.location.search).get("screen");
  const index = PREVIEW_SCREENS.findIndex((screen) => screen.slug === slug);
  return index >= 0 ? index : 0;
}

/** preview:dev. 기본은 작성 가능. 앱 셸은 없다. */
export default function ReviewsPreview() {
  const [index, setIndex] = useState(initialScreenIndex);
  const screen = PREVIEW_SCREENS[index];

  return (
    <div className="preview-root">
      <div className="preview-switcher" role="toolbar" aria-label="reviews 화면">
        {PREVIEW_SCREENS.map((item, i) => (
          <button
            key={item.slug}
            type="button"
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ReviewPanel
        key={screen.slug}
        uiState={screen.uiState}
        loading={screen.loading}
        viewerRole={screen.viewerRole}
        surface={screen.surface}
        initialModal={screen.modal}
        averageRating={screen.averageRating}
        reviewCount={screen.reviewCount}
      />
    </div>
  );
}
