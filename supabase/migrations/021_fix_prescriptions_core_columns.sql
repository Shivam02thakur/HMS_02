-- 021_fix_prescriptions_core_columns.sql
-- prescriptions.diagnosis (original, pre-existing code -- not part of the
-- PDF feature) doesn't exist on the live table, per PGRST204: "Could not
-- find the 'diagnosis' column of 'prescriptions' in the schema cache".
-- Same class of drift as prescription_items being missing entirely.
-- This adds diagnosis/notes/appointment_id if any of them are also
-- missing -- IF NOT EXISTS makes it safe to run even if only one is gone.

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS diagnosis text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id);

NOTIFY pgrst, 'reload schema';
