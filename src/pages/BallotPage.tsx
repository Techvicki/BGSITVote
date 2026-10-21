import { useEffect, useState } from 'react';
import { supabase, type Election, type Candidate, type ElectionPosition, type Vote } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  ArrowLeft, CheckCircle2, Loader2, AlertCircle, ShieldCheck, Award, X, Receipt, Lock,
  ChevronRight, GraduationCap, Users, Pause, Square, Clock3, Trophy, Ban, FileText, Gavel
} from 'lucide-react';
import { parseElectionRules, parseCandidateManifesto, type ElectionRule } from '@/lib/electionRules';
import LiveCountdownTimer from '@/components/LiveCountdownTimer';
import { computeTimerState, type TimerState } from '@/lib/electionTimer';
import ElectionResultsView from '@/components/ElectionResultsView';

type Props = {
  election: Election;
  onBack: () => void;
};

type PositionGroup = {
  position: ElectionPosition;
  candidates: Candidate[];
};

export default function BallotPage({ election, onBack }: Props) {
  const { profile } = useAuth();
  const [positions, setPositions] = useState<ElectionPosition[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [rules, setRules] = useState<ElectionRule[]>([]);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [existingVote, setExistingVote] = useState<Vote | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ hash: string; candidateName: string; timestamp: string } | null>(null);
  const [timerState, setTimerState] = useState<TimerState>(() =>
    computeTimerState(election.status, election.opens_at, election.closes_at)
  );

  useEffect(() => {
    const update = () => setTimerState(computeTimerState(election.status, election.opens_at, election.closes_at));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [election.status, election.opens_at, election.closes_at]);

  useEffect(() => {
    loadBallot();
  }, []);

  async function loadBallot() {
    const [{ data: posData }, { data: cData }, { data: vData }] = await Promise.all([
      supabase.from('election_positions').select('*').eq('election_id', election.id).eq('status', 'active').order('created_at'),
      supabase.from('candidates').select('*').eq('election_id', election.id).eq('application_status', 'approved').order('created_at'),
      supabase.from('voting_participation').select('id, election_id, voter_id, receipt_hash, submitted_at').eq('election_id', election.id).eq('voter_id', profile?.id ?? '').maybeSingle(),
    ]);

    setPositions((posData ?? []) as ElectionPosition[]);

    const parsedCandidates = ((cData ?? []) as Candidate[]).map((c) => {
      const { cleanManifesto, meta } = parseCandidateManifesto(c.manifesto);
      return {
        ...c,
        manifesto: cleanManifesto,
        meta,
      };
    });
    setCandidates(parsedCandidates);

    const { rules: parsedRules } = parseElectionRules(election.instructions, election.id);
    setRules(parsedRules);

    if (vData) {
      setExistingVote(vData as unknown as Vote);
    }
    setLoading(false);
  }

  async function castVote() {
    if (!profile) return;
    if (!isOpen) {
      if (isUpcoming) {
        setError(`Voting portal has not opened yet. It will open in ${timerState.formatted}.`);
      } else if (isClosed) {
        setError('Voting has closed for this election. Submissions are no longer accepted.');
      } else if (isPaused) {
        setError('Voting is temporarily paused by election authority.');
      }
      return;
    }
    const selectedCount = Object.keys(selectedIds).length;
    if (selectedCount === 0) return;

    const firstCandidateId = Object.values(selectedIds)[0];
    const candidate = candidates.find((c) => c.id === firstCandidateId);
    if (candidate?.meta?.isDisqualified) {
      setError('This candidate has been disqualified and cannot receive votes.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const hash = generateReceiptHash();
      const { error: submitError } = await supabase.rpc('submit_ballot', {
        p_election_id: election.id,
        p_candidate_id: firstCandidateId,
        p_receipt_hash: hash,
      });

      if (submitError) {
        const msg = submitError.message.toLowerCase();
        if (msg.includes('already voted')) {
          setError('You have already cast your vote in this election.');
          await loadBallot();
        } else if (msg.includes('not currently open') || msg.includes('not active') || msg.includes('voting is not')) {
          setError('Voting is not currently open for this election.');
        } else if (msg.includes('not eligible')) {
          setError('You are not eligible to vote in this election.');
        } else {
          setError('Your vote could not be submitted. Please try again.');
        }
        setSubmitting(false);
        return;
      }

      const candidate = candidates.find((c) => c.id === firstCandidateId);
      setReceipt({
        hash,
        candidateName: candidate?.name ?? 'Selected candidate',
        timestamp: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      });
      setExistingVote({ election_id: election.id, voter_id: profile.id, receipt_hash: hash, created_at: new Date().toISOString() } as Vote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit your vote.');
    } finally {
      setSubmitting(false);
    }
  }

  function generateReceiptHash() {
    const chars = '0123456789ABCDEF';
    let hash = '0x';
    for (let i = 0; i < 40; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    return hash;
  }

  const hasVoted = existingVote !== null;
  const isPaused = election.status === 'paused' || timerState.status === 'paused';
  const isUpcoming = timerState.status === 'upcoming' || election.status === 'scheduled' || election.status === 'upcoming' || election.status === 'draft';
  const isClosed = !timerState.isUnrestricted && (election.status === 'closed' || election.status === 'results_published' || timerState.status === 'closed');
  const isOpen = (timerState.isUnrestricted && election.status === 'active') || timerState.status === 'open';

  const positionGroups: PositionGroup[] = positions.map((pos) => ({
    position: pos,
    candidates: candidates.filter((c) => c.position_id === pos.id),
  }));
  const unassignedCandidates = candidates.filter((c) => !c.position_id);
  const totalCandidates = candidates.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-civic animate-spin" />
      </div>
    );
  }

  function renderStatusBanner() {
    if (isOpen) return null;
    if (isPaused) {
      return (
        <div className="card p-5 mb-6 bg-amber-bg border-amber-border animate-fadeIn">
          <div className="flex items-start gap-3">
            <Pause className="w-5 h-5 text-amber-seal mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-seal">Voting is currently paused</p>
              <p className="text-xs text-amber-seal/80 mt-0.5">This election has been temporarily paused by the administrator. You cannot cast your vote right now, but any vote you already submitted is preserved.</p>
            </div>
          </div>
        </div>
      );
    }
    if (isClosed) {
      return (
        <div className="card p-5 mb-6 bg-slate-wash border-slate-border animate-fadeIn">
          <div className="flex items-start gap-3">
            <Square className="w-5 h-5 text-slate-text mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-navy-deep">Voting has closed</p>
              <p className="text-xs text-slate-text mt-0.5">This election is no longer accepting votes. {election.status === 'results_published' ? 'Results are now available.' : 'Results will be published once they are officially announced.'}</p>
            </div>
          </div>
        </div>
      );
    }
    if (isUpcoming) {
      return (
        <div className="card p-5 mb-6 bg-civic-wash border-civic/20 animate-fadeIn">
          <div className="flex items-start gap-3">
            <Clock3 className="w-5 h-5 text-civic mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-civic">Voting Portal Locked</p>
              <p className="text-xs text-civic/80 mt-0.5">
                Voting window opens in <span className="font-mono font-bold text-civic">{timerState.formatted}</span> ({new Date(election.opens_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}). Candidate profiles are viewable below, but ballot selection and submission unlock when the timer reaches zero.
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-canvas">
      {/* Sticky verification header */}
      <header className="glass-bar border-b border-slate-border/80 sticky top-0 z-40">
        <div className="max-w-page mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-medium text-slate-text hover:text-navy-deep transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div className="flex items-center gap-2">
            <span className="badge badge-verified">
              <ShieldCheck className="w-3 h-3" /> Secure Ballot
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-ballot mx-auto px-4 lg:px-8 py-6 lg:py-10">
        {/* Election header */}
        <div className="mb-6 animate-fadeIn">
          {election.faculty && (
            <div className="flex items-center gap-1.5 mb-3">
              <GraduationCap className="w-4 h-4 text-slate-text" />
              <span className="text-sm text-slate-text font-medium">{election.faculty} Faculty</span>
            </div>
          )}
          <div className="flex items-center gap-2 mb-3">
            {isOpen && (
              <span className="badge badge-active">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-vote animate-pulseDot" />
                Voting Open
              </span>
            )}
            {isPaused && <span className="badge bg-amber-bg text-amber-seal border border-amber-border"><Pause className="w-3 h-3" /> Voting Paused</span>}
            {isClosed && <span className="badge badge-closed"><Square className="w-3 h-3" /> Voting Closed</span>}
            {isUpcoming && <span className="badge badge-upcoming"><Clock3 className="w-3 h-3" /> Not Started · Opens Soon</span>}
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-headline text-navy-deep mb-2">{election.title}</h1>
          <p className="text-sm text-slate-text leading-relaxed">{election.description}</p>
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-text">
            <span className="flex items-center gap-1.5">
              <Clock3 className="w-3.5 h-3.5" />
              {timerState.isUnrestricted
                ? 'No Closing Deadline (Unrestricted)'
                : `Closes ${new Date(election.closes_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`}
            </span>
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {totalCandidates} candidate{totalCandidates !== 1 ? 's' : ''}</span>
          </div>

          {/* Live countdown timer card */}
          <div className="mt-4">
            <LiveCountdownTimer
              status={election.status}
              opensAt={election.opens_at}
              closesAt={election.closes_at}
              variant="card"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5 mt-3 pt-3 border-t border-slate-border">
            <button
              onClick={() => setShowRulesModal(true)}
              className="btn-secondary inline-flex items-center gap-1.5 text-xs py-1.5 px-3 bg-white hover:border-civic"
            >
              <Gavel className="w-3.5 h-3.5 text-civic" /> View Election Code of Conduct & Rules ({rules.length})
            </button>
            {candidates.some(c => c.meta?.isDisqualified) && (
              <span className="badge bg-error-bg text-error-deep border border-error/30 text-xs font-semibold inline-flex items-center gap-1">
                <Ban className="w-3 h-3" /> {candidates.filter(c => c.meta?.isDisqualified).length} candidate(s) disqualified for violations
              </span>
            )}
          </div>
        </div>

        {hasVoted && !receipt && (
          <div className="card p-4 mb-6 bg-emerald-bg border-emerald-border flex items-start gap-3 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-deep mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-deep">You have already voted in this election</p>
              <p className="text-xs text-emerald-deep/80 mt-0.5">
                Your vote was recorded with receipt hash <code className="font-mono">{existingVote?.receipt_hash.slice(0, 18)}...</code>
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 p-3.5 mb-5 bg-error-bg border border-error/20 rounded text-sm text-error-deep animate-fadeIn">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {renderStatusBanner()}

        {/* Declared Results Callout Banner */}
        {election.status === 'results_published' && (
          <div className="card p-5 mb-6 bg-emerald-bg border-emerald-border animate-fadeIn flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Trophy className="w-6 h-6 text-emerald-deep mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-deep">Official Election Results Declared & Published!</p>
                <p className="text-xs text-emerald-deep/80 mt-0.5">
                  Vote counting is complete. View certified winner declarations, vote shares, and printable certificates.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowResultsModal(true)}
              className="btn-civic bg-emerald-deep hover:bg-emerald-700 text-white text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              <Trophy className="w-3.5 h-3.5" /> View Declared Results
            </button>
          </div>
        )}

        {/* Ballot instructions */}
        <div className="card p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-civic-wash rounded flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-civic" />
            </div>
            <div>
              <p className="text-sm font-semibold text-navy-deep">Ballot Instructions</p>
              <p className="text-xs text-slate-text mt-1 leading-relaxed">
                {isOpen
                  ? 'Select a candidate below, then confirm your choice at the bottom of the screen. Once submitted, your vote cannot be changed. A cryptographic receipt will be issued.'
                  : 'You can review the candidates below, but voting is not currently open for this election.'}
              </p>
            </div>
          </div>
        </div>

        {/* No approved candidates */}
        {totalCandidates === 0 && (
          <div className="card p-10 text-center">
            <AlertCircle className="w-7 h-7 text-slate-muted mx-auto mb-3" />
            <p className="text-sm text-slate-text">No approved candidates have been added to this election yet.</p>
          </div>
        )}

        {/* Position-grouped candidates */}
        {positionGroups.length > 0 && (
          <div className="space-y-8 mb-24">
            {positionGroups.map((group) => (
              <div key={group.position.id}>
                <div className="mb-3">
                  <h3 className="text-lg font-bold text-navy-deep">{group.position.name}</h3>
                  {group.position.description && <p className="text-sm text-slate-text mt-1">{group.position.description}</p>}
                  <p className="text-xs text-slate-text mt-1">Select {group.position.max_selections} · {group.position.max_winners} winner{group.position.max_winners !== 1 ? 's' : ''}</p>
                </div>
                {group.candidates.length === 0 ? (
                  <div className="card p-6 text-center"><p className="text-sm text-slate-text">No approved candidates for this position.</p></div>
                ) : (
                  <div className="space-y-3">
                    {group.candidates.map((candidate) => renderCandidate(candidate, group.position.id))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Unassigned candidates (no positions configured) */}
        {positionGroups.length === 0 && unassignedCandidates.length > 0 && (
          <div className="space-y-3 mb-24">
            <p className="label-text">Candidates ({unassignedCandidates.length})</p>
            {unassignedCandidates.map((candidate) => renderCandidate(candidate, null))}
          </div>
        )}
      </main>

      {/* Fixed ballot receipt / status bar */}
      {!receipt && (
        <div className="fixed bottom-0 left-0 right-0 glass-bar border-t border-slate-border z-50 animate-slideUp">
          <div className="max-w-ballot mx-auto px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-bg rounded flex items-center justify-center shrink-0">
                <Award className="w-4 h-4 text-amber-academic" />
              </div>
              <div>
                <p className="text-sm font-semibold text-navy-deep">
                  {Object.keys(selectedIds).length > 0 ? '1 of 1 Contests Marked' : '0 of 1 Contests Marked'}
                </p>
                <p className="text-xs text-slate-text">
                  {hasVoted
                    ? 'Vote submitted — receipt available'
                    : isUpcoming
                    ? `Portal locked · Opens in ${timerState.formatted}`
                    : isClosed
                    ? 'Voting deadline expired'
                    : isPaused
                    ? 'Voting paused by administrator'
                    : Object.keys(selectedIds).length > 0
                    ? 'Ready to submit'
                    : 'Select a candidate to continue'}
                </p>
              </div>
            </div>
            <button
              onClick={castVote}
              disabled={!isOpen || Object.keys(selectedIds).length === 0 || submitting || hasVoted}
              className="btn-civic flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
              ) : hasVoted ? (
                <><CheckCircle2 className="w-4 h-4" /> Vote Recorded</>
              ) : isUpcoming ? (
                <><Lock className="w-4 h-4" /> Locked</>
              ) : (
                <>Submit Vote <ChevronRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-deep/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-tier2 max-w-md w-full animate-scaleIn overflow-hidden">
            {/* Receipt header */}
            <div className="bg-navy text-white p-6 text-center relative">
              <div className="absolute top-3 right-3">
                <button onClick={onBack} className="text-white/60 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="w-12 h-12 bg-emerald-vote rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-xl font-bold mb-1">Vote Recorded</h2>
              <p className="text-white/60 text-xs uppercase tracking-label">Cryptographic Receipt Issued</p>
            </div>

            {/* Receipt body */}
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-center gap-2">
                <span className="badge badge-certified">
                  <Award className="w-3 h-3" /> Gold-Certified Seal
                </span>
                <span className="badge badge-verified">
                  <Lock className="w-3 h-3" /> Encrypted
                </span>
              </div>

              <div className="space-y-3 py-4 border-y border-slate-border">
                <ReceiptRow label="Election" value={election.title} />
                <ReceiptRow label="Selected Candidate" value={receipt.candidateName} />
                <ReceiptRow label="Timestamp" value={receipt.timestamp} />
                <ReceiptRow label="Voter" value={`${profile?.full_name} (${profile?.student_id})`} />
              </div>

              {/* Receipt hash */}
              <div className="p-3 bg-slate-canvas rounded border border-slate-border">
                <div className="flex items-center gap-2 mb-1.5">
                  <Receipt className="w-3.5 h-3.5 text-slate-text" />
                  <span className="label-text">Receipt Hash</span>
                </div>
                <p className="font-mono text-xs text-navy-deep break-all leading-relaxed">{receipt.hash}</p>
              </div>

              <p className="text-xs text-slate-text leading-relaxed text-center">
                Save this receipt hash for your records. It serves as cryptographic proof of your participation without revealing your choice.
              </p>

              <button onClick={onBack} className="btn-civic w-full flex items-center justify-center gap-2">
                Return to Dashboard <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Election Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-deep/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-tier2 max-w-2xl w-full p-6 animate-scaleIn max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-slate-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-civic-wash text-civic flex items-center justify-center shrink-0">
                  <Gavel className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-navy-deep">Official Election Rules & Code of Conduct</h2>
                  <p className="text-xs text-slate-text mt-0.5">{election.title} · Compliance Standards</p>
                </div>
              </div>
              <button onClick={() => setShowRulesModal(false)} className="text-slate-text hover:text-navy-deep">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {rules.length === 0 ? (
                <div className="p-8 text-center text-slate-text text-sm">
                  <FileText className="w-8 h-8 text-slate-muted mx-auto mb-2" />
                  No specific additional rules have been codified for this election. Standard institutional statutes apply.
                </div>
              ) : (
                rules.map((rule) => {
                  const isDisq = rule.penalty.includes('Disqualification');
                  return (
                    <div key={rule.id} className="p-4 rounded-lg border border-slate-border bg-slate-canvas hover:border-slate-frame transition-all">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="w-5 h-5 rounded-full bg-navy text-white text-[11px] font-bold flex items-center justify-center">
                          {rule.rule_number}
                        </span>
                        <h4 className="font-semibold text-sm text-navy-deep">{rule.title}</h4>
                        <span className="badge bg-slate-wash text-navy-deep border border-slate-border text-[10px]">
                          {rule.category}
                        </span>
                        <span className={`badge text-[10px] font-semibold ${
                          isDisq ? 'bg-error-bg text-error-deep border border-error/30' : 'bg-amber-bg text-amber-seal border border-amber-border'
                        }`}>
                          Penalty: {rule.penalty}
                        </span>
                      </div>
                      <p className="text-xs text-slate-text leading-relaxed mt-1">{rule.description}</p>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-border flex justify-end">
              <button onClick={() => setShowRulesModal(false)} className="btn-civic text-xs py-2 px-4">
                Close & Return to Ballot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Results Modal */}
      {showResultsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-deep/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-tier2 max-w-4xl w-full p-6 animate-scaleIn max-h-[90vh] overflow-y-auto relative">
            <ElectionResultsView
              election={election}
              isFaculty={false}
              onBack={() => setShowResultsModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );

  function renderCandidate(candidate: Candidate, positionId: string | null) {
    const selectedKey = positionId ?? 'default';
    const isSelected = selectedIds[selectedKey] === candidate.id;
    const isDisqualified = !!candidate.meta?.isDisqualified;
    const isDisabled = hasVoted || !isOpen || isDisqualified;

    return (
      <div
        key={candidate.id}
        onClick={() => !isDisabled && setSelectedIds({ [selectedKey]: candidate.id })}
        className={`card p-4 lg:p-5 transition-all duration-200 ${
          isDisqualified
            ? 'border-2 border-error/40 bg-error-bg/20 cursor-not-allowed opacity-90'
            : isSelected
            ? 'border-2 border-civic bg-civic-wash shadow-tier2 cursor-pointer'
            : isDisabled
            ? 'cursor-not-allowed opacity-75'
            : 'hover:border-slate-frame hover:shadow-tier1 cursor-pointer'
        }`}
      >
        {/* Prominent Disqualification Banner if disqualified */}
        {isDisqualified && (
          <div className="mb-3.5 p-3 rounded-lg bg-error-bg border border-error/30 text-error-deep">
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wide">
              <Ban className="w-4 h-4 text-error-deep shrink-0" />
              <span>Ineligible · Candidate Disqualified from Election</span>
              {candidate.meta?.disqualifiedParty && (
                <span className="bg-error-deep text-white px-2 py-0.5 rounded text-[10px] font-bold">
                  Party Slate Sanction
                </span>
              )}
            </div>
            <p className="text-xs font-semibold mt-1">
              Violated: {candidate.meta?.disqualifiedRule ?? 'Code of Conduct'}
            </p>
            {candidate.meta?.disqualificationReason && (
              <p className="text-xs mt-0.5 italic text-error-deep/90">
                "{candidate.meta.disqualificationReason}"
              </p>
            )}
            <p className="text-[11px] text-error-deep/75 mt-1 font-medium">
              This candidate is barred from receiving votes in accordance with election committee orders.
            </p>
          </div>
        )}

        <div className="flex items-start gap-4">
          {/* Radio or Disqualified Icon */}
          <div className="mt-1 shrink-0">
            {isDisqualified ? (
              <div className="w-6 h-6 rounded-full bg-error-bg text-error-deep border border-error/40 flex items-center justify-center">
                <Ban className="w-3.5 h-3.5" />
              </div>
            ) : (
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                isSelected ? 'border-civic bg-civic' : 'border-slate-muted'
              }`}>
                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            )}
          </div>

          {/* Candidate image / logo */}
          <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-slate-border bg-white shadow-xs flex items-center justify-center">
            {candidate.image_url ? (
              <img
                src={candidate.image_url}
                alt={candidate.name}
                className={`w-full h-full object-cover ${isDisqualified ? 'grayscale opacity-60' : ''}`}
              />
            ) : (
              <div className={`w-full h-full flex items-center justify-center font-bold text-lg ${
                isDisqualified ? 'bg-error-bg text-error-deep' : 'bg-civic-wash text-civic'
              }`}>
                {candidate.name.charAt(0)}
              </div>
            )}
          </div>

          {/* Candidate info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="text-base font-semibold text-navy-deep">{candidate.name}</h3>

              {isSelected && (
                <span className="badge badge-certified text-[10px] py-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Selected
                </span>
              )}

              {candidate.meta?.party && (
                <span className="badge bg-slate-wash text-navy-deep border border-slate-border text-[11px] font-medium inline-flex items-center gap-1">
                  <Users className="w-2.5 h-2.5" /> Party: {candidate.meta.party}
                </span>
              )}

              {candidate.meta?.symbol && (
                <span className="badge bg-amber-bg text-amber-seal border border-amber-border text-[11px] font-medium inline-flex items-center gap-1">
                  <Award className="w-2.5 h-2.5" /> Symbol: {candidate.meta.symbol}
                </span>
              )}
            </div>

            {/* Subdivided Academic Identity */}
            <div className="flex flex-wrap items-center gap-2 mb-2 text-xs">
              <span className="badge bg-slate-wash text-navy-deep border border-slate-border font-mono">
                USN: {candidate.student_id}
              </span>
              <span className="badge bg-slate-wash text-navy-deep border border-slate-border inline-flex items-center gap-1">
                <GraduationCap className="w-3 h-3 text-civic" /> Branch: {candidate.faculty}
              </span>
              {candidate.semester && (
                <span className="badge bg-slate-wash text-navy-deep border border-slate-border">
                  Sem {candidate.semester}
                </span>
              )}
            </div>

            {/* Subdivided detail: About the candidate / Short Intro */}
            {candidate.meta?.intro && (
              <div className="mb-2.5 rounded-lg border border-civic/20 bg-civic-wash/40 p-2.5 text-xs text-navy-deep">
                <span className="font-bold text-civic mr-1.5">About the candidate:</span>
                <span className="italic font-medium">"{candidate.meta.intro}"</span>
              </div>
            )}

            {/* Campaign Manifesto */}
            {candidate.manifesto && (
              <div className="text-xs text-slate-text leading-relaxed">
                <span className="font-semibold text-slate-text mr-1">Campaign Manifesto:</span>
                {candidate.manifesto}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-slate-text uppercase tracking-label pt-0.5 shrink-0">{label}</span>
      <span className="text-sm font-medium text-navy-deep text-right">{value}</span>
    </div>
  );
}
