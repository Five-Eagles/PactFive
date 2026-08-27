/**
 * Mock 시드 데이터
 *
 * ## 앞의 10종은 contracts-payments 와 공유한다
 *
 * 조준영이 `features/contracts-payments/prototype/mock/` 에 만든 시드와
 * **id·상태·버전을 그대로 맞췄다.** 양쪽이 다른 데이터로 테스트하면 각자 통과하고
 * 붙였을 때 깨진다. 같은 시드를 쓰면 어긋남이 테스트 단계에서 드러난다.
 *
 * 시드를 바꿔야 하면 양쪽을 함께 고친다.
 *
 * ## 뒤의 것은 project-management 전용이다
 *
 * 등록·조회·수정·삭제·마감 규칙을 검증하는 데 필요한 상태들이다.
 * 계약 흐름과 무관해서 contracts-payments 에는 없다.
 */

import type { ProjectRecord } from "../server/project.types";

const CLIENT = "usr_client_a";
const OTHER_CLIENT = "usr_client_b";
const DEADLINE_FUTURE = "2026-09-16T14:59:59Z";
const DEADLINE_PAST = "2026-08-01T14:59:59Z";
const CREATED = "2026-08-01T00:00:00Z";

function base(overrides: Partial<ProjectRecord> & { projectId: string }): ProjectRecord {
  return {
    clientId: CLIENT,
    title: "쇼핑몰 웹사이트 구축",
    description: "자사 브랜드 온라인 스토어를 새로 만들려고 합니다. 상품 등록과 결제 연동이 필요합니다.",
    category: "WEB_DEVELOPMENT",
    budgetAmount: 5_000_000,
    recruitmentStartAt: null,
    recruitmentDeadlineAt: DEADLINE_FUTURE,
    recruitmentStatus: "CLOSED",
    transactionStatus: "NONE",
    applicationCount: 0,
    pendingApplicationCount: 0,
    recruitmentClosedAt: null,
    canceledAt: null,
    deadlineNotifiedAt: null,
    acceptedApplicationId: null,
    paymentPendingAt: null,
    projectVersion: 1,
    skillIds: ["REACT", "NODEJS", "SQL"],
    createdAt: CREATED,
    updatedAt: CREATED,
    deletedAt: null,
    ...overrides,
  };
}

/* ═══════════ contracts-payments 와 공유하는 10종 ═══════════ */

export const SHARED_SEEDS: ProjectRecord[] = [
  /** 조회·markPaymentPending·start 성공 */
  base({
    projectId: "prj_alive",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: "app_123",
    projectVersion: 7,
    applicationCount: 3,
  }),

  /** 해피패스 전용 — mark → start → complete 순서로 전이가 쌓인다 */
  base({
    projectId: "prj_seq",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: "app_123",
    projectVersion: 7,
    applicationCount: 3,
  }),

  /** restore 재개 성공 (reopened: true) — 마감 남음, 대기 지원 0 */
  base({
    projectId: "prj_restore",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: "app_200",
    projectVersion: 5,
    applicationCount: 4,
    pendingApplicationCount: 0,
  }),

  /** 조회 404 PROJECT_NOT_FOUND */
  base({
    projectId: "prj_deleted",
    deletedAt: "2026-08-20T00:00:00Z",
    projectVersion: 3,
  }),

  /** 전이 409 PROJECT_TRANSITION_CONFLICT */
  base({
    projectId: "prj_canceled",
    transactionStatus: "CANCELED",
    canceledAt: "2026-08-20T00:00:00Z",
    projectVersion: 6,
  }),

  /**
   * CONTRACT_PENDING 인데 acceptedApplicationId 가 null — start 409
   * 정상 경로에서는 생길 수 없는 상태다. acceptProjectApplication 이 두 값을 함께 쓴다.
   */
  base({
    projectId: "prj_null_accept",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: null,
    projectVersion: 7,
  }),

  /** complete 성공 (호출자가 I-30 을 지킨 경우) */
  base({
    projectId: "prj_in_progress",
    transactionStatus: "IN_PROGRESS",
    acceptedApplicationId: "app_300",
    projectVersion: 8,
  }),

  /** complete 멱등 200 */
  base({
    projectId: "prj_completed",
    transactionStatus: "COMPLETED",
    acceptedApplicationId: "app_400",
    projectVersion: 9,
  }),

  /** restore → notReopenedReason: DEADLINE_PASSED */
  base({
    projectId: "prj_deadline",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: "app_500",
    recruitmentDeadlineAt: DEADLINE_PAST,
    projectVersion: 4,
  }),

  /** restore → PENDING_APPLICATIONS_REMAIN, 거래는 NONE 으로 간다 */
  base({
    projectId: "prj_pending_apps",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: "app_600",
    pendingApplicationCount: 2,
    applicationCount: 5,
    projectVersion: 5,
  }),
];

/* ═══════════ project-management 전용 ═══════════ */

export const OWN_SEEDS: ProjectRecord[] = [
  /** 모집 중 · 지원 0 — 수정·삭제·마감 전부 가능 */
  base({
    projectId: "prj_open_free",
    title: "배달 앱 UI 개선",
    category: "DESIGN",
    budgetAmount: 3_400_000,
    recruitmentStatus: "OPEN",
    skillIds: ["FIGMA"],
    projectVersion: 1,
  }),

  /** 모집 중 · 대기 지원 3 — 예산·일정 잠금 (규칙 15) · 삭제 불가 (규칙 20) */
  base({
    projectId: "prj_open_locked",
    recruitmentStatus: "OPEN",
    applicationCount: 3,
    pendingApplicationCount: 3,
    projectVersion: 1,
  }),

  /** 모집 예정 — 수동 마감 가능 (규칙 22) */
  base({
    projectId: "prj_scheduled",
    title: "사내 관리 시스템 리뉴얼",
    budgetAmount: 8_200_000,
    recruitmentStatus: "SCHEDULED",
    recruitmentStartAt: "2026-09-01T00:00:00Z",
    skillIds: ["TYPESCRIPT", "SPRING"],
    projectVersion: 1,
  }),

  /** 이미 마감 — 재마감 멱등 (규칙 24) */
  base({
    projectId: "prj_closed",
    recruitmentClosedAt: "2026-08-24T00:00:00Z",
    applicationCount: 2,
    projectVersion: 2,
  }),

  /** 결제 진행 중 — 취소 불가 (규칙 27) */
  base({
    projectId: "prj_paying",
    transactionStatus: "CONTRACT_PENDING",
    acceptedApplicationId: "app_700",
    paymentPendingAt: "2026-08-25T05:00:00Z",
    projectVersion: 7,
  }),

  /** 재모집 대상 — CLOSED + NONE, 마감일 지남, 대기 지원 0 (규칙 32) */
  base({
    projectId: "prj_reopenable",
    title: "랜딩 페이지 제작",
    budgetAmount: 2_800_000,
    recruitmentDeadlineAt: DEADLINE_PAST,
    recruitmentClosedAt: "2026-08-22T00:00:00Z",
    applicationCount: 2,
    projectVersion: 9,
  }),

  /**
   * 마감됐는데 대기 지원이 남음 — 재모집 불가 (규칙 34)
   *
   * 마감일이 지나 자동 마감됐지만 일괄 거절 후처리가 실패한 상태다.
   * 규칙 23 이 "후처리가 실패해도 마감은 되돌리지 않는다"이므로 실제로 생길 수 있다.
   */
  base({
    projectId: "prj_closed_pending",
    title: "물류 관리 도구 개발",
    budgetAmount: 6_100_000,
    recruitmentDeadlineAt: DEADLINE_PAST,
    recruitmentClosedAt: "2026-08-23T00:00:00Z",
    applicationCount: 4,
    pendingApplicationCount: 2,
    projectVersion: 2,
  }),

  /** 남의 프로젝트 — 403 PROJECT_FORBIDDEN (규칙 17) */
  base({
    projectId: "prj_other_client",
    clientId: OTHER_CLIENT,
    recruitmentStatus: "OPEN",
    projectVersion: 1,
  }),
];

export const ALL_SEEDS: ProjectRecord[] = [...SHARED_SEEDS, ...OWN_SEEDS];

/** 호출할 때마다 새 배열을 준다. 테스트끼리 상태가 새면 순서에 따라 결과가 달라진다. */
export function cloneSeeds(): ProjectRecord[] {
  return ALL_SEEDS.map((p) => ({ ...p, skillIds: [...p.skillIds] }));
}
