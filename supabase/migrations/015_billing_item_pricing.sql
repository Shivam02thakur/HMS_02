-- Supports the redesigned "Add Billing Item" flow: type-first selection with
-- price/description pulled from the database instead of typed by hand.
--
-- 1. procedures table — didn't exist yet (confirmed absent from 001-014).
--    Mirrors lab_tests: name + price, admin-managed, everyone can view/select.
-- 2. wards.daily_rate — didn't exist yet (confirmed absent from 001_schema.sql).
--    Needed so Room/Bed billing items can auto-fill a price instead of manual entry.
-- 3. invoice_items.item_type CHECK constraint — widened to allow 'procedure'.
--    The constraint was created inline (unnamed) in 001_schema.sql, so Postgres
--    auto-named it invoice_items_item_type_check (the standard <table>_<col>_check
--    convention for a single inline CHECK on that column) -- dropped and re-added
--    with the extra value.

-- ============================================
-- PROCEDURES
-- ============================================
CREATE TABLE procedures (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view procedures" ON procedures
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage procedures" ON procedures
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

INSERT INTO procedures (name, category, price) VALUES
('Wound Dressing', 'Minor', 300),
('Suturing (Small Wound)', 'Minor', 800),
('IV Cannulation', 'Minor', 200),
('Nebulization', 'Minor', 250),
('ECG', 'Diagnostic', 400),
('X-Ray (Single View)', 'Diagnostic', 600),
('Plaster Cast Application', 'Orthopedic', 1200),
('Catheterization', 'Minor', 700),
('Minor Surgical Procedure', 'Surgical', 3500),
('Physiotherapy Session', 'Therapy', 500);

-- ============================================
-- WARD DAILY RATE (for Room/Bed billing items)
-- ============================================
ALTER TABLE wards ADD COLUMN daily_rate DECIMAL(10,2) NOT NULL DEFAULT 0;

UPDATE wards SET daily_rate = CASE ward_type
  WHEN 'ICU' THEN 3000
  WHEN 'Private' THEN 2000
  ELSE 800  -- General
END;

-- ============================================
-- INVOICE ITEMS — allow 'procedure' as an item_type
-- ============================================
ALTER TABLE invoice_items DROP CONSTRAINT IF EXISTS invoice_items_item_type_check;
ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_item_type_check
  CHECK (item_type IN ('consultation', 'lab_test', 'medicine', 'procedure', 'bed_charge', 'other'));
  