-- 023_invoice_adjustments.sql
-- Waiver/adjustment functionality: a receptionist can write off part of
-- an outstanding balance (e.g. a goodwill discount, a billing error
-- correction) without it being recorded as money that was actually
-- collected. Previously "Mark as paid without payment" just force-set
-- invoices.paid_amount = total_amount directly -- that overwrote the
-- real collected-payments figure with a fabricated one, always wiped
-- the *entire* balance in one shot with no amount control, and left no
-- record of why. This replaces that with a proper ledger table:
-- adjustments are entered with an explicit amount + reason, capped at
-- the outstanding balance, and kept completely separate from payments
-- so paid_amount always reflects real money collected.

CREATE TABLE IF NOT EXISTS invoice_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  adjustment_type text NOT NULL DEFAULT 'WAIVER'
    CHECK (adjustment_type IN ('WAIVER', 'WRITE_OFF', 'DISCOUNT', 'CORRECTION')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_adjustments_invoice_id
  ON invoice_adjustments (invoice_id);

-- Running total of everything waived/adjusted off this invoice, kept in
-- sync the same way paid_amount is: recomputed from the ledger table
-- (invoice_adjustments), never written to directly by a screen.
-- Outstanding balance is therefore always total_amount - paid_amount -
-- waived_amount.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS waived_amount numeric NOT NULL DEFAULT 0;

ALTER TABLE invoice_adjustments ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can view adjustments (matches the existing
-- "All authenticated can view ..." pattern used for invoice_items,
-- prescription_items, etc).
CREATE POLICY "All authenticated can view invoice adjustments"
  ON invoice_adjustments FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admin can do anything.
CREATE POLICY "Admin can manage invoice adjustments"
  ON invoice_adjustments FOR ALL
  USING (get_current_user_role() = 'admin'::user_role)
  WITH CHECK (get_current_user_role() = 'admin'::user_role);

-- Receptionists record adjustments (same role that records payments).
CREATE POLICY "Receptionist can add invoice adjustments"
  ON invoice_adjustments FOR INSERT
  WITH CHECK (get_current_user_role() = 'receptionist'::user_role);

NOTIFY pgrst, 'reload schema';
