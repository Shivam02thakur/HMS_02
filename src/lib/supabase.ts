import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your_supabase') || supabaseAnonKey.includes('your_supabase')) {
  // This is the #1 cause of "login doesn't work" reports: the app boots
  // fine, but every auth/database call silently fails or hangs because
  // it's pointed at a placeholder URL. Fail loudly and specifically
  // instead of letting it surface later as a vague network error.
  throw new Error(
    'Missing or invalid Supabase configuration. Create a `.env` file in the project root ' +
    '(copy `.env.example`) and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to the ' +
    'values from your Supabase project (Project Settings → API), then restart `npm run dev`.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
