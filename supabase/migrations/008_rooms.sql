-- 008_rooms.sql
-- Adds Ward -> Room -> Bed hierarchy (spec section 6/7)

CREATE TABLE rooms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  ward_id UUID REFERENCES wards(id) ON DELETE CASCADE NOT NULL,
  room_number TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(ward_id, room_number)
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view rooms" ON rooms
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage rooms" ON rooms
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

-- Backfill: give every existing ward a default room so current beds aren't orphaned
INSERT INTO rooms (ward_id, room_number)
SELECT id, 'R1' FROM wards;

-- Add room_id to beds. RESTRICT (not CASCADE) so deleting a room can never
-- silently wipe out beds/admission history underneath it — same reasoning
-- as why doctor "delete" was replaced with deactivate in Batch 1.
ALTER TABLE beds ADD COLUMN room_id UUID REFERENCES rooms(id) ON DELETE RESTRICT;

UPDATE beds b
SET room_id = r.id
FROM rooms r
WHERE r.ward_id = b.ward_id AND r.room_number = 'R1';

ALTER TABLE beds ALTER COLUMN room_id SET NOT NULL;