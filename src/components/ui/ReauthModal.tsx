import { useState } from 'react';
import { Modal } from './Modal';
import { supabase } from '@/lib/supabase';
import { ShieldAlert } from 'lucide-react';

interface ReauthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  email: string;
  title?: string;
  message?: string;
}

// Confirms the current admin's identity before a destructive, irreversible
// action (currently: hard-deleting a doctor with no appointment/prescription
// history). Re-runs signInWithPassword against the logged-in user's own
// email - Supabase has no separate "verify password" endpoint, so this
// doubles as a real re-authentication rather than just a client-side check.
//
// Google/OAuth note: when Google sign-in is added, branch here on the
// current session's provider (supabase.auth.getUser() ->
// data.user.app_metadata.provider). For 'google', swap the password field
// for a "Continue with Google" button that re-triggers
// supabase.auth.signInWithOAuth({ provider: 'google' }) and treat a
// successful redirect-back as verified, instead of asking for a password
// the account may not even have. Left as a comment, not built - Google
// auth isn't wired up yet, and building the branch now would be dead code.
export function ReauthModal({ isOpen, onClose, onVerified, email, title = 'Confirm your password', message }: ReauthModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  function handleClose() {
    setPassword('');
    setError('');
    onClose();
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setVerifying(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setVerifying(false);
    if (error) {
      setError('Incorrect password.');
      return;
    }
    setPassword('');
    onVerified();
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="sm">
      <form onSubmit={handleVerify} className="flex flex-col items-center text-center space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <ShieldAlert className="h-6 w-6 text-red-600" />
        </div>
        <p className="text-sm text-gray-600">
          {message || "This action can't be undone. Re-enter your password to confirm it's really you."}
        </p>
        <input
          type="password"
          required
          autoFocus
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          className="input w-full"
        />
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 w-full">{error}</p>}
        <div className="flex gap-3 w-full">
          <button type="button" onClick={handleClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={verifying || !password} className="btn-danger flex-1 disabled:opacity-50">
            {verifying ? 'Verifying...' : 'Confirm'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
