-- 030_prescription_item_quantity_and_purchase_link.sql
--
-- Adds the quantity cap that prescription_items never had, a link from an
-- invoice line back to the exact prescribed line it was purchased against,
-- and the deliberate, auditable "buy beyond remaining quantity" override.
--
-- See changes_03_prescription_editing_and_numbering.md, Iteration 5 & 6.

-- ---------------------------------------------------------------------
-- Quantity cap
-- ---------------------------------------------------------------------

-- Deliberately nullable: existing rows have no honest historical quantity
-- to backfill (it was simply never captured). NULL is treated by the
-- application as "no cap recorded" -- old prescriptions keep working
-- exactly as before (unlimited), rather than being coerced to 0, which
-- would read as "nothing left to buy" and silently break every existing
-- prescription's medicine list.
ALTER TABLE prescription_items ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,2);

ALTER TABLE prescription_items
  ADD CONSTRAINT prescription_items_quantity_non_negative
  CHECK (quantity IS NULL OR quantity >= 0);

-- ---------------------------------------------------------------------
-- Purchase-tracking link
-- ---------------------------------------------------------------------

-- "Remaining quantity" has to be computed per prescription LINE, not per
-- medicine in general -- the same drug prescribed on two different
-- prescriptions is two separate allowances.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS prescription_item_id UUID
  REFERENCES prescription_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_items_prescription_item_id
  ON invoice_items(prescription_item_id);

-- ---------------------------------------------------------------------
-- Deliberate, auditable quantity override
-- ---------------------------------------------------------------------

-- Constrained all-or-nothing so a partially-recorded override (e.g. a
-- reason with no recorded author) can never exist -- which would defeat
-- the auditability the feature exists for in the first place.
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS quantity_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS quantity_override_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity_override_at TIMESTAMPTZ;

ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_override_all_or_nothing
  CHECK (
    (quantity_override_reason IS NULL AND quantity_override_by IS NULL AND quantity_override_at IS NULL)
    OR
    (quantity_override_reason IS NOT NULL AND quantity_override_by IS NOT NULL AND quantity_override_at IS NOT NULL)
  );
