-- Fixes "Dr. Dr. X" showing throughout the app. 011_seed_doctors.sql stored
-- doctor full_name WITH the "Dr. " title already included (e.g. 'Dr. Aarav
-- Sharma'), but every page that displays a doctor (AppointmentsPage,
-- PrescriptionsPage, AdmissionsPage, PatientDetailPage, DashboardPage,
-- LaboratoryPage, BillingPage's doctor dropdowns, etc.) already prepends its
-- own "Dr. " in the JSX -- that's the existing, consistent convention across
-- the whole app: full_name is stored as the bare name, "Dr. " is a display
-- concern only. The seed data broke that convention for these 10 rows,
-- doubling up the title everywhere.
--
-- This corrects the data to match the convention every other doctor (added
-- manually through the Doctors UI form) already follows. No component code
-- needs to change.
--
-- Idempotent: only rows currently starting with "Dr" are touched, so
-- re-running this after it's already applied is a no-op.

UPDATE doctors
SET full_name = regexp_replace(full_name, '^\s*Dr\.?\s+', '', 'i')
WHERE full_name ~* '^\s*Dr\.?\s+';