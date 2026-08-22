-- ============================================
-- 006: Batch 1 fixes
-- - departments needs an active/inactive status (Department Management spec)
-- - appointments needs a REAL, DB-level guard against double-booking.
--   The check_appointment_availability() function added in 003 is only a
--   read-before-write check; two concurrent requests can both pass it and
--   both insert. A partial unique index is the actual guard: the database
--   itself will reject the second insert, no race condition possible.
-- ============================================

ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_doctor_slot
  ON appointments (doctor_id, appointment_date, appointment_time)
  WHERE status NOT IN ('CANCELLED', 'NO_SHOW');
