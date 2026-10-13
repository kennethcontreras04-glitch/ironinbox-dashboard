import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../contexts/useApp';
import Header from '../components/layout/Header';
import RoleGate, { AccessRestrictedBlock } from '../components/common/RoleGate';
import { useEngagementTracker } from '../utils/useEngagementTracker';
import {
  RiMailLine,
  RiMailOpenLine,
  RiSearchLine,
  RiTimeLine,
  RiUserLine,
  RiShieldCheckLine,
  RiInboxLine,
  RiCalendarLine,
  RiStarLine,
  RiStarFill,
  RiFlagLine,
  RiCheckLine
} from 'react-icons/ri';

type TimeFilterType = 'All' | 'Today' | 'This Week' | 'This Month';
type FolderType = 'All' | 'Starred' | 'Unread';

const ITEMS_PER_PAGE = 10;

const Inbox: React.FC = () => {
  useEngagementTracker('inbox');
  const { releasedEmails, toggleStarReleasedEmail, toggleReadReleasedEmail, reFlagReleasedEmails } = useApp();
  const [searchParams] = useSearchParams();

  const [searchQuery, setSearchQuery]     = useState('');
  const [timeFilter, setTimeFilter]       = useState<TimeFilterType>('All');
  const [folder, setFolder]               = useState<FolderType>('All');
  const [selectedEmailState, setSelectedEmail] = useState<typeof releasedEmails[0] | null>(null);
  const [selectedIdsState, setSelectedIds]     = useState<Set<string>>(new Set());
  const [page, setPage]                   = useState(1);

  const selectedEmail = releasedEmails.find(email => email.id === selectedEmailState?.id) ?? null;
  const selectedIds = new Set([...selectedIdsState].filter(id => releasedEmails.some(email => email.id === id)));

  const filteredEmails = useMemo(() => {
    return releasedEmails.filter(released => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = !q || released.originalEmail.sender.toLowerCase().includes(q) || released.originalEmail.subject.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (folder === 'Starred' && !released.starred) return false;
      if (folder === 'Unread' && released.isRead) return false;
      if (timeFilter === 'All') return true;
      const d = new Date(released.releasedAt), now = new Date();
      if (timeFilter === 'Today') return d.toDateString() === now.toDateString();
      if (timeFilter === 'This Week') return (now.getTime() - d.getTime()) / (1000*60*60*24) <= 7;
      if (timeFilter === 'This Month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      return true;
    });
  }, [releasedEmails, searchQuery, timeFilter, folder]);

  const totalPages = Math.max(1, Math.ceil(filteredEmails.length / ITEMS_PER_PAGE));
  const paginated  = useMemo(() => filteredEmails.slice((page-1)*ITEMS_PER_PAGE, page*ITEMS_PER_PAGE), [filteredEmails, page]);

  const allVisibleSelected = paginated.length > 0 && paginated.every(e => selectedIds.has(e.id));
  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAllVisible = () => setSelectedIds(prev => { const n = new Set(prev); if (allVisibleSelected) paginated.forEach(e => n.delete(e.id)); else paginated.forEach(e => n.add(e.id)); return n; });
  const clearSelection = () => setSelectedIds(new Set());
  const bulkSetRead    = (read: boolean) => { Array.from(selectedIds).forEach(id => toggleReadReleasedEmail(id, read)); clearSelection(); };
  const bulkToggleStar = () => { Array.from(selectedIds).forEach(id => toggleStarReleasedEmail(id)); clearSelection(); };
  const bulkReFlag     = () => { reFlagReleasedEmails(Array.from(selectedIds)); setSelectedEmail(null); clearSelection(); };

  React.useEffect(() => { setPage(1); clearSelection(); setSelectedEmail(null); }, [searchQuery, timeFilter, folder]);

  React.useEffect(() => {
    const emailId = searchParams.get('email');
    if (!emailId) return;
    const match = releasedEmails.find((email) => email.id === emailId || email.originalEmail.id === emailId);
    if (match) setSelectedEmail(match);
  }, [searchParams, releasedEmails]);

  const input = 'w-full px-3 py-2 text-sm rounded-lg border outline-none transition-all bg-white border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:bg-[var(--dm-chrome)] dark:border-[var(--dm-border)] dark:text-[var(--dm-text-primary)] dark:focus:border-blue-500/40 dark:focus:ring-blue-500/10';
  const select = `${input} appearance-none cursor-pointer pr-8`;
  const panel  = 'bg-white border border-slate-200 rounded-xl dark:bg-[var(--dm-surface-popover)] dark:border-[var(--dm-border)]';
  const sectionHead = 'text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[var(--dm-text-muted)] dark:font-mono';

  return (
    <RoleGate permission="canViewInbox" fallback={<div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-[var(--dm-bg-page)]"><AccessRestrictedBlock /></div>}>
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[var(--dm-bg-page)]">
        <Header title="Inbox" />

        <div className="p-6 space-y-4 max-w-7xl mx-auto">

          {/* Controls */}
          <div className={`${panel} p-4`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex-1 relative">
                <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-[var(--dm-text-muted)]" />
                <input
                  type="text" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by sender or subject…"
                  className={`${input} pl-9`}
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center space-x-2">
                  <RiInboxLine className="w-4 h-4 text-slate-400 dark:text-[var(--dm-text-muted)]" />
                  <select value={folder} onChange={e => setFolder(e.target.value as FolderType)} className={select}>
                    <option value="All">All</option>
                    <option value="Starred">Starred</option>
                    <option value="Unread">Unread</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <RiTimeLine className="w-4 h-4 text-slate-400 dark:text-[var(--dm-text-muted)]" />
                  <select value={timeFilter} onChange={e => setTimeFilter(e.target.value as TimeFilterType)} className={select}>
                    <option value="All">All time</option>
                    <option value="Today">Today</option>
                    <option value="This Week">This week</option>
                    <option value="This Month">This month</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Bulk actions */}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[var(--dm-border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <label className="inline-flex items-center space-x-2 text-xs text-slate-600 select-none dark:text-[var(--dm-text-muted)]">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} className="w-4 h-4 rounded border-slate-300 dark:border-[var(--dm-border)]" />
                <span className="font-medium">Select page</span>
                {selectedIds.size > 0 && <span className="text-slate-400 dark:text-[var(--dm-text-muted)] font-mono">({selectedIds.size} selected)</span>}
              </label>

              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: 'Star/Unstar', icon: <RiStarLine className="w-3.5 h-3.5" />, action: bulkToggleStar },
                  { label: 'Mark read',   icon: <RiCheckLine className="w-3.5 h-3.5" />, action: () => bulkSetRead(true) },
                  { label: 'Mark unread', icon: null, action: () => bulkSetRead(false) },
                ].map(b => (
                  <button key={b.label} onClick={b.action} disabled={selectedIds.size === 0}
                    className="px-2.5 py-1.5 text-xs rounded-lg border font-medium transition-colors inline-flex items-center gap-1.5
                               border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed
                               dark:border-[var(--dm-border)] dark:text-[var(--dm-text-muted)] dark:hover:bg-white/[0.03] dark:hover:text-[var(--dm-text-secondary)]">
                    {b.icon}{b.label}
                  </button>
                ))}
                <button onClick={bulkReFlag} disabled={selectedIds.size === 0}
                  className="px-2.5 py-1.5 text-xs rounded-lg font-semibold transition-colors inline-flex items-center gap-1.5
                             bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed">
                  <RiFlagLine className="w-3.5 h-3.5" />Re-flag
                </button>
              </div>
            </div>
          </div>

          {/* Email List */}
          <div className={panel}>
            <div className="px-5 py-3 border-b border-slate-100 dark:border-[var(--dm-border)]">
              <p className={sectionHead}>Safe Emails <span className="ml-1 text-slate-300 dark:text-[var(--dm-text-mono)]">({filteredEmails.length})</span></p>
            </div>

            {filteredEmails.length === 0 ? (
              <div className="p-12 text-center">
                <RiMailLine className="w-10 h-10 text-slate-300 mx-auto mb-3 dark:text-[var(--dm-chrome)]" />
                <p className="text-sm font-medium text-slate-600 dark:text-[var(--dm-text-muted)]">No emails found</p>
                <p className="text-xs text-slate-400 mt-1 dark:text-[var(--dm-text-muted)]">Try adjusting your filters or search terms.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[var(--dm-border)] max-h-[480px] overflow-y-auto">
                {paginated.map((released) => {
                  const isSelected = selectedIds.has(released.id);
                  const isActive   = selectedEmail?.id === released.id;
                  return (
                    <div key={released.id}
                         className={`flex items-start gap-3 px-5 py-3.5 transition-colors
                                     hover:bg-slate-50 dark:hover:bg-white/[0.02]
                                     ${isActive ? 'bg-blue-50/50 dark:bg-blue-500/[0.04]' : ''}`}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(released.id)}
                             className="mt-1 w-4 h-4 rounded border-slate-300 dark:border-[var(--dm-border)]" />

                      <div onClick={() => setSelectedEmail(released)} className="flex-1 text-left cursor-pointer select-none">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start space-x-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-100 dark:bg-emerald-950/40">
                              <RiUserLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`text-xs truncate ${released.isRead ? 'text-slate-600 dark:text-[var(--dm-text-muted)]' : 'font-semibold text-slate-900 dark:text-[var(--dm-text-primary)]'}`}>
                                  {released.originalEmail.sender}
                                </p>
                                {released.starred && <RiStarFill className="w-3.5 h-3.5 text-amber-500" />}
                              </div>
                              <p className={`text-xs truncate mt-0.5 ${released.isRead ? 'text-slate-500 dark:text-[var(--dm-text-muted)]' : 'font-medium text-slate-800 dark:text-[var(--dm-text-secondary)]'}`}>
                                {released.originalEmail.subject}
                              </p>
                              <div className="flex items-center space-x-3 mt-1.5 text-[10px] text-slate-400 dark:text-[var(--dm-text-muted)]">
                                <span className="flex items-center gap-1"><RiCalendarLine className="w-3 h-3" />{released.releasedAt}</span>
                                <span className="flex items-center gap-1"><RiShieldCheckLine className="w-3 h-3" />Released by {released.releasedBy}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <button onClick={() => toggleStarReleasedEmail(released.id)}
                              className="p-1.5 rounded-md hover:bg-slate-100 transition-colors dark:hover:bg-white/[0.04]">
                              {released.starred ? <RiStarFill className="w-4 h-4 text-amber-500" /> : <RiStarLine className="w-4 h-4 text-slate-400 dark:text-[var(--dm-text-muted)]" />}
                            </button>
                            <button onClick={() => toggleReadReleasedEmail(released.id)}
                              className="p-1.5 rounded-md hover:bg-slate-100 transition-colors dark:hover:bg-white/[0.04]">
                              {released.isRead
                                ? <RiMailLine className="w-4 h-4 text-slate-400 dark:text-[var(--dm-text-muted)]" />
                                : <RiMailOpenLine className="w-4 h-4 text-blue-500 dark:text-blue-400" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {filteredEmails.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 dark:border-[var(--dm-border)] flex items-center justify-between">
                <p className="text-xs text-slate-500 font-mono dark:text-[var(--dm-text-muted)]">Page {page} of {totalPages}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                    className="px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40
                               border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-[var(--dm-border)] dark:text-[var(--dm-text-muted)] dark:hover:bg-white/[0.03]">
                    Previous
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}
                    className="px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors disabled:opacity-40
                               border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-[var(--dm-border)] dark:text-[var(--dm-text-muted)] dark:hover:bg-white/[0.03]">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Email detail panel */}
          {selectedEmail && (
            <div className={`${panel} p-5`}>
              <div className="flex items-center justify-between mb-4">
                <p className={sectionHead}>Email Details</p>
                <span className="text-[10px] font-mono text-slate-400 dark:text-[var(--dm-text-muted)]">Released · {selectedEmail.releasedAt}</span>
              </div>
              <div className="space-y-4">
                {[
                  { label: 'From',         value: selectedEmail.originalEmail.sender },
                  { label: 'Subject',      value: selectedEmail.originalEmail.subject },
                  { label: 'Released By',  value: selectedEmail.releasedBy },
                ].map(f => (
                  <div key={f.label}>
                    <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-1 dark:text-[var(--dm-text-muted)]">{f.label}</label>
                    <p className="text-sm text-slate-800 dark:text-[var(--dm-text-primary)]">{f.value}</p>
                  </div>
                ))}
                <div>
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-[var(--dm-text-muted)]">Content</label>
                  <div className="rounded-lg border px-4 py-3 text-sm leading-relaxed
                                  bg-slate-50 border-slate-200 text-slate-700
                                  dark:bg-[var(--dm-bg-elevated)] dark:border-[var(--dm-border)] dark:text-[var(--dm-text-secondary)]">
                    {selectedEmail.originalEmail.content}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
};

export default Inbox;
