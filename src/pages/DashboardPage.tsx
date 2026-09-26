import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Sparkline, TrendPill } from '@/components/ui/Sparkline';
import { useDailyHistory } from '@/hooks/useDailyHistory';
import { useRole } from '@/hooks/useRole';
import type { DashboardStats, Appointment, LabOrder, Medicine } from '@/types';
import {
  Users, Stethoscope, CalendarDays, FlaskConical,
  BedDouble, Pill, Receipt, AlertTriangle,
  Clock, Building2, LogIn, LogOut
} from 'lucide-react';
import { formatTime, formatCurrency, formatNumber } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------
// KPI catalogue: one entry per stat card. `group` drives the section it
// renders under; `higherIsBetter` drives the trend pill's colour (see
// TrendPill); `tile` is a Tailwind colour token used as the card's
// gradient-wash tint (see .card-kpi in src/index.css); `roles` gates
// which roles see the card at all -- an unlisted role never renders it,
// so each role's dashboard only carries what its job needs.
// ---------------------------------------------------------------------
type Role = 'admin' | 'receptionist' | 'doctor' | 'pharmacist' | 'lab_technician';

interface KpiDef {
  key: keyof DashboardStats | 'occupied_beds_ratio';
  label: string;
  icon: typeof Users;
  group: 'Patients and care' | "Today's operations" | 'Money and stock';
  higherIsBetter: 1 | -1 | 0;
  tile: string; // Tailwind colour, e.g. 'theme(colors.primary.500)'
  roles: Role[];
  format: (stats: DashboardStats) => string;
  rawValue: (stats: DashboardStats) => number;
}

const KPIS: KpiDef[] = [
  { key: 'total_patients', label: 'Total Patients', icon: Users, group: 'Patients and care', higherIsBetter: 1, tile: 'theme(colors.primary.500)', roles: ['admin', 'receptionist'], format: (s) => formatNumber(s.total_patients), rawValue: (s) => s.total_patients },
  { key: 'total_doctors', label: 'Active Doctors', icon: Stethoscope, group: 'Patients and care', higherIsBetter: 1, tile: 'theme(colors.medical.500)', roles: ['admin'], format: (s) => formatNumber(s.total_doctors), rawValue: (s) => s.total_doctors },
  { key: 'total_departments', label: 'Departments', icon: Building2, group: 'Patients and care', higherIsBetter: 0, tile: 'theme(colors.accent.600)', roles: ['admin'], format: (s) => formatNumber(s.total_departments), rawValue: (s) => s.total_departments },
  { key: 'today_admissions', label: 'Admissions Today', icon: LogIn, group: 'Patients and care', higherIsBetter: 0, tile: 'theme(colors.accent.600)', roles: ['admin', 'receptionist'], format: (s) => formatNumber(s.today_admissions), rawValue: (s) => s.today_admissions },
  { key: 'today_discharges', label: 'Discharges Today', icon: LogOut, group: 'Patients and care', higherIsBetter: 0, tile: 'theme(colors.medical.500)', roles: ['admin', 'receptionist'], format: (s) => formatNumber(s.today_discharges), rawValue: (s) => s.today_discharges },

  { key: 'today_appointments', label: "Today's Appointments", icon: CalendarDays, group: "Today's operations", higherIsBetter: 1, tile: 'theme(colors.accent.600)', roles: ['admin', 'receptionist', 'doctor'], format: (s) => formatNumber(s.today_appointments), rawValue: (s) => s.today_appointments },
  { key: 'occupied_beds_ratio', label: 'Occupied Beds', icon: BedDouble, group: "Today's operations", higherIsBetter: -1, tile: 'theme(colors.primary.500)', roles: ['admin', 'receptionist', 'doctor'], format: (s) => `${s.occupied_beds} / ${s.total_beds}`, rawValue: (s) => s.total_beds ? Math.round((s.occupied_beds / s.total_beds) * 100) : 0 },
  { key: 'pending_lab_orders', label: 'Pending Lab Orders', icon: FlaskConical, group: "Today's operations", higherIsBetter: -1, tile: 'theme(colors.info.fg)', roles: ['admin', 'doctor', 'lab_technician'], format: (s) => formatNumber(s.pending_lab_orders), rawValue: (s) => s.pending_lab_orders },

  { key: 'today_revenue', label: "Today's Revenue", icon: Receipt, group: 'Money and stock', higherIsBetter: 1, tile: 'theme(colors.medical.500)', roles: ['admin'], format: (s) => formatCurrency(s.today_revenue), rawValue: (s) => s.today_revenue },
  { key: 'pending_invoices', label: 'Pending Invoices', icon: Receipt, group: 'Money and stock', higherIsBetter: -1, tile: 'theme(colors.warning.600)', roles: ['admin', 'receptionist'], format: (s) => formatNumber(s.pending_invoices), rawValue: (s) => s.pending_invoices },
  { key: 'low_stock_medicines', label: 'Low Stock Items', icon: Pill, group: 'Money and stock', higherIsBetter: -1, tile: 'theme(colors.warning.600)', roles: ['admin', 'pharmacist'], format: (s) => formatNumber(s.low_stock_medicines), rawValue: (s) => s.low_stock_medicines },
];

const GROUP_ORDER: KpiDef['group'][] = ['Patients and care', "Today's operations", 'Money and stock'];

const ROLE_TITLE: Record<Role, [string, string]> = {
  admin: ['Dashboard', 'Overview of hospital operations'],
  receptionist: ['Front desk', "Today's check-ins, appointments and beds"],
  doctor: ['My day', "Today's appointments and results to review"],
  pharmacist: ['Pharmacy stock', 'What needs attention today'],
  lab_technician: ['Lab orders', 'Orders waiting for results'],
};

function KpiCard({ def, stats }: { def: KpiDef; stats: DashboardStats }) {
  const raw = def.rawValue(stats);
  const history = useDailyHistory(def.key, raw);
  return (
    <div className="card-kpi min-w-[180px] flex-1" style={{ '--tile': def.tile } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-ink-muted">{def.label}</span>
        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded" style={{ borderRadius: 'inherit', background: 'color-mix(in srgb, var(--tile) 16%, transparent)', color: 'var(--tile)' }}>
          <def.icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums text-ink">{def.format(stats)}</div>
      {history.length >= 2 && (
        <div className="mt-1 flex items-center gap-2">
          <TrendPill values={history} higherIsBetter={def.higherIsBetter} />
        </div>
      )}
      <Sparkline values={history} variant={def.key === 'today_revenue' || def.key === 'occupied_beds_ratio' ? 'line' : 'bars'} colorClassName="text-current" className="mt-1" />
    </div>
  );
}

export function DashboardPage() {
  const { user } = useRole();
  const role = (user?.role ?? 'admin') as Role;
  const [title, subtitle] = ROLE_TITLE[role];
  const navigate = useNavigate();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [pendingLabs, setPendingLabs] = useState<LabOrder[]>([]);
  const [lowStock, setLowStock] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData();
    // Re-fetch if the signed-in role changes (e.g. an admin impersonating
    // / switching context), so a doctor's appointment filter stays correct.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user?.id]);

  // Local calendar day, NOT UTC -- see migration 041 for why. Passed to
  // get_dashboard_stats() so its "today" figures (revenue, admissions,
  // discharges, appointments) agree with the Billing page's Revenue
  // Collected card, which already buckets "today" by local date.
  function localDayBounds() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const start = new Date(y, m, d);
    const end = new Date(y, m, d + 1);
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { start: start.toISOString(), end: end.toISOString(), dateStr };
  }

  async function fetchDashboardData() {
    setError(null);
    try {
      const { start, end, dateStr } = localDayBounds();
      const { data: statsData, error: statsError } = await supabase.rpc('get_dashboard_stats', {
        p_today_start: start,
        p_today_end: end,
        p_today_date: dateStr,
      });
      if (statsError) throw statsError;
      const rawStats = Array.isArray(statsData) ? statsData[0] : statsData;
      setStats((rawStats ?? null) as unknown as DashboardStats | null);

      const today = dateStr;

      // A doctor only sees their own appointments. Resolve their doctors.id
      // via doctors.user_id (the auth link) rather than trusting a name
      // match, then filter server-side so the 5-row cap doesn't silently
      // drop their own patients behind other doctors' earlier slots.
      let apptQuery = supabase
        .from('appointments')
        .select('*, patient:patients(*), doctor:doctors(*)')
        .eq('appointment_date', today)
        .order('appointment_time')
        .limit(role === 'doctor' ? 10 : 5);

      if (role === 'doctor' && user?.id) {
        const { data: myDoctor } = await supabase
          .from('doctors')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (myDoctor?.id) {
          apptQuery = apptQuery.eq('doctor_id', myDoctor.id);
        }
      }
      const { data: appts, error: apptsError } = await apptQuery;
      if (apptsError) throw apptsError;
      setTodayAppointments((appts || []) as unknown as Appointment[]);

      const { data: labs, error: labsError } = await supabase
        .from('lab_orders')
        .select('*, patient:patients(*), test:lab_tests(*)')
        .eq('status', 'PENDING')
        .order('ordered_at', { ascending: false })
        .limit(5);
      if (labsError) throw labsError;
      setPendingLabs((labs || []) as unknown as LabOrder[]);

      const { data: medicines, error: medsError } = await supabase
        .from('medicines')
        .select('*')
        .order('stock_quantity')
        .limit(20);
      if (medsError) throw medsError;
      setLowStock((medicines || []).filter(m => m.stock_quantity <= m.reorder_level).slice(0, 5));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-kpi bg-surface-muted" />
          ))}
        </div>
      </div>
    );
  }

  const visibleKpis = KPIS.filter((k) => k.roles.includes(role));
  const showAppointments = role !== 'pharmacist' && role !== 'lab_technician';
  const showLabs = role !== 'pharmacist' && role !== 'receptionist';
  const showLowStockAlert = (role === 'admin' || role === 'pharmacist') && lowStock.length > 0;
  const showInvoiceAlert = (role === 'admin' || role === 'receptionist') && (stats?.pending_invoices ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        <p className="text-ink-muted">{subtitle}</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-bg border border-danger-fg/20 px-4 py-3 text-sm text-danger-fg">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Couldn't load dashboard data: {error}
        </div>
      )}

      {/* Real, computed alerts only -- no invented capacity figures we
          can't back with a query. Admin/receptionist only: these are
          hospital-operations concerns, not a doctor's or lab tech's. */}
      {(showLowStockAlert || showInvoiceAlert) && (
        <div className="card-alert flex flex-wrap items-center gap-3 border border-warning-600/30 bg-warning-50 text-warning-700 dark:bg-caution-bg dark:text-caution-fg">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span className="flex-1 text-sm">
            {showLowStockAlert && `${lowStock.length} medicine${lowStock.length === 1 ? '' : 's'} below reorder level`}
            {showLowStockAlert && showInvoiceAlert && ' \u00b7 '}
            {showInvoiceAlert && `${stats?.pending_invoices} invoice${stats?.pending_invoices === 1 ? '' : 's'} pending`}
          </span>
        </div>
      )}

      {stats && GROUP_ORDER.map((group) => {
        const cards = visibleKpis.filter((k) => k.group === group);
        if (!cards.length) return null;
        return (
          <section key={group}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
              <span className="h-0.5 w-4 rounded-full bg-primary-500" />
              {group}
            </h2>
            <div className="flex flex-wrap gap-3">
              {cards.map((def) => <KpiCard key={def.key} def={def} stats={stats} />)}
            </div>
          </section>
        );
      })}

      {(showAppointments || showLabs) && (
        <div className={`grid grid-cols-1 gap-6 ${showAppointments && showLabs ? 'lg:grid-cols-2' : ''}`}>
          {showAppointments && (
            <div className="card-list">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink">{role === 'doctor' ? 'Your Appointments' : "Today's Appointments"}</h2>
                <button onClick={() => navigate('/appointments')} className="text-sm text-primary-600 hover:text-primary-700">
                  View All
                </button>
              </div>
              {todayAppointments.length === 0 ? (
                <EmptyState title="No appointments today" description="All caught up for the day!" />
              ) : (
                <div className="space-y-3">
                  {todayAppointments.map((appt) => (
                    <div key={appt.id} className="flex items-center gap-4 rounded-lg border border-line p-3 hover:bg-surface-muted cursor-pointer" onClick={() => navigate('/appointments')}>
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/40">
                        <Clock className="h-5 w-5 text-primary-600 dark:text-primary-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{appt.patient?.full_name}</p>
                        <p className="text-xs text-ink-subtle">Dr. {appt.doctor?.full_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-ink">{formatTime(appt.appointment_time)}</p>
                        <StatusBadge status={appt.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {showLabs && (
            <div className="card-list">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink">{role === 'lab_technician' ? 'Orders to Process' : 'Pending Lab Orders'}</h2>
                <button onClick={() => navigate('/laboratory')} className="text-sm text-primary-600 hover:text-primary-700">
                  View All
                </button>
              </div>
              {pendingLabs.length === 0 ? (
                <EmptyState title="No pending lab orders" description="All lab tests are up to date!" />
              ) : (
                <div className="space-y-3">
                  {pendingLabs.map((lab) => (
                    <div key={lab.id} className="flex items-center gap-4 rounded-lg border border-line p-3 hover:bg-surface-muted cursor-pointer" onClick={() => navigate('/laboratory')}>
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-caution-bg">
                        <FlaskConical className="h-5 w-5 text-caution-fg" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{lab.test?.name}</p>
                        <p className="text-xs text-ink-subtle">{lab.patient?.full_name}</p>
                      </div>
                      <StatusBadge status={lab.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(role === 'admin' || role === 'pharmacist') && lowStock.length > 0 && (
        <div className="card-list border-l-4 border-l-warning-600">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning-700" />
            <h2 className="text-lg font-semibold text-ink">Low Stock Medicines</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lowStock.map((med) => (
              <div key={med.id} className="flex items-center justify-between rounded-lg bg-caution-bg p-3">
                <span className="text-sm font-medium text-ink">{med.name}</span>
                <span className="text-sm font-bold text-caution-fg">{med.stock_quantity} left</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
