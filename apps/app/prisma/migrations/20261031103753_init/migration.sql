-- CreateEnum
CREATE TYPE "inventory_direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "inventory_reason" AS ENUM ('RECEIVED', 'DISPENSED', 'COUNT_ADJUSTMENT', 'RETURNED', 'DAMAGED', 'LOST', 'EXPIRED_DISPOSAL');

-- CreateEnum
CREATE TYPE "expiry_status" AS ENUM ('NEAR_EXPIRY', 'EXPIRED');

-- CreateEnum
CREATE TYPE "sms_status" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "sms_attempt_result" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "contact_number" TEXT,
    "position" TEXT,
    "receives_sms_alerts" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateTable
CREATE TABLE "medicines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "generic_name" TEXT,
    "strength" TEXT,
    "dosage_form" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pc',
    "barcode" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "medicines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "medicine_id" UUID NOT NULL,
    "batch_number" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "expiration_date" DATE NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "medicine_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "medicine_id" UUID NOT NULL,
    "direction" "inventory_direction" NOT NULL,
    "reason" "inventory_reason" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "performed_by" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_date" DATE NOT NULL,
    "expired_count" INTEGER NOT NULL DEFAULT 0,
    "near_expiry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "status" "expiry_status" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiration_date" DATE NOT NULL,
    "days_to_expiry" INTEGER NOT NULL,

    CONSTRAINT "notification_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_reads" (
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("notification_id","user_id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "phone_number" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "sms_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sms_message_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "result" "sms_attempt_result" NOT NULL,
    "error" TEXT,
    "modem_response" TEXT,
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "facility_name" TEXT NOT NULL DEFAULT 'InventraMed',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Manila',
    "near_expiry_threshold_days" INTEGER NOT NULL DEFAULT 30,
    "daily_notification_time" TEXT NOT NULL DEFAULT '08:00',
    "sms_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_max_attempts" INTEGER NOT NULL DEFAULT 3,
    "sms_retry_delay_minutes" INTEGER NOT NULL DEFAULT 15,
    "sms_claim_timeout_minutes" INTEGER NOT NULL DEFAULT 10,
    "sms_batch_size" INTEGER NOT NULL DEFAULT 10,
    "sms_max_items" INTEGER NOT NULL DEFAULT 10,
    "worker_poll_interval_secs" INTEGER NOT NULL DEFAULT 300,
    "sms_template" TEXT NOT NULL DEFAULT '{facility} expiry alert {date}: {expired} expired, {near_expiry} near expiry.
{items}',
    "worker_last_seen_at" TIMESTAMPTZ,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "medicines_barcode_key" ON "medicines"("barcode");

-- CreateIndex
CREATE INDEX "medicines_name_idx" ON "medicines"("name");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_batches_barcode_key" ON "medicine_batches"("barcode");

-- CreateIndex
CREATE INDEX "medicine_batches_medicine_id_expiration_date_received_at_idx" ON "medicine_batches"("medicine_id", "expiration_date", "received_at");

-- CreateIndex
CREATE INDEX "medicine_batches_expiration_date_idx" ON "medicine_batches"("expiration_date");

-- CreateIndex
CREATE UNIQUE INDEX "medicine_batches_medicine_id_batch_number_expiration_date_key" ON "medicine_batches"("medicine_id", "batch_number", "expiration_date");

-- CreateIndex
CREATE INDEX "inventory_transactions_medicine_id_created_at_idx" ON "inventory_transactions"("medicine_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_entries_batch_id_idx" ON "inventory_entries"("batch_id");

-- CreateIndex
CREATE INDEX "inventory_entries_transaction_id_idx" ON "inventory_entries"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_notification_date_key" ON "notifications"("notification_date");

-- CreateIndex
CREATE INDEX "notification_items_batch_id_idx" ON "notification_items"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_items_notification_id_batch_id_key" ON "notification_items"("notification_id", "batch_id");

-- CreateIndex
CREATE INDEX "sms_messages_status_next_attempt_at_idx" ON "sms_messages"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "sms_messages_notification_id_employee_id_key" ON "sms_messages"("notification_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_attempts_sms_message_id_attempt_no_key" ON "sms_attempts"("sms_message_id", "attempt_no");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicines" ADD CONSTRAINT "medicines_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine_batches" ADD CONSTRAINT "medicine_batches_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "inventory_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_entries" ADD CONSTRAINT "inventory_entries_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "medicine_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_items" ADD CONSTRAINT "notification_items_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_items" ADD CONSTRAINT "notification_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "medicine_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_attempts" ADD CONSTRAINT "sms_attempts_sms_message_id_fkey" FOREIGN KEY ("sms_message_id") REFERENCES "sms_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Raw SQL: check constraints, triggers, settings seed ───

ALTER TABLE employees ADD CONSTRAINT employees_sms_requires_contact
  CHECK (NOT receives_sms_alerts OR contact_number IS NOT NULL);
ALTER TABLE medicine_batches ADD CONSTRAINT medicine_batches_quantity_nonneg CHECK (quantity >= 0);
ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_quantity_pos CHECK (quantity > 0);
ALTER TABLE inventory_entries ADD CONSTRAINT inventory_entries_quantity_pos CHECK (quantity > 0);
ALTER TABLE settings ADD CONSTRAINT settings_single_row CHECK (id = 1);
ALTER TABLE settings ADD CONSTRAINT settings_threshold_pos CHECK (near_expiry_threshold_days > 0);
ALTER TABLE settings ADD CONSTRAINT settings_sms_max_attempts_pos CHECK (sms_max_attempts > 0);
ALTER TABLE settings ADD CONSTRAINT settings_sms_max_items_pos CHECK (sms_max_items > 0);
ALTER TABLE settings ADD CONSTRAINT settings_daily_time_format
  CHECK (daily_notification_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE medicines ADD CONSTRAINT medicines_barcode_prefix CHECK (barcode LIKE 'MED-%');
ALTER TABLE medicine_batches ADD CONSTRAINT medicine_batches_barcode_prefix CHECK (barcode LIKE 'BAT-%');

CREATE FUNCTION apply_inventory_entry() RETURNS trigger AS $$
DECLARE
  tx inventory_transactions%ROWTYPE;
BEGIN
  SELECT * INTO tx FROM inventory_transactions WHERE id = NEW.transaction_id;

  UPDATE medicine_batches
     SET quantity = quantity + CASE WHEN tx.direction = 'IN' THEN NEW.quantity ELSE -NEW.quantity END,
         updated_at = now()
   WHERE id = NEW.batch_id AND medicine_id = tx.medicine_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch % does not belong to medicine %', NEW.batch_id, tx.medicine_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_entries_apply
  AFTER INSERT ON inventory_entries
  FOR EACH ROW EXECUTE FUNCTION apply_inventory_entry();

CREATE FUNCTION reject_modification() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_transactions_immutable BEFORE UPDATE OR DELETE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
CREATE TRIGGER inventory_entries_immutable BEFORE UPDATE OR DELETE ON inventory_entries
  FOR EACH ROW EXECUTE FUNCTION reject_modification();
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_modification();

CREATE FUNCTION write_audit_log() RETURNS trigger AS $$
DECLARE
  actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
BEGIN
  INSERT INTO audit_logs (entity_type, entity_id, action, changes, actor_id)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'deleted' END,
    jsonb_build_object(
      'before', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      'after',  CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
    ),
    actor
  );
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_transactions_audit AFTER INSERT ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();
CREATE TRIGGER inventory_entries_audit AFTER INSERT ON inventory_entries
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();
CREATE TRIGGER medicine_batches_audit AFTER INSERT OR UPDATE OR DELETE ON medicine_batches
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();

-- Single settings row; column defaults fill the rest
INSERT INTO "settings" ("id", "updated_at") VALUES (1, now());
