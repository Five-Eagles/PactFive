import "../../design/_tokens.css";
import "../../design/panel.css";
import "./preview.css";
import { ApplicationPanel } from "./ApplicationPanel";

export { ApplicationPanel };

/** preview:dev 기본 화면. 지원 패널만. 앱 셸은 없다. */
export default function ApplicationsPreview() {
  return <ApplicationPanel />;
}
