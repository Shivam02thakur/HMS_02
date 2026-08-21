import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Layout } from '@/components/layout/Layout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { PatientsPage } from '@/pages/patients/PatientsPage';
import { PatientDetailPage } from '@/pages/patients/PatientDetailPage';
import { DoctorsPage } from '@/pages/doctors/DoctorsPage';
import { DoctorDetailPage } from '@/pages/doctors/DoctorDetailPage';
import { AppointmentsPage } from '@/pages/appointments/AppointmentsPage';
import { PrescriptionsPage } from '@/pages/prescriptions/PrescriptionsPage';
import { PharmacyPage } from '@/pages/pharmacy/PharmacyPage';
import { LaboratoryPage } from '@/pages/laboratory/LaboratoryPage';
import { BillingPage } from '@/pages/billing/BillingPage';
import { InvoiceDetailPage } from '@/pages/billing/InvoiceDetailPage';
import { IPDPage } from '@/pages/ipd/IPDPage';
import { AdmissionsPage } from '@/pages/ipd/AdmissionsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import type { UserRole } from '@/types';
import './index.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// Guards a page by role in addition to the RLS policies enforced by the
// database. RLS is the real security boundary (it still blocks writes even
// if this were ever bypassed), but a page that's hidden from the sidebar
// for a role shouldn't be reachable by typing its URL either.
function RoleRoute({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const { hasRole } = useRole();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasRole(roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<DashboardPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="patients/:id" element={<PatientDetailPage />} />
        <Route path="doctors" element={<DoctorsPage />} />
        <Route path="doctors/:id" element={<DoctorDetailPage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="prescriptions" element={<PrescriptionsPage />} />
        <Route path="pharmacy" element={<PharmacyPage />} />
        <Route path="laboratory" element={<LaboratoryPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="billing/:id" element={<InvoiceDetailPage />} />
        <Route path="ipd" element={<IPDPage />} />
        <Route path="ipd/admissions" element={<AdmissionsPage />} />
        <Route path="settings" element={
          <RoleRoute roles={['admin']}>
            <SettingsPage />
          </RoleRoute>
        } />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
