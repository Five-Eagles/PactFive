-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "file_name" VARCHAR(255),
ADD COLUMN     "file_sha256" VARCHAR(64),
ADD COLUMN     "mime_type" VARCHAR(100),
ADD COLUMN     "object_key" VARCHAR(300),
ADD COLUMN     "requested_by" VARCHAR(30),
ADD COLUMN     "size_bytes" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "review_created_published_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "project_contract_idempotency_records" (
    "idempotency_key" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL,
    "result" JSONB NOT NULL,
    "project_version" INTEGER NOT NULL,

    CONSTRAINT "project_contract_idempotency_records_pkey" PRIMARY KEY ("idempotency_key")
);

-- CreateTable
CREATE TABLE "application_idempotency_keys" (
    "key" VARCHAR(160) NOT NULL,
    "body_hash" VARCHAR(64) NOT NULL,
    "application_id" VARCHAR(30) NOT NULL,
    "operation_id" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "application_operations" (
    "id" VARCHAR(30) NOT NULL,
    "application_id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "client_id" VARCHAR(30) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'QUEUED',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retry_after_seconds" INTEGER NOT NULL DEFAULT 0,
    "requires_operator_action" BOOLEAN NOT NULL DEFAULT false,
    "lease_until" TIMESTAMP(3),
    "attempts" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "application_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_operation_steps" (
    "id" VARCHAR(30) NOT NULL,
    "operation_id" VARCHAR(30) NOT NULL,
    "seq" SMALLINT NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "reason" VARCHAR(200),

    CONSTRAINT "application_operation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_state_events" (
    "id" VARCHAR(30) NOT NULL,
    "application_id" VARCHAR(30) NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus" NOT NULL,
    "rejection_type" "ApplicationRejectionType",
    "occurred_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_state_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_closures" (
    "closure_event_id" VARCHAR(30) NOT NULL,
    "rejected_count" INTEGER NOT NULL,
    "already_processed" BOOLEAN NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_closures_pkey" PRIMARY KEY ("closure_event_id")
);

-- CreateTable
CREATE TABLE "invalidations" (
    "cancellation_id" VARCHAR(30) NOT NULL,
    "project_id" VARCHAR(30) NOT NULL,
    "contract_invalidation" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invalidations_pkey" PRIMARY KEY ("cancellation_id")
);

-- CreateTable
CREATE TABLE "review_idempotency_keys" (
    "key" VARCHAR(160) NOT NULL,
    "body_hash" VARCHAR(64) NOT NULL,
    "review_id" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_idempotency_keys_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "ix_application_operations_queued" ON "application_operations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "application_operation_steps_operation_id_seq_key" ON "application_operation_steps"("operation_id", "seq");

-- CreateIndex
CREATE INDEX "application_state_events_application_id_occurred_at_idx" ON "application_state_events"("application_id", "occurred_at");

-- CreateIndex
CREATE INDEX "ix_invalidations_latest_by_project" ON "invalidations"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "application_operations" ADD CONSTRAINT "application_operations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_operations" ADD CONSTRAINT "application_operations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_operation_steps" ADD CONSTRAINT "application_operation_steps_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "application_operations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_state_events" ADD CONSTRAINT "application_state_events_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invalidations" ADD CONSTRAINT "invalidations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
