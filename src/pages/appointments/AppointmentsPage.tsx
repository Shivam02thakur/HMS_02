import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Appointment, Patient, Doctor, Department } from '@/types';
import { Plus, User, Stethoscope, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { formatDate, formatTime, getStatusColor, TIME_SLOTS } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [filterDate, setFilterDate] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { user } = useAuth();
  const { isReceptionist, isDoctor } = useRole();

  const [form, setForm] = useState({ department_id: '', patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', notes: '' });

  useEffect(() => { fetchData(); }, [debouncedSearch, filterDate]);

  async function fetchData() {
    setLoading(true);
    let query = supabase.from('appointments').select('*, patient:patients(*), doctor:doctors(*)').order('appointment_date', { ascending: false }).order('appointment_time');
    if (filterDate) query = query.eq('appointment_date', filterDate);
    const { data } = await query;
    let filtered = (data || []) as unknown as Appointment[];
    if (debouncedSearch) {
      filtered = filtered.filter(a =>
        a.patient?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        a.doctor?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
    }
    setAppointments(filtered);

    const [{ data: p }, { data: d }, { data: dept }] = await Promise.all([
      supabase.from('patients').select('id, full_name').order('full_name'),
      supabase.from('doctors').select('id, full_name, department_id, available_days, available_time_start, available_time_end').eq('is_active', true).order('full_name'),
      supabase.from('departments').select('id, name').eq('is_active', true).order('name')
    ]);
    setPatients((p || []) as unknown as Patient[]);
    setDoctors((d || []) as unknown as Doctor[]);
    setDepartments((dept || []) as unknown as Department[]);
    setLoading(false);
  }

  // Re-fetch which slots are already taken every time the doctor or date
  // changes, so the dropdown reflects reality. This is a UX convenience only
  // (it narrows what's shown) — the actual guard against double-booking is
  // the unique index added in migration 006; see handleSubmit's catch block.
  useEffect(() => {
    async function fetchBookedTimes() {
      if (!form.doctor_id || !form.appointment_date) { setBookedTimes([]); return; }
      const { data } = await supabase.from('appointments')
        .select('appointment_time')
        .eq('doctor_id', form.doctor_id)
        .eq('appointment_date', form.appointment_date)
        .in('status', ['BOOKED', 'COMPLETED']);
      setBookedTimes((data || []).map((a: { appointment_time: string }) => a.appointment_time));
    }
    fetchBookedTimes();
  }, [form.doctor_id, form.appointment_date]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const { department_id, ...payload } = form; // department_id is UI-only, not a column on appointments
    const { error } = await supabase.from('appointments').insert({ ...payload, created_by: user?.id });
    if (error) {
      // 23505 = unique_violation. Two people raced for the same doctor/date/time
      // and the DB-level unique index from migration 006 caught it. This should
      // be rare (the dropdown already hides taken slots) but is the actual
      // guarantee, not the UI filtering.
      if (error.code === '23505') {
        setFormError('That slot was just booked by someone else. Pick another time.');
        const { data } = await supabase.from('appointments').select('appointment_time')
          .eq('doctor_id', form.doctor_id).eq('appointment_date', form.appointment_date)
          .in('status', ['BOOKED', 'COMPLETED']);
        setBookedTimes((data || []).map((a: { appointment_time: string }) => a.appointment_time));
        setForm(f => ({ ...f, appointment_time: '' }));
      } else {
        setFormError('Could not book the appointment. Please try again.');
      }
      return;
    }
    setShowModal(false);
    setForm({ department_id: '', patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', notes: '' });
    fetchData();
  }

  async function updateStatus(id: string, status: 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW') {
    await supabase.from('appointments').update({ status }).eq('id', id);
    fetchData();
  }

  function openCompleteModal(appt: Appointment) {
    setSelectedAppointment(appt);
    setShowCompleteModal(true);
  }

  function getSlotInfo(): { slots: string[]; reason: string | null } {
    if (!form.doctor_id || !form.appointment_date) return { slots: [], reason: null };
    const doctor = doctors.find(d => d.id === form.doctor_id);
    if (!doctor) return { slots: [], reason: null };
    const dayName = new Date(form.appointment_date).toLocaleDateString('en-US', { weekday: 'long' });
    if (!doctor.available_days?.includes(dayName)) {
      return { slots: [], reason: 'Doctor is not available on this day.' };
    }
    const start = doctor.available_time_start;
    const end = doctor.available_time_end;
    const slots = TIME_SLOTS.filter(slot => {
      if (start && slot < start) return false;
      if (end && slot > end) return false;
      if (bookedTimes.includes(slot)) return false; // already taken for this doctor/date
      return true;
    });
    return { slots, reason: slots.length === 0 ? 'Fully booked — no open slots left for this date.' : null };
  }

  const filteredDoctorsForBooking = form.department_id ? doctors.filter(d => d.department_id === form.department_id) : doctors;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Appointments</h1>
          <p className="text-gray-500">Manage patient appointments</p>
        </div>
        {isReceptionist() && (
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Book Appointment
          </button>
        )}
      </div>

      <div className="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1"><SearchInput value={search} onChange={setSearch} placeholder="Search appointments..." /></div>
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="input w-auto" />
          {filterDate && <button onClick={() => setFilterDate('')} className="text-sm text-gray-500 hover:text-gray-700">Clear</button>}
        </div>

        {loading ? <div className="py-12 text-center">Loading...</div> :
        appointments.length === 0 ? <EmptyState title="No appointments found" /> : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Patient</th>
                  <th className="table-header">Doctor</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Time</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">{a.patient?.full_name}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-gray-400" />
                        Dr. {a.doctor?.full_name}
                      </div>
                    </td>
                    <td className="table-cell">{formatDate(a.appointment_date)}</td>
                    <td className="table-cell">{formatTime(a.appointment_time)}</td>
                    <td className="table-cell"><span className={`badge ${getStatusColor(a.status)}`}>{a.status}</span></td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        {a.status === 'BOOKED' && isDoctor() && (
                          <button onClick={() => openCompleteModal(a)} className="p-1.5 text-green-600 hover:bg-green-50 rounded" title="Complete">
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        )}
                        {a.status === 'BOOKED' && (
                          <button onClick={() => updateStatus(a.id, 'CANCELLED')} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Cancel">
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                        {a.status === 'BOOKED' && (
                          <button onClick={() => updateStatus(a.id, 'NO_SHOW')} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded" title="No Show">
                            <AlertCircle className="h-4 w-4" />
                          </button>
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

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setFormError(''); }} title="Book Appointment">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Patient *</label>
            <select required value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} className="input">
              <option value="">Select Patient</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Department</label>
            <select value={form.department_id} onChange={e => setForm({...form, department_id: e.target.value, doctor_id: '', appointment_time: ''})} className="input">
              <option value="">All Departments</option>
              {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
            </select>
            {departments.length === 0 && <p className="mt-1 text-xs text-red-500">No departments found.</p>}
          </div>
          <div>
            <label className="label">Doctor *</label>
            <select required value={form.doctor_id} onChange={e => setForm({...form, doctor_id: e.target.value, appointment_time: ''})} className="input">
              <option value="">Select Doctor</option>
              {filteredDoctorsForBooking.map(d => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}
            </select>
            {doctors.length === 0 && <p className="mt-1 text-xs text-red-500">No doctors found. Add a doctor first.</p>}
            {doctors.length > 0 && filteredDoctorsForBooking.length === 0 && (
              <p className="mt-1 text-xs text-red-500">No doctors in this department.</p>
            )}
          </div>
          <div>
            <label className="label">Date *</label>
            <input type="date" required value={form.appointment_date} onChange={e => setForm({...form, appointment_date: e.target.value, appointment_time: ''})} className="input" min={new Date().toISOString().split('T')[0]} />
          </div>
          <div>
            <label className="label">Time Slot *</label>
            <select required value={form.appointment_time} onChange={e => setForm({...form, appointment_time: e.target.value})} className="input" disabled={!form.doctor_id || !form.appointment_date}>
              <option value="">{!form.doctor_id || !form.appointment_date ? 'Select doctor and date first' : 'Select Time'}</option>
              {getSlotInfo().slots.map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
            </select>
            {getSlotInfo().reason && (
              <p className="mt-1 text-xs text-red-500">{getSlotInfo().reason}</p>
            )}
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input" rows={2} />
          </div>
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowModal(false); setFormError(''); }} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Book Appointment</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showCompleteModal} onClose={() => setShowCompleteModal(false)} title="Complete Appointment">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Complete consultation for <strong>{selectedAppointment?.patient?.full_name}</strong> with Dr. {selectedAppointment?.doctor?.full_name}?</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowCompleteModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={async () => {
              if (selectedAppointment) {
                await updateStatus(selectedAppointment.id, 'COMPLETED');
                setShowCompleteModal(false);
              }
            }} className="btn-primary">Complete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
