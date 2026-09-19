-- 039_atomic_payment_reconciliation.sql
--
-- NOTE: the incremental `update_invoice_after_payment` trigger described
-- below was already dropped by 027_lab_result_uniqueness_and_legacy_trigger_cleanup.sql,
-- so step (a) is a safe no-op on any DB that ran 027. The real value of
-- this migration is (b) and (c). Known gaps in this file are fixed by
-- 040_invoice_status_rule_and_safe_delete.sql -- apply that right after.
--
-- ROOT CAUSE of the "payment doesn't show correctly, due doubles, then
-- fixes itself after re-settling" bug:
--
-- Two independent writers were both updating invoices.paid_amount/status
-- on every payment:
--
--   1. The `update_invoice_after_payment` trigger (003_functions.sql,
--      redefined in 017_manual_mark_as_paid.sql) -- fires AFTER INSERT
--      on `payments` and does an INCREMENTAL update:
--          paid_amount = paid_amount + NEW.amount
--      It never runs on DELETE, so cancelling a payment doesn't touch it
--      at all -- it relies entirely on the app-level recalc for that
--      half of the lifecycle. And because it's incremental rather than
--      recomputed from the ledger, two near-simultaneous payment inserts
--      on the same invoice (a double-click with no submit-button guard,
--      or two receptionists on the same invoice) both read the same
--      pre-update paid_amount, both add their own NEW.amount to that
--      stale value, and whichever COMMITs last wins -- silently losing
--      one of the two payments from invoices.paid_amount even though
--      both rows exist in `payments`.
--
--   2. `recalcInvoicePaymentState()` (src/lib/billing.ts) -- called by
--      the app immediately after every insert/delete, and comprehensive
--      (recomputes paid_amount from SUM(payments) + SUM(adjustments)).
--      This is correct on its own, but it's a *separate*, *later*
--      network round-trip -- not atomic with the payment write, and not
--      guaranteed to run at all if the request is interrupted (tab
--      closed, network drop) between the insert and the recalc.
--
-- Symptom this produces: record a payment -> trigger's stale increment
-- briefly shows a wrong total (or double-click inserts two rows and the
-- trigger clobbers one) -> user cancels, sees a doubled due amount
-- because the cancel recalculation is fighting the trigger's leftover
-- state -> user re-settles -> the next `recalcInvoicePaymentState` call
-- finally forces the correct SUM-based numbers, "fixing" it and making
-- revenue appear.
--
-- FIX: there must be exactly one source of truth for paid_amount /
-- waived_amount / status, it must live in the database (not depend on
-- the client calling back afterward), and it must be atomic with the
-- write that changed the ledger. This migration:
--
--   (a) Drops the old incremental trigger/function entirely.
--   (b) Adds `reconcile_invoice_totals()`, a comprehensive recompute
--       (SUM(payments) + SUM(invoice_adjustments) vs total_amount) that
--       runs as part of the SAME transaction as any insert/update/delete
--       on `payments` or `invoice_adjustments`, via AFTER triggers on
--       both tables -- so paid_amount/waived_amount/status can never
--       drift from the ledger, regardless of what the client does or
--       fails to do afterward.
--   (c) Adds a BEFORE INSERT trigger on `payments` that locks the
--       parent invoice row (SELECT ... FOR UPDATE) and rejects any
--       payment that would push paid+waived over total_amount. Locking
--       the invoice row is also what makes this safe under concurrency
--       (spec section 21): two simultaneous payment inserts on the same
--       invoice now serialize on that lock instead of racing, so the
--       second one sees the first one's already-committed paid_amount
--       before deciding whether it fits under the total.
--
-- The app-level recalcInvoicePaymentState() call is left in place after
-- this migration (it's now a harmless, redundant read of the same
-- numbers the trigger already committed) -- defense in depth costs
-- nothing here, but it is no longer what the correctness of the system
-- depends on.

DROP TRIGGER IF EXISTS update_invoice_after_payment ON payments;
DROP FUNCTION IF EXISTS update_invoice_on_payment();

-- ============================================================
-- (b) Comprehensive, idempotent recompute -- single source of truth.
-- ============================================================
CREATE OR REPLACE FUNCTION reconcile_invoice_totals(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
  v_total   NUMERIC;
  v_paid    NUMERIC;
  v_waived  NUMERIC;
  v_status  invoice_status;
BEGIN
  -- Lock the invoice row for the duration of this recompute so a
  -- concurrent payment/adjustment on the same invoice can't interleave
  -- with this read-then-write.
  SELECT total_amount INTO v_total FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE invoice_id = p_invoice_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_waived FROM invoice_adjustments WHERE invoice_id = p_invoice_id;

  v_status := CASE
    WHEN v_paid + v_waived >= v_total - 0.01 THEN 'PAID'::invoice_status
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

CREATE OR REPLACE FUNCTION payments_reconcile_trigger()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM reconcile_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN NULL; -- AFTER trigger, return value ignored
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_after_change ON payments;
CREATE TRIGGER payments_after_change
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_reconcile_trigger();

CREATE OR REPLACE FUNCTION invoice_adjustments_reconcile_trigger()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM reconcile_invoice_totals(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoice_adjustments_after_change ON invoice_adjustments;
CREATE TRIGGER invoice_adjustments_after_change
  AFTER INSERT OR UPDATE OR DELETE ON invoice_adjustments
  FOR EACH ROW EXECUTE FUNCTION invoice_adjustments_reconcile_trigger();

-- ============================================================
-- (c) DB-level overpayment guard + concurrency serialization.
-- Previously overpayment was checked only in React (and, on the
-- BillingPage "Settle" flow, that check was actually unreachable dead
-- code -- see the accompanying app fix). This makes the invariant
-- (paid + waived <= total) impossible to violate no matter which
-- screen, script, or future code path inserts a payment.
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_payment_overpayment()
RETURNS TRIGGER AS $$
DECLARE
  v_total   NUMERIC;
  v_paid    NUMERIC;
  v_waived  NUMERIC;
BEGIN
  SELECT total_amount INTO v_total FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % does not exist', NEW.invoice_id;
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

DROP TRIGGER IF EXISTS payments_before_insert_guard ON payments;
CREATE TRIGGER payments_before_insert_guard
  BEFORE INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION prevent_payment_overpayment();

-- One-time repair pass: bring every existing invoice's paid_amount /
-- waived_amount / status in line with its actual ledger now, in case
-- the old incremental trigger's races already left any invoice out of
-- sync with SUM(payments)/SUM(invoice_adjustments).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM invoices LOOP
    PERFORM reconcile_invoice_totals(r.id);
  END LOOP;
END;
$$;