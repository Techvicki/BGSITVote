import { useEffect, useState } from 'react';
import { computeTimerState, type TimerState } from '@/lib/electionTimer';
import { Clock, Infinity as InfinityIcon, AlertCircle, Play, Pause, Square } from 'lucide-react';

type Props = {
  status: string;
  opensAt: string;
  closesAt: string;
  variant?: 'banner' | 'card' | 'compact';
};

export default function LiveCountdownTimer({ status, opensAt, closesAt, variant = 'banner' }: Props) {
  const [timer, setTimer] = useState<TimerState>(() => computeTimerState(status, opensAt, closesAt));

  useEffect(() => {
    const update = () => setTimer(computeTimerState(status, opensAt, closesAt));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [status, opensAt, closesAt]);

  if (timer.isUnrestricted) {
    if (variant === 'compact') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-deep bg-emerald-bg border border-emerald-border px-2 py-0.5 rounded">
          <InfinityIcon className="w-3.5 h-3.5" /> No Time Limit
        </span>
      );
    }
    return (
      <div className="rounded-lg border border-emerald-border bg-emerald-bg/60 p-3.5 text-emerald-deep flex items-center justify-between gap-3 animate-fadeIn">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-emerald-vote text-white flex items-center justify-center shrink-0">
            <InfinityIcon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider">Unrestricted Voting Portal</p>
            <p className="text-xs text-emerald-deep/80 mt-0.5">
              No closing timer enforced. The portal remains open for student voting until manually closed by faculty.
            </p>
          </div>
        </div>
        <span className="badge badge-active shrink-0 text-xs py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-vote animate-pulseDot" /> Live Now
        </span>
      </div>
    );
  }

  if (timer.status === 'paused') {
    if (variant === 'compact') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-seal bg-amber-bg border border-amber-border px-2 py-0.5 rounded">
          <Pause className="w-3 h-3" /> Paused
        </span>
      );
    }
    return (
      <div className="rounded-lg border border-amber-border bg-amber-bg p-3.5 text-amber-seal flex items-center gap-2.5">
        <Pause className="w-5 h-5 shrink-0" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">Voting Paused by Faculty</p>
          <p className="text-xs mt-0.5 text-amber-seal/80">Ballot submissions are temporarily frozen.</p>
        </div>
      </div>
    );
  }

  if (timer.status === 'closed') {
    if (variant === 'compact') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-text bg-slate-wash border border-slate-border px-2 py-0.5 rounded">
          <Square className="w-3 h-3" /> Timer Expired
        </span>
      );
    }
    return (
      <div className="rounded-lg border border-slate-border bg-slate-wash p-3.5 text-slate-text flex items-center gap-2.5">
        <Square className="w-5 h-5 shrink-0 text-slate-muted" />
        <div>
          <p className="text-xs font-bold text-navy-deep uppercase tracking-wider">Voting Window Expired</p>
          <p className="text-xs text-slate-text mt-0.5">The deadline for this election has passed.</p>
        </div>
      </div>
    );
  }

  // Active or Upcoming Timer
  const isOpening = timer.status === 'upcoming';

  if (variant === 'compact') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border ${
        isOpening
          ? 'bg-amber-bg text-amber-academic border-amber-border'
          : 'bg-emerald-bg text-emerald-deep border-emerald-border'
      }`}>
        <Clock className="w-3.5 h-3.5" />
        <span>{isOpening ? 'Opens in: ' : 'Closes in: '}</span>
        <span className="font-mono">{timer.formatted}</span>
      </span>
    );
  }

  return (
    <div className={`rounded-xl border p-4 lg:p-5 animate-fadeIn ${
      isOpening
        ? 'border-amber-border bg-amber-50/50 text-navy-deep'
        : 'border-emerald-border bg-emerald-50/30 text-navy-deep shadow-xs'
    }`}>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            isOpening ? 'bg-amber-bg text-amber-academic' : 'bg-emerald-bg text-emerald-vote'
          }`}>
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${
                isOpening ? 'text-amber-academic' : 'text-emerald-deep'
              }`}>
                {isOpening ? 'Voting Portal Locked — Opens In' : 'Voting Portal Live — Closes In'}
              </span>
              {!isOpening && (
                <span className="w-2 h-2 rounded-full bg-emerald-vote animate-pulseDot" />
              )}
            </div>
            <p className="text-xs text-slate-text mt-0.5">
              {isOpening
                ? 'Ballot submissions will unlock automatically once this countdown reaches zero.'
                : 'Cast your ballot before the deadline. Votes submitted after zero are not accepted.'}
            </p>
          </div>
        </div>

        {/* Digital Clock Boxes */}
        <div className="flex items-center gap-2 shrink-0">
          <TimeBlock value={timer.days} unit="Days" />
          <span className="text-lg font-bold text-slate-muted">:</span>
          <TimeBlock value={timer.hours} unit="Hours" />
          <span className="text-lg font-bold text-slate-muted">:</span>
          <TimeBlock value={timer.minutes} unit="Mins" />
          <span className="text-lg font-bold text-slate-muted">:</span>
          <TimeBlock value={timer.seconds} unit="Secs" highlight />
        </div>
      </div>
    </div>
  );
}

function TimeBlock({ value, unit, highlight = false }: { value: number; unit: string; highlight?: boolean }) {
  return (
    <div className={`w-14 rounded-lg p-2 text-center border shadow-xs ${
      highlight
        ? 'bg-white border-civic/40 text-civic'
        : 'bg-white border-slate-border text-navy-deep'
    }`}>
      <p className="text-lg font-extrabold font-mono leading-none">
        {value.toString().padStart(2, '0')}
      </p>
      <p className="text-[9px] uppercase tracking-wider text-slate-muted font-semibold mt-1">
        {unit}
      </p>
    </div>
  );
}
