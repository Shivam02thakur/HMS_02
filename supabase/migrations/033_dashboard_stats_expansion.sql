-- 033_dashboard_stats_expansion.sql
-- Adds total_departments, today_admissions, today_discharges to
-- get_dashboard_stats(). Full function replacement (same safe-to-rerun
-- pattern as 017), no migration guard needed.
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_patients', (SELECT COUNT(*) FROM patients),
    'total_doctors', (SELECT COUNT(*) FROM doctors WHERE is_active = TRUE),
    'total_departments', (SELECT COUNT(*) FROM departments WHERE is_active = TRUE),
    'today_appointments', (SELECT COUNT(*) FROM appointments WHERE appointment_date = CURRENT_DATE),
    'pending_lab_orders', (SELECT COUNT(*) FROM lab_orders WHERE status = 'PENDING'),
    'occupied_beds', (SELECT COUNT(*) FROM beds WHERE status = 'OCCUPIED'),
    'total_beds', (SELECT COUNT(*) FROM beds),
    'low_stock_medicines', (SELECT COUNT(*) FROM medicines WHERE stock_quantity <= reorder_level),
    'today_revenue', COALESCE((SELECT SUM(amount) FROM payments WHERE DATE(paid_at) = CURRENT_DATE), 0),
    'pending_invoices', (SELECT COUNT(*) FROM invoices WHERE status IN ('PENDING', 'PARTIAL')),
    'today_admissions', (SELECT COUNT(*) FROM admissions WHERE DATE(admission_date) = CURRENT_DATE),
    'today_discharges', (SELECT COUNT(*) FROM admissions WHERE DATE(discharge_date) = CURRENT_DATE)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
