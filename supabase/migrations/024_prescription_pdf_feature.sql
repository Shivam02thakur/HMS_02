-- 019_prescription_pdf_feature.sql
-- Supports the printable/PDF prescription feature:
--   1. Doctors need qualification + registration number to appear on the
--      letterhead (previously only specialization/experience existed).
--   2. Prescriptions need the vitals captured at the visit (weight, BP,
--      pulse, temp, SpO2) to fill the "Diagnosis & Clinical Notes" row.
--   3. Lab tests ordered *from* a prescription need to land in the same
--      lab_orders table the Laboratory page already reads, so they show
--      up in the lab queue -- just tagged with which prescription they
--      came from.

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS qualification text,
  ADD COLUMN IF NOT EXISTS registration_no text;

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS weight_kg numeric,
  ADD COLUMN IF NOT EXISTS bp text,
  ADD COLUMN IF NOT EXISTS pulse_bpm integer,
  ADD COLUMN IF NOT EXISTS temperature_f numeric,
  ADD COLUMN IF NOT EXISTS spo2_percent integer;

ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS prescription_id uuid REFERENCES prescriptions(id) ON DELETE SET NULL;

-- PostgREST caches the schema; without this the new columns/relationship
-- 404 or silently no-op on insert/select until the API pod restarts.
NOTIFY pgrst, 'reload schema';
