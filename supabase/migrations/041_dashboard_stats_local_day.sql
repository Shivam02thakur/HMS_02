-- 041_dashboard_stats_local_day.sql
--
-- DashboardPage.tsx (commit b1bbbe1) calls
--     supabase.rpc('get_dashboard_stats', { p_today_start, p_today_end, p_today_date })
-- and its comment says "see migration 039 for why" -- but no migration
-- defined a function with those parameters (033 defines get_dashboard_stats()
-- with no arguments, and 039 is purely about payments). On a database built
-- from these migrations that call fails with "Could not find the function
-- public.get_dashboard_stats(p_today_date, p_today_end, p_today_start)".
--
-- WHY the parameters exist: the old function used CURRENT_DATE / DATE(paid_at),
-- which is the *database server's* day (UTC on Supabase). For a clinic in IST
-- (UTC+5:30) that made "today" flip at 5:30 AM local time, so the dashboard's
-- "today's revenue" disagreed with the Billing page's Revenue Collected card
-- (which buckets by the browser's local date) for the first hours of every day.
-- The browser now sends its own local-day boundaries.
--
-- All three parameters are optional and fall back to the server's day, so an
-- older client that calls get_dashboard_stats() with no arguments still works.
-- Return shape is unchanged from 033.

DROP FUNCTION IF EXISTS public.get_dashboard_stats();
DROP FUNCTION IF EXISTS public.get_dashboard_stats(timestamptz, timestamptz, date);

CREATE OR REPLACE FUNCTION public.get_dashboard_stats(
  p_today_start timestamptz DEFAULT NULL,  -- local midnight, as an absolute instant
  p_today_end   timestamptz DEFAULT NULL,  -- next local midnight (exclusive)
  p_today_date  date        DEFAULT NULL   -- local calendar date, for DATE columns
)
RETURNS JSON AS $$
DECLARE
  v_date  date := COALESCE(p_today_date, CURRENT_DATE);
  v_start timestamptz := COALESCE(p_today_start, date_trunc('day', now()));
  v_end   timestamptz := COALESCE(p_today_end, COALESCE(p_today_start, date_trunc('day', now())) + interval '1 day');
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_patients', (SELECT COUNT(*) FROM patients),
    'total_doctors', (SELECT COUNT(*) FROM doctors WHERE is_active = TRUE),
    'total_departments', (SELECT COUNT(*) FROM departments WHERE is_active = TRUE),
    'today_appointments', (SELECT COUNT(*) FROM appointments WHERE appointment_date = v_date),
    'pending_lab_orders', (SELECT COUNT(*) FROM lab_orders WHERE status = 'PENDING'),
    'occupied_beds', (SELECT COUNT(*) FROM beds WHERE status = 'OCCUPIED'),
    'total_beds', (SELECT COUNT(*) FROM beds),
    'low_stock_medicines', (SELECT COUNT(*) FROM medicines WHERE stock_quantity <= reorder_level),
    'today_revenue', COALESCE((SELECT SUM(amount) FROM payments WHERE paid_at >= v_start AND paid_at < v_end), 0),
    'pending_invoices', (SELECT COUNT(*) FROM invoices WHERE status IN ('PENDING', 'PARTIAL')),
    'today_admissions', (SELECT COUNT(*) FROM admissions WHERE admission_date >= v_start AND admission_date < v_end),
    'today_discharges', (SELECT COUNT(*) FROM admissions WHERE discharge_date >= v_start AND discharge_date < v_end)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
