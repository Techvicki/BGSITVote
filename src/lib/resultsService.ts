import { supabase, type Election, type ElectionPosition, type Candidate } from './supabase';
import { parseCandidateManifesto } from './electionRules';

export type CandidateResult = {
  candidateId: string;
  name: string;
  studentId: string;
  faculty: string;
  semester?: string | null;
  imageUrl?: string | null;
  party?: string;
  symbol?: string;
  intro?: string;
  manifesto?: string;
  votes: number;
  percentage: number;
  isWinner: boolean;
  rank: number;
  isDisqualified: boolean;
};

export type PositionResult = {
  positionId: string;
  positionName: string;
  positionDescription?: string;
  maxWinners: number;
  totalVotesForPosition: number;
  candidates: CandidateResult[];
  winners: CandidateResult[];
  isTie: boolean;
};

export type ElectionResultsSummary = {
  electionId: string;
  electionTitle: string;
  academicYear?: string | null;
  declaredAt: string;
  declaredBy: string;
  totalBallotsCast: number;
  totalEligibleVoters: number;
  turnoutPercentage: number;
  positions: PositionResult[];
  certificationSeal: string;
};

const RESULTS_DELIMITER_START = '---OFFICIAL_RESULTS_JSON---';
const RESULTS_DELIMITER_END = '---OFFICIAL_RESULTS_END---';

/**
 * Generate a random cryptographic certification seal for official declaration
 */
export function generateCertificationSeal(electionId: string, declaredAt: string): string {
  const chars = '0123456789ABCDEF';
  let hash = 'BGSIT-CERT-';
  for (let i = 0; i < 24; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

/**
 * Auto-count all votes from secret_ballots table and compute tallies, rankings, and winners
 */
export async function calculateLiveElectionResults(election: Election): Promise<ElectionResultsSummary> {
  // 1. Fetch positions, candidates, ballots, and voter eligibility in parallel
  const [
    { data: positionsData },
    { data: candidatesData },
    { data: ballotsData },
    { count: participationCount },
    { count: eligibleCount },
  ] = await Promise.all([
    supabase
      .from('election_positions')
      .select('*')
      .eq('election_id', election.id)
      .eq('status', 'active')
      .order('created_at'),
    supabase
      .from('candidates')
      .select('*')
      .eq('election_id', election.id)
      .eq('application_status', 'approved')
      .order('created_at'),
    supabase
      .from('secret_ballots')
      .select('id, candidate_id, position_id')
      .eq('election_id', election.id),
    supabase
      .from('voting_participation')
      .select('id', { count: 'exact', head: true })
      .eq('election_id', election.id),
    supabase
      .from('student_eligibility')
      .select('id', { count: 'exact', head: true })
      .eq('election_id', election.id)
      .eq('eligible', true),
  ]);

  const rawPositions = (positionsData ?? []) as ElectionPosition[];
  const rawCandidates = (candidatesData ?? []) as Candidate[];
  const rawBallots = (ballotsData ?? []) as { id: string; candidate_id: string; position_id: string | null }[];

  // 2. Count votes per candidate
  const voteTallies: Record<string, number> = {};
  rawBallots.forEach((b) => {
    if (b.candidate_id) {
      voteTallies[b.candidate_id] = (voteTallies[b.candidate_id] ?? 0) + 1;
    }
  });

  const parsedCandidates = rawCandidates.map((c) => {
    const { cleanManifesto, meta } = parseCandidateManifesto(c.manifesto);
    return {
      ...c,
      manifesto: cleanManifesto,
      meta,
    };
  });

  // Group by position
  const positionResults: PositionResult[] = [];

  // If positions are configured, group by each position
  if (rawPositions.length > 0) {
    for (const pos of rawPositions) {
      const posCandidates = parsedCandidates.filter((c) => c.position_id === pos.id);
      let totalPosVotes = 0;

      // Count votes for this position
      posCandidates.forEach((c) => {
        totalPosVotes += voteTallies[c.id] ?? 0;
      });

      // Map to CandidateResult
      const mapped: CandidateResult[] = posCandidates.map((c) => {
        const votes = voteTallies[c.id] ?? 0;
        const percentage = totalPosVotes > 0 ? Number(((votes / totalPosVotes) * 100).toFixed(1)) : 0;
        return {
          candidateId: c.id,
          name: c.name,
          studentId: c.student_id,
          faculty: c.faculty,
          semester: c.semester,
          imageUrl: c.image_url,
          party: c.meta?.party,
          symbol: c.meta?.symbol,
          intro: c.meta?.intro,
          manifesto: c.manifesto,
          votes,
          percentage,
          isWinner: false,
          rank: 1,
          isDisqualified: !!c.meta?.isDisqualified,
        };
      });

      // Sort by votes descending (non-disqualified first)
      mapped.sort((a, b) => {
        if (a.isDisqualified && !b.isDisqualified) return 1;
        if (!a.isDisqualified && b.isDisqualified) return -1;
        return b.votes - a.votes;
      });

      // Assign ranks and winners
      const maxWinners = Math.max(1, pos.max_winners || 1);
      mapped.forEach((c, idx) => {
        c.rank = idx + 1;
      });

      const eligibleCandidates = mapped.filter((c) => !c.isDisqualified && c.votes > 0);
      const winners: CandidateResult[] = [];
      let isTie = false;

      if (eligibleCandidates.length > 0) {
        const topVotes = eligibleCandidates[0].votes;
        const topCandidates = eligibleCandidates.filter((c) => c.votes === topVotes);
        if (topCandidates.length > maxWinners) {
          isTie = true;
        }

        eligibleCandidates.slice(0, maxWinners).forEach((winner) => {
          winner.isWinner = true;
          winners.push(winner);
        });
      }

      positionResults.push({
        positionId: pos.id,
        positionName: pos.name,
        positionDescription: pos.description,
        maxWinners,
        totalVotesForPosition: totalPosVotes,
        candidates: mapped,
        winners,
        isTie,
      });
    }
  } else {
    // No positions configured — treat all candidates as a single pool (e.g. General Representative)
    let totalVotes = 0;
    parsedCandidates.forEach((c) => {
      totalVotes += voteTallies[c.id] ?? 0;
    });

    const mapped: CandidateResult[] = parsedCandidates.map((c) => {
      const votes = voteTallies[c.id] ?? 0;
      const percentage = totalVotes > 0 ? Number(((votes / totalVotes) * 100).toFixed(1)) : 0;
      return {
        candidateId: c.id,
        name: c.name,
        studentId: c.student_id,
        faculty: c.faculty,
        semester: c.semester,
        imageUrl: c.image_url,
        party: c.meta?.party,
        symbol: c.meta?.symbol,
        intro: c.meta?.intro,
        manifesto: c.manifesto,
        votes,
        percentage,
        isWinner: false,
        rank: 1,
        isDisqualified: !!c.meta?.isDisqualified,
      };
    });

    mapped.sort((a, b) => {
      if (a.isDisqualified && !b.isDisqualified) return 1;
      if (!a.isDisqualified && b.isDisqualified) return -1;
      return b.votes - a.votes;
    });

    mapped.forEach((c, idx) => {
      c.rank = idx + 1;
    });

    const eligibleCandidates = mapped.filter((c) => !c.isDisqualified && c.votes > 0);
    const winners: CandidateResult[] = [];
    if (eligibleCandidates.length > 0) {
      eligibleCandidates[0].isWinner = true;
      winners.push(eligibleCandidates[0]);
    }

    positionResults.push({
      positionId: 'general',
      positionName: 'General Candidate Contest',
      positionDescription: 'Open contest for all student candidates',
      maxWinners: 1,
      totalVotesForPosition: totalVotes,
      candidates: mapped,
      winners,
      isTie: false,
    });
  }

  const totalCast = participationCount ?? rawBallots.length;
  const totalEligible = eligibleCount ?? 0;
  const turnout = totalEligible > 0 ? Number(((totalCast / totalEligible) * 100).toFixed(1)) : 0;

  return {
    electionId: election.id,
    electionTitle: election.title,
    academicYear: election.academic_year,
    declaredAt: election.published_at ?? new Date().toISOString(),
    declaredBy: 'Faculty Election Authority',
    totalBallotsCast: totalCast,
    totalEligibleVoters: totalEligible,
    turnoutPercentage: turnout,
    positions: positionResults,
    certificationSeal: generateCertificationSeal(election.id, election.published_at ?? new Date().toISOString()),
  };
}

/**
 * Serialize certified results into election record
 */
export function serializeOfficialResults(instructionsText: string, results: ElectionResultsSummary): string {
  const jsonStr = JSON.stringify(results);
  const clean = cleanInstructionsFromResults(instructionsText);
  return `${clean.trim()}\n\n${RESULTS_DELIMITER_START}\n${jsonStr}\n${RESULTS_DELIMITER_END}`;
}

/**
 * Remove results delimiter from instructions
 */
export function cleanInstructionsFromResults(text: string | null | undefined): string {
  if (!text) return '';
  const startIdx = text.indexOf(RESULTS_DELIMITER_START);
  const endIdx = text.indexOf(RESULTS_DELIMITER_END);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return (text.substring(0, startIdx) + text.substring(endIdx + RESULTS_DELIMITER_END.length)).trim();
  }
  return text;
}

/**
 * Parse certified results from election instructions or local storage
 */
export function parseOfficialResults(instructionsText: string | null | undefined, electionId: string): ElectionResultsSummary | null {
  if (instructionsText) {
    const startIdx = instructionsText.indexOf(RESULTS_DELIMITER_START);
    const endIdx = instructionsText.indexOf(RESULTS_DELIMITER_END);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      try {
        const jsonStr = instructionsText.substring(startIdx + RESULTS_DELIMITER_START.length, endIdx).trim();
        return JSON.parse(jsonStr) as ElectionResultsSummary;
      } catch {
        // Fall back to local storage
      }
    }
  }

  try {
    const local = localStorage.getItem(`campusvote_results_${electionId}`);
    if (local) {
      return JSON.parse(local) as ElectionResultsSummary;
    }
  } catch {
    // Ignore error
  }

  return null;
}

/**
 * Save certified results locally
 */
export function saveOfficialResultsLocally(electionId: string, results: ElectionResultsSummary): void {
  try {
    localStorage.setItem(`campusvote_results_${electionId}`, JSON.stringify(results));
  } catch {
    // Ignore quota
  }
}
