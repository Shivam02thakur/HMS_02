-- 038_hygiene_module.sql
--
-- #19, the final item from the original list. Genuinely greenfield --
-- nothing in the schema or app touched cleaning, floors, or housekeeping
-- before this. Three scoping decisions confirmed before writing this:
-- (1) who logs a cleaning -- admin and receptionist, no new role needed;
-- (2) what counts as a cleanable location -- a generic cleaning_zones
-- table, not three hardcoded kinds; (3) enforcement style -- log-and-
-- report, not proactive alerting/scheduling.

-- ---------------------------------------------------------------------
-- cleaning_zones: one shape for three different kinds of location.
-- ward_id is optional and only meaningful when zone_type = 'ward' --
-- wards are the one location type with an existing concrete record
-- elsewhere in the schema to link back to (floors and doctor chambers
-- have no corresponding table; doctors aren't assigned a physical room
-- anywhere in this system).
CREATE TABLE cleaning_zones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('ward', 'floor', 'chamber', 'other')),
  ward_id UUID REFERENCES wards(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A ward should never back two active zones -- that would silently split
-- its cleaning history across two unrelated records.
CREATE UNIQUE INDEX idx_cleaning_zones_one_per_ward
  ON cleaning_zones(ward_id) WHERE ward_id IS NOT NULL AND is_active = TRUE;

-- ---------------------------------------------------------------------
-- cleaning_logs: the actual record of a cleaning happening.
CREATE TABLE cleaning_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_id UUID REFERENCES cleaning_zones(id) ON DELETE CASCADE NOT NULL,
  cleaned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_by UUID REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cleaning_logs_zone_date ON cleaning_logs(zone_id, cleaned_at);

ALTER TABLE cleaning_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view cleaning zones" ON cleaning_zones
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and receptionist can manage cleaning zones" ON cleaning_zones
  FOR ALL USING (get_current_user_role() IN ('admin', 'receptionist'))
  WITH CHECK (get_current_user_role() IN ('admin', 'receptionist'));

CREATE POLICY "All authenticated can view cleaning logs" ON cleaning_logs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Matches the confirmed scope exactly: only admin/receptionist can log a
-- cleaning, and only as themselves (logged_by = auth.uid()), never on
-- someone else's behalf.
CREATE POLICY "Admin and receptionist can log cleaning" ON cleaning_logs
  FOR INSERT WITH CHECK (get_current_user_role() IN ('admin', 'receptionist') AND logged_by = auth.uid());

-- ---------------------------------------------------------------------
-- Seed: one cleaning_zones row per active ward (concrete, already exists
-- in the schema), plus a few illustrative floor/chamber entries. These
-- counts are illustrative, matching the "say 3 floors" framing of the
-- original request, not a claim about the real hospital's actual floor
-- plan -- more can be added through the UI's Add Zone action.
INSERT INTO cleaning_zones (name, zone_type, ward_id, is_active)
SELECT w.name, 'ward', w.id, TRUE FROM wards w;

INSERT INTO cleaning_zones (name, zone_type, is_active) VALUES
  ('Ground Floor', 'floor', TRUE),
  ('First Floor', 'floor', TRUE),
  ('Second Floor', 'floor', TRUE);

INSERT INTO cleaning_zones (name, zone_type, is_active)
SELECT 'Dr. ' || d.full_name || ' - Chamber', 'chamber', TRUE
FROM doctors d ORDER BY d.created_at LIMIT 5;

NOTIFY pgrst, 'reload schema';
