import { useEffect, useState } from 'react';
import { supabase, type Election, type Vote as VoteRecord } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Vote, LogOut, ChevronRight, Users, CheckCircle2, Clock, ShieldCheck, GraduationCap, AlertCircle, Loader2, BarChart3, Award, Trophy, Pause, Square, Clock3, Gavel } from 'lucide-react';
import { parseElectionRules } from '@/lib/electionRules';
import LiveCountdownTimer from '@/components/LiveCountdownTimer';

type Props = {
  onSelectElection: (election: Election) => void;
};

export default function Dashboard({ onSelectElection }: Props) {
  const { profile, user, signOut } = useAuth();
  const [elections, setElections] = useState<Election[]>([]);
  const [votes, setVotes] = useState<VoteRecord[]>([]);
  const [candidateCounts, setCandidateCounts] = useState<Record<string, number>>({});
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [{ data: electionsData }, { data: votesData }] = await Promise.all([
      supabase.from('elections').select('*').order('created_at', { ascending: false }),
      supabase.from('voting_participation').select('id, election_id, voter_id, receipt_hash, submitted_at').eq('voter_id', user?.id ?? ''),
    ]);

    const elist = (electionsData ?? []) as Election[];
    setElections(elist);
    setVotes((votesData ?? []) as unknown as VoteRecord[]);

    if (elist.length > 0) {
      const { data: candidatesData } = await supabase
        .from('candidates')
        .select('election_id');

      const counts: Record<string, number> = {};
      (candidatesData ?? []).forEach((c: { election_id: string }) => {
        counts[c.election_id] = (counts[c.election_id] ?? 0) + 1;
      });
      setCandidateCounts(counts);

      const { data: allVotes } = await supabase.from('voting_participation').select('election_id');
      const vcounts: Record<string, number> = {};
      (allVotes ?? []).forEach((v: { election_id: string }) => {
        vcounts[v.election_id] = (vcounts[v.election_id] ?? 0) + 1;
      });
      setVoteCounts(vcounts);
    }

    setLoading(false);
  }

  const activeElections = elections.filter((e) => e.status === 'active');
  const scheduledElections = elections.filter((e) => e.status === 'scheduled' || e.status === 'upcoming' || e.status === 'draft');
  const pausedElections = elections.filter((e) => e.status === 'paused');
  const closedElections = elections.filter((e) => e.status === 'closed' || e.status === 'results_published');

  function hasVoted(electionId: string) {
    return votes.some((v) => v.election_id === electionId);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-civic animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-canvas">
      {/* Header */}
      <header className="glass-bar border-b border-slate-border/80 sticky top-0 z-40">
        <div className="max-w-page mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-civic rounded flex items-center justify-center">
              <Vote className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold text-navy-deep">BGSIT Vote</h1>
              <p className="text-[10px] text-slate-text uppercase tracking-label">Institutional Portal</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {profile && (
              <div className="hidden md:flex items-center gap-3 pr-4 border-r border-slate-border">
                <div className="text-right">
                  <p className="text-sm font-semibold text-navy-deep">{profile.full_name}</p>
                  <p className="text-xs text-slate-text">{profile.student_id} · {profile.faculty}</p>
                </div>
                <span className="badge badge-verified">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              </div>
            )}
            <button
              onClick={signOut}
              className="flex items-center gap-2 text-sm text-slate-text hover:text-navy-deep transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-page mx-auto px-4 lg:px-8 py-6 lg:py-10">
        {/* Welcome banner */}
        <div className="card p-6 lg:p-8 mb-8 bg-navy text-white border-navy relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, white 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="badge badge-verified">
                <ShieldCheck className="w-3 h-3" /> Identity Verified
              </span>
              <span className="badge badge-certified">
                <Award className="w-3 h-3" /> Eligible Voter
              </span>
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold tracking-headline mb-2">
              Welcome, {profile?.full_name?.split(' ')[0] ?? 'Student'}
            </h2>
            <p className="text-white/70 text-sm max-w-2xl">
              You are cleared to participate in all elections for {profile?.faculty ?? 'your faculty'}.
              Review the contests below and cast your vote on any open ballot.
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Vote} label="Active Ballots" value={activeElections.length} accent="emerald" />
          <StatCard icon={CheckCircle2} label="Your Votes Cast" value={votes.length} accent="civic" />
          <StatCard icon={Clock} label="Upcoming" value={scheduledElections.length} accent="amber" />
          <StatCard icon={BarChart3} label="Total Contests" value={elections.length} accent="slate" />
        </div>

        {/* Active Elections */}
        {activeElections.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h3 className="headline-md text-navy-deep flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-vote animate-pulseDot" />
                Active Elections
              </h3>
              <span className="text-sm text-slate-text">{activeElections.length} contest{activeElections.length > 1 ? 's' : ''} open</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeElections.map((election) => (
                <ElectionCard
                  key={election.id}
                  election={election}
                  voted={hasVoted(election.id)}
                  candidateCount={candidateCounts[election.id] ?? 0}
                  voteCount={voteCounts[election.id] ?? 0}
                  onSelect={onSelectElection}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </section>
        )}

        {/* Scheduled */}
        {scheduledElections.length > 0 && (
          <section className="mb-10">
            <h3 className="headline-md text-navy-deep mb-4 flex items-center gap-2">
              <Clock3 className="w-5 h-5 text-amber-academic" />
              Upcoming Elections
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scheduledElections.map((election) => (
                <ElectionCard
                  key={election.id}
                  election={election}
                  voted={hasVoted(election.id)}
                  candidateCount={candidateCounts[election.id] ?? 0}
                  voteCount={voteCounts[election.id] ?? 0}
                  onSelect={onSelectElection}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </section>
        )}

        {/* Paused */}
        {pausedElections.length > 0 && (
          <section className="mb-10">
            <h3 className="headline-md text-navy-deep mb-4 flex items-center gap-2">
              <Pause className="w-5 h-5 text-amber-seal" />
              Paused Elections
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {pausedElections.map((election) => (
                <ElectionCard
                  key={election.id}
                  election={election}
                  voted={hasVoted(election.id)}
                  candidateCount={candidateCounts[election.id] ?? 0}
                  voteCount={voteCounts[election.id] ?? 0}
                  onSelect={onSelectElection}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </section>
        )}

        {/* Closed */}
        {closedElections.length > 0 && (
          <section>
            <h3 className="headline-md text-navy-deep mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-slate-text" />
              Closed Elections
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {closedElections.map((election) => (
                <ElectionCard
                  key={election.id}
                  election={election}
                  voted={hasVoted(election.id)}
                  candidateCount={candidateCounts[election.id] ?? 0}
                  voteCount={voteCounts[election.id] ?? 0}
                  onSelect={onSelectElection}
                  formatDate={formatDate}
                />
              ))}
            </div>
          </section>
        )}

        {elections.length === 0 && (
          <div className="card p-12 text-center">
            <AlertCircle className="w-8 h-8 text-slate-muted mx-auto mb-3" />
            <p className="text-slate-text">No elections are currently available.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function statusBadge(status: string) {
  if (status === 'active') {
    return (
      <span className="badge badge-active">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-vote animate-pulseDot" />
        Voting Open
      </span>
    );
  }
  if (status === 'scheduled' || status === 'upcoming' || status === 'draft') {
    return <span className="badge badge-upcoming"><Clock3 className="w-3 h-3" /> Upcoming</span>;
  }
  if (status === 'paused') {
    return <span className="badge bg-amber-bg text-amber-seal border border-amber-border"><Pause className="w-3 h-3" /> Paused</span>;
  }
  if (status === 'results_published') {
    return <span className="badge bg-civic-wash text-civic border border-civic/20"><Trophy className="w-3 h-3" /> Results Published</span>;
  }
  return <span className="badge badge-closed"><Square className="w-3 h-3" /> Closed</span>;
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof Vote; label: string; value: number; accent: string }) {
  const accents: Record<string, string> = {
    emerald: 'bg-emerald-bg text-emerald-vote',
    civic: 'bg-civic-wash text-civic',
    amber: 'bg-amber-bg text-amber-academic',
    slate: 'bg-slate-wash text-slate-text',
  };
  return (
    <div className="card p-4 lg:p-5">
      <div className={`w-9 h-9 rounded flex items-center justify-center mb-3 ${accents[accent]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-navy-deep">{value}</p>
      <p className="text-xs text-slate-text uppercase tracking-label mt-0.5">{label}</p>
    </div>
  );
}

function ElectionCard({
  election,
  voted,
  candidateCount,
  voteCount,
  onSelect,
  formatDate,
}: {
  election: Election;
  voted: boolean;
  candidateCount: number;
  voteCount: number;
  onSelect: (e: Election) => void;
  formatDate: (d: string) => string;
}) {
  const isOpen = election.status === 'active';
  const isUpcoming = election.status === 'scheduled' || election.status === 'upcoming' || election.status === 'draft';
  const isPublished = election.status === 'results_published';

  return (
    <div
      className={`card-interactive p-5 cursor-pointer group ${voted ? 'ring-1 ring-civic/20' : ''}`}
      onClick={() => (isOpen || isPublished) && onSelect(election)}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          {election.faculty && (
            <div className="flex items-center gap-1.5 mb-2">
              <GraduationCap className="w-3.5 h-3.5 text-slate-text" />
              <span className="text-xs text-slate-text font-medium">{election.faculty}</span>
            </div>
          )}
          <h4 className="text-base font-semibold text-navy-deep leading-snug mb-1">{election.title}</h4>
          <p className="text-sm text-slate-text leading-relaxed line-clamp-2">{election.description}</p>
        </div>
        {statusBadge(election.status)}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-text mb-4">
        <span className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {candidateCount} candidate{candidateCount !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <Vote className="w-3.5 h-3.5" />
          {voteCount} vote{voteCount !== 1 ? 's' : ''} cast
        </span>
        {(() => {
          const { rules } = parseElectionRules(election.instructions, election.id);
          return rules.length > 0 ? (
            <span className="flex items-center gap-1 text-civic font-medium">
              <Gavel className="w-3 h-3" />
              {rules.length} rule{rules.length !== 1 ? 's' : ''} enforced
            </span>
          ) : null;
        })()}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-slate-border">
        <div className="flex items-center gap-2">
          <LiveCountdownTimer status={election.status} opensAt={election.opens_at} closesAt={election.closes_at} variant="compact" />
          <span className="text-xs text-slate-text hidden sm:inline">
            {isUpcoming ? `Opens ${formatDate(election.opens_at)}` : `Closes ${formatDate(election.closes_at)}`}
          </span>
        </div>
        {isOpen && (
          voted ? (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-civic">
              <CheckCircle2 className="w-4 h-4" />
              Vote Recorded
            </span>
          ) : (
            <span className="flex items-center gap-1 text-sm font-semibold text-civic group-hover:gap-2 transition-all">
              Cast Vote
              <ChevronRight className="w-4 h-4" />
            </span>
          )
        )}
        {isPublished && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-civic">
            <Trophy className="w-4 h-4" />
            Results Available
          </span>
        )}
        {!isOpen && !isPublished && voted && (
          <span className="flex items-center gap-1.5 text-sm font-semibold text-civic">
            <CheckCircle2 className="w-4 h-4" />
            Participated
          </span>
        )}
      </div>
    </div>
  );
}
