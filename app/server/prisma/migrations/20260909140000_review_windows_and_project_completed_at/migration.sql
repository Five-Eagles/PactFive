-- CR-RV-002(조준영, 2026-09-07) — review_windows 신설 + projects.completed_at 신설
--
-- projects.completed_at: completeProjectTransaction이 transactionStatus를 COMPLETED로
-- 바꾸는 순간 처음이자 유일하게 쓴다. 그 함수는 이미 COMPLETED 재진입을 멱등
-- early-return으로 막고 있어(project-contract.service.ts:314) 재작성 위험이 없다.
-- 기존 행은 전부 NULL로 시작한다 — 이미 COMPLETED인 프로젝트가 있다면 review_windows가
-- 그 프로젝트에 한해서만 "언제 창이 열렸는지"를 모르는 채로 남는다(아래 백필 조회 참고).
ALTER TABLE "projects"
  ADD COLUMN "completed_at" TIMESTAMPTZ;

-- 배포 DB에 이미 COMPLETED인 프로젝트가 있으면(팀장·조준영 모두 확인 불가) completed_at이
-- NULL로 남아 review_windows가 생성되지 않는다 — 아래 조회로 먼저 확인할 것.
--
--   SELECT id FROM projects WHERE transaction_status = 'COMPLETED' AND completed_at IS NULL;
--
-- 있다면 updated_at(그 프로젝트에 다른 갱신이 없었다는 전제 하에 근사치)로 백필하거나,
-- 정책상 "이 CR 배포 이후 완료되는 프로젝트부터만 14일 창을 적용" 판단도 가능하다 —
-- 팀장이 배포 시점에 실제 데이터를 보고 결정한다.

CREATE TABLE "review_windows" (
  "project_id"     VARCHAR(30)  NOT NULL,
  "opened_at"      TIMESTAMPTZ  NOT NULL,
  "deadline_at"    TIMESTAMPTZ  NOT NULL,
  "policy_version" INTEGER      NOT NULL DEFAULT 1,
  "created_at"     TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "review_windows_pkey" PRIMARY KEY ("project_id"),
  CONSTRAINT "review_windows_project_id_fkey" FOREIGN KEY ("project_id")
    REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
