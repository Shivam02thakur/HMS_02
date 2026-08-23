-- Seed doctors so Appointments/Admissions department->doctor cascades are actually
-- testable through the UI. doctors.user_id is nullable (confirmed in 001_schema.sql),
-- so these rows exist without a linked auth account -- fine for browsing/selecting,
-- just not for doctor-role login. Create real accounts separately if that's needed.
--
-- Idempotent: doctors.email is UNIQUE (001_schema.sql), so ON CONFLICT (email)
-- DO NOTHING makes this safe to re-run after a partial failure or by mistake --
-- won't create duplicate doctors.

INSERT INTO doctors (full_name, email, phone, department_id, specialization, consultation_fee, experience_years, available_days, available_time_start, available_time_end, is_active)
SELECT v.full_name, v.email, v.phone, d.id, v.specialization, v.consultation_fee, v.experience_years, v.available_days, v.available_time_start::time, v.available_time_end::time, true
FROM (VALUES
  ('Dr. Aarav Sharma',    'aarav.sharma@meridianhms.test',    '9800000001', 'Cardiology',        'Interventional Cardiology',        800, 12, ARRAY['MON','TUE','WED','THU','FRI'], '09:00', '17:00'),
  ('Dr. Priya Nair',      'priya.nair@meridianhms.test',      '9800000002', 'Cardiology',        'Cardiac Electrophysiology',        750,  8, ARRAY['MON','WED','FRI'],             '10:00', '16:00'),
  ('Dr. Rohan Verma',     'rohan.verma@meridianhms.test',     '9800000003', 'Neurology',         'Stroke & Cerebrovascular Disease', 850, 15, ARRAY['MON','TUE','THU','FRI'],        '09:00', '15:00'),
  ('Dr. Sneha Iyer',      'sneha.iyer@meridianhms.test',      '9800000004', 'Neurology',         'Epilepsy',                          700,  6, ARRAY['TUE','WED','THU'],             '11:00', '18:00'),
  ('Dr. Karan Mehta',     'karan.mehta@meridianhms.test',     '9800000005', 'Orthopedics',       'Joint Replacement',                900, 18, ARRAY['MON','TUE','WED','THU','FRI'], '08:00', '14:00'),
  ('Dr. Ananya Desai',    'ananya.desai@meridianhms.test',    '9800000006', 'Orthopedics',       'Sports Medicine',                   650,  5, ARRAY['MON','WED','FRI'],             '13:00', '19:00'),
  ('Dr. Vikram Rao',      'vikram.rao@meridianhms.test',      '9800000007', 'Pediatrics',        'Neonatology',                       600, 10, ARRAY['MON','TUE','WED','THU','FRI'], '09:00', '16:00'),
  ('Dr. Ishita Kapoor',   'ishita.kapoor@meridianhms.test',   '9800000008', 'Pediatrics',        'Pediatric Immunology',              550,  4, ARRAY['TUE','THU','SAT'],             '10:00', '15:00'),
  ('Dr. Arjun Malhotra',  'arjun.malhotra@meridianhms.test',  '9800000009', 'General Medicine',  'Internal Medicine',                 500, 20, ARRAY['MON','TUE','WED','THU','FRI'], '09:00', '17:00'),
  ('Dr. Meera Pillai',    'meera.pillai@meridianhms.test',    '9800000010', 'General Medicine',  'Diabetology',                       500,  9, ARRAY['MON','WED','FRI'],             '10:00', '16:00')
) AS v(full_name, email, phone, department_name, specialization, consultation_fee, experience_years, available_days, available_time_start, available_time_end)
JOIN departments d ON d.name = v.department_name
ON CONFLICT (email) DO NOTHING;