-- 043_remove_imaging_workflow.sql
--
-- Removes the CT / X-Ray / MRI imaging demo from databases where
-- 039-042 (and the procedures seed in 015/026) were already applied
-- before imaging was taken out of those files. Safe to run on a fresh
-- database too -- every step is guarded / IF EXISTS.
--
-- WARNING: this deletes any lab_orders placed for the imaging tests
-- (Chest X-Ray, CT Scan, MRI Scan), along with their results and
-- imaging reports (ON DELETE CASCADE). Those orders only ever held
-- auto-generated dummy reports. Invoice lines already billed for them
-- are left untouched.
--
-- Not reversible here: the lab_order_status enum values
-- PENDING_APPROVAL and REJECTED (added by the old 039) stay in the type,
-- since Postgres cannot drop enum values. Nothing uses them any more.

-- 1. Trigger + functions that generated / approved / rejected imaging reports.
DROP TRIGGER IF EXISTS trg_generate_imaging_report_on_order ON lab_orders;
DROP FUNCTION IF EXISTS generate_imaging_report_on_order();
DROP FUNCTION IF EXISTS lab_approve_imaging_report(UUID);
DROP FUNCTION IF EXISTS lab_reject_imaging_report(UUID, TEXT);

-- 2. Imaging orders + the three imaging tests.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lab_tests' AND column_name = 'test_category'
  ) THEN
    EXECUTE $q$DELETE FROM lab_orders WHERE test_id IN (SELECT id FROM lab_tests WHERE test_category = 'IMAGING')$q$;
    EXECUTE $q$DELETE FROM lab_tests WHERE test_category = 'IMAGING'$q$;
  END IF;
END $$;

-- 3. Imaging report table (policies and indexes go with it).
DROP TABLE IF EXISTS lab_imaging_reports CASCADE;

-- 4. Re-create the two lab functions without the test_category check
--    (they must stop referencing the column before it is dropped).

CREATE OR REPLACE FUNCTION lab_save_result_values(p_order_id UUID, p_values JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status lab_order_status;
  v_item JSONB;
  v_parameter_id UUID;
  v_value TEXT;
  v_numeric NUMERIC;
  v_ref_low NUMERIC;
  v_ref_high NUMERIC;
  v_flag TEXT;
BEGIN
  PERFORM assert_lab_technician();

  SELECT status INTO v_status FROM lab_orders WHERE id = p_order_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lab order not found';
  END IF;
  IF v_status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Results cannot be changed once the report has been finalized or cancelled';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_values) LOOP
    v_parameter_id := (v_item->>'parameter_id')::UUID;
    v_value := v_item->>'result_value';

    SELECT ref_low, ref_high INTO v_ref_low, v_ref_high
    FROM lab_test_parameters WHERE id = v_parameter_id;

    v_flag := NULL;
    BEGIN
      v_numeric := v_value::NUMERIC;
      IF v_ref_low IS NOT NULL AND v_numeric < v_ref_low THEN
        v_flag := 'LOW';
      ELSIF v_ref_high IS NOT NULL AND v_numeric > v_ref_high THEN
        v_flag := 'HIGH';
      ELSIF v_ref_low IS NOT NULL OR v_ref_high IS NOT NULL THEN
        v_flag := 'NORMAL';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_flag := NULL; -- non-numeric (qualitative) value, no auto flag
    END;

    INSERT INTO lab_result_values (lab_order_id, parameter_id, result_value, flag, recorded_by)
    VALUES (p_order_id, v_parameter_id, v_value, v_flag, auth.uid())
    ON CONFLICT (lab_order_id, parameter_id)
    DO UPDATE SET result_value = EXCLUDED.result_value, flag = EXCLUDED.flag,
                  recorded_by = EXCLUDED.recorded_by, recorded_at = NOW();
  END LOOP;

  UPDATE lab_orders SET status = 'RESULTS_ENTERED', technician_id = auth.uid()
  WHERE id = p_order_id AND status IN ('PENDING', 'SAMPLE_COLLECTED', 'PROCESSING', 'RESULTS_ENTERED');
END;
$$;

CREATE OR REPLACE FUNCTION lab_finalize_report(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status lab_order_status;
  v_test_id UUID;
  v_param_count INTEGER;
  v_value_count INTEGER;
  v_summary TEXT;
  v_abnormal BOOLEAN;
BEGIN
  PERFORM assert_lab_technician();

  SELECT status, test_id INTO v_status, v_test_id
  FROM lab_orders WHERE id = p_order_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lab order not found';
  END IF;
  IF v_status IS DISTINCT FROM 'RESULTS_ENTERED' THEN
    RAISE EXCEPTION 'Enter results before finalizing the report';
  END IF;

  SELECT COUNT(*) INTO v_param_count FROM lab_test_parameters WHERE test_id = v_test_id;
  SELECT COUNT(*) INTO v_value_count FROM lab_result_values WHERE lab_order_id = p_order_id;
  IF v_param_count > 0 AND v_value_count < v_param_count THEN
    RAISE EXCEPTION 'All % parameter(s) must have a result before finalizing (% entered)', v_param_count, v_value_count;
  END IF;

  SELECT COALESCE(bool_or(flag IN ('LOW', 'HIGH', 'ABNORMAL')), FALSE) INTO v_abnormal
  FROM lab_result_values WHERE lab_order_id = p_order_id;

  SELECT string_agg(p.name || ': ' || v.result_value || COALESCE(' ' || p.unit, ''), ', ' ORDER BY p.sort_order)
  INTO v_summary
  FROM lab_result_values v JOIN lab_test_parameters p ON p.id = v.parameter_id
  WHERE v.lab_order_id = p_order_id;

  UPDATE lab_orders
  SET status = 'COMPLETED', completed_at = NOW(), technician_id = auth.uid()
  WHERE id = p_order_id;

  INSERT INTO lab_results (lab_order_id, result_value, remarks, is_abnormal, recorded_by)
  VALUES (p_order_id, COALESCE(v_summary, 'See laboratory report for details'),
          'Finalized -- see the laboratory report for the full parameter breakdown.', v_abnormal, auth.uid())
  ON CONFLICT (lab_order_id)
  DO UPDATE SET result_value = EXCLUDED.result_value, remarks = EXCLUDED.remarks,
                is_abnormal = EXCLUDED.is_abnormal, recorded_by = EXCLUDED.recorded_by, recorded_at = NOW();
END;
$$;

-- 5. The category column only existed to tell LABORATORY from IMAGING.
ALTER TABLE lab_tests DROP COLUMN IF EXISTS test_category;

-- 6. X-ray entry in the billable procedures price list.
DELETE FROM procedures WHERE name = 'X-Ray (Single View)';

NOTIFY pgrst, 'reload schema';
