import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Vote, ShieldCheck, Loader2, AlertCircle, Eye, EyeOff, GraduationCap, Lock, Mail, User, IdCard, KeyRound, CheckCircle2, Building2, BadgeCheck } from 'lucide-react';

const FACULTIES = ['Engineering', 'Law', 'Business', 'Arts', 'Science'];
const DEPARTMENTS = [
  'Computer Science',
  'Electronics & Communication',
  'Mechanical Engineering',
  'Civil Engineering',
  'Information Science',
  'Electrical & Electronics',
  'Academic Affairs',
  'Student Affairs',
  'Examinations Cell',
];

type FacultyRegResult = { status: 'success' } | { status: 'pending' } | { status: 'error'; message: string };

export default function LoginPage() {
  const { profile, signOut } = useAuth();
  const [roleMode, setRoleMode] = useState<'student' | 'faculty'>('student');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [faculty, setFaculty] = useState('');
  const [facultyId, setFacultyId] = useState('');
  const [department, setDepartment] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facultyRegResult, setFacultyRegResult] = useState<FacultyRegResult | null>(null);

  useEffect(() => {
    if (!profile) return;
    if (roleMode === 'faculty' && profile.role === 'student') {
      if (profile.verification_status === 'faculty_pending') {
        setError('Your faculty registration is awaiting administrator approval. You will be able to sign in once an administrator approves your request.');
        signOut();
      } else if (profile.verification_status === 'rejected') {
        setError('Your faculty registration was not approved. Please contact the election administrator.');
        signOut();
      } else {
        setError('This account does not have faculty access. Please register as faculty first.');
        signOut();
      }
    } else if (roleMode === 'student' && profile.role !== 'student') {
      setError('This is a faculty account. Please use the Faculty Login tab.');
      signOut();
    }
  }, [profile, roleMode, signOut]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFacultyRegResult(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (roleMode === 'student') {
        if (!fullName.trim() || !studentId.trim() || !faculty) {
          throw new Error('Please fill in all fields to create your account.');
        }
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          const { error: profileError } = await supabase.from('profiles').insert({
            id: data.user.id,
            full_name: fullName.trim(),
            student_id: studentId.trim(),
            faculty,
            verification_status: 'verified',
          });
          if (profileError) {
            throw new Error('Account created but profile setup failed. Please try signing in.');
          }
        }
      } else if (roleMode === 'faculty') {
        if (!fullName.trim() || !facultyId.trim() || !department || !email.trim()) {
          throw new Error('Please fill in all fields to submit your faculty registration.');
        }
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          const { error: regError } = await supabase.rpc('register_faculty', {
            p_faculty_id: facultyId.trim(),
            p_full_name: fullName.trim(),
            p_department: department,
            p_email: email.trim(),
          });
          if (regError) {
            const msg = regError.message.toLowerCase();
            if (msg.includes('already have a pending')) {
              throw new Error('You already have a pending faculty registration. Please wait for administrator approval.');
            } else if (msg.includes('already have faculty')) {
              throw new Error('This account already has faculty access. Please sign in.');
            } else {
              throw new Error('Registration submitted but something went wrong. Please try signing in and re-submitting.');
            }
          }
          setFacultyRegResult({ status: 'pending' });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      if (msg.toLowerCase().includes('already registered')) {
        setError('This email is already registered. Try signing in instead.');
      } else if (msg.toLowerCase().includes('invalid credentials')) {
        setError('Incorrect email or password. Please check and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setError('Enter your registered email first.');
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setError(resetError ? 'We could not send the reset email. Please try again.' : 'If the account exists, a password reset email has been sent.');
  }

  function switchMode(newMode: 'login' | 'signup') {
    setMode(newMode);
    setError(null);
    setFacultyRegResult(null);
  }

  if (profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-8 max-w-md w-full text-center animate-scaleIn">
          <Loader2 className="w-6 h-6 text-civic animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-text">Redirecting to your voting dashboard...</p>
        </div>
      </div>
    );
  }

  const isFacultySignup = roleMode === 'faculty' && mode === 'signup';
  const isStudentSignup = roleMode === 'student' && mode === 'signup';

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel — institutional identity */}
      <div className="lg:w-5/12 bg-navy text-white flex flex-col justify-between p-8 lg:p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 25% 25%, white 1px, transparent 1px), radial-gradient(circle at 75% 75%, white 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-11 h-11 bg-civic rounded-lg flex items-center justify-center">
              <Vote className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">BGSIT Vote</h1>
              <p className="text-xs text-white/60 uppercase tracking-label">Institutional Portal</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded text-xs font-semibold uppercase tracking-label mb-4">
                <ShieldCheck className="w-3.5 h-3.5" />
                Cryptographically Verified
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold leading-tight tracking-headline">
                Your vote. <br />Your voice. <br />Your institution.
              </h2>
              <p className="text-white/70 text-sm leading-relaxed mt-4 max-w-sm">
                The official student governance voting platform of BGS Institute of Technology. Secure, transparent, and certified by the Academic Oversight Committee.
              </p>
            </div>

            <div className="space-y-3 pt-4">
              {[
                { icon: ShieldCheck, label: 'Identity-verified balloting' },
                { icon: Lock, label: 'Encrypted receipt generation' },
                { icon: GraduationCap, label: 'Faculty-scoped elections' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3 text-sm text-white/80">
                  <item.icon className="w-4 h-4 text-civic ring-1 ring-civic/30" />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="relative pt-8">
          <p className="text-xs text-white/40">
            © 2026 BGS Institute of Technology · Student Governance Council
          </p>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="lg:w-7/12 flex-1 flex items-center justify-center p-6 lg:p-12 bg-slate-canvas">
        <div className="w-full max-w-md animate-fadeIn">

          {/* Faculty registration pending success screen */}
          {facultyRegResult?.status === 'pending' ? (
            <div className="card p-8 text-center animate-fadeIn">
              <div className="w-14 h-14 bg-emerald-bg rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-8 h-8 text-emerald-vote" />
              </div>
              <h2 className="text-xl font-bold text-navy-deep mb-2">Registration submitted</h2>
              <p className="text-sm text-slate-text leading-relaxed mb-5">
                Your faculty registration has been received and is now awaiting administrator approval.
                You will be able to sign in to the faculty portal once an election administrator approves your request.
              </p>
              <div className="rounded-lg border border-slate-border bg-slate-canvas p-4 mb-5 text-left">
                <p className="text-xs font-semibold uppercase tracking-label text-slate-text mb-2">What happens next</p>
                <ul className="space-y-2 text-sm text-slate-text">
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-vote shrink-0 mt-0.5" /> An administrator reviews your faculty ID and department</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-vote shrink-0 mt-0.5" /> Once approved, your account gets faculty manager access</li>
                  <li className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-vote shrink-0 mt-0.5" /> You can then sign in with the faculty portal using these credentials</li>
                </ul>
              </div>
              <button onClick={() => switchMode('login')} className="btn-civic w-full">
                Back to Faculty Sign In
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-headline2 text-navy-deep mb-1">
                  {roleMode === 'faculty'
                    ? mode === 'login' ? 'Faculty sign in' : 'Faculty registration'
                    : mode === 'login' ? 'Student sign in' : 'Create your voter account'}
                </h2>
                <p className="text-sm text-slate-text">
                  {roleMode === 'faculty'
                    ? mode === 'login'
                      ? 'Use your approved faculty credentials to manage assigned elections.'
                      : 'Register your faculty details for administrator approval.'
                    : mode === 'login'
                      ? 'Enter your institutional credentials to access active ballots.'
                      : 'Register with your BGSIT student details to participate in elections.'}
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 mb-5 bg-error-bg border border-error/20 rounded text-sm text-error-deep animate-fadeIn">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-wash p-1">
                <button type="button" onClick={() => { setRoleMode('student'); setMode('login'); setError(null); }} className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${roleMode === 'student' ? 'bg-white text-navy-deep shadow-sm' : 'text-slate-text'}`}>Student Login</button>
                <button type="button" onClick={() => { setRoleMode('faculty'); setMode('login'); setError(null); }} className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${roleMode === 'faculty' ? 'bg-white text-navy-deep shadow-sm' : 'text-slate-text'}`}>Faculty Login</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Student signup fields */}
                {isStudentSignup && (
                  <div className="space-y-4 animate-fadeIn">
                    <div>
                      <label className="label-text block mb-1.5">Full Name</label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Aarav Sharma"
                          className="input-field pl-10"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label-text block mb-1.5">Student ID</label>
                        <div className="relative">
                          <IdCard className="w-4 h-4 text-slate-muted absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={studentId}
                            onChange={(e) => setStudentId(e.target.value)}
                            placeholder="BGS2023001"
                            className="input-field pl-10"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label-text block mb-1.5">Faculty</label>
                        <select
                          value={faculty}
                          onChange={(e) => setFaculty(e.target.value)}
                          className="input-field"
                          required
                        >
                          <option value="">Select...</option>
                          {FACULTIES.map((f) => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Faculty signup fields */}
                {isFacultySignup && (
                  <div className="space-y-4 animate-fadeIn">
                    <div>
                      <label className="label-text block mb-1.5">Full Name</label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-muted absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Dr. Priya Nair"
                          className="input-field pl-10"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="label-text block mb-1.5">Faculty ID</label>
                        <div className="relative">
                          <BadgeCheck className="w-4 h-4 text-slate-muted absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={facultyId}
                            onChange={(e) => setFacultyId(e.target.value)}
                            placeholder="BGS-FAC-001"
                            className="input-field pl-10"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="label-text block mb-1.5">Department</label>
                        <select
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          className="input-field"
                          required
                        >
                          <option value="">Select...</option>
                          {DEPARTMENTS.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-border bg-amber-bg p-3.5 text-xs leading-relaxed text-amber-seal">
                      <Building2 className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>Your faculty registration will be reviewed by an election administrator. You will not be able to access the faculty portal until your request is approved.</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="label-text block mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={roleMode === 'faculty' ? 'faculty@bgsit.edu.in' : 'student@bgsit.edu.in'}
                      className="input-field pl-10"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="label-text block mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === 'login' ? 'Enter your password' : 'Create a password (min 6 characters)'}
                      className="input-field pl-10 pr-10"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-muted hover:text-navy-deep transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-civic w-full flex items-center justify-center gap-2 mt-6 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {roleMode === 'faculty'
                    ? mode === 'login' ? 'Secure Faculty Login' : 'Submit Registration'
                    : mode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              {mode === 'login' && (
                <button type="button" onClick={resetPassword} className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-civic hover:underline">
                  <KeyRound className="h-4 w-4" /> Forgot password?
                </button>
              )}
              {roleMode === 'faculty' && mode === 'login' && (
                <p className="mt-4 text-center text-xs leading-relaxed text-slate-text">
                  Faculty access is administrator-approved. If you need an account, register below.
                </p>
              )}

              <div className="mt-6 pt-6 border-t border-slate-border text-center">
                <p className="text-sm text-slate-text">
                  {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
                  <button
                    onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                    className="text-civic font-semibold hover:underline"
                  >
                    {mode === 'login'
                      ? roleMode === 'faculty' ? 'Register as faculty' : 'Register here'
                      : 'Sign in'}
                  </button>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
