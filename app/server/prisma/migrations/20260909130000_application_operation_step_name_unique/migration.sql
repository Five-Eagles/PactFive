-- CR-AP-004(조준영, 2026-09-09) 변경 1 — application_operation_steps: (operation_id, name) 유니크 추가
--
-- 한 operation의 단계는 이름당 최대 1행이어야 한다는 불변식(application.service.ts의
-- queuedSteps — ACCEPT는 REJECT_OTHERS·CREATE_NOTIFICATIONS·ENSURE_NEGOTIATION_CONTEXT
-- 3개, REJECT는 CREATE_NOTIFICATIONS 1개로 고정)이 지금은 리포지토리 구현(전량 삭제 후
-- 재삽입)에만 의존한다. 결함은 아니다 — 현재 구현은 이미 이 제약 아래에서 그대로
-- 동작한다. 다음 사람이 구현 방식(예: 부분 갱신)을 바꿀 때를 위한 방어로 추가한다.
--
-- 적용 전 확인 필요(팀장이 로컬에서 직접 확인할 것 — 샌드박스는 실 DB에 접근할 수 없다):
-- 아래 조회로 중복이 있으면 CREATE UNIQUE INDEX가 실패한다. 현재 구현이 한 트랜잭션에서
-- 전량 삭제 후 재삽입하므로 중복이 없을 것으로 보이지만(CR-AP-004 본문), 배포 DB 상태는
-- 조준영도 나도 확인할 수 없었다.
--
--   SELECT operation_id, name, COUNT(*) FROM application_operation_steps
--     GROUP BY operation_id, name HAVING COUNT(*) > 1;
--
-- seq 유니크(uq_operation_step_seq)는 순서 보존용으로 그대로 둔다 — 이 마이그레이션은
-- 추가만 한다.

CREATE UNIQUE INDEX "uq_operation_step_name"
  ON "application_operation_steps" ("operation_id", "name");
