import React, { useMemo, useEffect, useState } from 'react';
import { useApp } from '../contexts/useApp';
import { computeEmailStats } from '../utils/emailStats';
import { generatePDFReport } from '../utils/pdfExport';
import { useSettings } from '../contexts/useSettings';
import { useRole } from '../utils/useRole';
import Header from '../components/layout/Header';
import StatCard from '../components/common/StatCard';
import RoleGate from '../components/common/RoleGate';
import EngagementLog from '../components/dashboard/EngagementLog';
import { useEngagementTracker } from '../utils/useEngagementTracker';
import { 
  RiShieldCheckLine, 
  RiAlertLine, 
  RiMailLine, 
  RiSpamLine,
  RiFireLine,
  RiTimeLine,
  RiUserLine,
  RiTrophyLine,
  RiInformationLine,
  RiEqualizerLine,
  RiRefreshLine,
  RiFileDownloadLine,
  RiFileList3Line,
  RiLinksLine,
  RiFlag2Line,
} from 'react-icons/ri';

const Dashboard: React.FC = () => {
  const { flaggedEmails, releasedEmails, keywords, incidents, detectionActions, syncMailbox, mailboxSyncing, mailboxError, lastSyncedAt } = useApp();
  const { advanced, alertBehavior } = useSettings();
  const { role } = useRole();
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEngagementTracker('dashboard');

  useEffect(() => {
    if (lastSyncedAt) setLastRefresh(new Date(lastSyncedAt));
  }, [lastSyncedAt]);

  const stats = useMemo(
    () => computeEmailStats({ flaggedEmails, releasedEmails, keywords, incidents, detectionActions }),
    [flaggedEmails, releasedEmails, keywords, incidents, detectionActions]
  );

  const getRiskInfo = (score: number) => {
    if (score >= 75) return { level: 'Critical', color: 'text-red-500', stroke: '#ef4444', bg: 'bg-red-950/40', border: 'border-red-800/60', badge: 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900' };
    if (score >= 50) return { level: 'High', color: 'text-orange-500', stroke: '#f97316', bg: 'bg-orange-950/40', border: 'border-orange-800/60', badge: 'bg-orange-50 text-orange-900 border border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-900' };
    if (score >= 25) return { level: 'Medium', color: 'text-amber-500', stroke: '#f59e0b', bg: 'bg-amber-950/40', border: 'border-amber-800/60', badge: 'bg-amber-50 text-amber-900 border border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900' };
    return { level: 'Low', color: 'text-emerald-500', stroke: '#10b981', bg: 'bg-emerald-950/40', border: 'border-emerald-800/60', badge: 'bg-emerald-50 text-emerald-900 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900' };
  };

  const riskInfo = getRiskInfo(stats.overallRiskScore);

  /* shared card class */
  const card = 'bg-white border border-slate-200 rounded-xl shadow-sm dark:bg-[var(--dm-surface-popover)] dark:border-[var(--dm-border)]';
  const cardHead = 'text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[var(--dm-text-muted)] dark:font-mono flex items-center gap-2';

  return (
    <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[var(--dm-bg-page)]">
      <Header title="Dashboard Overview" actionNode={
        <div className="flex items-center gap-2">
          <button
            onClick={() => generatePDFReport(flaggedEmails, keywords, { releasedCount: releasedEmails.length, incidents, detectionActions })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700">
            <RiFileDownloadLine className="w-3.5 h-3.5" />
            Export PDF
          </button>
          <button onClick={() => void syncMailbox()} disabled={mailboxSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
            <RiRefreshLine className={`w-3.5 h-3.5 ${mailboxSyncing ? 'animate-spin' : ''}`} />
            {mailboxSyncing ? 'Syncing…' : 'Sync Gmail'}
          </button>
        </div>
      } />

      <div className="p-6 space-y-6 animate-fade-in max-w-7xl mx-auto">

        {/* Auto-refresh indicator */}
        {advanced.autoRefresh && (
          <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border text-xs
                          bg-blue-50 border-blue-200 dark:bg-blue-500/5 dark:border-[var(--dm-border)]">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-blue-700 font-medium dark:text-blue-400 dark:font-mono">Live — Auto-refresh active</span>
            </div>
            <span className="text-blue-500 font-mono dark:text-[var(--dm-text-muted)]">
              {lastSyncedAt ? `Mailbox synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : `Waiting to sync • ${lastRefresh.toLocaleTimeString()}`}
            </span>
          </div>
        )}

        {mailboxError && (
          <div role="alert" className="px-4 py-3 rounded-lg border text-xs bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300">
            Gmail sync failed: {mailboxError}
          </div>
        )}

        {alertBehavior.showDashboardAlerts &&
          alertBehavior.highlightFlaggedInbox &&
          stats.criticalCount > 0 && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50/90
                       dark:bg-red-950/25 dark:border-red-900/50"
            role="status"
          >
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
              <RiAlertLine className="w-5 h-5" />
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-red-900 dark:text-red-200">Critical risk on the dashboard</p>
              <p className="text-xs text-red-800/80 dark:text-red-300/90 mt-0.5">
                {stats.criticalCount} flagged message{stats.criticalCount !== 1 ? 's are' : ' is'} rated Critical.
                {role === 'viewer'
                  ? ' Your security team reviews these items.'
                  : ' Review them in Flagged Emails.'}
              </p>
            </div>
          </div>
        )}

        {/* Viewer-only compact dashboard */}
        {role === 'viewer' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard title="Total Processed"  value={stats.totalProcessed}  icon={<RiMailLine />}        iconColor="text-blue-600"    />
              <StatCard title="Emails Released"  value={stats.totalReleased}   icon={<RiShieldCheckLine />} iconColor="text-emerald-600" />
            </div>

            <div className={`${card} p-6`}>
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-950/40 dark:text-blue-400">
                  <RiInformationLine className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-primary)]">Viewer Access</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-[var(--dm-text-muted)]">
                    Your account has read-only access to general email statistics. Contact your administrator to request expanded permissions such as flagged email review, keyword monitoring, or inbox access.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                    {[
                      { label: 'Inbox', locked: true },
                      { label: 'Flagged Emails', locked: true },
                      { label: 'Keyword Monitoring', locked: true },
                      { label: 'Incidents', locked: false },
                    ].map(({ label, locked }) => (
                      <div key={label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium
                        ${locked
                          ? 'border-slate-200 bg-slate-50 text-slate-400 dark:border-[var(--dm-border)] dark:bg-[var(--dm-bg-elevated)] dark:text-[var(--dm-text-muted)]'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400'
                        }`}
                      >
                        <span>{locked ? '🔒' : '✓'}</span>
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Activity — viewers can see this */}
            <div className={`${card} p-6`}>
              <p className={cardHead}>
                <RiTimeLine className="w-3.5 h-3.5" />
                Recent Activity
              </p>
              {stats.recentReleased.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-400 dark:text-[var(--dm-text-muted)]">
                  <RiMailLine className="w-10 h-10 mb-3 text-slate-300 dark:text-[var(--dm-chrome)]" />
                  <p className="text-sm font-medium">No released emails yet</p>
                </div>
              ) : (
                <div className="space-y-2 mt-5">
                  {stats.recentReleased.map((released) => (
                    <div key={released.id}
                         className="flex items-start space-x-3 px-3 py-3 rounded-lg border transition-colors
                                    bg-slate-50 border-slate-100 dark:bg-[var(--dm-bg-elevated)] dark:border-[var(--dm-border)]">
                      <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0
                                      bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <RiShieldCheckLine className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate dark:text-[var(--dm-text-primary)]">
                          {released.originalEmail.subject}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5 dark:text-[var(--dm-text-muted)]">
                          {released.originalEmail.sender}
                        </p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center text-[10px] text-slate-400 dark:text-[var(--dm-text-muted)]">
                            <RiUserLine className="w-3 h-3 mr-1" />{released.releasedBy}
                          </span>
                          <span className="flex items-center text-[10px] text-slate-400 font-mono dark:text-[var(--dm-text-muted)]">
                            <RiTimeLine className="w-3 h-3 mr-1" />{released.releasedAt}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
        <div className="space-y-6">

        {/* Hero Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Processed"    value={stats.totalProcessed}    icon={<RiMailLine />}        iconColor="text-blue-600"    />
          <div
            className={
              alertBehavior.highlightFlaggedInbox && stats.totalFlagged > 0
                ? 'rounded-xl ring-2 ring-amber-400/80 ring-offset-2 ring-offset-slate-50 dark:ring-amber-500/50 dark:ring-offset-[var(--dm-bg-page)]'
                : undefined
            }
          >
            <StatCard title="Currently Flagged"  value={stats.totalFlagged}      icon={<RiAlertLine />}       iconColor="text-red-600"     />
          </div>
          <StatCard title="Emails Released"    value={stats.totalReleased}     icon={<RiShieldCheckLine />} iconColor="text-emerald-600" />
          <StatCard title="Active Keywords"    value={stats.activeKeywords}    icon={<RiSpamLine />}        iconColor="text-purple-600"  />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard title="Open Incidents" value={stats.openIncidents} icon={<RiFileList3Line />} iconColor="text-orange-600" />
          <StatCard title="Incidents Linked to Emails" value={stats.incidentsLinkedToEmails} icon={<RiLinksLine />} iconColor="text-blue-600" />
          <StatCard title="Flagged Emails Escalated" value={stats.flaggedEmailsEscalated} icon={<RiFlag2Line />} iconColor="text-red-600" />
        </div>

        <RoleGate permission="canViewFlaggedEmails">
          <>
            {/* Risk Score + Threat Distribution — gated by Settings → Alert behavior → Dashboard alerts */}
            {alertBehavior.showDashboardAlerts && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* Risk Score */}
              <div className={`${card} p-6`}>
                <p className={cardHead}>
                  <RiFireLine className="w-3.5 h-3.5" />
                  Overall Risk Score
                </p>

                <div className="flex flex-col items-center mt-6">
                  <div className="relative w-40 h-40">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50" cy="50" r="40" fill="none"
                        stroke={riskInfo.stroke}
                        strokeWidth="8"
                        strokeOpacity={0.2}
                      />
                      <circle
                        cx="50" cy="50" r="40" fill="none"
                        stroke={riskInfo.stroke}
                        strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={`${(stats.overallRiskScore / 100) * 251.2} 251.2`}
                        style={{ transition: 'stroke-dasharray 1s ease-in-out' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-4xl font-black tracking-tight dark:font-mono ${riskInfo.color}`}>
                        {stats.overallRiskScore}
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400 dark:text-[var(--dm-text-muted)] mt-1">
                        Score
                      </span>
                    </div>
                  </div>

                  <div className={`mt-5 px-4 py-1.5 rounded-md border text-xs font-bold uppercase tracking-wider ${riskInfo.badge}`}>
                    <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${riskInfo.color.replace('text-', 'bg-')}`} />
                    {riskInfo.level} Risk
                  </div>

                  <p className="text-[11px] text-slate-400 text-center mt-3 dark:text-[var(--dm-text-muted)]">
                    {stats.totalFlagged} flagged emails analyzed
                  </p>
                </div>
              </div>

              {/* Threat Distribution */}
              <div className={`${card} p-6 lg:col-span-2`}>
                <p className={cardHead}>
                  <RiEqualizerLine className="w-3.5 h-3.5" />
                  Threat Distribution
                </p>

                <div className="space-y-5 mt-6">
                  {[
                    { label: 'Critical', count: stats.criticalCount, color: 'bg-red-500',    trackTint: 'bg-red-500/12 dark:bg-red-500/22' },
                    { label: 'High',     count: stats.highCount,     color: 'bg-orange-500', trackTint: 'bg-orange-500/12 dark:bg-orange-500/22' },
                    { label: 'Medium',   count: stats.mediumCount,   color: 'bg-amber-500',  trackTint: 'bg-amber-500/12 dark:bg-amber-500/22' },
                    { label: 'Low',      count: stats.lowCount,      color: 'bg-emerald-500', trackTint: 'bg-emerald-500/12 dark:bg-emerald-500/22' },
                  ].map(({ label, count, color, trackTint }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-600 flex items-center gap-2 dark:text-[var(--dm-text-secondary)]">
                          <span className={`w-2 h-2 rounded-full ${color}`} />
                          {label}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-700 dark:text-[var(--dm-text-primary)]">
                          {count} email{count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className={`w-full h-1.5 rounded-full overflow-hidden ${trackTint}`}>
                        <div
                          className={`${color} h-full rounded-full transition-all duration-1000`}
                          style={{ width: `${stats.totalFlagged > 0 ? (count / stats.totalFlagged) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  ))}

                  <div className="pt-4 mt-2 border-t border-slate-100 dark:border-[var(--dm-border)] flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-[var(--dm-text-muted)]">Detection Rate</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 dark:text-[var(--dm-text-muted)]">
                        {stats.totalFlagged} of {stats.totalProcessed} emails
                      </p>
                    </div>
                    <span className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
                      {stats.detectionRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Top Threats + Recent Activity */}
            <div className={`grid grid-cols-1 gap-4 ${alertBehavior.showDashboardAlerts ? 'lg:grid-cols-2' : ''}`}>

              {/* Top Threat Sources */}
              {alertBehavior.showDashboardAlerts && (
              <div className={`${card} p-6`}>
                <p className={cardHead}>
                  <RiTrophyLine className="w-3.5 h-3.5" />
                  Top Threat Sources
                </p>

                {stats.topThreats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-[var(--dm-text-muted)]">
                    <RiShieldCheckLine className="w-12 h-12 mb-3 text-emerald-400/50" />
                    <p className="text-sm font-medium">No threats detected</p>
                  </div>
                ) : (
                  <div className="space-y-2 mt-5">
                    {stats.topThreats.map(([domain, count], index) => (
                      <div key={domain}
                           className="flex items-center space-x-3 px-3 py-3 rounded-lg border transition-colors
                                      bg-slate-50 border-slate-100 hover:border-slate-200
                                      dark:bg-[var(--dm-bg-elevated)] dark:border-[var(--dm-border)] dark:hover:border-[var(--dm-border)]">
                        <div className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold font-mono flex-shrink-0
                                        ${index === 0 ? 'bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400' :
                                          index === 1 ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400' :
                                          index === 2 ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400' :
                                          'bg-slate-200 text-slate-600 dark:bg-[var(--dm-chrome)] dark:text-[var(--dm-text-muted)]'}`}>
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 font-mono truncate dark:text-[var(--dm-text-primary)]">{domain}</p>
                          <p className="text-[10px] text-slate-400 dark:text-[var(--dm-text-muted)]">{count} threat{count !== 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-300 dark:text-[var(--dm-text-mono)]">
                          {Math.round((count / stats.totalFlagged) * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}

              {/* Recent Activity */}
              <div className={`${card} p-6`}>
                <p className={cardHead}>
                  <RiTimeLine className="w-3.5 h-3.5" />
                  Recent Activity
                </p>

                {stats.recentReleased.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-[var(--dm-text-muted)]">
                    <RiMailLine className="w-12 h-12 mb-3 text-slate-300 dark:text-[var(--dm-chrome)]" />
                    <p className="text-sm font-medium">No released emails yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 mt-5">
                    {stats.recentReleased.map((released) => (
                      <div key={released.id}
                           className="flex items-start space-x-3 px-3 py-3 rounded-lg border transition-colors group
                                      bg-slate-50 border-slate-100 hover:border-emerald-200
                                      dark:bg-[var(--dm-bg-elevated)] dark:border-[var(--dm-border)] dark:hover:border-emerald-900/60">
                        <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0
                                        bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                          <RiShieldCheckLine className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate dark:text-[var(--dm-text-primary)]">
                            {released.originalEmail.subject}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5 dark:text-[var(--dm-text-muted)]">
                            {released.originalEmail.sender}
                          </p>
                          <div className="flex items-center space-x-3 mt-1.5">
                            <span className="flex items-center text-[10px] text-slate-400 dark:text-[var(--dm-text-muted)]">
                              <RiUserLine className="w-3 h-3 mr-1" />{released.releasedBy}
                            </span>
                            <span className="flex items-center text-[10px] text-slate-400 font-mono dark:text-[var(--dm-text-muted)]">
                              <RiTimeLine className="w-3 h-3 mr-1" />{released.releasedAt}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        </RoleGate>

        <EngagementLog />
        </div>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
