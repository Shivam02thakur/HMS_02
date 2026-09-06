-- 036_admission_ward_history.sql
--
-- Confirmed design (Option B): bill each ward segment of a stay
-- separately, not the whole stay at whichever rate happens to be
-- current when it's finally billed -- a patient in ICU for 2 days then
-- General for 3 should show two distinct, correctly-priced lines.

CREATE TABLE admission_ward_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admission_id UUID REFERENCES admissions(id) ON DELETE CASCADE NOT NULL,
  bed_id UUID REFERENCES beds(id) ON DELETE SET NULL,
  ward_id UUID REFERENCES wards(id) ON DELETE SET NULL,
  -- Snapshotted at segment start, not looked up fresh when the charge is
  -- eventually computed -- a later change to a ward's rate must never
  -- retroactively reprice a stay that already happened at the old rate.
  daily_rate DECIMAL(10,2) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  invoice_item_id UUID REFERENCES invoice_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "Which ward is the patient in right now" must have exactly one answer.
CREATE UNIQUE INDEX idx_admission_ward_history_open_segment
  ON admission_ward_history(admission_id) WHERE ended_at IS NULL;

CREATE INDEX idx_admission_ward_history_admission ON admission_ward_history(admission_id);

ALTER TABLE admission_ward_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view ward history" ON admission_ward_history
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and receptionist can manage ward history" ON admission_ward_history
  FOR ALL USING (get_current_user_role() IN ('admin', 'receptionist'));

-- ---------------------------------------------------------------------
-- The transfer-aware trigger fix.
--
-- handle_admission_bed() (003_functions.sql) only reacted to `status`
-- changing to ADMITTED/DISCHARGED -- it had no logic at all for `bed_id`
-- changing while status stayed ADMITTED. A transfer implemented as a
-- naive `UPDATE admissions SET bed_id = new_bed` would have occupied the
-- new bed but NEVER released the old one, leaving it stuck OCCUPIED
-- forever with no patient in it.
--
-- Rewritten to handle three cases explicitly: new admission (occupy bed,
-- open first segment), transfer (release old bed + close old segment,
-- occupy new bed + open new segment), discharge (release bed, close
-- segment). Billing is deliberately NOT in this trigger -- a low-level
-- trigger responsible for something that must never be wrong (bed
-- occupancy) stays simple and testable in isolation; charge computation
-- is a separate, application-level concern (billClosedWardSegment() in
-- billing.ts), triggered by the same action but not entangled with it.
--
-- CREATE OR REPLACE on the existing function -- the trigger
-- (manage_bed_on_admission, 003_functions.sql, AFTER INSERT OR UPDATE)
-- is unchanged, only the function body.
CREATE OR REPLACE FUNCTION handle_admission_bed()
RETURNS TRIGGER AS $$
DECLARE
  v_daily_rate DECIMAL(10,2);
BEGIN
  -- New admission: occupy the bed, open the first ward-history segment.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'ADMITTED' AND NEW.bed_id IS NOT NULL THEN
      UPDATE beds SET status = 'OCCUPIED' WHERE id = NEW.bed_id;
      SELECT w.daily_rate INTO v_daily_rate
        FROM beds b JOIN wards w ON w.id = b.ward_id WHERE b.id = NEW.bed_id;
      INSERT INTO admission_ward_history (admission_id, bed_id, ward_id, daily_rate)
        SELECT NEW.id, b.id, b.ward_id, v_daily_rate FROM beds b WHERE b.id = NEW.bed_id;
    END IF;
    RETURN NEW;
  END IF;

  -- Transfer: bed_id changed while still ADMITTED.
  IF NEW.status = 'ADMITTED' AND OLD.status = 'ADMITTED'
     AND NEW.bed_id IS DISTINCT FROM OLD.bed_id THEN
    IF OLD.bed_id IS NOT NULL THEN
      UPDATE beds SET status = 'VACANT' WHERE id = OLD.bed_id;
      UPDATE admission_ward_history SET ended_at = NOW()
        WHERE admission_id = NEW.id AND ended_at IS NULL;
    END IF;
    IF NEW.bed_id IS NOT NULL THEN
      UPDATE beds SET status = 'OCCUPIED' WHERE id = NEW.bed_id;
      SELECT w.daily_rate INTO v_daily_rate
        FROM beds b JOIN wards w ON w.id = b.ward_id WHERE b.id = NEW.bed_id;
      INSERT INTO admission_ward_history (admission_id, bed_id, ward_id, daily_rate)
        SELECT NEW.id, b.id, b.ward_id, v_daily_rate FROM beds b WHERE b.id = NEW.bed_id;
    END IF;
    RETURN NEW;
  END IF;

  -- First-time admission via UPDATE (status changing TO ADMITTED).
  IF NEW.status = 'ADMITTED' AND OLD.status IS DISTINCT FROM 'ADMITTED' AND NEW.bed_id IS NOT NULL THEN
    UPDATE beds SET status = 'OCCUPIED' WHERE id = NEW.bed_id;
    SELECT w.daily_rate INTO v_daily_rate
      FROM beds b JOIN wards w ON w.id = b.ward_id WHERE b.id = NEW.bed_id;
    INSERT INTO admission_ward_history (admission_id, bed_id, ward_id, daily_rate)
      SELECT NEW.id, b.id, b.ward_id, v_daily_rate FROM beds b WHERE b.id = NEW.bed_id;
    RETURN NEW;
  END IF;

  -- Discharge: release bed, close the open segment.
  IF NEW.status = 'DISCHARGED' AND OLD.status IS DISTINCT FROM 'DISCHARGED' THEN
    IF OLD.bed_id IS NOT NULL THEN
      UPDATE beds SET status = 'VACANT' WHERE id = OLD.bed_id;
    END IF;
    UPDATE admission_ward_history SET ended_at = NOW()
      WHERE admission_id = NEW.id AND ended_at IS NULL;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
