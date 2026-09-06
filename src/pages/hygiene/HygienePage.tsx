import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CleaningZone, CleaningLog, CleaningZoneType, Ward } from '@/types';
import { Sparkles, Plus, CheckCircle2 } from 'lucide-react';

// Log-and-report, not proactive alerting/scheduling -- confirmed scope.
// The twice-daily rule is specifically about wards, not floors or
// chambers, so only ward-type zones get an under-target flag.
const WARD_DAILY_TARGET = 2;

const ZONE_TYPE_LABELS: Record<CleaningZoneType, string> = {
  ward: 'Wards', floor: 'Floors', chamber: 'Doctor Chambers', other: 'Other',
};

export function HygienePage() {
  const { user } = useAuth();
  const [zones, setZones] = useState<CleaningZone[]>([]);
  const [todayLogs, setTodayLogs] = useState<CleaningLog[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);

  const [showLogModal, setShowLogModal] = useState(false);
  const [logZone, setLogZone] = useState<CleaningZone | null>(null);
  const [logNotes, setLogNotes] = useState('');
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [logError, setLogError] = useState('');

  const [showAddZoneModal, setShowAddZoneModal] = useState(false);
  const [zoneForm, setZoneForm] = useState<{ name: string; zone_type: CleaningZoneType; ward_id: string }>({ name: '', zone_type: 'floor', ward_id: '' });
  const [addZoneError, setAddZoneError] = useState('');
  const [addZoneSubmitting, setAddZoneSubmitting] = useState(false);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [{ data: zonesData }, { data: logsData }, { data: wardsData }] = await Promise.all([
      supabase.from('cleaning_zones').select('*, ward:wards(*)').eq('is_active', true).order('zone_type').order('name'),
      supabase.from('cleaning_logs').select('*, logged_by_profile:profiles(full_name)').gte('cleaned_at', todayStart.toISOString()),
      supabase.from('wards').select('*').order('name'),
    ]);
    setZones((zonesData || []) as unknown as CleaningZone[]);
    setTodayLogs((logsData || []) as unknown as CleaningLog[]);
    setWards((wardsData || []) as unknown as Ward[]);
    setLoading(false);
  }

  // Computed client-side from the day's logs fetched once, rather than a
  // separate query per zone.
  function countFor(zoneId: string) {
    return todayLogs.filter(l => l.zone_id === zoneId).length;
  }

  function openLogModal(zone: CleaningZone) {
    setLogZone(zone);
    setLogNotes('');
    setLogError('');
    setShowLogModal(true);
  }

  async function handleLogCleaning() {
    if (!logZone || !user?.id) return;
    setLogSubmitting(true);
    setLogError('');
    const { error } = await supabase.from('cleaning_logs').insert({
      zone_id: logZone.id,
      logged_by: user.id,
      notes: logNotes || null,
    });
    setLogSubmitting(false);
    if (error) {
      setLogError('Could not log cleaning. Please try again.');
      console.error(error);
      return;
    }
    setShowLogModal(false);
    fetchData();
  }

  async function handleAddZone(e: React.FormEvent) {
    e.preventDefault();
    setAddZoneError('');
    if (!zoneForm.name.trim()) {
      setAddZoneError('Name is required.');
      return;
    }
    setAddZoneSubmitting(true);
    const { error } = await supabase.from('cleaning_zones').insert({
      name: zoneForm.name.trim(),
      zone_type: zoneForm.zone_type,
      ward_id: zoneForm.zone_type === 'ward' && zoneForm.ward_id ? zoneForm.ward_id : null,
    });
    setAddZoneSubmitting(false);
    if (error) {
      // Surfaces the "one active zone per ward" constraint directly if
      // it fires, rather than a generic message.
      setAddZoneError(error.message);
      console.error(error);
      return;
    }
    setShowAddZoneModal(false);
    setZoneForm({ name: '', zone_type: 'floor', ward_id: '' });
    fetchData();
  }

  const grouped: Record<CleaningZoneType, CleaningZone[]> = { ward: [], floor: [], chamber: [], other: [] };
  for (const z of zones) grouped[z.zone_type].push(z);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hygiene</h1>
          <p className="text-sm text-gray-500">Log and track cleaning across wards, floors, and chambers</p>
        </div>
        <button onClick={() => setShowAddZoneModal(true)} className="btn-primary">
          <Plus className="h-4 w-4 mr-1" /> Add Zone
        </button>
      </div>

      {loading ? <div className="py-12 text-center">Loading...</div> :
      zones.length === 0 ? <EmptyState title="No cleaning zones yet" /> : (
        (Object.keys(grouped) as CleaningZoneType[]).map(type => (
          grouped[type].length === 0 ? null : (
            <div key={type} className="card">
              <h2 className="mb-3 text-sm font-semibold text-gray-900">{ZONE_TYPE_LABELS[type]}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[type].map(zone => {
                  const count = countFor(zone.id);
                  const underTarget = type === 'ward' && count < WARD_DAILY_TARGET;
                  return (
                    <div key={zone.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{zone.name}</p>
                          <p className="text-xs text-gray-500">Cleaned today: {count}{type === 'ward' ? ` / ${WARD_DAILY_TARGET}` : ''}</p>
                        </div>
                        {type === 'ward' && (
                          <span className={`badge ${underTarget ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                            {underTarget ? 'Under target' : 'On target'}
                          </span>
                        )}
                      </div>
                      <button onClick={() => openLogModal(zone)} className="btn-secondary mt-3 w-full py-1.5 text-xs">
                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Log Cleaning
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ))
      )}

      <Modal isOpen={showLogModal} onClose={() => setShowLogModal(false)} title={`Log Cleaning — ${logZone?.name || ''}`} size="sm">
        <div className="space-y-4">
          <div>
            <label className="label">Notes (optional)</label>
            <textarea value={logNotes} onChange={e => setLogNotes(e.target.value)} className="input" rows={3} placeholder="Anything worth noting..." />
          </div>
          {logError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{logError}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowLogModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleLogCleaning} disabled={logSubmitting} className="btn-primary">
              <CheckCircle2 className="h-4 w-4 mr-1" /> {logSubmitting ? 'Logging...' : 'Log Cleaning'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAddZoneModal} onClose={() => setShowAddZoneModal(false)} title="Add Cleaning Zone" size="sm">
        <form onSubmit={handleAddZone} className="space-y-4">
          <div>
            <label className="label">Zone Type *</label>
            <select value={zoneForm.zone_type} onChange={e => setZoneForm({ ...zoneForm, zone_type: e.target.value as CleaningZoneType, ward_id: '' })} className="input">
              <option value="floor">Floor</option>
              <option value="chamber">Doctor Chamber</option>
              <option value="ward">Ward</option>
              <option value="other">Other</option>
            </select>
          </div>
          {zoneForm.zone_type === 'ward' && (
            <div>
              <label className="label">Link to Ward (optional)</label>
              <select value={zoneForm.ward_id} onChange={e => setZoneForm({ ...zoneForm, ward_id: e.target.value })} className="input">
                <option value="">None</option>
                {wards.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-500">A ward can only back one active zone at a time.</p>
            </div>
          )}
          <div>
            <label className="label">Name *</label>
            <input value={zoneForm.name} onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })} className="input" placeholder="e.g. Third Floor" />
          </div>
          {addZoneError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{addZoneError}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowAddZoneModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={addZoneSubmitting} className="btn-primary">{addZoneSubmitting ? 'Adding...' : 'Add Zone'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
