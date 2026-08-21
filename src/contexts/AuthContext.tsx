import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

interface AuthContextType {
  user: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load user profile:', error);
    return null;
  }

  return data as Profile | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        console.error('Failed to restore session:', error);
      }

      if (!mounted) return;

      if (session?.user) {
        const profile = await getProfile(session.user.id);
        if (mounted) setUser(profile);
      } else {
        setUser(null);
      }

      if (mounted) setLoading(false);
    };

    loadSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          if (mounted) {
            setUser(null);
            setLoading(false);
          }
          return;
        }

        // Do not perform nested Supabase calls directly inside the auth
        // callback. Queue the profile lookup after the auth event completes.
        setTimeout(async () => {
          const profile = await getProfile(session.user.id);
          if (mounted) {
            setUser(profile);
            setLoading(false);
          }
        }, 0);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function refreshUser() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      setUser(null);
      return;
    }

    setUser(await getProfile(session.user.id));
  }

  async function signIn(email: string, password: string) {
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) return { error };

    if (!data.user) {
      return { error: new Error('Login failed: no authenticated user was returned.') };
    }

    const profile = await getProfile(data.user.id);

    if (!profile) {
      await supabase.auth.signOut();
      return {
        error: new Error(
          'Login succeeded, but no HMS profile exists for this account. Run migration 005_auth_profiles.sql in Supabase.'
        ),
      };
    }

    setUser(profile);
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
