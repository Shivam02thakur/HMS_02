import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Prescription } from '@/types';
import { ArrowLeft, Printer, Phone, Mail, Clock, AlertTriangle, History } from 'lucide-react';
import { formatDate, calculateAge } from '@/lib/utils';
import { HOSPITAL_INFO } from '@/lib/hospitalConfig';

export function PrescriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [prescription, setPrescription] = useState<Prescription | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    if (!id) return;
    setLoading(true);
    // One query pulls everything the letterhead needs: patient details,
    // the doctor's full credentials (qualification, reg. no, department,
    // availability -- fetched automatically off doctor_id, nothing
    // re-entered by hand), the medicine list, and any lab tests ordered
    // from this prescription.
    //
    // The revision lineage (revision_of_prescription / superseded_by_prescription)
    // is deliberately NOT embedded here via a `prescriptions!fk_name(...)`
    // hint. Self-referencing embeds like that depend on PostgREST's schema
    // cache already knowing about the FK, which goes stale after every
    // migration until it's manually reloaded -- that's what was causing
    // "Could not find a relationship between 'prescriptions' and
    // 'prescriptions'". Plain follow-up queries below need nothing but the
    // columns to exist, so they can't break that way.
    const { data, error } = await supabase
      .from('prescriptions')
      .select(`
        *,
        patient:patients(*),
        doctor:doctors(*, department:departments(name)),
        items:prescription_items(*, medicine:medicines(name)),
        lab_orders(*, test:lab_tests(name, code))
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('Failed to load prescription:', error);
      setFetchError(error?.message || 'Prescription not found');
      setPrescription(null);
      setLoading(false);
      return;
    }

    const lineageIds = [data.revision_of, data.superseded_by].filter(Boolean) as string[];
    let lineageById = new Map<string, { id: string; prescription_number: string | null; created_at: string }>();
    if (lineageIds.length > 0) {
      const { data: lineageRows, error: lineageError } = await supabase
        .from('prescriptions')
        .select('id, prescription_number, created_at')
        .in('id', lineageIds);
      if (lineageError) console.error('Failed to load prescription lineage:', lineageError);
      lineageById = new Map((lineageRows || []).map(r => [r.id, r]));
    }

    setPrescription({
      ...(data as unknown as Prescription),
      revision_of_prescription: data.revision_of ? lineageById.get(data.revision_of) || null : null,
      superseded_by_prescription: data.superseded_by ? lineageById.get(data.superseded_by) || null : null,
    });
    setLoading(false);
  }

  if (loading) return <div className="flex h-96 items-center justify-center">Loading...</div>;
  if (!prescription) return (
    <div className="flex h-96 flex-col items-center justify-center gap-2 text-center">
      <p className="text-gray-700">Prescription not found</p>
      {fetchError && <p className="max-w-md text-sm text-red-600">{fetchError}</p>}
    </div>
  );

  const { patient, doctor, items, lab_orders, weight_kg, bp, pulse_bpm, temperature_f, spo2_percent, revision_of_prescription, superseded_by_prescription } = prescription;
  const age = calculateAge(patient?.date_of_birth);
  const sex = patient?.gender ? patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1) : null;
  const ageSex = [age !== null ? `${age} yrs` : null, sex].filter(Boolean).join(' / ');
  const availability = doctor?.available_days?.length
    ? `${doctor.available_days.join(', ')}${doctor.available_time_start ? ` · ${doctor.available_time_start}–${doctor.available_time_end || ''}` : ''}`
    : null;

  return (
    <div className="space-y-6">
      {/* On-screen toolbar -- hidden on the printed page */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => navigate('/prescriptions')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="h-4 w-4" /> Back to Prescriptions
        </button>
        <button onClick={() => window.print()} className="btn-primary text-xs py-1.5 px-3">
          <Printer className="h-3.5 w-3.5 mr-1" /> Print / Save as PDF
        </button>
      </div>

      {/* Hard warning: shown both on-screen AND in print. Printing a
          superseded prescription without this would be actively
          misleading to whoever reads the paper copy. */}
      {superseded_by_prescription && (
        <div className="mx-auto flex max-w-3xl items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 print:rounded-none">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            This prescription has been superseded by{' '}
            <button type="button" onClick={() => navigate(`/prescriptions/${superseded_by_prescription.id}`)} className="font-semibold underline print:no-underline">
              {superseded_by_prescription.prescription_number}
            </button>{' '}
            ({formatDate(superseded_by_prescription.created_at)}) and is no longer valid or purchasable.
          </span>
        </div>
      )}

      {/* Soft note: screen-only, since revising doesn't need flagging on
          the paper copy the way supersession does. */}
      {revision_of_prescription && (
        <div className="mx-auto flex max-w-3xl items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 print:hidden">
          <History className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            This prescription revises{' '}
            <button type="button" onClick={() => navigate(`/prescriptions/${revision_of_prescription.id}`)} className="font-semibold underline">
              {revision_of_prescription.prescription_number}
            </button>{' '}
            ({formatDate(revision_of_prescription.created_at)}).
          </span>
        </div>
      )}

      {/* Printable prescription document */}
      <div className="card print:border-0 print:shadow-none print:p-0 print:rounded-none mx-auto max-w-3xl print:max-w-none">
        {/* Letterhead */}
        <div className="border-b-2 border-primary-700 pb-3 text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide text-primary-800">{HOSPITAL_INFO.name}</h1>
          <p className="text-xs text-gray-500">{HOSPITAL_INFO.tagline}</p>
          <p className="mt-1 text-[11px] text-gray-500">
            Address: {HOSPITAL_INFO.address} | Ph: {HOSPITAL_INFO.phone} | Emergency: Contact Nearest Hospital
          </p>
        </div>

        {/* Doctor info block */}
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-b border-gray-200 pb-3 text-xs">
          <div><span className="text-gray-500">Doctor Name: </span><span className="font-semibold text-gray-900">Dr. {doctor?.full_name}</span></div>
          <div><span className="text-gray-500">Department: </span><span className="font-medium text-gray-900">{doctor?.department?.name || '—'}</span></div>
          <div><span className="text-gray-500">Qualification: </span><span className="font-medium text-gray-900">{doctor?.qualification || '—'}</span></div>
          <div><span className="text-gray-500">Reg. No: </span><span className="font-medium text-gray-900">{doctor?.registration_no || '—'}</span></div>
          <div><span className="text-gray-500">Specialization: </span><span className="font-medium text-gray-900">{doctor?.specialization || '—'}</span></div>
          <div><span className="text-gray-500">Experience: </span><span className="font-medium text-gray-900">{doctor?.experience_years ?? '—'} yrs</span></div>
          <div className="flex items-center gap-1"><Phone className="h-3 w-3 text-gray-400" /><span className="text-gray-500">Phone: </span><span className="font-medium text-gray-900">{doctor?.phone || '—'}</span></div>
          <div className="flex items-center gap-1"><Mail className="h-3 w-3 text-gray-400" /><span className="text-gray-500">Email: </span><span className="font-medium text-gray-900">{doctor?.email || '—'}</span></div>
          <div className="col-span-2 flex items-center gap-1"><Clock className="h-3 w-3 text-gray-400" /><span className="text-gray-500">Availability: </span><span className="font-medium text-gray-900">{availability || '—'}</span></div>
        </div>

        {/* Patient row */}
        <div className="mt-3 grid grid-cols-3 gap-4 border-b border-gray-200 pb-3 text-xs">
          <div><span className="text-gray-500">Patient Name: </span><span className="font-semibold text-gray-900">{patient?.full_name}</span></div>
          <div><span className="text-gray-500">Age/Sex: </span><span className="font-medium text-gray-900">{ageSex || '—'}</span></div>
          <div><span className="text-gray-500">Date: </span><span className="font-medium text-gray-900">{formatDate(prescription.created_at)}</span></div>
          <div className="col-span-3"><span className="text-gray-500">Prescription No: </span><span className="font-medium text-gray-900">{prescription.prescription_number || '—'}</span></div>
        </div>

        {/* Diagnosis & vitals */}
        <div className="mt-3 border-b border-gray-200 pb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Diagnosis & Clinical Notes</p>
          <p className="mt-1 text-sm text-gray-900">{prescription.diagnosis || '—'}</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-600">
            <span>Weight: <span className="font-medium text-gray-900">{weight_kg ?? '____'}</span> kg</span>
            <span>BP: <span className="font-medium text-gray-900">{bp || '____'}</span> mmHg</span>
            <span>Pulse: <span className="font-medium text-gray-900">{pulse_bpm ?? '____'}</span> bpm</span>
            <span>Temp: <span className="font-medium text-gray-900">{temperature_f ?? '____'}</span> °F</span>
            <span>SpO2: <span className="font-medium text-gray-900">{spo2_percent ?? '____'}</span> %</span>
          </div>
        </div>

        {/* Rx - medicines */}
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <span className="font-serif text-2xl italic text-primary-800">℞</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Medicines</span>
          </div>
          {!items || items.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">No medicines prescribed.</p>
          ) : (
            <table className="mt-2 w-full text-xs">
              <thead>
                <tr className="border-b border-gray-300 text-left text-gray-500">
                  <th className="py-1.5 pr-2 w-8">#</th>
                  <th className="py-1.5 pr-2">Medicine</th>
                  <th className="py-1.5 pr-2">Dosage</th>
                  <th className="py-1.5 pr-2">Frequency</th>
                  <th className="py-1.5 pr-2">Duration</th>
                  <th className="py-1.5 pr-2">Qty</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2 text-gray-500">{i + 1}.</td>
                    <td className="py-1.5 pr-2 font-medium text-gray-900">
                      {item.medicine?.name}
                      {item.instructions && <span className="ml-1 text-gray-400">({item.instructions})</span>}
                    </td>
                    <td className="py-1.5 pr-2 text-gray-700">{item.dosage}</td>
                    <td className="py-1.5 pr-2 text-gray-700">{item.frequency}</td>
                    <td className="py-1.5 pr-2 text-gray-700">{item.duration}</td>
                    <td className="py-1.5 pr-2 text-gray-700">{item.quantity ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Notes / Instructions / Investigations */}
        <div className="mt-4 border-t border-gray-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes / Instructions / Investigations</p>
          {prescription.notes && <p className="mt-1 text-sm text-gray-800">{prescription.notes}</p>}
          {lab_orders && lab_orders.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500">Investigations Advised:</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-800">
                {lab_orders.map((lo, i) => <li key={i}>{lo.test?.name}{lo.test?.code ? ` (${lo.test.code})` : ''}</li>)}
              </ul>
            </div>
          )}
          {!prescription.notes && (!lab_orders || lab_orders.length === 0) && (
            <p className="mt-1 text-sm text-gray-400">—</p>
          )}
        </div>

        {/* Signature */}
        <div className="mt-10 flex justify-end">
          <div className="text-center text-xs">
            <div className="mb-1 h-12 w-40 border-b border-gray-400" />
            <p className="font-medium text-gray-900">Dr. {doctor?.full_name}</p>
            <p className="text-gray-500">Doctor's Signature & Stamp</p>
          </div>
        </div>

        {/* Footer disclaimer */}
        <div className="mt-6 border-t border-gray-200 pt-2 text-center text-[10px] text-gray-400">
          * Generated via {HOSPITAL_INFO.systemName} | {HOSPITAL_INFO.name} | Emergency Note: {HOSPITAL_INFO.emergencyNote}
        </div>
      </div>
    </div>
  );
}