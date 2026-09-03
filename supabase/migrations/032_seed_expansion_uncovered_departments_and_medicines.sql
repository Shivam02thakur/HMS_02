-- 032_seed_expansion_uncovered_departments_and_medicines.sql
--
-- Confirmed gap: 004_seed.sql seeds 8 departments but 011_seed_doctors.sql
-- only covers 5 (Cardiology, Neurology, Orthopedics, Pediatrics, General
-- Medicine) -- Dermatology, ENT, Gynecology had zero doctors. The medicine
-- catalog had 15 items with zero coverage in several clinically relevant
-- categories. See changes_04_data_expansion_and_ui_polish.md, section 1.

-- ---------------------------------------------------------------------
-- Integrity fix (small, independently worthwhile, also required to make
-- the idempotent medicine seed below possible)
-- ---------------------------------------------------------------------
ALTER TABLE medicines ADD CONSTRAINT medicines_name_key UNIQUE (name);

-- ---------------------------------------------------------------------
-- Two doctors each for the three uncovered departments
-- Format matches 013 (full weekday names) and 014 (bare full_name, no
-- "Dr." prefix -- added by display components instead).
-- ---------------------------------------------------------------------
INSERT INTO doctors (full_name, email, phone, department_id, specialization, consultation_fee, experience_years, available_days, available_time_start, available_time_end, is_active)
SELECT v.full_name, v.email, v.phone, d.id, v.specialization, v.consultation_fee, v.experience_years, v.available_days, v.available_time_start::time, v.available_time_end::time, true
FROM (VALUES
  ('Aisha Khan',      'aisha.khan@meridianhms.test',      '9800000011', 'Dermatology', 'Cosmetic Dermatology',   700, 9,  ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'], '09:00', '16:00'),
  ('Rahul Bhatt',     'rahul.bhatt@meridianhms.test',     '9800000012', 'Dermatology', 'Pediatric Dermatology',  600, 6,  ARRAY['Monday','Wednesday','Friday'],                       '11:00', '17:00'),
  ('Neha Joshi',      'neha.joshi@meridianhms.test',      '9800000013', 'ENT',         'Otology',                650, 11, ARRAY['Tuesday','Wednesday','Thursday','Friday'],           '10:00', '16:00'),
  ('Sameer Kulkarni', 'sameer.kulkarni@meridianhms.test', '9800000014', 'ENT',         'Head & Neck Surgery',    750, 14, ARRAY['Monday','Tuesday','Thursday'],                       '09:00', '14:00'),
  ('Divya Menon',     'divya.menon@meridianhms.test',     '9800000015', 'Gynecology',  'Obstetrics',             800, 13, ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday'], '09:00', '17:00'),
  ('Kavita Reddy',    'kavita.reddy@meridianhms.test',    '9800000016', 'Gynecology',  'Reproductive Medicine',  700, 7,  ARRAY['Wednesday','Thursday','Saturday'],                   '10:00', '15:00')
) AS v(full_name, email, phone, department_name, specialization, consultation_fee, experience_years, available_days, available_time_start, available_time_end)
JOIN departments d ON d.name = v.department_name
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------
-- Twenty medicines spanning previously-zero-representation categories
-- ---------------------------------------------------------------------
INSERT INTO medicines (name, generic_name, category, manufacturer, stock_quantity, reorder_level, unit_price, expiry_date) VALUES
('Atorvastatin 10mg',        'Atorvastatin',           'Cardiac (Statin)',       'CardioPharm',  100, 20, 7.50,   '2027-07-31'),
('Clopidogrel 75mg',         'Clopidogrel',            'Cardiac (Antiplatelet)', 'CardioPharm',  90,  15, 11.00,  '2027-05-31'),
('Losartan 50mg',            'Losartan Potassium',     'Antihypertensive',      'CardioPharm',  110, 20, 6.00,   '2027-04-30'),
('Betamethasone Cream 15g',  'Betamethasone',          'Dermatology (Topical Steroid)', 'DermaCare', 70, 12, 45.00, '2026-12-31'),
('Clotrimazole Cream 20g',   'Clotrimazole',           'Dermatology (Antifungal)', 'DermaCare', 85, 15, 35.00,  '2026-11-30'),
('Hydroquinone Cream 15g',   'Hydroquinone',           'Dermatology',            'DermaCare',    50,  10, 60.00,  '2027-01-31'),
('Xylometazoline Nasal Drops','Xylometazoline',        'ENT (Nasal)',            'ENTMed',       95,  15, 30.00,  '2027-02-28'),
('Ciprofloxacin Ear Drops',  'Ciprofloxacin',          'ENT (Ear)',              'ENTMed',       70,  12, 55.00,  '2027-03-31'),
('Chlorhexidine Gargle 100ml','Chlorhexidine',         'ENT',                    'ENTMed',       120, 20, 40.00,  '2027-06-30'),
('Folic Acid 5mg',           'Folic Acid',             'Gynecology/Prenatal',    'PrenaCare',    200, 30, 2.00,   '2027-08-31'),
('Ferrous Sulfate 200mg',    'Iron (Ferrous Sulfate)', 'Gynecology/Prenatal',    'PrenaCare',    180, 25, 3.00,   '2027-08-31'),
('Prenatal Multivitamin',    'Multivitamin',           'Gynecology/Prenatal',    'PrenaCare',    150, 20, 12.00,  '2027-09-30'),
('Misoprostol 200mcg',       'Misoprostol',            'Gynecology',             'PrenaCare',    40,  8,  25.00,  '2026-12-31'),
('Ceftriaxone 1g Injection', 'Ceftriaxone',            'Injectable (Antibiotic)','InjectaMed',   60,  10, 85.00,  '2026-10-31'),
('Diclofenac Injection 3ml', 'Diclofenac',             'Injectable (Analgesic)', 'InjectaMed',   80,  15, 20.00,  '2027-01-31'),
('Ondansetron Injection 2ml','Ondansetron',            'Injectable (Antiemetic)','InjectaMed',   75,  15, 30.00,  '2027-03-31'),
('Tetanus Toxoid Injection', 'Tetanus Toxoid',         'Injectable (Vaccine)',   'InjectaMed',   100, 20, 40.00,  '2027-05-31'),
('Normal Saline 500ml IV',   'Sodium Chloride 0.9%',   'IV Fluid',               'FluidCare',    150, 25, 45.00,  '2028-01-31'),
('Ringer Lactate 500ml IV',  'Compound Sodium Lactate','IV Fluid',               'FluidCare',    130, 20, 48.00,  '2028-01-31'),
('Dextrose 5% 500ml IV',     'Dextrose',               'IV Fluid',               'FluidCare',    140, 20, 42.00,  '2028-02-28')
ON CONFLICT (name) DO NOTHING;
