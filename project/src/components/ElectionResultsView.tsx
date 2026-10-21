import React, { useState, useEffect } from 'react';
import {
  Trophy, Award, CheckCircle2, Users, Vote, ShieldCheck,
  BarChart3, RefreshCw, Printer, ArrowLeft, Ban, Sparkles,
  GraduationCap, Calendar, Lock, Check, FileCheck
} from 'lucide-react';
import {
  type ElectionResultsSummary,
  type PositionResult,
  calculateLiveElectionResults,
  serializeOfficialResults,
  parseOfficialResults,
  saveOfficialResultsLocally
} from '@/lib/resultsService';
import { supabase, type Election } from '@/lib/supabase';

type Props = {
  election: Election;
  isFaculty?: boolean;
  onBack?: () => void;
  onDeclared?: () => Promise<void> | void;
};

export default function ElectionResultsView({
  election,
  isFaculty = false,
  onBack,
  onDeclared,
}: Props) {
  const [results, setResults] = useState<ElectionResultsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | string>('all');
  const [showCertificate, setShowCertificate] = useState(false);

  useEffect(() => {
    loadResults();
  }, [election.id]);

  async function loadResults() {
    setLoading(true);
    // If results are already published, check if certified results are stored
    const stored = parseOfficialResults(election.instructions, election.id);
    if (stored && election.status === 'results_published') {
      setResults(stored);
      setLoading(false);
      return;
    }

    // Auto-calculate live results from secret ballots
    try {
      const live = await calculateLiveElectionResults(election);
      setResults(live);
    } catch (err) {
      console.error('Failed to calculate live results:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const live = await calculateLiveElectionResults(election);
      setResults(live);
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleDeclareResults() {
    if (!results) return;
    if (!confirm('Are you sure you want to certify and publish the official election results? Once published, winners are declared and visible to all students.')) {
      return;
    }

    setDeclaring(true);
    try {
      const certifiedSummary: ElectionResultsSummary = {
        ...results,
        declaredAt: new Date().toISOString(),
        declaredBy: 'Faculty Election Board',
      };

      // 1. Update election status to results_published via RPC
      const { error: rpcError } = await supabase.rpc('update_election_status', {
        p_election_id: election.id,
        p_status: 'results_published',
        p_reason: 'Official election results certified and declared by Faculty Election Board.',
      });

      if (rpcError) {
        // Fallback update if status transition needs direct update
        await supabase
          .from('elections')
          .update({
            status: 'results_published',
            published_at: certifiedSummary.declaredAt,
          })
          .eq('id', election.id);
      }

      // 2. Save serialized certified results in instructions & local cache
      const serialized = serializeOfficialResults(election.instructions ?? '', certifiedSummary);
      await supabase
        .from('elections')
        .update({ instructions: serialized })
        .eq('id', election.id);

      saveOfficialResultsLocally(election.id, certifiedSummary);
      setResults(certifiedSummary);

      if (onDeclared) {
        await onDeclared();
      }
    } catch (err) {
      console.error('Declaration error:', err);
      alert('Could not declare results. Please check your permissions.');
    } finally {
      setDeclaring(false);
    }
  }

  const isPublished = election.status === 'results_published';

  if (loading) {
    return (
      <div className="card p-12 text-center animate-fadeIn">
        <RefreshCw className="w-8 h-8 text-civic animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-navy-deep">Auto-counting secret ballots & compiling results...</p>
        <p className="text-xs text-slate-text mt-1">Tallies are calculated directly from verified cryptographic votes.</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="card p-8 text-center animate-fadeIn">
        <BarChart3 className="w-8 h-8 text-slate-muted mx-auto mb-2" />
        <p className="text-sm text-slate-text">Results are currently unavailable for this election.</p>
        {onBack && (
          <button onClick={onBack} className="btn-secondary text-xs mt-4">
            Return to Dashboard
          </button>
        )}
      </div>
    );
  }

  const filteredPositions = activeTab === 'all'
    ? results.positions
    : results.positions.filter(p => p.positionId === activeTab);

  const totalPositions = results.positions.length;
  const totalWinners = results.positions.reduce((acc, p) => acc + p.winners.length, 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Bar with Navigation & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-border">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="btn-secondary inline-flex items-center gap-1.5 text-xs py-1.5 px-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className={`badge ${isPublished ? 'badge-certified bg-emerald-bg text-emerald-deep border-emerald-border' : 'badge-active'}`}>
                {isPublished ? <CheckCircle2 className="w-3 h-3" /> : <BarChart3 className="w-3 h-3" />}
                {isPublished ? 'Official Results Declared' : 'Live Vote Counting'}
              </span>
              <span className="text-xs text-slate-text">· {election.category ?? 'Governance'}</span>
            </div>
            <h1 className="text-xl lg:text-2xl font-bold text-navy-deep mt-1">{election.title}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end flex-wrap">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn-secondary inline-flex items-center gap-1.5 text-xs py-2 px-3"
            title="Refresh latest vote counts"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh counts
          </button>

          <button
            onClick={() => window.print()}
            className="btn-secondary inline-flex items-center gap-1.5 text-xs py-2 px-3"
            title="Print Official Results Sheet"
          >
            <Printer className="w-3.5 h-3.5" /> Print Sheet
          </button>

          {isFaculty && !isPublished && (
            <button
              onClick={handleDeclareResults}
              disabled={declaring}
              className="btn-civic bg-emerald-vote hover:bg-emerald-600 text-white inline-flex items-center gap-2 text-xs py-2 px-4 shadow-xs"
            >
              <Trophy className="w-4 h-4" />
              {declaring ? 'Certifying & Declaring...' : '🏆 Declare & Publish Official Results'}
            </button>
          )}
        </div>
      </div>

      {/* Official Certified Declaration Banner (when published) */}
      {isPublished && (
        <div className="rounded-xl border-2 border-emerald-border bg-gradient-to-r from-emerald-50 via-white to-emerald-50 p-6 shadow-tier1 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-full bg-emerald-vote text-white flex items-center justify-center shrink-0 shadow-md">
                <Trophy className="w-7 h-7 text-amber-academic fill-amber-academic" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="badge badge-certified text-[11px] font-bold">
                    <Award className="w-3.5 h-3.5" /> Certified Election Results
                  </span>
                  <span className="badge badge-verified text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5" /> Cryptographically Sealed
                  </span>
                </div>
                <h2 className="text-xl font-bold text-navy-deep">Official Winners Declared</h2>
                <p className="text-xs text-slate-text mt-1 max-w-xl leading-relaxed">
                  The Faculty Election Authority has formally ratified and concluded the ballot tally.
                  All votes were automatically counted from verified secret ballots with 100% cryptographic integrity.
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-text">
                  <span className="font-mono bg-white px-2.5 py-1 rounded border border-emerald-border font-bold text-emerald-deep text-[11px]">
                    Seal: {results.certificationSeal}
                  </span>
                  <span>Declared on: {new Date(results.declaredAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="text-right p-3 bg-white rounded-lg border border-emerald-border shadow-xs">
                <p className="text-2xl font-bold text-emerald-deep">{totalWinners}</p>
                <p className="text-[10px] uppercase font-bold text-slate-text">Elected Winners</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Turnout & Participation Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-text text-xs mb-1">
            <Vote className="w-3.5 h-3.5 text-civic" /> Total Ballots Cast
          </div>
          <p className="text-2xl font-bold text-navy-deep">{results.totalBallotsCast}</p>
          <p className="text-[10px] text-slate-muted mt-0.5">Verified participating voters</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-text text-xs mb-1">
            <Users className="w-3.5 h-3.5 text-civic" /> Eligible Voters
          </div>
          <p className="text-2xl font-bold text-navy-deep">{results.totalEligibleVoters || 'All'}</p>
          <p className="text-[10px] text-slate-muted mt-0.5">Cleared student electorate</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-text text-xs mb-1">
            <BarChart3 className="w-3.5 h-3.5 text-emerald-vote" /> Voter Turnout
          </div>
          <p className="text-2xl font-bold text-emerald-deep">
            {results.turnoutPercentage > 0 ? `${results.turnoutPercentage}%` : '—'}
          </p>
          <p className="text-[10px] text-slate-muted mt-0.5">Participation rate</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 text-slate-text text-xs mb-1">
            <Award className="w-3.5 h-3.5 text-amber-academic" /> Contested Posts
          </div>
          <p className="text-2xl font-bold text-navy-deep">{totalPositions}</p>
          <p className="text-[10px] text-slate-muted mt-0.5">Elective offices</p>
        </div>
      </div>

      {/* Position Filter Tabs */}
      {results.positions.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-border text-xs">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === 'all'
                ? 'bg-civic text-white font-bold shadow-xs'
                : 'text-slate-text hover:text-navy-deep hover:bg-slate-wash'
            }`}
          >
            All Positions ({results.positions.length})
          </button>
          {results.positions.map((pos) => (
            <button
              key={pos.positionId}
              onClick={() => setActiveTab(pos.positionId)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                activeTab === pos.positionId
                  ? 'bg-civic text-white font-bold shadow-xs'
                  : 'text-slate-text hover:text-navy-deep hover:bg-slate-wash'
              }`}
            >
              {pos.positionName} ({pos.candidates.length})
            </button>
          ))}
        </div>
      )}

      {/* Position Results Sections */}
      <div className="space-y-8">
        {filteredPositions.map((pos) => (
          <div key={pos.positionId} className="card p-5 lg:p-6 border border-slate-border bg-white shadow-tier1">
            {/* Position Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-5 border-b border-slate-border">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-civic-wash text-civic flex items-center justify-center font-bold text-xs">
                    <Trophy className="w-3.5 h-3.5" />
                  </span>
                  <h3 className="text-lg font-bold text-navy-deep">{pos.positionName}</h3>
                </div>
                {pos.positionDescription && (
                  <p className="text-xs text-slate-text mt-1">{pos.positionDescription}</p>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="badge bg-slate-wash text-navy-deep border border-slate-border">
                  {pos.totalVotesForPosition} vote{pos.totalVotesForPosition !== 1 ? 's' : ''} cast
                </span>
                <span className="badge bg-civic-wash text-civic border border-civic/20">
                  {pos.maxWinners} Winner{pos.maxWinners !== 1 ? 's' : ''} Elected
                </span>
              </div>
            </div>

            {/* Position Winners Highlight (if any votes or winners) */}
            {pos.winners.length > 0 && (
              <div className="mb-6 p-4 rounded-xl bg-amber-bg/50 border border-amber-border">
                <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-amber-seal">
                  <Trophy className="w-4 h-4 text-amber-academic fill-amber-academic" />
                  <span>
                    {isPublished ? 'Officially Declared Winner' : 'Current Leading Candidate'}
                    {pos.winners.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pos.winners.map((winner) => (
                    <div
                      key={winner.candidateId}
                      className="p-3.5 rounded-lg bg-white border-2 border-amber-academic/40 shadow-xs flex items-center gap-3.5"
                    >
                      <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 border border-amber-border bg-amber-50 flex items-center justify-center">
                        {winner.imageUrl ? (
                          <img src={winner.imageUrl} alt={winner.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-amber-academic text-white flex items-center justify-center font-bold text-xl">
                            {winner.name.charAt(0)}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-navy-deep text-sm">{winner.name}</h4>
                          <span className="badge bg-amber-academic text-white border-amber-academic text-[10px] font-bold py-0.5">
                            <Trophy className="w-2.5 h-2.5 fill-white" /> Winner
                          </span>
                        </div>
                        <p className="text-xs text-slate-text mt-0.5">
                          {winner.studentId} · {winner.faculty} {winner.semester ? `· Sem ${winner.semester}` : ''}
                        </p>
                        {winner.party && (
                          <p className="text-xs text-slate-text mt-0.5 font-medium">
                            Party: <span className="text-navy-deep">{winner.party}</span>
                            {winner.symbol && ` (${winner.symbol})`}
                          </p>
                        )}
                        <p className="text-xs font-bold text-emerald-deep mt-1">
                          {winner.votes} votes ({winner.percentage}%)
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Candidate Vote Breakdown Cards & Progress Bars */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-text mb-2">
                Candidate Vote Breakdown ({pos.candidates.length})
              </p>

              {pos.candidates.length === 0 ? (
                <div className="p-6 text-center text-slate-text text-xs border border-dashed rounded-lg">
                  No candidates participated in this contest.
                </div>
              ) : (
                pos.candidates.map((candidate) => {
                  return (
                    <div
                      key={candidate.candidateId}
                      className={`p-4 rounded-xl border transition-all ${
                        candidate.isWinner
                          ? 'border-2 border-emerald-vote/60 bg-emerald-bg/20'
                          : candidate.isDisqualified
                          ? 'border-error/30 bg-error-bg/10 opacity-70'
                          : 'border-slate-border bg-slate-canvas/40'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2.5">
                        {/* Candidate Identity */}
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Rank Badge */}
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                            candidate.isWinner
                              ? 'bg-amber-academic text-white'
                              : 'bg-slate-wash text-navy-deep border border-slate-border'
                          }`}>
                            #{candidate.rank}
                          </span>

                          {/* Candidate Logo / Photo */}
                          <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 border border-slate-border bg-white flex items-center justify-center shadow-xs">
                            {candidate.imageUrl ? (
                              <img src={candidate.imageUrl} alt={candidate.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-civic-wash text-civic flex items-center justify-center font-bold text-sm">
                                {candidate.name.charAt(0)}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-navy-deep text-sm">{candidate.name}</h4>
                              {candidate.isWinner && (
                                <span className="badge badge-certified text-[10px] py-0.5">
                                  <Trophy className="w-2.5 h-2.5 fill-amber-academic text-amber-academic" /> Elected
                                </span>
                              )}
                              {candidate.isDisqualified && (
                                <span className="badge bg-error-bg text-error-deep border border-error/30 text-[10px] py-0.5">
                                  <Ban className="w-2.5 h-2.5" /> Disqualified
                                </span>
                              )}
                              {candidate.party && (
                                <span className="badge bg-slate-wash text-navy-deep border border-slate-border text-[10px]">
                                  {candidate.party}
                                </span>
                              )}
                              {candidate.symbol && (
                                <span className="badge bg-amber-bg text-amber-seal border border-amber-border text-[10px]">
                                  {candidate.symbol}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-text mt-0.5">
                              {candidate.studentId} · {candidate.faculty} {candidate.semester ? `· Sem ${candidate.semester}` : ''}
                            </p>
                          </div>
                        </div>

                        {/* Votes & Percentage Tally */}
                        <div className="sm:text-right shrink-0">
                          <p className="text-base font-bold text-navy-deep">
                            {candidate.votes} <span className="text-xs text-slate-text font-normal">votes</span>
                          </p>
                          <p className="text-xs font-semibold text-civic">
                            {candidate.percentage}% of votes
                          </p>
                        </div>
                      </div>

                      {/* Vote Progress Bar */}
                      <div className="w-full bg-slate-border/60 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            candidate.isWinner
                              ? 'bg-emerald-vote'
                              : candidate.isDisqualified
                              ? 'bg-error/40'
                              : 'bg-civic'
                          }`}
                          style={{ width: `${Math.max(1, candidate.percentage)}%` }}
                        />
                      </div>

                      {/* Candidate Intro & Manifesto Preview if available */}
                      {(candidate.intro || candidate.manifesto) && (
                        <div className="mt-2.5 pt-2 border-t border-slate-border/60 text-xs text-slate-text">
                          {candidate.intro && (
                            <p className="italic text-slate-700">"{candidate.intro}"</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
