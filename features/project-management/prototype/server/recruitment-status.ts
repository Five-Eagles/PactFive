import type { ProjectRecord, RecruitmentStatus } from "./project.types";

/**
 * 규칙 14 — 모집 상태는 **저장값이 아니라 조회 시점 기준**으로 판정한다.
 *
 * 마감 시각이 지났는데 배치가 아직 안 돈 프로젝트가 `OPEN` 으로 보이면 안 된다.
 *
 * ## 왜 한 파일로 뺐나 (2026-09-09)
 *
 * 같은 계산이 `project.service.ts` 와 `project-read.service.ts` 두 곳에 복사돼 있었다.
 * 원본 prototype 이 그랬고, 통합하면서 "한쪽으로 모으면 두 서비스 사이에 의존 방향이
 * 생긴다"는 이유로 그대로 뒀다.
 *
 * CR-0012 로 `project-contract.service.ts` 에도 같은 판정이 필요해지면서 **세 번째 사본**이
 * 생길 상황이 됐다. 셋이 되면 언젠가 하나만 고쳐진다.
 *
 * 서비스끼리 서로를 부르는 게 아니라 **셋 다 이 순수 함수를 부르는** 형태라 의존 방향
 * 문제는 생기지 않는다 — 이 파일은 아무것도 import 하지 않고 상태도 갖지 않는다.
 */
export function effectiveRecruitmentStatus(p: ProjectRecord, at: string): RecruitmentStatus {
  const t = new Date(at).getTime();
  if (p.recruitmentStatus === "SCHEDULED" && p.recruitmentStartAt !== null) {
    if (new Date(p.recruitmentStartAt).getTime() <= t) {
      return new Date(p.recruitmentDeadlineAt).getTime() <= t ? "CLOSED" : "OPEN";
    }
    return "SCHEDULED";
  }
  if (p.recruitmentStatus === "OPEN" && new Date(p.recruitmentDeadlineAt).getTime() <= t) {
    return "CLOSED";
  }
  return p.recruitmentStatus;
}

/**
 * 규칙 16 — 수정을 막아야 하는 상태인가.
 *
 * **모집이 (조회 시점 기준) 마감됐거나, 거래가 이미 시작됐으면 막는다.**
 * `updateProject` 가 쓰던 판정을 그대로 옮긴 것이다 (`project.service.ts` 511~516행).
 *
 * CR-0012 — `applyPricingAnalysisBudget`(규칙 40)도 같은 잠금을 써야 한다.
 * 일반 수정으로는 못 바꾸는 예산을 AI 분석 반영 경로로는 바꿀 수 있으면 안 된다.
 */
export function isEditClosed(p: ProjectRecord, at: string): boolean {
  return effectiveRecruitmentStatus(p, at) === "CLOSED" || p.transactionStatus !== "NONE";
}
