import { useEffect, useState } from 'react';
import { supabase, type Candidate, type Election, type ElectionPosition, type Profile } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  AlertCircle, BarChart3, Check, CheckCircle2, ChevronRight, Clock3, FilePlus2,
  GraduationCap, LayoutDashboard, LogOut, Menu, Pause, Play, Plus, ShieldCheck,
  Square, Users, X, Target, UserCog, UserCircle, UserCheck, Mail, BadgeCheck,
  AlertTriangle, Gavel, Trash2, Edit3, Upload, Image as ImageIcon, Ban, Flag,
  ShieldAlert, FileText, XCircle, RotateCcw, Sparkles, Search, Filter, Award, Eye,
  Timer, Hourglass, Infinity as InfinityIcon, UserPlus, Key, Copy, ExternalLink, Calendar
} from 'lucide-react';
import {
  type ElectionRule,
  type CandidateMeta,
  type ElectionRuleCategory,
  type ElectionRulePenalty,
  DEFAULT_ELECTION_RULES,
  parseElectionRules,
  serializeElectionRules,
  parseCandidateManifesto,
  serializeCandidateManifesto,
  saveElectionRulesLocally,
  compressImageFile
} from '@/lib/electionRules';
import {
  UNRESTRICTED_CLOSE_DATE,
  isElectionUnrestricted,
  computeTimerState,
} from '@/lib/electionTimer';
import LiveCountdownTimer from '@/components/LiveCountdownTimer';
import CustomTimerSetting, { type CustomTimerValues } from '@/components/CustomTimerSetting';
import {
  createStudentCandidateProfile,
  type StudentCredentialResult,
} from '@/lib/studentProfileService';

type Tab = 'overview' | 'elections' | 'positions' | 'candidates' | 'rules' | 'eligibility' | 'controls' | 'results' | 'profile' | 'approvals';

type Notice = { type: 'success' | 'error'; text: string } | null;

const DEPARTMENTS = [
  'Computer Science',
  'Electronics & Communication',
  'Mechanical Engineering',
  'Civil Engineering',
  'Information Science',
  'Electrical & Electronics',
];

const SEMESTERS = ['1', '2', '3', '4', '5', '6', '7', '8'];

const ELECTION_CATEGORIES = [
  'Student Governance',
  'Department Representative',
  'Class Representative',
  'Cultural Committee',
  'Sports Committee',
  'Special Election',
];

export default function FacultyDashboard() {
  const { profile, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedElection, setSelectedElection] = useState<Election | null>(null);
  const [positions, setPositions] = useState<ElectionPosition[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [participation, setParticipation] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => { loadDashboard(); }, []);

  async function loadDashboard() {
    setLoading(true);
    const { data, error } = await supabase.from('elections').select('*').order('created_at', { ascending: false });
    if (error) {
      setNotice({ type: 'error', text: 'Could not load election data. Please try again.' });
    } else {
      const loaded = (data ?? []) as Election[];
      setElections(loaded);
      if (!selectedElection && loaded[0]) setSelectedElection(loaded[0]);
      const { data: counts } = await supabase.from('voting_participation').select('election_id');
      const totals: Record<string, number> = {};
      (counts ?? []).forEach((row: { election_id: string }) => { totals[row.election_id] = (totals[row.election_id] ?? 0) + 1; });
      setParticipation(totals);
    }
    setLoading(false);
  }

  async function loadElectionDetails(election: Election) {
    setSelectedElection(election);
    const [{ data: positionRows }, { data: candidateRows }] = await Promise.all([
      supabase.from('election_positions').select('*').eq('election_id', election.id).order('created_at'),
      supabase.from('candidates').select('*').eq('election_id', election.id).order('created_at'),
    ]);
    setPositions((positionRows ?? []) as ElectionPosition[]);
    const parsedCandidates = ((candidateRows ?? []) as Candidate[]).map((c) => {
      const { cleanManifesto, meta } = parseCandidateManifesto(c.manifesto);
      return {
        ...c,
        manifesto: cleanManifesto,
        meta,
      };
    });
    setCandidates(parsedCandidates);
  }

  async function changeStatus(status: string) {
    if (!selectedElection) return;
    const reason = window.prompt(status === 'paused' || status === 'closed' ? 'Enter a reason for this action (recorded in the audit log):' : 'Optional note for the audit log:');
    if ((status === 'paused' || status === 'closed') && !reason?.trim()) return;
    const { error } = await supabase.rpc('update_election_status', { p_election_id: selectedElection.id, p_status: status, p_reason: reason ?? '' });
    if (error) {
      setNotice({ type: 'error', text: 'That election status change could not be completed.' });
      return;
    }
    setNotice({ type: 'success', text: `Election marked as ${status.replace('_', ' ')}.` });
    await loadDashboard();
    const refreshed = elections.find((e) => e.id === selectedElection.id);
    if (refreshed) await loadElectionDetails({ ...refreshed, status });
  }

  const activeCount = elections.filter((e) => e.status === 'active').length;
  const pendingCandidates = candidates.filter((c) => c.application_status === 'pending').length;
  const totalParticipation = Object.values(participation).reduce((sum, value) => sum + value, 0);

  const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'elections', label: 'Manage Elections', icon: FilePlus2 },
    { id: 'positions', label: 'Manage Positions', icon: Target },
    { id: 'candidates', label: 'Manage Candidates', icon: Users },
    { id: 'rules', label: 'Rules & Disqualifications', icon: ShieldAlert },
    { id: 'eligibility', label: 'Student Eligibility', icon: ShieldCheck },
    { id: 'controls', label: 'Voting Controls', icon: ShieldCheck },
    { id: 'results', label: 'Results', icon: BarChart3 },
    ...(profile?.role === 'election_admin' ? [{ id: 'approvals' as Tab, label: 'Faculty Approvals', icon: UserCheck }] : []),
    { id: 'profile', label: 'Profile', icon: UserCircle },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Clock3 className="h-6 w-6 animate-spin text-civic" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-canvas">
      {/* Header */}
      <header className="glass-bar sticky top-0 z-40 border-b border-slate-border/80">
        <div className="max-w-page mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded bg-civic text-white">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-navy-deep">BGSIT Vote</p>
              <p className="text-[10px] uppercase tracking-label text-slate-text">Faculty Administration</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-navy-deep">{profile?.full_name ?? 'Faculty member'}</p>
              <p className="text-xs text-slate-text">{profile?.faculty_id ?? 'Election Manager'} · {profile?.department ?? 'Academic Affairs'}</p>
            </div>
            <button onClick={signOut} className="flex items-center gap-2 text-sm text-slate-text hover:text-navy-deep">
              <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign Out</span>
            </button>
            <button onClick={() => setMobileNav(!mobileNav)} className="rounded p-2 text-slate-text lg:hidden" aria-label="Toggle navigation">
              {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-page mx-auto flex px-4 lg:px-8">
        {/* Sidebar */}
        <aside className={`${mobileNav ? 'block' : 'hidden'} absolute left-4 right-4 top-20 z-30 rounded-lg border border-slate-border bg-white p-3 shadow-tier2 lg:relative lg:left-auto lg:right-auto lg:top-auto lg:block lg:w-64 lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0 lg:pr-8 lg:pt-8 lg:shadow-none`}>
          <nav className="space-y-1">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setTab(id); setMobileNav(false); }}
                className={`flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm font-medium transition-colors ${tab === id ? 'bg-civic-wash text-civic' : 'text-slate-text hover:bg-slate-wash hover:text-navy-deep'}`}
              >
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
            <button onClick={signOut} className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left text-sm font-medium text-slate-text hover:bg-slate-wash hover:text-navy-deep">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </nav>
          <div className="mt-8 rounded-lg border border-slate-border bg-white p-4">
            <p className="label-text">Access level</p>
            <p className="mt-2 text-sm font-semibold text-navy-deep">{profile?.role === 'election_admin' ? 'Election Administrator' : 'Faculty Election Manager'}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-text">Only assigned elections and authorized actions are available.</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 py-6 lg:py-8">
          {notice && (
            <div className={`mb-6 flex items-start gap-2.5 rounded border p-3.5 text-sm animate-fadeIn ${notice.type === 'error' ? 'border-error/20 bg-error-bg text-error-deep' : 'border-emerald-border bg-emerald-bg text-emerald-deep'}`}>
              <span className="mt-0.5">{notice.type === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</span>
              <span className="flex-1">{notice.text}</span>
              <button onClick={() => setNotice(null)}><X className="h-4 w-4" /></button>
            </div>
          )}

          {tab === 'overview' && (
            <Overview
              profileName={profile?.full_name ?? 'Faculty member'}
              profile={profile}
              activeCount={activeCount}
              elections={elections}
              pendingCandidates={pendingCandidates}
              totalParticipation={totalParticipation}
              onOpen={(election) => { loadElectionDetails(election); setTab('elections'); }}
            />
          )}
          {tab === 'elections' && (
            <ElectionManager
              elections={elections}
              selected={selectedElection}
              onSelect={loadElectionDetails}
              onCreated={async (msg) => { await loadDashboard(); setNotice({ type: 'success', text: msg }); }}
            />
          )}
          {tab === 'positions' && (
            <PositionsManager
              election={selectedElection}
              positions={positions}
              candidates={candidates}
              onNotice={setNotice}
              onRefresh={async () => { if (selectedElection) await loadElectionDetails(selectedElection); }}
            />
          )}
          {tab === 'candidates' && (
            <CandidateManager
              election={selectedElection}
              positions={positions}
              candidates={candidates}
              profile={profile}
              onNotice={setNotice}
              onReview={async (id, status) => {
                const { error } = await supabase.rpc('review_candidate', { p_candidate_id: id, p_status: status, p_note: '' });
                if (error) setNotice({ type: 'error', text: 'Candidate review could not be saved.' });
                else {
                  setNotice({ type: 'success', text: `Candidate ${status}.` });
                  if (selectedElection) await loadElectionDetails(selectedElection);
                }
              }}
              onRefresh={async () => { if (selectedElection) await loadElectionDetails(selectedElection); }}
            />
          )}
          {tab === 'rules' && (
            <RulesDisqualificationManager
              election={selectedElection}
              candidates={candidates}
              profile={profile}
              onNotice={setNotice}
              onRefresh={async () => {
                if (selectedElection) await loadElectionDetails(selectedElection);
                await loadDashboard();
              }}
            />
          )}
          {tab === 'eligibility' && (
            <EligibilityManager election={selectedElection} onNotice={setNotice} />
          )}
          {tab === 'controls' && (
            <ControlPanel
              election={selectedElection}
              participation={selectedElection ? participation[selectedElection.id] ?? 0 : 0}
              onChange={changeStatus}
              onNotice={setNotice}
              onRefresh={loadDashboard}
            />
          )}
          {tab === 'results' && (
            <ResultsPanel elections={elections} participation={participation} />
          )}
          {tab === 'profile' && (
            <ProfilePanel profile={profile} onSignOut={signOut} />
          )}
          {tab === 'approvals' && (
            <ApprovalsPanel onNotice={setNotice} />
          )}
        </main>
      </div>
    </div>
  );
}

/* --- Overview --- */
function Overview({ profileName, profile, activeCount, elections, pendingCandidates, totalParticipation, onOpen }: {
  profileName: string; profile: Profile | null; activeCount: number; elections: Election[]; pendingCandidates: number; totalParticipation: number; onOpen: (election: Election) => void;
}) {
  const upcoming = elections.filter((e) => e.status === 'scheduled');
  const completed = elections.filter((e) => e.status === 'closed' || e.status === 'results_published');

  return (
    <>
      <div className="mb-8 rounded-lg bg-navy p-6 text-white shadow-tier1 lg:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div className="relative">
          <p className="mb-2 text-sm text-white/60">Faculty workspace</p>
          <h1 className="text-2xl font-bold tracking-headline lg:text-3xl">Welcome, {profileName.split(' ')[0]}</h1>
          {profile && (
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-white/70">
              <span>Faculty ID: {profile.faculty_id ?? 'N/A'}</span>
              <span>·</span>
              <span>Department: {profile.department ?? 'Academic Affairs'}</span>
            </div>
          )}
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">Manage your assigned student elections, review candidate applications, and monitor participation without exposing individual ballot choices.</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric icon={Play} label="Voting open" value={activeCount} />
        <Metric icon={FilePlus2} label="Total elections" value={elections.length} />
        <Metric icon={Users} label="Pending reviews" value={pendingCandidates} />
        <Metric icon={BarChart3} label="Participations" value={totalParticipation} />
      </div>

      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="headline-md">Recent elections</h2>
          <span className="text-sm text-slate-text">{elections.length} total</span>
        </div>
        {elections.length === 0 ? (
          <Empty text="No elections have been created yet." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {elections.slice(0, 4).map((election) => (
              <ElectionSummary key={election.id} election={election} onOpen={onOpen} />
            ))}
          </div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section className="mb-8">
          <h2 className="headline-md mb-4">Upcoming elections</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((e) => <ElectionSummary key={e.id} election={e} onOpen={onOpen} />)}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="headline-md mb-4">Completed elections</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {completed.map((e) => <ElectionSummary key={e.id} election={e} onOpen={onOpen} />)}
          </div>
        </section>
      )}
    </>
  );
}

/* --- Election Manager --- */
function ElectionManager({ elections, selected, onSelect, onCreated }: {
  elections: Election[]; selected: Election | null; onSelect: (e: Election) => void; onCreated: (msg: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingTimer, setEditingTimer] = useState(false);
  const [savingTimer, setSavingTimer] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '', academicYear: '2026–27', description: '', category: 'Student Governance',
    opensAt: new Date(Date.now() - 30000).toISOString(),
    closesAt: new Date(Date.now() + 86400000).toISOString(),
    instructions: '',
    departments: [] as string[], semesters: [] as string[],
  });

  function toggleDept(d: string) {
    setForm((f) => ({ ...f, departments: f.departments.includes(d) ? f.departments.filter((x) => x !== d) : [...f.departments, d] }));
  }
  function toggleSem(s: string) {
    setForm((f) => ({ ...f, semesters: f.semesters.includes(s) ? f.semesters.filter((x) => x !== s) : [...f.semesters, s] }));
  }

  async function handleUpdateElectionTimer(values: CustomTimerValues) {
    if (!selected) return;
    setSavingTimer(true);
    const { error } = await supabase
      .from('elections')
      .update({
        opens_at: values.opensAt,
        closes_at: values.closesAt,
      })
      .eq('id', selected.id);
    setSavingTimer(false);
    if (error) {
      alert(`Failed to update timer: ${error.message}`);
      return;
    }
    setEditingTimer(false);
    await onCreated(values.isUnrestricted
      ? 'Custom timer set to Unrestricted (No Time Limit).'
      : 'Custom starting and ending timer schedule saved successfully.');
  }

  async function create() {
    setFormError(null);
    if (!form.title.trim() || !form.description.trim() || !form.opensAt || !form.closesAt) {
      setFormError('Title, description, and custom timer settings are all required.');
      return;
    }
    if (new Date(form.opensAt) >= new Date(form.closesAt)) {
      setFormError('Voting close time must be strictly after the open time.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('create_election', {
      p_title: form.title,
      p_academic_year: form.academicYear,
      p_description: form.description,
      p_category: form.category,
      p_opens_at: new Date(form.opensAt).toISOString(),
      p_closes_at: new Date(form.closesAt).toISOString(),
      p_instructions: form.instructions,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message.includes('Not authorized') ? 'You are not authorized to create elections.' : 'Could not create the election. Please check your inputs.');
      return;
    }
    setCreating(false);
    setForm({
      title: '', academicYear: '2026–27', description: '', category: 'Student Governance',
      opensAt: new Date(Date.now() - 30000).toISOString(),
      closesAt: new Date(Date.now() + 86400000).toISOString(),
      instructions: '', departments: [], semesters: []
    });
    await onCreated('Election created successfully with custom timer settings.');
  }

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label-text mb-2 text-civic">Election management</p>
          <h1 className="headline-lg">Manage elections</h1>
          <p className="mt-2 text-sm text-slate-text">Create and configure the contests assigned to your faculty role.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-civic inline-flex items-center justify-center gap-2">
          <Plus className="h-4 w-4" /> Create election
        </button>
      </div>

      {creating && (
        <div className="card mb-6 p-5 lg:p-6 animate-fadeIn">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="headline-md">New election</h2>
            <button onClick={() => setCreating(false)} className="text-slate-text hover:text-navy-deep"><X className="h-5 w-5" /></button>
          </div>

          {formError && (
            <div className="mb-4 flex items-start gap-2.5 rounded border border-error/20 bg-error-bg p-3.5 text-sm text-error-deep">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{formError}</span>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Election title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Student Council Elections 2026" />
            </div>
            <Field label="Academic year" value={form.academicYear} onChange={(v) => setForm({ ...form, academicYear: v })} placeholder="2026–27" />
            <div>
              <label className="label-text mb-1.5 block">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
                {ELECTION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label-text mb-2 block font-semibold text-navy-deep">
                Custom Voting Window Timer Settings (Starting & Ending Timers) *
              </label>
              <CustomTimerSetting
                initialOpensAt={form.opensAt}
                initialClosesAt={form.closesAt}
                onChange={(values) => {
                  setForm((f) => ({
                    ...f,
                    opensAt: values.opensAt,
                    closesAt: values.closesAt,
                  }));
                }}
              />
            </div>

            <div className="md:col-span-2">
              <label className="label-text mb-1.5 block">Eligible departments</label>
              <div className="flex flex-wrap gap-2 rounded border border-slate-frame p-3">
                {DEPARTMENTS.map((d) => (
                  <label key={d} className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={form.departments.includes(d)} onChange={() => toggleDept(d)} className="accent-civic" />
                    {d}
                  </label>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="label-text mb-1.5 block">Eligible semesters</label>
              <div className="flex flex-wrap gap-2 rounded border border-slate-frame p-3">
                {SEMESTERS.map((s) => (
                  <label key={s} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={form.semesters.includes(s)} onChange={() => toggleSem(s)} className="accent-civic" />
                    Semester {s}
                  </label>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="label-text mb-1.5 block">Description</label>
              <textarea className="input-field min-h-24 h-auto py-3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Explain the purpose of this election." />
            </div>
            <div className="md:col-span-2">
              <label className="label-text mb-1.5 block">Election instructions</label>
              <textarea className="input-field min-h-20 h-auto py-3" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="Instructions students should read before voting." />
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setCreating(false)} className="btn-secondary">Cancel</button>
            <button onClick={create} disabled={saving} className="btn-civic inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save election'}
            </button>
          </div>
        </div>
      )}

      {/* Election list */}
      <div className="space-y-3">
        {elections.length === 0 ? (
          <Empty text="No elections have been created yet." />
        ) : (
          elections.map((election) => (
            <ElectionSummary key={election.id} election={election} selected={selected?.id === election.id} onOpen={onSelect} />
          ))
        )}
      </div>

      {/* Selected election details */}
      {selected && !creating && (
        <div className="card mt-6 p-5 lg:p-6 animate-fadeIn">
          <h2 className="headline-md mb-3">{selected.title}</h2>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <StatusBadge status={selected.status} />
            <span className="text-sm text-slate-text">{selected.category}</span>
            {selected.academic_year && <span className="text-sm text-slate-text">· {selected.academic_year}</span>}
          </div>
          <p className="text-sm text-slate-text leading-relaxed mb-4">{selected.description}</p>
          {selected.instructions && (
            <div className="mb-4 rounded border border-slate-border bg-slate-canvas p-3">
              <p className="label-text mb-1">Instructions</p>
              <p className="text-sm text-slate-text">{selected.instructions}</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p className="label-text mb-1">Voting opens</p>
              <p className="text-navy-deep font-semibold">{new Date(selected.opens_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </div>
            <div>
              <p className="label-text mb-1">Voting closes</p>
              <p className="text-navy-deep font-semibold">
                {isElectionUnrestricted(selected.closes_at)
                  ? 'No Time Limit (Unrestricted)'
                  : new Date(selected.closes_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-border flex flex-wrap items-center justify-between gap-3">
            <LiveCountdownTimer status={selected.status} opensAt={selected.opens_at} closesAt={selected.closes_at} variant="compact" />
            <button
              onClick={() => setEditingTimer(!editingTimer)}
              className="btn-secondary inline-flex items-center gap-1.5 text-xs py-1.5 px-3 bg-white hover:border-civic"
            >
              <Timer className="w-3.5 h-3.5 text-civic" />
              {editingTimer ? 'Hide Custom Timer' : 'Configure Custom Timer Settings'}
            </button>
          </div>

          {editingTimer && (
            <div className="mt-4 pt-4 border-t border-slate-border animate-fadeIn">
              <CustomTimerSetting
                initialOpensAt={selected.opens_at}
                initialClosesAt={selected.closes_at}
                onSave={handleUpdateElectionTimer}
                saving={savingTimer}
                saveButtonText="Save Custom Timer Settings"
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* --- Positions Manager --- */
function PositionsManager({ election, positions, candidates, onNotice, onRefresh }: {
  election: Election | null;
  positions: ElectionPosition[];
  candidates: Candidate[];
  onNotice: (n: Notice) => void;
  onRefresh: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [editingPos, setEditingPos] = useState<ElectionPosition | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const PRESET_POSITIONS = [
    { name: 'President', desc: 'Apex student representative leading the Student Council and administrative liaison.' },
    { name: 'Vice President', desc: 'Assists president and chairs student welfare subcommittees.' },
    { name: 'General Secretary', desc: 'Coordinates administrative, communications, and institutional affairs.' },
    { name: 'Joint Secretary', desc: 'Supports campus event coordination and student grievance cells.' },
    { name: 'Treasurer', desc: 'Manages student governance budgets, accounts, and financial reports.' },
    { name: 'Cultural Secretary', desc: 'Directs college fests, fine arts, and cultural club initiatives.' },
    { name: 'Sports Secretary', desc: 'Oversees athletic tournaments, intra-college cups, and sports teams.' },
    { name: 'Technical Head', desc: 'Leads tech fests, hackathons, and technical club activities.' },
  ];

  const [form, setForm] = useState({
    name: '',
    description: '',
    departments: [] as string[],
    semesters: [] as string[],
    maxSelections: '1',
    maxWinners: '1',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    departments: [] as string[],
    semesters: [] as string[],
    maxSelections: '1',
    maxWinners: '1',
    status: 'active',
  });

  function applyPreset(preset: { name: string; desc: string }) {
    setForm(prev => ({
      ...prev,
      name: preset.name,
      description: preset.desc,
    }));
  }

  function toggleDept(dept: string, isEdit = false) {
    if (isEdit) {
      setEditForm(prev => ({
        ...prev,
        departments: prev.departments.includes(dept)
          ? prev.departments.filter(d => d !== dept)
          : [...prev.departments, dept],
      }));
    } else {
      setForm(prev => ({
        ...prev,
        departments: prev.departments.includes(dept)
          ? prev.departments.filter(d => d !== dept)
          : [...prev.departments, dept],
      }));
    }
  }

  function toggleSem(sem: string, isEdit = false) {
    if (isEdit) {
      setEditForm(prev => ({
        ...prev,
        semesters: prev.semesters.includes(sem)
          ? prev.semesters.filter(s => s !== sem)
          : [...prev.semesters, sem],
      }));
    } else {
      setForm(prev => ({
        ...prev,
        semesters: prev.semesters.includes(sem)
          ? prev.semesters.filter(s => s !== sem)
          : [...prev.semesters, sem],
      }));
    }
  }

  function setAllDepts(all: boolean, isEdit = false) {
    const val = all ? [...DEPARTMENTS] : [];
    if (isEdit) setEditForm(prev => ({ ...prev, departments: val }));
    else setForm(prev => ({ ...prev, departments: val }));
  }

  function setAllSems(all: boolean, isEdit = false) {
    const val = all ? [...SEMESTERS] : [];
    if (isEdit) setEditForm(prev => ({ ...prev, semesters: val }));
    else setForm(prev => ({ ...prev, semesters: val }));
  }

  async function create() {
    if (!election || !form.name.trim()) {
      onNotice({ type: 'error', text: 'Position title is required.' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc('create_position', {
      p_election_id: election.id,
      p_name: form.name.trim(),
      p_description: form.description.trim(),
      p_departments: form.departments,
      p_semesters: form.semesters,
      p_max_selections: parseInt(form.maxSelections) || 1,
      p_max_winners: parseInt(form.maxWinners) || 1,
      p_nomination_deadline: null,
    });

    setSaving(false);
    if (error) {
      onNotice({
        type: 'error',
        text: error.message.includes('after voting')
          ? 'Positions cannot be added after voting begins.'
          : `Could not create position: ${error.message}`,
      });
      return;
    }

    setCreating(false);
    setForm({ name: '', description: '', departments: [], semesters: [], maxSelections: '1', maxWinners: '1' });
    onNotice({ type: 'success', text: `Position "${form.name.trim()}" created successfully.` });
    await onRefresh();
  }

  function startEdit(pos: ElectionPosition) {
    setEditingPos(pos);
    setEditForm({
      name: pos.name,
      description: pos.description ?? '',
      departments: pos.eligible_departments ?? [],
      semesters: pos.eligible_semesters ?? [],
      maxSelections: String(pos.max_selections || 1),
      maxWinners: String(pos.max_winners || 1),
      status: pos.status ?? 'active',
    });
  }

  async function saveEdit() {
    if (!editingPos || !editForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from('election_positions')
      .update({
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        eligible_departments: editForm.departments,
        eligible_semesters: editForm.semesters,
        max_selections: parseInt(editForm.maxSelections) || 1,
        max_winners: parseInt(editForm.maxWinners) || 1,
        status: editForm.status,
      })
      .eq('id', editingPos.id);

    setSaving(false);
    if (error) {
      onNotice({ type: 'error', text: `Failed to update position: ${error.message}` });
      return;
    }

    setEditingPos(null);
    onNotice({ type: 'success', text: `Position "${editForm.name.trim()}" updated successfully.` });
    await onRefresh();
  }

  async function deletePosition(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to delete the position "${name}"? Candidates assigned to this post will be unassigned.`)) {
      return;
    }
    setDeletingId(id);
    const { error } = await supabase.from('election_positions').delete().eq('id', id);
    setDeletingId(null);
    if (error) {
      onNotice({ type: 'error', text: `Failed to delete position: ${error.message}` });
      return;
    }
    onNotice({ type: 'success', text: `Position "${name}" deleted.` });
    await onRefresh();
  }

  if (!election) return <Empty text="Select an election first to manage its voting positions." />;

  const canModify = election.status === 'scheduled';

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label-text mb-2 text-civic">Voting positions & posts</p>
          <h1 className="headline-lg">Manage positions</h1>
          <p className="mt-2 text-sm text-slate-text">
            {election.title} · Manually configure elective posts, eligibility criteria, and winner quotas.
          </p>
        </div>
        {canModify && !creating && !editingPos && (
          <button onClick={() => setCreating(true)} className="btn-civic inline-flex items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Create new position
          </button>
        )}
      </div>

      {/* Create Position Form */}
      {creating && (
        <div className="card mb-6 p-5 lg:p-6 animate-fadeIn border-2 border-civic/20">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="headline-md">Create position / post</h2>
              <p className="text-xs text-slate-text mt-0.5">Define a new contested office for this election.</p>
            </div>
            <button onClick={() => setCreating(false)} className="text-slate-text hover:text-navy-deep">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Quick presets */}
          <div className="mb-5 rounded-lg border border-slate-border bg-slate-canvas p-3">
            <p className="label-text mb-2 flex items-center gap-1.5 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-civic" /> Quick presets for campus governance
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_POSITIONS.map(p => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-navy-deep border border-slate-border hover:border-civic hover:text-civic transition-colors"
                >
                  + {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field
                label="Position title"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                placeholder="e.g. Student Council President"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label-text mb-1.5 block">Role description & responsibilities</label>
              <textarea
                className="input-field min-h-20 h-auto py-3"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the duties, portfolio, and eligibility requirements for this office."
              />
            </div>

            <Field
              label="Max selections per voter"
              type="number"
              value={form.maxSelections}
              onChange={(v) => setForm({ ...form, maxSelections: v })}
              placeholder="1"
            />
            <Field
              label="Max winners to elect"
              type="number"
              value={form.maxWinners}
              onChange={(v) => setForm({ ...form, maxWinners: v })}
              placeholder="1"
            />

            {/* Department Eligibility */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="label-text">Department eligibility</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAllDepts(true)}
                    className="text-[11px] text-civic hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-[11px] text-slate-muted">·</span>
                  <button
                    type="button"
                    onClick={() => setAllDepts(false)}
                    className="text-[11px] text-slate-text hover:underline"
                  >
                    Clear (All departments eligible)
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded border border-slate-frame p-3 bg-white">
                {DEPARTMENTS.map((d) => (
                  <label key={d} className="flex items-center gap-1.5 text-xs text-navy-deep cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.departments.includes(d)}
                      onChange={() => toggleDept(d)}
                      className="accent-civic rounded"
                    />
                    <span className="truncate">{d}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Semester Eligibility */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="label-text">Semester eligibility</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAllSems(true)}
                    className="text-[11px] text-civic hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-[11px] text-slate-muted">·</span>
                  <button
                    type="button"
                    onClick={() => setAllSems(false)}
                    className="text-[11px] text-slate-text hover:underline"
                  >
                    Clear (All semesters eligible)
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 rounded border border-slate-frame p-3 bg-white">
                {SEMESTERS.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-xs text-navy-deep cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.semesters.includes(s)}
                      onChange={() => toggleSem(s)}
                      className="accent-civic rounded"
                    />
                    Sem {s}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setCreating(false)} className="btn-secondary">Cancel</button>
            <button onClick={create} disabled={saving} className="btn-civic inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? 'Creating...' : 'Save position'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Position Modal */}
      {editingPos && (
        <div className="card mb-6 p-5 lg:p-6 animate-fadeIn border-2 border-amber-border bg-amber-50/20">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="headline-md">Edit position: {editingPos.name}</h2>
              <p className="text-xs text-slate-text mt-0.5">Modify position details, quotas, and department restrictions.</p>
            </div>
            <button onClick={() => setEditingPos(null)} className="text-slate-text hover:text-navy-deep">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field
                label="Position title"
                value={editForm.name}
                onChange={(v) => setEditForm({ ...editForm, name: v })}
                placeholder="Position title"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label-text mb-1.5 block">Description</label>
              <textarea
                className="input-field min-h-20 h-auto py-3"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              />
            </div>
            <Field
              label="Max selections per voter"
              type="number"
              value={editForm.maxSelections}
              onChange={(v) => setEditForm({ ...editForm, maxSelections: v })}
              placeholder="1"
            />
            <Field
              label="Max winners to elect"
              type="number"
              value={editForm.maxWinners}
              onChange={(v) => setEditForm({ ...editForm, maxWinners: v })}
              placeholder="1"
            />

            <div>
              <label className="label-text mb-1.5 block">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="input-field"
              >
                <option value="active">Active (Appears on ballot)</option>
                <option value="inactive">Inactive (Hidden)</option>
              </select>
            </div>

            {/* Department Eligibility */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="label-text">Department eligibility</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAllDepts(true, true)} className="text-[11px] text-civic hover:underline">Select all</button>
                  <span className="text-[11px] text-slate-muted">·</span>
                  <button type="button" onClick={() => setAllDepts(false, true)} className="text-[11px] text-slate-text hover:underline">Clear</button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded border border-slate-frame p-3 bg-white">
                {DEPARTMENTS.map((d) => (
                  <label key={d} className="flex items-center gap-1.5 text-xs text-navy-deep cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.departments.includes(d)}
                      onChange={() => toggleDept(d, true)}
                      className="accent-civic rounded"
                    />
                    <span className="truncate">{d}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Semester Eligibility */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="label-text">Semester eligibility</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAllSems(true, true)} className="text-[11px] text-civic hover:underline">Select all</button>
                  <span className="text-[11px] text-slate-muted">·</span>
                  <button type="button" onClick={() => setAllSems(false, true)} className="text-[11px] text-slate-text hover:underline">Clear</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 rounded border border-slate-frame p-3 bg-white">
                {SEMESTERS.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-xs text-navy-deep cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.semesters.includes(s)}
                      onChange={() => toggleSem(s, true)}
                      className="accent-civic rounded"
                    />
                    Sem {s}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setEditingPos(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveEdit} disabled={saving} className="btn-civic inline-flex items-center gap-2 disabled:opacity-50">
              {saving ? 'Updating...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Positions List */}
      {positions.length === 0 ? (
        <Empty text="No positions have been added to this election yet. Click 'Create new position' to get started." />
      ) : (
        <div className="space-y-3">
          {positions.map((pos) => {
            const posCandidates = candidates.filter(c => c.position_id === pos.id);
            return (
              <div key={pos.id} className="card p-4 lg:p-5 hover:border-slate-frame transition-all">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <h3 className="font-semibold text-navy-deep text-base">{pos.name}</h3>
                      <StatusBadge status={pos.status} />
                      <span className="badge bg-civic-wash text-civic border border-civic/20 text-[11px]">
                        <Users className="w-2.5 h-2.5" /> {posCandidates.length} candidate{posCandidates.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {pos.description && (
                      <p className="text-sm text-slate-text leading-relaxed mt-1 mb-2.5">{pos.description}</p>
                    )}

                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-text">
                      <span className="font-medium text-navy-deep">
                        Quota: {pos.max_selections} pick{pos.max_selections !== 1 ? 's' : ''} · {pos.max_winners} winner{pos.max_winners !== 1 ? 's' : ''}
                      </span>
                      <span>·</span>
                      <span>
                        Departments: {pos.eligible_departments && pos.eligible_departments.length > 0 ? pos.eligible_departments.join(', ') : 'All Departments'}
                      </span>
                      <span>·</span>
                      <span>
                        Semesters: {pos.eligible_semesters && pos.eligible_semesters.length > 0 ? pos.eligible_semesters.join(', ') : 'All Semesters'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                    <button
                      onClick={() => startEdit(pos)}
                      className="btn-secondary inline-flex items-center gap-1.5 text-xs py-1.5 px-3"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => deletePosition(pos.id, pos.name)}
                      disabled={deletingId === pos.id}
                      className="btn-secondary inline-flex items-center gap-1.5 text-xs py-1.5 px-3 text-error-deep hover:bg-error-bg hover:border-error/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!canModify && positions.length > 0 && (
        <p className="mt-4 text-xs text-amber-seal bg-amber-bg p-3 rounded border border-amber-border">
          Voting has started or closed for this election. Position configurations are locked to preserve audit integrity.
        </p>
      )}
    </>
  );
}

/* --- Candidate Manager --- */
function CandidateManager({ election, positions, candidates, profile, onNotice, onReview, onRefresh }: {
  election: Election | null;
  positions: ElectionPosition[];
  candidates: Candidate[];
  profile: Profile | null;
  onNotice: (n: Notice) => void;
  onReview: (id: string, status: 'approved' | 'rejected') => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [creatingStudentAccount, setCreatingStudentAccount] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [disqualifyCandidate, setDisqualifyCandidate] = useState<Candidate | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [credentialResult, setCredentialResult] = useState<StudentCredentialResult | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  // Quick custom post modal state
  const [showQuickCustomPostModal, setShowQuickCustomPostModal] = useState(false);
  const [quickPostName, setQuickPostName] = useState('');
  const [quickPostDesc, setQuickPostDesc] = useState('');
  const [savingQuickPost, setSavingQuickPost] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPosition, setFilterPosition] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Disqualification dialog state
  const [disqualifyForm, setDisqualifyForm] = useState({
    ruleTitle: '',
    reason: '',
    disqualifyParty: false,
  });

  const SYMBOL_PRESETS = [
    '🛡️ Shield of Integrity',
    '⚡ Energy & Action',
    '🌟 Rising Star',
    '📚 Torch of Knowledge',
    '🎯 Progressive Goal',
    '🕊️ Student Peace',
    '🦁 Courage & Strength',
    '🚀 Tech Innovation',
    '💡 Bright Ideas',
    '🌿 Campus Harmony',
    '⚖️ Justice for All',
  ];

  const [form, setForm] = useState({
    name: '',
    studentId: '',
    faculty: '',
    semester: '',
    positionId: '',
    party: '',
    symbol: '',
    imageUrl: '',
    manifesto: '',
    autoApprove: true,
  });

  // Dedicated full Student Candidate Profile Form (Creates auth user, profile, voter eligibility & candidate registration)
  const [studentForm, setStudentForm] = useState({
    fullName: '',
    studentId: '',
    email: '',
    password: 'Student@123',
    department: '',
    semester: '5',
    positionId: '',
    party: '',
    symbol: '',
    imageUrl: '',
    manifesto: '',
  });

  // Extract rules for disqualification modal
  const { rules: electionRules } = parseElectionRules(election?.instructions, election?.id ?? '');

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, targetForm: 'candidate' | 'student' | 'edit') {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingImage(true);
      const dataUrl = await compressImageFile(file, 300, 300, 0.85);
      if (targetForm === 'student') {
        setStudentForm(prev => ({ ...prev, imageUrl: dataUrl }));
      } else {
        setForm(prev => ({ ...prev, imageUrl: dataUrl }));
      }
      onNotice({ type: 'success', text: 'Candidate logo/photo uploaded successfully.' });
    } catch {
      onNotice({ type: 'error', text: 'Failed to process image. Please try another file.' });
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleQuickCreateCustomPost() {
    if (!election || !quickPostName.trim()) {
      onNotice({ type: 'error', text: 'Custom post title is required.' });
      return;
    }
    setSavingQuickPost(true);
    const { data: newPosId, error } = await supabase.rpc('create_position', {
      p_election_id: election.id,
      p_name: quickPostName.trim(),
      p_description: quickPostDesc.trim() || 'Custom elective office created by faculty.',
      p_departments: [],
      p_semesters: [],
      p_max_selections: 1,
      p_max_winners: 1,
      p_nomination_deadline: null,
    });
    setSavingQuickPost(false);

    if (error) {
      onNotice({ type: 'error', text: `Failed to create custom post: ${error.message}` });
      return;
    }

    onNotice({ type: 'success', text: `Custom post "${quickPostName.trim()}" created successfully!` });
    setShowQuickCustomPostModal(false);
    const createdName = quickPostName.trim();
    setQuickPostName('');
    setQuickPostDesc('');
    await onRefresh();

    // Auto-select the newly created post
    if (newPosId) {
      setStudentForm(prev => ({ ...prev, positionId: newPosId as string }));
      setForm(prev => ({ ...prev, positionId: newPosId as string }));
    }
  }

  async function handleCreateStudentCandidateAccount() {
    if (!election) return;
    if (!studentForm.fullName.trim() || !studentForm.studentId.trim() || !studentForm.email.trim() || !studentForm.password.trim() || !studentForm.department || !studentForm.positionId) {
      onNotice({ type: 'error', text: 'Please fill in student full name, roll number (USN), login email, password, department, and contested post.' });
      return;
    }

    setSaving(true);
    try {
      const pos = positions.find(p => p.id === studentForm.positionId);
      const res = await createStudentCandidateProfile({
        fullName: studentForm.fullName,
        studentId: studentForm.studentId,
        email: studentForm.email,
        password: studentForm.password,
        department: studentForm.department,
        semester: studentForm.semester,
        electionId: election.id,
        positionId: studentForm.positionId,
        party: studentForm.party,
        symbol: studentForm.symbol,
        imageUrl: studentForm.imageUrl,
        manifesto: studentForm.manifesto,
      }, pos?.name ?? 'Elective Post');

      setCredentialResult(res);
      setCreatingStudentAccount(false);
      setStudentForm({
        fullName: '',
        studentId: '',
        email: '',
        password: 'Student@123',
        department: '',
        semester: '5',
        positionId: '',
        party: '',
        symbol: '',
        imageUrl: '',
        manifesto: '',
      });
      onNotice({
        type: 'success',
        text: `Student Candidate account created for ${res.fullName}! The student can now log in and cast vote.`,
      });
      await onRefresh();
    } catch (err) {
      onNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create student candidate profile.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function add() {
    if (!election || !form.name.trim() || !form.studentId.trim() || !form.faculty || !form.positionId) {
      onNotice({ type: 'error', text: 'Candidate name, USN, department, and position are required.' });
      return;
    }
    setSaving(true);

    const serializedManifesto = serializeCandidateManifesto(form.manifesto, {
      party: form.party.trim() || undefined,
      symbol: form.symbol.trim() || undefined,
    });

    const { data: newId, error } = await supabase.rpc('create_candidate', {
      p_election_id: election.id,
      p_position_id: form.positionId,
      p_name: form.name.trim(),
      p_student_id: form.studentId.trim(),
      p_faculty: form.faculty,
      p_semester: form.semester || null,
      p_manifesto: serializedManifesto,
      p_image_url: form.imageUrl.trim() || null,
    });

    if (error) {
      setSaving(false);
      onNotice({
        type: 'error',
        text: error.message.includes('already registered')
          ? 'This student USN is already registered for this position.'
          : error.message.includes('after voting')
          ? 'Candidates cannot be added after voting begins.'
          : `Could not register candidate: ${error.message}`,
      });
      return;
    }

    // Auto-approve if requested
    if (form.autoApprove && newId) {
      await supabase.rpc('review_candidate', {
        p_candidate_id: newId as string,
        p_status: 'approved',
        p_note: 'Approved on manual registration by election board',
      });
    }

    setSaving(false);
    setAdding(false);
    setForm({
      name: '',
      studentId: '',
      faculty: '',
      semester: '',
      positionId: '',
      party: '',
      symbol: '',
      imageUrl: '',
      manifesto: '',
      autoApprove: true,
    });
    onNotice({ type: 'success', text: `Candidate ${form.name.trim()} added successfully.` });
    await onRefresh();
  }

  function startEdit(candidate: Candidate) {
    setEditingCandidate(candidate);
    const { cleanManifesto, meta } = parseCandidateManifesto(candidate.manifesto);
    setForm({
      name: candidate.name,
      studentId: candidate.student_id,
      faculty: candidate.faculty,
      semester: candidate.semester ?? '',
      positionId: candidate.position_id ?? '',
      party: meta.party ?? '',
      symbol: meta.symbol ?? '',
      imageUrl: candidate.image_url ?? '',
      manifesto: cleanManifesto,
      autoApprove: candidate.application_status === 'approved',
    });
  }

  async function saveEdit() {
    if (!editingCandidate || !form.name.trim() || !form.studentId.trim()) return;
    setSaving(true);

    const { meta: existingMeta } = parseCandidateManifesto(editingCandidate.manifesto);
    const updatedMeta: CandidateMeta = {
      ...existingMeta,
      party: form.party.trim() || undefined,
      symbol: form.symbol.trim() || undefined,
    };

    const serializedManifesto = serializeCandidateManifesto(form.manifesto, updatedMeta);

    const { error } = await supabase
      .from('candidates')
      .update({
        name: form.name.trim(),
        student_id: form.studentId.trim(),
        faculty: form.faculty,
        semester: form.semester || null,
        position_id: form.positionId || null,
        manifesto: serializedManifesto,
        image_url: form.imageUrl.trim() || null,
      })
      .eq('id', editingCandidate.id);

    setSaving(false);
    if (error) {
      onNotice({ type: 'error', text: `Failed to update candidate: ${error.message}` });
      return;
    }

    setEditingCandidate(null);
    onNotice({ type: 'success', text: `Candidate details for ${form.name.trim()} updated.` });
    await onRefresh();
  }

  async function deleteCandidate(candidate: Candidate) {
    if (!window.confirm(`Are you sure you want to delete candidate ${candidate.name} (${candidate.student_id})?`)) return;
    const { error } = await supabase.from('candidates').delete().eq('id', candidate.id);
    if (error) {
      onNotice({ type: 'error', text: `Could not delete candidate: ${error.message}` });
      return;
    }
    onNotice({ type: 'success', text: `Candidate ${candidate.name} deleted.` });
    await onRefresh();
  }

  function openDisqualifyModal(candidate: Candidate) {
    setDisqualifyCandidate(candidate);
    setDisqualifyForm({
      ruleTitle: electionRules[0] ? `Rule #${electionRules[0].rule_number}: ${electionRules[0].title}` : 'Election Code of Conduct Violation',
      reason: '',
      disqualifyParty: false,
    });
  }

  async function confirmDisqualify() {
    if (!disqualifyCandidate || !disqualifyForm.reason.trim()) {
      onNotice({ type: 'error', text: 'A detailed violation reason is required to issue a disqualification.' });
      return;
    }
    setSaving(true);

    const targetParty = disqualifyCandidate.meta?.party;
    const isWholeParty = disqualifyForm.disqualifyParty && !!targetParty;

    const targets = isWholeParty
      ? candidates.filter(c => c.meta?.party?.toLowerCase() === targetParty?.toLowerCase())
      : [disqualifyCandidate];

    for (const c of targets) {
      const { cleanManifesto, meta } = parseCandidateManifesto(c.manifesto);
      meta.isDisqualified = true;
      meta.disqualificationReason = disqualifyForm.reason.trim();
      meta.disqualifiedRule = disqualifyForm.ruleTitle;
      meta.disqualifiedAt = new Date().toISOString();
      meta.disqualifiedBy = profile?.full_name ?? 'Election Board';
      meta.disqualifiedParty = isWholeParty;

      const newManifesto = serializeCandidateManifesto(cleanManifesto, meta);
      await supabase.from('candidates').update({ manifesto: newManifesto }).eq('id', c.id);
    }

    setSaving(false);
    setDisqualifyCandidate(null);
    onNotice({
      type: 'success',
      text: isWholeParty
        ? `All candidates from party "${targetParty}" have been disqualified for: ${disqualifyForm.ruleTitle}`
        : `Candidate ${disqualifyCandidate.name} disqualified for: ${disqualifyForm.ruleTitle}`,
    });
    await onRefresh();
  }

  async function reinstateCandidate(candidate: Candidate) {
    if (!window.confirm(`Reinstate ${candidate.name} to good standing? This will lift the disqualification.`)) return;
    const { cleanManifesto, meta } = parseCandidateManifesto(candidate.manifesto);
    delete meta.isDisqualified;
    delete meta.disqualificationReason;
    delete meta.disqualifiedRule;
    delete meta.disqualifiedAt;
    delete meta.disqualifiedBy;
    delete meta.disqualifiedParty;

    const newManifesto = serializeCandidateManifesto(cleanManifesto, meta);
    const { error } = await supabase.from('candidates').update({ manifesto: newManifesto }).eq('id', candidate.id);
    if (error) {
      onNotice({ type: 'error', text: `Could not reinstate candidate: ${error.message}` });
      return;
    }
    onNotice({ type: 'success', text: `Candidate ${candidate.name} has been reinstated.` });
    await onRefresh();
  }

  if (!election) return <Empty text="Select an election first to manage candidates." />;

  // Filter candidates
  const filteredCandidates = candidates.filter(c => {
    const isDisq = !!c.meta?.isDisqualified;
    if (filterStatus === 'approved' && (c.application_status !== 'approved' || isDisq)) return false;
    if (filterStatus === 'pending' && c.application_status !== 'pending') return false;
    if (filterStatus === 'disqualified' && !isDisq) return false;
    if (filterPosition !== 'all' && c.position_id !== filterPosition) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchUsn = c.student_id.toLowerCase().includes(q);
      const matchParty = c.meta?.party?.toLowerCase().includes(q);
      if (!matchName && !matchUsn && !matchParty) return false;
    }
    return true;
  });

  const disqualifiedTotal = candidates.filter(c => c.meta?.isDisqualified).length;

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label-text mb-2 text-civic">Candidate roster & details</p>
          <h1 className="headline-lg">Manage candidates</h1>
          <p className="mt-2 text-sm text-slate-text">
            {election.title} · Manually add candidates, upload logos & symbols, review applications, and manage party affiliations.
          </p>
        </div>
        {!adding && !editingCandidate && !creatingStudentAccount && (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setCreatingStudentAccount(true)}
              className="btn-civic bg-navy text-white hover:bg-slate-800 inline-flex items-center justify-center gap-2 shadow-xs"
            >
              <UserPlus className="h-4 w-4 text-emerald-vote" /> Create Student Candidate Profile
            </button>
            <button
              onClick={() => setAdding(true)}
              className="btn-secondary inline-flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add candidate to post
            </button>
          </div>
        )}
      </div>

      {/* Quick Custom Post Modal */}
      {showQuickCustomPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-deep/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-tier2 max-w-md w-full p-6 animate-scaleIn border border-civic/30">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-civic" />
                <h3 className="text-base font-bold text-navy-deep">Create custom elective post</h3>
              </div>
              <button onClick={() => setShowQuickCustomPostModal(false)} className="text-slate-text hover:text-navy-deep">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-text mb-4">
              Enter any custom office or portfolio of your choice (e.g., Club Lead, Hostel Affairs Head, Placement Ambassador, Robotics Captain, Anti-Ragging Cell Lead).
            </p>
            <div className="space-y-3">
              <Field
                label="Custom post title *"
                value={quickPostName}
                onChange={setQuickPostName}
                placeholder="e.g. Chief Student Ambassador"
              />
              <div>
                <label className="label-text mb-1.5 block">Role description & responsibilities</label>
                <textarea
                  className="input-field min-h-16 py-2 text-xs"
                  value={quickPostDesc}
                  onChange={(e) => setQuickPostDesc(e.target.value)}
                  placeholder="Duties and portfolio responsibilities..."
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-border pt-4">
              <button onClick={() => setShowQuickCustomPostModal(false)} className="btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={handleQuickCreateCustomPost}
                disabled={savingQuickPost || !quickPostName.trim()}
                className="btn-civic text-xs inline-flex items-center gap-1.5"
              >
                {savingQuickPost ? 'Creating...' : 'Create post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credential Confirmation Modal */}
      {credentialResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-deep/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-tier2 max-w-lg w-full p-6 animate-scaleIn border-2 border-emerald-border">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-11 h-11 rounded-full bg-emerald-bg text-emerald-vote flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <span className="badge badge-verified text-[11px] mb-1">
                  <Check className="w-2.5 h-2.5" /> Enrolled & Verified Student Voter
                </span>
                <h2 className="text-lg font-bold text-navy-deep">Student candidate profile created!</h2>
                <p className="text-xs text-slate-text mt-0.5">
                  The student account has been created, approved as candidate, and registered as an eligible voter.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-border bg-slate-canvas p-4 space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-border/80">
                <span className="text-slate-text font-medium">Candidate Name:</span>
                <span className="font-semibold text-navy-deep">{credentialResult.fullName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-border/80">
                <span className="text-slate-text font-medium">Student Roll / USN:</span>
                <span className="font-semibold text-navy-deep font-mono">{credentialResult.studentId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-border/80">
                <span className="text-slate-text font-medium">Login Email:</span>
                <span className="font-semibold text-navy-deep font-mono">{credentialResult.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-border/80 items-center">
                <span className="text-slate-text font-medium">Initial Password:</span>
                <span className="font-mono bg-white px-2 py-0.5 rounded border font-bold text-civic">
                  {credentialResult.password}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-border/80">
                <span className="text-slate-text font-medium">Contested Post:</span>
                <span className="font-semibold text-navy-deep">{credentialResult.positionName}</span>
              </div>
              {credentialResult.partyName && (
                <div className="flex justify-between py-1">
                  <span className="text-slate-text font-medium">Party / Slate:</span>
                  <span className="font-semibold text-navy-deep">{credentialResult.partyName}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-text mt-3 bg-civic-wash/60 p-3 rounded border border-civic/20">
              💡 <strong>Next steps:</strong> Share these credentials with the student. They can log in to view the ballot, publish campaigns, and cast their vote when voting is open!
            </p>

            <div className="mt-5 flex justify-between items-center border-t border-slate-border pt-4">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `BGSIT Vote Credentials:\nName: ${credentialResult.fullName}\nUSN: ${credentialResult.studentId}\nEmail: ${credentialResult.email}\nPassword: ${credentialResult.password}\nPost: ${credentialResult.positionName}`
                  );
                  setCopiedPassword(true);
                  setTimeout(() => setCopiedPassword(false), 3000);
                }}
                className="btn-secondary inline-flex items-center gap-1.5 text-xs py-2 px-3"
              >
                <Copy className="w-3.5 h-3.5" />
                {copiedPassword ? 'Credentials copied!' : 'Copy credentials'}
              </button>
              <button
                onClick={() => setCredentialResult(null)}
                className="btn-civic text-xs py-2 px-4"
              >
                Done / Return to list
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Student Candidate Profile Creation Form */}
      {creatingStudentAccount && (
        <div className="card mb-6 p-5 lg:p-6 animate-fadeIn border-2 border-navy/20 bg-slate-50/50">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-navy text-white flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-emerald-vote" />
              </div>
              <div>
                <h2 className="headline-md">Create Student Candidate Profile</h2>
                <p className="text-xs text-slate-text mt-0.5">
                  Creates an institutional voter account, student profile, registers them for an elective post, and grants voting eligibility.
                </p>
              </div>
            </div>
            <button onClick={() => setCreatingStudentAccount(false)} className="text-slate-text hover:text-navy-deep">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Student full name *"
              value={studentForm.fullName}
              onChange={(v) => setStudentForm({ ...studentForm, fullName: v })}
              placeholder="e.g. Rohan Gowda"
            />
            <Field
              label="University roll number (USN) *"
              value={studentForm.studentId}
              onChange={(v) => setStudentForm({ ...studentForm, studentId: v })}
              placeholder="e.g. 1BG22CS088"
            />
            <Field
              label="Student institutional email (Login ID) *"
              type="email"
              value={studentForm.email}
              onChange={(v) => setStudentForm({ ...studentForm, email: v })}
              placeholder="e.g. rohan.gowda@bgsit.ac.in"
            />
            <Field
              label="Initial account password *"
              type="text"
              value={studentForm.password}
              onChange={(v) => setStudentForm({ ...studentForm, password: v })}
              placeholder="e.g. Student@123"
            />

            <div>
              <label className="label-text mb-1.5 block">Department *</label>
              <select
                value={studentForm.department}
                onChange={(e) => setStudentForm({ ...studentForm, department: e.target.value })}
                className="input-field"
              >
                <option value="">Select department...</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="label-text mb-1.5 block">Semester</label>
              <select
                value={studentForm.semester}
                onChange={(e) => setStudentForm({ ...studentForm, semester: e.target.value })}
                className="input-field"
              >
                {SEMESTERS.map((s) => <option key={s} value={s}>Semester {s}</option>)}
              </select>
            </div>

            {/* Position with quick custom post button */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="label-text">Contested post / position *</label>
                <button
                  type="button"
                  onClick={() => setShowQuickCustomPostModal(true)}
                  className="text-xs font-semibold text-civic hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Create new custom post of your choice
                </button>
              </div>
              <select
                value={studentForm.positionId}
                onChange={(e) => setStudentForm({ ...studentForm, positionId: e.target.value })}
                className="input-field"
              >
                <option value="">Select post for candidate...</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} {p.status !== 'active' ? '(Inactive)' : ''}</option>
                ))}
              </select>
            </div>

            <Field
              label="Party / Alliance / Slate name"
              value={studentForm.party}
              onChange={(v) => setStudentForm({ ...studentForm, party: v })}
              placeholder="e.g. Student Democratic Alliance (or 'Independent')"
            />

            {/* Symbol */}
            <div>
              <label className="label-text mb-1.5 block">Party or candidate symbol</label>
              <input
                type="text"
                value={studentForm.symbol}
                onChange={(e) => setStudentForm({ ...studentForm, symbol: e.target.value })}
                placeholder="e.g. 🛡️ Shield of Integrity"
                className="input-field"
              />
            </div>

            {/* Candidate Logo / Photo Upload */}
            <div className="md:col-span-2 rounded-lg border border-slate-border bg-slate-canvas p-4">
              <label className="label-text mb-2 block flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-civic" /> Upload candidate logo or photo
                </span>
                {studentForm.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setStudentForm({ ...studentForm, imageUrl: '' })}
                    className="text-xs text-error-deep hover:underline"
                  >
                    Remove logo
                  </button>
                )}
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border-2 border-slate-border bg-white flex items-center justify-center">
                  {studentForm.imageUrl ? (
                    <img src={studentForm.imageUrl} alt="Candidate Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-slate-muted">
                      <ImageIcon className="w-6 h-6 mx-auto mb-1" />
                      <span className="text-[10px]">No Logo</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 w-full space-y-2">
                  <label className="btn-secondary inline-flex items-center gap-2 cursor-pointer text-xs py-2 px-3">
                    <Upload className="w-3.5 h-3.5 text-civic" />
                    <span>{uploadingImage ? 'Processing...' : 'Upload logo / photo (PNG / JPG / WebP)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'student')}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-text">Images are automatically scaled and optimized for ballot rendering.</p>
                </div>
              </div>
            </div>

            {/* Manifesto */}
            <div className="md:col-span-2">
              <label className="label-text mb-1.5 block">Candidate manifesto & vision statement</label>
              <textarea
                className="input-field min-h-20 h-auto py-2.5"
                value={studentForm.manifesto}
                onChange={(e) => setStudentForm({ ...studentForm, manifesto: e.target.value })}
                placeholder="Key campaign pledges, goals, and pitch to voters."
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-slate-border pt-4">
            <button onClick={() => setCreatingStudentAccount(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleCreateStudentCandidateAccount}
              disabled={saving}
              className="btn-civic inline-flex items-center gap-2 disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              {saving ? 'Creating profile & account...' : 'Create profile & issue credentials'}
            </button>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="mb-6 grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Metric icon={Target} label="Positions" value={positions.length} />
        <Metric icon={Users} label="Total Candidates" value={candidates.length} />
        <Metric icon={Clock3} label="Pending Review" value={candidates.filter(c => c.application_status === 'pending').length} />
        <div className="card p-4 border-error/20 bg-error-bg/30">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded bg-error-bg text-error-deep">
            <Ban className="h-4 w-4" />
          </div>
          <p className="text-2xl font-bold text-error-deep">{disqualifiedTotal}</p>
          <p className="mt-0.5 text-xs uppercase tracking-label text-error-deep">Disqualified</p>
        </div>
      </div>

      {/* Add / Edit Candidate Form */}
      {(adding || editingCandidate) && (
        <div className="card mb-6 p-5 lg:p-6 animate-fadeIn border-2 border-civic/20">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="headline-md">{editingCandidate ? `Edit candidate: ${editingCandidate.name}` : 'New candidate registration'}</h2>
              <p className="text-xs text-slate-text mt-0.5">Enter academic details, political party or alliance, manifesto, and upload candidate logo.</p>
            </div>
            <button onClick={() => { setAdding(false); setEditingCandidate(null); }} className="text-slate-text hover:text-navy-deep">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Candidate full name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="e.g. Aarav Sharma" />
            <Field label="Student USN / Roll number" value={form.studentId} onChange={(v) => setForm({ ...form, studentId: v })} placeholder="e.g. 1BG21CS045" />

            <div>
              <label className="label-text mb-1.5 block">Position / Contested post</label>
              <select value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })} className="input-field">
                <option value="">Select contested position...</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} {p.status !== 'active' ? '(Inactive)' : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-text mb-1.5 block">Department</label>
              <select value={form.faculty} onChange={(e) => setForm({ ...form, faculty: e.target.value })} className="input-field">
                <option value="">Select department...</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="label-text mb-1.5 block">Semester</label>
              <select value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} className="input-field">
                <option value="">Select semester...</option>
                {SEMESTERS.map((s) => <option key={s} value={s}>Semester {s}</option>)}
              </select>
            </div>

            <Field
              label="Party / Alliance / Slate name"
              value={form.party}
              onChange={(v) => setForm({ ...form, party: v })}
              placeholder="e.g. Student Democratic Front (or 'Independent')"
            />

            {/* Candidate / Party Symbol */}
            <div className="md:col-span-2">
              <label className="label-text mb-1.5 block">Party or candidate symbol</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SYMBOL_PRESETS.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setForm({ ...form, symbol: sym })}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                      form.symbol === sym
                        ? 'border-civic bg-civic-wash text-civic'
                        : 'border-slate-border bg-white text-navy-deep hover:border-slate-frame'
                    }`}
                  >
                    {sym}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                placeholder="Or type custom symbol description (e.g. Rising Sun, Scales of Justice)"
                className="input-field"
              />
            </div>

            {/* Logo / Photo Upload */}
            <div className="md:col-span-2 rounded-lg border border-slate-border bg-slate-canvas p-4">
              <label className="label-text mb-2 block flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-civic" /> Upload candidate logo or photo
                </span>
                {form.imageUrl && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, imageUrl: '' })}
                    className="text-xs text-error-deep hover:underline"
                  >
                    Remove logo
                  </button>
                )}
              </label>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                {/* Preview Thumbnail */}
                <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 border-2 border-slate-border bg-white flex items-center justify-center">
                  {form.imageUrl ? (
                    <img src={form.imageUrl} alt="Candidate Logo" className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center text-slate-muted">
                      <ImageIcon className="w-6 h-6 mx-auto mb-1" />
                      <span className="text-[10px]">No Logo</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 w-full space-y-2">
                  <label className="btn-secondary inline-flex items-center gap-2 cursor-pointer text-xs py-2 px-3">
                    <Upload className="w-3.5 h-3.5 text-civic" />
                    <span>{uploadingImage ? 'Processing image...' : 'Choose image file (PNG / JPG / WebP)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, editingCandidate ? 'edit' : 'candidate')}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-text">Images are automatically scaled and optimized for ballot rendering.</p>
                  <input
                    type="text"
                    value={form.imageUrl}
                    onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                    placeholder="Or enter direct image URL (https://...)"
                    className="input-field text-xs py-1.5"
                  />
                </div>
              </div>
            </div>

            {/* Manifesto */}
            <div className="md:col-span-2">
              <label className="label-text mb-1.5 block">Manifesto / Agenda & Vision</label>
              <textarea
                className="input-field min-h-24 h-auto py-3"
                value={form.manifesto}
                onChange={(e) => setForm({ ...form, manifesto: e.target.value })}
                placeholder="The candidate's core campaign pledges, policy goals, and message to student voters."
              />
            </div>

            {adding && (
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm text-navy-deep cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoApprove}
                    onChange={(e) => setForm({ ...form, autoApprove: e.target.checked })}
                    className="accent-civic rounded w-4 h-4"
                  />
                  <span>Approve candidate immediately (candidate will appear directly on official ballot)</span>
                </label>
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-slate-border pt-4">
            <button onClick={() => { setAdding(false); setEditingCandidate(null); }} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={editingCandidate ? saveEdit : add}
              disabled={saving}
              className="btn-civic inline-flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingCandidate ? 'Update candidate' : 'Register candidate'}
            </button>
          </div>
        </div>
      )}

      {/* Disqualification Modal */}
      {disqualifyCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-deep/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-tier2 max-w-lg w-full p-6 animate-scaleIn border border-error/30">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-error-bg flex items-center justify-center shrink-0 text-error-deep">
                <Ban className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-navy-deep">Disqualify candidate for rule violation</h2>
                <p className="text-xs text-slate-text mt-0.5">
                  Official committee sanction removing voting eligibility for {disqualifyCandidate.name} ({disqualifyCandidate.student_id}).
                </p>
              </div>
              <button onClick={() => setDisqualifyCandidate(null)} className="text-slate-text hover:text-navy-deep">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Target info */}
              <div className="rounded-lg border border-slate-border bg-slate-canvas p-3 flex items-center gap-3">
                {disqualifyCandidate.image_url ? (
                  <img src={disqualifyCandidate.image_url} alt="" className="w-10 h-10 rounded object-cover border" />
                ) : (
                  <div className="w-10 h-10 rounded bg-slate-wash flex items-center justify-center font-bold text-xs text-slate-text">
                    {disqualifyCandidate.name.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sm text-navy-deep">{disqualifyCandidate.name}</p>
                  <p className="text-xs text-slate-text">
                    {disqualifyCandidate.student_id} · {disqualifyCandidate.faculty}
                    {disqualifyCandidate.meta?.party && ` · Party: ${disqualifyCandidate.meta.party}`}
                  </p>
                </div>
              </div>

              {/* Broken rule selection */}
              <div>
                <label className="label-text mb-1.5 block">Election rule violated</label>
                <select
                  value={disqualifyForm.ruleTitle}
                  onChange={(e) => setDisqualifyForm({ ...disqualifyForm, ruleTitle: e.target.value })}
                  className="input-field"
                >
                  {electionRules.length > 0 ? (
                    electionRules.map(r => (
                      <option key={r.id} value={`Rule #${r.rule_number}: ${r.title}`}>
                        Rule #{r.rule_number}: {r.title} ({r.category} - {r.penalty})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Rule 1: Code of Conduct & Non-Defamation">Rule 1: Code of Conduct & Non-Defamation</option>
                      <option value="Rule 2: Campaign Silence Period Violation">Rule 2: Campaign Silence Period Violation</option>
                      <option value="Rule 3: Prohibition of Inducements & Bribery">Rule 3: Prohibition of Inducements & Bribery</option>
                      <option value="Rule 4: Campus Defacement & Poster Violation">Rule 4: Campus Defacement & Poster Violation</option>
                      <option value="Rule 5: Spending Limit & Audit Non-Compliance">Rule 5: Spending Limit & Audit Non-Compliance</option>
                      <option value="Rule 6: Academic Standing / Attendance Default">Rule 6: Academic Standing / Attendance Default</option>
                    </>
                  )}
                </select>
              </div>

              {/* Disqualification Scope */}
              {disqualifyCandidate.meta?.party && (
                <div className="rounded border border-amber-border bg-amber-50/50 p-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={disqualifyForm.disqualifyParty}
                      onChange={(e) => setDisqualifyForm({ ...disqualifyForm, disqualifyParty: e.target.checked })}
                      className="accent-error-deep rounded mt-0.5"
                    />
                    <div>
                      <p className="text-xs font-semibold text-navy-deep">
                        Disqualify entire party slate ({disqualifyCandidate.meta.party})
                      </p>
                      <p className="text-[11px] text-slate-text mt-0.5">
                        If this rule was broken at an organized party level, disqualify all candidates contesting under this party.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Reason / Incident Details */}
              <div>
                <label className="label-text mb-1.5 block">Violation details & evidence notes *</label>
                <textarea
                  className="input-field min-h-24 h-auto py-2.5 text-sm"
                  value={disqualifyForm.reason}
                  onChange={(e) => setDisqualifyForm({ ...disqualifyForm, reason: e.target.value })}
                  placeholder="State the date, nature of violation, evidence reviewed by the election board, and reason for disqualification."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-border pt-4">
              <button onClick={() => setDisqualifyCandidate(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                onClick={confirmDisqualify}
                disabled={saving || !disqualifyForm.reason.trim()}
                className="btn-civic bg-error-deep hover:bg-red-700 text-white inline-flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? 'Disqualifying...' : 'Issue disqualification order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="card mb-6 p-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search candidate by name, USN, or party..."
              className="input-field pl-9 text-xs py-2"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterPosition}
              onChange={(e) => setFilterPosition(e.target.value)}
              className="input-field text-xs py-2 max-w-[180px]"
            >
              <option value="all">All positions</option>
              {positions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <div className="flex rounded border border-slate-border bg-slate-canvas p-0.5 text-xs">
              {(['all', 'approved', 'pending', 'disqualified'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-2.5 py-1 rounded capitalize font-medium transition-colors ${
                    filterStatus === st ? 'bg-white shadow-xs text-navy-deep font-semibold' : 'text-slate-text hover:text-navy-deep'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Candidates List */}
      {filteredCandidates.length === 0 ? (
        <Empty text={candidates.length === 0 ? "No candidates registered yet. Click 'Add candidate manually' to add the first candidate." : "No candidates match the selected filters."} />
      ) : (
        <div className="space-y-3">
          {filteredCandidates.map((candidate) => {
            const isDisqualified = !!candidate.meta?.isDisqualified;
            const pos = positions.find(p => p.id === candidate.position_id);

            return (
              <div
                key={candidate.id}
                className={`card p-4 lg:p-5 transition-all ${
                  isDisqualified
                    ? 'border-2 border-error/30 bg-error-bg/10'
                    : 'hover:border-slate-frame'
                }`}
              >
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                  {/* Avatar / Logo */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-slate-border bg-white flex items-center justify-center shadow-xs">
                      {candidate.image_url ? (
                        <img src={candidate.image_url} alt={candidate.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-civic-wash text-civic flex items-center justify-center font-bold text-lg">
                          {candidate.name.charAt(0)}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-navy-deep text-base">{candidate.name}</h3>
                        {isDisqualified ? (
                          <span className="badge bg-error-bg text-error-deep border border-error/30 font-bold inline-flex items-center gap-1">
                            <Ban className="w-3 h-3" /> Disqualified
                          </span>
                        ) : (
                          <StatusBadge status={candidate.application_status} />
                        )}

                        {pos && (
                          <span className="badge bg-civic-wash text-civic border border-civic/20 text-xs">
                            {pos.name}
                          </span>
                        )}

                        {candidate.meta?.party && (
                          <span className="badge bg-slate-wash text-navy-deep border border-slate-border text-xs">
                            Party: {candidate.meta.party}
                          </span>
                        )}

                        {candidate.meta?.symbol && (
                          <span className="badge bg-amber-bg text-amber-seal border border-amber-border text-xs">
                            {candidate.meta.symbol}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-text">
                        {candidate.student_id} · {candidate.faculty} {candidate.semester ? `· Sem ${candidate.semester}` : ''}
                      </p>

                      {/* Disqualification Reason Alert */}
                      {isDisqualified && (
                        <div className="mt-2.5 rounded border border-error/20 bg-error-bg/40 p-2.5 text-xs text-error-deep">
                          <p className="font-semibold flex items-center gap-1.5">
                            <Ban className="w-3.5 h-3.5" /> Disqualified for: {candidate.meta?.disqualifiedRule ?? 'Rule violation'}
                          </p>
                          {candidate.meta?.disqualificationReason && (
                            <p className="mt-1 text-slate-text italic">
                              "{candidate.meta.disqualificationReason}"
                            </p>
                          )}
                          {candidate.meta?.disqualifiedAt && (
                            <p className="mt-1 text-[10px] text-slate-muted">
                              Sanction issued: {new Date(candidate.meta.disqualifiedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Manifesto preview */}
                      {candidate.manifesto && (
                        <p className="mt-2 text-xs text-slate-text leading-relaxed line-clamp-2">
                          {candidate.manifesto}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-start">
                    {candidate.application_status === 'pending' && !isDisqualified && (
                      <>
                        <button
                          onClick={() => onReview(candidate.id, 'rejected')}
                          className="btn-secondary inline-flex items-center gap-1 text-xs py-1.5 px-2.5 text-error-deep hover:bg-error-bg"
                        >
                          <X className="h-3.5 w-3.5" /> Reject
                        </button>
                        <button
                          onClick={() => onReview(candidate.id, 'approved')}
                          className="btn-civic inline-flex items-center gap-1 text-xs py-1.5 px-2.5"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => startEdit(candidate)}
                      className="btn-secondary inline-flex items-center gap-1 text-xs py-1.5 px-2.5"
                      title="Edit candidate details"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>

                    {isDisqualified ? (
                      <button
                        onClick={() => reinstateCandidate(candidate)}
                        className="btn-secondary inline-flex items-center gap-1 text-xs py-1.5 px-2.5 border-emerald-border text-emerald-deep hover:bg-emerald-bg"
                        title="Lift disqualification"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Reinstate
                      </button>
                    ) : (
                      <button
                        onClick={() => openDisqualifyModal(candidate)}
                        className="btn-secondary inline-flex items-center gap-1 text-xs py-1.5 px-2.5 border-error/30 text-error-deep hover:bg-error-bg"
                        title="Disqualify for rule violation"
                      >
                        <Ban className="w-3.5 h-3.5" /> Disqualify
                      </button>
                    )}

                    <button
                      onClick={() => deleteCandidate(candidate)}
                      className="btn-secondary inline-flex items-center text-slate-muted hover:text-error-deep hover:border-error/30 p-1.5"
                      title="Delete candidate"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* --- Rules & Disqualification Manager --- */
function RulesDisqualificationManager({ election, candidates, profile, onNotice, onRefresh }: {
  election: Election | null;
  candidates: Candidate[];
  profile: Profile | null;
  onNotice: (n: Notice) => void;
  onRefresh: () => Promise<void>;
}) {
  const [subTab, setSubTab] = useState<'rules' | 'disqualifications'>('rules');
  const [addingRule, setAddingRule] = useState(false);
  const [editingRule, setEditingRule] = useState<ElectionRule | null>(null);
  const [saving, setSaving] = useState(false);

  // Disqualification console state
  const [showDisqualifyModal, setShowDisqualifyModal] = useState(false);
  const [disqScope, setDisqScope] = useState<'candidate' | 'party'>('candidate');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [selectedParty, setSelectedParty] = useState<string>('');
  const [selectedRuleTitle, setSelectedRuleTitle] = useState<string>('');
  const [disqReason, setDisqReason] = useState<string>('');

  if (!election) return <Empty text="Select an election first to configure rules and manage disqualifications." />;

  const { cleanInstructions, rules } = parseElectionRules(election.instructions, election.id);

  // Rule form
  const [ruleForm, setRuleForm] = useState({
    ruleNumber: String(rules.length + 1),
    title: '',
    category: 'Conduct' as ElectionRuleCategory,
    penalty: 'Disqualification' as ElectionRulePenalty,
    description: '',
  });

  const CATEGORIES: ElectionRuleCategory[] = ['Conduct', 'Campaigning', 'Finance', 'Eligibility', 'General'];
  const PENALTIES: ElectionRulePenalty[] = [
    'Disqualification',
    'Immediate Disqualification of Slate',
    'Suspension',
    'Official Warning',
  ];

  // Contesting parties
  const partyNames = Array.from(
    new Set(
      candidates
        .map(c => c.meta?.party?.trim())
        .filter((p): p is string => !!p && p.toLowerCase() !== 'independent')
    )
  );

  const disqualifiedCandidates = candidates.filter(c => c.meta?.isDisqualified);
  const activeCandidates = candidates.filter(c => !c.meta?.isDisqualified && c.application_status === 'approved');

  async function saveRulesList(updatedRules: ElectionRule[]) {
    setSaving(true);
    const newInstructions = serializeElectionRules(cleanInstructions, updatedRules);
    saveElectionRulesLocally(election!.id, updatedRules);

    const { error } = await supabase
      .from('elections')
      .update({ instructions: newInstructions })
      .eq('id', election!.id);

    setSaving(false);
    if (error) {
      onNotice({ type: 'error', text: `Failed to update rules on server: ${error.message}` });
      return;
    }
    await onRefresh();
  }

  async function loadStandardRules() {
    if (rules.length > 0) {
      if (!window.confirm('This will append the 6 standard university election conduct rules to your current rules. Proceed?')) {
        return;
      }
    }

    let nextNum = rules.length + 1;
    const standardToAdd: ElectionRule[] = DEFAULT_ELECTION_RULES.map(r => ({
      ...r,
      id: crypto.randomUUID(),
      rule_number: nextNum++,
      created_at: new Date().toISOString(),
    }));

    const combined = [...rules, ...standardToAdd];
    await saveRulesList(combined);
    onNotice({ type: 'success', text: 'Standard university election rules loaded successfully.' });
  }

  async function handleAddRule() {
    if (!ruleForm.title.trim() || !ruleForm.description.trim()) {
      onNotice({ type: 'error', text: 'Rule title and description are required.' });
      return;
    }

    const newRule: ElectionRule = {
      id: crypto.randomUUID(),
      rule_number: parseInt(ruleForm.ruleNumber) || (rules.length + 1),
      title: ruleForm.title.trim(),
      category: ruleForm.category,
      penalty: ruleForm.penalty,
      description: ruleForm.description.trim(),
      created_at: new Date().toISOString(),
    };

    const updated = [...rules, newRule].sort((a, b) => a.rule_number - b.rule_number);
    await saveRulesList(updated);
    setAddingRule(false);
    setRuleForm({
      ruleNumber: String(updated.length + 1),
      title: '',
      category: 'Conduct',
      penalty: 'Disqualification',
      description: '',
    });
    onNotice({ type: 'success', text: `Rule #${newRule.rule_number} added.` });
  }

  async function handleUpdateRule() {
    if (!editingRule || !editingRule.title.trim()) return;
    const updated = rules.map(r => r.id === editingRule.id ? editingRule : r);
    await saveRulesList(updated);
    setEditingRule(null);
    onNotice({ type: 'success', text: `Rule #${editingRule.rule_number} updated.` });
  }

  async function handleDeleteRule(id: string, title: string) {
    if (!window.confirm(`Delete rule "${title}"?`)) return;
    const updated = rules.filter(r => r.id !== id);
    await saveRulesList(updated);
    onNotice({ type: 'success', text: `Rule "${title}" removed.` });
  }

  async function handleExecuteDisqualification() {
    if (!disqReason.trim()) {
      onNotice({ type: 'error', text: 'Please provide detailed violation notes.' });
      return;
    }

    const chosenRule = selectedRuleTitle || (rules[0] ? `Rule #${rules[0].rule_number}: ${rules[0].title}` : 'Code of Conduct Violation');

    setSaving(true);
    if (disqScope === 'candidate') {
      const candidate = candidates.find(c => c.id === selectedCandidateId);
      if (!candidate) {
        onNotice({ type: 'error', text: 'Please select a candidate to disqualify.' });
        setSaving(false);
        return;
      }

      const { cleanManifesto, meta } = parseCandidateManifesto(candidate.manifesto);
      meta.isDisqualified = true;
      meta.disqualificationReason = disqReason.trim();
      meta.disqualifiedRule = chosenRule;
      meta.disqualifiedAt = new Date().toISOString();
      meta.disqualifiedBy = profile?.full_name ?? 'Election Board';
      meta.disqualifiedParty = false;

      const newManifesto = serializeCandidateManifesto(cleanManifesto, meta);
      await supabase.from('candidates').update({ manifesto: newManifesto }).eq('id', candidate.id);
      onNotice({ type: 'success', text: `Candidate ${candidate.name} has been officially disqualified.` });
    } else {
      if (!selectedParty) {
        onNotice({ type: 'error', text: 'Please select a party to disqualify.' });
        setSaving(false);
        return;
      }

      const partyCandidates = candidates.filter(c => c.meta?.party?.toLowerCase() === selectedParty.toLowerCase());
      if (partyCandidates.length === 0) {
        onNotice({ type: 'error', text: `No candidates found for party "${selectedParty}".` });
        setSaving(false);
        return;
      }

      for (const c of partyCandidates) {
        const { cleanManifesto, meta } = parseCandidateManifesto(c.manifesto);
        meta.isDisqualified = true;
        meta.disqualificationReason = disqReason.trim();
        meta.disqualifiedRule = chosenRule;
        meta.disqualifiedAt = new Date().toISOString();
        meta.disqualifiedBy = profile?.full_name ?? 'Election Board';
        meta.disqualifiedParty = true;

        const newManifesto = serializeCandidateManifesto(cleanManifesto, meta);
        await supabase.from('candidates').update({ manifesto: newManifesto }).eq('id', c.id);
      }
      onNotice({ type: 'success', text: `All ${partyCandidates.length} candidate(s) from party "${selectedParty}" have been disqualified.` });
    }

    setSaving(false);
    setShowDisqualifyModal(false);
    setDisqReason('');
    await onRefresh();
  }

  async function handleReinstate(candidate: Candidate) {
    if (!window.confirm(`Reinstate ${candidate.name} to active election status?`)) return;
    const { cleanManifesto, meta } = parseCandidateManifesto(candidate.manifesto);
    delete meta.isDisqualified;
    delete meta.disqualificationReason;
    delete meta.disqualifiedRule;
    delete meta.disqualifiedAt;
    delete meta.disqualifiedBy;
    delete meta.disqualifiedParty;

    const newManifesto = serializeCandidateManifesto(cleanManifesto, meta);
    await supabase.from('candidates').update({ manifesto: newManifesto }).eq('id', candidate.id);
    onNotice({ type: 'success', text: `Candidate ${candidate.name} reinstated to active standing.` });
    await onRefresh();
  }

  return (
    <>
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="label-text mb-2 text-civic">Compliance & Conduct Enforcement</p>
          <h1 className="headline-lg">Election rules & disqualifications</h1>
          <p className="mt-2 text-sm text-slate-text">
            {election.title} · Establish mandatory rules of conduct, manage campaign restrictions, and issue formal disqualifications for infractions.
          </p>
        </div>

        <div className="flex rounded-lg border border-slate-border bg-slate-canvas p-1 text-xs">
          <button
            onClick={() => setSubTab('rules')}
            className={`px-3 py-1.5 rounded font-medium transition-colors inline-flex items-center gap-1.5 ${
              subTab === 'rules' ? 'bg-white shadow-xs text-navy-deep font-semibold' : 'text-slate-text hover:text-navy-deep'
            }`}
          >
            <Gavel className="w-3.5 h-3.5" /> Official Rules ({rules.length})
          </button>
          <button
            onClick={() => setSubTab('disqualifications')}
            className={`px-3 py-1.5 rounded font-medium transition-colors inline-flex items-center gap-1.5 ${
              subTab === 'disqualifications' ? 'bg-white shadow-xs text-error-deep font-semibold' : 'text-slate-text hover:text-navy-deep'
            }`}
          >
            <Ban className="w-3.5 h-3.5" /> Disqualifications ({disqualifiedCandidates.length})
          </button>
        </div>
      </div>

      {/* SUBTAB 1: ELECTION RULES */}
      {subTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="headline-md">Official election rules</h2>
              <p className="text-xs text-slate-text mt-0.5">
                These rules are published to students on the ballot page and define enforceable grounds for disqualification.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadStandardRules}
                disabled={saving}
                className="btn-secondary inline-flex items-center gap-1.5 text-xs py-2 px-3"
              >
                <Sparkles className="w-3.5 h-3.5 text-civic" /> Load standard institutional rules
              </button>
              <button
                onClick={() => setAddingRule(true)}
                className="btn-civic inline-flex items-center gap-1.5 text-xs py-2 px-3"
              >
                <Plus className="w-3.5 h-3.5" /> Add new rule
              </button>
            </div>
          </div>

          {/* Add Rule Form */}
          {addingRule && (
            <div className="card p-5 lg:p-6 border-2 border-civic/20 animate-fadeIn">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="headline-md text-base">Add election rule</h3>
                <button onClick={() => setAddingRule(false)} className="text-slate-text hover:text-navy-deep">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Field
                    label="Rule number"
                    type="number"
                    value={ruleForm.ruleNumber}
                    onChange={(v) => setRuleForm({ ...ruleForm, ruleNumber: v })}
                    placeholder="1"
                  />
                </div>
                <div className="md:col-span-2">
                  <Field
                    label="Rule title / Short heading"
                    value={ruleForm.title}
                    onChange={(v) => setRuleForm({ ...ruleForm, title: v })}
                    placeholder="e.g. Campaign Silence Period (48h Pre-Poll)"
                  />
                </div>
                <div>
                  <label className="label-text mb-1.5 block">Category</label>
                  <select
                    value={ruleForm.category}
                    onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value as ElectionRuleCategory })}
                    className="input-field"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="label-text mb-1.5 block">Enforceable sanction / Penalty</label>
                  <select
                    value={ruleForm.penalty}
                    onChange={(e) => setRuleForm({ ...ruleForm, penalty: e.target.value as ElectionRulePenalty })}
                    className="input-field"
                  >
                    {PENALTIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="label-text mb-1.5 block">Full rule specification & compliance guidelines</label>
                  <textarea
                    className="input-field min-h-24 h-auto py-2.5"
                    value={ruleForm.description}
                    onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
                    placeholder="Describe the prohibited actions, reporting window, and penalty enforcement process."
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3 border-t border-slate-border pt-4">
                <button onClick={() => setAddingRule(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleAddRule} disabled={saving} className="btn-civic inline-flex items-center gap-2">
                  {saving ? 'Saving...' : 'Add rule'}
                </button>
              </div>
            </div>
          )}

          {/* Edit Rule Modal */}
          {editingRule && (
            <div className="card p-5 lg:p-6 border-2 border-amber-border bg-amber-50/20 animate-fadeIn">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="headline-md text-base">Edit rule #{editingRule.rule_number}</h3>
                <button onClick={() => setEditingRule(null)} className="text-slate-text hover:text-navy-deep">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field
                  label="Rule number"
                  type="number"
                  value={String(editingRule.rule_number)}
                  onChange={(v) => setEditingRule({ ...editingRule, rule_number: parseInt(v) || editingRule.rule_number })}
                  placeholder="1"
                />
                <div className="md:col-span-2">
                  <Field
                    label="Rule title"
                    value={editingRule.title}
                    onChange={(v) => setEditingRule({ ...editingRule, title: v })}
                    placeholder="Title"
                  />
                </div>
                <div>
                  <label className="label-text mb-1.5 block">Category</label>
                  <select
                    value={editingRule.category}
                    onChange={(e) => setEditingRule({ ...editingRule, category: e.target.value as ElectionRuleCategory })}
                    className="input-field"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="label-text mb-1.5 block">Penalty</label>
                  <select
                    value={editingRule.penalty}
                    onChange={(e) => setEditingRule({ ...editingRule, penalty: e.target.value as ElectionRulePenalty })}
                    className="input-field"
                  >
                    {PENALTIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className="label-text mb-1.5 block">Rule details</label>
                  <textarea
                    className="input-field min-h-24 h-auto py-2.5"
                    value={editingRule.description}
                    onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-3 border-t border-slate-border pt-4">
                <button onClick={() => setEditingRule(null)} className="btn-secondary">Cancel</button>
                <button onClick={handleUpdateRule} disabled={saving} className="btn-civic inline-flex items-center gap-2">
                  {saving ? 'Updating...' : 'Save changes'}
                </button>
              </div>
            </div>
          )}

          {/* Rules List */}
          {rules.length === 0 ? (
            <div className="card p-10 text-center">
              <ShieldAlert className="w-8 h-8 text-slate-muted mx-auto mb-3" />
              <p className="text-base font-semibold text-navy-deep">No official rules defined yet</p>
              <p className="text-xs text-slate-text mt-1 max-w-md mx-auto">
                Define the code of conduct for this election or click below to populate the standard university election regulations.
              </p>
              <button onClick={loadStandardRules} className="btn-civic mt-4 inline-flex items-center gap-2 text-xs">
                <Sparkles className="w-3.5 h-3.5" /> Load standard university rules
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const isDisq = rule.penalty.includes('Disqualification');
                return (
                  <div key={rule.id} className="card p-4 lg:p-5 hover:border-slate-frame transition-all">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-navy text-white text-xs font-bold shrink-0">
                            {rule.rule_number}
                          </span>
                          <h3 className="font-semibold text-navy-deep text-base">{rule.title}</h3>
                          <span className="badge bg-slate-wash text-navy-deep border border-slate-border text-xs">
                            {rule.category}
                          </span>
                          <span className={`badge text-xs font-semibold ${
                            isDisq
                              ? 'bg-error-bg text-error-deep border border-error/30'
                              : 'bg-amber-bg text-amber-seal border border-amber-border'
                          }`}>
                            <Gavel className="w-3 h-3" /> {rule.penalty}
                          </span>
                        </div>
                        <p className="text-sm text-slate-text leading-relaxed mt-2">{rule.description}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                        <button
                          onClick={() => setEditingRule(rule)}
                          className="btn-secondary inline-flex items-center gap-1.5 text-xs py-1.5 px-2.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id, rule.title)}
                          className="btn-secondary inline-flex items-center gap-1.5 text-xs py-1.5 px-2.5 text-error-deep hover:bg-error-bg hover:border-error/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: DISQUALIFICATION CONSOLE */}
      {subTab === 'disqualifications' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="headline-md">Disqualification enforcement console</h2>
              <p className="text-xs text-slate-text mt-0.5">
                Issue or revoke official disqualifications for candidates or entire party slates that breach election regulations.
              </p>
            </div>
            <button
              onClick={() => {
                setShowDisqualifyModal(true);
                if (candidates[0]) setSelectedCandidateId(candidates[0].id);
                if (partyNames[0]) setSelectedParty(partyNames[0]);
                if (rules[0]) setSelectedRuleTitle(`Rule #${rules[0].rule_number}: ${rules[0].title}`);
              }}
              className="btn-civic bg-error-deep hover:bg-red-700 text-white inline-flex items-center gap-2 text-xs"
            >
              <Ban className="w-3.5 h-3.5" /> Disqualify candidate or party
            </button>
          </div>

          {/* Disqualification Console Modal */}
          {showDisqualifyModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-deep/60 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-xl shadow-tier2 max-w-lg w-full p-6 animate-scaleIn border border-error/30">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-error-bg flex items-center justify-center shrink-0 text-error-deep">
                    <Ban className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-navy-deep">Issue official disqualification</h2>
                    <p className="text-xs text-slate-text mt-0.5">
                      Select either an individual candidate or an entire election party slate to disqualify.
                    </p>
                  </div>
                  <button onClick={() => setShowDisqualifyModal(false)} className="text-slate-text hover:text-navy-deep">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Scope Selector */}
                  <div>
                    <label className="label-text mb-2 block">Disqualification scope</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDisqScope('candidate')}
                        className={`p-3 rounded-lg border text-left text-xs font-semibold transition-all ${
                          disqScope === 'candidate'
                            ? 'border-error-deep bg-error-bg/30 text-error-deep ring-1 ring-error-deep'
                            : 'border-slate-border bg-white text-navy-deep'
                        }`}
                      >
                        <UserCog className="w-4 h-4 mb-1" />
                        Individual Candidate
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisqScope('party')}
                        className={`p-3 rounded-lg border text-left text-xs font-semibold transition-all ${
                          disqScope === 'party'
                            ? 'border-error-deep bg-error-bg/30 text-error-deep ring-1 ring-error-deep'
                            : 'border-slate-border bg-white text-navy-deep'
                        }`}
                      >
                        <Users className="w-4 h-4 mb-1" />
                        Entire Party / Slate
                      </button>
                    </div>
                  </div>

                  {disqScope === 'candidate' ? (
                    <div>
                      <label className="label-text mb-1.5 block">Select candidate to disqualify</label>
                      <select
                        value={selectedCandidateId}
                        onChange={(e) => setSelectedCandidateId(e.target.value)}
                        className="input-field text-sm"
                      >
                        <option value="">Select candidate...</option>
                        {candidates.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.student_id}) — {c.faculty} {c.meta?.party ? `[${c.meta.party}]` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="label-text mb-1.5 block">Select party / slate to disqualify</label>
                      {partyNames.length === 0 ? (
                        <p className="text-xs text-amber-seal bg-amber-bg p-2.5 rounded border border-amber-border">
                          No named political parties registered in this election yet. Assign candidates a party name first.
                        </p>
                      ) : (
                        <select
                          value={selectedParty}
                          onChange={(e) => setSelectedParty(e.target.value)}
                          className="input-field text-sm"
                        >
                          <option value="">Select party...</option>
                          {partyNames.map(p => (
                            <option key={p} value={p}>{p} ({candidates.filter(c => c.meta?.party?.toLowerCase() === p.toLowerCase()).length} candidates)</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Rule Broken */}
                  <div>
                    <label className="label-text mb-1.5 block">Breached election rule</label>
                    <select
                      value={selectedRuleTitle}
                      onChange={(e) => setSelectedRuleTitle(e.target.value)}
                      className="input-field text-sm"
                    >
                      {rules.length > 0 ? (
                        rules.map(r => (
                          <option key={r.id} value={`Rule #${r.rule_number}: ${r.title}`}>
                            Rule #{r.rule_number}: {r.title} ({r.category})
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="Rule 1: Code of Conduct & Non-Defamation">Rule 1: Code of Conduct & Non-Defamation</option>
                          <option value="Rule 2: Campaign Silence Period Violation">Rule 2: Campaign Silence Period Violation</option>
                          <option value="Rule 3: Prohibition of Inducements & Bribery">Rule 3: Prohibition of Inducements & Bribery</option>
                          <option value="Rule 4: Campus Defacement & Poster Violation">Rule 4: Campus Defacement & Poster Violation</option>
                          <option value="Rule 5: Spending Limit & Audit Non-Compliance">Rule 5: Spending Limit & Audit Non-Compliance</option>
                          <option value="Rule 6: Academic Standing / Attendance Default">Rule 6: Academic Standing / Attendance Default</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Violation details */}
                  <div>
                    <label className="label-text mb-1.5 block">Violation details & evidence notes *</label>
                    <textarea
                      className="input-field min-h-24 h-auto py-2.5 text-sm"
                      value={disqReason}
                      onChange={(e) => setDisqReason(e.target.value)}
                      placeholder="Specify the exact infraction, incident location, evidence submitted, and committee decision."
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-slate-border pt-4">
                  <button onClick={() => setShowDisqualifyModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={handleExecuteDisqualification}
                    disabled={saving || !disqReason.trim()}
                    className="btn-civic bg-error-deep hover:bg-red-700 text-white inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    {saving ? 'Enforcing...' : 'Confirm disqualification'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Disqualified Candidates Table */}
          {disqualifiedCandidates.length === 0 ? (
            <div className="card p-10 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-vote mx-auto mb-3" />
              <p className="text-base font-semibold text-navy-deep">No disqualifications on record</p>
              <p className="text-xs text-slate-text mt-1 max-w-md mx-auto">
                All candidates are currently in good standing. If a candidate or party violates election rules, use the disqualification button above.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {disqualifiedCandidates.map((candidate) => (
                <div key={candidate.id} className="card p-4 lg:p-5 border-2 border-error/30 bg-error-bg/15">
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-error/30 bg-white flex items-center justify-center">
                        {candidate.image_url ? (
                          <img src={candidate.image_url} alt="" className="w-full h-full object-cover grayscale opacity-75" />
                        ) : (
                          <div className="w-full h-full bg-error-bg text-error-deep flex items-center justify-center font-bold">
                            <Ban className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-semibold text-navy-deep text-base">{candidate.name}</h3>
                          <span className="badge bg-error-bg text-error-deep border border-error/30 font-bold inline-flex items-center gap-1">
                            <Ban className="w-3 h-3" /> Disqualified
                          </span>
                          {candidate.meta?.disqualifiedParty && (
                            <span className="badge bg-error-deep text-white text-[10px]">
                              Party Slate Disqualified
                            </span>
                          )}
                          {candidate.meta?.party && (
                            <span className="badge bg-slate-wash text-navy-deep border border-slate-border text-xs">
                              Party: {candidate.meta.party}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-text">
                          {candidate.student_id} · {candidate.faculty} {candidate.semester ? `· Sem ${candidate.semester}` : ''}
                        </p>

                        <div className="mt-2 text-xs text-error-deep font-medium">
                          Breached: {candidate.meta?.disqualifiedRule ?? 'Election Code of Conduct Violation'}
                        </div>

                        {candidate.meta?.disqualificationReason && (
                          <p className="mt-1 text-xs text-slate-text italic bg-white/70 p-2.5 rounded border border-error/20">
                            "{candidate.meta.disqualificationReason}"
                          </p>
                        )}

                        {candidate.meta?.disqualifiedAt && (
                          <p className="mt-1.5 text-[10px] text-slate-muted">
                            Order issued: {new Date(candidate.meta.disqualifiedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                            {candidate.meta.disqualifiedBy ? ` by ${candidate.meta.disqualifiedBy}` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 self-end sm:self-start">
                      <button
                        onClick={() => handleReinstate(candidate)}
                        className="btn-secondary inline-flex items-center gap-1.5 text-xs py-1.5 px-3 border-emerald-border text-emerald-deep hover:bg-emerald-bg"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Lift disqualification / Reinstate
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* --- Eligibility Manager --- */
function EligibilityManager({ election, onNotice }: { election: Election | null; onNotice: (n: Notice) => void }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<{ id: string; student_id: string; eligible: boolean; department: string | null; semester: string | null; hasParticipated: boolean; studentName: string | null; studentUsn: string | null }[]>([]);

  useEffect(() => {
    if (election) loadEligibility();
    else setRows([]);
  }, [election?.id]);

  async function loadEligibility() {
    if (!election) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('student_eligibility')
      .select(`id, student_id, eligible, department, semester, verified_at, profiles!student_eligibility_student_id_fkey(full_name, student_id)`)
      .eq('election_id', election.id)
      .order('verified_at', { ascending: false });
    if (error) { onNotice({ type: 'error', text: 'Could not load eligibility data.' }); setLoading(false); return; }
    const { data: participation } = await supabase.from('voting_participation').select('voter_id').eq('election_id', election.id);
    const participated = new Set((participation ?? []).map((p: { voter_id: string }) => p.voter_id));
    setRows((data ?? []).map((row: Record<string, unknown>) => {
      const profile = row.profiles as { full_name: string; student_id: string } | null;
      return {
        id: row.id as string, student_id: row.student_id as string, eligible: row.eligible as boolean,
        department: row.department as string | null, semester: row.semester as string | null,
        hasParticipated: participated.has(row.student_id as string),
        studentName: profile?.full_name ?? null, studentUsn: profile?.student_id ?? null,
      };
    }));
    setLoading(false);
  }

  async function toggle(row: typeof rows[0]) {
    const { error } = await supabase.rpc('assign_student_eligibility', {
      p_election_id: election!.id, p_student_id: row.student_id, p_department: row.department ?? '', p_semester: row.semester ?? '', p_eligible: !row.eligible,
    });
    if (error) { onNotice({ type: 'error', text: 'Could not update eligibility.' }); return; }
    onNotice({ type: 'success', text: `Student ${!row.eligible ? 'marked eligible' : 'marked ineligible'}.` });
    await loadEligibility();
  }

  if (!election) return <Empty text="Select an election first to manage student eligibility." />;

  const eligibleCount = rows.filter((r) => r.eligible).length;
  const participatedCount = rows.filter((r) => r.hasParticipated).length;

  return (
    <>
      <div className="mb-8">
        <p className="label-text mb-2 text-civic">Student eligibility</p>
        <h1 className="headline-lg">Manage eligibility</h1>
        <p className="mt-2 text-sm text-slate-text">{election.title} · Assign and review which students can vote.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Clock3 className="h-6 w-6 animate-spin text-civic" /></div>
      ) : rows.length === 0 ? (
        <Empty text="No students have been assigned eligibility for this election yet." />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="card p-4"><p className="text-2xl font-bold text-navy-deep">{rows.length}</p><p className="text-xs uppercase tracking-label text-slate-text">Total students</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-emerald-vote">{eligibleCount}</p><p className="text-xs uppercase tracking-label text-slate-text">Eligible</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-civic">{participatedCount}</p><p className="text-xs uppercase tracking-label text-slate-text">Participated</p></div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-wash text-left">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-label text-slate-text">Student</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-label text-slate-text">USN</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-label text-slate-text">Dept</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-label text-slate-text">Participated</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-label text-slate-text">Eligible</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-border">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-canvas">
                      <td className="px-4 py-3 font-medium text-navy-deep">{r.studentName ?? 'Unknown'}</td>
                      <td className="px-4 py-3 text-slate-text">{r.studentUsn ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-text">{r.department ?? '—'}</td>
                      <td className="px-4 py-3">
                        {r.hasParticipated
                          ? <span className="flex items-center gap-1 text-xs font-medium text-civic"><CheckCircle2 className="h-3.5 w-3.5" /> Yes</span>
                          : <span className="text-xs text-slate-muted">No</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggle(r)}
                          disabled={r.hasParticipated}
                          className={`rounded px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${r.eligible ? 'bg-emerald-bg text-emerald-deep border border-emerald-border' : 'bg-slate-wash text-slate-text border border-slate-frame'}`}
                        >
                          {r.eligible ? 'Eligible' : 'Ineligible'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-text">Participation status shows whether a student has voted without revealing their candidate choice.</p>
        </>
      )}
    </>
  );
}

/* --- Control Panel with Live Voting Timer & Unrestricted Timing Controls --- */
function ControlPanel({ election, participation, onChange, onNotice, onRefresh }: {
  election: Election | null;
  participation: number;
  onChange: (status: string) => Promise<void>;
  onNotice: (n: Notice) => void;
  onRefresh: () => Promise<void>;
}) {
  if (!election) return <Empty text="Select an election first to control voting." />;

  const [savingTimer, setSavingTimer] = useState(false);

  async function handleSaveCustomTimer(values: CustomTimerValues) {
    if (!election) return;
    setSavingTimer(true);

    const { error } = await supabase
      .from('elections')
      .update({
        opens_at: values.opensAt,
        closes_at: values.closesAt,
      })
      .eq('id', election.id);

    setSavingTimer(false);
    if (error) {
      onNotice({ type: 'error', text: `Failed to update timer schedule: ${error.message}` });
      return;
    }

    onNotice({
      type: 'success',
      text: values.isUnrestricted
        ? 'Voting window updated to Unrestricted (No time limit enforced).'
        : 'Voting schedule and custom timer updated successfully.',
    });
    await onRefresh();
  }

  const canStart = election.status === 'scheduled';
  const canPause = election.status === 'active';
  const canResume = election.status === 'paused';
  const canClose = ['active', 'paused'].includes(election.status);

  return (
    <>
      <div className="mb-8">
        <p className="label-text mb-2 text-civic">Election governance & timer controls</p>
        <h1 className="headline-lg">Voting controls & timer</h1>
        <p className="mt-2 text-sm text-slate-text">
          Control live voting state, set strict custom opening/closing countdown timers, or enable unrestricted voting without time limits.
        </p>
      </div>

      {/* Main Status & Action Card */}
      <div className="card mb-6 p-5 lg:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs uppercase tracking-label text-slate-text">Selected election</p>
            <h2 className="mt-1 text-xl font-semibold text-navy-deep">{election.title}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-text">
              <StatusBadge status={election.status} />
              <LiveCountdownTimer status={election.status} opensAt={election.opens_at} closesAt={election.closes_at} variant="compact" />
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-2xl font-bold text-navy-deep">{participation}</p>
            <p className="text-xs uppercase tracking-label text-slate-text">ballots submitted</p>
          </div>
        </div>

        {/* Voting State Buttons */}
        <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-border pt-5">
          {canStart && <button onClick={() => onChange('active')} className="btn-civic inline-flex items-center gap-2"><Play className="h-4 w-4" /> Start voting</button>}
          {canPause && <button onClick={() => onChange('paused')} className="btn-secondary inline-flex items-center gap-2"><Pause className="h-4 w-4" /> Pause voting</button>}
          {canResume && <button onClick={() => onChange('active')} className="btn-civic inline-flex items-center gap-2"><Play className="h-4 w-4" /> Resume voting</button>}
          {canClose && <button onClick={() => onChange('closed')} className="btn-secondary inline-flex items-center gap-2 text-error-deep"><Square className="h-4 w-4" /> Close election</button>}
          {election.status === 'closed' && <button onClick={() => onChange('results_published')} className="btn-civic inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Publish results</button>}
        </div>
      </div>

      {/* Live Countdown Banner in Faculty View */}
      <div className="mb-6">
        <LiveCountdownTimer status={election.status} opensAt={election.opens_at} closesAt={election.closes_at} variant="card" />
      </div>

      {/* Custom Voting Window Timer & Schedule Configuration Card */}
      <div className="mb-6">
        <CustomTimerSetting
          initialOpensAt={election.opens_at}
          initialClosesAt={election.closes_at}
          onSave={handleSaveCustomTimer}
          saving={savingTimer}
          saveButtonText="Save Custom Timer Schedule"
        />
      </div>

      <div className="card border-amber-border bg-amber-bg p-4 text-sm text-amber-seal">
        <p className="font-semibold">Control safeguards</p>
        <p className="mt-1 leading-relaxed">
          Starting, pausing, closing, and publishing results require an audit entry. Finalized elections cannot be reopened.
        </p>
      </div>
    </>
  );
}

/* --- Results Panel --- */
function ResultsPanel({ elections, participation }: { elections: Election[]; participation: Record<string, number> }) {
  return (
    <>
      <div className="mb-8">
        <p className="label-text mb-2 text-civic">Reporting</p>
        <h1 className="headline-lg">Results</h1>
        <p className="mt-2 text-sm text-slate-text">Participation totals are shown without exposing how any individual voted.</p>
      </div>
      {elections.length === 0 ? (
        <Empty text="Results will appear after an election is published." />
      ) : (
        <div className="space-y-3">
          {elections.map((election) => (
            <div key={election.id} className="card flex items-center justify-between gap-4 p-5">
              <div>
                <h3 className="font-semibold text-navy-deep">{election.title}</h3>
                <p className="mt-1 text-sm text-slate-text">{participation[election.id] ?? 0} recorded participations</p>
              </div>
              <StatusBadge status={election.status} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* --- Profile Panel --- */
/* --- Approvals Panel (admin only) --- */
type RegRow = { id: string; user_id: string; faculty_id: string; full_name: string; department: string; email: string; status: string; created_at: string };

function ApprovalsPanel({ onNotice }: { onNotice: (n: Notice) => void }) {
  const [rows, setRows] = useState<RegRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('faculty_registrations')
      .select('id, user_id, faculty_id, full_name, department, email, status, created_at')
      .order('created_at', { ascending: false });
    if (error) { onNotice({ type: 'error', text: 'Could not load faculty registrations.' }); }
    else setRows((data ?? []) as RegRow[]);
    setLoading(false);
  }

  async function approve(userId: string) {
    setActing(userId);
    const { error } = await supabase.rpc('approve_faculty_registration', { p_user_id: userId });
    setActing(null);
    if (error) { onNotice({ type: 'error', text: 'Could not approve this registration.' }); return; }
    onNotice({ type: 'success', text: 'Faculty registration approved. The user can now sign in to the faculty portal.' });
    await load();
  }

  async function reject(userId: string) {
    setActing(userId);
    const { error } = await supabase.rpc('reject_faculty_registration', { p_user_id: userId });
    setActing(null);
    if (error) { onNotice({ type: 'error', text: 'Could not reject this registration.' }); return; }
    onNotice({ type: 'success', text: 'Faculty registration rejected.' });
    await load();
  }

  const pending = rows.filter((r) => r.status === 'pending');
  const reviewed = rows.filter((r) => r.status !== 'pending');

  return (
    <>
      <div className="mb-8">
        <p className="label-text mb-2 text-civic">Administrator</p>
        <h1 className="headline-lg">Faculty approvals</h1>
        <p className="mt-2 text-sm text-slate-text">Review and approve faculty registration requests. Only election administrators can perform this action.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Clock3 className="h-6 w-6 animate-spin text-civic" /></div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div className="card p-4"><p className="text-2xl font-bold text-navy-deep">{rows.length}</p><p className="text-xs uppercase tracking-label text-slate-text">Total requests</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-amber-academic">{pending.length}</p><p className="text-xs uppercase tracking-label text-slate-text">Pending</p></div>
            <div className="card p-4"><p className="text-2xl font-bold text-emerald-vote">{rows.filter((r) => r.status === 'approved').length}</p><p className="text-xs uppercase tracking-label text-slate-text">Approved</p></div>
          </div>

          {pending.length === 0 ? (
            <div className="card p-10 text-center mb-8">
              <CheckCircle2 className="mx-auto mb-3 h-7 w-7 text-emerald-vote" />
              <p className="text-sm text-slate-text">No pending faculty registrations to review.</p>
            </div>
          ) : (
            <div className="space-y-3 mb-8">
              <h2 className="headline-md mb-2">Pending requests</h2>
              {pending.map((r) => (
                <div key={r.id} className="card p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-navy-deep">{r.full_name}</h3>
                        <span className="badge badge-upcoming">Pending</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-text">
                        <span className="flex items-center gap-1.5"><BadgeCheck className="h-3.5 w-3.5" /> Faculty ID: {r.faculty_id}</span>
                        <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {r.email}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-text">Department: {r.department} · Submitted {new Date(r.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => reject(r.user_id)} disabled={acting === r.user_id} className="btn-secondary inline-flex items-center gap-2 text-error-deep disabled:opacity-50">
                        <X className="h-4 w-4" /> Reject
                      </button>
                      <button onClick={() => approve(r.user_id)} disabled={acting === r.user_id} className="btn-civic inline-flex items-center gap-2 disabled:opacity-50">
                        {acting === r.user_id ? <Clock3 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {reviewed.length > 0 && (
            <div>
              <h2 className="headline-md mb-3">Reviewed registrations</h2>
              <div className="space-y-3">
                {reviewed.map((r) => (
                  <div key={r.id} className="card flex items-center justify-between gap-4 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-semibold text-navy-deep">{r.full_name}</h3>
                        <StatusBadge status={r.status === 'approved' ? 'approved' : 'rejected'} />
                      </div>
                      <p className="text-xs text-slate-text">{r.faculty_id} · {r.department} · {r.email}</p>
                    </div>
                    <span className="text-xs text-slate-muted shrink-0">{new Date(r.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function ProfilePanel({ profile, onSignOut }: { profile: Profile | null; onSignOut: () => Promise<void> }) {
  if (!profile) return null;
  return (
    <>
      <div className="mb-8">
        <p className="label-text mb-2 text-civic">Account</p>
        <h1 className="headline-lg">Faculty profile</h1>
        <p className="mt-2 text-sm text-slate-text">Your institutional account details and access level.</p>
      </div>
      <div className="card max-w-2xl p-6 lg:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-civic-wash text-civic">
            <GraduationCap className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-navy-deep">{profile.full_name}</h2>
            <p className="text-sm text-slate-text">{profile.role === 'election_admin' ? 'Election Administrator' : 'Faculty Election Manager'}</p>
          </div>
        </div>
        <div className="space-y-4">
          <ProfileRow label="Faculty ID" value={profile.faculty_id ?? 'Not assigned'} />
          <ProfileRow label="Department" value={profile.department ?? 'Not assigned'} />
          <ProfileRow label="Student ID (internal)" value={profile.student_id} />
          <ProfileRow label="Faculty" value={profile.faculty} />
          <ProfileRow label="Verification" value={profile.verification_status} />
          <ProfileRow label="Member since" value={new Date(profile.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })} />
        </div>
        <div className="mt-8 border-t border-slate-border pt-6">
          <button onClick={onSignOut} className="btn-secondary inline-flex items-center gap-2 text-error-deep">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>
    </>
  );
}

/* --- Shared components --- */
function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-border pb-3">
      <span className="text-xs font-semibold uppercase tracking-label text-slate-text">{label}</span>
      <span className="text-sm font-medium text-navy-deep">{value}</span>
    </div>
  );
}

function ElectionSummary({ election, selected, onOpen }: { election: Election; selected?: boolean; onOpen: (election: Election) => void }) {
  return (
    <button onClick={() => onOpen(election)} className={`card-interactive flex w-full items-center justify-between gap-4 p-4 text-left ${selected ? 'border-civic ring-1 ring-civic/20' : ''}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold text-navy-deep">{election.title}</h3>
          <StatusBadge status={election.status} />
        </div>
        <p className="mt-1 text-sm text-slate-text">{election.category} · Closes {new Date(election.closes_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-muted" />
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    active: 'Voting Open', scheduled: 'Scheduled', upcoming: 'Scheduled', draft: 'Draft',
    paused: 'Voting Paused', closed: 'Voting Closed', results_published: 'Results Published',
    pending: 'Pending', approved: 'Approved', rejected: 'Rejected', inactive: 'Inactive',
  };
  let cls = 'badge-closed';
  if (status === 'active' || status === 'approved') cls = 'badge-active';
  else if (status === 'pending' || status === 'scheduled' || status === 'upcoming' || status === 'draft') cls = 'badge-upcoming';
  else if (status === 'paused') cls = 'bg-amber-bg text-amber-seal border border-amber-border';
  else if (status === 'results_published') cls = 'bg-civic-wash text-civic border border-civic/20';
  return <span className={`badge ${cls}`}>{labels[status] ?? status}</span>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Play; label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded bg-civic-wash text-civic"><Icon className="h-4 w-4" /></div>
      <p className="text-2xl font-bold text-navy-deep">{value}</p>
      <p className="mt-0.5 text-xs uppercase tracking-label text-slate-text">{label}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div>
      <label className="label-text mb-1.5 block">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input-field" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card p-10 text-center">
      <AlertCircle className="mx-auto mb-3 h-7 w-7 text-slate-muted" />
      <p className="text-sm text-slate-text">{text}</p>
    </div>
  );
}
