/*
# Add faculty registration with administrator approval

1. Purpose
- Allows faculty members to register an account that enters a pending-approval state.
- An election administrator must approve the request before the user gets faculty access.
- Students cannot grant themselves faculty privileges.

2. New table
- `faculty_registrations`: stores registration requests with faculty ID, department, name, and approval status.

3. New functions
- `register_faculty`: creates a profile row with role 'student' and verification_status 'faculty_pending',
  plus a faculty_registrations row. The account exists but has no faculty access until approved.
- `approve_faculty_registration`: promoted by an election_admin — sets the profile role to 'faculty_manager',
  updates verification_status to 'verified', and marks the registration approved.
- `reject_faculty_registration`: marks the registration rejected; the account remains a plain student.

4. Security
- Registration is open to any authenticated user (self-signup).
- Approval/rejection is restricted to election_admin via is_election_admin().
- The profiles.role column is never set to faculty by the registrant — only by the approval function.
*/

CREATE TABLE IF NOT EXISTS faculty_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  faculty_id text NOT NULL,
  full_name text NOT NULL,
  department text NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE faculty_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_own_registration" ON faculty_registrations
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_election_admin());

CREATE POLICY "insert_own_registration" ON faculty_registrations
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "no_update_registration" ON faculty_registrations
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "no_delete_registration" ON faculty_registrations
  FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.register_faculty(
  p_faculty_id text,
  p_full_name text,
  p_department text,
  p_email text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF nullif(trim(p_faculty_id), '') IS NULL OR nullif(trim(p_full_name), '') IS NULL OR nullif(trim(p_department), '') IS NULL THEN
    RAISE EXCEPTION 'All fields are required';
  END IF;
  IF EXISTS (SELECT 1 FROM faculty_registrations WHERE user_id = auth.uid() AND status = 'pending') THEN
    RAISE EXCEPTION 'You already have a pending faculty registration';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('faculty_manager', 'election_admin')) THEN
    RAISE EXCEPTION 'You already have faculty access';
  END IF;
  INSERT INTO faculty_registrations (user_id, faculty_id, full_name, department, email, status)
  VALUES (auth.uid(), trim(p_faculty_id), trim(p_full_name), trim(p_department), trim(p_email), 'pending')
  ON CONFLICT (user_id) DO UPDATE SET
    faculty_id = EXCLUDED.faculty_id,
    full_name = EXCLUDED.full_name,
    department = EXCLUDED.department,
    email = EXCLUDED.email,
    status = 'pending',
    reviewed_by = NULL,
    reviewed_at = NULL;
  UPDATE profiles SET
    full_name = trim(p_full_name),
    faculty_id = trim(p_faculty_id),
    department = trim(p_department),
    verification_status = 'faculty_pending'
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.register_faculty(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_faculty(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_faculty_registration(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_election_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM faculty_registrations WHERE user_id = p_user_id AND status = 'pending') THEN
    RAISE EXCEPTION 'No pending registration found';
  END IF;
  UPDATE faculty_registrations
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE user_id = p_user_id;
  UPDATE profiles
  SET role = 'faculty_manager', verification_status = 'verified'
  WHERE id = p_user_id;
  INSERT INTO election_audit_log(actor_id, action, metadata)
  VALUES (auth.uid(), 'faculty_approved', jsonb_build_object('user_id', p_user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.approve_faculty_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_faculty_registration(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_faculty_registration(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_election_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE faculty_registrations
  SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  WHERE user_id = p_user_id AND status = 'pending';
  UPDATE profiles
  SET verification_status = 'rejected', role = 'student'
  WHERE id = p_user_id;
  INSERT INTO election_audit_log(actor_id, action, metadata)
  VALUES (auth.uid(), 'faculty_rejected', jsonb_build_object('user_id', p_user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.reject_faculty_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_faculty_registration(uuid) TO authenticated;
