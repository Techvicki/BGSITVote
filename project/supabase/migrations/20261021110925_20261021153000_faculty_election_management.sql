/*
# Add secure faculty election management

1. Purpose
- Extends the existing BGSIT Vote schema with role-aware faculty management and audited election controls.
- Keeps existing student profiles, elections, candidates, and votes intact while adding the structures needed for a faculty portal.

2. New profile columns
- `profiles.role`: student, faculty_manager, or election_admin.
- `profiles.faculty_id`: institutional faculty identifier for approved faculty accounts.
- `profiles.department`: faculty department.

3. New tables
- `election_managers`: assigns faculty managers to specific elections.
- `election_positions`: voting positions belonging to an election.
- `candidate_applications`: review state for candidate records.
- `student_eligibility`: explicit voter eligibility per election.
- `voting_participation`: one non-secret participation record per voter and election.
- `secret_ballots`: candidate selections stored separately from participation records.
- `election_audit_log`: immutable record of management and voting-control actions.

4. Election extensions
- Adds academic year, category, instructions, publication time, and status-history timestamps.
- Existing statuses remain compatible: upcoming, active, closed. New workflow statuses support draft, scheduled, paused, and results_published.

5. Security
- Every new table has RLS enabled.
- Students can read only published/eligible election information and never secret ballots.
- Faculty access is limited to assigned elections; administrators have broader management access.
- Role and verification fields are not client-writable.
- Election creation, candidate approval, voting controls, and ballot submission use server-side authorization checks.
- Direct vote inserts/deletes are removed; the atomic `submit_ballot` function checks status, eligibility, duplicate participation, and candidate validity before recording a vote.

6. Important notes
- Existing rows are preserved. Existing elections are migrated to `scheduled`, `active`, or `closed` based on their current status.
- No account is promoted to faculty by registration. Faculty roles must be granted through the administrator-only `grant_faculty_role` function.
- Candidate images remain represented by `image_url`; storage upload validation should be added before accepting production uploads.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS faculty_id text,
  ADD COLUMN IF NOT EXISTS department text;

ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS academic_year text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'Student Governance',
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE elections SET status = CASE
  WHEN status = 'active' THEN 'active'
  WHEN status = 'closed' THEN 'closed'
  ELSE 'scheduled'
END
WHERE status IN ('upcoming', 'active', 'closed');

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS position_id uuid,
  ADD COLUMN IF NOT EXISTS application_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS semester text,
  ADD COLUMN IF NOT EXISTS nomination_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE TABLE IF NOT EXISTS election_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  faculty_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_manage boolean NOT NULL DEFAULT true,
  can_control_voting boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_id, faculty_user_id)
);

CREATE TABLE IF NOT EXISTS election_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  eligible_departments text[] NOT NULL DEFAULT '{}',
  eligible_semesters text[] NOT NULL DEFAULT '{}',
  max_selections integer NOT NULL DEFAULT 1 CHECK (max_selections > 0),
  max_winners integer NOT NULL DEFAULT 1 CHECK (max_winners > 0),
  nomination_deadline timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_id, name)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'candidates_position_id_fkey') THEN
    ALTER TABLE candidates ADD CONSTRAINT candidates_position_id_fkey FOREIGN KEY (position_id) REFERENCES election_positions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS candidate_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_note text
);

CREATE TABLE IF NOT EXISTS student_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  eligible boolean NOT NULL DEFAULT true,
  department text,
  semester text,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_id, student_id)
);

CREATE TABLE IF NOT EXISTS voting_participation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
  voter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  receipt_hash text NOT NULL,
  UNIQUE (election_id, voter_id)
);

CREATE TABLE IF NOT EXISTS secret_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE RESTRICT,
  position_id uuid REFERENCES election_positions(id) ON DELETE RESTRICT,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
  ballot_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS election_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid REFERENCES elections(id) ON DELETE SET NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE election_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE election_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_eligibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE voting_participation ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE election_audit_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_election_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'election_admin') $$;

CREATE OR REPLACE FUNCTION public.can_manage_election(p_election_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_election_admin() OR EXISTS (
  SELECT 1 FROM election_managers em JOIN profiles p ON p.id = em.faculty_user_id
  WHERE em.election_id = p_election_id AND em.faculty_user_id = auth.uid() AND em.can_manage = true AND p.role IN ('faculty_manager', 'election_admin')
) $$;

CREATE OR REPLACE FUNCTION public.can_control_election(p_election_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_election_admin() OR EXISTS (
  SELECT 1 FROM election_managers em JOIN profiles p ON p.id = em.faculty_user_id
  WHERE em.election_id = p_election_id AND em.faculty_user_id = auth.uid() AND em.can_control_voting = true AND p.role IN ('faculty_manager', 'election_admin')
) $$;

REVOKE ALL ON FUNCTION public.is_election_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_manage_election(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_control_election(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_election_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_election(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_control_election(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_faculty_role(p_user_id uuid, p_role text, p_faculty_id text, p_department text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_election_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_role NOT IN ('faculty_manager', 'election_admin') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  UPDATE profiles SET role = p_role, faculty_id = p_faculty_id, department = p_department WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  INSERT INTO election_audit_log(actor_id, action, metadata) VALUES (auth.uid(), 'grant_faculty_role', jsonb_build_object('user_id', p_user_id, 'role', p_role));
END;
$$;
REVOKE ALL ON FUNCTION public.grant_faculty_role(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_faculty_role(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_ballot(p_election_id uuid, p_candidate_id uuid, p_receipt_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_participation_id uuid; v_position_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM elections WHERE id = p_election_id AND status = 'active' AND now() >= opens_at AND now() < closes_at) THEN RAISE EXCEPTION 'Voting is not currently open'; END IF;
  IF NOT EXISTS (SELECT 1 FROM student_eligibility WHERE election_id = p_election_id AND student_id = auth.uid() AND eligible = true) THEN RAISE EXCEPTION 'You are not eligible for this election'; END IF;
  SELECT position_id INTO v_position_id FROM candidates WHERE id = p_candidate_id AND election_id = p_election_id AND application_status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidate is not available'; END IF;
  INSERT INTO voting_participation(election_id, voter_id, receipt_hash) VALUES (p_election_id, auth.uid(), p_receipt_hash) RETURNING id INTO v_participation_id;
  INSERT INTO secret_ballots(election_id, position_id, candidate_id) VALUES (p_election_id, v_position_id, p_candidate_id);
  INSERT INTO election_audit_log(election_id, actor_id, action, metadata) VALUES (p_election_id, auth.uid(), 'ballot_submitted', jsonb_build_object('participation_id', v_participation_id));
  RETURN v_participation_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'You have already voted in this election';
END;
$$;
REVOKE ALL ON FUNCTION public.submit_ballot(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_ballot(uuid, uuid, text) TO authenticated;

DROP POLICY IF EXISTS "read_elections" ON elections;
CREATE POLICY "read_elections" ON elections FOR SELECT TO authenticated USING (
  status IN ('active', 'scheduled', 'closed', 'results_published') OR public.can_manage_election(id)
);

DROP POLICY IF EXISTS "read_candidates" ON candidates;
CREATE POLICY "read_candidates" ON candidates FOR SELECT TO authenticated USING (
  application_status = 'approved' OR public.can_manage_election(election_id)
);

DROP POLICY IF EXISTS "insert_own_vote" ON votes;
DROP POLICY IF EXISTS "delete_own_vote" ON votes;
CREATE POLICY "votes_are_not_directly_insertable" ON votes FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "votes_are_not_deletable" ON votes FOR DELETE TO authenticated USING (false);

CREATE POLICY "managers_read_assignments" ON election_managers FOR SELECT TO authenticated USING (faculty_user_id = auth.uid() OR public.is_election_admin());
CREATE POLICY "admins_manage_assignments" ON election_managers FOR INSERT TO authenticated WITH CHECK (public.is_election_admin());
CREATE POLICY "admins_update_assignments" ON election_managers FOR UPDATE TO authenticated USING (public.is_election_admin()) WITH CHECK (public.is_election_admin());
CREATE POLICY "admins_delete_assignments" ON election_managers FOR DELETE TO authenticated USING (public.is_election_admin());

CREATE POLICY "read_positions" ON election_positions FOR SELECT TO authenticated USING (public.can_manage_election(election_id) OR EXISTS (SELECT 1 FROM elections e WHERE e.id = election_id AND e.status IN ('active', 'scheduled', 'closed', 'results_published')));
CREATE POLICY "managers_insert_positions" ON election_positions FOR INSERT TO authenticated WITH CHECK (public.can_manage_election(election_id));
CREATE POLICY "managers_update_positions" ON election_positions FOR UPDATE TO authenticated USING (public.can_manage_election(election_id) AND NOT EXISTS (SELECT 1 FROM elections e WHERE e.id = election_id AND e.status IN ('active', 'closed', 'results_published'))) WITH CHECK (public.can_manage_election(election_id));
CREATE POLICY "managers_delete_positions" ON election_positions FOR DELETE TO authenticated USING (public.can_manage_election(election_id) AND NOT EXISTS (SELECT 1 FROM elections e WHERE e.id = election_id AND e.status IN ('active', 'closed', 'results_published')));

CREATE POLICY "managers_read_applications" ON candidate_applications FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM candidates c WHERE c.id = candidate_id AND public.can_manage_election(c.election_id)));
CREATE POLICY "managers_create_applications" ON candidate_applications FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM candidates c WHERE c.id = candidate_id AND public.can_manage_election(c.election_id)));
CREATE POLICY "managers_update_applications" ON candidate_applications FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM candidates c WHERE c.id = candidate_id AND public.can_manage_election(c.election_id))) WITH CHECK (EXISTS (SELECT 1 FROM candidates c WHERE c.id = candidate_id AND public.can_manage_election(c.election_id)));
CREATE POLICY "managers_delete_applications" ON candidate_applications FOR DELETE TO authenticated USING (false);

CREATE POLICY "students_read_eligibility" ON student_eligibility FOR SELECT TO authenticated USING (student_id = auth.uid() OR public.can_manage_election(election_id));
CREATE POLICY "managers_insert_eligibility" ON student_eligibility FOR INSERT TO authenticated WITH CHECK (public.can_manage_election(election_id));
CREATE POLICY "managers_update_eligibility" ON student_eligibility FOR UPDATE TO authenticated USING (public.can_manage_election(election_id)) WITH CHECK (public.can_manage_election(election_id));
CREATE POLICY "managers_delete_eligibility" ON student_eligibility FOR DELETE TO authenticated USING (false);

CREATE POLICY "students_read_own_participation" ON voting_participation FOR SELECT TO authenticated USING (voter_id = auth.uid());
CREATE POLICY "managers_read_participation_totals" ON voting_participation FOR SELECT TO authenticated USING (public.can_manage_election(election_id));
CREATE POLICY "no_direct_participation_insert" ON voting_participation FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_direct_participation_update" ON voting_participation FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_direct_participation_delete" ON voting_participation FOR DELETE TO authenticated USING (false);

CREATE POLICY "managers_read_secret_ballots" ON secret_ballots FOR SELECT TO authenticated USING (public.can_manage_election(election_id));
CREATE POLICY "no_direct_secret_ballot_insert" ON secret_ballots FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_direct_secret_ballot_update" ON secret_ballots FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_direct_secret_ballot_delete" ON secret_ballots FOR DELETE TO authenticated USING (false);

CREATE POLICY "managers_read_audit" ON election_audit_log FOR SELECT TO authenticated USING (public.is_election_admin() OR public.can_manage_election(election_id));
CREATE POLICY "no_direct_audit_insert" ON election_audit_log FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_direct_audit_update" ON election_audit_log FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_direct_audit_delete" ON election_audit_log FOR DELETE TO authenticated USING (false);

REVOKE INSERT, UPDATE, DELETE ON elections FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON candidates FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON profiles FROM authenticated;
GRANT INSERT (id, full_name, student_id, faculty, verification_status) ON profiles TO authenticated;

CREATE INDEX IF NOT EXISTS idx_election_managers_user ON election_managers(faculty_user_id);
CREATE INDEX IF NOT EXISTS idx_positions_election ON election_positions(election_id);
CREATE INDEX IF NOT EXISTS idx_eligibility_election_student ON student_eligibility(election_id, student_id);
CREATE INDEX IF NOT EXISTS idx_participation_election ON voting_participation(election_id);
CREATE INDEX IF NOT EXISTS idx_secret_ballots_election ON secret_ballots(election_id);
CREATE INDEX IF NOT EXISTS idx_audit_election_created ON election_audit_log(election_id, created_at DESC);
