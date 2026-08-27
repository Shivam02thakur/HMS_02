-- 026_complete_billing_item_pricing.sql
-- Completes 015_billing_item_pricing.sql, which was only partially applied
-- by hand: `wards.daily_rate` exists on the live database, but the
-- `procedures` table and the widened `invoice_items_item_type_check`
-- constraint were never run. Verified via information_schema/pg_catalog
-- inspection before writing this file -- see migration-history cleanup
-- discussion. Written idempotently so it is safe to run regardless of
-- exact partial state, and safe to re-run.
--
-- Does NOT touch wards.daily_rate (already live, already correct) and
-- does NOT touch any doctor, patient, invoice, or other application data.

-- ============================================
-- PROCEDURES (missing piece 1 of 2)
-- ============================================
CREATE TABLE IF NOT EXISTS procedures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'procedures'
      AND policyname = 'All authenticated can view procedures'
  ) THEN
    CREATE POLICY "All authenticated can view procedures" ON procedures
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'procedures'
      AND policyname = 'Admin can manage procedures'
  ) THEN
    CREATE POLICY "Admin can manage procedures" ON procedures
      FOR ALL USING (get_current_user_role() = 'admin')
      WITH CHECK (get_current_user_role() = 'admin');
  END IF;
END $$;

-- Seed rows only if the table is empty (avoids duplicate rows if this
-- migration is ever re-run after the table already has data).
INSERT INTO procedures (name, category, price)
SELECT * FROM (VALUES
  ('Wound Dressing', 'Minor', 300),
  ('Suturing (Small Wound)', 'Minor', 800),
  ('IV Cannulation', 'Minor', 200),
  ('Nebulization', 'Minor', 250),
  ('ECG', 'Diagnostic', 400),
  ('X-Ray (Single View)', 'Diagnostic', 600),
  ('Plaster Cast Application', 'Orthopedic', 1200),
  ('Catheterization', 'Minor', 700),
  ('Minor Surgical Procedure', 'Surgical', 3500),
  ('Physiotherapy Session', 'Therapy', 500)
) AS seed(name, category, price)
WHERE NOT EXISTS (SELECT 1 FROM procedures);

-- ============================================
-- INVOICE ITEMS — allow 'procedure' as an item_type (missing piece 2 of 2)
-- ============================================
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_item_type_check;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_item_type_check
  CHECK (item_type IN ('consultation', 'lab_test', 'medicine', 'procedure', 'bed_charge', 'other'));

NOTIFY pgrst, 'reload schema';