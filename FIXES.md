# Fixes Applied

This pass focused on login/authorization problems, the "create user" feature, and
getting the project to actually build cleanly for deployment.

## Bugs fixed

1. **`src/lib/database.types.ts` was missing `Relationships` arrays on every table.**
   This is a required field in Supabase's generated types. Without it, TypeScript
   couldn't correctly infer joined queries (`patient:patients(*)`) or insert/update
   payloads, and silently fell back to typing them as `never`. This didn't break
   `npm run dev` (Vite doesn't type-check), but it **did break `npm run build`**
   (`tsc && vite build`), which is what most hosts (Vercel/Netlify) run on deploy.
   Added correct FK relationship metadata and proper enum literal types (role,
   gender, appointment/bed/admission/lab/invoice status, ward_type) for every table.

2. **Dashboard "low stock medicines" query was broken at runtime.** It called
   `.lte('stock_quantity', supabase.rpc('get_reorder_level'))` — passing a query
   builder object (for an RPC that doesn't exist) into a filter instead of a value.
   PostgREST also can't compare one column to another via a simple filter anyway.
   Fixed to pull recent stock and filter client-side against each medicine's own
   `reorder_level`.

3. **Missing `src/vite-env.d.ts`** — `import.meta.env` wasn't typed.

4. **No `.gitignore`** — `.env` (Supabase keys) and `node_modules` had no protection
   from being committed. Added one.

5. **`src/lib/supabase.ts` failed silently on missing/placeholder env vars.** This is
   the most common real-world cause of "login doesn't work": an empty `.env`, a
   forgotten `npm run dev` restart after editing it, or leftover placeholder values
   (`your_supabase_project_url`). It now throws a clear, actionable error immediately
   instead of surfacing as a vague network failure when you try to log in.

6. **`useParams()` id-could-be-undefined bugs** in `PatientDetailPage`,
   `DoctorDetailPage`, and `InvoiceDetailPage` — guarded with early returns.

7. **Frontend authorization gap**: any logged-in user could navigate directly to
   `/settings` by URL even though it's hidden from their sidebar nav for non-admins.
   RLS and the `create-user` Edge Function already blocked the actual admin actions
   server-side, but added a `RoleRoute` guard in `App.tsx` so the page itself isn't
   reachable either (defense in depth, not a real security hole since RLS + the
   Edge Function's own admin check were already enforcing this server-side).

## Verified as already correct (no changes needed)

- `AuthContext.tsx` — session restore, sign-in, sign-out, auth-state listener.
- `LoginPage.tsx` — standard email/password sign-in flow.
- RLS policies (`002_rls.sql`) and the `handle_new_user` trigger
  (`005_auth_profiles.sql`) that creates a `profiles` row for every new Auth user.
- The `create-user` Edge Function (`supabase/functions/create-user/index.ts`) —
  validates the caller's token, checks `profiles.role === 'admin'` via a
  service-role client (which bypasses RLS correctly for that check), creates the
  new Auth user server-side, and never exposes the service-role key to the
  browser. **This feature already exists** — it wasn't missing from the code.

## Things I could not verify (need your live Supabase project)

I don't have access to your actual Supabase instance, so if login or user creation
is still failing after pulling this update, check:

- [ ] Migrations ran **in order**, 001 → 005, in the Supabase SQL Editor.
- [ ] `.env` has your **real** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
      (Project Settings → API) — not the placeholder values from `.env.example`.
- [ ] You restarted `npm run dev` after creating/editing `.env`.
- [ ] The `create-user` Edge Function is actually **deployed**:
      `supabase functions deploy create-user`.
- [ ] Your first admin account's `profiles.role` was manually set to `'admin'`
      via SQL Editor (see README → "First admin account").
- [ ] Email confirmation is enabled/auto-confirmed for the account you're testing.

`npm run build` now completes with zero TypeScript errors and zero runtime-breaking
bugs found in review.
