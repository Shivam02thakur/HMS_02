-- Seed doctors so Appointments/Admissions department->doctor cascades are actually
-- testable through the UI. doctors.user_id is nullable (confirmed in 001_schema.sql),
-- so these rows exist without a linked auth account -- fine for browsing/selecting,
-- just not for doctor-role login. Create real accounts separately if that's needed.

INSERT INTO doctors (full_name, email, phone, department_id, specialization, consultation_fee, experience_years, available_days, available_time_start, available_time_end, is_active)
SELECT 'Dr. Aarav Sharma', 'aarav.sharma@meridianhms.test', '9800000001', id, 'Interventional Cardiology', 800, 12, ARRAY['MON','TUE','WED','THU','FRI'], '09:00', '17:00', true
FROM departments WHERE name = 'Cardiology'
UNION ALL
SELECT 'Dr. Priya Nair', 'priya.nair@meridianhms.test', '9800000002', id, 'Cardiac Electrophysiology', 750, 8, ARRAY['MON','WED','FRI'], '10:00', '16:00', true
FROM departments WHERE name = 'Cardiology'
UNION ALL
SELECT 'Dr. Rohan Verma', 'rohan.verma@meridianhms.test', '9800000003', id, 'Stroke & Cerebrovascular Disease', 850, 15, ARRAY['MON','TUE','THU','FRI'], '09:00', '15:00', true
FROM departments WHERE name = 'Neurology'
UNION ALL
SELECT 'Dr. Sneha Iyer', 'sneha.iyer@meridianhms.test', '9800000004', id, 'Epilepsy', 700, 6, ARRAY['TUE','WED','THU'], '11:00', '18:00', true
FROM departments WHERE name = 'Neurology'
UNION ALL
SELECT 'Dr. Karan Mehta', 'karan.mehta@meridianhms.test', '9800000005', id, 'Joint Replacement', 900, 18, ARRAY['MON','TUE','WED','THU','FRI'], '08:00', '14:00', true
FROM departments WHERE name = 'Orthopedics'
UNION ALL
SELECT 'Dr. Ananya Desai', 'ananya.desai@meridianhms.test', '9800000006', id, 'Sports Medicine', 650, 5, ARRAY['MON','WED','FRI'], '13:00', '19:00', true
FROM departments WHERE name = 'Orthopedics'
UNION ALL
SELECT 'Dr. Vikram Rao', 'vikram.rao@meridianhms.test', '9800000007', id, 'Neonatology', 600, 10, ARRAY['MON','TUE','WED','THU','FRI'], '09:00', '16:00', true
FROM departments WHERE name = 'Pediatrics'
UNION ALL
SELECT 'Dr. Ishita Kapoor', 'ishita.kapoor@meridianhms.test', '9800000008', id, 'Pediatric Immunology', 550, 4, ARRAY['TUE','THU','SAT'], '10:00', '15:00', true
FROM departments WHERE name = 'Pediatrics'
UNION ALL
SELECT 'Dr. Arjun Malhotra', 'arjun.malhotra@meridianhms.test', '9800000009', id, 'Internal Medicine', 500, 20, ARRAY['MON','TUE','WED','THU','FRI'], '09:00', '17:00', true
FROM departments WHERE name = 'General Medicine'
UNION ALL
SELECT 'Dr. Meera Pillai', 'meera.pillai@meridianhms.test', '9800000010', id, 'Diabetology', 500, 9, ARRAY['MON','WED','FRI'], '10:00', '16:00', true
FROM departments WHERE name = 'General Medicine';