-- 042_lab_diagnostic_workflow_functions.sql
--
-- All of the actual workflow logic. Every state transition that carries
-- an identity/timestamp claim (who collected the sample, who finalized
-- the report) goes through a SECURITY
-- DEFINER function that takes identity from auth.uid() and time from
-- NOW() -- never from a client-supplied column -- following the same
-- role-check idiom as 037_profile_change_requests_and_notifications.sql
-- (`IS DISTINCT FROM`, not `<>` or `NOT IN`, so an unauthenticated/
-- roleless caller -- where get_current_user_role() is NULL -- is
-- correctly rejected instead of slipping through three-valued logic).

-- ---------------------------------------------------------------------
-- Small shared guard, used by every function below: raises unless the
-- caller is admin or lab_technician.
CREATE OR REPLACE FUNCTION assert_lab_technician()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF get_current_user_role() IS DISTINCT FROM 'admin' AND get_current_user_role() IS DISTINCT FROM 'lab_technician' THEN
    RAISE EXCEPTION 'Only a lab technician can perform this action';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- Lab stage transitions: Ordered -> Sample Collected -> Processing.
-- (Results Entered / Finalized are reached via lab_save_result_values
-- and lab_finalize_report below, not here.)
CREATE OR REPLACE FUNCTION lab_start_sample_collection(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status lab_order_status;
BEGIN
  PERFORM assert_lab_technician();

  SELECT status INTO v_status FROM lab_orders WHERE id = p_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lab order not found';
  END IF;
  IF v_status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'Sample can only be marked collected from the Ordered stage';
  END IF;

  UPDATE lab_orders SET status = 'SAMPLE_COLLECTED', technician_id = auth.uid()
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION lab_start_processing(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status lab_order_status;
BEGIN
  PERFORM assert_lab_technician();

  SELECT status INTO v_status FROM lab_orders WHERE id = p_order_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Lab order not found';
  END IF;
  IF v_status IS DISTINCT FROM 'SAMPLE_COLLECTED' THEN
    RAISE EXCEPTION 'Processing can only start after the sample has been collected';
  END IF;

  UPDATE lab_orders SET status = 'PROCESSING', technician_id = auth.uid()
  WHERE id = p_order_id;
END;
$$;

-- ---------------------------------------------------------------------
-- Save (or update) the technician's manually-entered parameter values.
-- p_values is a JSON array of {"parameter_id": "...", "result_value": "..."}.
-- The Normal/Low/High flag is computed here, server-side, from the
-- parameter's own ref_low/ref_high -- purely a basic demo comparison,
-- never presented as a medical diagnosis. Non-numeric entries (e.g.
-- Urine "Pale Yellow") simply get no flag.
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

-- ---------------------------------------------------------------------
-- Finalize a laboratory report. Requires every predefined parameter to
-- have a value (tests with zero predefined parameters -- i.e. legacy
-- simple tests never covered by this feature -- are exempt, since
-- there's nothing here for them to fill in; they keep using the
-- original lab_results flow in the UI instead). Also writes a summary
-- row into the original lab_results table so PatientDetailPage,
-- PrescriptionDetailPage and the existing dashboard keep showing
-- something meaningful without needing to know about the new tables.
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

NOTIFY pgrst, 'reload schema';
