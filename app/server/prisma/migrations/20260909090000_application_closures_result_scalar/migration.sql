-- CR-AP-004(조준영, 2026-09-09) — application_closures.result: JSONB → VARCHAR(20)
--
-- 원래 코드가 result 객체 전체(JSON)를 저장하는 결함이 있었다(prisma-application.repository.ts
-- setClosure, 팀장 수정 완료). 배포된 DB에 이미 그렇게 잘못 저장된 행이 있을 수 있으므로,
-- 타입을 바꾸기 전에 반드시 스칼라만 추출하는 데이터 정정을 먼저 실행한다. 순서를 바꾸면
-- (타입 변경을 먼저 하면) 손상된 JSON 값이 VARCHAR(20)로 강제 캐스팅되며 잘려나가거나
-- 캐스팅 자체가 실패할 수 있다.
--
-- 적용 전 확인 필요(팀장이 로컬에서 직접 확인할 것 — 샌드박스는 실 DB에 접근할 수 없다):
-- 배포된 DB의 application_closures에 객체 타입 result가 실제로 존재하는지 여부.
-- 없다면 아래 UPDATE는 0행에 영향을 주고 안전하게 스킵된다.

-- 1) 데이터 정정 — result가 객체({"result": "..."} 형태)인 행만 스칼라로 추출한다
UPDATE "application_closures"
SET "result" = "result" -> 'result'
WHERE jsonb_typeof("result"::jsonb) = 'object';

-- 2) 컬럼 타입 변경 — JSONB 스칼라 문자열을 따옴표 없는 텍스트로 추출해 VARCHAR(20)으로 캐스팅한다.
--    (result::text는 JSON 문자열 그대로 "DONE" 처럼 따옴표가 남으므로 #>> '{}' 로 추출한다)
ALTER TABLE "application_closures"
  ALTER COLUMN "result" TYPE VARCHAR(20)
  USING ("result" #>> '{}');
