import React from 'react';
import Header from '../components/layout/Header';
import { RiSunLine, RiMoonLine } from 'react-icons/ri';
import { useTheme } from '../contexts/useTheme';
import { useRole } from '../utils/useRole';
import { setDevRole } from '../utils/devRoleHelper';
import type { UserRole } from '../types/roles';
import EngagementLog from '../components/dashboard/EngagementLog';
import { useEngagementTracker } from '../utils/useEngagementTracker';
import { useSettings } from '../contexts/useSettings';
import RiskSensitivity from '../components/settings/RiskSensitivity';

const ROLE_OPTIONS: { value: UserRole; label: string; blurb: string }[] = [
  { value: 'viewer',  label: 'Viewer',  blurb: 'Dashboard only; sensitive areas hidden.' },
  { value: 'manager', label: 'Manager', blurb: 'Inbox, Flagged Emails, Keyword Monitoring.' },
  { value: 'admin',   label: 'Admin',   blurb: 'Full access including Engagement Log on the dashboard.' },
];

const Settings: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { role, permissions } = useRole();
  const {
    alertBehavior,
    updateAlertBehavior,
  } = useSettings();

  useEngagementTracker('settings');

  const panel = 'bg-white border border-slate-200 rounded-xl p-5 dark:bg-[var(--dm-surface-card)] dark:border-[var(--dm-border)]';
  const sectionHead = 'text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-primary)] mb-1';

  return (
    <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[var(--dm-bg-page)]">
      <Header title="Settings" />

      <div className="w-full max-w-7xl mx-auto p-6 space-y-4">

        {/* Appearance */}
        <div className={panel}>
          <h2 className={sectionHead}>Appearance</h2>
          <p className="text-xs text-slate-400 mb-4 dark:text-[var(--dm-text-muted)]">Switch between light and dark interface.</p>
          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === 'dark'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                       border-slate-200 bg-white text-slate-700 hover:bg-slate-50
                       dark:border-[var(--dm-border)] dark:bg-[var(--dm-chrome)] dark:text-[var(--dm-text-secondary)] dark:hover:bg-[var(--dm-inset-hover)] dark:hover:text-[var(--dm-text-primary)]"
          >
            {theme === 'dark' ? (
              <><RiSunLine className="w-4 h-4 text-amber-500" /><span>Switch to Light</span></>
            ) : (
              <><RiMoonLine className="w-4 h-4 text-slate-600" /><span>Switch to Dark</span></>
            )}
          </button>
        </div>

        {/* Alert behavior */}
        <div className={panel}>
          <h2 className={sectionHead}>Alert Behavior</h2>
          <p className="text-xs text-slate-400 mb-4 dark:text-[var(--dm-text-muted)]">
            Choose which alerts appear on the dashboard.
          </p>
          <ul className="space-y-4">
            {(
              [
                {
                  key: 'showDashboardAlerts' as const,
                  label: 'Show dashboard alerts',
                  hint: 'Risk score, threat breakdown, top sources on the dashboard.'
                },
                {
                  key: 'highlightFlaggedInbox' as const,
                  label: 'Highlight flagged queue on dashboard',
                  hint: 'When on, the Currently Flagged stat is ring-highlighted if the count is above zero.'
                }
              ] as const
            ).map(({ key, label, hint }) => (
              <li key={key}>
                <div className="flex items-center gap-3">
                  <input
                    id={`alert-${key}`}
                    type="checkbox"
                    checked={alertBehavior[key]}
                    onChange={() => updateAlertBehavior({ [key]: !alertBehavior[key] })}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-[var(--dm-border-input)] dark:bg-[var(--dm-chrome)]"
                  />
                  <label htmlFor={`alert-${key}`} className="text-sm text-slate-700 dark:text-[var(--dm-text-secondary)]">
                    {label}
                  </label>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5 ml-7 dark:text-[var(--dm-text-muted)]">{hint}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* Risk sensitivity */}
        <RiskSensitivity panel={panel} sectionHead={sectionHead} />

        {/* Role preview */}
        <div className={`${panel} border-blue-200 dark:border-blue-900/40`}>
          <h2 className={sectionHead}>Role Preview (Mock)</h2>
          <p className="text-xs text-slate-400 mb-4 dark:text-[var(--dm-text-muted)]">
            Switch roles locally to see how the dashboard and navigation change. Not a real permission server —
            updates this browser session via{' '}
            <code className="text-[10px] bg-slate-100 dark:bg-[var(--dm-bg-elevated)] px-1.5 py-0.5 rounded font-mono">localStorage</code>.
          </p>

          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2 dark:text-[var(--dm-text-muted)] dark:font-mono">
            Active Role
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            {ROLE_OPTIONS.map((opt) => {
              const selected = role === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => setDevRole(opt.value)}
                  className={`text-left rounded-lg border px-4 py-3 min-w-[120px] transition-all text-sm
                             ${selected
                               ? 'border-blue-500 bg-blue-50 dark:border-[var(--dm-accent-ring)] dark:bg-[var(--dm-accent-soft)]'
                               : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-[var(--dm-border-input)] dark:bg-[var(--dm-chrome)] dark:hover:bg-[var(--dm-inset-hover)]'}`}>
                  <span className={`block font-semibold ${selected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-[var(--dm-text-secondary)]'}`}>
                    {opt.label}
                  </span>
                  <span className="block text-[11px] text-slate-400 mt-0.5 dark:text-[var(--dm-text-muted)]">{opt.blurb}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-[var(--dm-border)]">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-2 dark:text-[var(--dm-text-muted)]">
              Unlocks for <span className="text-slate-700 dark:text-[var(--dm-text-secondary)] capitalize">{role}</span>
            </p>
            <ul className="space-y-1.5">
              {[
                { label: 'Inbox',                      key: 'canViewInbox' },
                { label: 'Flagged Emails',              key: 'canViewFlaggedEmails' },
                { label: 'Keyword Monitoring',          key: 'canViewKeywordMonitoring' },
                { label: 'Engagement Log on Dashboard', key: 'canViewEngagementLog' },
              ].map(({ label, key }) => {
                const allowed = permissions[key as keyof typeof permissions];
                return (
                  <li key={key} className={`flex items-center gap-2 text-xs font-medium ${allowed ? 'text-slate-700 dark:text-[var(--dm-text-secondary)]' : 'text-slate-400 dark:text-[var(--dm-text-faint)] opacity-50'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${allowed ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-[var(--dm-chrome)]'}`} />
                    {label} — {allowed ? 'visible' : 'hidden'}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Engagement tracker */}
        <div>
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-primary)]">Engagement Tracker</h2>
            <p className="text-xs text-slate-400 mt-1 dark:text-[var(--dm-text-muted)]">
              Recent visits stored in this browser (unique per user, page, and day). On the dashboard, shown only for Admin.
            </p>
          </div>
          <EngagementLog skipRoleGate />
        </div>
      </div>
    </div>
  );
};

export default Settings;
