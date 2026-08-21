import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/types';

export function useRole() {
  const { user } = useAuth();

  const hasRole = (roles: UserRole[]) => user ? roles.includes(user.role) : false;
  const isAdmin = () => user?.role === 'admin';
  const isReceptionist = () => user?.role === 'receptionist' || user?.role === 'admin';
  const isDoctor = () => user?.role === 'doctor' || user?.role === 'admin';
  const isPharmacist = () => user?.role === 'pharmacist' || user?.role === 'admin';
  const isLabTech = () => user?.role === 'lab_technician' || user?.role === 'admin';

  return { user, hasRole, isAdmin, isReceptionist, isDoctor, isPharmacist, isLabTech };
}
