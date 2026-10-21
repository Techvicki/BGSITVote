export type TimerState = {
  isUnrestricted: boolean;
  status: 'upcoming' | 'open' | 'closed' | 'paused';
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
  label: string;
};

export const UNRESTRICTED_CLOSE_DATE = '2099-12-31T23:59:59.000Z';

export function isElectionUnrestricted(closesAt: string | null | undefined): boolean {
  if (!closesAt) return false;
  const d = new Date(closesAt);
  return d.getFullYear() >= 2050;
}

export function computeTimerState(
  electionStatus: string,
  opensAtStr: string,
  closesAtStr: string
): TimerState {
  const isUnrestricted = isElectionUnrestricted(closesAtStr);
  const now = new Date().getTime();
  const opensAt = new Date(opensAtStr).getTime();
  const closesAt = new Date(closesAtStr).getTime();

  if (electionStatus === 'paused') {
    return {
      isUnrestricted,
      status: 'paused',
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      formatted: 'Paused',
      label: 'Voting is temporarily paused by election authority',
    };
  }

  if (electionStatus === 'closed' || electionStatus === 'results_published') {
    return {
      isUnrestricted,
      status: 'closed',
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      formatted: 'Closed',
      label: 'Voting has officially concluded',
    };
  }

  if (isUnrestricted) {
    return {
      isUnrestricted: true,
      status: electionStatus === 'active' ? 'open' : 'upcoming',
      days: 999,
      hours: 0,
      minutes: 0,
      seconds: 0,
      formatted: 'Unrestricted',
      label: electionStatus === 'active' ? 'Voting is Live (No Time Restriction)' : 'Unrestricted Voting Window',
    };
  }

  if (now < opensAt) {
    const diff = Math.max(0, opensAt - now);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return {
      isUnrestricted: false,
      status: 'upcoming',
      days,
      hours,
      minutes,
      seconds,
      formatted: `${days > 0 ? `${days}d ` : ''}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      label: 'Voting opens in',
    };
  }

  if (now < closesAt) {
    const diff = Math.max(0, closesAt - now);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return {
      isUnrestricted: false,
      status: 'open',
      days,
      hours,
      minutes,
      seconds,
      formatted: `${days > 0 ? `${days}d ` : ''}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`,
      label: 'Voting closes in',
    };
  }

  return {
    isUnrestricted: false,
    status: 'closed',
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    formatted: 'Closed',
    label: 'Voting timer expired',
  };
}
