import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { Doctor, Appointment } from '@/types';
import { ArrowLeft, Stethoscope, Calendar, Clock} from 'lucide-react';
import { formatDate, formatTime, formatCurrency, getStatusColor } from '@/lib/utils';

export function DoctorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) fetchData(); }, [id]);

  async function fetchData() {
    if (!id) return;
    const [{ data: d }, { data: a }] = await Promise.all([
      supabase.from('doctors').select('*, department:departments(name)').eq('id', id).single(),
      supabase.from('appointments').select('*, patient:patients(full_name)').eq('doctor_id', id).order('appointment_date', { ascending: false }).limit(10)
    ]);
    setDoctor(d as unknown as Doctor | null);
    setAppointments((a || []) as unknown as Appointment[]);
    setLoading(false);
  }

  if (loading) return <div className="flex h-96 items-center justify-center">Loading...</div>;
  if (!doctor) return <div className="flex h-96 items-center justify-center">Doctor not found</div>;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/doctors')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
            <Stethoscope className="h-8 w-8 text-primary-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{doctor.full_name}</h1>
            <p className="text-primary-600">{doctor.specialization}</p>
            <p className="text-sm text-gray-500">{doctor.department?.name}</p>
            {(doctor.qualification || doctor.registration_no) && (
              <p className="text-sm text-gray-500">
                {doctor.qualification}
                {doctor.qualification && doctor.registration_no ? ' · ' : ''}
                {doctor.registration_no ? `Reg. No: ${doctor.registration_no}` : ''}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1"> {formatCurrency(doctor.consultation_fee)}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {doctor.experience_years} years exp.</span>
            </div>
            {doctor.available_days?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-gray-500 mb-1">Available Days</p>
                <div className="flex flex-wrap gap-1">
                  {doctor.available_days.map(d => <span key={d} className="rounded bg-primary-50 px-2 py-0.5 text-xs text-primary-700">{d}</span>)}
                </div>
                {doctor.available_time_start && doctor.available_time_end && (
                  <p className="mt-1 text-xs text-gray-500">{formatTime(doctor.available_time_start)} - {formatTime(doctor.available_time_end)}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Appointments</h2>
        {appointments.length === 0 ? <p className="text-center text-gray-500 py-8">No appointments found</p> : (
          <div className="space-y-3">
            {appointments.map(a => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{a.patient?.full_name}</p>
                  <p className="text-xs text-gray-500">{formatDate(a.appointment_date)} at {formatTime(a.appointment_time)}</p>
                </div>
                <span className={`badge ${getStatusColor(a.status)}`}>{a.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
