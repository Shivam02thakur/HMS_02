import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/hooks/useRole';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Admission, Patient, Doctor, Bed, Ward, Room, Department } from '@/types';
import { findOrCreateEpisodeInvoice, billClosedWardSegment, closeEpisode } from '@/lib/billing';
import { Plus, ArrowLeft, ArrowRightLeft } from 'lucide-react';
import { formatDate, getStatusColor } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';

export function AdmissionsPage() {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [vacantBeds, setVacantBeds] = useState<Bed[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<Admission | null>(null);
  const [formError, setFormError] = useState('');
  const [transferError, setTransferError] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { isReceptionist } = useRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);

  const [form, setForm] = useState({
    department_id: '', patient_id: '', doctor_id: '', ward_id: '', room_id: '', bed_id: '', diagnosis: '', notes: ''
  });

  // Separate ward/room/bed selection state for the Transfer modal, so it
  // doesn't collide with the Admit modal's own `form` state.
  const [transferForm, setTransferForm] = useState({ ward_id: '', room_id: '', bed_id: '' });
  const [transferRooms, setTransferRooms] = useState<Room[]>([]);
  const [transferBeds, setTransferBeds] = useState<Bed[]>([]);

  useEffect(() => { fetchData(); }, [debouncedSearch]);

  // Rooms load whenever the selected ward changes
  useEffect(() => {
    if (!form.ward_id) { setRooms([]); return; }
    supabase.from('rooms').select('*').eq('ward_id', form.ward_id).eq('is_active', true)
      .order('room_number').then(({ data }) => setRooms((data || []) as unknown as Room[]));
  }, [form.ward_id]);

  // Vacant beds load whenever the selected room changes
  useEffect(() => {
    if (!form.room_id) { setVacantBeds([]); return; }
    supabase.from('beds').select('*, room:rooms(room_number), ward:wards(name)')
      .eq('room_id', form.room_id).eq('status', 'VACANT').order('bed_number')
      .then(({ data }) => setVacantBeds((data || []) as unknown as Bed[]));
  }, [form.room_id]);

  useEffect(() => {
    if (!transferForm.ward_id) { setTransferRooms([]); return; }
    supabase.from('rooms').select('*').eq('ward_id', transferForm.ward_id).eq('is_active', true)
      .order('room_number').then(({ data }) => setTransferRooms((data || []) as unknown as Room[]));
  }, [transferForm.ward_id]);

  useEffect(() => {
    if (!transferForm.room_id) { setTransferBeds([]); return; }
    supabase.from('beds').select('*, room:rooms(room_number), ward:wards(name)')
      .eq('room_id', transferForm.room_id).eq('status', 'VACANT').order('bed_number')
      .then(({ data }) => setTransferBeds((data || []) as unknown as Bed[]));
  }, [transferForm.room_id]);

  async function fetchData() {
    setLoading(true);
    const query = supabase.from('admissions').select('*, patient:patients(full_name), doctor:doctors(full_name), bed:beds(bed_number, room:rooms(room_number), ward:wards(name))').order('admission_date', { ascending: false });
    const { data } = await query;
    let filtered = (data || []) as unknown as Admission[];
    if (debouncedSearch) {
      filtered = filtered.filter(a => a.patient?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()));
    }
    setAdmissions(filtered);

    const [{ data: p }, { data: d }, { data: dep }, { data: w }] = await Promise.all([
    supabase.from('patients').select('id, full_name, admissions!left(status)').order('full_name'),
    supabase.from('doctors').select('id, full_name, department_id').eq('is_active', true).order('full_name'),
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
    supabase.from('wards').select('id, name, ward_type, capacity').order('name')
  ]);

    const availablePatients = (p || []).filter(
      (pt: any) => !pt.admissions?.some((a: any) => a.status === 'ADMITTED')
    );

    setPatients(availablePatients as unknown as Patient[]);
    setDoctors((d || []) as unknown as Doctor[]);
    setDepartments((dep || []) as unknown as Department[]);
    setWards((w || []) as unknown as Ward[]);
    setLoading(false);
  }

  const filteredDoctorsForAdmission = form.department_id
  ? doctors.filter(d => d.department_id === form.department_id)
  : doctors;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const { data: admission, error } = await supabase.from('admissions').insert({
      patient_id: form.patient_id,
      doctor_id: form.doctor_id || undefined,
      bed_id: form.bed_id || undefined,
      diagnosis: form.diagnosis,
      notes: form.notes,
      status: 'ADMITTED'
    }).select().single();
    if (error || !admission) {
      if (error?.code === '23505') {
        setFormError('That bed or patient was just taken by another admission. Refresh and pick again.');
      } else {
        setFormError('Could not admit patient. Please try again.');
      }
      console.error(error);
      return;
    }
    // Ready to receive any charge from minute one, even though the first
    // ward segment's own charge isn't computed until it closes (transfer
    // or discharge).
    const episodeResult = await findOrCreateEpisodeInvoice(
      { episode_type: 'ADMISSION', patient_id: form.patient_id, admission_id: admission.id },
      user?.id
    );
    if ('error' in episodeResult) {
      console.error('Admission succeeded but opening its billing episode failed:', episodeResult.error);
      // Non-blocking: the patient is genuinely admitted; a missing
      // episode can be created later the first time a charge needs one.
    }
    setShowModal(false);
    setForm({ patient_id: '', doctor_id: '', ward_id: '', room_id: '', bed_id: '', diagnosis: '', notes: '', department_id: '' });
    fetchData();
  }

  async function handleDischarge() {
    if (!selectedAdmission) return;
    setFormError('');
    const { error } = await supabase.from('admissions')
      .update({ status: 'DISCHARGED', discharge_date: new Date().toISOString() })
      .eq('id', selectedAdmission.id);
    if (error) {
      setFormError('Could not discharge patient. Please try again.');
      console.error(error);
      return;
    }
    // Both billing steps are deliberately non-blocking -- a billing
    // failure is logged, not allowed to trap a patient who has already
    // been physically discharged.
    const episodeResult = await findOrCreateEpisodeInvoice(
      { episode_type: 'ADMISSION', patient_id: selectedAdmission.patient_id, admission_id: selectedAdmission.id },
      user?.id
    );
    if ('error' in episodeResult) {
      console.error('Discharge succeeded but billing the final ward segment failed to find its episode:', episodeResult.error);
    } else {
      const billErr = await billClosedWardSegment(selectedAdmission.id, episodeResult.invoiceId);
      if (billErr) console.error('Discharge succeeded but billing the final ward segment failed:', billErr);
      const closeErr = await closeEpisode(episodeResult.episodeId);
      if (closeErr) console.error('Discharge succeeded but closing the billing episode failed:', closeErr);
    }
    setShowDischargeModal(false);
    setSelectedAdmission(null);
    fetchData();
  }

  function openTransferModal(admission: Admission) {
    setSelectedAdmission(admission);
    setTransferForm({ ward_id: '', room_id: '', bed_id: '' });
    setTransferError('');
    setShowTransferModal(true);
  }

  async function handleTransfer() {
    if (!selectedAdmission || !transferForm.bed_id) return;
    setTransferError('');
    // Firing this UPDATE is what trips the transfer-aware bed trigger
    // (migration 036): releases the old bed, closes the old ward-history
    // segment, occupies the new bed, opens a new segment.
    const { error } = await supabase.from('admissions')
      .update({ bed_id: transferForm.bed_id })
      .eq('id', selectedAdmission.id);
    if (error) {
      setTransferError('Could not transfer patient. Please try again.');
      console.error(error);
      return;
    }
    // Bill whatever segment the trigger just closed. Non-blocking -- the
    // patient has already physically moved beds; a billing failure here
    // shouldn't trap that.
    const episodeResult = await findOrCreateEpisodeInvoice(
      { episode_type: 'ADMISSION', patient_id: selectedAdmission.patient_id, admission_id: selectedAdmission.id },
      user?.id
    );
    if ('error' in episodeResult) {
      console.error('Transfer succeeded but billing the closed ward segment failed to find its episode:', episodeResult.error);
    } else {
      const billErr = await billClosedWardSegment(selectedAdmission.id, episodeResult.invoiceId);
      if (billErr) console.error('Transfer succeeded but billing the closed ward segment failed:', billErr);
    }
    setShowTransferModal(false);
    setSelectedAdmission(null);
    fetchData();
  }

  function openAdmitModal() {
    setForm({ patient_id: '', doctor_id: '', ward_id: '', room_id: '', bed_id: '', diagnosis: '', notes: '', department_id: '' });
    setShowModal(true);
  }

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/ipd')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to IPD
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admissions</h1>
          <p className="text-gray-500">Manage patient admissions and discharges</p>
        </div>
        {isReceptionist() && (
          <button onClick={openAdmitModal} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Admit Patient
          </button>
        )}
      </div>

      <div className="card">
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search admissions..." />
        </div>

        {loading ? <div className="py-12 text-center">Loading...</div> :
        admissions.length === 0 ? <EmptyState title="No admissions found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Patient</th>
                  <th className="table-header">Ward / Room / Bed</th>
                  <th className="table-header">Doctor</th>
                  <th className="table-header">Diagnosis</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Admitted</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admissions.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{a.patient?.full_name}</td>
                    <td className="table-cell">{a.bed?.ward?.name} / {a.bed?.room?.room_number} - {a.bed?.bed_number}</td>
                    <td className="table-cell">Dr. {a.doctor?.full_name}</td>
                    <td className="table-cell">{a.diagnosis || '-'}</td>
                    <td className="table-cell"><span className={`badge ${getStatusColor(a.status)}`}>{a.status}</span></td>
                    <td className="table-cell text-gray-500">{formatDate(a.admission_date)}</td>
                    <td className="table-cell text-right">
                      {a.status === 'ADMITTED' && isReceptionist() && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openTransferModal(a)} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1">
                            <ArrowRightLeft className="h-3 w-3" /> Transfer
                          </button>
                          <button onClick={() => { setSelectedAdmission(a); setShowDischargeModal(true); }} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded hover:bg-green-100">
                            Discharge
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Admit Patient">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Patient *</label>
            <select required value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} className="input">
              <option value="">Select Patient</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Department *</label>
            <select required value={form.department_id}
              onChange={e => setForm({...form, department_id: e.target.value, doctor_id: ''})}
              className="input">
              <option value="">Select Department</option>
              {departments.map(dep => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
            </select>
            {departments.length === 0 && <p className="mt-1 text-xs text-red-500">No departments found.</p>}
          </div>
          <div>
            <label className="label">Doctor *</label>
            <select required disabled={!form.department_id} value={form.doctor_id}
              onChange={e => setForm({...form, doctor_id: e.target.value})}
              className="input">
              <option value="">{form.department_id ? 'Select Doctor' : 'Select a department first'}</option>
              {filteredDoctorsForAdmission.map(d => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}
            </select>
            {form.department_id && filteredDoctorsForAdmission.length === 0 && <p className="mt-1 text-xs text-red-500">No doctors in this department.</p>}
          </div>

          <div>
            <label className="label">Ward *</label>
            <select required value={form.ward_id}
              onChange={e => setForm({...form, ward_id: e.target.value, room_id: '', bed_id: ''})}
              className="input">
              <option value="">Select Ward</option>
              {wards.map(w => <option key={w.id} value={w.id}>{w.name} ({w.ward_type})</option>)}
            </select>
            {wards.length === 0 && <p className="mt-1 text-xs text-red-500">No wards found.</p>}
          </div>

          <div>
            <label className="label">Room *</label>
            <select required disabled={!form.ward_id} value={form.room_id}
              onChange={e => setForm({...form, room_id: e.target.value, bed_id: ''})}
              className="input">
              <option value="">{form.ward_id ? 'Select Room' : 'Select a ward first'}</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{r.room_number}</option>)}
            </select>
            {form.ward_id && rooms.length === 0 && <p className="mt-1 text-xs text-red-500">No rooms found in this ward.</p>}
          </div>

          <div>
            <label className="label">Bed *</label>
            <select required disabled={!form.room_id} value={form.bed_id}
              onChange={e => setForm({...form, bed_id: e.target.value})}
              className="input">
              <option value="">{form.room_id ? 'Select Bed' : 'Select a room first'}</option>
              {vacantBeds.map(b => <option key={b.id} value={b.id}>{b.bed_number}</option>)}
            </select>
            {form.room_id && vacantBeds.length === 0 && <p className="mt-1 text-xs text-red-500">No available beds in this room.</p>}
          </div>

          <div>
            <label className="label">Diagnosis</label>
            <input value={form.diagnosis} onChange={e => setForm({...form, diagnosis: e.target.value})} className="input" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input" rows={2} />
          </div>
          {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowModal(false); setFormError(''); }} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={!form.doctor_id || !form.bed_id}>Admit Patient</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showDischargeModal} onClose={() => setShowDischargeModal(false)} title="Discharge Patient" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Discharge <strong>{selectedAdmission?.patient?.full_name}</strong> from {selectedAdmission?.bed?.ward?.name} / {selectedAdmission?.bed?.room?.room_number} - {selectedAdmission?.bed?.bed_number}?</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDischargeModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleDischarge} className="btn-primary">Discharge</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title="Transfer Patient" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Transfer <strong>{selectedAdmission?.patient?.full_name}</strong> from {selectedAdmission?.bed?.ward?.name} / {selectedAdmission?.bed?.room?.room_number} - {selectedAdmission?.bed?.bed_number} to:
          </p>
          <div>
            <label className="label">Ward *</label>
            <select value={transferForm.ward_id}
              onChange={e => setTransferForm({ ward_id: e.target.value, room_id: '', bed_id: '' })}
              className="input">
              <option value="">Select Ward</option>
              {wards.map(w => <option key={w.id} value={w.id}>{w.name} ({w.ward_type})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Room *</label>
            <select disabled={!transferForm.ward_id} value={transferForm.room_id}
              onChange={e => setTransferForm({ ...transferForm, room_id: e.target.value, bed_id: '' })}
              className="input">
              <option value="">{transferForm.ward_id ? 'Select Room' : 'Select a ward first'}</option>
              {transferRooms.map(r => <option key={r.id} value={r.id}>{r.room_number}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Bed *</label>
            <select disabled={!transferForm.room_id} value={transferForm.bed_id}
              onChange={e => setTransferForm({ ...transferForm, bed_id: e.target.value })}
              className="input">
              <option value="">{transferForm.room_id ? 'Select Bed' : 'Select a room first'}</option>
              {transferBeds.map(b => <option key={b.id} value={b.id}>{b.bed_number}</option>)}
            </select>
            {transferForm.room_id && transferBeds.length === 0 && <p className="mt-1 text-xs text-red-500">No available beds in this room.</p>}
          </div>
          {transferError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{transferError}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowTransferModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleTransfer} className="btn-primary" disabled={!transferForm.bed_id}>Transfer & Bill Segment</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
