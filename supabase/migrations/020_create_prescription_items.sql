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
CREATE POLICY "All authenticated can view prescription items"
  ON prescription_items FOR SELECT
  USING (auth.role() = 'authenticated');

-- Admin can do anything (matches "Admin can manage prescriptions").
CREATE POLICY "Admin can manage prescription items"
  ON prescription_items FOR ALL
  USING (get_current_user_role() = 'admin'::user_role)
  WITH CHECK (get_current_user_role() = 'admin'::user_role);

-- A doctor can add items only to their own prescriptions (matches
-- "Doctor can create prescriptions" / "Doctor can update own prescriptions").
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

-- A doctor can remove items from their own prescriptions (the app doesn't
-- do this yet, but it's the natural counterpart to insert and keeps this
-- table consistent with the rest of the RLS pattern).
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

NOTIFY pgrst, 'reload schema';
