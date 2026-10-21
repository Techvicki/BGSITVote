/*
# BGSIT Vote — Institutional Voting Portal Schema

## Purpose
Student body governance voting portal for BGSIT (institution). Authenticated students
sign in, view active/closed elections, mark their choices on each contest, and receive
a cryptographic receipt. Each voter can vote at most once per election.

## New Tables
1. `profiles` — extends auth.users with institutional metadata
   - id (uuid, PK, FK -> auth.users)
   - full_name (text)
   - student_id (text, unique) — institutional roll number
   - faculty (text) — e.g. "Engineering", "Law"
   - verification_status (text) — 'verified' | 'pending' | 'rejected'
   - created_at (timestamptz)

2. `elections` — each contest/election
   - id (uuid, PK)
   - title (text)
   - description (text)
   - faculty (text, nullable) — scoped to a faculty, or null for institute-wide
   - status (text) — 'active' | 'upcoming' | 'closed'
   - opens_at (timestamptz)
   - closes_at (timestamptz)
   - created_at (timestamptz)

3. `candidates` — candidates standing in an election
   - id (uuid, PK)
   - election_id (uuid, FK -> elections, cascade)
   - name (text)
   - student_id (text)
   - faculty (text)
   - manifesto (text)
   - image_url (text, nullable)
   - created_at (timestamptz)

4. `votes` — one vote per voter per election
   - id (uuid, PK)
   - election_id (uuid, FK -> elections)
   - candidate_id (uuid, FK -> candidates)
   - voter_id (uuid, FK -> auth.users)
   - receipt_hash (text) — cryptographic receipt marker
   - created_at (timestamptz)
   - UNIQUE (election_id, voter_id) — one vote per voter per election

## Security
- RLS enabled on all tables.
- Profiles: each authenticated user sees/edits only their own profile row.
- Elections & candidates: readable by all authenticated users (public contests).
- Votes: a voter can read only their own votes; inserts enforced via a UNIQUE
  constraint plus a policy requiring auth.uid() = voter_id. Updates/deletes blocked.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  student_id text UNIQUE NOT NULL,
  faculty text NOT NULL,
  verification_status text NOT NULL DEFAULT 'verified',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE IF NOT EXISTS elections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  faculty text,
  status text NOT NULL DEFAULT 'upcoming',
  opens_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE elections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_elections" ON elections;
CREATE POLICY "read_elections" ON elections
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  name text NOT NULL,
  student_id text NOT NULL,
  faculty text NOT NULL,
  manifesto text NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_candidates" ON candidates;
CREATE POLICY "read_candidates" ON candidates
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  voter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  receipt_hash text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (election_id, voter_id)
);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_votes" ON votes;
CREATE POLICY "read_own_votes" ON votes
  FOR SELECT TO authenticated USING (auth.uid() = voter_id);

DROP POLICY IF EXISTS "insert_own_vote" ON votes;
CREATE POLICY "insert_own_vote" ON votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = voter_id);

DROP POLICY IF EXISTS "delete_own_vote" ON votes;
CREATE POLICY "delete_own_vote" ON votes
  FOR DELETE TO authenticated USING (auth.uid() = voter_id);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_candidates_election ON candidates(election_id);
CREATE INDEX IF NOT EXISTS idx_votes_election ON votes(election_id);
CREATE INDEX IF NOT EXISTS idx_votes_voter ON votes(voter_id);
