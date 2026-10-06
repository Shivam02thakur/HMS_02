import type { Appointment } from '@/types';
import { formatTime } from '@/lib/utils';

/**
 * Business hours shown on the axis. Matches TIME_SLOTS in lib/utils.ts
 * (09:00-17:30, with the 13:00-13:30 lunch gap) -- if that range ever
 * changes, update DAY_START/DAY_END here too.
 */
const DAY_START_MIN = 9 * 60;
const DAY_END_MIN = 18 * 60;
const AXIS_LABELS = ['9a', '11a', '1p', '3p', '5p'];

const STATUS_TONE: Record<string, string> = {
  BOOKED: 'bg-info-bg text-info-fg border-info-fg/30',
  IN_PROGRESS: 'bg-info-bg text-info-fg border-info-fg/30',
  COMPLETED: 'bg-success-bg text-success-fg border-success-fg/30',
  CANCELLED: 'bg-danger-bg text-danger-fg border-danger-fg/30',
  NO_SHOW: 'bg-caution-bg text-caution-fg border-caution-fg/30',
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

interface LaneProps {
  label: string;
  appointments: Appointment[];
  showNowLine: boolean;
}

function Lane({ label, appointments, showNowLine }: LaneProps) {
  const now = nowMinutes();
  const nowPct = ((now - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 flex-shrink-0 truncate text-xs font-medium text-ink-muted">{label}</div>
      <div className="relative h-9 flex-1 rounded-lg bg-surface-muted">
        {showNowLine && nowPct >= 0 && nowPct <= 100 && (
          <div className="absolute bottom-0 top-0 w-0.5 bg-danger-fg" style={{ left: `${nowPct}%` }} />
        )}
        {appointments.map((appt) => {
          const start = timeToMinutes(appt.appointment_time);
          const leftPct = ((start - DAY_START_MIN) / (DAY_END_MIN - DAY_START_MIN)) * 100;
          const widthPct = (30 / (DAY_END_MIN - DAY_START_MIN)) * 100; // 30-min slot width
          const tone = STATUS_TONE[appt.status] ?? 'bg-neutral-bg text-neutral-fg border-neutral-fg/30';
          return (
            <div
              key={appt.id}
              className={`absolute top-1 bottom-1 flex items-center overflow-hidden rounded border px-1.5 text-[11px] font-medium whitespace-nowrap ${tone}`}
              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 4)}%` }}
              title={`${appt.patient?.full_name ?? 'Patient'} \u00b7 ${formatTime(appt.appointment_time)} \u00b7 ${appt.status}`}
            >
              {appt.patient?.full_name?.split(' ')[0]}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AppointmentTimelineProps {
  /** Single lane: all appointments belong to one doctor (their own day). */
  mode: 'single' | 'multi';
  /** mode='single': that doctor's appointments. mode='multi': all doctors'
   *  appointments for the day, grouped internally by doctor. */
  appointments: Appointment[];
  /** Only used in single mode, for the lane label. */
  doctorLabel?: string;
}

export function AppointmentTimeline({ mode, appointments, doctorLabel }: AppointmentTimelineProps) {
  const showNowLine = true; // caller only renders this for "today"

  let lanes: { label: string; appts: Appointment[] }[];
  if (mode === 'single') {
    lanes = [{ label: doctorLabel ?? 'You', appts: appointments }];
  } else {
    const byDoctor = new Map<string, { label: string; appts: Appointment[] }>();
    appointments.forEach((appt) => {
      const key = appt.doctor_id;
      const label = appt.doctor?.full_name ? `Dr. ${appt.doctor.full_name}` : 'Unknown';
      if (!byDoctor.has(key)) byDoctor.set(key, { label, appts: [] });
      byDoctor.get(key)!.appts.push(appt);
    });
    lanes = Array.from(byDoctor.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  if (lanes.length === 0 || appointments.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">No appointments to show on the timeline for this day.</p>;
  }

  return (
    <div className="space-y-2">
      {lanes.map((lane) => (
        <Lane key={lane.label} label={lane.label} appointments={lane.appts} showNowLine={showNowLine} />
      ))}
      <div className="ml-[108px] flex justify-between text-[11px] text-ink-subtle">
        {AXIS_LABELS.map((l) => <span key={l}>{l}</span>)}
      </div>
    </div>
  );
}
