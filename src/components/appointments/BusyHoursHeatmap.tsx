import { Fragment, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Matches TIME_SLOTS' business hours (09:00-17:30), skipping the 13:00
// lunch gap where no slots exist -- see lib/utils.ts TIME_SLOTS.
const HOURS = [9, 10, 11, 12, 14, 15, 16, 17];
const WEEKS_OF_HISTORY = 8;

type Grid = number[][]; // [dayIndex][hourIndex] -> appointment count

/**
 * Real data, not a mock: queries appointment_date/appointment_time for the
 * last 8 weeks and counts bookings per (weekday, hour) cell. Only needs
 * two lightweight columns, no joins. Deliberately excludes CANCELLED
 * appointments -- a slot that got cancelled was never actually "busy".
 */
export function BusyHoursHeatmap() {
  const [grid, setGrid] = useState<Grid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ day: number; hour: number; count: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const since = new Date();
      since.setDate(since.getDate() - WEEKS_OF_HISTORY * 7);
      const sinceStr = since.toISOString().split('T')[0];

      const { data, error: err } = await supabase
        .from('appointments')
        .select('appointment_date, appointment_time, status')
        .gte('appointment_date', sinceStr)
        .neq('status', 'CANCELLED');

      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }

      const counts: Grid = DAYS.map(() => HOURS.map(() => 0));
      (data || []).forEach((row: { appointment_date: string; appointment_time: string }) => {
        const d = new Date(row.appointment_date + 'T00:00');
        const dayIdx = (d.getDay() + 6) % 7; // getDay() is Sun=0; we want Mon=0
        const hour = Number(row.appointment_time.split(':')[0]);
        const hourIdx = HOURS.indexOf(hour);
        if (hourIdx >= 0) counts[dayIdx][hourIdx]++;
      });
      setGrid(counts);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <p className="text-sm text-danger-fg">Couldn't load busy-hours data: {error}</p>;
  }
  if (!grid) {
    return <div className="h-40 animate-pulse rounded-lg bg-surface-muted" />;
  }

  const max = Math.max(1, ...grid.flat());
  const totalBookings = grid.flat().reduce((a, b) => a + b, 0);
  if (totalBookings === 0) {
    return <p className="text-sm text-ink-muted">Not enough appointment history yet ({WEEKS_OF_HISTORY} weeks) to show a pattern.</p>;
  }

  return (
    <div>
      <div className="grid text-xs" style={{ gridTemplateColumns: `36px repeat(${HOURS.length}, 1fr)`, gap: '3px' }}>
        <div />
        {HOURS.map((h) => (
          <div key={h} className="pb-1 text-center font-medium text-ink-subtle">
            {h > 12 ? h - 12 : h}{h >= 12 ? 'p' : 'a'}
          </div>
        ))}
        {DAYS.map((day, dayIdx) => (
          <Fragment key={day}>
            <div key={day} className="flex items-center pr-1 text-right font-medium text-ink-subtle">{day}</div>
            {HOURS.map((h, hourIdx) => {
              const count = grid[dayIdx][hourIdx];
              const intensity = count === 0 ? 0 : 0.12 + (count / max) * 0.88;
              return (
                <div
                  key={`${day}-${h}`}
                  onMouseEnter={() => setHovered({ day: dayIdx, hour: hourIdx, count })}
                  onMouseLeave={() => setHovered(null)}
                  className="relative aspect-[1.3] cursor-default overflow-hidden rounded bg-surface-muted transition-transform hover:scale-110"
                >
                  <div className="absolute inset-0 bg-primary-500" style={{ opacity: intensity }} />
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {hovered
          ? `${DAYS[hovered.day]} ${HOURS[hovered.hour] > 12 ? HOURS[hovered.hour] - 12 : HOURS[hovered.hour]}${HOURS[hovered.hour] >= 12 ? 'pm' : 'am'} \u2014 ${hovered.count} appointment${hovered.count === 1 ? '' : 's'} over the last ${WEEKS_OF_HISTORY} weeks`
          : `Hover a cell for detail \u00b7 based on the last ${WEEKS_OF_HISTORY} weeks (${totalBookings} appointments), excluding cancellations`}
      </p>
    </div>
  );
}
