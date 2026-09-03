import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function calculateAge(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-IN').format(num);
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    BOOKED: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-800',
    NO_SHOW: 'bg-yellow-100 text-yellow-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    PAID: 'bg-green-100 text-green-800',
    PARTIAL: 'bg-orange-100 text-orange-800',
    ADMITTED: 'bg-red-100 text-red-800',
    DISCHARGED: 'bg-green-100 text-green-800',
    VACANT: 'bg-green-100 text-green-800',
    OCCUPIED: 'bg-red-100 text-red-800',
    MAINTENANCE: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PARTIAL: 'PARTIALLY PAID',
  };
  return labels[status] || status;
}

export const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30',
];

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Specialization is free text (no lookup table). Trimming + title-casing on
// save keeps "cardiology" / "Cardiology " / "CARDIOLOGY" from becoming three
// separate values that the filter dropdown (and search) would then treat as
// distinct. Shared between DoctorsPage (Add/Edit Doctor) and SettingsPage
// (Create User -> Doctor) so both paths normalize identically.
// Acronyms that should stay fully uppercase rather than being title-cased
// word-by-word (default rule would turn "ENT" into "Ent"). Extend this list
// as new abbreviated specializations get added.
const SPECIALIZATION_ACRONYMS = new Set(['ENT', 'ICU', 'ECG', 'OBGYN', 'ER', 'OPD']);

export function normalizeSpecialization(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
    .split(' ')
    .map(w => {
      if (!w) return w;
      const upper = w.toUpperCase();
      if (SPECIALIZATION_ACRONYMS.has(upper)) return upper;
      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}
