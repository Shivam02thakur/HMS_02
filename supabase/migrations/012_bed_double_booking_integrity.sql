-- Prevent bed double-assignment race condition (deferred-issues bug #1).
-- Same class as appointments (006) and admissions-per-patient (010): app code
-- checks status='VACANT' before insert, but two concurrent admissions could
-- both pass that check and land on the same bed. Partial unique index makes
-- the DB the actual guard, not just the UI filter.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_admission_per_bed
  ON admissions (bed_id)
  WHERE status = 'ADMITTED';