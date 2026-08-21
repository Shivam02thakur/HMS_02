import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { DashboardStats, Appointment, LabOrder, Medicine } from '@/types';
import {
  Users, Stethoscope, CalendarDays, FlaskConical,
  BedDouble, Pill, Receipt, AlertTriangle, TrendingUp,
  Clock, CheckCircle, XCircle
} from 'lucide-react';
import { formatDate, formatTime, formatCurrency, formatNumber, getStatusColor } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [pendingLabs, setPendingLabs] = useState<LabOrder[]>([]);
  const [lowStock, setLowStock] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      // Stats
      const { data: statsData } = await supabase.rpc('get_dashboard_stats');
      setStats((statsData ?? null) as unknown as DashboardStats | null);

      // Today's appointments
      const today = new Date().toISOString().split('T')[0];
      const { data: appts } = await supabase
        .from('appointments')
        .select('*, patient:patients(*), doctor:doctors(*)')
        .eq('appointment_date', today)
        .order('appointment_time')
        .limit(5);
      setTodayAppointments((appts || []) as unknown as Appointment[]);

      // Pending lab orders
      const { data: labs } = await supabase
        .from('lab_orders')
        .select('*, patient:patients(*), test:lab_tests(*)')
        .eq('status', 'PENDING')
        .order('ordered_at', { ascending: false })
        .limit(5);
      setPendingLabs((labs || []) as unknown as LabOrder[]);

      // Low stock medicines. PostgREST filters can't compare one column to
      // another (stock_quantity <= reorder_level), so pull a reasonable
      // window of stock ordered ascending and filter client-side.
      const { data: medicines } = await supabase
        .from('medicines')
        .select('*')
        .order('stock_quantity')
        .limit(20);
      setLowStock((medicines || []).filter(m => m.stock_quantity <= m.reorder_level).slice(0, 5));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="flex h-96 items-center justify-center">Loading dashboard...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Overview of hospital operations</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Patients" value={formatNumber(stats?.total_patients || 0)} icon={Users} color="blue" />
        <StatCard title="Active Doctors" value={formatNumber(stats?.total_doctors || 0)} icon={Stethoscope} color="green" />
        <StatCard title="Today's Appointments" value={formatNumber(stats?.today_appointments || 0)} icon={CalendarDays} color="purple" />
        <StatCard title="Today's Revenue" value={formatCurrency(stats?.today_revenue || 0)} icon={Receipt} color="yellow" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Pending Lab Orders" value={formatNumber(stats?.pending_lab_orders || 0)} icon={FlaskConical} color="red" />
        <StatCard title="Occupied Beds" value={`${stats?.occupied_beds || 0} / ${stats?.total_beds || 0}`} icon={BedDouble} color="blue" />
        <StatCard title="Low Stock Items" value={formatNumber(stats?.low_stock_medicines || 0)} icon={Pill} color="yellow" />
        <StatCard title="Pending Invoices" value={formatNumber(stats?.pending_invoices || 0)} icon={Receipt} color="red" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Today's Appointments */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Today's Appointments</h2>
            <button onClick={() => navigate('/appointments')} className="text-sm text-primary-600 hover:text-primary-700">
              View All
            </button>
          </div>
          {todayAppointments.length === 0 ? (
            <EmptyState title="No appointments today" description="All caught up for the day!" />
          ) : (
            <div className="space-y-3">
              {todayAppointments.map((appt) => (
                <div key={appt.id} className="flex items-center gap-4 rounded-lg border border-gray-100 p-3 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/appointments`)}>
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100">
                    <Clock className="h-5 w-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{appt.patient?.full_name}</p>
                    <p className="text-xs text-gray-500">Dr. {appt.doctor?.full_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-900">{formatTime(appt.appointment_time)}</p>
                    <span className={`badge ${getStatusColor(appt.status)}`}>{appt.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Lab Orders */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Pending Lab Orders</h2>
            <button onClick={() => navigate('/laboratory')} className="text-sm text-primary-600 hover:text-primary-700">
              View All
            </button>
          </div>
          {pendingLabs.length === 0 ? (
            <EmptyState title="No pending lab orders" description="All lab tests are up to date!" />
          ) : (
            <div className="space-y-3">
              {pendingLabs.map((lab) => (
                <div key={lab.id} className="flex items-center gap-4 rounded-lg border border-gray-100 p-3 hover:bg-gray-50 cursor-pointer" onClick={() => navigate('/laboratory')}>
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-yellow-100">
                    <FlaskConical className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{lab.test?.name}</p>
                    <p className="text-xs text-gray-500">{lab.patient?.full_name}</p>
                  </div>
                  <span className={`badge ${getStatusColor(lab.status)}`}>{lab.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStock.length > 0 && (
        <div className="card border-l-4 border-l-yellow-400">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <h2 className="text-lg font-semibold text-gray-900">Low Stock Medicines</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lowStock.map((med) => (
              <div key={med.id} className="flex items-center justify-between rounded-lg bg-yellow-50 p-3">
                <span className="text-sm font-medium text-gray-900">{med.name}</span>
                <span className="text-sm font-bold text-yellow-700">{med.stock_quantity} left</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
