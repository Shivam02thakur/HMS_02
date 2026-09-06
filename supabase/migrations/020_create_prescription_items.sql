-- 020_create_prescription_items.sql
-- prescription_items never existed on the live database (confirmed via
-- information_schema.tables) even though prescriptions itself does, and
-- the frontend/types have always assumed it was there. This creates it
-- from scratch, matching the column shapes already in database.types.ts,
-- and gives it RLS policies that mirror the existing pattern on
-- prescriptions/lab_orders (doctors manage their own, admin manages all,
-- everyone authenticated can view).

CREATE TABLE IF NOT EXISTS prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medicine_id uuid NOT NULL REFERENCES medicines(id),
  dosage text NOT NULL,
  frequency text NOT NULL,
  duration text NOT NULL,
  instructions text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;

-- Everyone signed in can view items (matches "All authenticated can view
-- prescriptions" / "...invoice items" / "...lab orders").
--
-- Guarded with a pg_policies existence check: prescription_items and its
-- policies actually already exist from 001_schema.sql/002_rls.sql on any
-- database that's been running since before this migration was written
-- (001_schema.sql's own CREATE TABLE already defines this table). On
-- such a database, the CREATE TABLE IF NOT EXISTS above is a no-op, but
-- an unguarded CREATE POLICY here would still fail with "policy already
-- exists" -- confirmed by an actual from-zero replay, not by inspection.
-- The guard makes this migration idempotent whether it's the first thing
-- to ever create these policies (a genuinely from-zero database) or a
-- no-op replay against a database where 001/002 got there first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prescription_items'
      AND policyname = 'All authenticated can view prescription items'
  ) THEN
    CREATE POLICY "All authenticated can view prescription items"
      ON prescription_items FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Admin can do anything (matches "Admin can manage prescriptions").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prescription_items'
      AND policyname = 'Admin can manage prescription items'
  ) THEN
    CREATE POLICY "Admin can manage prescription items"
      ON prescription_items FOR ALL
      USING (get_current_user_role() = 'admin'::user_role)
      WITH CHECK (get_current_user_role() = 'admin'::user_role);
  END IF;
END $$;

-- A doctor can add items only to their own prescriptions (matches
-- "Doctor can create prescriptions" / "Doctor can update own prescriptions").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prescription_items'
      AND policyname = 'Doctor can add items to own prescriptions'
  ) THEN
    CREATE POLICY "Doctor can add items to own prescriptions"
      ON prescription_items FOR INSERT
      WITH CHECK (
        get_current_user_role() = 'doctor'::user_role
        AND prescription_id IN (
          SELECT p.id FROM prescriptions p
          JOIN doctors d ON d.id = p.doctor_id
          WHERE d.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- A doctor can remove items from their own prescriptions (the app doesn't
-- do this yet, but it's the natural counterpart to insert and keeps this
-- table consistent with the rest of the RLS pattern).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'prescription_items'
      AND policyname = 'Doctor can delete items from own prescriptions'
  ) THEN
    CREATE POLICY "Doctor can delete items from own prescriptions"
      ON prescription_items FOR DELETE
      USING (
        get_current_user_role() = 'doctor'::user_role
        AND prescription_id IN (
          SELECT p.id FROM prescriptions p
          JOIN doctors d ON d.id = p.doctor_id
          WHERE d.user_id = auth.uid()
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
