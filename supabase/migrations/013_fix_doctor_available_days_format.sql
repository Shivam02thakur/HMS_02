-- Fixes a data-format mismatch: 011_seed_doctors.sql seeded doctors.available_days
-- using 3-letter codes ('MON','TUE',...), but the appointment booking UI's slot
-- generator (getSlotInfo() in src/pages/appointments/AppointmentsPage.tsx) computes
-- the day as a full weekday name via toLocaleDateString(...,{weekday:'long'}), and
-- the Doctors admin form (src/pages/doctors/DoctorsPage.tsx) saves/edits
-- available_days using that same full-name format (DAYS_OF_WEEK in
-- src/lib/utils.ts = ['Monday','Tuesday',...]).
--
-- Because of the mismatch, doctor.available_days.includes(dayName) was always
-- false for every seeded doctor, so every one of them showed "Doctor is not
-- available on this day" for every date -- booking was blocked entirely. This
-- looked like a "Dr." name-prefix bug because all 10 seeded doctors happen to
-- be named "Dr. ..."; doctors added manually through the UI form were
-- unaffected because that form already writes the correct full-name format.
--
-- This migration does not touch how doctors are matched/booked (that was
-- already correct, doctor_id-based) -- it only corrects the stored day values
-- so the existing comparison logic works as intended.
--
-- Idempotent: array && overlap check means rows already holding full names
-- (e.g. doctors added/edited via the UI, or re-running this migration) are
-- left untouched.

UPDATE doctors
SET available_days = (
  SELECT array_agg(
    CASE day
      WHEN 'MON' THEN 'Monday'
      WHEN 'TUE' THEN 'Tuesday'
      WHEN 'WED' THEN 'Wednesday'
      WHEN 'THU' THEN 'Thursday'
      WHEN 'FRI' THEN 'Friday'
      WHEN 'SAT' THEN 'Saturday'
      WHEN 'SUN' THEN 'Sunday'
      ELSE day
    END
  )
  FROM unnest(available_days) AS day
)
WHERE available_days && ARRAY['MON','TUE','WED','THU','FRI','SAT','SUN'];