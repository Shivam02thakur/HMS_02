import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Admission, Patient, Doctor, Bed } from '@/types';
import { Plus, ArrowLeft } from 'lucide-react';
import { formatDate, getStatusColor } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '@/hooks/useDebounce';

export function AdmissionsPage() {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [vacantBeds, setVacantBeds] = useState<Bed[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDischargeModal, setShowDischargeModal] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<Admission | null>(null);
  const debouncedSearch = useDebounce(search, 300);
  const { isReceptionist } = useRole();
  const navigate = useNavigate();

  const [form, setForm] = useState({ patient_id: '', doctor_id: '', bed_id: '', diagnosis: '', notes: '' });

  useEffect(() => { fetchData(); }, [debouncedSearch]);

  async function fetchData() {
    setLoading(true);
    let query = supabase.from('admissions').select('*, patient:patients(full_name), doctor:doctors(full_name), bed:beds(bed_number, ward:wards(name))').order('admission_date', { ascending: false });
    const { data } = await query;
    let filtered = (data || []) as unknown as Admission[];
    if (debouncedSearch) {
      filtered = filtered.filter(a => a.patient?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()));
    }
    setAdmissions(filtered);

    const [{ data: p }, { data: d }, { data: b }] = await Promise.all([
      supabase.from('patients').select('id, full_name').order('full_name'),
      supabase.from('doctors').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('beds').select('*, ward:wards(name)').eq('status', 'VACANT').order('bed_number')
    ]);
    setPatients((p || []) as unknown as Patient[]);
    setDoctors((d || []) as unknown as Doctor[]);
    setVacantBeds((b || []) as unknown as Bed[]);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from('admissions').insert({
      patient_id: form.patient_id,
      doctor_id: form.doctor_id || undefined,
      bed_id: form.bed_id || undefined,
      diagnosis: form.diagnosis,
      notes: form.notes,
      status: 'ADMITTED'
    });
    setShowModal(false);
    setForm({ patient_id: '', doctor_id: '', bed_id: '', diagnosis: '', notes: '' });
    fetchData();
  }

  async function handleDischarge() {
    if (!selectedAdmission) return;
    await supabase.from('admissions').update({ status: 'DISCHARGED', discharge_date: new Date().toISOString() }).eq('id', selectedAdmission.id);
    setShowDischargeModal(false);
    setSelectedAdmission(null);
    fetchData();
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
          <button onClick={() => setShowModal(true)} className="btn-primary">
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
                  <th className="table-header">Ward / Bed</th>
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
                    <td className="table-cell">{a.bed?.ward?.name} - {a.bed?.bed_number}</td>
                    <td className="table-cell">Dr. {a.doctor?.full_name}</td>
                    <td className="table-cell">{a.diagnosis || '-'}</td>
                    <td className="table-cell"><span className={`badge ${getStatusColor(a.status)}`}>{a.status}</span></td>
                    <td className="table-cell text-gray-500">{formatDate(a.admission_date)}</td>
                    <td className="table-cell text-right">
                      {a.status === 'ADMITTED' && isReceptionist() && (
                        <button onClick={() => { setSelectedAdmission(a); setShowDischargeModal(true); }} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded hover:bg-green-100">
                          Discharge
                        </button>
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
            <label className="label">Doctor</label>
            <select value={form.doctor_id} onChange={e => setForm({...form, doctor_id: e.target.value})} className="input">
              <option value="">Select Doctor</option>
              {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Bed *</label>
            <select required value={form.bed_id} onChange={e => setForm({...form, bed_id: e.target.value})} className="input">
              <option value="">Select Bed</option>
              {vacantBeds.map(b => <option key={b.id} value={b.id}>{b.ward?.name} - {b.bed_number}</option>)}
            </select>
            {vacantBeds.length === 0 && <p className="mt-1 text-xs text-red-500">No vacant beds available</p>}
          </div>
          <div>
            <label className="label">Diagnosis</label>
            <input value={form.diagnosis} onChange={e => setForm({...form, diagnosis: e.target.value})} className="input" />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input" rows={2} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={vacantBeds.length === 0}>Admit Patient</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showDischargeModal} onClose={() => setShowDischargeModal(false)} title="Discharge Patient" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Discharge <strong>{selectedAdmission?.patient?.full_name}</strong> from {selectedAdmission?.bed?.ward?.name} - {selectedAdmission?.bed?.bed_number}?</p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowDischargeModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleDischarge} className="btn-primary">Discharge</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
