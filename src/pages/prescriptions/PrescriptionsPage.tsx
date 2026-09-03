import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Prescription, Patient, Doctor, Medicine, LabTest } from '@/types';
import { Plus, FileText, Trash2, FlaskConical, Printer, AlertTriangle, History } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

// A prescription is immutable from the moment it's created. The only way
// to change anything is a brand-new prescription, written during a later
// consultation, that explicitly names which earlier prescription (by the
// same doctor, for the same patient) it revises -- never an automatic
// side effect of time passing or another visit happening. "No — this is
// unrelated" is always the default so an unrelated later visit never
// accidentally supersedes a still-valid earlier one.
const UNRELATED = '';

type PriorPrescription = Pick<Prescription, 'id' | 'prescription_number' | 'diagnosis' | 'created_at' | 'weight_kg' | 'bp' | 'pulse_bpm' | 'temperature_f' | 'spo2_percent'> & {
  items: { medicine_id: string; dosage: string; frequency: string; duration: string; instructions: string | null; quantity: number | null }[];
};

export function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const { user } = useAuth();
  const { isDoctor, isPharmacist } = useRole();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    patient_id: '', doctor_id: '', diagnosis: '', notes: '',
    weight_kg: '', bp: '', pulse_bpm: '', temperature_f: '', spo2_percent: '',
  });
  const [items, setItems] = useState<{ medicine_id: string; dosage: string; frequency: string; duration: string; instructions: string; quantity: string }[]>([]);
  const [selectedLabTestIds, setSelectedLabTestIds] = useState<string[]>([]);
  const [priorPrescriptions, setPriorPrescriptions] = useState<PriorPrescription[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState(UNRELATED);

  // Prescriptions are created by whichever doctor is logged in by default --
  // but doctors.id (used as prescriptions.doctor_id) is NOT the same as the
  // logged-in profile id (doctors.user_id is what links to profiles.id).
  // Falling back to `user?.id` directly, as this page used to do, silently
  // wrote the wrong doctor_id whenever those two ids differed.
  const myDoctorRecord = doctors.find(d => d.user_id === user?.id);
  // Works whether an admin is picking the doctor manually (form.doctor_id)
  // or a doctor is creating their own prescription (falls back to their
  // own doctor record).
  const effectiveDoctorId = form.doctor_id || myDoctorRecord?.id || '';

  useEffect(() => { fetchData(); }, [debouncedSearch]);

  // Revision is only ever an explicit, deliberate choice the doctor makes
  // when writing a new prescription -- never an automatic side effect of
  // another visit happening. This fetches candidates for that choice: every
  // not-yet-superseded prescription for this patient written by this same
  // effective doctor. A different patient or doctor selection re-runs this
  // and resets any previous pick, since a picked prescription may no longer
  // apply to the newly-selected patient/doctor pair.
  useEffect(() => {
    setSelectedRevisionId(UNRELATED);
    if (!form.patient_id || !effectiveDoctorId) {
      setPriorPrescriptions([]);
      return;
    }
    supabase.from('prescriptions')
      .select('id, prescription_number, diagnosis, created_at, weight_kg, bp, pulse_bpm, temperature_f, spo2_percent, items:prescription_items(medicine_id, dosage, frequency, duration, instructions, quantity)')
      .eq('patient_id', form.patient_id)
      .eq('doctor_id', effectiveDoctorId)
      .is('superseded_by', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setPriorPrescriptions((data || []) as unknown as PriorPrescription[]));
  }, [form.patient_id, effectiveDoctorId]);

  async function fetchData() {
    setLoading(true);
    setFetchError('');
    const query = supabase.from('prescriptions')
      .select('*, patient:patients(full_name), doctor:doctors(full_name), items:prescription_items(*, medicine:medicines(name)), lab_orders(*, test:lab_tests(name))')
      .order('created_at', { ascending: false });
    const { data, error: prescriptionsError } = await query;
    if (prescriptionsError) {
      console.error('Failed to load prescriptions:', prescriptionsError);
      setFetchError(`Could not load prescriptions: ${prescriptionsError.message}`);
      setLoading(false);
      return;
    }
    let filtered = (data || []) as unknown as Prescription[];
    if (debouncedSearch) {
      filtered = filtered.filter(p =>
        p.patient?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        p.doctor?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
    }
    setPrescriptions(filtered);

    // full_name, department, qualification, registration_no, etc. all come
    // through on '*' -- this is the "automatically fetch doctor's data"
    // piece: everything the printed prescription needs is loaded here once,
    // keyed off doctor_id, rather than re-typed per prescription.
    const [{ data: p, error: pErr }, { data: d, error: dErr }, { data: m, error: mErr }, { data: lt, error: ltErr }] = await Promise.all([
      supabase.from('patients').select('id, full_name').order('full_name'),
      supabase.from('doctors').select('*, department:departments(name)').eq('is_active', true).order('full_name'),
      supabase.from('medicines').select('id, name, stock_quantity').gt('stock_quantity', 0).order('name'),
      supabase.from('lab_tests').select('id, name, code, price').order('name'),
    ]);
    const refErr = pErr || dErr || mErr || ltErr;
    if (refErr) {
      console.error('Failed to load reference data:', refErr);
      setFetchError(`Could not load form data: ${refErr.message}`);
    }
    setPatients((p || []) as unknown as Patient[]);
    setDoctors((d || []) as unknown as Doctor[]);
    setMedicines((m || []) as unknown as Medicine[]);
    setLabTests((lt || []) as unknown as LabTest[]);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    const doctorId = form.doctor_id || myDoctorRecord?.id;
    if (!doctorId) {
      setSubmitError('Select a doctor for this prescription.');
      return;
    }
    setSubmitting(true);

    const { patient_id, diagnosis, notes, weight_kg, bp, pulse_bpm, temperature_f, spo2_percent } = form;
    const { data: prescription, error: prescriptionError } = await supabase.from('prescriptions').insert({
      patient_id, diagnosis, notes,
      doctor_id: doctorId,
      weight_kg: weight_kg ? parseFloat(weight_kg) : null,
      bp: bp || null,
      pulse_bpm: pulse_bpm ? parseInt(pulse_bpm) : null,
      temperature_f: temperature_f ? parseFloat(temperature_f) : null,
      spo2_percent: spo2_percent ? parseInt(spo2_percent) : null,
      // Only ever set from an explicit pick in the revision picker below --
      // never inferred from "same patient, same doctor, later visit" on its
      // own. The database enforces same-doctor/same-patient and atomically
      // flips the old prescription to superseded (migration 031).
      revision_of: selectedRevisionId || null,
    }).select().single();

    if (prescriptionError || !prescription) {
      console.error('Failed to create prescription:', prescriptionError);
      setSubmitError(prescriptionError?.message || 'Could not create prescription. Please try again.');
      setSubmitting(false);
      return;
    }

    if (items.length > 0) {
      const itemsToInsert = items.filter(i => i.medicine_id).map(i => ({
        medicine_id: i.medicine_id, dosage: i.dosage, frequency: i.frequency,
        duration: i.duration, instructions: i.instructions,
        quantity: i.quantity ? parseFloat(i.quantity) : null,
        prescription_id: prescription.id,
      }));
      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from('prescription_items').insert(itemsToInsert);
        if (itemsError) console.error('Failed to save prescription medicines:', itemsError);
      }
    }

    // Lab tests ordered from here land in lab_orders (same table the
    // Laboratory page reads) tagged with prescription_id, so the lab team
    // sees them in their normal queue and the printed prescription can
    // still show them under Investigations.
    if (selectedLabTestIds.length > 0) {
      const labOrdersToInsert = selectedLabTestIds.map(test_id => ({
        patient_id, doctor_id: doctorId, test_id,
        prescription_id: prescription.id,
        status: 'PENDING' as const,
        created_by: user?.id,
      }));
      const { error: labError } = await supabase.from('lab_orders').insert(labOrdersToInsert);
      if (labError) console.error('Failed to order lab tests:', labError);
    }

    setShowModal(false);
    setForm({ patient_id: '', doctor_id: '', diagnosis: '', notes: '', weight_kg: '', bp: '', pulse_bpm: '', temperature_f: '', spo2_percent: '' });
    setItems([]);
    setSelectedLabTestIds([]);
    setSelectedRevisionId(UNRELATED);
    setSubmitting(false);
    fetchData();
    navigate(`/prescriptions/${prescription.id}`);
  }

  function toggleLabTest(testId: string) {
    setSelectedLabTestIds(ids => ids.includes(testId) ? ids.filter(i => i !== testId) : [...ids, testId]);
  }

  function addItem() {
    setItems([...items, { medicine_id: '', dosage: '', frequency: '', duration: '', instructions: '', quantity: '' }]);
  }

  function updateItem(index: number, field: string, value: string) {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  // Prefills diagnosis, vitals, and every medicine line from the picked
  // prior prescription -- each line stays individually editable/removable
  // from there (a continued medicine is re-written with a fresh quantity;
  // its old remaining balance never carries over).
  function applyRevision(id: string) {
    setSelectedRevisionId(id);
    if (!id) return;
    const prior = priorPrescriptions.find(p => p.id === id);
    if (!prior) return;
    setForm(f => ({
      ...f,
      diagnosis: prior.diagnosis || '',
      weight_kg: prior.weight_kg != null ? String(prior.weight_kg) : '',
      bp: prior.bp || '',
      pulse_bpm: prior.pulse_bpm != null ? String(prior.pulse_bpm) : '',
      temperature_f: prior.temperature_f != null ? String(prior.temperature_f) : '',
      spo2_percent: prior.spo2_percent != null ? String(prior.spo2_percent) : '',
    }));
    setItems(prior.items.map(i => ({
      medicine_id: i.medicine_id, dosage: i.dosage, frequency: i.frequency,
      duration: i.duration, instructions: i.instructions || '',
      quantity: i.quantity != null ? String(i.quantity) : '',
    })));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prescriptions</h1>
          <p className="text-gray-500">Manage prescriptions and medications</p>
        </div>
        {isDoctor() && (
          <button onClick={() => {
            setSubmitError('');
            setForm(f => ({ ...f, doctor_id: myDoctorRecord?.id || '' }));
            setItems([{ medicine_id: '', dosage: '', frequency: '', duration: '', instructions: '', quantity: '' }]);
            setSelectedLabTestIds([]);
            setSelectedRevisionId(UNRELATED);
            setShowModal(true);
          }} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Create Prescription
          </button>
        )}
      </div>

      <div className="card">
        {fetchError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {fetchError}
          </div>
        )}
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
                      <p className="text-xs text-gray-500">
                        {pr.prescription_number ? `${pr.prescription_number} · ` : ''}Dr. {pr.doctor?.full_name} | {formatDate(pr.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {pr.revision_of_prescription && (
                      <span className="badge bg-amber-50 text-amber-700 flex items-center gap-1" title={`Revises ${pr.revision_of_prescription.prescription_number}`}>
                        <History className="h-3 w-3" /> Revision
                      </span>
                    )}
                    {pr.superseded_by && (
                      <span className="badge bg-red-50 text-red-700">Superseded</span>
                    )}
                    {pr.diagnosis && <span className="badge bg-blue-50 text-blue-700">{pr.diagnosis}</span>}
                    <button onClick={() => navigate(`/prescriptions/${pr.id}`)} className="btn-secondary text-xs py-1.5 px-3">
                      <Printer className="h-3.5 w-3.5 mr-1" /> View / Print
                    </button>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {pr.lab_orders?.map((lo, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-purple-50 p-3 text-sm">
                      <FlaskConical className="h-3.5 w-3.5 text-purple-500" />
                      <span className="font-medium text-gray-900">{lo.test?.name}</span>
                      <span className="badge bg-purple-100 text-purple-700 text-[10px]">{lo.status}</span>
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
                {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.full_name}{d.specialization ? ` — ${d.specialization}` : ''}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                The prescription pulls the doctor's qualification, registration no. and department straight from their profile — nothing else to fill in here.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="label">Diagnosis</label>
              <input value={form.diagnosis} onChange={e => setForm({...form, diagnosis: e.target.value})} className="input" placeholder="Primary diagnosis..." />
            </div>
          </div>

          {priorPrescriptions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <label className="label flex items-center gap-1.5 text-amber-800">
                <History className="h-3.5 w-3.5" /> Is this a revision of an earlier prescription?
              </label>
              <select value={selectedRevisionId} onChange={e => applyRevision(e.target.value)} className="input mt-1">
                <option value={UNRELATED}>No — this is unrelated, start fresh</option>
                {priorPrescriptions.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.prescription_number} · {formatDate(p.created_at)}{p.diagnosis ? ` · ${p.diagnosis}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-amber-700">
                Picking one prefills its diagnosis, vitals and medicines below (all editable) and marks the earlier
                prescription as superseded the moment this one is saved. Only prescriptions you wrote for this
                patient that haven't already been superseded are listed.
              </p>
            </div>
          )}

          <div>
            <label className="label">Vitals (optional)</label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <label className="text-xs text-gray-500">Weight (kg)</label>
                <input type="number" step="0.1" value={form.weight_kg} onChange={e => setForm({...form, weight_kg: e.target.value})} className="input mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">BP (mmHg)</label>
                <input value={form.bp} onChange={e => setForm({...form, bp: e.target.value})} className="input mt-1" placeholder="120/80" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Pulse (bpm)</label>
                <input type="number" value={form.pulse_bpm} onChange={e => setForm({...form, pulse_bpm: e.target.value})} className="input mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">Temp (°F)</label>
                <input type="number" step="0.1" value={form.temperature_f} onChange={e => setForm({...form, temperature_f: e.target.value})} className="input mt-1" />
              </div>
              <div>
                <label className="text-xs text-gray-500">SpO2 (%)</label>
                <input type="number" value={form.spo2_percent} onChange={e => setForm({...form, spo2_percent: e.target.value})} className="input mt-1" />
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label">Medicines</label>
              <button type="button" onClick={addItem} className="text-sm text-primary-600 hover:text-primary-700 font-medium">+ Add Medicine</button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 gap-3 sm:grid-cols-6 items-end rounded-lg border border-gray-100 p-3">
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
                  <div>
                    <label className="text-xs text-gray-500">Duration</label>
                    <input value={item.duration} onChange={e => updateItem(index, 'duration', e.target.value)} className="input mt-1" placeholder="e.g. 5 days" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500">Qty (total)</label>
                      <input type="number" min="0" step="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} className="input mt-1" placeholder="e.g. 10" />
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
            <label className="label">Lab Tests</label>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-100 p-3">
              {labTests.length === 0 ? <p className="text-sm text-gray-400">No lab tests configured.</p> : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {labTests.map(t => (
                    <label key={t.id} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        checked={selectedLabTestIds.includes(t.id)}
                        onChange={() => toggleLabTest(t.id)}
                      />
                      <FlaskConical className="h-3.5 w-3.5 text-gray-400" />
                      {t.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">Selected tests are sent to the lab queue and listed under Investigations on the printed prescription.</p>
          </div>

          <div>
            <label className="label">Notes / Instructions / Investigations</label>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input" rows={2} />
          </div>

          {submitError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {submitError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? 'Creating...' : 'Create Prescription'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
