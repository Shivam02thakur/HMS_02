-- 027_lab_result_uniqueness_and_legacy_trigger_cleanup.sql
--
-- Two small, unrelated, backend-only bug fixes bundled together because
-- both are one-statement schema corrections with no frontend changes.

-- ---------------------------------------------------------------------
-- Fix 1: lab_results had no uniqueness constraint on lab_order_id.
--
-- Both LaboratoryPage.tsx and PatientDetailPage.tsx embed the result via
-- `.select('*, result:lab_results(*)')` and access it as a SINGULAR
-- object (`order.result.result_value`, `order.result.recorded_at`).
-- PostgREST infers relationship cardinality from actual DB constraints --
-- with no UNIQUE declared on lab_order_id, it infers one-to-many and
-- returns the embed in a shape the frontend doesn't expect, so
-- .result_value/.recorded_at come back undefined ("Result: -",
-- "Recorded: Invalid Date").
--
-- Guard against pre-existing duplicate rows first, so this fails with a
-- specific, actionable error instead of a bare constraint violation if
-- any exist.
DO $$
DECLARE
  dupe RECORD;
BEGIN
  FOR dupe IN
    SELECT lab_order_id, COUNT(*) AS c
    FROM lab_results
    GROUP BY lab_order_id
    HAVING COUNT(*) > 1
  LOOP
    RAISE EXCEPTION 'lab_order_id % has % lab_results rows -- resolve duplicates manually before re-running this migration', dupe.lab_order_id, dupe.c;
  END LOOP;
END $$;

ALTER TABLE lab_results ADD CONSTRAINT lab_results_lab_order_id_key UNIQUE (lab_order_id);

-- ---------------------------------------------------------------------
-- Fix 2: a superseded database trigger was silently duplicating
-- application logic.
--
-- update_invoice_after_payment (003_functions.sql) calls
-- update_invoice_on_payment() to write invoices.paid_amount/status
-- directly on every payment insert. 017_manual_mark_as_paid.sql later
-- redefined that function's body with CREATE OR REPLACE FUNCTION -- and
-- because the trigger references the function by name (not a frozen
-- definition), it silently picked up the new logic and kept firing.
--
-- src/lib/billing.ts's recalcInvoicePaymentState() -- called by the app
-- immediately after every payment/waiver -- does its own independent,
-- more complete recalculation (it also accounts for waived_amount,
-- which the trigger never did). The app-level write happens second
-- within the same request, so it currently overwrites the trigger's
-- result and nothing user-visible is wrong -- but two independent,
-- disagreeing sources of truth exist on the same columns, and if the
-- app-level call ever failed partway through, the trigger's more
-- primitive, waiver-blind numbers would be left standing.
DROP TRIGGER IF EXISTS update_invoice_after_payment ON payments;
DROP FUNCTION IF EXISTS update_invoice_on_payment();
