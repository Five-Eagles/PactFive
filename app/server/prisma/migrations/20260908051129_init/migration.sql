-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'FREELANCER');

-- CreateEnum
CREATE TYPE "RecruitmentStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProjectTransactionStatus" AS ENUM ('NONE', 'CONTRACT_PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "BudgetSource" AS ENUM ('CLIENT_INPUT', 'AI_ANALYSIS');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApplicationRejectionType" AS ENUM ('DIRECT', 'AUTO_OTHER_ACCEPTED', 'AUTO_RECRUITMENT_CLOSED', 'AGREEMENT_DECLINED');

-- CreateEnum
CREATE TYPE "AgreementStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SIGNING', 'SIGNED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('READY', 'PENDING', 'PAID', 'FAILED', 'RELEASED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('IN_PROGRESS', 'DELIVERY_REQUESTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "PricingAnalysisReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectCategory" AS ENUM ('WEB_DEVELOPMENT', 'MOBILE_APP', 'DESIGN', 'DATA_AI', 'PLANNING', 'MARKETING');

-- CreateEnum
CREATE TYPE "BusinessField" AS ENUM ('WEB_DEVELOPMENT', 'MOBILE_APP', 'DESIGN', 'DATA_AI', 'PLANNING', 'MARKETING');

-- CreateEnum
CREATE TYPE "SkillGroup" AS ENUM ('FRONTEND', 'BACKEND', 'MOBILE', 'DATA_INFRA', 'DESIGN', 'MARKETING', 'PLANNING', 'ETC');

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'KAKAO');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('APPLICATION_SUBMITTED', 'APPLICATION_ACCEPTED', 'APPLICATION_REJECTED', 'APPLICATION_AUTO_REJECTED', 'PROJECT_RECRUITMENT_CLOSED', 'PROJECT_CANCELED', 'AGREEMENT_ACCEPTED', 'AGREEMENT_REJECTED', 'CONTRACT_SIGNED', 'PAYMENT_COMPLETED', 'DELIVERY_REQUESTED', 'DELIVERY_APPROVED', 'REVIEW_REQUESTED');

-- CreateEnum
CREATE TYPE "ReviewDirection" AS ENUM ('CLIENT_TO_FREELANCER', 'FREELANCER_TO_CLIENT');

-- CreateEnum
CREATE TYPE "SessionRevokedReason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'PASSWORD_CHANGED', 'USER_WITHDRAWN');

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(30) NOT NULL,
    "auth_user_id" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "name" VARCHAR(50) NOT NULL,
    "role" "UserRole" NOT NULL,
    "profile_image_url" TEXT,
    "bio" TEXT,
    "oauth_provider" "OAuthProvider",
    "oauth_subject" VARCHAR(255),
    "rating_average" DECIMAL(3,2),
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_intents" (
    "auth_user_id" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "role" "UserRole" NOT NULL,
    "return_to" TEXT NOT NULL,
    "nonce" VARCHAR(100) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "recovery_expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_intents_pkey" PRIMARY KEY ("auth_user_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30) NOT NULL,
    "provider_session_id" VARCHAR(64) NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "previous_token_hash" VARCHAR(255),
    "device_label" VARCHAR(100),
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" "SessionRevokedReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_nonces" (
    "nonce" VARCHAR(100) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_nonces_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "client_profiles" (
    "id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30) NOT NULL,
    "company_name" VARCHAR(100) NOT NULL,
    "business_field" "BusinessField" NOT NULL,
    "business_field_etc" VARCHAR(100),
    "website_url" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freelancer_profiles" (
    "id" VARCHAR(30) NOT NULL,
    "user_id" VARCHAR(30) NOT NULL,
    "primary_category" "ProjectCategory" NOT NULL,
    "career_years" SMALLINT NOT NULL DEFAULT 0,
    "hourly_rate_amount" INTEGER,
    "portfolio_url" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freelancer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" VARCHAR(40) NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "name_key" VARCHAR(60) NOT NULL,
    "group_code" "SkillGroup" NOT NULL,
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" VARCHAR(30),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freelancer_skills" (
    "freelancer_profile_id" VARCHAR(30) NOT NULL,
    "skill_id" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "freelancer_skills_pkey" PRIMARY KEY ("freelancer_profile_id","skill_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ProjectCategory" NOT NULL,
    "budget_amount" INTEGER NOT NULL,
    "budget_source" "BudgetSource" NOT NULL DEFAULT 'CLIENT_INPUT',
    "budget_source_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recruitment_start_at" TIMESTAMP(3),
    "recruitment_deadline_at" TIMESTAMP(3) NOT NULL,
    "recruitment_status" "RecruitmentStatus" NOT NULL DEFAULT 'OPEN',
    "transaction_status" "ProjectTransactionStatus" NOT NULL DEFAULT 'NONE',
    "application_count" INTEGER NOT NULL DEFAULT 0,
    "recruitment_closed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "deadline_notified_at" TIMESTAMP(3),
    "pending_application_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_application_id" VARCHAR(30),
    "payment_pending_at" TIMESTAMP(3),
    "project_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_skills" (
    "project_id" VARCHAR(30) NOT NULL,
    "skill_id" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_skills_pkey" PRIMARY KEY ("project_id","skill_id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" VARCHAR(30) NOT NULL,
    "freelancer_id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "freelancer_id" VARCHAR(30) NOT NULL,
    "cover_letter" TEXT NOT NULL,
    "expected_amount" INTEGER NOT NULL,
    "expected_duration_days" SMALLINT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_type" "ApplicationRejectionType",
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR(30) NOT NULL,
    "recipient_id" VARCHAR(30) NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "link_url" TEXT NOT NULL,
    "resource_type" VARCHAR(30),
    "resource_id" VARCHAR(30),
    "dedupe_key" VARCHAR(120) NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agreements" (
    "id" VARCHAR(30) NOT NULL,
    "application_id" VARCHAR(30) NOT NULL,
    "proposed_by_user_id" VARCHAR(30) NOT NULL,
    "agreed_amount" INTEGER NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'PROPOSED',
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiation_offer" (
    "id" VARCHAR(30) NOT NULL,
    "application_id" VARCHAR(30) NOT NULL,
    "round" SMALLINT NOT NULL DEFAULT 1,
    "proposed_by_user_id" VARCHAR(30) NOT NULL,
    "offered_amount" INTEGER NOT NULL,
    "status" "AgreementStatus" NOT NULL DEFAULT 'PROPOSED',
    "responded_at" TIMESTAMP(3),
    "rejected_reason" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negotiation_offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" VARCHAR(30) NOT NULL,
    "agreement_id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "freelancer_id" VARCHAR(30) NOT NULL,
    "project_title_snapshot" VARCHAR(100) NOT NULL,
    "agreed_amount" INTEGER NOT NULL,
    "work_start_date" DATE NOT NULL,
    "work_end_date" DATE NOT NULL,
    "terms_snapshot" JSONB NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "client_signed_at" TIMESTAMP(3),
    "freelancer_signed_at" TIMESTAMP(3),
    "signed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_signature_audits" (
    "id" VARCHAR(30) NOT NULL,
    "contract_id" VARCHAR(30) NOT NULL,
    "signer_id" VARCHAR(30) NOT NULL,
    "signer_role" "UserRole" NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_signature_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" VARCHAR(30) NOT NULL,
    "contract_id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "freelancer_id" VARCHAR(30) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'KRW',
    "payment_amount" INTEGER NOT NULL,
    "platform_fee_amount" INTEGER NOT NULL,
    "settlement_amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'READY',
    "pg_provider" VARCHAR(20) NOT NULL DEFAULT 'TOSS_PAYMENTS',
    "pg_order_id" VARCHAR(64) NOT NULL,
    "pg_payment_key" VARCHAR(200),
    "payment_method" VARCHAR(30),
    "raw_response" JSONB,
    "paid_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "failure_code" VARCHAR(50),
    "failure_message" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" VARCHAR(30) NOT NULL,
    "contract_id" VARCHAR(30) NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "message" TEXT,
    "attachment_url" TEXT,
    "requested_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "contract_id" VARCHAR(30) NOT NULL,
    "reviewer_id" VARCHAR(30) NOT NULL,
    "reviewee_id" VARCHAR(30) NOT NULL,
    "direction" "ReviewDirection" NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_analyses" (
    "id" VARCHAR(30) NOT NULL,
    "requester_id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30),
    "input_snapshot" JSONB NOT NULL,
    "recommended_amount" INTEGER,
    "breakdown" JSONB,
    "model_name" VARCHAR(50),
    "prompt_version" VARCHAR(20),
    "result_schema_version" VARCHAR(20),
    "failure_code" VARCHAR(50),
    "failure_snapshot" JSONB,
    "failure_http_status" SMALLINT,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "request_fingerprint" VARCHAR(64) NOT NULL,
    "input_fingerprint_schema_version" VARCHAR(20) NOT NULL,
    "review_status" "PricingAnalysisReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_application_receipts" (
    "id" VARCHAR(30) NOT NULL,
    "operation" VARCHAR(30) NOT NULL,
    "actor_user_id" VARCHAR(30) NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "pricing_analysis_id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "request_fingerprint" VARCHAR(64) NOT NULL,
    "http_status" SMALLINT NOT NULL,
    "response_body" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_application_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_oauth_provider_oauth_subject_key" ON "users"("oauth_provider", "oauth_subject");

-- CreateIndex
CREATE INDEX "registration_intents_email_idx" ON "registration_intents"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "ix_auth_sessions_user" ON "auth_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "ix_auth_sessions_provider_session" ON "auth_sessions"("provider_session_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_user_id_key" ON "client_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "freelancer_profiles_user_id_key" ON "freelancer_profiles"("user_id");

-- CreateIndex
CREATE INDEX "skills_group_code_display_order_idx" ON "skills"("group_code", "display_order");

-- CreateIndex
CREATE INDEX "skills_is_custom_idx" ON "skills"("is_custom");

-- CreateIndex
CREATE INDEX "freelancer_skills_skill_id_idx" ON "freelancer_skills"("skill_id");

-- CreateIndex
CREATE INDEX "ix_projects_recruit" ON "projects"("recruitment_status", "recruitment_deadline_at");

-- CreateIndex
CREATE INDEX "projects_client_id_created_at_idx" ON "projects"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "projects_category_recruitment_status_idx" ON "projects"("category", "recruitment_status");

-- CreateIndex
CREATE INDEX "projects_deleted_at_idx" ON "projects"("deleted_at");

-- CreateIndex
CREATE INDEX "projects_recruitment_deadline_at_idx" ON "projects"("recruitment_deadline_at");

-- CreateIndex
CREATE INDEX "project_skills_skill_id_idx" ON "project_skills"("skill_id");

-- CreateIndex
CREATE INDEX "bookmarks_freelancer_id_created_at_idx" ON "bookmarks"("freelancer_id", "created_at");

-- CreateIndex
CREATE INDEX "bookmarks_project_id_idx" ON "bookmarks"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_freelancer_id_project_id_key" ON "bookmarks"("freelancer_id", "project_id");

-- CreateIndex
CREATE INDEX "applications_freelancer_id_created_at_idx" ON "applications"("freelancer_id", "created_at");

-- CreateIndex
CREATE INDEX "applications_project_id_status_idx" ON "applications"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_project_id_freelancer_id_key" ON "applications"("project_id", "freelancer_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "ix_notifications_feed" ON "notifications"("recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_idx" ON "notifications"("recipient_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "agreements_application_id_key" ON "agreements"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "negotiation_offer_application_id_round_key" ON "negotiation_offer"("application_id", "round");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_agreement_id_key" ON "contracts"("agreement_id");

-- CreateIndex
CREATE INDEX "contracts_project_id_idx" ON "contracts"("project_id");

-- CreateIndex
CREATE INDEX "contracts_client_id_created_at_idx" ON "contracts"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "contracts_freelancer_id_created_at_idx" ON "contracts"("freelancer_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contract_signature_audits_contract_id_signer_id_key" ON "contract_signature_audits"("contract_id", "signer_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_contract_id_key" ON "payments"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_pg_order_id_key" ON "payments"("pg_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_pg_payment_key_key" ON "payments"("pg_payment_key");

-- CreateIndex
CREATE INDEX "payments_freelancer_id_released_at_idx" ON "payments"("freelancer_id", "released_at");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_contract_id_key" ON "deliveries"("contract_id");

-- CreateIndex
CREATE INDEX "reviews_reviewee_id_created_at_idx" ON "reviews"("reviewee_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_project_id_direction_key" ON "reviews"("project_id", "direction");

-- CreateIndex
CREATE INDEX "pricing_analyses_requester_id_created_at_idx" ON "pricing_analyses"("requester_id", "created_at");

-- CreateIndex
CREATE INDEX "pricing_analyses_project_id_idx" ON "pricing_analyses"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_pricing_analyses_requester_idempotency" ON "pricing_analyses"("requester_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "pricing_application_receipts_pricing_analysis_id_idx" ON "pricing_application_receipts"("pricing_analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_pricing_application_receipts_actor_idempotency" ON "pricing_application_receipts"("actor_user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freelancer_profiles" ADD CONSTRAINT "freelancer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freelancer_skills" ADD CONSTRAINT "freelancer_skills_freelancer_profile_id_fkey" FOREIGN KEY ("freelancer_profile_id") REFERENCES "freelancer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "freelancer_skills" ADD CONSTRAINT "freelancer_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_skills" ADD CONSTRAINT "project_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_freelancer_id_fkey" FOREIGN KEY ("freelancer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_freelancer_id_fkey" FOREIGN KEY ("freelancer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_proposed_by_user_id_fkey" FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_offer" ADD CONSTRAINT "negotiation_offer_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negotiation_offer" ADD CONSTRAINT "negotiation_offer_proposed_by_user_id_fkey" FOREIGN KEY ("proposed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_freelancer_id_fkey" FOREIGN KEY ("freelancer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signature_audits" ADD CONSTRAINT "contract_signature_audits_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signature_audits" ADD CONSTRAINT "contract_signature_audits_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_freelancer_id_fkey" FOREIGN KEY ("freelancer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_id_fkey" FOREIGN KEY ("reviewee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_analyses" ADD CONSTRAINT "pricing_analyses_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_analyses" ADD CONSTRAINT "pricing_analyses_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_application_receipts" ADD CONSTRAINT "pricing_application_receipts_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_application_receipts" ADD CONSTRAINT "pricing_application_receipts_pricing_analysis_id_fkey" FOREIGN KEY ("pricing_analysis_id") REFERENCES "pricing_analyses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_application_receipts" ADD CONSTRAINT "pricing_application_receipts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
