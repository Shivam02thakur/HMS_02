-- 031_enforce_prescription_revision_rules.sql
--
-- Enforces, at the database level, the rules established in the design
-- conversation (changes_03_prescription_editing_and_numbering.md):
--   - a prescription can only be revised by the SAME doctor who wrote it
--   - revision_of must point to a prescription for the SAME patient
--   - a prescription that has already been superseded cannot be revised
--     a second time
--   - revising a prescription atomically flips the OLD prescription's
--     superseded_by/superseded_at, so the application never has to make
--     two separate writes that could fall out of sync if one failed
--     partway
--   - a purchase can never be recorded against a superseded prescription,
--     regardless of remaining quantity
--
-- Deliberately database-level, not just a UI restriction (the revise
-- picker only ever shows same-doctor prescriptions) -- rules this central
-- to how the medical record works should hold even against direct API or
-- SQL access.

-- ---------------------------------------------------------------------
-- Rule set 1: revision integrity
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_prescription_revision()
RETURNS TRIGGER AS $$
DECLARE
  old_doctor_id UUID;
  old_patient_id UUID;
  old_superseded_by UUID;
BEGIN
  IF NEW.revision_of IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT doctor_id, patient_id, superseded_by
    INTO old_doctor_id, old_patient_id, old_superseded_by
    FROM prescriptions
    WHERE id = NEW.revision_of
    FOR UPDATE;

  IF old_doctor_id IS NULL THEN
    RAISE EXCEPTION 'revision_of does not reference an existing prescription';
  END IF;

  IF old_doctor_id != NEW.doctor_id THEN
    RAISE EXCEPTION 'A prescription can only be revised by the same doctor who originally wrote it';
  END IF;

  IF old_patient_id != NEW.patient_id THEN
    RAISE EXCEPTION 'revision_of must reference a prescription for the same patient';
  END IF;

  IF old_superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'This prescription has already been superseded and cannot be revised a second time';
  END IF;

  -- Atomic: the old prescription is flipped to superseded in the same
  -- operation that creates its replacement, not as a follow-up write the
  -- application could fail to make.
  UPDATE prescriptions SET superseded_by = NEW.id, superseded_at = NOW() WHERE id = NEW.revision_of;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_prescription_revision ON prescriptions;
CREATE TRIGGER trg_enforce_prescription_revision
  AFTER INSERT ON prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_prescription_revision();

-- ---------------------------------------------------------------------
-- Rule set 2: purchases blocked against a superseded prescription
-- ---------------------------------------------------------------------

-- Built as a database trigger rather than an application-level check
-- alone because it's directly money/inventory-adjacent -- the kind of
-- rule that should hold even if a future code path forgets to check it
-- in JavaScript.
CREATE OR REPLACE FUNCTION enforce_no_purchase_against_superseded_prescription()
RETURNS TRIGGER AS $$
DECLARE
  parent_superseded_by UUID;
BEGIN
  IF NEW.prescription_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.superseded_by
    INTO parent_superseded_by
    FROM prescription_items pi
    JOIN prescriptions p ON p.id = pi.prescription_id
    WHERE pi.id = NEW.prescription_item_id;

  IF parent_superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot purchase against a superseded prescription -- it has been replaced by a newer prescription';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_no_purchase_against_superseded_prescription ON invoice_items;
CREATE TRIGGER trg_enforce_no_purchase_against_superseded_prescription
  BEFORE INSERT OR UPDATE OF prescription_item_id ON invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION enforce_no_purchase_against_superseded_prescription();
