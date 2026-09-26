import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'hms:daily-history:';
const MAX_DAYS = 8;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Day-1 shim for KPI trend sparklines: records today's value once per
 * metric per day, in this browser's localStorage, and returns up to the
 * last 8 days recorded.
 *
 * This is NOT real cross-device history -- it only sees values from
 * sessions on this device, and starts empty for every new user/browser.
 * It's here so the trend UI can ship now without a backend change.
 *
 * Recommended follow-up: a small read-only server view/materialized
 * table snapshotting get_dashboard_stats()'s fields once a day (e.g. a
 * `dashboard_daily_snapshots` table + a scheduled Edge Function), then
 * swap this hook's body for a query against that instead of localStorage.
 * The call sites (StatCard etc.) don't need to change.
 */
export function useDailyHistory(metricKey: string, currentValue: number | null | undefined): number[] {
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    if (currentValue == null || Number.isNaN(currentValue)) return;
    const storageKey = STORAGE_PREFIX + metricKey;
    let record: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) record = JSON.parse(raw);
    } catch {
      record = {};
    }
    record[todayKey()] = currentValue;

    const days = Object.keys(record).sort().slice(-MAX_DAYS);
    const trimmed: Record<string, number> = {};
    days.forEach((d) => { trimmed[d] = record[d]; });

    try {
      localStorage.setItem(storageKey, JSON.stringify(trimmed));
    } catch {
      // Storage full or unavailable -- trend just won't persist. Non-fatal.
    }
    setHistory(days.map((d) => trimmed[d]));
  }, [metricKey, currentValue]);

  return history;
}
