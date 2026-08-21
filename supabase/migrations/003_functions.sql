-- ============================================
-- AUTO-UPDATE TIMESTAMPS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medicines_updated_at
  BEFORE UPDATE ON medicines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- PATIENT CODE GENERATOR
-- ============================================
CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS TRIGGER AS $$
BEGIN
  NEW.patient_code = 'PT' || TO_CHAR(NOW(), 'YYYY') || LPAD(NEXTVAL('patient_code_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS patient_code_seq START 1;

CREATE TRIGGER set_patient_code
  BEFORE INSERT ON patients
  FOR EACH ROW EXECUTE FUNCTION generate_patient_code();

-- ============================================
-- INVOICE NUMBER GENERATOR
-- ============================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.invoice_number = 'INV-' || TO_CHAR(NOW(), 'YYYYMM') || '-' || LPAD(NEXTVAL('invoice_number_seq')::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- ============================================
-- BED OCCUPANCY MANAGEMENT
-- ============================================
CREATE OR REPLACE FUNCTION handle_admission_bed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'ADMITTED' AND NEW.bed_id IS NOT NULL THEN
    UPDATE beds SET status = 'OCCUPIED' WHERE id = NEW.bed_id;
  ELSIF NEW.status = 'DISCHARGED' AND NEW.bed_id IS NOT NULL THEN
    UPDATE beds SET status = 'VACANT' WHERE id = NEW.bed_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER manage_bed_on_admission
  AFTER INSERT OR UPDATE ON admissions
  FOR EACH ROW EXECUTE FUNCTION handle_admission_bed();

-- ============================================
-- PHARMACY STOCK MANAGEMENT
-- ============================================
CREATE OR REPLACE FUNCTION dispense_medicine(
  p_medicine_id UUID,
  p_quantity INTEGER,
  p_prescription_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_current_stock INTEGER;
BEGIN
  SELECT stock_quantity INTO v_current_stock FROM medicines WHERE id = p_medicine_id;

  IF v_current_stock IS NULL OR v_current_stock < p_quantity THEN
    RETURN FALSE;
  END IF;

  UPDATE medicines 
  SET stock_quantity = stock_quantity - p_quantity 
  WHERE id = p_medicine_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- INVOICE TOTAL CALCULATOR
-- ============================================
CREATE OR REPLACE FUNCTION calculate_invoice_total(p_invoice_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  v_total DECIMAL;
BEGIN
  SELECT COALESCE(SUM(total_price), 0) INTO v_total 
  FROM invoice_items 
  WHERE invoice_id = p_invoice_id;

  UPDATE invoices 
  SET subtotal = v_total,
      total_amount = v_total - discount
  WHERE id = p_invoice_id;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PAYMENT STATUS UPDATER
-- ============================================
CREATE OR REPLACE FUNCTION update_invoice_on_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_total DECIMAL;
  v_paid DECIMAL;
BEGIN
  SELECT total_amount, paid_amount + NEW.amount 
  INTO v_total, v_paid
  FROM invoices 
  WHERE id = NEW.invoice_id;

  UPDATE invoices 
  SET paid_amount = v_paid,
      status = CASE 
        WHEN v_paid >= v_total THEN 'PAID'::invoice_status
        WHEN v_paid > 0 THEN 'PARTIAL'::invoice_status
        ELSE 'PENDING'::invoice_status
      END
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_after_payment
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION update_invoice_on_payment();

-- ============================================
-- DASHBOARD STATS FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_patients', (SELECT COUNT(*) FROM patients),
    'total_doctors', (SELECT COUNT(*) FROM doctors WHERE is_active = TRUE),
    'today_appointments', (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURRENT_DATE),
    'pending_lab_orders', (SELECT COUNT(*) FROM lab_orders WHERE status = 'PENDING'),
    'occupied_beds', (SELECT COUNT(*) FROM beds WHERE status = 'OCCUPIED'),
    'total_beds', (SELECT COUNT(*) FROM beds),
    'low_stock_medicines', (SELECT COUNT(*) FROM medicines WHERE stock_quantity <= reorder_level),
    'today_revenue', COALESCE((SELECT SUM(amount) FROM payments WHERE DATE(paid_at) = CURRENT_DATE), 0),
    'pending_invoices', (SELECT COUNT(*) FROM invoices WHERE status IN ('PENDING', 'PARTIAL'))
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- APPOINTMENT AVAILABILITY CHECK
-- ============================================
CREATE OR REPLACE FUNCTION check_appointment_availability(
  p_doctor_id UUID,
  p_date DATE,
  p_time TIME
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count 
  FROM appointments 
  WHERE doctor_id = p_doctor_id 
    AND appointment_date = p_date 
    AND appointment_time = p_time
    AND status NOT IN ('CANCELLED', 'NO_SHOW');

  RETURN v_count = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
