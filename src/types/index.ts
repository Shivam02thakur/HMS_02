export type UserRole = 'admin' | 'receptionist' | 'doctor' | 'pharmacist' | 'lab_technician';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string | null;
}

export interface Doctor {
  id: string;
  user_id?: string;
  full_name: string;
  email?: string;
  phone?: string;
  department_id?: string;
  specialization?: string;
  qualification?: string;
  registration_no?: string;
  consultation_fee: number;
  experience_years: number;
  available_days: string[];
  available_time_start?: string;
  available_time_end?: string;
  is_active: boolean;
  created_at: string;
  department?: Department;
}

export interface Patient {
  id: string;
  patient_code: string;
  full_name: string;
  email?: string | null;
  phone: string;
  date_of_birth?: string | null;
  gender?: 'male' | 'female' | 'other' | null;
  blood_group?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  allergies?: string | null;
  medical_history?: string | null;
  created_at: string | null;
}

export type AppointmentStatus = 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_date: string;
  appointment_time: string;
  status: AppointmentStatus;
  notes?: string;
  created_by?: string;
  created_at: string;
  patient?: Patient;
  doctor?: Doctor;
}

export interface Room {
  id: string;
  ward_id: string;
  room_number: string;
  is_active: boolean;
}

export interface Ward {
  id: string;
  name: string;
  ward_type: 'General' | 'ICU' | 'Private';
  capacity: number;
  daily_rate: number;
  created_at: string;
}
export type BedStatus = 'VACANT' | 'OCCUPIED' | 'MAINTENANCE';

export interface Bed {
  id: string;
  ward_id: string;
  bed_number: string;
  status: BedStatus;
  created_at: string;
  ward?: Ward;
  room?: { id: string; room_number: string };
}

export type AdmissionStatus = 'ADMITTED' | 'DISCHARGED';

export interface Admission {
  id: string;
  patient_id: string;
  doctor_id?: string;
  bed_id?: string;
  diagnosis?: string;
  admission_date: string;
  discharge_date?: string;
  status: AdmissionStatus;
  notes?: string;
  created_at: string;
  patient?: Patient;
  doctor?: Doctor;
  bed?: Bed;
}

export interface Medicine {
  id: string;
  name: string;
  generic_name?: string | null;
  category?: string | null;
  manufacturer?: string | null;
  stock_quantity: number;
  reorder_level: number;
  unit_price: number;
  expiry_date?: string | null;
  created_at: string | null;
}

export interface Prescription {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id?: string;
  diagnosis?: string;
  notes?: string;
  weight_kg?: number | null;
  bp?: string | null;
  pulse_bpm?: number | null;
  temperature_f?: number | null;
  spo2_percent?: number | null;
  created_at: string;
  // A prescription is immutable from the moment it's created. The only way
  // to change anything is a brand-new prescription written during a later
  // consultation that explicitly names the earlier one it revises
  // (revision_of) -- same doctor, same patient, enforced at the database
  // level. superseded_by/superseded_at are set on the OLD prescription the
  // instant a revision of it is created; a superseded prescription is no
  // longer purchasable against, regardless of remaining quantity.
  prescription_number?: string | null;
  revision_of?: string | null;
  superseded_by?: string | null;
  superseded_at?: string | null;
  patient?: Patient;
  doctor?: Doctor;
  items?: PrescriptionItem[];
  lab_orders?: LabOrder[];
  revision_of_prescription?: Pick<Prescription, 'id' | 'prescription_number' | 'created_at'> | null;
  superseded_by_prescription?: Pick<Prescription, 'id' | 'prescription_number' | 'created_at'> | null;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  medicine_id: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
  // Total units prescribed on this line (e.g. "10 tablets"). Nullable:
  // existing rows predate this field and have no honest historical value --
  // NULL is treated as "no cap recorded" (unlimited), never coerced to 0.
  quantity?: number | null;
  created_at: string;
  medicine?: Medicine;
}

export interface LabTest {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  normal_range?: string | null;
  unit?: string | null;
  price: number;
  created_at: string | null;
}

export type LabOrderStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface LabOrder {
  id: string;
  patient_id: string;
  doctor_id?: string;
  prescription_id?: string | null;
  test_id: string;
  status: LabOrderStatus;
  ordered_at: string;
  completed_at?: string;
  notes?: string;
  created_by?: string;
  patient?: Patient;
  doctor?: Doctor;
  test?: LabTest;
  result?: LabResult;
}

export interface LabResult {
  id: string;
  lab_order_id: string;
  result_value?: string;
  remarks?: string;
  is_abnormal: boolean;
  recorded_by?: string;
  recorded_at: string;
}

export type InvoiceStatus = 'PENDING' | 'PARTIAL' | 'PAID';

export interface Invoice {
  id: string;
  patient_id: string;
  invoice_number?: string | null;
  invoice_date: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  waived_amount: number;
  status: InvoiceStatus;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  patient?: Patient;
  items?: InvoiceItem[];
  payments?: Payment[];
  adjustments?: InvoiceAdjustment[];
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  item_type?: 'consultation' | 'lab_test' | 'medicine' | 'bed_charge' | 'other';
  reference_id?: string;
  dispensed?: boolean;
  // Links a medicine purchase back to the exact prescribed line it came
  // from, so "remaining quantity" is computed per prescription line, not
  // per medicine in general.
  prescription_item_id?: string | null;
  // All-or-nothing: a purchase beyond the prescribed line's remaining
  // quantity is only allowed via this deliberate, auditable override
  // (pharmacist/admin only), never partially recorded.
  quantity_override_reason?: string | null;
  quantity_override_by?: string | null;
  quantity_override_at?: string | null;
  created_at: string;
}

export type PaymentMode = 'Cash' | 'UPI' | 'Card';

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_mode: PaymentMode;
  transaction_id?: string;
  paid_at: string;
  received_by?: string;
  notes?: string;
  created_at: string;
}

export type AdjustmentType = 'WAIVER' | 'WRITE_OFF' | 'DISCOUNT' | 'CORRECTION';

export interface InvoiceAdjustment {
  id: string;
  invoice_id: string;
  amount: number;
  adjustment_type: AdjustmentType;
  reason: string;
  created_by?: string;
  created_at: string;
  created_by_profile?: { full_name: string };
}

export interface DashboardStats {
  total_patients: number;
  total_doctors: number;
  total_departments: number;
  today_appointments: number;
  pending_lab_orders: number;
  occupied_beds: number;
  total_beds: number;
  low_stock_medicines: number;
  today_revenue: number;
  pending_invoices: number;
  today_admissions: number;
  today_discharges: number;
}