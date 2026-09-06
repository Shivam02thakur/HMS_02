-- 037_profile_change_requests_and_notifications.sql
--
-- #18: doctor-only self-service editing (everyone else stays fully
-- admin-managed), restricted to 8 fields, every change requiring admin
-- approval before it takes effect, plus notifications for both sides.
-- Depends on doctors.user_id (009_invoice_and_patient_integrity.sql /
-- wherever it was first populated) -- every field on the allow-list
-- lives on `doctors`, which only has a reliable link back to a login
-- account because that linking work exists.

-- ---------------------------------------------------------------------
-- Generic request/approval table, not doctors-only hardcoded. The CHECK
-- currently only allows 'doctors', but the shape is ready to extend to
-- other tables later without a second parallel mechanism.
CREATE TABLE profile_change_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_table TEXT NOT NULL CHECK (target_table IN ('doctors')),
  target_id UUID NOT NULL,
  requested_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  changes JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profile_change_requests_status ON profile_change_requests(status);
CREATE INDEX idx_profile_change_requests_requested_by ON profile_change_requests(requested_by);

-- ---------------------------------------------------------------------
-- Validation trigger: field allow-list + ownership check, enforced at
-- INSERT time, not just hidden from the self-edit form's UI (which a
-- direct API call could otherwise bypass). `role` is not, and will never
-- be, in this list -- this system must never become a side-door around
-- 007_prevent_role_self_escalation.sql's protection.
CREATE OR REPLACE FUNCTION validate_profile_change_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY[
    'phone', 'specialization', 'experience_years', 'consultation_fee',
    'available_days', 'available_time_start', 'available_time_end', 'is_active'
  ];
  k TEXT;
BEGIN
  IF NEW.target_table = 'doctors' THEN
    FOR k IN SELECT jsonb_object_keys(NEW.changes) LOOP
      IF NOT (k = ANY(allowed_keys)) THEN
        RAISE EXCEPTION 'Field "%" is not self-editable for %', k, NEW.target_table;
      END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM doctors WHERE id = NEW.target_id AND user_id = NEW.requested_by) THEN
      RAISE EXCEPTION 'You can only request changes to your own doctor record';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_profile_change_request
  BEFORE INSERT ON profile_change_requests
  FOR EACH ROW EXECUTE FUNCTION validate_profile_change_request();

-- ---------------------------------------------------------------------
-- notifications: new infrastructure. Deliberately NOT directly
-- insertable by ordinary clients -- RLS only allows a user to SELECT
-- their own notifications and UPDATE them to mark read. Every actual
-- INSERT happens through the SECURITY DEFINER triggers below, which
-- closes off the obvious spoofing risk of a client writing directly
-- into another user's notification feed.
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE is_read = FALSE;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can mark own notifications read" ON notifications
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Fan-out: a new request notifies every admin.
CREATE OR REPLACE FUNCTION notify_admins_of_new_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester_name TEXT;
BEGIN
  SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.requested_by;
  INSERT INTO notifications (user_id, title, body, link)
  SELECT id, 'New profile change request',
         COALESCE(requester_name, 'A user') || ' has requested a profile change awaiting your review.',
         '/settings'
  FROM profiles WHERE role = 'admin';
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_admins_of_new_request
  AFTER INSERT ON profile_change_requests
  FOR EACH ROW EXECUTE FUNCTION notify_admins_of_new_request();

-- Reviewed: notifies the original requester of the outcome.
CREATE OR REPLACE FUNCTION notify_requester_of_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('APPROVED', 'REJECTED') AND OLD.status = 'PENDING' THEN
    INSERT INTO notifications (user_id, title, body, link)
    VALUES (
      NEW.requested_by,
      CASE WHEN NEW.status = 'APPROVED' THEN 'Profile change approved' ELSE 'Profile change rejected' END,
      COALESCE(NEW.review_notes, CASE WHEN NEW.status = 'APPROVED' THEN 'Your requested change was approved.' ELSE 'Your requested change was rejected.' END),
      '/settings'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_requester_of_review
  AFTER UPDATE ON profile_change_requests
  FOR EACH ROW EXECUTE FUNCTION notify_requester_of_review();

-- ---------------------------------------------------------------------
-- Atomic approval / rejection.
--
-- Both begin with a role check. Using `<>` here was tested against a
-- real unauthenticated call (auth.uid() IS NULL) and found to silently
-- do nothing: get_current_user_role() returns NULL when there's no
-- authenticated user, and SQL's `<>` follows three-valued logic --
-- `NULL <> 'admin'` evaluates to NULL, and `IF NULL THEN ...` in
-- PL/pgSQL is treated as false, so the RAISE EXCEPTION was silently
-- skipped and execution fell through to the update. A SECURITY DEFINER
-- function runs with elevated privileges regardless of the caller's own
-- RLS restrictions, so a broken check here is directly exploitable, not
-- cosmetic. `IS DISTINCT FROM` treats NULL as genuinely distinct from
-- 'admin' (evaluates to TRUE), correctly raising the exception whether
-- the caller's role is some other real role or nothing at all.
--
-- (007_prevent_role_self_escalation.sql's `<>` usage is safe: it's
-- guarded by `auth.uid() IS NOT NULL AND ...`, and AND short-circuits to
-- FALSE regardless of the NULL on the other side -- deliberately
-- different, since a NULL auth.uid() there means a trusted server
-- context that should be left alone. There is no equivalent legitimate
-- unauthenticated path to "approve this request", so that reasoning
-- doesn't apply here.)
CREATE OR REPLACE FUNCTION approve_profile_change_request(request_id UUID, notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  IF get_current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only administrators can approve profile change requests';
  END IF;

  SELECT * INTO req FROM profile_change_requests WHERE id = request_id;
  IF req IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;

  IF req.target_table = 'doctors' THEN
    UPDATE doctors SET
      phone = COALESCE(req.changes->>'phone', phone),
      specialization = COALESCE(req.changes->>'specialization', specialization),
      experience_years = COALESCE((req.changes->>'experience_years')::INTEGER, experience_years),
      consultation_fee = COALESCE((req.changes->>'consultation_fee')::DECIMAL, consultation_fee),
      available_days = COALESCE(
        (SELECT array_agg(x) FROM jsonb_array_elements_text(req.changes->'available_days') x),
        available_days
      ),
      available_time_start = COALESCE((req.changes->>'available_time_start')::TIME, available_time_start),
      available_time_end = COALESCE((req.changes->>'available_time_end')::TIME, available_time_end),
      is_active = COALESCE((req.changes->>'is_active')::BOOLEAN, is_active)
    WHERE id = req.target_id;
  END IF;

  UPDATE profile_change_requests
  SET status = 'APPROVED', review_notes = notes, reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE id = request_id;
END;
$$;

CREATE OR REPLACE FUNCTION reject_profile_change_request(request_id UUID, notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  IF get_current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only administrators can reject profile change requests';
  END IF;

  SELECT * INTO req FROM profile_change_requests WHERE id = request_id;
  IF req IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'This request has already been reviewed';
  END IF;

  UPDATE profile_change_requests
  SET status = 'REJECTED', review_notes = notes, reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE id = request_id;
END;
$$;

-- ---------------------------------------------------------------------
-- RLS on profile_change_requests itself.
ALTER TABLE profile_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view all requests" ON profile_change_requests
  FOR SELECT USING (get_current_user_role() = 'admin');

CREATE POLICY "Doctor can view own requests" ON profile_change_requests
  FOR SELECT USING (requested_by = auth.uid());

CREATE POLICY "Doctor can create own requests" ON profile_change_requests
  FOR INSERT WITH CHECK (get_current_user_role() = 'doctor' AND requested_by = auth.uid());

-- No UPDATE policy for ordinary clients at all -- review only happens
-- through the SECURITY DEFINER approve/reject functions above, which
-- run with their own elevated privileges and do their own role check.

NOTIFY pgrst, 'reload schema';
