-- 040_invoice_status_rule_and_safe_delete.sql
--
-- Follow-up to 039_atomic_payment_reconciliation.sql. Fixes three things:
--
--  1. "Empty invoice shows PAID": the status rule was
--         settled >= total - 0.01   ->  'PAID'
--     and with total = 0 that is `0 >= -0.01`, i.e. TRUE. So the moment
--     anything recomputed an invoice with no items (e.g. removing the last
--     item), it flipped to PAID and locked itself ("fully paid and
--     closed") at Rs 0.00. Worse, 039's one-time repair loop runs that same
--     rule over EVERY invoice, so applying 039 alone would flip every
--     existing empty invoice to PAID. Nothing owed is not the same thing as
--     paid: PAID now requires total_amount > 0.
--
--  2. "Payment accepted twice": 039 stops OVER-payment, but cannot stop a
--     duplicate PARTIAL payment (balance 100, pay 40 twice -> 80 recorded)
--     or a retry after a lost response. Payments get an optional
--     client_request_id (the app generates one per payment attempt) with a
--     unique index; a repeat of the same attempt is rejected as a
--     unique_violation (23505), which the app treats as "already recorded".
--     The guard also now rejects zero / negative amounts, which the table
--     never constrained.
--
--  3. "No way to remove an invoice": adds delete_unpaid_invoice(). A plain
--     DELETE on invoices is dangerous because payments.invoice_id and
--     invoice_adjustments.invoice_id are ON DELETE CASCADE -- deleting an
--     invoice with money on it would silently erase the payment ledger and
--     the revenue with it. This function refuses in that case.
--
-- Requires 039 (checked below). Safe to re-run.

DO $$
BEGIN
  IF to_regprocedure('public.reconcile_invoice_totals(uuid)') IS NULL THEN
    RAISE EXCEPTION '040 requires 039_atomic_payment_reconciliation.sql to be applied first';
  END IF;
END;
$$;

-- ============================================================
-- 1. Status rule: PAID requires something to have been owed.
-- ============================================================
CREATE OR REPLACE FUNCTION reconcile_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total   NUMERIC;
  v_paid    NUMERIC;
  v_waived  NUMERIC;
  v_status  invoice_status;
BEGIN
  SELECT total_amount INTO v_total FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE invoice_id = p_invoice_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_waived FROM invoice_adjustments WHERE invoice_id = p_invoice_id;

  v_status := CASE
    WHEN v_total > 0 AND v_paid + v_waived >= v_total - 0.01 THEN 'PAID'::invoice_status
    WHEN v_paid + v_waived > 0 THEN 'PARTIAL'::invoice_status
    ELSE 'PENDING'::invoice_status
  END;

  UPDATE invoices
  SET paid_amount = v_paid,
      waived_amount = v_waived,
      status = v_status
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- Repair: invoices with nothing on them that the old rule wrongly closed.
UPDATE invoices
SET status = 'PENDING'
WHERE total_amount = 0
  AND paid_amount = 0
  AND COALESCE(waived_amount, 0) = 0
  AND status <> 'PENDING';

-- ============================================================
-- 2. Idempotent payments + stricter guard.
-- ============================================================
ALTER TABLE payments ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS payments_invoice_client_request_uidx
  ON payments (invoice_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_payment_overpayment()
RETURNS TRIGGER AS $$
DECLARE
  v_total   NUMERIC;
  v_paid    NUMERIC;
  v_waived  NUMERIC;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock first: concurrent inserts for the same invoice serialize here,
  -- so the duplicate check and the balance check below both see the
  -- other request's committed row.
  SELECT total_amount INTO v_total FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % does not exist', NEW.invoice_id;
  END IF;

  -- Same payment attempt submitted again (double-click, second tab, or a
  -- retry after a lost response): report it as a duplicate rather than
  -- as an "overpayment", so the app can treat it as already recorded.
  IF NEW.client_request_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM payments
    WHERE invoice_id = NEW.invoice_id AND client_request_id = NEW.client_request_id
  ) THEN
    RAISE EXCEPTION 'This payment was already recorded'
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE invoice_id = NEW.invoice_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_waived FROM invoice_adjustments WHERE invoice_id = NEW.invoice_id;

  IF v_paid + v_waived + NEW.amount > v_total + 0.01 THEN
    RAISE EXCEPTION 'Payment of % would exceed the invoice balance (total %, already settled %)',
      NEW.amount, v_total, v_paid + v_waived
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Safe invoice removal.
-- SECURITY INVOKER (the default) on purpose: row-level security still
-- applies, so only roles that may already manage invoices (admin,
-- receptionist) can delete -- for anyone else the invoice is simply
-- "not found" here.
-- ============================================================
CREATE OR REPLACE FUNCTION delete_unpaid_invoice(p_invoice_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM 1 FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found, or you do not have permission to delete it';
  END IF;

  IF EXISTS (SELECT 1 FROM payments WHERE invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'This invoice has recorded payments. Cancel those payments first, then delete it.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM invoice_adjustments WHERE invoice_id = p_invoice_id) THEN
    RAISE EXCEPTION 'This invoice has a waiver/adjustment recorded and cannot be deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM invoice_items WHERE invoice_id = p_invoice_id AND dispensed) THEN
    RAISE EXCEPTION 'Medicines on this invoice have already been dispensed. Cancel the payment to return stock first.'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM invoices WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;
