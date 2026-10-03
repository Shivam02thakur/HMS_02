import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import type { LabOrder, LabTestParameter, LabResultValue, LabResultFlag } from '@/types';
import {
  ArrowLeft, FlaskConical, Printer, CheckCircle2,
  AlertTriangle, Clock, FileCheck,
} from 'lucide-react';
import { formatDate, calculateAge, getStatusColor, getLabStatusLabel } from '@/lib/utils';
import { HOSPITAL_INFO } from '@/lib/hospitalConfig';

// database.types.ts predates migrations 039-042 (lab_test_parameters,
// lab_result_values, technician_id, the lab_* RPCs, new status enum values),
// so the typed client rejects them at compile time. Use an untyped handle
// for this page until the types are regenerated
// (npx supabase gen types typescript ... > src/lib/database.types.ts).
const db = supabase as any;

// Basic demo comparison only -- mirrors the server-side computation in
// lab_save_result_values (042 migration) so the technician sees the same
// flag before saving that will be stored after. Never presented as a
// medical diagnosis, just a Normal/Low/High convenience indicator.
function previewFlag(param: LabTestParameter, value: string): LabResultFlag | null {
  if (!value.trim()) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  if (param.ref_low != null && num < param.ref_low) return 'LOW';
  if (param.ref_high != null && num > param.ref_high) return 'HIGH';
  if (param.ref_low != null || param.ref_high != null) return 'NORMAL';
  return null;
}

const LAB_STAGES: { status: string; label: string }[] = [
  { status: 'PENDING', label: 'Ordered' },
  { status: 'SAMPLE_COLLECTED', label: 'Sample Collected' },
  { status: 'PROCESSING', label: 'Processing' },
  { status: 'RESULTS_ENTERED', label: 'Results Entered' },
  { status: 'COMPLETED', label: 'Finalized' },
];

export function LabOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isLabTech } = useRole();

  const [order, setOrder] = useState<LabOrder | null>(null);
  const [parameters, setParameters] = useState<LabTestParameter[]>([]);
  const [resultValues, setResultValues] = useState<LabResultValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const [formValues, setFormValues] = useState<Record<string, string>>({});

  // Legacy fallback for any LABORATORY test with no predefined
  // parameters (e.g. old seed tests never covered by this feature) --
  // keeps the original single-value lab_results flow working exactly as
  // it did before this page existed.
  const [legacyForm, setLegacyForm] = useState({ result_value: '', remarks: '', is_abnormal: false });

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    if (!id) return;
    setLoading(true);
    setFetchError('');

    const { data, error } = await db
      .from('lab_orders')
      .select(`
        *,
        patient:patients(*),
        doctor:doctors(full_name, specialization, registration_no),
        test:lab_tests(*),
        result:lab_results(*),
        technician:profiles!lab_orders_technician_id_fkey(full_name)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('Failed to load lab order:', error);
      setFetchError(error?.message || 'Lab order not found');
      setOrder(null);
      setLoading(false);
      return;
    }

    const loadedOrder = data as unknown as LabOrder;
    setOrder(loadedOrder);

    if (loadedOrder.test_id) {
      const [{ data: params }, { data: values }] = await Promise.all([
        db.from('lab_test_parameters').select('*').eq('test_id', loadedOrder.test_id).order('sort_order'),
        db.from('lab_result_values').select('*, parameter:lab_test_parameters(*)').eq('lab_order_id', id),
      ]);
      const paramList = (params || []) as unknown as LabTestParameter[];
      const valueList = (values || []) as unknown as LabResultValue[];
      setParameters(paramList);
      setResultValues(valueList);

      const initialForm: Record<string, string> = {};
      for (const p of paramList) {
        const existing = valueList.find(v => v.parameter_id === p.id);
        initialForm[p.id] = existing?.result_value || '';
      }
      setFormValues(initialForm);

      if (loadedOrder.result) {
        setLegacyForm({
          result_value: loadedOrder.result.result_value || '',
          remarks: loadedOrder.result.remarks || '',
          is_abnormal: loadedOrder.result.is_abnormal || false,
        });
      }
    }

    setLoading(false);
  }

  async function runAction(fn: () => PromiseLike<{ error: any }>) {
    setBusy(true);
    setActionError('');
    const { error } = await fn();
    if (error) {
      console.error(error);
      setActionError(error.message || 'Action failed');
    } else {
      await fetchData();
    }
    setBusy(false);
  }

  async function handleMarkSampleCollected() {
    await runAction(() => db.rpc('lab_start_sample_collection', { p_order_id: id! }));
  }

  async function handleStartProcessing() {
    await runAction(() => db.rpc('lab_start_processing', { p_order_id: id! }));
  }

  async function handleSaveResults(e: React.FormEvent) {
    e.preventDefault();
    const values = parameters
      .map(p => ({ parameter_id: p.id, result_value: (formValues[p.id] || '').trim() }))
      .filter(v => v.result_value !== '');
    if (values.length === 0) return;
    await runAction(() => db.rpc('lab_save_result_values', { p_order_id: id!, p_values: values }));
  }

  async function handleFinalize() {
    await runAction(() => db.rpc('lab_finalize_report', { p_order_id: id! }));
  }

  async function handleLegacyResultSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setBusy(true);
    setActionError('');
    const { error: resultError } = await db.from('lab_results').upsert({
      lab_order_id: id,
      ...legacyForm,
      recorded_by: user?.id,
    }, { onConflict: 'lab_order_id' });
    if (resultError) {
      setActionError(resultError.message);
      setBusy(false);
      return;
    }
    const { error: statusError } = await db.from('lab_orders')
      .update({ status: 'COMPLETED', completed_at: new Date().toISOString(), technician_id: user?.id })
      .eq('id', id);
    if (statusError) setActionError(statusError.message);
    await fetchData();
    setBusy(false);
  }

  if (loading) return <div className="flex h-96 items-center justify-center">Loading...</div>;
  if (!order) return (
    <div className="flex h-96 flex-col items-center justify-center gap-2 text-center">
      <p className="text-gray-700">Lab order not found</p>
      {fetchError && <p className="max-w-md text-sm text-red-600">{fetchError}</p>}
      <button onClick={() => navigate('/laboratory')} className="btn-secondary mt-2">Back to Laboratory</button>
    </div>
  );

  const { patient, doctor, test, technician } = order;
  const age = calculateAge(patient?.date_of_birth);
  const sex = patient?.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : null;
  const ageSex = [age !== null ? `${age} yrs` : null, sex].filter(Boolean).join(' / ');
  const isFinalized = order.status === 'COMPLETED';
  const allParamsFilled = parameters.length > 0 && parameters.every(p => (formValues[p.id] || '').trim() !== '');
  const canFinalize = parameters.length > 0
    ? allParamsFilled
    : resultValues.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => navigate('/laboratory')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to Laboratory
        </button>
        {isFinalized && (
          <button onClick={() => window.print()} className="btn-primary text-xs py-1.5 px-3">
            <Printer className="h-3.5 w-3.5 mr-1" /> Print / Save as PDF
          </button>
        )}
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 print:hidden">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {actionError}
        </div>
      )}

      {/* Header card -- on-screen summary, hidden pieces re-shown in the print letterhead below */}
      <div className="card print:hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <FlaskConical className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{test?.name}</h1>
              <p className="text-sm text-gray-500">{patient?.full_name} ({ageSex || '—'}) · Patient Code: {patient?.patient_code}</p>
              <p className="text-xs text-gray-400">Ordered by Dr. {doctor?.full_name} on {formatDate(order.ordered_at)}</p>
            </div>
          </div>
          <span className={`badge ${getStatusColor(order.status)}`}>{getLabStatusLabel(order.status)}</span>
        </div>

        {order.notes && (
          <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            <span className="font-medium text-gray-500">Clinical notes: </span>{order.notes}
          </div>
        )}

        {parameters.length > 0 && (
          <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
            {LAB_STAGES.map((stage, i) => {
              const currentIdx = LAB_STAGES.findIndex(s => s.status === order.status);
              const reached = currentIdx >= i;
              return (
                <div key={stage.status} className="flex items-center gap-2">
                  <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${reached ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-400'}`}>
                    {reached ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    {stage.label}
                  </div>
                  {i < LAB_STAGES.length - 1 && <div className={`h-0.5 w-4 ${reached ? 'bg-primary-300' : 'bg-gray-200'}`} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- */}
      {/* LABORATORY WORKFLOW -- parameterized panel test              */}
      {/* ---------------------------------------------------------- */}
      {parameters.length > 0 && (
        <>
          {isLabTech() && !isFinalized && (
            <div className="card print:hidden">
              <div className="flex flex-wrap items-center gap-3">
                {order.status === 'PENDING' && (
                  <button disabled={busy} onClick={handleMarkSampleCollected} className="btn-secondary">Mark Sample Collected</button>
                )}
                {order.status === 'SAMPLE_COLLECTED' && (
                  <button disabled={busy} onClick={handleStartProcessing} className="btn-secondary">Start Processing</button>
                )}
                <span className="text-xs text-gray-400">Enter results below at any stage -- saving will advance the report to "Results Entered" automatically.</span>
              </div>
            </div>
          )}

          <div className="card print:border-0 print:shadow-none print:p-0 print:rounded-none mx-auto max-w-3xl print:max-w-none">
            <div className="border-b-2 border-primary-700 pb-3 text-center hidden print:block">
              <h1 className="text-xl font-bold uppercase tracking-wide text-primary-800">{HOSPITAL_INFO.name}</h1>
              <p className="text-xs text-gray-500">{HOSPITAL_INFO.tagline}</p>
              <p className="mt-1 text-[11px] text-gray-500">{HOSPITAL_INFO.address} | Ph: {HOSPITAL_INFO.phone}</p>
            </div>

            <div className="print:mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-b border-gray-200 pb-3 text-xs">
              <div><span className="text-gray-500">Patient: </span><span className="font-semibold text-gray-900">{patient?.full_name}</span></div>
              <div><span className="text-gray-500">Age/Sex: </span><span className="font-medium text-gray-900">{ageSex || '—'}</span></div>
              <div><span className="text-gray-500">Patient Code: </span><span className="font-medium text-gray-900">{patient?.patient_code}</span></div>
              <div><span className="text-gray-500">Ordering Doctor: </span><span className="font-medium text-gray-900">Dr. {doctor?.full_name}</span></div>
              <div><span className="text-gray-500">Test: </span><span className="font-medium text-gray-900">{test?.name}</span></div>
              <div><span className="text-gray-500">Order Date: </span><span className="font-medium text-gray-900">{formatDate(order.ordered_at)}</span></div>
            </div>

            <form onSubmit={handleSaveResults}>
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-300 text-left text-gray-500">
                    <th className="py-2 pr-2">Parameter</th>
                    <th className="py-2 pr-2">Result</th>
                    <th className="py-2 pr-2">Unit</th>
                    <th className="py-2 pr-2">Reference Range</th>
                    <th className="py-2 pr-2">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {parameters.map(p => {
                    const value = formValues[p.id] || '';
                    const flag = previewFlag(p, value);
                    return (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="py-2 pr-2 font-medium text-gray-900">{p.name}</td>
                        <td className="py-2 pr-2">
                          {isFinalized || !isLabTech() ? (
                            <span className="text-gray-900">{value || '—'}</span>
                          ) : (
                            <input
                              value={value}
                              onChange={e => setFormValues({ ...formValues, [p.id]: e.target.value })}
                              className="input py-1 text-sm print:hidden"
                              placeholder="______"
                            />
                          )}
                        </td>
                        <td className="py-2 pr-2 text-gray-600">{p.unit || '—'}</td>
                        <td className="py-2 pr-2 text-gray-600">{p.reference_range || '—'}</td>
                        <td className="py-2 pr-2">
                          {flag ? <span className={`badge ${getStatusColor(flag)}`}>{flag}</span> : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {isLabTech() && !isFinalized && (
                <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
                  <button type="submit" disabled={busy} className="btn-secondary">Save Results</button>
                  <button
                    type="button"
                    disabled={busy || !canFinalize || order.status !== 'RESULTS_ENTERED'}
                    onClick={handleFinalize}
                    className="btn-primary"
                  >
                    <FileCheck className="h-4 w-4 mr-2" /> Finalize Report
                  </button>
                  {!canFinalize && <span className="text-xs text-gray-400">All parameters must have a value before finalizing.</span>}
                </div>
              )}
            </form>

            {isFinalized && (
              <div className="mt-5 border-t border-gray-200 pt-4 text-xs text-gray-600">
                <p className="font-semibold text-gray-800">Authorization</p>
                <p>Technician: {technician?.full_name || '—'}</p>
                <p>Status: FINALIZED</p>
                <p>Date/Time: {order.completed_at ? new Date(order.completed_at).toLocaleString('en-IN') : '—'}</p>
                <p className="mt-2 italic text-gray-400">Reference ranges and Normal/Low/High flags are a basic demo comparison only and do not constitute a medical diagnosis.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------------------------------------------------------- */}
      {/* LEGACY FALLBACK -- laboratory test with no predefined       */}
      {/* parameters (pre-dates this feature); keeps working exactly */}
      {/* as the original single-value LaboratoryPage modal did.     */}
      {/* ---------------------------------------------------------- */}
      {parameters.length === 0 && (
        <div className="card mx-auto max-w-3xl print:border-0 print:shadow-none print:p-0 print:rounded-none print:max-w-none">
          <div className="border-b-2 border-primary-700 pb-3 text-center hidden print:block">
            <h1 className="text-xl font-bold uppercase tracking-wide text-primary-800">{HOSPITAL_INFO.name}</h1>
            <p className="text-xs text-gray-500">{HOSPITAL_INFO.tagline}</p>
            <p className="mt-1 text-[11px] text-gray-500">{HOSPITAL_INFO.address} | Ph: {HOSPITAL_INFO.phone}</p>
          </div>
          <div className="hidden print:grid mt-3 grid-cols-2 gap-x-6 gap-y-1 border-b border-gray-200 pb-3 text-xs">
            <div><span className="text-gray-500">Patient: </span><span className="font-semibold">{patient?.full_name}</span></div>
            <div><span className="text-gray-500">Age/Sex: </span><span className="font-medium">{ageSex || '—'}</span></div>
            <div><span className="text-gray-500">Patient Code: </span><span className="font-medium">{patient?.patient_code}</span></div>
            <div><span className="text-gray-500">Ordering Doctor: </span><span className="font-medium">Dr. {doctor?.full_name}</span></div>
            <div><span className="text-gray-500">Test: </span><span className="font-medium">{test?.name}</span></div>
            <div><span className="text-gray-500">Order Date: </span><span className="font-medium">{formatDate(order.ordered_at)}</span></div>
          </div>
          {isFinalized ? (
            <div className="print:mt-4">
              <p className="text-sm font-medium text-gray-900">Result: {order.result?.result_value} {test?.unit}</p>
              {order.result?.remarks && <p className="mt-1 text-sm text-gray-500">{order.result.remarks}</p>}
              <p className="mt-2 text-xs text-gray-400">Recorded: {order.result?.recorded_at ? formatDate(order.result.recorded_at) : '—'}</p>
            </div>
          ) : isLabTech() ? (
            <form onSubmit={handleLegacyResultSubmit} className="space-y-4">
              <div>
                <label className="label">Result Value *</label>
                <input required value={legacyForm.result_value} onChange={e => setLegacyForm({ ...legacyForm, result_value: e.target.value })} className="input" placeholder={`Normal range: ${test?.normal_range || ''} ${test?.unit || ''}`} />
              </div>
              <div>
                <label className="label">Remarks</label>
                <textarea value={legacyForm.remarks} onChange={e => setLegacyForm({ ...legacyForm, remarks: e.target.value })} className="input" rows={2} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_abnormal" checked={legacyForm.is_abnormal} onChange={e => setLegacyForm({ ...legacyForm, is_abnormal: e.target.checked })} className="rounded border-gray-300 text-primary-600" />
                <label htmlFor="is_abnormal" className="text-sm text-gray-700">Abnormal Result</label>
              </div>
              <button type="submit" disabled={busy} className="btn-primary">Submit & Finalize Result</button>
            </form>
          ) : (
            <p className="text-sm text-gray-500">Awaiting lab technician to enter the result.</p>
          )}
        </div>
      )}
    </div>
  );
}
