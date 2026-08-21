import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Prescription, Patient, Doctor, Medicine, PrescriptionItem } from '@/types';
import { Plus, FileText, User, Stethoscope, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

export function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const { user } = useAuth();
  const { isDoctor, isPharmacist } = useRole();

  const [form, setForm] = useState({ patient_id: '', doctor_id: '', diagnosis: '', notes: '' });
  const [items, setItems] = useState<{ medicine_id: string; dosage: string; frequency: string; duration: string; instructions: string }[]>([]);

  useEffect(() => { fetchData(); }, [debouncedSearch]);

  async function fetchData() {
    setLoading(true);
    let query = supabase.from('prescriptions').select('*, patient:patients(full_name), doctor:doctors(full_name), items:prescription_items(*, medicine:medicines(name))').order('created_at', { ascending: false });
    const { data } = await query;
    let filtered = (data || []) as unknown as Prescription[];
    if (debouncedSearch) {
      filtered = filtered.filter(p =>
        p.patient?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        p.doctor?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
    }
    setPrescriptions(filtered);

    const [{ data: p }, { data: d }, { data: m }] = await Promise.all([
      supabase.from('patients').select('id, full_name').order('full_name'),
      supabase.from('doctors').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('medicines').select('id, name, stock_quantity').gt('stock_quantity', 0).order('name')
    ]);
    setPatients((p || []) as unknown as Patient[]);
    setDoctors((d || []) as unknown as Doctor[]);
    setMedicines((m || []) as unknown as Medicine[]);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const doctorId = form.doctor_id || user?.id;
    if (!doctorId) return;
    const { data: prescription } = await supabase.from('prescriptions').insert({
      ...form, doctor_id: doctorId
    }).select().single();

    if (prescription && items.length > 0) {
      const itemsToInsert = items.filter(i => i.medicine_id).map(i => ({
        ...i, prescription_id: prescription.id
      }));
      if (itemsToInsert.length > 0) {
        await supabase.from('prescription_items').insert(itemsToInsert);
      }
    }

    setShowModal(false);
    setForm({ patient_id: '', doctor_id: '', diagnosis: '', notes: '' });
    setItems([]);
    fetchData();
  }

  function addItem() {
    setItems([...items, { medicine_id: '', dosage: '', frequency: '', duration: '', instructions: '' }]);
  }

  function updateItem(index: number, field: string, value: string) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prescriptions</h1>
          <p className="text-gray-500">Manage prescriptions and medications</p>
        </div>
        {isDoctor() && (
          <button onClick={() => { setShowModal(true); setItems([{ medicine_id: '', dosage: '', frequency: '', duration: '', instructions: '' }]); }} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Create Prescription
          </button>
        )}
      </div>

      <div className="card">
        <div className="mb-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search prescriptions..." />
        </div>

        {loading ? <div className="py-12 text-center">Loading...</div> :
        prescriptions.length === 0 ? <EmptyState title="No prescriptions found" /> : (
          <div className="space-y-4">
            {prescriptions.map((pr) => (
              <div key={pr.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                      <FileText className="h-5 w-5 text-primary-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{pr.patient?.full_name}</p>
                      <p className="text-xs text-gray-500">Dr. {pr.doctor?.full_name} | {formatDate(pr.created_at)}</p>
                    </div>
                  </div>
                  {pr.diagnosis && <span className="badge bg-blue-50 text-blue-700">{pr.diagnosis}</span>}
                </div>
                <div className="mt-4 space-y-2">
                  {pr.items?.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                      <span className="font-medium text-gray-900">{item.medicine?.name}</span>
                      <span className="text-gray-500">{item.dosage}</span>
                      <span className="text-gray-500">{item.frequency}</span>
                      <span className="text-gray-500">{item.duration}</span>
                      {item.instructions && <span className="text-gray-400">({item.instructions})</span>}
                    </div>
                  ))}
                </div>
                {pr.notes && <p className="mt-3 text-xs text-gray-500">Notes: {pr.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create Prescription" size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <option value="">Select Doctor (Default: You)</option>
                {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Diagnosis</label>
              <input value={form.diagnosis} onChange={e => setForm({...form, diagnosis: e.target.value})} className="input" placeholder="Primary diagnosis..." />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Medicines</label>
              <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:text-primary-700 font-medium">+ Add Medicine</button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-5 items-end rounded-lg border border-gray-100 p-3">
                  <div className="sm:col-span-2">
                    <label className="text-xs text-gray-500">Medicine</label>
                    <select value={item.medicine_id} onChange={e => updateItem(index, 'medicine_id', e.target.value)} className="input mt-1">
                      <option value="">Select</option>
                      {medicines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.stock_quantity})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Dosage</label>
                    <input value={item.dosage} onChange={e => updateItem(index, 'dosage', e.target.value)} className="input mt-1" placeholder="e.g. 500mg" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Frequency</label>
                    <input value={item.frequency} onChange={e => updateItem(index, 'frequency', e.target.value)} className="input mt-1" placeholder="e.g. 2x/day" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">Duration</label>
                      <input value={item.duration} onChange={e => updateItem(index, 'duration', e.target.value)} className="input mt-1" placeholder="e.g. 5 days" />
                    </div>
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(index)} className="mb-1 p-1 text-red-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input" rows={2} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Prescription</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
