-- ============================================
-- 007: Block self role-escalation on profiles
--
-- The "Users can update own profile" RLS policy only checks row
-- ownership (auth.uid() = id), not which columns are being changed.
-- That means any authenticated user could currently call:
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', session.user.id)
-- and it would succeed. RLS's WITH CHECK can't fix this on its own for
-- UPDATE (it only sees the new row, not the old one to diff against) —
-- a trigger is the correct tool here.
--
-- auth.uid() IS NULL means there's no logged-in end-user in this request
-- context at all (e.g. the create-user Edge Function running with the
-- service role, or a query run directly in the SQL Editor) — those are
-- left alone. Only an authenticated non-admin trying to change a role
-- (their own or, if a future policy ever allows it, someone else's)
-- gets blocked.
-- ============================================

CREATE OR REPLACE FUNCTION prevent_unauthorized_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND get_current_user_role() <> 'admin'
  THEN
    RAISE EXCEPTION 'Only administrators can change a user''s role.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_unauthorized_role_change ON profiles;

CREATE TRIGGER trg_prevent_unauthorized_role_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_unauthorized_role_change();