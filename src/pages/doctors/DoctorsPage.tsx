import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Doctor, Department } from '@/types';
import { Plus, Stethoscope, Eye, Power, Edit, Clock, IndianRupee } from 'lucide-react';
import { formatCurrency, DAYS_OF_WEEK } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

export function DoctorsPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<Doctor | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Doctor | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const navigate = useNavigate();
  const { isAdmin } = useRole();

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', department_id: '',
    specialization: '', consultation_fee: '', experience_years: '',
    available_days: [] as string[], available_time_start: '', available_time_end: '', is_active: true
  });

  useEffect(() => { fetchData(); }, [debouncedSearch]);

  async function fetchData() {
    setLoading(true);
    const [{ data: d }, { data: depts }] = await Promise.all([
      supabase.from('doctors').select('*, department:departments(name)').order('full_name'),
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
        consultation_fee: doctor.consultation_fee.toString(), experience_years: doctor.experience_years.toString(),
        available_days: doctor.available_days || [], available_time_start: doctor.available_time_start || '',
        available_time_end: doctor.available_time_end || '', is_active: doctor.is_active
      });
    } else {
      setEditingDoctor(null);
      setForm({ full_name: '', email: '', phone: '', department_id: '', specialization: '', consultation_fee: '', experience_years: '', available_days: [], available_time_start: '', available_time_end: '', is_active: true });
    }
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      consultation_fee: parseFloat(form.consultation_fee) || 0,
      experience_years: parseInt(form.experience_years) || 0,
    };
    if (editingDoctor) {
      await supabase.from('doctors').update(payload).eq('id', editingDoctor.id);
    } else {
      await supabase.from('doctors').insert(payload);
    }
    setShowModal(false);
    fetchData();
  }

  // Doctors are deactivated, never hard-deleted: appointments.doctor_id and
  // prescriptions.doctor_id are ON DELETE CASCADE, so a real DELETE here would
  // silently wipe every appointment/prescription this doctor ever had.
  async function handleToggleActive() {
    if (!toggleTarget) return;
    await supabase.from('doctors').update({ is_active: !toggleTarget.is_active }).eq('id', toggleTarget.id);
    setToggleTarget(null);
    fetchData();
  }

  const filteredDoctors = doctors.filter(d => {
    const matchesSearch = !debouncedSearch ||
      d.full_name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      d.specialization?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      d.department?.name?.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesDepartment = !departmentFilter || d.department_id === departmentFilter;
    return matchesSearch && matchesDepartment;
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

      <div className="card">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1"><SearchInput value={search} onChange={setSearch} placeholder="Search doctors..." /></div>
          <select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)} className="input w-auto">
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}{!d.is_active ? ' (Inactive)' : ''}</option>)}
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
                      </>
                    )}
                  </div>
                </div>
                <h3 className="mt-3 text-lg font-semibold text-gray-900">{d.full_name}</h3>
                <p className="text-sm text-primary-600">{d.specialization}</p>
                <p className="text-xs text-gray-500">{d.department?.name}</p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-gray-600">
                  <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" /> {formatCurrency(d.consultation_fee)}</span>
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
            <div><label className="label">Email</label><input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="input" /></div>
            <div><label className="label">Phone</label><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input" /></div>
            <div>
              <label className="label">Department</label>
              <select value={form.department_id} onChange={e => setForm({...form, department_id: e.target.value})} className="input">
                <option value="">Select Department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}{!d.is_active ? ' (Inactive)' : ''}</option>)}
              </select>
              {departments.length === 0 && <p className="mt-1 text-xs text-red-500">No departments found. Add a department first.</p>}
            </div>
            <div><label className="label">Specialization</label><input value={form.specialization} onChange={e => setForm({...form, specialization: e.target.value})} className="input" /></div>
            <div><label className="label">Consultation Fee (₹)</label><input type="number" value={form.consultation_fee} onChange={e => setForm({...form, consultation_fee: e.target.value})} className="input" /></div>
            <div><label className="label">Experience (Years)</label><input type="number" value={form.experience_years} onChange={e => setForm({...form, experience_years: e.target.value})} className="input" /></div>
            <div><label className="label">Available From</label><input type="time" value={form.available_time_start} onChange={e => setForm({...form, available_time_start: e.target.value})} className="input" /></div>
            <div><label className="label">Available To</label><input type="time" value={form.available_time_end} onChange={e => setForm({...form, available_time_end: e.target.value})} className="input" /></div>
            <div className="sm:col-span-2">
              <label className="label">Available Days</label>
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
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
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
    </div>
  );
}