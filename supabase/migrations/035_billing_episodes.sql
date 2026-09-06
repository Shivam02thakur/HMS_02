-- 035_billing_episodes.sql
--
-- Foundation for #7 (auto-bill consultations), #14 (mandatory ward
-- billing), and #15 (ward transfer billing): "which invoice does this
-- charge belong to" needed a first-class answer. Searching for "the
-- patient's current invoice" has a real failure mode -- an old, unpaid
-- invoice from months ago could silently keep absorbing charges from a
-- completely unrelated new visit, since "current" isn't a well-defined
-- property of an invoice on its own.
--
-- One billing episode = one coherent encounter: the whole span of an
-- admission (admit to discharge), one outpatient visit, or a standalone
-- walk-in with neither. Everything inside that episode accumulates onto
-- its one invoice.

CREATE TABLE billing_episodes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE NOT NULL,
  episode_type TEXT NOT NULL CHECK (episode_type IN ('ADMISSION', 'OPD_VISIT', 'WALK_IN')),
  -- ON DELETE RESTRICT, not SET NULL: the CHECK constraint below requires
  -- an ADMISSION episode to always have admission_id set (and likewise
  -- for OPD_VISIT/appointment_id), so a SET NULL cascade would be
  -- guaranteed to fail that CHECK the moment it ever fired. Confirmed by
  -- testing an actual delete against a real database, not by inspection.
  -- RESTRICT is the honest behavior: block the deletion outright with a
  -- clear error, rather than attempting a null-out that was never going
  -- to work.
  admission_id UUID REFERENCES admissions(id) ON DELETE RESTRICT,
  appointment_id UUID REFERENCES appointments(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_episodes_type_matches_link CHECK (
    (episode_type = 'ADMISSION' AND admission_id IS NOT NULL AND appointment_id IS NULL) OR
    (episode_type = 'OPD_VISIT' AND appointment_id IS NOT NULL AND admission_id IS NULL) OR
    (episode_type = 'WALK_IN' AND admission_id IS NULL AND appointment_id IS NULL)
  )
);

-- "Find the open episode for this admission/appointment" as a direct
-- indexed lookup, and a hard guarantee (not just application discipline)
-- that an admission/appointment never ends up with two open episodes.
CREATE UNIQUE INDEX idx_billing_episodes_open_admission
  ON billing_episodes(admission_id) WHERE status = 'OPEN' AND admission_id IS NOT NULL;
CREATE UNIQUE INDEX idx_billing_episodes_open_appointment
  ON billing_episodes(appointment_id) WHERE status = 'OPEN' AND appointment_id IS NOT NULL;

-- WALK_IN has no natural one-to-one link to dedupe against the way
-- ADMISSION/OPD_VISIT do -- without this, nothing stops a patient from
-- accumulating multiple simultaneous open walk-in episodes, defeating
-- the exact consolidation this table exists for. Confirmed missing by
-- testing two back-to-back WALK_IN inserts for the same patient before
-- adding this (both succeeded); re-tested after adding it (the second
-- is correctly rejected).
CREATE UNIQUE INDEX idx_billing_episodes_open_walkin
  ON billing_episodes(patient_id) WHERE status = 'OPEN' AND episode_type = 'WALK_IN';

CREATE INDEX idx_billing_episodes_patient ON billing_episodes(patient_id);

ALTER TABLE invoices ADD COLUMN episode_id UUID REFERENCES billing_episodes(id) ON DELETE RESTRICT;
-- One invoice per episode, enforced by the database, not convention.
-- Partial (allows multiple NULLs, for invoices created before this
-- migration or through some other future path that doesn't use
-- episodes).
CREATE UNIQUE INDEX idx_invoices_episode_id ON invoices(episode_id) WHERE episode_id IS NOT NULL;

ALTER TABLE billing_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view billing episodes" ON billing_episodes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and receptionist can manage billing episodes" ON billing_episodes
  FOR ALL USING (get_current_user_role() IN ('admin', 'receptionist'));

-- Doctors don't get general billing-episode management (that stays
-- admin/receptionist, same as invoices always have been) -- but
-- completing an appointment is a doctor action, and #7's auto-billing
-- needs to find-or-create the OPD_VISIT episode (and its invoice, and
-- the consultation line) at that exact moment. Scoped narrowly: a
-- doctor can only INSERT an OPD_VISIT episode for their own appointment,
-- never touch anyone else's, and can never UPDATE/DELETE one (closing an
-- episode stays an admin/receptionist action via closeEpisode()).
CREATE POLICY "Doctor can open an episode for own appointment" ON billing_episodes
  FOR INSERT WITH CHECK (
    get_current_user_role() = 'doctor'
    AND episode_type = 'OPD_VISIT'
    AND appointment_id IN (
      SELECT a.id FROM appointments a
      JOIN doctors d ON d.id = a.doctor_id
      WHERE d.user_id = auth.uid()
    )
  );

-- Mirror: the invoice and consultation line that findOrCreateEpisodeInvoice
-- creates alongside that episode need the same narrow doctor-insert
-- allowance. Existing "Admin and receptionist can manage invoices/invoice
-- items" policies (002_rls.sql) are untouched -- these are additive,
-- OR'd in by PostgreSQL's policy evaluation, not a replacement.
CREATE POLICY "Doctor can create invoice for own OPD episode" ON invoices
  FOR INSERT WITH CHECK (
    get_current_user_role() = 'doctor'
    AND episode_id IN (
      SELECT be.id FROM billing_episodes be
      JOIN appointments a ON a.id = be.appointment_id
      JOIN doctors d ON d.id = a.doctor_id
      WHERE d.user_id = auth.uid()
    )
  );

CREATE POLICY "Doctor can add consultation line to own OPD invoice" ON invoice_items
  FOR INSERT WITH CHECK (
    get_current_user_role() = 'doctor'
    AND item_type = 'consultation'
    AND invoice_id IN (
      SELECT i.id FROM invoices i
      JOIN billing_episodes be ON be.id = i.episode_id
      JOIN appointments a ON a.id = be.appointment_id
      JOIN doctors d ON d.id = a.doctor_id
      WHERE d.user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
