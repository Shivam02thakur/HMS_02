-- 040_lab_diagnostic_workflow_rls.sql
--
-- Follows the exact same shape as the existing lab_tests/lab_results
-- policies (002_rls.sql): everyone authenticated can view, only the
-- relevant role(s) can write. Lab technician permissions here are
-- intentionally narrow -- see 042 for why direct writes to
-- lab_result_values are still not enough by themselves to satisfy
-- "identity can't be typed in", which is why the finalize action goes
-- through a SECURITY DEFINER RPC (042) instead of relying on these
-- table policies alone for those specific fields.

ALTER TABLE lab_test_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_result_values ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- LAB TEST PARAMETERS -- reference data, same access shape as lab_tests.
CREATE POLICY "All authenticated can view lab test parameters" ON lab_test_parameters
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage lab test parameters" ON lab_test_parameters
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

-- ---------------------------------------------------------------------
-- LAB RESULT VALUES -- only the lab technician (or admin) ever enters
-- these; doctors and receptionists can see them (needed for the final
-- report view) but never write them, matching "Lab Technician SHOULD NOT
-- ... doctors CAN'T enter results either" from the permission list.
CREATE POLICY "All authenticated can view lab result values" ON lab_result_values
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Lab technician can manage lab result values" ON lab_result_values
  FOR ALL USING (get_current_user_role() IN ('admin', 'lab_technician'))
  WITH CHECK (get_current_user_role() IN ('admin', 'lab_technician'));
