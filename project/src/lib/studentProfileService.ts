import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { serializeCandidateManifesto } from '@/lib/electionRules';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type CreateStudentCandidateParams = {
  fullName: string;
  studentId: string;
  email: string;
  password: string;
  department: string;
  semester: string;
  electionId: string;
  positionId: string;
  party?: string;
  symbol?: string;
  imageUrl?: string;
  intro?: string;
  manifesto?: string;
};

export type StudentCredentialResult = {
  userId: string;
  candidateId: string | null;
  email: string;
  password: string;
  studentId: string;
  fullName: string;
  positionName: string;
  partyName?: string;
};

/**
 * Creates a verified student auth account, student profile, eligibility record,
 * and registers them as an approved candidate for a custom/elective post.
 * Uses an isolated Supabase client so the active faculty manager session is NEVER logged out.
 */
export async function createStudentCandidateProfile(
  params: CreateStudentCandidateParams,
  positionName: string
): Promise<StudentCredentialResult> {
  const isolatedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  // 1. Create auth user in Supabase Auth
  const { data: authData, error: authErr } = await isolatedClient.auth.signUp({
    email: params.email.trim(),
    password: params.password,
  });

  if (authErr) {
    throw new Error(`Authentication registration failed: ${authErr.message}`);
  }

  const userId = authData.user?.id;
  if (!userId) {
    throw new Error('Failed to retrieve new student account ID from auth provider.');
  }

  // 2. Create student profile in profiles table
  const { error: profileErr } = await supabase.from('profiles').insert({
    id: userId,
    full_name: params.fullName.trim(),
    student_id: params.studentId.trim(),
    faculty: params.department,
    department: params.department,
    role: 'student',
    verification_status: 'verified',
  });

  if (profileErr && !profileErr.message.includes('duplicate key')) {
    // Attempt fallback update
    await supabase.from('profiles').update({
      full_name: params.fullName.trim(),
      student_id: params.studentId.trim(),
      faculty: params.department,
      department: params.department,
      role: 'student',
      verification_status: 'verified',
    }).eq('id', userId);
  }

  // 3. Enroll student as eligible voter in student_eligibility
  try {
    await supabase.rpc('assign_student_eligibility', {
      p_election_id: params.electionId,
      p_student_id: userId,
      p_department: params.department,
      p_semester: params.semester,
      p_eligible: true,
    });
  } catch {
    // If function fails, attempt direct insert
    await supabase.from('student_eligibility').insert({
      election_id: params.electionId,
      student_id: userId,
      department: params.department,
      semester: params.semester,
      eligible: true,
    });
  }

  // 4. Register candidate for contested position
  const serializedManifesto = serializeCandidateManifesto(params.manifesto ?? '', {
    party: params.party?.trim() || undefined,
    symbol: params.symbol?.trim() || undefined,
    intro: params.intro?.trim() || undefined,
    branch: params.department,
  });

  const { data: candidateId, error: candErr } = await supabase.rpc('create_candidate', {
    p_election_id: params.electionId,
    p_position_id: params.positionId,
    p_name: params.fullName.trim(),
    p_student_id: params.studentId.trim(),
    p_faculty: params.department,
    p_semester: params.semester || null,
    p_manifesto: serializedManifesto,
    p_image_url: params.imageUrl?.trim() || null,
  });

  if (candErr) {
    throw new Error(`Student account created, but candidate registration failed: ${candErr.message}`);
  }

  // 5. Auto-approve candidate application for ballot
  if (candidateId) {
    await supabase.rpc('review_candidate', {
      p_candidate_id: candidateId,
      p_status: 'approved',
      p_note: 'Direct faculty nomination & profile enrollment',
    });
  }

  return {
    userId,
    candidateId: candidateId as string | null,
    email: params.email.trim(),
    password: params.password,
    studentId: params.studentId.trim(),
    fullName: params.fullName.trim(),
    positionName,
    partyName: params.party?.trim(),
  };
}
