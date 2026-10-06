-- 050_prescription_number_default.sql
-- prescription_number is NOT NULL and was filled only by the
-- trg_generate_prescription_number trigger, so generated TypeScript types
-- marked it as required on insert. A column default with the same expression
-- makes it optional in the types. Behavior is unchanged: defaults apply
-- before BEFORE INSERT triggers, so the trigger's IF ... IS NULL branch
-- simply never fires. The trigger is left in place as a safety net.

ALTER TABLE prescriptions
  ALTER COLUMN prescription_number SET DEFAULT
    'RX-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(NEXTVAL('prescription_number_seq')::TEXT, 5, '0');

NOTIFY pgrst, 'reload schema';