import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/hooks/useRole';
import { Modal } from '@/components/ui/Modal';
import { UserPlus, Users, Shield, CheckCircle2, AlertCircle } from 'lucide-react';
import type { UserRole } from '@/types';

const initialForm = {
  email: '',
  password: '',
  full_name: '',
  role: 'receptionist' as UserRole,
};

export function SettingsPage() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const [showUserModal, setShowUserModal] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [userForm, setUserForm] = useState(initialForm);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setMessage('');
    setError('');
    setCreating(true);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('create-user', {
        body: {
          email: userForm.email.trim().toLowerCase(),
          password: userForm.password,
          full_name: userForm.full_name.trim(),
          role: userForm.role,
        },
      });

      if (invokeError) {
        let details = invokeError.message || 'Could not create user.';
        try {
          const response = invokeError.context as Response | undefined;
          if (response) {
            const body = await response.json();
            if (body?.error) details = body.error;
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

      <Modal isOpen={showUserModal} onClose={() => !creating && setShowUserModal(false)} title="Create New User">
        <form onSubmit={handleCreateUser} className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

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
