import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Appointment, Patient, Doctor } from '@/types';
import { Plus, User, Stethoscope, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { formatDate, formatTime, getStatusColor, TIME_SLOTS } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

export function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [filterDate, setFilterDate] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { user } = useAuth();
  const { isReceptionist, isDoctor } = useRole();

  const [form, setForm] = useState({ patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', notes: '' });

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

    const [{ data: p }, { data: d }] = await Promise.all([
      supabase.from('patients').select('id, full_name').order('full_name'),
      supabase.from('doctors').select('id, full_name, available_days, available_time_start, available_time_end').eq('is_active', true).order('full_name')
    ]);
    setPatients((p || []) as unknown as Patient[]);
    setDoctors((d || []) as unknown as Doctor[]);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from('appointments').insert({ ...form, created_by: user?.id });
    setShowModal(false);
    setForm({ patient_id: '', doctor_id: '', appointment_date: '', appointment_time: '', notes: '' });
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

  const getAvailableSlots = () => {
    if (!form.doctor_id || !form.appointment_date) return TIME_SLOTS;
    const doctor = doctors.find(d => d.id === form.doctor_id);
    if (!doctor) return TIME_SLOTS;
    const dayName = new Date(form.appointment_date).toLocaleDateString('en-US', { weekday: 'long' });
    if (!doctor.available_days?.includes(dayName)) return [];
    const start = doctor.available_time_start;
    const end = doctor.available_time_end;
    return TIME_SLOTS.filter(slot => {
      if (start && slot < start) return false;
      if (end && slot > end) return false;
      return true;
    });
  };

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

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Book Appointment">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Patient *</label>
            <select required value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} className="input">
              <option value="">Select Patient</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Doctor *</label>
            <select required value={form.doctor_id} onChange={e => setForm({...form, doctor_id: e.target.value, appointment_time: ''})} className="input">
              <option value="">Select Doctor</option>
              {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date *</label>
            <input type="date" required value={form.appointment_date} onChange={e => setForm({...form, appointment_date: e.target.value, appointment_time: ''})} className="input" min={new Date().toISOString().split('T')[0]} />
          </div>
          <div>
            <label className="label">Time Slot *</label>
            <select required value={form.appointment_time} onChange={e => setForm({...form, appointment_time: e.target.value})} className="input">
              <option value="">Select Time</option>
              {getAvailableSlots().map(t => <option key={t} value={t}>{formatTime(t)}</option>)}
            </select>
            {form.doctor_id && form.appointment_date && getAvailableSlots().length === 0 && (
              <p className="mt-1 text-xs text-red-500">Doctor not available on this day</p>
            )}
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
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
