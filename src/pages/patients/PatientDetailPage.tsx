import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Patient, Appointment, Prescription, LabOrder, Invoice, Admission } from '@/types';
import { formatDate, formatTime, formatCurrency, getStatusColor } from '@/lib/utils';
import { ArrowLeft, User, Phone, Mail, MapPin, Calendar, Droplets, AlertTriangle, FileText, FlaskConical, Receipt, BedDouble, ClipboardList } from 'lucide-react';

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'appointments' | 'prescriptions' | 'lab' | 'billing' | 'admissions'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    if (!id) return;
    setLoading(true);
    const [{ data: p }, { data: a }, { data: pr }, { data: l }, { data: i }, { data: adm }] = await Promise.all([
      supabase.from('patients').select('*').eq('id', id).single(),
      supabase.from('appointments').select('*, doctor:doctors(full_name)').eq('patient_id', id).order('appointment_date', { ascending: false }).limit(10),
      supabase.from('prescriptions').select('*, doctor:doctors(full_name), items:prescription_items(*, medicine:medicines(name))').eq('patient_id', id).order('created_at', { ascending: false }).limit(10),
      supabase.from('lab_orders').select('*, test:lab_tests(name), result:lab_results(*)').eq('patient_id', id).order('ordered_at', { ascending: false }).limit(10),
      supabase.from('invoices').select('*').eq('patient_id', id).order('created_at', { ascending: false }).limit(10),
      supabase.from('admissions').select('*, doctor:doctors(full_name), bed:beds(bed_number, ward:wards(name))').eq('patient_id', id).order('admission_date', { ascending: false }).limit(10),
    ]);
    setPatient(p as Patient | null);
    setAppointments((a || []) as unknown as Appointment[]);
    setPrescriptions((pr || []) as unknown as Prescription[]);
    setLabOrders((l || []) as unknown as LabOrder[]);
    setInvoices(i || []);
    setAdmissions((adm || []) as unknown as Admission[]);
    setLoading(false);
  }

  if (loading) return <div className="flex h-96 items-center justify-center">Loading...</div>;
  if (!patient) return <div className="flex h-96 items-center justify-center">Patient not found</div>;

  const tabs = [
    { key: 'overview', label: 'Overview', icon: ClipboardList },
    { key: 'appointments', label: 'Appointments', icon: Calendar },
    { key: 'prescriptions', label: 'Prescriptions', icon: FileText },
    { key: 'lab', label: 'Lab Reports', icon: FlaskConical },
    { key: 'billing', label: 'Billing', icon: Receipt },
    { key: 'admissions', label: 'Admissions', icon: BedDouble },
  ];

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/patients')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to Patients
      </button>

      {/* Patient Header */}
      <div className="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
            <User className="h-8 w-8 text-primary-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{patient.full_name}</h1>
            <p className="text-sm text-gray-500">{patient.patient_code}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {patient.phone && <span className="flex items-center gap-1 text-gray-600"><Phone className="h-3.5 w-3.5" /> {patient.phone}</span>}
              {patient.email && <span className="flex items-center gap-1 text-gray-600"><Mail className="h-3.5 w-3.5" /> {patient.email}</span>}
              {patient.date_of_birth && <span className="flex items-center gap-1 text-gray-600"><Calendar className="h-3.5 w-3.5" /> {formatDate(patient.date_of_birth)}</span>}
              {patient.blood_group && <span className="flex items-center gap-1 text-gray-600"><Droplets className="h-3.5 w-3.5" /> {patient.blood_group}</span>}
              {patient.address && <span className="flex items-center gap-1 text-gray-600"><MapPin className="h-3.5 w-3.5" /> {patient.address}</span>}
            </div>
            {patient.allergies && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-red-700">Allergies</p>
                  <p className="text-sm text-red-600">{patient.allergies}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${activeTab === tab.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">Total Appointments</p>
              <p className="text-2xl font-bold text-gray-900">{appointments.length}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">Prescriptions</p>
              <p className="text-2xl font-bold text-gray-900">{prescriptions.length}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">Lab Tests</p>
              <p className="text-2xl font-bold text-gray-900">{labOrders.length}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-sm text-gray-500">Admissions</p>
              <p className="text-2xl font-bold text-gray-900">{admissions.length}</p>
            </div>
            {patient.medical_history && (
              <div className="sm:col-span-2 lg:col-span-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Medical History</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{patient.medical_history}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'appointments' && (
          appointments.length === 0 ? <p className="text-center text-gray-500 py-8">No appointments found</p> :
          <div className="space-y-3">
            {appointments.map(a => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{formatDate(a.appointment_date)} at {formatTime(a.appointment_time)}</p>
                  <p className="text-xs text-gray-500">Dr. {a.doctor?.full_name}</p>
                </div>
                <span className={`badge ${getStatusColor(a.status)}`}>{a.status}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'prescriptions' && (
          prescriptions.length === 0 ? <p className="text-center text-gray-500 py-8">No prescriptions found</p> :
          <div className="space-y-4">
            {prescriptions.map(pr => (
              <div key={pr.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-900">Dr. {pr.doctor?.full_name}</p>
                  <span className="text-xs text-gray-500">{formatDate(pr.created_at)}</span>
                </div>
                {pr.diagnosis && <p className="text-xs text-gray-600 mb-2">Diagnosis: {pr.diagnosis}</p>}
                <div className="space-y-1">
                  {pr.items?.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{item.medicine?.name}</span>
                      <span className="text-gray-500">- {item.dosage}, {item.frequency}, {item.duration}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'lab' && (
          labOrders.length === 0 ? <p className="text-center text-gray-500 py-8">No lab orders found</p> :
          <div className="space-y-3">
            {labOrders.map(l => (
              <div key={l.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-900">{l.test?.name}</p>
                  <span className={`badge ${getStatusColor(l.status)}`}>{l.status}</span>
                </div>
                {l.result && (
                  <div className="mt-2 rounded-lg bg-gray-50 p-3">
                    <p className="text-sm"><span className="font-medium">Result:</span> {l.result.result_value}</p>
                    {l.result.remarks && <p className="text-xs text-gray-500 mt-1">{l.result.remarks}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'billing' && (
          invoices.length === 0 ? <p className="text-center text-gray-500 py-8">No invoices found</p> :
          <div className="space-y-3">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                  <p className="text-xs text-gray-500">{formatDate(inv.invoice_date)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(inv.total_amount)}</p>
                  <span className={`badge ${getStatusColor(inv.status)}`}>{inv.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'admissions' && (
          admissions.length === 0 ? <p className="text-center text-gray-500 py-8">No admissions found</p> :
          <div className="space-y-3">
            {admissions.map(adm => (
              <div key={adm.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{adm.bed?.ward?.name} - {adm.bed?.bed_number}</p>
                  <p className="text-xs text-gray-500">Dr. {adm.doctor?.full_name}</p>
                  <p className="text-xs text-gray-400">{formatDate(adm.admission_date)}</p>
                </div>
                <span className={`badge ${getStatusColor(adm.status)}`}>{adm.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
