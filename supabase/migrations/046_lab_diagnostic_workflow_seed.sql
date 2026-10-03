-- 041_lab_diagnostic_workflow_seed.sql
--
-- The tests named in the diagnostic-reporting spec, reusing whatever
-- already exists in lab_tests (004_seed.sql) instead of duplicating it:
--   Already present  -> CBC (CBC001), FBS (BSF002, "Blood Sugar Fasting"),
--     Lipid Profile (LIP004), LFT (LFT005), KFT/RFT (KFT006),
--     TFT (THY007, "Thyroid Profile"), Urine Routine (URN008),
--     HbA1c (HBA009).
--   Newly added here -> Serum Electrolytes, Blood Urea, Serum Creatinine,
--     CRP.
-- ON CONFLICT (code) guards make this safe to re-run.

INSERT INTO lab_tests (name, code, description, normal_range, unit, price) VALUES
  ('Serum Electrolytes', 'ELE011', 'Sodium, potassium, chloride and bicarbonate levels', 'Varies', 'mmol/L', 500),
  ('Blood Urea', 'URE012', 'Measures urea nitrogen in blood', '15-40', 'mg/dL', 250),
  ('Serum Creatinine', 'CRE013', 'Measures kidney filtration marker', '0.6-1.3', 'mg/dL', 250),
  ('C-Reactive Protein (CRP)', 'CRP014', 'Marker of inflammation', '<6', 'mg/L', 400)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- Predefined parameters + reference ranges (spec section 10). Looked up
-- by lab_tests.code so this works whether the test row came from
-- 004_seed.sql or the INSERT above.
DO $$
DECLARE
  v_test_id UUID;
BEGIN
  -- Complete Blood Count
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'CBC001';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'Hemoglobin', 'g/dL', '13-17', 13, 17, 1),
      (v_test_id, 'RBC Count', 'million/uL', '4.5-5.5', 4.5, 5.5, 2),
      (v_test_id, 'WBC Count', 'cells/uL', '4000-11000', 4000, 11000, 3),
      (v_test_id, 'Platelet Count', '/uL', '150000-450000', 150000, 450000, 4),
      (v_test_id, 'Hematocrit', '%', '40-50', 40, 50, 5),
      (v_test_id, 'MCV', 'fL', '83-101', 83, 101, 6),
      (v_test_id, 'MCH', 'pg', '27-32', 27, 32, 7),
      (v_test_id, 'MCHC', 'g/dL', '31.5-34.5', 31.5, 34.5, 8),
      (v_test_id, 'Neutrophils', '%', '40-80', 40, 80, 9),
      (v_test_id, 'Lymphocytes', '%', '20-40', 20, 40, 10),
      (v_test_id, 'Monocytes', '%', '2-10', 2, 10, 11),
      (v_test_id, 'Eosinophils', '%', '1-6', 1, 6, 12),
      (v_test_id, 'Basophils', '%', '0-2', 0, 2, 13)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- Fasting Blood Sugar
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'BSF002';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'Fasting Blood Glucose', 'mg/dL', '70-100', 70, 100, 1)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- HbA1c
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'HBA009';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'HbA1c', '%', '4.0-5.6', 4.0, 5.6, 1)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- Lipid Profile
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'LIP004';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'Total Cholesterol', 'mg/dL', '<200', NULL, 200, 1),
      (v_test_id, 'HDL', 'mg/dL', '40-60', 40, 60, 2),
      (v_test_id, 'LDL', 'mg/dL', '<100', NULL, 100, 3),
      (v_test_id, 'VLDL', 'mg/dL', '5-40', 5, 40, 4),
      (v_test_id, 'Triglycerides', 'mg/dL', '<150', NULL, 150, 5),
      (v_test_id, 'Cholesterol/HDL Ratio', 'ratio', '<5', NULL, 5, 6)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- Liver Function Test
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'LFT005';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'Total Bilirubin', 'mg/dL', '0.3-1.2', 0.3, 1.2, 1),
      (v_test_id, 'Direct Bilirubin', 'mg/dL', '0.1-0.3', 0.1, 0.3, 2),
      (v_test_id, 'Indirect Bilirubin', 'mg/dL', '0.2-0.9', 0.2, 0.9, 3),
      (v_test_id, 'ALT/SGPT', 'U/L', '7-56', 7, 56, 4),
      (v_test_id, 'AST/SGOT', 'U/L', '5-40', 5, 40, 5),
      (v_test_id, 'ALP', 'U/L', '44-147', 44, 147, 6),
      (v_test_id, 'Total Protein', 'g/dL', '6.0-8.3', 6.0, 8.3, 7),
      (v_test_id, 'Albumin', 'g/dL', '3.5-5.0', 3.5, 5.0, 8),
      (v_test_id, 'Globulin', 'g/dL', '2.0-3.5', 2.0, 3.5, 9),
      (v_test_id, 'A/G Ratio', 'ratio', '1.0-2.5', 1.0, 2.5, 10)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- Kidney Function Test
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'KFT006';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'Blood Urea', 'mg/dL', '15-40', 15, 40, 1),
      (v_test_id, 'Serum Creatinine', 'mg/dL', '0.6-1.3', 0.6, 1.3, 2),
      (v_test_id, 'eGFR', 'mL/min/1.73m2', '>90', 90, NULL, 3),
      (v_test_id, 'Uric Acid', 'mg/dL', '3.5-7.2', 3.5, 7.2, 4)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- Thyroid Function Test
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'THY007';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'T3', 'ng/dL', '80-200', 80, 200, 1),
      (v_test_id, 'T4', 'ug/dL', '5.1-14.1', 5.1, 14.1, 2),
      (v_test_id, 'TSH', 'uIU/mL', '0.4-4.0', 0.4, 4.0, 3)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- Urine Routine & Microscopy -- qualitative parameters have no
  -- numeric ref_low/ref_high, so no auto Normal/Low/High flag applies;
  -- reference_range is purely descriptive text here.
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'URN008';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'Colour', NULL, 'Pale Yellow', NULL, NULL, 1),
      (v_test_id, 'Appearance', NULL, 'Clear', NULL, NULL, 2),
      (v_test_id, 'Specific Gravity', NULL, '1.005-1.030', 1.005, 1.030, 3),
      (v_test_id, 'pH', NULL, '4.5-8.0', 4.5, 8.0, 4),
      (v_test_id, 'Protein', NULL, 'Nil', NULL, NULL, 5),
      (v_test_id, 'Glucose', NULL, 'Nil', NULL, NULL, 6),
      (v_test_id, 'Ketones', NULL, 'Nil', NULL, NULL, 7),
      (v_test_id, 'Bilirubin', NULL, 'Nil', NULL, NULL, 8),
      (v_test_id, 'Blood', NULL, 'Nil', NULL, NULL, 9),
      (v_test_id, 'RBC (Microscopy)', '/hpf', '0-2', NULL, NULL, 10),
      (v_test_id, 'WBC (Microscopy)', '/hpf', '0-5', NULL, NULL, 11),
      (v_test_id, 'Epithelial Cells', NULL, 'Few', NULL, NULL, 12),
      (v_test_id, 'Casts', NULL, 'Nil', NULL, NULL, 13),
      (v_test_id, 'Crystals', NULL, 'Nil', NULL, NULL, 14),
      (v_test_id, 'Bacteria', NULL, 'Nil', NULL, NULL, 15)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- Serum Electrolytes
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'ELE011';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'Sodium', 'mmol/L', '135-145', 135, 145, 1),
      (v_test_id, 'Potassium', 'mmol/L', '3.5-5.1', 3.5, 5.1, 2),
      (v_test_id, 'Chloride', 'mmol/L', '98-107', 98, 107, 3),
      (v_test_id, 'Bicarbonate', 'mmol/L', '22-29', 22, 29, 4)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- Blood Urea (standalone)
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'URE012';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'Urea', 'mg/dL', '15-40', 15, 40, 1),
      (v_test_id, 'BUN', 'mg/dL', '7-20', 7, 20, 2)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- Serum Creatinine (standalone)
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'CRE013';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'Creatinine', 'mg/dL', '0.6-1.3', 0.6, 1.3, 1),
      (v_test_id, 'eGFR', 'mL/min/1.73m2', '>90', 90, NULL, 2)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;

  -- CRP
  SELECT id INTO v_test_id FROM lab_tests WHERE code = 'CRP014';
  IF v_test_id IS NOT NULL THEN
    INSERT INTO lab_test_parameters (test_id, name, unit, reference_range, ref_low, ref_high, sort_order) VALUES
      (v_test_id, 'CRP', 'mg/L', '<6', NULL, 6, 1)
    ON CONFLICT (test_id, name) DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
