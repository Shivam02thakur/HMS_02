import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { useTheme, type ThemePreference } from '@/contexts/ThemeContext';
import {
  LayoutDashboard, Users, Stethoscope, CalendarDays, FileText,
  Pill, FlaskConical, Receipt, BedDouble, Settings, LogOut,
  Menu, X, ChevronDown, ChevronRight, UserCircle, Building2, Sparkles, Search,
  Sun, Moon, Monitor
} from 'lucide-react';

import { NotificationBell } from '@/components/layout/NotificationBell.tsx';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="hidden items-center gap-0.5 rounded-full border border-line bg-surface-muted p-0.5 sm:flex" role="group" aria-label="Theme">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => setPreference(value)}
          aria-pressed={preference === value}
          title={label}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
            preference === value
              ? 'bg-surface text-primary-600 shadow-sm'
              : 'text-ink-subtle hover:text-ink-muted'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

// Grouped into sections (rather than one flat list) so the sidebar reads
// like a map of the app instead of a wall of links — mirrors the grouped
// nav pattern from the redesign guidance.
const navGroups = [
  {
    label: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'receptionist', 'doctor', 'pharmacist', 'lab_technician'] },
    ],
  },
  {
    label: 'Clinical',
    items: [
      { path: '/patients', label: 'Patients', icon: Users, roles: ['admin', 'receptionist', 'doctor', 'pharmacist', 'lab_technician'] },
      { path: '/doctors', label: 'Doctors', icon: Stethoscope, roles: ['admin', 'receptionist', 'doctor'] },
      { path: '/appointments', label: 'Appointments', icon: CalendarDays, roles: ['admin', 'receptionist', 'doctor'] },
      { path: '/prescriptions', label: 'Prescriptions', icon: FileText, roles: ['admin', 'doctor', 'pharmacist'] },
      { path: '/laboratory', label: 'Laboratory', icon: FlaskConical, roles: ['admin', 'doctor', 'lab_technician'] },
      { path: '/ipd', label: 'IPD / Wards', icon: BedDouble, roles: ['admin', 'receptionist', 'doctor'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/pharmacy', label: 'Pharmacy', icon: Pill, roles: ['admin', 'pharmacist'] },
      { path: '/billing', label: 'Billing', icon: Receipt, roles: ['admin', 'receptionist'] },
      { path: '/departments', label: 'Departments', icon: Building2, roles: ['admin', 'receptionist', 'doctor'] },
      { path: '/hygiene', label: 'Hygiene', icon: Sparkles, roles: ['admin', 'receptionist'] },
    ],
  },
  {
    label: 'Admin',
    items: [
      { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin', 'doctor'] },
    ],
  },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  const { user, signOut } = useAuth();
  const { hasRole } = useRole();
  const location = useLocation();
  const navigate = useNavigate();

  const filteredGroups = navGroups
    .map(group => ({ ...group, items: group.items.filter(item => hasRole(item.roles as any)) }))
    .filter(group => group.items.length > 0);

  return (
    <div className="flex h-screen bg-bg print:block print:h-auto">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-surface border-r border-line transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 print:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center gap-2 border-b border-line px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-ink">MediCare HMS</span>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden">
            <X className="h-5 w-5 text-ink-muted" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-4 overflow-y-auto" style={{ height: 'calc(100vh - 64px - 80px)' }}>
          {filteredGroups.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="nav-section-label">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setSidebarOpen(false); }}
                    className={`sidebar-link w-full ${isActive ? 'active' : ''}`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100">
              <UserCircle className="h-5 w-5 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">{user?.full_name}</p>
              <p className="text-xs text-ink-subtle capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button onClick={() => signOut()} className="text-ink-subtle hover:text-ink-muted">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0 print:block">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-line app-header-blur px-4 lg:px-8 print:hidden">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu className="h-6 w-6 text-ink-muted" />
          </button>

          <div className="relative hidden max-w-sm flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
            <input
              type="search"
              placeholder="Search patients, doctors, invoices…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const q = (e.target as HTMLInputElement).value.trim();
                  if (q) navigate(`/patients?q=${encodeURIComponent(q)}`);
                }
              }}
              className="h-10 w-full rounded-xl border border-line bg-surface-muted/70 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-primary-400 focus:bg-surface focus:ring-2 focus:ring-primary-100"
            />
          </div>

          <div className="flex-1 sm:hidden" />

          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-muted hidden sm:block">
              {now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            <span className="text-sm font-medium text-ink-muted tabular-nums hidden sm:block">
              {now.toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8 print:p-0 print:overflow-visible">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
