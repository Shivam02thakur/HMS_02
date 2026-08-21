import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import {
  LayoutDashboard, Users, Stethoscope, CalendarDays, FileText,
  Pill, FlaskConical, Receipt, BedDouble, Settings, LogOut,
  Menu, X, ChevronDown, ChevronRight, UserCircle
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'receptionist', 'doctor', 'pharmacist', 'lab_technician'] },
  { path: '/patients', label: 'Patients', icon: Users, roles: ['admin', 'receptionist', 'doctor', 'pharmacist', 'lab_technician'] },
  { path: '/doctors', label: 'Doctors', icon: Stethoscope, roles: ['admin', 'receptionist', 'doctor'] },
  { path: '/appointments', label: 'Appointments', icon: CalendarDays, roles: ['admin', 'receptionist', 'doctor'] },
  { path: '/prescriptions', label: 'Prescriptions', icon: FileText, roles: ['admin', 'doctor', 'pharmacist'] },
  { path: '/pharmacy', label: 'Pharmacy', icon: Pill, roles: ['admin', 'pharmacist'] },
  { path: '/laboratory', label: 'Laboratory', icon: FlaskConical, roles: ['admin', 'doctor', 'lab_technician'] },
  { path: '/billing', label: 'Billing', icon: Receipt, roles: ['admin', 'receptionist'] },
  { path: '/ipd', label: 'IPD / Wards', icon: BedDouble, roles: ['admin', 'receptionist', 'doctor'] },
  { path: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, signOut } = useAuth();
  const { hasRole } = useRole();
  const location = useLocation();
  const navigate = useNavigate();

  const filteredNav = navItems.filter(item => hasRole(item.roles as any));

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white border-r border-gray-200 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">MediCare HMS</span>
          <button onClick={() => setSidebarOpen(false)} className="ml-auto lg:hidden">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-4 overflow-y-auto" style={{ height: 'calc(100vh - 64px - 80px)' }}>
          {filteredNav.map((item) => {
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
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100">
              <UserCircle className="h-5 w-5 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
              <p className="text-xs text-gray-500 capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button onClick={() => signOut()} className="text-gray-400 hover:text-gray-600">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-8">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
            <Menu className="h-6 w-6 text-gray-600" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
