import { useMemo } from 'react';
import clsx from 'clsx';
import { useApp } from '../../contexts/useApp';
import { useSettings } from '../../contexts/useSettings';
import {
  DEFAULT_RISK_THRESHOLD, MAX_RISK_THRESHOLD, MIN_RISK_THRESHOLD, SENSITIVITY_PRESETS, presetFor,
} from '../../utils/sensitivity';

// The slider runs Relaxed (left) -> Strict (right). Stricter means a LOWER score
// is enough to flag, so the slider position is the threshold mirrored.
const toSlider = (threshold: number) => MIN_RISK_THRESHOLD + MAX_RISK_THRESHOLD - threshold;
const fromSlider = (position: number) => MIN_RISK_THRESHOLD + MAX_RISK_THRESHOLD - position;

export default function RiskSensitivity({ panel, sectionHead }: { panel: string; sectionHead: string }) {
  const { riskFlagThreshold, setRiskFlagThreshold } = useSettings();
  const { flaggedEmails, releasedEmails, sensitivityStatus } = useApp();

  // Every synced email with its score. Emails an analyst already reviewed keep
  // their decision, whatever the sensitivity.
  const emails = useMemo(() => [
    ...flaggedEmails.map(email => ({ id: email.id, score: email.riskScore, reviewed: email.review?.disposition })),
    ...releasedEmails.map(item => ({ id: item.originalEmail.id, score: item.originalEmail.riskScore, reviewed: item.originalEmail.review?.disposition })),
  ], [flaggedEmails, releasedEmails]);
  const wouldFlag = (email: (typeof emails)[number]) => (email.reviewed ? email.reviewed === 'flagged' : email.score >= riskFlagThreshold);
  const flaggedCount = emails.filter(wouldFlag).length;

  const preset = presetFor(riskFlagThreshold);
  const status = {
    idle: '',
    applying: 'Applying to your synced emails…',
    applied: 'Applied to your synced emails.',
    error: 'Couldn’t apply right now. It will apply on the next sync.',
  }[sensitivityStatus];

  return (
    <div className={panel}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={sectionHead}>Risk Sensitivity</h2>
        {status && (
          <span role="status" className={clsx('text-[11px]', sensitivityStatus === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-[var(--dm-text-muted)]')}>
            {status}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-4 dark:text-[var(--dm-text-muted)]">
        Every email gets a risk score from 0 to 100. Choose how high it must be before IronInbox flags it.
      </p>

      <div role="group" aria-label="Sensitivity presets" className="grid grid-cols-3 gap-2 mb-4">
        {SENSITIVITY_PRESETS.map(option => {
          const active = option.threshold === riskFlagThreshold;
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={active}
              onClick={() => setRiskFlagThreshold(option.threshold)}
              className={clsx(
                'rounded-lg border px-3 py-2 text-left transition-colors',
                active
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-[var(--dm-border)] dark:bg-[var(--dm-chrome)] dark:text-[var(--dm-text-secondary)]'
              )}
            >
              <span className="block text-sm font-semibold">
                {option.label}
                {option.threshold === DEFAULT_RISK_THRESHOLD && <span className={clsx('ml-1.5 text-[10px] font-medium', active ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400')}>Recommended</span>}
              </span>
              <span className={clsx('block text-[11px] font-mono', active ? 'text-blue-100' : 'text-slate-400 dark:text-[var(--dm-text-muted)]')}>score ≥ {option.threshold}</span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-[var(--dm-text-muted)] mb-2">
        <span>Relaxed · flags less</span>
        <span>Strict · flags more</span>
      </div>
      <input
        type="range"
        min={MIN_RISK_THRESHOLD}
        max={MAX_RISK_THRESHOLD}
        value={toSlider(riskFlagThreshold)}
        onChange={(e) => setRiskFlagThreshold(fromSlider(Number(e.target.value)))}
        aria-label="Risk sensitivity"
        aria-valuetext={`Flag emails scoring ${riskFlagThreshold} or more`}
        className="w-full h-2 rounded-lg appearance-none bg-slate-200 dark:bg-[var(--dm-chrome)] accent-blue-600"
      />

      {/* Where the synced emails sit relative to the cut-off */}
      {emails.length > 0 && (
        <div className="mt-4" aria-hidden>
          <div className="relative h-6 rounded-md bg-slate-100 dark:bg-[var(--dm-chrome)]">
            <div className="absolute inset-y-0 right-0 rounded-r-md bg-red-500/10" style={{ left: `${riskFlagThreshold}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-blue-600" style={{ left: `${riskFlagThreshold}%` }} />
            {emails.map(email => (
              <span
                key={email.id}
                className={clsx('absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-[var(--dm-surface-card)]',
                  wouldFlag(email) ? 'bg-red-500' : 'bg-emerald-500')}
                style={{ left: `${Math.min(99, Math.max(1, email.score))}%` }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] font-mono text-slate-400 dark:text-[var(--dm-text-muted)]">
            <span>score 0</span><span>50</span><span>100</span>
          </div>
        </div>
      )}

      <p className="mt-3 text-sm font-medium text-slate-800 dark:text-[var(--dm-text-primary)]">
        Flag emails scoring at least{' '}
        <span className="font-mono tabular-nums text-blue-600 dark:text-blue-400">{riskFlagThreshold}</span>
        {preset && <span className="text-slate-500 dark:text-[var(--dm-text-muted)]"> · {preset.label}</span>}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-[var(--dm-text-muted)]">
        {emails.length > 0
          ? `This setting flags ${flaggedCount} of your ${emails.length} synced emails. Emails you already reviewed keep your decision.`
          : 'Connect and sync a mailbox to see how this setting affects your emails.'}
        {preset ? ` ${preset.description}` : ''}
      </p>
    </div>
  );
}
