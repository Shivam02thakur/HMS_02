-- 034_enforce_prescription_quantity_cap.sql
--
-- The prescribed-medicine purchase flow (AddItemModal's "Link to
-- Prescription" option, migration 030's quantity/override columns) caps
-- the purchase quantity client-side and offers a pharmacist/admin
-- override -- but testing confirmed the cap was client-only: a direct
-- insert of a quantity exceeding what remained, with no override fields
-- set, succeeded without any objection from the database.
--
-- Since this is directly money/inventory-adjacent (the same category of
-- concern already covered by the supersession block in migration 031),
-- 031's enforce_no_purchase_against_superseded_prescription() trigger
-- function is extended here to also enforce the cap -- CREATE OR REPLACE
-- on the same function, same trigger, so nothing about the trigger
-- wiring itself needs to change.
CREATE OR REPLACE FUNCTION enforce_no_purchase_against_superseded_prescription()
RETURNS TRIGGER AS $$
DECLARE
  parent_superseded_by UUID;
  prescribed_quantity NUMERIC(10,2);
  already_purchased NUMERIC(10,2);
BEGIN
  IF NEW.prescription_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.superseded_by, pi.quantity
    INTO parent_superseded_by, prescribed_quantity
    FROM prescription_items pi
    JOIN prescriptions p ON p.id = pi.prescription_id
    WHERE pi.id = NEW.prescription_item_id;

  IF parent_superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot purchase against a superseded prescription -- it has been replaced by a newer prescription';
  END IF;

  -- prescribed_quantity NULL means "no cap recorded" (legacy prescription
  -- item written before quantity existed) -- unlimited, same as before
  -- this column existed. quantity_override_by set means a pharmacist/
  -- admin has authorized going over the cap; the all-or-nothing CHECK
  -- constraint from migration 030 guarantees that's never a partial,
  -- unauthenticated-looking record.
  IF prescribed_quantity IS NOT NULL AND NEW.quantity_override_by IS NULL THEN
    SELECT COALESCE(SUM(quantity), 0) INTO already_purchased
      FROM invoice_items
      WHERE prescription_item_id = NEW.prescription_item_id
        AND id IS DISTINCT FROM NEW.id;
    IF already_purchased + NEW.quantity > prescribed_quantity THEN
      RAISE EXCEPTION 'Purchase exceeds remaining prescribed quantity (% remaining, % requested) -- use the quantity override if this is authorized', prescribed_quantity - already_purchased, NEW.quantity;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition itself is unchanged (still fires BEFORE INSERT OR
-- UPDATE OF prescription_item_id ON invoice_items) -- only the function
-- body changed, so no DROP/CREATE TRIGGER needed here.
