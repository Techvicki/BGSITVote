import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Profile = {
  id: string;
  full_name: string;
  student_id: string;
  faculty: string;
  verification_status: string;
  role: 'student' | 'faculty_manager' | 'election_admin';
  faculty_id: string | null;
  department: string | null;
  created_at: string;
};

export type Election = {
  id: string;
  title: string;
  description: string;
  faculty: string | null;
  status: string;
  opens_at: string;
  closes_at: string;
  academic_year?: string | null;
  category?: string;
  instructions?: string | null;
  published_at?: string | null;
  updated_at?: string;
};

export type ElectionPosition = {
  id: string;
  election_id: string;
  name: string;
  description: string;
  eligible_departments: string[];
  eligible_semesters: string[];
  max_selections: number;
  max_winners: number;
  nomination_deadline: string | null;
  status: string;
};

export type { ElectionRule, CandidateMeta } from '@/lib/electionRules';

export type Candidate = {
  id: string;
  election_id: string;
  name: string;
  student_id: string;
  faculty: string;
  manifesto: string;
  image_url: string | null;
  position_id: string | null;
  application_status: 'pending' | 'approved' | 'rejected';
  semester: string | null;
  meta?: import('@/lib/electionRules').CandidateMeta;
};

export type Vote = {
  id: string;
  election_id: string;
  candidate_id?: string;
  voter_id: string;
  receipt_hash: string;
  created_at: string;
};
