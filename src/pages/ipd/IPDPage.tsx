import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/hooks/useRole';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Ward, Bed, Admission, Patient, Doctor } from '@/types';
import { BedDouble, ArrowRight } from 'lucide-react';
import { getStatusColor } from '@/lib/utils';

export function IPDPage() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWard, setSelectedWard] = useState<string>('');
  const navigate = useNavigate();
  const { isReceptionist } = useRole();

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const [{ data: w }, { data: b }, { data: a }] = await Promise.all([
      supabase.from('wards').select('*').order('name'),
      supabase.from('beds').select('*, ward:wards(name, ward_type)').order('bed_number'),
      supabase.from('admissions').select('*, patient:patients(full_name), doctor:doctors(full_name), bed:beds(bed_number, ward:wards(name))').eq('status', 'ADMITTED').order('admission_date')
    ]);
    setWards((w || []) as unknown as Ward[]);
    setBeds((b || []) as unknown as Bed[]);
    setAdmissions((a || []) as unknown as Admission[]);
    setLoading(false);
  }

  const filteredBeds = selectedWard ? beds.filter(b => b.ward_id === selectedWard) : beds;

  const stats = {
    total: beds.length,
    occupied: beds.filter(b => b.status === 'OCCUPIED').length,
    vacant: beds.filter(b => b.status === 'VACANT').length,
    maintenance: beds.filter(b => b.status === 'MAINTENANCE').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IPD / Wards</h1>
          <p className="text-gray-500">Ward and bed management</p>
        </div>
        {isReceptionist() && (
          <button onClick={() => navigate('/ipd/admissions')} className="btn-primary">
            <ArrowRight className="h-4 w-4 mr-2" /> Manage Admissions
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card text-center">
          <p className="text-sm text-gray-500">Total Beds</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">Occupied</p>
          <p className="text-2xl font-bold text-red-600">{stats.occupied}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">Vacant</p>
          <p className="text-2xl font-bold text-green-600">{stats.vacant}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">Maintenance</p>
          <p className="text-2xl font-bold text-gray-600">{stats.maintenance}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSelectedWard('')} className={`rounded-lg px-4 py-2 text-sm font-medium ${!selectedWard ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
          All Wards
        </button>
        {wards.map(w => (
          <button key={w.id} onClick={() => setSelectedWard(w.id)} className={`rounded-lg px-4 py-2 text-sm font-medium ${selectedWard === w.id ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
            {w.name}
          </button>
        ))}
      </div>

      <div className="card">
        {loading ? <div className="py-12 text-center">Loading...</div> :
        filteredBeds.length === 0 ? <EmptyState title="No beds found" /> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {filteredBeds.map(bed => {
              const admission = admissions.find(a => a.bed_id === bed.id);
              return (
                <div key={bed.id} className={`rounded-xl border-2 p-4 text-center transition-all ${
                  bed.status === 'VACANT' ? 'border-green-200 bg-green-50' :
                  bed.status === 'OCCUPIED' ? 'border-red-200 bg-red-50' :
                  'border-gray-200 bg-gray-50'
                }`}>
                  <BedDouble className={`h-6 w-6 mx-auto mb-2 ${
                    bed.status === 'VACANT' ? 'text-green-600' :
                    bed.status === 'OCCUPIED' ? 'text-red-600' : 'text-gray-400'
                  }`} />
                  <p className="text-sm font-bold text-gray-900">{bed.bed_number}</p>
                  <p className="text-xs text-gray-500">{bed.ward?.name}</p>
                  <span className={`mt-2 inline-block badge ${getStatusColor(bed.status)}`}>{bed.status}</span>
                  {admission && (
                    <p className="mt-1 text-xs text-gray-600 truncate">{admission.patient?.full_name}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Current Admissions</h2>
        {admissions.length === 0 ? <EmptyState title="No active admissions" /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">Patient</th>
                  <th className="table-header">Ward / Bed</th>
                  <th className="table-header">Doctor</th>
                  <th className="table-header">Diagnosis</th>
                  <th className="table-header">Admitted</th>
                </tr>
              </thead>
              <tbody>
                {admissions.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">{a.patient?.full_name}</td>
                    <td className="table-cell">{a.bed?.ward?.name} - {a.bed?.bed_number}</td>
                    <td className="table-cell">Dr. {a.doctor?.full_name}</td>
                    <td className="table-cell">{a.diagnosis || '-'}</td>
                    <td className="table-cell text-gray-500">{new Date(a.admission_date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
