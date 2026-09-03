import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { UserPlus, Users, Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import type { UserRole, Department } from '@/types';
import { DAYS_OF_WEEK, normalizeSpecialization } from '@/lib/utils';

const initialForm = {
  email: '',
  password: '',
  full_name: '',
  role: 'receptionist' as UserRole,
  // Doctor-only fields below. Only sent to the edge function when role === 'doctor'.
  // Same field set, validation, and normalization as the standalone Add Doctor
  // form (DoctorsPage.tsx) so a doctor created from either screen ends up
  // identically shaped.
  phone: '',
  department_id: '',
  specialization: '',
  qualification: '',
  registration_no: '',
  consultation_fee: '',
  experience_years: '',
  available_days: [] as string[],
  available_time_start: '',
  available_time_end: '',
};

export function SettingsPage() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [showUserModal, setShowUserModal] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [userForm, setUserForm] = useState(initialForm);
  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    if (isAdmin()) {
      supabase.from('departments').select('*').order('name').then(({ data }) => setDepartments(data || []));
    }
  }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');

    // Native `required` on individual inputs covers most doctor fields, but
    // the Available Days checkbox group has no single input to attach it to,
    // and "end time after start time" needs cross-field comparison HTML
    // validation can't express - both are checked here before the request
    // is sent, exactly as in the standalone Add Doctor form.
    if (userForm.role === 'doctor') {
      if (userForm.available_days.length === 0) {
        setError('Select at least one available day.');
        return;
      }
      if (userForm.available_time_start && userForm.available_time_end && userForm.available_time_end <= userForm.available_time_start) {
        setError('Available To must be after Available From.');
        return;
      }
    }

    setCreating(true);

    try {
      const body: Record<string, unknown> = {
        email: userForm.email.trim().toLowerCase(),
        password: userForm.password,
        full_name: userForm.full_name.trim(),
        role: userForm.role,
      };

      // Doctor-role user creation and doctor-record creation are a single
      // atomic action: the edge function creates the login and, on success,
      // inserts the linked doctors row (doctors.user_id = new profile id) in
      // the same request. A follow-up "link to existing doctor" step was
      // deliberately rejected - that manual step is exactly what had already
      // been silently skipped for every doctor created so far.
      if (userForm.role === 'doctor') {
        body.doctor = {
          department_id: userForm.department_id,
          phone: userForm.phone.trim(),
          specialization: normalizeSpecialization(userForm.specialization),
          qualification: userForm.qualification.trim(),
          registration_no: userForm.registration_no.trim(),
          consultation_fee: parseFloat(userForm.consultation_fee) || 0,
          experience_years: parseInt(userForm.experience_years) || 0,
          available_days: userForm.available_days,
          available_time_start: userForm.available_time_start,
          available_time_end: userForm.available_time_end,
          is_active: true,
        };
      }

      const { data, error: invokeError } = await supabase.functions.invoke('create-user', { body });

      if (invokeError) {
        let details = invokeError.message || 'Could not create user.';
        try {
          const response = invokeError.context as Response | undefined;
          if (response) {
            const responseBody = await response.json();
            if (responseBody?.error) details = responseBody.error;
          }
        } catch {
          // Keep the original error message.
        }
        throw new Error(details);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setMessage('User created successfully. They can now sign in with the credentials you provided.');
      setUserForm(initialForm);
      setShowUserModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">System configuration and user management</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
              <Shield className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
              <p className="text-sm text-gray-500">Create system users without changing your admin session</p>
            </div>
          </div>

          {isAdmin() ? (
            <button onClick={() => { setError(''); setMessage(''); setShowUserModal(true); }} className="btn-primary w-full">
              <UserPlus className="h-4 w-4 mr-2" /> Create New User
            </button>
          ) : (
            <p className="text-sm text-gray-500">Only administrators can manage users.</p>
          )}

          {message && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-medical-100">
              <Users className="h-5 w-5 text-medical-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Your Profile</h2>
              <p className="text-sm text-gray-500">Current user information</p>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <p><span className="text-gray-500">Name:</span> <span className="font-medium">{user?.full_name}</span></p>
            <p><span className="text-gray-500">Email:</span> <span className="font-medium">{user?.email}</span></p>
            <p><span className="text-gray-500">Role:</span> <span className="capitalize font-medium">{user?.role?.replace('_', ' ')}</span></p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Information</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Application</p>
            <p className="text-sm font-medium text-gray-900">MediCare HMS v1.0</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Backend</p>
            <p className="text-sm font-medium text-gray-900">Supabase PostgreSQL</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Frontend</p>
            <p className="text-sm font-medium text-gray-900">React + Vite + Tailwind CSS</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Authentication</p>
            <p className="text-sm font-medium text-gray-900">Supabase Auth + Row Level Security</p>
          </div>
        </div>
      </div>

      <Modal isOpen={showUserModal} onClose={() => !creating && setShowUserModal(false)} title="Create New User" size={userForm.role === 'doctor' ? 'lg' : 'md'}>
        <form onSubmit={handleCreateUser} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Full Name *</label>
              <input
                required
                value={userForm.full_name}
                onChange={e => setUserForm({ ...userForm, full_name: e.target.value })}
                className="input"
                placeholder="Dr. John Doe"
              />
            </div>

            <div>
              <label className="label">Email *</label>
              <input
                type="email"
                required
                value={userForm.email}
                onChange={e => setUserForm({ ...userForm, email: e.target.value })}
                className="input"
                placeholder="user@medicare.com"
              />
            </div>

            <div>
              <label className="label">Password *</label>
              <input
                type="password"
                required
                minLength={8}
                value={userForm.password}
                onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                className="input"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label className="label">Role *</label>
              <select
                required
                value={userForm.role}
                onChange={e => setUserForm({ ...userForm, role: e.target.value as UserRole })}
                className="input"
              >
                <option value="admin">Admin</option>
                <option value="receptionist">Receptionist</option>
                <option value="doctor">Doctor</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="lab_technician">Lab Technician</option>
              </select>
            </div>
          </div>

          {/* Expands inline the moment "Doctor" is selected: same field set,
              layout, and required/optional split as the standalone Add Doctor
              form (DoctorsPage.tsx), so the two creation paths never drift. */}
          {userForm.role === 'doctor' && (
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">Doctor Details</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Phone *</label>
                  <input required pattern="[0-9]{10}" title="10-digit phone number" value={userForm.phone} onChange={e => setUserForm({ ...userForm, phone: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Department *</label>
                  <select required value={userForm.department_id} onChange={e => setUserForm({ ...userForm, department_id: e.target.value })} className="input">
                    <option value="">Select Department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}{!d.is_active ? ' (Inactive)' : ''}</option>)}
                  </select>
                  {departments.length === 0 && <p className="mt-1 text-xs text-red-500">No departments found. Add a department first.</p>}
                </div>
                <div>
                  <label className="label">Specialization</label>
                  <input value={userForm.specialization} onChange={e => setUserForm({ ...userForm, specialization: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Qualification</label>
                  <input value={userForm.qualification} onChange={e => setUserForm({ ...userForm, qualification: e.target.value })} className="input" placeholder="e.g. MBBS, MD (Medicine)" />
                </div>
                <div>
                  <label className="label">Registration No.</label>
                  <input value={userForm.registration_no} onChange={e => setUserForm({ ...userForm, registration_no: e.target.value })} className="input" placeholder="e.g. UPMC/2014/12345" />
                </div>
                <div>
                  <label className="label">Consultation Fee (₹) *</label>
                  <input type="number" required min="0" step="0.01" value={userForm.consultation_fee} onChange={e => setUserForm({ ...userForm, consultation_fee: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Experience (Years)</label>
                  <input type="number" value={userForm.experience_years} onChange={e => setUserForm({ ...userForm, experience_years: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Available From *</label>
                  <input type="time" required value={userForm.available_time_start} onChange={e => setUserForm({ ...userForm, available_time_start: e.target.value })} className="input" />
                </div>
                <div>
                  <label className="label">Available To *</label>
                  <input type="time" required value={userForm.available_time_end} onChange={e => setUserForm({ ...userForm, available_time_end: e.target.value })} className="input" />
                </div>
                <div className="sm:col-span-2">
                  <label className="label">Available Days *</label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <label key={day} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors ${userForm.available_days.includes(day) ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        <input type="checkbox" className="sr-only" checked={userForm.available_days.includes(day)} onChange={e => {
                          setUserForm({ ...userForm, available_days: e.target.checked ? [...userForm.available_days, day] : userForm.available_days.filter(d => d !== day) });
                        }} />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowUserModal(false)} disabled={creating} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={creating} className="btn-primary">
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
