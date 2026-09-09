-- CR-0013 — 서버가 만드는 id가 varchar(30)을 넘는다
--
-- express-app.ts의 randomId()는 UUID에서 하이픈만 뺀 32자를 준다. 여기에 3~6자 접두어가
-- 붙으면 실제 생성 id는 35~38자다(가장 긴 값은 ApplicationOperation.id의 `appop_` + 32자 =
-- 38자). 이 마이그레이션은 그 값을 담는 모든 컬럼을 넉넉한 여유(40자)로 넓힌다.
--
-- 두 컬럼(application_closures.closure_event_id, invalidations.cancellation_id)은 접두어+UUID
-- 패턴이 아니라 다른 값과 조합한 합성 문자열이거나(`close-${projectId}-${at}`) 클라이언트가
-- 직접 주는 값이라 길이를 예측할 수 없다. 이 둘은 다른 이벤트/멱등 키 컬럼과 같은 폭인
-- 160자로 넓힌다(application_idempotency_keys.key, review_idempotency_keys.key와 동일 폭).
--
-- ALTER COLUMN ... TYPE VARCHAR(n)은 PostgreSQL에서 컬럼을 넓히는 것만이라 기존 행을 다시
-- 쓰지 않는다(안전한 방향 변경 — 기존 값이 새 길이 제한보다 항상 짧으므로 실패하지 않는다).

-- users
ALTER TABLE "users" ALTER COLUMN "id" TYPE VARCHAR(40);

-- auth_sessions
ALTER TABLE "auth_sessions" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "auth_sessions" ALTER COLUMN "user_id" TYPE VARCHAR(40);

-- client_profiles
ALTER TABLE "client_profiles" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "client_profiles" ALTER COLUMN "user_id" TYPE VARCHAR(40);

-- freelancer_profiles
ALTER TABLE "freelancer_profiles" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "freelancer_profiles" ALTER COLUMN "user_id" TYPE VARCHAR(40);

-- skills
ALTER TABLE "skills" ALTER COLUMN "created_by_user_id" TYPE VARCHAR(40);

-- freelancer_skills
ALTER TABLE "freelancer_skills" ALTER COLUMN "freelancer_profile_id" TYPE VARCHAR(40);

-- projects
ALTER TABLE "projects" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "projects" ALTER COLUMN "client_id" TYPE VARCHAR(40);
ALTER TABLE "projects" ALTER COLUMN "accepted_application_id" TYPE VARCHAR(40);

-- project_skills
ALTER TABLE "project_skills" ALTER COLUMN "project_id" TYPE VARCHAR(40);

-- bookmarks
ALTER TABLE "bookmarks" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "bookmarks" ALTER COLUMN "freelancer_id" TYPE VARCHAR(40);
ALTER TABLE "bookmarks" ALTER COLUMN "project_id" TYPE VARCHAR(40);

-- applications
ALTER TABLE "applications" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "applications" ALTER COLUMN "project_id" TYPE VARCHAR(40);
ALTER TABLE "applications" ALTER COLUMN "freelancer_id" TYPE VARCHAR(40);

-- application_idempotency_keys
ALTER TABLE "application_idempotency_keys" ALTER COLUMN "application_id" TYPE VARCHAR(40);
ALTER TABLE "application_idempotency_keys" ALTER COLUMN "operation_id" TYPE VARCHAR(40);

-- application_operations
ALTER TABLE "application_operations" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "application_operations" ALTER COLUMN "application_id" TYPE VARCHAR(40);
ALTER TABLE "application_operations" ALTER COLUMN "project_id" TYPE VARCHAR(40);
ALTER TABLE "application_operations" ALTER COLUMN "client_id" TYPE VARCHAR(40);

-- application_operation_steps
ALTER TABLE "application_operation_steps" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "application_operation_steps" ALTER COLUMN "operation_id" TYPE VARCHAR(40);

-- application_state_events
ALTER TABLE "application_state_events" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "application_state_events" ALTER COLUMN "application_id" TYPE VARCHAR(40);

-- application_closures
ALTER TABLE "application_closures" ALTER COLUMN "closure_event_id" TYPE VARCHAR(160);

-- notifications
ALTER TABLE "notifications" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "notifications" ALTER COLUMN "recipient_id" TYPE VARCHAR(40);
ALTER TABLE "notifications" ALTER COLUMN "resource_id" TYPE VARCHAR(40);

-- agreements
ALTER TABLE "agreements" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "agreements" ALTER COLUMN "application_id" TYPE VARCHAR(40);
ALTER TABLE "agreements" ALTER COLUMN "proposed_by_user_id" TYPE VARCHAR(40);

-- negotiation_offer
ALTER TABLE "negotiation_offer" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "negotiation_offer" ALTER COLUMN "application_id" TYPE VARCHAR(40);
ALTER TABLE "negotiation_offer" ALTER COLUMN "proposed_by_user_id" TYPE VARCHAR(40);

-- contracts
ALTER TABLE "contracts" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "contracts" ALTER COLUMN "agreement_id" TYPE VARCHAR(40);
ALTER TABLE "contracts" ALTER COLUMN "project_id" TYPE VARCHAR(40);
ALTER TABLE "contracts" ALTER COLUMN "client_id" TYPE VARCHAR(40);
ALTER TABLE "contracts" ALTER COLUMN "freelancer_id" TYPE VARCHAR(40);

-- contract_signature_audits
ALTER TABLE "contract_signature_audits" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "contract_signature_audits" ALTER COLUMN "contract_id" TYPE VARCHAR(40);
ALTER TABLE "contract_signature_audits" ALTER COLUMN "signer_id" TYPE VARCHAR(40);

-- payments
ALTER TABLE "payments" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "payments" ALTER COLUMN "contract_id" TYPE VARCHAR(40);
ALTER TABLE "payments" ALTER COLUMN "client_id" TYPE VARCHAR(40);
ALTER TABLE "payments" ALTER COLUMN "freelancer_id" TYPE VARCHAR(40);

-- deliveries
ALTER TABLE "deliveries" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "deliveries" ALTER COLUMN "contract_id" TYPE VARCHAR(40);
ALTER TABLE "deliveries" ALTER COLUMN "requested_by" TYPE VARCHAR(40);

-- invalidations
ALTER TABLE "invalidations" ALTER COLUMN "cancellation_id" TYPE VARCHAR(160);
ALTER TABLE "invalidations" ALTER COLUMN "project_id" TYPE VARCHAR(40);

-- reviews
ALTER TABLE "reviews" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "reviews" ALTER COLUMN "project_id" TYPE VARCHAR(40);
ALTER TABLE "reviews" ALTER COLUMN "contract_id" TYPE VARCHAR(40);
ALTER TABLE "reviews" ALTER COLUMN "reviewer_id" TYPE VARCHAR(40);
ALTER TABLE "reviews" ALTER COLUMN "reviewee_id" TYPE VARCHAR(40);

-- review_idempotency_keys
ALTER TABLE "review_idempotency_keys" ALTER COLUMN "review_id" TYPE VARCHAR(40);

-- review_windows
ALTER TABLE "review_windows" ALTER COLUMN "project_id" TYPE VARCHAR(40);

-- pricing_analyses
ALTER TABLE "pricing_analyses" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "pricing_analyses" ALTER COLUMN "requester_id" TYPE VARCHAR(40);
ALTER TABLE "pricing_analyses" ALTER COLUMN "project_id" TYPE VARCHAR(40);

-- pricing_application_receipts
ALTER TABLE "pricing_application_receipts" ALTER COLUMN "id" TYPE VARCHAR(40);
ALTER TABLE "pricing_application_receipts" ALTER COLUMN "actor_user_id" TYPE VARCHAR(40);
ALTER TABLE "pricing_application_receipts" ALTER COLUMN "pricing_analysis_id" TYPE VARCHAR(40);
ALTER TABLE "pricing_application_receipts" ALTER COLUMN "project_id" TYPE VARCHAR(40);

