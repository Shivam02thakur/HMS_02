-- ============================================
-- AUTH PROFILE SYNC
-- Creates a public.profiles row whenever a Supabase Auth user is created.
-- Roles can only be assigned by the secure create-user Edge Function
-- through app_metadata.created_by_admin = true.
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role := 'receptionist';
  v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  IF COALESCE(NEW.raw_app_meta_data->>'created_by_admin', 'false') = 'true'
     AND (NEW.raw_app_meta_data->>'role') IN
       ('admin', 'receptionist', 'doctor', 'pharmacist', 'lab_technician')
  THEN
    v_role := (NEW.raw_app_meta_data->>'role')::user_role;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, v_full_name, v_role)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  RETURN NEW;
END;
$$;


-- Backfill profiles for Auth users that already existed before this migration.
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  'receptionist'::user_role
FROM auth.users AS u
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
