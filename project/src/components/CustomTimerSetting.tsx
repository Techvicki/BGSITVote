import React, { useState, useEffect } from 'react';
import {
  Timer, Clock3, Calendar, Play, Infinity as InfinityIcon,
  AlertCircle, CheckCircle2, ArrowRight, Hourglass, Plus, Minus, Sparkles
} from 'lucide-react';
import { UNRESTRICTED_CLOSE_DATE, isElectionUnrestricted } from '@/lib/electionTimer';

export type CustomTimerValues = {
  isUnrestricted: boolean;
  opensAt: string; // ISO string
  closesAt: string; // ISO string
};

type Props = {
  initialOpensAt?: string;
  initialClosesAt?: string;
  initialUnrestricted?: boolean;
  onChange?: (values: CustomTimerValues) => void;
  onSave?: (values: CustomTimerValues) => Promise<void> | void;
  saving?: boolean;
  saveButtonText?: string;
};

// Helper: format Date to input datetime-local value (YYYY-MM-DDTHH:mm)
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Helper: parse datetime-local string to Date
function fromDatetimeLocal(val: string): Date {
  if (!val) return new Date();
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default function CustomTimerSetting({
  initialOpensAt,
  initialClosesAt,
  initialUnrestricted,
  onChange,
  onSave,
  saving = false,
  saveButtonText = 'Save Custom Timer Schedule',
}: Props) {
  const isInitiallyUnrestricted = initialUnrestricted ?? isElectionUnrestricted(initialClosesAt);

  const [mode, setMode] = useState<'custom' | 'unrestricted'>(
    isInitiallyUnrestricted ? 'unrestricted' : 'custom'
  );

  // Start timer method: 'now' (immediately), 'delay' (in X days/hours/mins), 'datetime' (exact calendar)
  const [startMethod, setStartMethod] = useState<'now' | 'delay' | 'datetime'>('now');
  const [startDelayDays, setStartDelayDays] = useState(0);
  const [startDelayHours, setStartDelayHours] = useState(0);
  const [startDelayMinutes, setStartDelayMinutes] = useState(15);
  const [startDatetime, setStartDatetime] = useState<string>(() => {
    if (initialOpensAt) {
      return toDatetimeLocal(new Date(initialOpensAt));
    }
    return toDatetimeLocal(new Date());
  });

  // End timer method: 'duration' (runs for X days/hours/mins), 'datetime' (exact calendar)
  const [endMethod, setEndMethod] = useState<'duration' | 'datetime'>('duration');
  const [durationDays, setDurationDays] = useState(1);
  const [durationHours, setDurationHours] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [endDatetime, setEndDatetime] = useState<string>(() => {
    if (initialClosesAt && !isElectionUnrestricted(initialClosesAt)) {
      return toDatetimeLocal(new Date(initialClosesAt));
    }
    const defaultEnd = new Date(Date.now() + 86400000 * 2); // 2 days
    return toDatetimeLocal(defaultEnd);
  });

  // Computed Date objects
  const [computedOpens, setComputedOpens] = useState<Date>(() => new Date());
  const [computedCloses, setComputedCloses] = useState<Date>(() => new Date(Date.now() + 86400000));

  // Sync initial props if they change
  useEffect(() => {
    const unrest = initialUnrestricted ?? isElectionUnrestricted(initialClosesAt);
    setMode(unrest ? 'unrestricted' : 'custom');

    if (initialOpensAt) {
      const openDate = new Date(initialOpensAt);
      setStartDatetime(toDatetimeLocal(openDate));
      if (openDate.getTime() <= Date.now() + 60000) {
        setStartMethod('now');
      } else {
        setStartMethod('datetime');
      }
    }

    if (initialClosesAt && !unrest) {
      setEndDatetime(toDatetimeLocal(new Date(initialClosesAt)));
      setEndMethod('datetime');
    }
  }, [initialOpensAt, initialClosesAt, initialUnrestricted]);

  // Recompute dates whenever inputs change
  useEffect(() => {
    let opens = new Date();

    if (startMethod === 'now') {
      opens = new Date(Date.now() - 30000); // 30s in the past so it is active immediately
    } else if (startMethod === 'delay') {
      const delayMs = (startDelayDays * 86400 + startDelayHours * 3600 + startDelayMinutes * 60) * 1000;
      opens = new Date(Date.now() + delayMs);
    } else {
      opens = fromDatetimeLocal(startDatetime);
    }

    let closes: Date;
    if (mode === 'unrestricted') {
      closes = new Date(UNRESTRICTED_CLOSE_DATE);
    } else if (endMethod === 'duration') {
      const durMs = (durationDays * 86400 + durationHours * 3600 + durationMinutes * 60) * 1000;
      closes = new Date(opens.getTime() + Math.max(60000, durMs));
    } else {
      closes = fromDatetimeLocal(endDatetime);
    }

    setComputedOpens(opens);
    setComputedCloses(closes);

    if (onChange) {
      onChange({
        isUnrestricted: mode === 'unrestricted',
        opensAt: opens.toISOString(),
        closesAt: closes.toISOString(),
      });
    }
  }, [
    mode, startMethod, startDelayDays, startDelayHours, startDelayMinutes, startDatetime,
    endMethod, durationDays, durationHours, durationMinutes, endDatetime
  ]);

  const isValidSchedule = mode === 'unrestricted' || computedCloses.getTime() > computedOpens.getTime();

  function formatDisplayDate(d: Date): string {
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  function handleSaveClick() {
    if (!isValidSchedule) return;
    if (onSave) {
      onSave({
        isUnrestricted: mode === 'unrestricted',
        opensAt: computedOpens.toISOString(),
        closesAt: computedCloses.toISOString(),
      });
    }
  }

  // Quick preset helper for custom duration
  function applyDurationPreset(d: number, h: number, m: number) {
    setEndMethod('duration');
    setDurationDays(d);
    setDurationHours(h);
    setDurationMinutes(m);
  }

  // Quick preset helper for custom start delay
  function applyStartDelayPreset(d: number, h: number, m: number) {
    setStartMethod('delay');
    setStartDelayDays(d);
    setStartDelayHours(h);
    setStartDelayMinutes(m);
  }

  return (
    <div className="card border-2 border-civic/20 p-5 lg:p-6 bg-white shadow-tier1">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-civic text-white flex items-center justify-center shadow-xs">
            <Timer className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-navy-deep">Custom Voting Timer Settings</h3>
            <p className="text-xs text-slate-text mt-0.5">
              Customize exact starting and ending times or countdown durations without presets.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-slate-canvas rounded-lg border border-slate-border">
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === 'custom'
                ? 'bg-civic text-white shadow-xs'
                : 'text-slate-text hover:text-navy-deep'
            }`}
          >
            Custom Timer
          </button>
          <button
            type="button"
            onClick={() => setMode('unrestricted')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              mode === 'unrestricted'
                ? 'bg-emerald-vote text-white shadow-xs'
                : 'text-slate-text hover:text-navy-deep'
            }`}
          >
            No Time Limit
          </button>
        </div>
      </div>

      {mode === 'unrestricted' ? (
        <div className="rounded-xl border border-emerald-border bg-emerald-bg/60 p-5 text-emerald-deep animate-fadeIn mb-6">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-vote text-white flex items-center justify-center shrink-0 shadow-xs">
              <InfinityIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold">Unrestricted Voting Portal (No End Timer)</p>
              <p className="text-xs text-emerald-deep/85 mt-1 leading-relaxed">
                The voting portal will open according to the start time and will stay open indefinitely.
                No closing deadline will be enforced. Students can cast votes at any time until faculty manually pauses or closes the election.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold">
                <span className="badge badge-active text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-vote animate-pulseDot" /> Live Indefinitely
                </span>
                <span>Opens: {formatDisplayDate(computedOpens)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Grid: 1. Starting Timer & 2. Ending Timer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 1. STARTING TIMER SETTING */}
            <div className="rounded-xl border border-slate-border bg-slate-canvas/60 p-4 lg:p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-civic text-white text-[11px] font-bold flex items-center justify-center">1</span>
                    <h4 className="text-sm font-bold text-navy-deep">Custom Starting Timer</h4>
                  </div>
                  <span className="text-[11px] text-slate-text font-medium">When portal opens</span>
                </div>

                {/* Sub-method tabs */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-white rounded-lg border border-slate-border mb-4 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setStartMethod('now')}
                    className={`py-1.5 px-2 rounded text-center transition-all ${
                      startMethod === 'now' ? 'bg-civic-wash text-civic font-bold shadow-xs' : 'text-slate-text hover:text-navy-deep'
                    }`}
                  >
                    ⚡ Start Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setStartMethod('delay')}
                    className={`py-1.5 px-2 rounded text-center transition-all ${
                      startMethod === 'delay' ? 'bg-civic-wash text-civic font-bold shadow-xs' : 'text-slate-text hover:text-navy-deep'
                    }`}
                  >
                    ⏳ Delay Timer
                  </button>
                  <button
                    type="button"
                    onClick={() => setStartMethod('datetime')}
                    className={`py-1.5 px-2 rounded text-center transition-all ${
                      startMethod === 'datetime' ? 'bg-civic-wash text-civic font-bold shadow-xs' : 'text-slate-text hover:text-navy-deep'
                    }`}
                  >
                    📅 Exact Date
                  </button>
                </div>

                {/* Method Content */}
                {startMethod === 'now' && (
                  <div className="p-3.5 rounded-lg bg-emerald-bg border border-emerald-border text-emerald-deep text-xs animate-fadeIn">
                    <p className="font-semibold flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5 text-emerald-vote" /> Opens Immediately
                    </p>
                    <p className="mt-1 text-emerald-deep/80">
                      Voting portal opens right now. Students can immediately begin casting ballots once the election is saved.
                    </p>
                  </div>
                )}

                {startMethod === 'delay' && (
                  <div className="space-y-3 animate-fadeIn">
                    <p className="text-xs text-slate-text">Portal will unlock after this countdown:</p>
                    <div className="grid grid-cols-3 gap-2">
                      <CustomNumberInput
                        label="Days"
                        value={startDelayDays}
                        min={0}
                        max={365}
                        onChange={setStartDelayDays}
                      />
                      <CustomNumberInput
                        label="Hours"
                        value={startDelayHours}
                        min={0}
                        max={23}
                        onChange={setStartDelayHours}
                      />
                      <CustomNumberInput
                        label="Minutes"
                        value={startDelayMinutes}
                        min={0}
                        max={59}
                        onChange={setStartDelayMinutes}
                      />
                    </div>

                    {/* Quick Delay Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-text">
                      <span className="font-medium text-slate-muted">Suggestions:</span>
                      <button
                        type="button"
                        onClick={() => applyStartDelayPreset(0, 0, 15)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-border hover:border-civic hover:text-civic"
                      >
                        15 mins
                      </button>
                      <button
                        type="button"
                        onClick={() => applyStartDelayPreset(0, 1, 0)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-border hover:border-civic hover:text-civic"
                      >
                        1 hr
                      </button>
                      <button
                        type="button"
                        onClick={() => applyStartDelayPreset(1, 0, 0)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-border hover:border-civic hover:text-civic"
                      >
                        Tomorrow
                      </button>
                    </div>
                  </div>
                )}

                {startMethod === 'datetime' && (
                  <div className="space-y-2 animate-fadeIn">
                    <label className="text-xs font-semibold text-navy-deep block">Select Exact Date & Time:</label>
                    <input
                      type="datetime-local"
                      value={startDatetime}
                      onChange={(e) => setStartDatetime(e.target.value)}
                      className="input-field bg-white text-xs py-2"
                    />
                    <p className="text-[11px] text-slate-text">Students will see a countdown timer until this moment.</p>
                  </div>
                )}
              </div>

              {/* Opening preview pill */}
              <div className="mt-4 pt-3 border-t border-slate-border text-xs text-slate-text flex items-center justify-between">
                <span className="font-medium text-navy-deep">Opens on:</span>
                <span className="font-semibold text-civic">{formatDisplayDate(computedOpens)}</span>
              </div>
            </div>

            {/* 2. ENDING TIMER SETTING */}
            <div className="rounded-xl border border-slate-border bg-slate-canvas/60 p-4 lg:p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-civic text-white text-[11px] font-bold flex items-center justify-center">2</span>
                    <h4 className="text-sm font-bold text-navy-deep">Custom Ending Timer</h4>
                  </div>
                  <span className="text-[11px] text-slate-text font-medium">When portal closes</span>
                </div>

                {/* Sub-method tabs */}
                <div className="grid grid-cols-2 gap-1 p-1 bg-white rounded-lg border border-slate-border mb-4 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setEndMethod('duration')}
                    className={`py-1.5 px-2 rounded text-center transition-all ${
                      endMethod === 'duration' ? 'bg-civic-wash text-civic font-bold shadow-xs' : 'text-slate-text hover:text-navy-deep'
                    }`}
                  >
                    ⏱️ Custom Duration
                  </button>
                  <button
                    type="button"
                    onClick={() => setEndMethod('datetime')}
                    className={`py-1.5 px-2 rounded text-center transition-all ${
                      endMethod === 'datetime' ? 'bg-civic-wash text-civic font-bold shadow-xs' : 'text-slate-text hover:text-navy-deep'
                    }`}
                  >
                    📅 Exact Date
                  </button>
                </div>

                {/* Method Content */}
                {endMethod === 'duration' && (
                  <div className="space-y-3 animate-fadeIn">
                    <p className="text-xs text-slate-text">Voting portal will stay open for:</p>
                    <div className="grid grid-cols-3 gap-2">
                      <CustomNumberInput
                        label="Days"
                        value={durationDays}
                        min={0}
                        max={365}
                        onChange={setDurationDays}
                      />
                      <CustomNumberInput
                        label="Hours"
                        value={durationHours}
                        min={0}
                        max={23}
                        onChange={setDurationHours}
                      />
                      <CustomNumberInput
                        label="Minutes"
                        value={durationMinutes}
                        min={0}
                        max={59}
                        onChange={setDurationMinutes}
                      />
                    </div>

                    {/* Quick Duration Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-text">
                      <span className="font-medium text-slate-muted">Suggestions:</span>
                      <button
                        type="button"
                        onClick={() => applyDurationPreset(0, 1, 0)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-border hover:border-civic hover:text-civic"
                      >
                        1 hour
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDurationPreset(0, 3, 0)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-border hover:border-civic hover:text-civic"
                      >
                        3 hours
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDurationPreset(1, 0, 0)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-border hover:border-civic hover:text-civic"
                      >
                        24 hours
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDurationPreset(3, 0, 0)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-border hover:border-civic hover:text-civic"
                      >
                        3 days
                      </button>
                      <button
                        type="button"
                        onClick={() => applyDurationPreset(7, 0, 0)}
                        className="px-2 py-0.5 rounded bg-white border border-slate-border hover:border-civic hover:text-civic"
                      >
                        7 days
                      </button>
                    </div>
                  </div>
                )}

                {endMethod === 'datetime' && (
                  <div className="space-y-2 animate-fadeIn">
                    <label className="text-xs font-semibold text-navy-deep block">Select Exact Closing Date & Time:</label>
                    <input
                      type="datetime-local"
                      value={endDatetime}
                      onChange={(e) => setEndDatetime(e.target.value)}
                      className="input-field bg-white text-xs py-2"
                    />
                    <p className="text-[11px] text-slate-text">Voting will automatically conclude at this timestamp.</p>
                  </div>
                )}
              </div>

              {/* Closing preview pill */}
              <div className="mt-4 pt-3 border-t border-slate-border text-xs text-slate-text flex items-center justify-between">
                <span className="font-medium text-navy-deep">Closes on:</span>
                <span className="font-semibold text-amber-academic">{formatDisplayDate(computedCloses)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validation Warning */}
      {!isValidSchedule && (
        <div className="mt-4 p-3 rounded-lg bg-error-bg border border-error/20 text-error-deep text-xs flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>The closing time must be strictly after the opening time. Please adjust the duration or dates.</span>
        </div>
      )}

      {/* Live Calculated Timeline & Preview */}
      <div className="mt-5 p-4 rounded-xl border border-slate-border bg-slate-canvas">
        <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-navy-deep">
          <Sparkles className="w-3.5 h-3.5 text-civic" />
          <span>Calculated Voting Window Timeline</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-0.5">
            <p className="text-[10px] uppercase font-bold text-slate-text">Opens At</p>
            <p className="font-bold text-navy-deep">{formatDisplayDate(computedOpens)}</p>
          </div>

          <div className="flex items-center gap-2 text-civic font-bold px-3 py-1.5 rounded-lg bg-white border border-slate-border self-start sm:self-center">
            <Clock3 className="w-4 h-4" />
            <span>
              {mode === 'unrestricted'
                ? 'No End Deadline (Unrestricted)'
                : `${Math.round((computedCloses.getTime() - computedOpens.getTime()) / (1000 * 60))} total minutes`}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-muted" />
          </div>

          <div className="space-y-0.5 sm:text-right">
            <p className="text-[10px] uppercase font-bold text-slate-text">Closes At</p>
            <p className="font-bold text-navy-deep">
              {mode === 'unrestricted' ? 'Indefinite (No Expiration)' : formatDisplayDate(computedCloses)}
            </p>
          </div>
        </div>
      </div>

      {/* Save Button if onSave provided */}
      {onSave && (
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={saving || !isValidSchedule}
            className="btn-civic inline-flex items-center gap-2 text-sm disabled:opacity-50 shadow-xs"
          >
            <Calendar className="w-4 h-4" />
            {saving ? 'Updating timer...' : saveButtonText}
          </button>
        </div>
      )}
    </div>
  );
}

// Subcomponent: Custom Number Stepper Input
function CustomNumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));

  return (
    <div className="rounded-lg border border-slate-border bg-white p-2 text-center shadow-2xs">
      <p className="text-[10px] uppercase font-bold text-slate-text mb-1">{label}</p>
      <div className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={dec}
          disabled={value <= min}
          className="w-6 h-6 rounded bg-slate-canvas hover:bg-slate-wash text-navy-deep font-bold flex items-center justify-center disabled:opacity-30 transition-colors"
        >
          <Minus className="w-3 h-3" />
        </button>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10);
            if (!isNaN(parsed)) {
              onChange(Math.min(max, Math.max(min, parsed)));
            } else {
              onChange(min);
            }
          }}
          className="w-12 text-center font-mono font-bold text-sm text-navy-deep focus:outline-none focus:ring-1 focus:ring-civic rounded"
        />
        <button
          type="button"
          onClick={inc}
          disabled={value >= max}
          className="w-6 h-6 rounded bg-slate-canvas hover:bg-slate-wash text-navy-deep font-bold flex items-center justify-center disabled:opacity-30 transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
