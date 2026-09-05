-- 028_doctor_user_id_unique.sql
-- doctors.user_id has existed since 001_schema.sql but nothing ever wrote to
-- it, so no real duplicate-linking could have happened yet. Now that
-- create-user/index.ts populates it on doctor creation (single atomic
-- action: login + doctor record together), enforce at the DB level that one
-- login can never be linked to more than one doctor record -- this is the
-- column the "Doctor can create prescriptions" RLS policy in 002_rls.sql
-- actually keys off of, so it's the real mechanism to constrain.
--
-- Guarded the same way as other constraint-adding migrations this session:
-- check for pre-existing duplicates first and raise a specific error naming
-- the offending user_id if any exist, rather than a bare constraint
-- violation with no indication of which row to fix.

DO $$
DECLARE
  dup RECORD;
BEGIN
  SELECT user_id, COUNT(*) AS cnt
  INTO dup
  FROM doctors
  WHERE user_id IS NOT NULL
  GROUP BY user_id
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF dup.user_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add doctors_user_id_key: profile % is already linked to % doctor rows. Resolve the duplicate link before re-running this migration.',
      dup.user_id, dup.cnt;
  END IF;
END $$;

ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_user_id_key;
ALTER TABLE doctors ADD CONSTRAINT doctors_user_id_key UNIQUE (user_id);

NOTIFY pgrst, 'reload schema';