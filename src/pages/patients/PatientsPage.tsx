import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReauthModal } from '@/components/ui/ReauthModal';
import { useAuth } from '@/contexts/AuthContext';
import type { Patient } from '@/types';
import { Plus, Search, User, Phone, Calendar, Trash2, Eye, Edit } from 'lucide-react';
import { formatDate, BLOOD_GROUPS } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [showReauth, setShowReauth] = useState(false);
  const [deleteBlockedInfo, setDeleteBlockedInfo] = useState<{ patient: Patient; counts: Record<string, number> } | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const navigate = useNavigate();
  const { isReceptionist } = useRole();
  const { user } = useAuth();

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', date_of_birth: '',
    gender: '', blood_group: '', address: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    allergies: '', medical_history: ''
  });

  useEffect(() => { fetchPatients(); }, [debouncedSearch]);

  async function fetchPatients() {
    setLoading(true);
    let query = supabase.from('patients').select('*').order('created_at', { ascending: false });
    if (debouncedSearch) {
      query = query.or(`full_name.ilike.%${debouncedSearch}%,patient_code.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`);
    }
    const { data } = await query;
    setPatients((data || []) as unknown as Patient[]);
    setLoading(false);
  }

  function openModal(patient?: Patient) {
    if (patient) {
      setEditingPatient(patient);
      setForm({
        full_name: patient.full_name,
        email: patient.email || '',
        phone: patient.phone,
        date_of_birth: patient.date_of_birth || '',
        gender: patient.gender || '',
        blood_group: patient.blood_group || '',
        address: patient.address || '',
        emergency_contact_name: patient.emergency_contact_name || '',
        emergency_contact_phone: patient.emergency_contact_phone || '',
        allergies: patient.allergies || '',
        medical_history: patient.medical_history || ''
      });
    } else {
      setEditingPatient(null);
      setForm({ full_name: '', email: '', phone: '', date_of_birth: '', gender: '', blood_group: '', address: '', emergency_contact_name: '', emergency_contact_phone: '', allergies: '', medical_history: '' });
    }
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      email: form.email || null,
      date_of_birth: form.date_of_birth || null,
      gender: (form.gender || null) as 'male' | 'female' | 'other' | null,
      blood_group: form.blood_group || null,
      address: form.address || null,
      emergency_contact_name: form.emergency_contact_name || null,
      emergency_contact_phone: form.emergency_contact_phone || null,
      allergies: form.allergies || null,
      medical_history: form.medical_history || null,
    };
    if (editingPatient) {
      const { error } = await supabase.from('patients').update(payload).eq('id', editingPatient.id);
      if (error) { console.error(error); return; }
    } else {
      // patient_code is generated server-side by the set_patient_code trigger (003_functions.sql) —
      // the generated Insert type doesn't know that, so it's asserted here rather than provided.
      const { error } = await supabase.from('patients').insert(payload as unknown as typeof payload & { patient_code: string });
      if (error) { console.error(error); return; }
    }
    setShowModal(false);
    fetchPatients();
  }

  // patients cascades (ON DELETE CASCADE, 001_schema.sql) into appointments,
  // admissions, prescriptions, lab_orders, and invoices -- five tables, so
  // one accidental delete could erase a patient's entire medical and
  // billing history in one action. Blocked outright if any dependent
  // records exist; password re-authentication required for the genuinely-
  // safe case (matches DoctorsPage.tsx's pattern).
  async function handleDeleteClick(patient: Patient) {
    setDeleteError('');
    const [
      { count: appointments }, { count: admissions }, { count: prescriptions },
      { count: labOrders }, { count: invoices },
    ] = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('patient_id', patient.id),
      supabase.from('admissions').select('id', { count: 'exact', head: true }).eq('patient_id', patient.id),
      supabase.from('prescriptions').select('id', { count: 'exact', head: true }).eq('patient_id', patient.id),
      supabase.from('lab_orders').select('id', { count: 'exact', head: true }).eq('patient_id', patient.id),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('patient_id', patient.id),
    ]);
    const counts = {
      Appointments: appointments || 0, Admissions: admissions || 0, Prescriptions: prescriptions || 0,
      'Lab Orders': labOrders || 0, Invoices: invoices || 0,
    };
    if (Object.values(counts).some(c => c > 0)) {
      setDeleteBlockedInfo({ patient, counts });
      return;
    }
    setDeleteTarget(patient);
    setShowReauth(true);
  }

  async function handleConfirmedDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setShowReauth(false);
    const { error } = await supabase.from('patients').delete().eq('id', target.id);
    if (error) {
      setDeleteError(`Could not delete ${target.full_name}. Please try again.`);
      console.error(error);
    }
    setDeleteTarget(null);
    fetchPatients();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
          <p className="text-gray-500">Manage patient records</p>
        </div>
        {isReceptionist() && (
          <button onClick={() => openModal()} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Register Patient
          </button>
        )}
      </div>

      <div className="card">
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by name, code, or phone..." />
        </div>

        {loading ? (
          <div className="py-12 text-center">Loading patients...</div>
        ) : patients.length === 0 ? (
          <EmptyState title="No patients found" description={search ? 'Try a different search term' : 'Register your first patient to get started'} action={isReceptionist() ? <button onClick={() => openModal()} className="btn-primary"><Plus className="h-4 w-4 mr-2" /> Register Patient</button> : undefined} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Patient</th>
                  <th className="table-header">Code</th>
                  <th className="table-header">Contact</th>
                  <th className="table-header">Gender</th>
                  <th className="table-header">Blood Group</th>
                  <th className="table-header">Registered</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100">
                          <User className="h-4 w-4 text-primary-600" />
                        </div>
                        <span className="font-medium text-gray-900">{p.full_name}</span>
                      </div>
                    </td>
                    <td className="table-cell font-mono text-xs">{p.patient_code}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1 text-gray-600">
                        <Phone className="h-3 w-3" />
                        {p.phone}
                      </div>
                    </td>
                    <td className="table-cell capitalize">{p.gender || '-'}</td>
                    <td className="table-cell">
                      {p.blood_group ? <span className="badge bg-red-50 text-red-700">{p.blood_group}</span> : '-'}
                    </td>
                    <td className="table-cell text-gray-500">{p.created_at ? formatDate(p.created_at) : '-'}</td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => navigate(`/patients/${p.id}`)} className="p-1 text-gray-400 hover:text-primary-600">
                          <Eye className="h-4 w-4" />
                        </button>
                        {isReceptionist() && (
                          <>
                            <button onClick={() => openModal(p)} className="p-1 text-gray-400 hover:text-blue-600">
                              <Edit className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDeleteClick(p)} className="p-1 text-gray-400 hover:text-red-600">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingPatient ? 'Edit Patient' : 'Register Patient'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Full Name *</label>
              <input required value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} className="input" />
            </div>
            <div>
              <label className="label">Phone *</label>
              <input required value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input" />
            </div>
            <div>
              <label className="label">Date of Birth</label>
              <input type="date" value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} className="input" />
            </div>
            <div>
              <label className="label">Gender</label>
              <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})} className="input">
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Blood Group</label>
              <select value={form.blood_group} onChange={e => setForm({...form, blood_group: e.target.value})} className="input">
                <option value="">Select</option>
                {BLOOD_GROUPS.map(bg => <option key={bg} value={bg}>{bg}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input min-h-[60px]" />
            </div>
            <div>
              <label className="label">Emergency Contact Name</label>
              <input value={form.emergency_contact_name} onChange={e => setForm({...form, emergency_contact_name: e.target.value})} className="input" />
            </div>
            <div>
              <label className="label">Emergency Contact Phone</label>
              <input value={form.emergency_contact_phone} onChange={e => setForm({...form, emergency_contact_phone: e.target.value})} className="input" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Allergies</label>
              <textarea value={form.allergies} onChange={e => setForm({...form, allergies: e.target.value})} className="input min-h-[60px]" placeholder="List any known allergies..." />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Medical History</label>
              <textarea value={form.medical_history} onChange={e => setForm({...form, medical_history: e.target.value})} className="input min-h-[60px]" placeholder="Previous conditions, surgeries, etc." />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editingPatient ? 'Update' : 'Register'}</button>
          </div>
        </form>
      </Modal>

      {deleteError && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg">{deleteError}</div>
      )}

      <Modal isOpen={!!deleteBlockedInfo} onClose={() => setDeleteBlockedInfo(null)} title="Can't Delete Patient" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {deleteBlockedInfo?.patient.full_name} has dependent records that would be permanently erased:
          </p>
          <ul className="space-y-1 text-sm">
            {deleteBlockedInfo && Object.entries(deleteBlockedInfo.counts).filter(([, c]) => c > 0).map(([label, c]) => (
              <li key={label} className="flex justify-between rounded bg-gray-50 px-3 py-1.5">
                <span className="text-gray-700">{label}</span><span className="font-medium text-gray-900">{c}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => setDeleteBlockedInfo(null)} className="btn-primary w-full">Understood</button>
        </div>
      </Modal>

      <ReauthModal
        isOpen={showReauth}
        onClose={() => { setShowReauth(false); setDeleteTarget(null); }}
        onVerified={handleConfirmedDelete}
        email={user?.email || ''}
        title="Confirm Patient Deletion"
        message={`This will permanently delete ${deleteTarget?.full_name} and cannot be undone. Re-enter your password to confirm.`}
      />
    </div>
  );
}
