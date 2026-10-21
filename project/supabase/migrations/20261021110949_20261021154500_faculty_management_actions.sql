/*
# Add authorized faculty management actions

1. Purpose
- Provides server-side operations used by the faculty portal.
- Keeps election, position, candidate, review, and voting-control changes behind role and assignment checks.

2. New functions
- `create_election`: creates a draft election for an administrator or assigned manager.
- `update_election_status`: starts, pauses, resumes, closes, or publishes an election with an audited reason.
- `create_position`: adds a position before voting starts.
- `create_candidate`: adds a candidate application before voting starts.
- `review_candidate`: approves or rejects a candidate application before voting starts.
- `assign_student_eligibility`: adds or updates a student's eligibility for an election.

3. Security
- Every function derives the acting user from `auth.uid()`.
- Managers can operate only on assigned elections; administrators can operate globally.
- Status transitions are validated server-side and logged.
- No submitted ballot or participation record can be edited or deleted.
*/

CREATE OR REPLACE FUNCTION public.create_election(
  p_title text,
  p_academic_year text,
  p_description text,
  p_category text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_instructions text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT (public.is_election_admin() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'faculty_manager')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF nullif(trim(p_title), '') IS NULL OR p_opens_at >= p_closes_at OR p_closes_at <= now() THEN RAISE EXCEPTION 'Invalid election details'; END IF;
  INSERT INTO elections(title, academic_year, description, category, opens_at, closes_at, instructions, status)
  VALUES (trim(p_title), nullif(trim(p_academic_year), ''), trim(p_description), trim(p_category), p_opens_at, p_closes_at, nullif(trim(p_instructions), ''), 'scheduled')
  RETURNING id INTO v_id;
  INSERT INTO election_managers(election_id, faculty_user_id, can_manage, can_control_voting) VALUES (v_id, auth.uid(), true, true) ON CONFLICT DO NOTHING;
  INSERT INTO election_audit_log(election_id, actor_id, action, metadata) VALUES (v_id, auth.uid(), 'election_created', jsonb_build_object('status', 'scheduled'));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_election_status(p_election_id uuid, p_status text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_current text;
BEGIN
  IF NOT public.can_control_election(p_election_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT status INTO v_current FROM elections WHERE id = p_election_id FOR UPDATE;
  IF v_current IS NULL THEN RAISE EXCEPTION 'Election not found'; END IF;
  IF p_status NOT IN ('active', 'paused', 'closed', 'results_published') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF v_current IN ('closed', 'results_published') AND p_status <> 'results_published' THEN RAISE EXCEPTION 'Finalized elections cannot be reopened'; END IF;
  IF p_status = 'active' AND v_current NOT IN ('scheduled', 'paused') THEN RAISE EXCEPTION 'Election cannot be started'; END IF;
  IF p_status = 'results_published' AND v_current <> 'closed' THEN RAISE EXCEPTION 'Election must be closed first'; END IF;
  UPDATE elections SET status = p_status, published_at = CASE WHEN p_status = 'results_published' THEN now() ELSE published_at END, updated_at = now() WHERE id = p_election_id;
  INSERT INTO election_audit_log(election_id, actor_id, action, reason, metadata) VALUES (p_election_id, auth.uid(), 'election_status_changed', nullif(trim(p_reason), ''), jsonb_build_object('from', v_current, 'to', p_status));
END;
$$;

CREATE OR REPLACE FUNCTION public.create_position(
  p_election_id uuid,
  p_name text,
  p_description text,
  p_departments text[],
  p_semesters text[],
  p_max_selections integer,
  p_max_winners integer,
  p_nomination_deadline timestamptz
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.can_manage_election(p_election_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF EXISTS (SELECT 1 FROM elections WHERE id = p_election_id AND status IN ('active', 'paused', 'closed', 'results_published')) THEN RAISE EXCEPTION 'Positions cannot change after voting begins'; END IF;
  IF nullif(trim(p_name), '') IS NULL OR p_max_selections < 1 OR p_max_winners < 1 THEN RAISE EXCEPTION 'Invalid position details'; END IF;
  INSERT INTO election_positions(election_id, name, description, eligible_departments, eligible_semesters, max_selections, max_winners, nomination_deadline)
  VALUES (p_election_id, trim(p_name), trim(p_description), coalesce(p_departments, '{}'), coalesce(p_semesters, '{}'), p_max_selections, p_max_winners, p_nomination_deadline)
  RETURNING id INTO v_id;
  INSERT INTO election_audit_log(election_id, actor_id, action, metadata) VALUES (p_election_id, auth.uid(), 'position_created', jsonb_build_object('position_id', v_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_candidate(
  p_election_id uuid,
  p_position_id uuid,
  p_name text,
  p_student_id text,
  p_faculty text,
  p_semester text,
  p_manifesto text,
  p_image_url text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.can_manage_election(p_election_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF EXISTS (SELECT 1 FROM elections WHERE id = p_election_id AND status IN ('active', 'paused', 'closed', 'results_published')) THEN RAISE EXCEPTION 'Candidates cannot change after voting begins'; END IF;
  IF NOT EXISTS (SELECT 1 FROM election_positions WHERE id = p_position_id AND election_id = p_election_id) THEN RAISE EXCEPTION 'Position not found'; END IF;
  IF EXISTS (SELECT 1 FROM candidates WHERE election_id = p_election_id AND position_id = p_position_id AND lower(student_id) = lower(trim(p_student_id))) THEN RAISE EXCEPTION 'Student is already registered for this position'; END IF;
  INSERT INTO candidates(election_id, position_id, name, student_id, faculty, semester, manifesto, image_url, application_status)
  VALUES (p_election_id, p_position_id, trim(p_name), trim(p_student_id), trim(p_faculty), nullif(trim(p_semester), ''), trim(p_manifesto), nullif(trim(p_image_url), ''), 'pending')
  RETURNING id INTO v_id;
  INSERT INTO candidate_applications(candidate_id) VALUES (v_id);
  INSERT INTO election_audit_log(election_id, actor_id, action, metadata) VALUES (p_election_id, auth.uid(), 'candidate_added', jsonb_build_object('candidate_id', v_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_candidate(p_candidate_id uuid, p_status text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_election_id uuid;
BEGIN
  SELECT election_id INTO v_election_id FROM candidates WHERE id = p_candidate_id;
  IF v_election_id IS NULL OR NOT public.can_manage_election(v_election_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid review status'; END IF;
  IF EXISTS (SELECT 1 FROM elections WHERE id = v_election_id AND status IN ('active', 'paused', 'closed', 'results_published')) THEN RAISE EXCEPTION 'Applications cannot change after voting begins'; END IF;
  UPDATE candidates SET application_status = p_status, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_candidate_id;
  UPDATE candidate_applications SET status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '') WHERE candidate_id = p_candidate_id;
  INSERT INTO election_audit_log(election_id, actor_id, action, reason, metadata) VALUES (v_election_id, auth.uid(), 'candidate_reviewed', p_note, jsonb_build_object('candidate_id', p_candidate_id, 'status', p_status));
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_student_eligibility(p_election_id uuid, p_student_id uuid, p_department text, p_semester text, p_eligible boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.can_manage_election(p_election_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  INSERT INTO student_eligibility(election_id, student_id, department, semester, eligible, verified_by, verified_at)
  VALUES (p_election_id, p_student_id, nullif(trim(p_department), ''), nullif(trim(p_semester), ''), p_eligible, auth.uid(), now())
  ON CONFLICT (election_id, student_id) DO UPDATE SET department = EXCLUDED.department, semester = EXCLUDED.semester, eligible = EXCLUDED.eligible, verified_by = auth.uid(), verified_at = now()
  RETURNING id INTO v_id;
  INSERT INTO election_audit_log(election_id, actor_id, action, metadata) VALUES (p_election_id, auth.uid(), 'eligibility_changed', jsonb_build_object('student_id', p_student_id, 'eligible', p_eligible));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_election(text, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_election_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_position(uuid, text, text, text[], text[], integer, integer, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_candidate(uuid, uuid, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_candidate(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_student_eligibility(uuid, uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_election(text, text, text, text, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_election_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_position(uuid, text, text, text[], text[], integer, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_candidate(uuid, uuid, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_candidate(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_student_eligibility(uuid, uuid, text, text, boolean) TO authenticated;
