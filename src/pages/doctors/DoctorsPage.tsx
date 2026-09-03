import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ReauthModal } from '@/components/ui/ReauthModal';
import type { Doctor, Department } from '@/types';
import { Plus, Stethoscope, Eye, Power, Edit, Clock, IndianRupee, Trash2 } from 'lucide-react';
import { formatCurrency, DAYS_OF_WEEK, normalizeSpecialization } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

export function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Doctor | null>(null);
  const [formError, setFormError] = useState('');
  const [toggleError, setToggleError] = useState(''); 
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [specializationFilter, setSpecializationFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Doctor | null>(null);
  const [deleteBlockedInfo, setDeleteBlockedInfo] = useState<{ doctor: Doctor; appointments: number; prescriptions: number } | null>(null);
  const [showReauth, setShowReauth] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const navigate = useNavigate();
  const { isAdmin } = useRole();
  const { user } = useAuth();

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', department_id: '',
    specialization: '', qualification: '', registration_no: '', consultation_fee: '', experience_years: '',
    available_days: [] as string[], available_time_start: '', available_time_end: '', is_active: true
  });

  useEffect(() => { fetchData(); }, [debouncedSearch]);

  async function fetchData() {
    setLoading(true);
    const [{ data: d }, { data: depts }] = await Promise.all([
      supabase.from('doctors').select('*, department:departments(name)').order('full_name'), // includes qualification & registration_no via '*'
      supabase.from('departments').select('*').order('name')
    ]);
    setDoctors((d || []) as unknown as Doctor[]);
    setDepartments(depts || []);
    setLoading(false);
  }

  function openModal(doctor?: Doctor) {
    if (doctor) {
      setEditingDoctor(doctor);
      setForm({
        full_name: doctor.full_name, email: doctor.email || '', phone: doctor.phone || '',
        department_id: doctor.department_id || '', specialization: doctor.specialization || '',
        qualification: doctor.qualification || '', registration_no: doctor.registration_no || '',
        consultation_fee: doctor.consultation_fee.toString(), experience_years: doctor.experience_years.toString(),
        available_days: doctor.available_days || [], available_time_start: doctor.available_time_start || '',
        available_time_end: doctor.available_time_end || '', is_active: doctor.is_active
      });
    } else {
      setEditingDoctor(null);
      setForm({ full_name: '', email: '', phone: '', department_id: '', specialization: '', qualification: '', registration_no: '', consultation_fee: '', experience_years: '', available_days: [], available_time_start: '', available_time_end: '', is_active: true });
    }
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    // Native `required` on individual inputs covers most fields, but the
    // Available Days checkbox group has no single input to attach it to,
    // and "end time after start time" needs cross-field comparison HTML
    // validation can't express - both are checked here before the request.
    if (form.available_days.length === 0) {
      setFormError('Select at least one available day.');
      return;
    }
    if (form.available_time_start && form.available_time_end && form.available_time_end <= form.available_time_start) {
      setFormError('Available To must be after Available From.');
      return;
    }
    const payload = {
      ...form,
      specialization: normalizeSpecialization(form.specialization),
      consultation_fee: parseFloat(form.consultation_fee) || 0,
      experience_years: parseInt(form.experience_years) || 0,
    };
    const { error } = editingDoctor
      ? await supabase.from('doctors').update(payload).eq('id', editingDoctor.id)
      : await supabase.from('doctors').insert(payload);
    if (error) {
      setFormError(error.code === '23505' ? 'A doctor with this email already exists.' : 'Could not save doctor. Please try again.');
      console.error(error);
      return;
    }
    setShowModal(false);
    fetchData();
  }

  // Doctors are deactivated, never hard-deleted: appointments.doctor_id and
  // prescriptions.doctor_id are ON DELETE CASCADE, so a real DELETE here would
  // silently wipe every appointment/prescription this doctor ever had.
  async function handleToggleActive() {
    if (!toggleTarget) return;
    setToggleError('');
    const { error } = await supabase.from('doctors').update({ is_active: !toggleTarget.is_active }).eq('id', toggleTarget.id);
    if (error) {
      setToggleError(`Could not ${toggleTarget.is_active ? 'deactivate' : 'activate'} Dr. ${toggleTarget.full_name}. Please try again.`);
      console.error(error);
      setToggleTarget(null);
      return;
    }
    setToggleTarget(null);
    fetchData();
  }

  // Hard delete stays blocked while a doctor has real history (mirrors why
  // the delete button became deactivate/activate in the first place -
  // appointments.doctor_id and prescriptions.doctor_id are ON DELETE CASCADE,
  // so deleting a doctor with either would silently wipe that history).
  // Only offered as an option for a doctor added in error with zero
  // appointments and zero prescriptions - genuinely nothing to lose.
  async function handleDeleteClick(doctor: Doctor) {
    setDeleteError('');
    const [{ count: appointmentCount }, { count: prescriptionCount }] = await Promise.all([
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('doctor_id', doctor.id),
      supabase.from('prescriptions').select('id', { count: 'exact', head: true }).eq('doctor_id', doctor.id),
    ]);
    if ((appointmentCount || 0) > 0 || (prescriptionCount || 0) > 0) {
      setDeleteBlockedInfo({ doctor, appointments: appointmentCount || 0, prescriptions: prescriptionCount || 0 });
      return;
    }
    setDeleteTarget(doctor);
    setShowReauth(true);
  }

  async function handleConfirmedDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setShowReauth(false);
    const { error } = await supabase.from('doctors').delete().eq('id', target.id);
    if (error) {
      setDeleteError(`Could not delete Dr. ${target.full_name}. Please try again.`);
      console.error(error);
      setDeleteTarget(null);
      return;
    }
    setDeleteTarget(null);
    fetchData();
  }

  const specializations = Array.from(
    new Set(doctors.map(d => d.specialization).filter((s): s is string => !!s))
  ).sort();

  const filteredDoctors = doctors.filter(d => {
    const matchesSearch = !debouncedSearch ||
      d.full_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      d.specialization?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      d.department?.name?.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesDepartment = !departmentFilter || d.department_id === departmentFilter;
    const matchesSpecialization = !specializationFilter || d.specialization === specializationFilter;
    return matchesSearch && matchesDepartment && matchesSpecialization;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Doctors</h1>
          <p className="text-gray-500">Manage doctors and departments</p>
        </div>
        {isAdmin() && (
          <button onClick={() => openModal()} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Add Doctor
          </button>
        )}
      </div>

      {toggleError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center justify-between">
          {toggleError}
          <button onClick={() => setToggleError('')} className="ml-3 text-red-400 hover:text-red-600">✕</button>
        </p>
      )}

      {deleteError && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center justify-between">
          {deleteError}
          <button onClick={() => setDeleteError('')} className="ml-3 text-red-400 hover:text-red-600">✕</button>
        </p>
      )}

      <div className="card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1"><SearchInput value={search} onChange={setSearch} placeholder="Search doctors..." /></div>
          <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="input w-auto">
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}{!d.is_active ? ' (Inactive)' : ''}</option>)}
          </select>
          <select value={specializationFilter} onChange={e => setSpecializationFilter(e.target.value)} className="input w-auto">
            <option value="">All Specializations</option>
            {specializations.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {loading ? <div className="py-12 text-center">Loading...</div> :
        doctors.length === 0 ? <EmptyState title="No doctors found" description="Add a doctor first." /> :
        filteredDoctors.length === 0 ? <EmptyState title="No doctors match your search/filter" /> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDoctors.map((d) => (
              <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100">
                    <Stethoscope className="h-6 w-6 text-primary-600" />
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => navigate(`/doctors/${d.id}`)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-gray-50">
                      <Eye className="h-4 w-4" />
                    </button>
                    {isAdmin() && (
                      <>
                        <button onClick={() => openModal(d)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-gray-50">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => setToggleTarget(d)} className={`p-1.5 rounded-lg hover:bg-gray-50 ${d.is_active ? 'text-gray-400 hover:text-red-600' : 'text-gray-400 hover:text-green-600'}`} title={d.is_active ? 'Deactivate' : 'Activate'}>
                          <Power className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDeleteClick(d)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-50" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">{d.full_name}</h3>
                <p className="text-sm text-primary-600">{d.specialization}</p>
                <p className="text-xs text-gray-500">{d.department?.name}{d.qualification ? ` · ${d.qualification}` : ''}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                  <span className="flex items-center gap-1"> {formatCurrency(d.consultation_fee)}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {d.experience_years} yrs</span>
                </div>
                {d.available_days?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {d.available_days.map(day => (
                      <span key={day} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{day.slice(0,3)}</span>
                    ))}
                  </div>
                )}
                <span className={`mt-3 inline-block badge ${d.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {d.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingDoctor ? 'Edit Doctor' : 'Add Doctor'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="label">Full Name *</label><input required value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} className="input" /></div>
            <div><label className="label">Email *</label><input type="email" required value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input" /></div>
            <div><label className="label">Phone *</label><input required pattern="[0-9]{10}" title="10-digit phone number" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input" /></div>
            <div>
              <label className="label">Department *</label>
              <select required value={form.department_id} onChange={e => setForm({...form, department_id: e.target.value})} className="input">
                <option value="">Select Department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}{!d.is_active ? ' (Inactive)' : ''}</option>)}
              </select>
              {departments.length === 0 && <p className="mt-1 text-xs text-red-500">No departments found. Add a department first.</p>}
            </div>
            <div>
              <label className="label">Specialization</label>
              <input list="specialization-suggestions" value={form.specialization}
                onChange={e => setForm({...form, specialization: e.target.value})} className="input" />
              <datalist id="specialization-suggestions">
                {specializations.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div><label className="label">Qualification</label><input value={form.qualification} onChange={e => setForm({...form, qualification: e.target.value})} className="input" placeholder="e.g. MBBS, MD (Medicine)" /></div>
            <div><label className="label">Registration No.</label><input value={form.registration_no} onChange={e => setForm({...form, registration_no: e.target.value})} className="input" placeholder="e.g. UPMC/2014/12345" /></div>
            <div><label className="label">Consultation Fee (₹) *</label><input type="number" required min="0" step="0.01" value={form.consultation_fee} onChange={e => setForm({...form, consultation_fee: e.target.value})} className="input" /></div>
            <div><label className="label">Experience (Years)</label><input type="number" value={form.experience_years} onChange={e => setForm({...form, experience_years: e.target.value})} className="input" /></div>
            <div><label className="label">Available From *</label><input type="time" required value={form.available_time_start} onChange={e => setForm({...form, available_time_start: e.target.value})} className="input" /></div>
            <div><label className="label">Available To *</label><input type="time" required value={form.available_time_end} onChange={e => setForm({...form, available_time_end: e.target.value})} className="input" /></div>
            <div className="sm:col-span-2">
              <label className="label">Available Days *</label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK.map(day => (
                  <label key={day} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors ${form.available_days.includes(day) ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <input type="checkbox" className="sr-only" checked={form.available_days.includes(day)} onChange={e => {
                      setForm({...form, available_days: e.target.checked ? [...form.available_days, day] : form.available_days.filter(d => d !== day)});
                    }} />
                    {day}
                  </label>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({...form, is_active: e.target.checked})} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              <label htmlFor="is_active" className="text-sm text-gray-700">Active</label>
            </div>
          </div>
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowModal(false); setFormError(''); }} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editingDoctor ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleActive}
        title={toggleTarget?.is_active ? 'Deactivate Doctor' : 'Activate Doctor'}
        message={toggleTarget?.is_active
          ? `Deactivate Dr. ${toggleTarget?.full_name}? Their appointment/prescription history is kept, they just won't be selectable for new bookings.`
          : `Activate Dr. ${toggleTarget?.full_name} again?`}
        confirmText={toggleTarget?.is_active ? 'Deactivate' : 'Activate'}
        isDanger={toggleTarget?.is_active}
      />

      <Modal isOpen={!!deleteBlockedInfo} onClose={() => setDeleteBlockedInfo(null)} title="Can't Delete Doctor" size="sm">
        <div className="flex flex-col items-center text-center space-y-3">
          <p className="text-sm text-gray-600">
            Dr. {deleteBlockedInfo?.doctor.full_name} has {deleteBlockedInfo?.appointments} appointment(s) and{' '}
            {deleteBlockedInfo?.prescriptions} prescription(s) on record. Deleting would permanently erase that
            history, so it's blocked. Use Deactivate instead - the doctor is hidden from new bookings but their
            history stays intact.
          </p>
          <button onClick={() => setDeleteBlockedInfo(null)} className="btn-primary w-full">Understood</button>
        </div>
      </Modal>

      <ReauthModal
        isOpen={showReauth}
        onClose={() => { setShowReauth(false); setDeleteTarget(null); }}
        onVerified={handleConfirmedDelete}
        email={user?.email || ''}
        title="Confirm Doctor Deletion"
        message={`This will permanently delete Dr. ${deleteTarget?.full_name}. Re-enter your password to confirm.`}
      />
    </div>
  );
}