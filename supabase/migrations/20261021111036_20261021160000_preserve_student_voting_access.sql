/*
# Preserve existing student voting access

1. Purpose
- Keeps the existing student experience working after moving ballot submission behind the secure server function.
- Grants current verified students eligibility for existing elections without changing submitted ballots.

2. Data change
- Inserts missing eligibility rows for verified profiles and existing elections.
- Existing eligibility rows are left unchanged.

3. Security
- No votes are changed or deleted.
- Eligibility remains manageable only through the authorized server function and existing RLS policies.
*/

INSERT INTO student_eligibility (election_id, student_id, department, eligible, verified_at)
SELECT e.id, p.id, p.faculty, true, now()
FROM elections e
CROSS JOIN profiles p
WHERE p.verification_status = 'verified'
  AND NOT EXISTS (
    SELECT 1 FROM student_eligibility se
    WHERE se.election_id = e.id AND se.student_id = p.id
  );
