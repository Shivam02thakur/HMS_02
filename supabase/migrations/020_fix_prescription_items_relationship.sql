-- 020_fix_prescription_items_relationship.sql
-- Fixes: "Could not find a relationship between 'prescriptions' and
-- 'prescription_items' in the schema cache" (PGRST200).
--
-- This means prescription_items.prescription_id either doesn't exist, or
-- exists without the foreign key constraint PostgREST needs to resolve
-- `items:prescription_items(...)` embeds. Same class of drift as the
-- invoice_items.reference_id issue fixed earlier. This script is
-- idempotent -- safe to run even if some/all of it already exists.

-- 1. Make sure the column exists.
ALTER TABLE prescription_items
  ADD COLUMN IF NOT EXISTS prescription_id uuid;

ALTER TABLE prescription_items
  ADD COLUMN IF NOT EXISTS medicine_id uuid;

-- 2. Make sure the foreign keys exist (guarded so this doesn't error out
--    if they're already there).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prescription_items_prescription_id_fkey'
  ) THEN
    ALTER TABLE prescription_items
      ADD CONSTRAINT prescription_items_prescription_id_fkey
      FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'prescription_items_medicine_id_fkey'
  ) THEN
    ALTER TABLE prescription_items
      ADD CONSTRAINT prescription_items_medicine_id_fkey
      FOREIGN KEY (medicine_id) REFERENCES medicines(id);
  END IF;
END $$;

-- 3. Force PostgREST to pick up the relationship immediately.
NOTIFY pgrst, 'reload schema';
