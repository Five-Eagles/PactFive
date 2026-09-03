import "../../design/_tokens.css";
import "../../design/panel.css";
import "./preview.css";
import { ReviewPanel } from "./ReviewPanel";

export { ReviewPanel };

/** preview:dev 기본 화면. 리뷰 패널만. 앱 셸은 없다. */
export default function ReviewsPreview() {
  return <ReviewPanel />;
}
