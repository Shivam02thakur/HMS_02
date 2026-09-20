-- 042_lab_result_structured_ranges.sql
--
-- #8: replace the manual "Abnormal Result" checkbox with automatic
-- detection based on a structured reference range, where that's
-- actually possible to do correctly.
--
-- Deliberately NOT a blanket "remove the checkbox everywhere" change.
-- lab_tests.normal_range is free text today, and for 6 of the 10 seeded
-- tests it's literally the word "Varies" (Lipid Profile, Liver Function
-- Test, Kidney Function Test, Thyroid Profile) or "Normal" (Urine
-- Analysis) -- because those are PANEL tests with several
-- sub-components (e.g. Lipid Profile = total cholesterol + LDL + HDL +
-- triglycerides), each with its own reference range, and lab_results
-- only has one result_value column. There is no honest single
-- normal_min/normal_max for "Lipid Profile" as a whole -- forcing one
-- would silently produce wrong abnormal flags for whichever component
-- the recorded number doesn't actually represent. Properly supporting
-- panel tests would mean a lab_test_components table and multiple
-- sub-results per order, which is a materially bigger schema change
-- than what was asked for here.
--
-- So this adds three result-type paths instead of one blanket rule:
--   'numeric'     -- a single value with a min/max range (CBC, fasting
--                    blood sugar, HbA1c, Vitamin D, etc.) -- fully
--                    auto-detected.
--   'qualitative' -- a value chosen from a fixed set of options, some
--                    of which are flagged abnormal (Urine Analysis) --
--                    fully auto-detected via set membership.
--   'manual'      -- the default/fallback for everything else (the 4
--                    panel tests, and any future test an admin hasn't
--                    explicitly configured) -- keeps exactly the
--                    existing manual-checkbox behavior, unchanged.

ALTER TABLE lab_tests
  ADD COLUMN IF NOT EXISTS result_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (result_type IN ('numeric', 'qualitative', 'manual')),
  ADD COLUMN IF NOT EXISTS normal_min NUMERIC,
  ADD COLUMN IF NOT EXISTS normal_max NUMERIC,
  ADD COLUMN IF NOT EXISTS qualitative_options TEXT[],
  ADD COLUMN IF NOT EXISTS abnormal_values TEXT[],
  ADD COLUMN IF NOT EXISTS default_abnormal_remark TEXT;

-- Backfill the 5 tests that genuinely have one meaningful numeric
-- range, matched by their unique seeded code (004_seed.sql) rather than
-- parsing normal_range text, since these exact values are already known
-- and hand-parsing risks a subtle off-by-something error on something
-- this correctness-sensitive.
UPDATE lab_tests SET result_type = 'numeric', normal_min = 4.5, normal_max = 11.0,
  default_abnormal_remark = 'Outside the normal white cell range -- may indicate infection, inflammation, or a blood disorder. Correlate clinically.'
  WHERE code = 'CBC001';
UPDATE lab_tests SET result_type = 'numeric', normal_min = 70, normal_max = 100,
  default_abnormal_remark = 'Outside normal fasting glucose range -- consider repeat testing or further evaluation for hypo/hyperglycemia.'
  WHERE code = 'BSF002';
UPDATE lab_tests SET result_type = 'numeric', normal_min = 70, normal_max = 140,
  default_abnormal_remark = 'Outside normal post-prandial glucose range -- consider further evaluation for glucose intolerance.'
  WHERE code = 'BSP003';
UPDATE lab_tests SET result_type = 'numeric', normal_min = 4.0, normal_max = 5.6,
  default_abnormal_remark = 'Outside normal HbA1c range -- suggests suboptimal glycemic control over the past ~3 months.'
  WHERE code = 'HBA009';
UPDATE lab_tests SET result_type = 'numeric', normal_min = 30, normal_max = 100,
  default_abnormal_remark = 'Outside normal Vitamin D range -- consider supplementation if low, or review intake if high.'
  WHERE code = 'VIT010';

-- Urine Analysis: qualitative, not numeric -- a fixed set of expected
-- findings, with "Normal" the only non-abnormal one.
UPDATE lab_tests SET
  result_type = 'qualitative',
  qualitative_options = ARRAY['Normal', 'Trace Protein', 'Glucose Present', 'Blood Present', 'Leukocytes Present', 'Ketones Present'],
  abnormal_values = ARRAY['Trace Protein', 'Glucose Present', 'Blood Present', 'Leukocytes Present', 'Ketones Present'],
  default_abnormal_remark = 'Abnormal urinalysis finding -- correlate clinically and consider follow-up testing.'
  WHERE code = 'URN008';

-- Lipid Profile / Liver Function Test / Kidney Function Test / Thyroid
-- Profile deliberately left at the 'manual' default -- see header
-- comment. Any new test an admin adds later also defaults to 'manual'
-- until someone explicitly configures it as numeric/qualitative.

-- ============================================
-- Auto-detection trigger on lab_results
-- ============================================
-- BEFORE INSERT/UPDATE so is_abnormal is set as part of the same write,
-- not a separate follow-up call the application could forget to make.
-- Only touches NEW.is_abnormal for numeric/qualitative tests -- for
-- 'manual' tests it does nothing at all, leaving the existing
-- checkbox-driven value completely untouched.
CREATE OR REPLACE FUNCTION compute_lab_result_abnormal_flag()
RETURNS TRIGGER AS $$
DECLARE
  v_result_type TEXT;
  v_normal_min NUMERIC;
  v_normal_max NUMERIC;
  v_abnormal_values TEXT[];
  v_numeric_value NUMERIC;
BEGIN
  SELECT lt.result_type, lt.normal_min, lt.normal_max, lt.abnormal_values
    INTO v_result_type, v_normal_min, v_normal_max, v_abnormal_values
    FROM lab_orders lo
    JOIN lab_tests lt ON lt.id = lo.test_id
    WHERE lo.id = NEW.lab_order_id;

  IF v_result_type = 'numeric' AND v_normal_min IS NOT NULL AND v_normal_max IS NOT NULL THEN
    -- If result_value doesn't parse as a plain number (a lab tech typed
    -- something unexpected for a numeric test), leave is_abnormal as
    -- whatever was already provided rather than guessing or erroring
    -- out the whole result entry over a formatting issue.
    BEGIN
      v_numeric_value := NEW.result_value::NUMERIC;
      NEW.is_abnormal := (v_numeric_value < v_normal_min OR v_numeric_value > v_normal_max);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  ELSIF v_result_type = 'qualitative' AND v_abnormal_values IS NOT NULL THEN
    NEW.is_abnormal := (NEW.result_value = ANY(v_abnormal_values));
  END IF;
  -- result_type = 'manual' (or no match found): no change to
  -- NEW.is_abnormal -- whatever the caller set (the manual checkbox)
  -- stands, exactly as it did before this migration.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compute_lab_result_abnormal_flag_trigger ON lab_results;
CREATE TRIGGER compute_lab_result_abnormal_flag_trigger
  BEFORE INSERT OR UPDATE OF result_value ON lab_results
  FOR EACH ROW EXECUTE FUNCTION compute_lab_result_abnormal_flag();

NOTIFY pgrst, 'reload schema';
