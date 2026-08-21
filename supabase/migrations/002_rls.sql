-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role AS $$
BEGIN
  RETURN (SELECT role FROM profiles WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PROFILES
-- ============================================
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admin can insert profiles" ON profiles
  FOR INSERT WITH CHECK (get_current_user_role() = 'admin');

CREATE POLICY "Admin can delete profiles" ON profiles
  FOR DELETE USING (get_current_user_role() = 'admin');

-- ============================================
-- DEPARTMENTS
-- ============================================
CREATE POLICY "All users can view departments" ON departments
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage departments" ON departments
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

-- ============================================
-- DOCTORS
-- ============================================
CREATE POLICY "All users can view doctors" ON doctors
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage doctors" ON doctors
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

-- ============================================
-- PATIENTS
-- ============================================
CREATE POLICY "All authenticated can view patients" ON patients
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and receptionist can manage patients" ON patients
  FOR ALL USING (get_current_user_role() IN ('admin', 'receptionist'))
  WITH CHECK (get_current_user_role() IN ('admin', 'receptionist'));

-- ============================================
-- APPOINTMENTS
-- ============================================
CREATE POLICY "All authenticated can view appointments" ON appointments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Receptionist can manage appointments" ON appointments
  FOR ALL USING (get_current_user_role() IN ('admin', 'receptionist'))
  WITH CHECK (get_current_user_role() IN ('admin', 'receptionist'));

CREATE POLICY "Doctor can update own appointments" ON appointments
  FOR UPDATE USING (
    get_current_user_role() = 'doctor' 
    AND doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
  );

-- ============================================
-- WARDS & BEDS
-- ============================================
CREATE POLICY "All authenticated can view wards" ON wards
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage wards" ON wards
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

CREATE POLICY "All authenticated can view beds" ON beds
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage beds" ON beds
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

-- ============================================
-- ADMISSIONS
-- ============================================
CREATE POLICY "All authenticated can view admissions" ON admissions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and receptionist can manage admissions" ON admissions
  FOR ALL USING (get_current_user_role() IN ('admin', 'receptionist'))
  WITH CHECK (get_current_user_role() IN ('admin', 'receptionist'));

-- ============================================
-- MEDICINES
-- ============================================
CREATE POLICY "All authenticated can view medicines" ON medicines
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Pharmacist and admin can manage medicines" ON medicines
  FOR ALL USING (get_current_user_role() IN ('admin', 'pharmacist'))
  WITH CHECK (get_current_user_role() IN ('admin', 'pharmacist'));

-- ============================================
-- PRESCRIPTIONS
-- ============================================
CREATE POLICY "All authenticated can view prescriptions" ON prescriptions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Doctor can create prescriptions" ON prescriptions
  FOR INSERT WITH CHECK (
    get_current_user_role() = 'doctor'
    AND doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "Doctor can update own prescriptions" ON prescriptions
  FOR UPDATE USING (
    get_current_user_role() = 'doctor'
    AND doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
  );

CREATE POLICY "Admin can manage prescriptions" ON prescriptions
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

CREATE POLICY "All authenticated can view prescription items" ON prescription_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Doctor can manage prescription items" ON prescription_items
  FOR ALL USING (
    get_current_user_role() = 'doctor'
    AND prescription_id IN (
      SELECT id FROM prescriptions 
      WHERE doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    get_current_user_role() = 'doctor'
    AND prescription_id IN (
      SELECT id FROM prescriptions 
      WHERE doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
    )
  );

-- ============================================
-- LAB TESTS
-- ============================================
CREATE POLICY "All authenticated can view lab tests" ON lab_tests
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage lab tests" ON lab_tests
  FOR ALL USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');

-- ============================================
-- LAB ORDERS
-- ============================================
CREATE POLICY "All authenticated can view lab orders" ON lab_orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Doctor can create lab orders" ON lab_orders
  FOR INSERT WITH CHECK (get_current_user_role() IN ('admin', 'doctor'));

CREATE POLICY "Lab technician can update lab orders" ON lab_orders
  FOR UPDATE USING (get_current_user_role() IN ('admin', 'lab_technician', 'doctor'));

-- ============================================
-- LAB RESULTS
-- ============================================
CREATE POLICY "All authenticated can view lab results" ON lab_results
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Lab technician can manage lab results" ON lab_results
  FOR ALL USING (get_current_user_role() IN ('admin', 'lab_technician'))
  WITH CHECK (get_current_user_role() IN ('admin', 'lab_technician'));

-- ============================================
-- INVOICES
-- ============================================
CREATE POLICY "All authenticated can view invoices" ON invoices
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and receptionist can manage invoices" ON invoices
  FOR ALL USING (get_current_user_role() IN ('admin', 'receptionist'))
  WITH CHECK (get_current_user_role() IN ('admin', 'receptionist'));

CREATE POLICY "All authenticated can view invoice items" ON invoice_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and receptionist can manage invoice items" ON invoice_items
  FOR ALL USING (get_current_user_role() IN ('admin', 'receptionist'))
  WITH CHECK (get_current_user_role() IN ('admin', 'receptionist'));

-- ============================================
-- PAYMENTS
-- ============================================
CREATE POLICY "All authenticated can view payments" ON payments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin and receptionist can manage payments" ON payments
  FOR ALL USING (get_current_user_role() IN ('admin', 'receptionist'))
  WITH CHECK (get_current_user_role() IN ('admin', 'receptionist'));
