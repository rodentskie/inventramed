-- AlterTable
ALTER TABLE "settings" ALTER COLUMN "sms_max_items" SET DEFAULT 1;

-- The GSM module sends single-part SMS only, and a digest with more than one
-- item usually needs two parts. Only the old default changes, so an admin's
-- own value is kept.
UPDATE settings SET sms_max_items = 1 WHERE id = 1 AND sms_max_items = 10;
