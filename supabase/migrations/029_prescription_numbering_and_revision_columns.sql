-- 029_prescription_numbering_and_revision_columns.sql
--
-- Adds unique, sequence-backed prescription numbering (mirroring the
-- existing patients.patient_code / invoices.invoice_number pattern), plus
-- the (nullable, unenforced-here) revision-lineage columns that migration
-- 031 later enforces.
--
-- See changes_03_prescription_editing_and_numbering.md for the full design
-- conversation this implements.

-- ---------------------------------------------------------------------
-- Numbering
-- ---------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS prescription_number_seq START 1;

ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS prescription_number TEXT;

CREATE OR REPLACE FUNCTION generate_prescription_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.prescription_number IS NULL THEN
    NEW.prescription_number = 'RX-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(NEXTVAL('prescription_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_prescription_number ON prescriptions;
CREATE TRIGGER trg_generate_prescription_number
  BEFORE INSERT ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION generate_prescription_number();

-- Backfill existing rows using their ORIGINAL created_at month, not today's
-- date -- a prescription from March gets a March-dated number, not one that
-- looks like it was created today. Ordered by created_at so the numeric
-- suffix still reads as roughly chronological within a backfilled month.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, created_at
    FROM prescriptions
    WHERE prescription_number IS NULL
    ORDER BY created_at ASC
  LOOP
    UPDATE prescriptions
    SET prescription_number = 'RX-' || TO_CHAR(r.created_at, 'YYYYMM') || '-' || LPAD(NEXTVAL('prescription_number_seq')::TEXT, 5, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

-- Only make it required/unique once every row genuinely has a value.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM prescriptions WHERE prescription_number IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce NOT NULL/UNIQUE on prescriptions.prescription_number -- some rows are still unbackfilled.';
  END IF;
END $$;

ALTER TABLE prescriptions ALTER COLUMN prescription_number SET NOT NULL;

ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_prescription_number_key UNIQUE (prescription_number);

-- ---------------------------------------------------------------------
-- Revision-lineage columns (columns only -- enforcement lives in 031,
-- kept as a separate migration because the columns don't depend on the
-- enforcement rules to exist meaningfully on their own)
-- ---------------------------------------------------------------------

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS revision_of UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

-- A prescription can be superseded by at most one other prescription.
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_superseded_by_key UNIQUE (superseded_by);
