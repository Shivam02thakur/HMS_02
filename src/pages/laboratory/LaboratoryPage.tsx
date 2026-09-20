import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { SearchInput } from '@/components/ui/SearchInput';
import { EmptyState } from '@/components/ui/EmptyState';
import type { LabOrder, Patient, Doctor, LabTest, LabResult } from '@/types';
import { Plus, FlaskConical, FileCheck, Clock, AlertCircle } from 'lucide-react';
import { formatDate, getStatusColor } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { findOrCreateEpisodeInvoice } from '@/lib/billing';

export function LaboratoryPage() {
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [orderError, setOrderError] = useState('');
  const [billingWarning, setBillingWarning] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { user } = useAuth();
  const { isDoctor, isLabTech } = useRole();

  const [orderForm, setOrderForm] = useState({ patient_id: '', doctor_id: '', test_id: '', notes: '' });
  const [resultForm, setResultForm] = useState({ result_value: '', remarks: '', is_abnormal: false });

  // Mirrors exactly what compute_lab_result_abnormal_flag() (migration
  // 042) will actually decide server-side -- purely for the live hint
  // shown while typing. The database trigger is the authoritative
  // computation; this is not relied on for correctness, only UX.
  const computedAbnormal = (() => {
    const test = selectedOrder?.test;
    if (!test || !resultForm.result_value) return false;
    if (test.result_type === 'numeric' && test.normal_min != null && test.normal_max != null) {
      const v = Number(resultForm.result_value);
      return !isNaN(v) && (v < test.normal_min || v > test.normal_max);
    }
    if (test.result_type === 'qualitative') {
      return (test.abnormal_values || []).includes(resultForm.result_value);
    }
    return false;
  })();

  function handleResultValueChange(value: string) {
    setResultForm(prev => {
      const next = { ...prev, result_value: value };
      const test = selectedOrder?.test;
      // Auto-suggest the default remark once the value crosses into
      // abnormal -- but only into an empty remarks field, never
      // overwriting something the tech has already typed themselves.
      if (test?.default_abnormal_remark && !prev.remarks) {
        const willBeAbnormal =
          test.result_type === 'numeric' && test.normal_min != null && test.normal_max != null
            ? !isNaN(Number(value)) && (Number(value) < test.normal_min || Number(value) > test.normal_max)
            : test.result_type === 'qualitative'
            ? (test.abnormal_values || []).includes(value)
            : false;
        if (willBeAbnormal) next.remarks = test.default_abnormal_remark;
      }
      return next;
    });
  }

  useEffect(() => { fetchData(); }, [debouncedSearch, filterStatus]);

  async function fetchData() {
    setLoading(true);
    let query = supabase.from('lab_orders').select('*, patient:patients(full_name), doctor:doctors(full_name), test:lab_tests(*), result:lab_results(*)').order('ordered_at', { ascending: false });
    if (filterStatus) query = query.eq('status', filterStatus as 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED');
    const { data } = await query;
    let filtered = (data || []) as unknown as LabOrder[];
    if (debouncedSearch) {
      filtered = filtered.filter(l =>
        l.patient?.full_name?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        l.test?.name?.toLowerCase().includes(debouncedSearch.toLowerCase())
      );
    }
    setLabOrders(filtered);

    const [{ data: p }, { data: d }, { data: t }] = await Promise.all([
      supabase.from('patients').select('id, full_name').order('full_name'),
      supabase.from('doctors').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('lab_tests').select('*').order('name')
    ]);
    setPatients((p || []) as unknown as Patient[]);
    setDoctors((d || []) as unknown as Doctor[]);
    setTests((t || []) as unknown as LabTest[]);
    setLoading(false);
  }

  async function handleOrderSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOrderError('');
    const { data: order, error } = await supabase.from('lab_orders')
      .insert({ ...orderForm, created_by: user?.id })
      .select('id')
      .single();
    if (error || !order) {
      setOrderError('Could not create lab order. Please try again.');
      console.error(error);
      return;
    }

    const test = tests.find(t => t.id === orderForm.test_id);
    if (test) {
      // Tests ordered during an active stay bill to that admission's
      // episode (matching #14's "everything during the stay accumulates
      // onto one invoice"); everyone else gets a WALK_IN episode. Lab
      // orders have no appointment_id to check against an OPD_VISIT
      // episode -- admission is the only context this form has to work
      // with beyond the bare patient.
      const { data: activeAdmission } = await supabase
        .from('admissions')
        .select('id')
        .eq('patient_id', orderForm.patient_id)
        .eq('status', 'ADMITTED')
        .maybeSingle();

      const result = await findOrCreateEpisodeInvoice(
        activeAdmission
          ? { episode_type: 'ADMISSION', patient_id: orderForm.patient_id, admission_id: activeAdmission.id }
          : { episode_type: 'WALK_IN', patient_id: orderForm.patient_id },
        user?.id
      );

      if ('error' in result) {
        console.error('Failed to bill lab order:', result.error);
        setBillingWarning(`Test ordered, but billing failed (${result.error}). Add the charge manually from Billing.`);
      } else {
        const { error: itemError } = await supabase.from('invoice_items').insert({
          invoice_id: result.invoiceId,
          description: test.name,
          item_type: 'lab_test',
          reference_id: test.id,
          quantity: 1,
          unit_price: test.price,
          total_price: test.price,
        });
        if (itemError) {
          console.error('Failed to add lab test charge:', itemError);
          setBillingWarning(`Test ordered, but billing failed (${itemError.message}). Add the charge manually from Billing.`);
        } else {
          const { error: calcError } = await supabase.rpc('calculate_invoice_total', { p_invoice_id: result.invoiceId });
          if (calcError) {
            console.error('Test ordered and charge added, but recalculating the invoice total failed:', calcError);
            setBillingWarning('Test ordered and charge added, but the invoice total needs a manual refresh -- open the invoice in Billing.');
          }
        }
      }
    }

    setShowOrderModal(false);
    setOrderForm({ patient_id: '', doctor_id: '', test_id: '', notes: '' });
    fetchData();
  }

  async function handleResultSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;
    await supabase.from('lab_results').insert({
      lab_order_id: selectedOrder.id,
      ...resultForm,
      recorded_by: user?.id
    });
    await supabase.from('lab_orders').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', selectedOrder.id);
    setShowResultModal(false);
    setResultForm({ result_value: '', remarks: '', is_abnormal: false });
    fetchData();
  }

  function openResultModal(order: LabOrder) {
    setSelectedOrder(order);
    setResultForm({ result_value: '', remarks: '', is_abnormal: false });
    setShowResultModal(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Laboratory</h1>
          <p className="text-gray-500">Manage lab tests and results</p>
        </div>
        {isDoctor() && (
          <button onClick={() => setShowOrderModal(true)} className="btn-primary">
            <Plus className="h-4 w-4 mr-2" /> Order Lab Test
          </button>
        )}
      </div>

      {billingWarning && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>{billingWarning}</span>
          <button onClick={() => setBillingWarning('')} className="flex-shrink-0 text-xs font-medium text-amber-600 hover:text-amber-700">
            Dismiss
          </button>
        </div>
      )}

      <div className="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1"><SearchInput value={search} onChange={setSearch} placeholder="Search lab orders..." /></div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input w-auto">
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {loading ? <div className="py-12 text-center">Loading...</div> :
        labOrders.length === 0 ? <EmptyState title="No lab orders found" /> : (
          <div className="mt-4 space-y-3">
            {labOrders.map((order) => (
              <div key={order.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                      <FlaskConical className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{order.test?.name}</p>
                      <p className="text-xs text-gray-500">{order.patient?.full_name} | Dr. {order.doctor?.full_name}</p>
                      <p className="text-xs text-gray-400">{formatDate(order.ordered_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge ${getStatusColor(order.status)}`}>{order.status}</span>
                    {order.status === 'PENDING' && isLabTech() && (
                      <button onClick={() => openResultModal(order)} className="btn-primary text-xs py-1.5 px-3">
                        <FileCheck className="h-3.5 w-3.5 mr-1" /> Enter Result
                      </button>
                    )}
                  </div>
                </div>
                {order.result && (
                  <div className="mt-3 rounded-lg bg-gray-50 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Result:</span>
                      <span className="text-sm">{order.result.result_value} {order.test?.unit}</span>
                      {order.result.is_abnormal && <AlertCircle className="h-4 w-4 text-red-500" />}
                    </div>
                    {order.result.remarks && <p className="text-xs text-gray-500 mt-1">{order.result.remarks}</p>}
                    <p className="text-xs text-gray-400 mt-1">Recorded: {formatDate(order.result.recorded_at)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={showOrderModal} onClose={() => setShowOrderModal(false)} title="Order Lab Test">
        <form onSubmit={handleOrderSubmit} className="space-y-4">
          <div>
            <label className="label">Patient *</label>
            <select required value={orderForm.patient_id} onChange={e => setOrderForm({...orderForm, patient_id: e.target.value})} className="input">
              <option value="">Select Patient</option>
              {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Doctor</label>
            <select value={orderForm.doctor_id} onChange={e => setOrderForm({...orderForm, doctor_id: e.target.value})} className="input">
              <option value="">Select Doctor</option>
              {doctors.map(d => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Test *</label>
            <select required value={orderForm.test_id} onChange={e => setOrderForm({...orderForm, test_id: e.target.value})} className="input">
              <option value="">Select Test</option>
              {tests.map(t => <option key={t.id} value={t.id}>{t.name} (₹{t.price})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={orderForm.notes} onChange={e => setOrderForm({...orderForm, notes: e.target.value})} className="input" rows={2} />
          </div>
          <p className="text-xs text-gray-400">The test charge will be added automatically to the patient's billing episode.</p>
          {orderError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{orderError}</div>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowOrderModal(false); setOrderError(''); }} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Order Test</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showResultModal} onClose={() => setShowResultModal(false)} title={`Enter Result - ${selectedOrder?.test?.name}`}>
        <form onSubmit={handleResultSubmit} className="space-y-4">
          {selectedOrder?.test?.result_type === 'numeric' ? (
            <div>
              <label className="label">Result Value * {selectedOrder.test.unit ? `(${selectedOrder.test.unit})` : ''}</label>
              <input
                required type="number" step="any"
                value={resultForm.result_value}
                onChange={e => handleResultValueChange(e.target.value)}
                className="input"
                placeholder={`Normal range: ${selectedOrder.test.normal_min}-${selectedOrder.test.normal_max}`}
              />
              {resultForm.result_value && !isNaN(Number(resultForm.result_value)) && (
                <p className={`mt-1 text-xs font-medium ${computedAbnormal ? 'text-red-600' : 'text-green-600'}`}>
                  {computedAbnormal ? 'Outside normal range -- will be flagged abnormal' : 'Within normal range'}
                </p>
              )}
            </div>
          ) : selectedOrder?.test?.result_type === 'qualitative' ? (
            <div>
              <label className="label">Result *</label>
              <select required value={resultForm.result_value} onChange={e => handleResultValueChange(e.target.value)} className="input">
                <option value="">Select finding</option>
                {(selectedOrder.test.qualitative_options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
              {resultForm.result_value && (
                <p className={`mt-1 text-xs font-medium ${computedAbnormal ? 'text-red-600' : 'text-green-600'}`}>
                  {computedAbnormal ? 'Flagged abnormal' : 'Normal finding'}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="label">Result Value *</label>
              <input required value={resultForm.result_value} onChange={e => setResultForm({...resultForm, result_value: e.target.value})} className="input" placeholder={`Normal range: ${selectedOrder?.test?.normal_range} ${selectedOrder?.test?.unit}`} />
            </div>
          )}

          <div>
            <label className="label">Remarks</label>
            <textarea value={resultForm.remarks} onChange={e => setResultForm({...resultForm, remarks: e.target.value})} className="input" rows={2} />
          </div>

          {/* Manual checkbox stays exactly as before, but only for tests
              this system can't reliably auto-detect (see migration 042's
              header comment) -- numeric/qualitative tests get computed
              automatically and never show this control. */}
          {(!selectedOrder?.test?.result_type || selectedOrder.test.result_type === 'manual') && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_abnormal" checked={resultForm.is_abnormal} onChange={e => setResultForm({...resultForm, is_abnormal: e.target.checked})} className="rounded border-gray-300 text-primary-600" />
              <label htmlFor="is_abnormal" className="text-sm text-gray-700">Abnormal Result</label>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowResultModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Submit Result</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
