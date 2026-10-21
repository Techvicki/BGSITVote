import { createClient } from '@supabase/supabase-js';

const url = 'https://ovjchoinybizqguzmvii.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92amNob2lueWJpenFndXptdmlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1NzU1NjcsImV4cCI6MjEwODE1MTU2N30.8lKUwxXAKJ8mWQ13c2T0HjHEzIHbp71LPjvUzInnvoY';

const supabase = createClient(url, key);

async function check() {
  const { data: elections, error: elErr } = await supabase.from('elections').select('id, title, status, created_at');
  console.log('ELECTIONS:', JSON.stringify(elections, null, 2));

  const { data: candidates, error: cErr } = await supabase.from('candidates').select('id, election_id, name, student_id, faculty, position_id, created_at');
  console.log('CANDIDATES:', JSON.stringify(candidates, null, 2));

  const { data: positions, error: pErr } = await supabase.from('election_positions').select('id, election_id, name');
  console.log('POSITIONS:', JSON.stringify(positions, null, 2));

  const { data: votes, error: vErr } = await supabase.from('voting_participation').select('id, election_id, receipt_hash');
  console.log('PARTICIPATION VOTES:', JSON.stringify(votes, null, 2));
}

check();
