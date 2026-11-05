-- This is an empty migration.-- Audit medicine catalog changes. A soft delete is logged as `updated`.
CREATE TRIGGER medicines_audit AFTER INSERT OR UPDATE OR DELETE ON medicines
  FOR EACH ROW EXECUTE FUNCTION write_audit_log();
