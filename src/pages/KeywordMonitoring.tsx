import React, { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../contexts/useApp';
import Header from '../components/layout/Header';
import RoleGate, { AccessRestrictedBlock } from '../components/common/RoleGate';
import { useEngagementTracker } from '../utils/useEngagementTracker';
import { RiAddLine, RiMoreLine, RiDeleteBinLine } from 'react-icons/ri';

const KEYWORD_MENU_WIDTH = 160;
const KEYWORD_MENU_Z = 200;

const KeywordMonitoring: React.FC = () => {
  useEngagementTracker('keyword-monitoring');
  const {
    keywords, addKeyword, deleteKeyword, toggleKeyword, updateKeyword,
    detectionOptions, detectionActions, updateDetectionOptions, updateDetectionActions,
    saveWorkspace, workspaceSaveStatus,
  } = useApp();

  const [keywordError, setKeywordError]         = useState('');
  const [newKeyword, setNewKeyword]             = useState('');
  const [openMenuId, setOpenMenuId]               = useState<string | null>(null);
  const [menuPos, setMenuPos]                     = useState({ top: 0, left: 0 });
  const [editingKeywordId, setEditingKeywordId] = useState<string | null>(null);
  const [editValue, setEditValue]               = useState('');
  const anchorRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const menuPanelRef = useRef<HTMLDivElement>(null);

  const handleAddKeyword = () => {
    const value = newKeyword.trim();
    if (!value) return;
    if (!addKeyword(value)) {
      setKeywordError('That keyword is already on the list.');
      return;
    }
    setKeywordError('');
    setNewKeyword('');
  };
  const startEditing  = (id: string, val: string) => { setEditingKeywordId(id); setEditValue(val); setOpenMenuId(null); };
  const commitEdit    = (id: string) => {
    if (!updateKeyword(id, editValue)) {
      setKeywordError('That keyword is already on the list.');
      return;
    }
    setKeywordError('');
    setEditingKeywordId(null);
    setEditValue('');
  };
  const cancelEdit    = () => { setEditingKeywordId(null); setEditValue(''); };

  const updateMenuPosition = useCallback(() => {
    if (!openMenuId) return;
    const btn = anchorRefs.current.get(openMenuId);
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const top = r.bottom + 4;
    let left = r.right - KEYWORD_MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - KEYWORD_MENU_WIDTH - 8));
    setMenuPos({ top, left });
  }, [openMenuId]);

  useLayoutEffect(() => {
    updateMenuPosition();
  }, [openMenuId, updateMenuPosition]);

  useLayoutEffect(() => {
    if (!openMenuId) return;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [openMenuId, updateMenuPosition]);

  useEffect(() => {
    if (!openMenuId) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuPanelRef.current?.contains(t)) return;
      if (anchorRefs.current.get(openMenuId)?.contains(t)) return;
      setOpenMenuId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  const openKeyword = openMenuId ? keywords.find((k) => k.id === openMenuId) : undefined;

  const panel = 'bg-white border border-slate-200 rounded-xl dark:bg-[var(--dm-surface-card)] dark:border-[var(--dm-border)]';
  const sectionHead = 'text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-primary)]';
  const input = 'w-full px-3 py-2 text-sm rounded-lg border outline-none transition-all bg-white border-slate-200 text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:bg-[var(--dm-chrome)] dark:border-[var(--dm-border-input)] dark:text-[var(--dm-text-primary)] dark:placeholder:text-[var(--dm-placeholder)] dark:focus:border-blue-500/40';
  const checkboxRow = 'flex items-start space-x-3 py-3 border-b border-slate-100 last:border-b-0 dark:border-[var(--dm-border)]';

  return (
    <RoleGate permission="canViewKeywordMonitoring" fallback={<div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-[var(--dm-bg-page)]"><AccessRestrictedBlock /></div>}>
      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[var(--dm-bg-page)]">
        <Header title="Keyword Monitoring" />

        <div className="w-full max-w-7xl mx-auto p-6">
          <div className="space-y-4">

            {/* Active Keywords */}
            <div className={`${panel} p-5`}>
              <h2 className={`${sectionHead} mb-4`}>Active Keywords</h2>

              {/* Add keyword input */}
              <div className="flex items-center space-x-2 mb-2">
                <input
                  type="text" placeholder="Enter new keyword…" value={newKeyword}
                  onChange={e => { setNewKeyword(e.target.value); setKeywordError(''); }}
                  onKeyPress={e => e.key === 'Enter' && handleAddKeyword()}
                  className={input}
                />
                <button onClick={handleAddKeyword} disabled={!newKeyword.trim()}
                  className="p-2 rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-200 disabled:cursor-not-allowed dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500 dark:disabled:bg-[var(--dm-chrome)] dark:disabled:text-[var(--dm-text-muted)]">
                  <RiAddLine className="w-5 h-5" />
                </button>
              </div>
              {keywordError ? <p className="text-xs text-red-600 mb-4">{keywordError}</p> : <div className="mb-3" />}

              {/* Keyword tags */}
              <div className="flex flex-wrap gap-2">
                {keywords.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-[var(--dm-text-muted)]">No keywords added yet</p>
                ) : keywords.map((keyword) => {
                  const isEditing = editingKeywordId === keyword.id;
                  return (
                    <div key={keyword.id}
                         className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors
                                     ${keyword.enabled
                                       ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30'
                                       : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-[var(--dm-chrome)] dark:text-[var(--dm-text-faint)] dark:border-[var(--dm-border-input)]'}`}>
                      {isEditing ? (
                        <div className="flex items-center space-x-1.5">
                          <input value={editValue} onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') commitEdit(keyword.id); if (e.key === 'Escape') cancelEdit(); }}
                            className="w-32 px-2 py-0.5 text-xs rounded border outline-none bg-white border-slate-300 text-slate-800 dark:bg-[var(--dm-bg-elevated)] dark:border-[var(--dm-border-input)] dark:text-[var(--dm-text-primary)]"
                            autoFocus />
                          <button onClick={() => commitEdit(keyword.id)} className="px-2 py-0.5 text-xs rounded bg-blue-600 text-white dark:bg-blue-600 dark:text-white">Save</button>
                          <button onClick={cancelEdit} className="px-2 py-0.5 text-xs rounded border border-slate-200 text-slate-600 dark:border-[var(--dm-border-input)] dark:text-[var(--dm-text-faint)]">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <span>{keyword.value}</span>
                          {!keyword.enabled && (
                            <span className="text-[9px] font-mono uppercase tracking-wider bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded dark:bg-[var(--dm-chrome)] dark:text-[var(--dm-text-muted)]">off</span>
                          )}
                        </>
                      )}

                      <div className="relative">
                        <button
                          type="button"
                          ref={(el) => {
                            if (el) anchorRefs.current.set(keyword.id, el);
                            else anchorRefs.current.delete(keyword.id);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === keyword.id ? null : keyword.id);
                          }}
                          disabled={isEditing}
                          aria-expanded={openMenuId === keyword.id}
                          aria-haspopup="menu"
                          className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        >
                          <RiMoreLine className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detection Options */}
            <div className={`${panel} p-5`}>
              <h2 className={`${sectionHead} mb-1`}>Detection Options</h2>
              <p className="text-xs text-slate-400 mb-4 dark:text-[var(--dm-text-muted)]">Configure how keyword matching operates across emails.</p>
              <div>
                {[
                  { key: 'caseInsensitive', label: 'Case-insensitive matching',  desc: 'Ignore case when matching (e.g., "Urgent" matches "urgent")' },
                  { key: 'matchInSubject',  label: 'Match in subject line',       desc: 'Search for keywords in email subject lines' },
                  { key: 'matchInBody',     label: 'Match in body',               desc: 'Search for keywords in email body content' },
                  { key: 'wholeWordOnly',   label: 'Whole-word only',             desc: 'Only match complete words (e.g., "verify" won\'t match "verification")' },
                ].map(opt => (
                  <label key={opt.key} className={`${checkboxRow} cursor-pointer group`}>
                    <input type="checkbox" checked={detectionOptions[opt.key as keyof typeof detectionOptions]}
                      onChange={e => updateDetectionOptions({ [opt.key]: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-[var(--dm-border-input)]" />
                    <div>
                      <span className="text-sm font-medium text-slate-800 group-hover:text-blue-600 transition-colors dark:text-[var(--dm-text-secondary)] dark:group-hover:text-blue-400">
                        {opt.label}
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5 dark:text-[var(--dm-text-muted)]">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Detection Actions */}
            <div className={`${panel} p-5`}>
              <h2 className={`${sectionHead} mb-1`}>Detection Actions</h2>
              <p className="text-xs text-slate-400 mb-4 dark:text-[var(--dm-text-muted)]">Define what happens when a keyword is detected.</p>
              <div>
                {[
                  { key: 'flagEmail',        label: 'Flag the email',              desc: 'Automatically flag emails containing keywords' },
                  { key: 'logMatch',         label: 'Log keyword match',           desc: 'Record all keyword matches in the system log' },
                  { key: 'showInDashboard',  label: 'Show reason in dashboard',    desc: 'Display matched keyword in the flagged emails dashboard' },
                ].map(act => (
                  <label key={act.key} className={`${checkboxRow} cursor-pointer group`}>
                    <input type="checkbox" checked={detectionActions[act.key as keyof typeof detectionActions]}
                      onChange={e => updateDetectionActions({ [act.key]: e.target.checked })}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-[var(--dm-border-input)]" />
                    <div>
                      <span className="text-sm font-medium text-slate-800 group-hover:text-blue-600 transition-colors dark:text-[var(--dm-text-secondary)] dark:group-hover:text-blue-400">
                        {act.label}
                      </span>
                      <p className="text-xs text-slate-400 mt-0.5 dark:text-[var(--dm-text-muted)]">{act.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              {workspaceSaveStatus === 'saving' && <span className="text-xs text-slate-400">Saving…</span>}
              {workspaceSaveStatus === 'saved' && <span className="text-xs text-emerald-600">Saved</span>}
              {workspaceSaveStatus === 'error' && <span className="text-xs text-red-600">Couldn’t save. Changes are kept in this browser.</span>}
              <button
                type="button"
                onClick={() => void saveWorkspace()}
                className="px-5 py-2 text-sm font-semibold rounded-lg transition-colors
                                 bg-blue-600 text-white hover:bg-blue-700 shadow-sm
                                 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>

      {openKeyword &&
        editingKeywordId !== openKeyword.id &&
        createPortal(
          <div
            ref={menuPanelRef}
            role="menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              zIndex: KEYWORD_MENU_Z,
              minWidth: KEYWORD_MENU_WIDTH,
            }}
            className="rounded-lg border shadow-lg overflow-hidden bg-white border-slate-200 dark:bg-[var(--dm-surface-card)] dark:border-[var(--dm-border)] dark:shadow-black/60"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => startEditing(openKeyword.id, openKeyword.value)}
              className="w-full flex items-center px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors dark:text-[var(--dm-text-secondary)] dark:hover:bg-white/[0.04]"
            >
              Edit
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { toggleKeyword(openKeyword.id); setOpenMenuId(null); }}
              className="w-full flex items-center px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors dark:text-[var(--dm-text-secondary)] dark:hover:bg-white/[0.04]"
            >
              {openKeyword.enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { deleteKeyword(openKeyword.id); setOpenMenuId(null); }}
              className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <RiDeleteBinLine className="w-3.5 h-3.5" aria-hidden />
              Delete
            </button>
          </div>,
          document.body
        )}
    </RoleGate>
  );
};

export default KeywordMonitoring;
