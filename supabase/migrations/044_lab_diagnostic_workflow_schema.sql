-- 039_lab_diagnostic_workflow_schema.sql
--
-- Laboratory & diagnostic reporting workflow: Doctor orders a test ->
-- Lab Technician processes it -> Report is finalized/approved. Builds
-- on the existing lab_orders/lab_tests/lab_results tables rather than
-- replacing them, so the previously-working simple flow (LaboratoryPage,
-- PatientDetailPage, PrescriptionsPage/PrescriptionDetailPage embeds)
-- keeps working unchanged.
--
-- Laboratory tests (CBC, LFT, etc.) get a predefined set of parameters
-- (lab_test_parameters) with reference ranges; the technician manually
-- enters one value per parameter (lab_result_values) -- never
-- auto-filled.
--
-- lab_order_status gets new intermediate values so the report stages are
-- trackable. Existing values (PENDING, IN_PROGRESS, CANCELLED) are
-- untouched; COMPLETED is deliberately reused as the one "finalized"
-- terminal state (finalized lab report) so every other place in the app
-- that already treats lab_orders.status = 'COMPLETED' as "done"
-- (dashboard stats, PatientDetailPage, PrescriptionDetailPage) keeps
-- working without any changes there.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction as a
-- statement that reads the new value, so this migration only adds the
-- values -- nothing here or in this same file compares a column against
-- them. They're first used in 041 (a separate migration/transaction).
ALTER TYPE lab_order_status ADD VALUE IF NOT EXISTS 'SAMPLE_COLLECTED';
ALTER TYPE lab_order_status ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE lab_order_status ADD VALUE IF NOT EXISTS 'RESULTS_ENTERED';

-- ---------------------------------------------------------------------
-- lab_orders: who actually did the lab work / finalized the report.
-- Deliberately separate from created_by (the doctor/admin who placed the
-- order) and never settable by the client directly -- only the RPC
-- functions in 042 (SECURITY DEFINER, using auth.uid() internally) write
-- to it, which is what satisfies "approval identity must come from the
-- logged-in technician, not be typed in".
ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS technician_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- lab_test_parameters: predefined parameter + reference range per
-- LABORATORY test. A test with zero rows here (any pre-existing simple
-- test, or a future one) just isn't broken down into parameters -- the
-- UI falls back to the original single result_value/lab_results flow for
-- those, so nothing already relying on that shape stops working.
--
-- ref_low/ref_high are nullable numeric bounds used only for the basic
-- Normal/Low/High comparison on numeric parameters (e.g. Hemoglobin).
-- Qualitative parameters (Urine Colour, Appearance, etc.) leave both
-- NULL and rely on reference_range purely as display text -- there's no
-- meaningful "high/low" for "Pale Yellow".
CREATE TABLE lab_test_parameters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID REFERENCES lab_tests(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  reference_range TEXT,
  ref_low NUMERIC,
  ref_high NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (test_id, name)
);

CREATE INDEX idx_lab_test_parameters_test ON lab_test_parameters(test_id);

-- ---------------------------------------------------------------------
-- lab_result_values: one row per parameter per order -- what the
-- technician actually typed in. This is intentionally a *different*
-- table from the existing lab_results (which stays a single
-- value/remarks/is_abnormal row per order for simple, non-parameterized
-- tests) rather than reshaping that table, so nothing already reading
-- `order.result.result_value` as a singular embed breaks.
--
-- flag is computed server-side (042's lab_save_result_values RPC) from
-- ref_low/ref_high, not trusted from the client -- it's a basic demo
-- comparison, explicitly not a medical diagnosis.
CREATE TABLE lab_result_values (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lab_order_id UUID REFERENCES lab_orders(id) ON DELETE CASCADE NOT NULL,
  parameter_id UUID REFERENCES lab_test_parameters(id) ON DELETE CASCADE NOT NULL,
  result_value TEXT,
  flag TEXT CHECK (flag IN ('NORMAL', 'LOW', 'HIGH', 'ABNORMAL')),
  recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lab_order_id, parameter_id)
);

CREATE INDEX idx_lab_result_values_order ON lab_result_values(lab_order_id);

NOTIFY pgrst, 'reload schema';
