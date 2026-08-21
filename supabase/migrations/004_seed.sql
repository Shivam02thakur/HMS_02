-- ============================================
-- SEED DATA
-- ============================================

-- Departments
INSERT INTO departments (name, description) VALUES
('Cardiology', 'Heart and cardiovascular system'),
('Neurology', 'Brain, spine and nervous system'),
('Orthopedics', 'Bones, joints and muscles'),
('Pediatrics', 'Children healthcare'),
('General Medicine', 'General health and wellness'),
('Dermatology', 'Skin, hair and nail conditions'),
('ENT', 'Ear, Nose and Throat'),
('Gynecology', 'Women reproductive health');

-- Lab Tests
INSERT INTO lab_tests (name, code, description, normal_range, unit, price) VALUES
('Complete Blood Count (CBC)', 'CBC001', 'Measures blood components', '4.5-11.0', '10^9/L', 350),
('Blood Sugar (Fasting)', 'BSF002', 'Measures glucose levels', '70-100', 'mg/dL', 150),
('Blood Sugar (Post Prandial)', 'BSP003', 'Measures glucose after meal', '70-140', 'mg/dL', 150),
('Lipid Profile', 'LIP004', 'Measures cholesterol levels', 'Varies', 'mg/dL', 600),
('Liver Function Test', 'LFT005', 'Measures liver enzymes', 'Varies', 'U/L', 800),
('Kidney Function Test', 'KFT006', 'Measures kidney function', 'Varies', 'mg/dL', 700),
('Thyroid Profile', 'THY007', 'Measures thyroid hormones', 'Varies', 'mIU/L', 900),
('Urine Analysis', 'URN008', 'Examines urine composition', 'Normal', '-', 200),
('HbA1c', 'HBA009', '3-month glucose average', '4.0-5.6', '%', 450),
('Vitamin D', 'VIT010', 'Vitamin D levels', '30-100', 'ng/mL', 1200);

-- Wards
INSERT INTO wards (name, ward_type, capacity) VALUES
('General Ward A', 'General', 20),
('General Ward B', 'General', 15),
('ICU Unit 1', 'ICU', 8),
('ICU Unit 2', 'ICU', 6),
('Private Suite 1', 'Private', 10),
('Private Suite 2', 'Private', 8);

-- Beds
INSERT INTO beds (ward_id, bed_number, status) VALUES
((SELECT id FROM wards WHERE name = 'General Ward A'), 'G101', 'VACANT'),
((SELECT id FROM wards WHERE name = 'General Ward A'), 'G102', 'VACANT'),
((SELECT id FROM wards WHERE name = 'General Ward A'), 'G103', 'VACANT'),
((SELECT id FROM wards WHERE name = 'General Ward A'), 'G104', 'VACANT'),
((SELECT id FROM wards WHERE name = 'General Ward A'), 'G105', 'VACANT'),
((SELECT id FROM wards WHERE name = 'General Ward B'), 'G201', 'VACANT'),
((SELECT id FROM wards WHERE name = 'General Ward B'), 'G202', 'VACANT'),
((SELECT id FROM wards WHERE name = 'General Ward B'), 'G203', 'VACANT'),
((SELECT id FROM wards WHERE name = 'ICU Unit 1'), 'ICU101', 'VACANT'),
((SELECT id FROM wards WHERE name = 'ICU Unit 1'), 'ICU102', 'VACANT'),
((SELECT id FROM wards WHERE name = 'ICU Unit 1'), 'ICU103', 'VACANT'),
((SELECT id FROM wards WHERE name = 'ICU Unit 2'), 'ICU201', 'VACANT'),
((SELECT id FROM wards WHERE name = 'ICU Unit 2'), 'ICU202', 'VACANT'),
((SELECT id FROM wards WHERE name = 'Private Suite 1'), 'P101', 'VACANT'),
((SELECT id FROM wards WHERE name = 'Private Suite 1'), 'P102', 'VACANT'),
((SELECT id FROM wards WHERE name = 'Private Suite 1'), 'P103', 'VACANT'),
((SELECT id FROM wards WHERE name = 'Private Suite 2'), 'P201', 'VACANT'),
((SELECT id FROM wards WHERE name = 'Private Suite 2'), 'P202', 'VACANT');

-- Medicines
INSERT INTO medicines (name, generic_name, category, manufacturer, stock_quantity, reorder_level, unit_price, expiry_date) VALUES
('Paracetamol 500mg', 'Acetaminophen', 'Analgesic', 'MediCorp', 150, 20, 2.50, '2027-06-30'),
('Amoxicillin 500mg', 'Amoxicillin', 'Antibiotic', 'PharmaPlus', 80, 15, 12.00, '2026-12-31'),
('Ibuprofen 400mg', 'Ibuprofen', 'Analgesic', 'MediCorp', 200, 25, 5.00, '2027-03-15'),
('Cetirizine 10mg', 'Cetirizine', 'Antihistamine', 'HealthCare', 120, 20, 3.50, '2026-11-30'),
('Omeprazole 20mg', 'Omeprazole', 'Antacid', 'PharmaPlus', 90, 15, 8.00, '2027-01-31'),
('Metformin 500mg', 'Metformin', 'Antidiabetic', 'MediCorp', 110, 20, 6.50, '2027-04-30'),
('Amlodipine 5mg', 'Amlodipine', 'Antihypertensive', 'HealthCare', 75, 15, 9.00, '2026-10-31'),
('Azithromycin 250mg', 'Azithromycin', 'Antibiotic', 'PharmaPlus', 60, 10, 18.00, '2026-09-30'),
('Vitamin D3 60K', 'Cholecalciferol', 'Vitamin', 'MediCorp', 200, 30, 25.00, '2027-08-31'),
('ORS Sachet', 'Oral Rehydration Salts', 'Electrolyte', 'HealthCare', 300, 50, 15.00, '2026-12-31'),
('Cough Syrup 100ml', 'Dextromethorphan', 'Antitussive', 'PharmaPlus', 85, 15, 45.00, '2026-08-31'),
('Insulin (Human) 40IU', 'Human Insulin', 'Antidiabetic', 'MediCorp', 40, 10, 350.00, '2026-06-30'),
('Salbutamol Inhaler', 'Salbutamol', 'Bronchodilator', 'HealthCare', 55, 10, 120.00, '2027-02-28'),
('Crocin Advance', 'Paracetamol', 'Analgesic', 'MediCorp', 250, 30, 3.00, '2027-05-31'),
('Bandage Roll', 'Cotton Bandage', 'Surgical', 'HealthCare', 180, 25, 25.00, '2028-01-01');
