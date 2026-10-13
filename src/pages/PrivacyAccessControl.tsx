import React, { useState } from 'react';
import Header from '../components/layout/Header';
import { RiCheckLine, RiCloseLine, RiShieldLine, RiRefreshLine, RiLockLine } from 'react-icons/ri';
import Modal from '../components/common/Modal';
import { useApp } from '../contexts/useApp';
import { useAuth } from '../contexts/useAuth';

const ACCESS_ITEMS = [
  { label: 'Read email subject & body', allowed: true },
  { label: 'Read sender and domain',    allowed: true },
  { label: 'Delete emails',             allowed: false },
  { label: 'Modify emails',             allowed: false },
  { label: 'Send emails',               allowed: false },
];

const SECURITY_MEASURES = [
  'Google and Microsoft mailbox authorization (no mailbox password is shared)',
  'Read-only Gmail and Microsoft mail access',
  'Encrypted refresh tokens in the monitoring service',
  'Your saved mailbox connections and monitoring records can be deleted',
];

const PrivacyAccessControl: React.FC = () => {
  const { wipeAllData } = useApp();
  const { signOut } = useAuth();
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [isWiping, setIsWiping]           = useState(false);
  const [wipeMessage, setWipeMessage]     = useState<string | null>(null);

  const handleWipeData = async () => {
    setIsWiping(true);
    try {
      await wipeAllData();
      await signOut();
      setShowWipeModal(false);
    } catch (error) {
      setShowWipeModal(false);
      setWipeMessage(error instanceof Error ? error.message : 'Unable to delete monitoring data. Please retry.');
    } finally {
      setIsWiping(false);
    }
  };

  const panel = 'bg-white border border-slate-200 rounded-xl p-5 dark:bg-[var(--dm-surface-card)] dark:border-[var(--dm-border)]';
  const sectionHead = 'text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-primary)] mb-4 flex items-center gap-2';

  return (
    <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[var(--dm-bg-page)]">
      <Header title="Privacy & Access Control" />

      <div className="w-full max-w-7xl mx-auto p-6 space-y-4">

        <p className="text-xs text-center text-slate-400 dark:text-[var(--dm-text-muted)] pb-1">
          Your data is protected. We only access what is required for monitoring.
        </p>

        {/* What IronInbox Can Access */}
        <div className={panel}>
          <h2 className={sectionHead}>
            <RiLockLine className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            What IronInbox Can Access
          </h2>
          <ul className="space-y-2.5">
            {ACCESS_ITEMS.map((item) => (
              <li key={item.label} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-b-0 dark:border-[var(--dm-border)]">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${item.allowed ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-red-50 dark:bg-red-950/40'}`}>
                  {item.allowed
                    ? <RiCheckLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    : <RiCloseLine className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />}
                </div>
                <span className="text-sm text-slate-700 dark:text-[var(--dm-text-secondary)]">{item.label}</span>
                <span className={`ml-auto text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded
                                 ${item.allowed
                                   ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40'
                                   : 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40'}`}>
                  {item.allowed ? 'Allowed' : 'Denied'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Security Measures */}
        <div className={panel}>
          <h2 className={sectionHead}>
            <RiShieldLine className="w-4 h-4 text-blue-500 dark:text-blue-400" />
            Security Measures
          </h2>
          <ul className="space-y-3">
            {SECURITY_MEASURES.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-slate-700 dark:text-[var(--dm-text-secondary)]">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Account Control */}
        <div className={panel}>
          <h2 className={sectionHead}>Account Control</h2>
          <div className="space-y-3">
            <button
              onClick={() => setShowWipeModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors
                         bg-red-600 text-white hover:bg-red-700"
            >
              <RiRefreshLine className="w-4 h-4" />
              Wipe All Stored Monitoring Data
            </button>

            {wipeMessage && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2
                            dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800/50"
                 role="status">
                {wipeMessage}
              </p>
            )}
            <p className="text-xs text-slate-400 dark:text-[var(--dm-text-muted)]">
              Wipe removes all saved mailbox connections and monitoring records for your IronInbox user.
            </p>
          </div>
        </div>
      </div>

      <Modal isOpen={showWipeModal} onClose={() => setShowWipeModal(false)} title="Wipe All Stored Monitoring Data">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-[var(--dm-text-secondary)]">
            This removes locally stored monitoring records, encrypted mailbox connection tokens, and the incidents desk view.
            To monitor again, sign in and add a Gmail or Microsoft mailbox.
          </p>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowWipeModal(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors
                         border-slate-200 text-slate-700 hover:bg-slate-50
                         dark:border-[var(--dm-border)] dark:text-[var(--dm-text-secondary)] dark:hover:bg-white/[0.03]">
              Cancel
            </button>
            <button onClick={handleWipeData} disabled={isWiping}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2">
              {isWiping ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Wiping…</span></>
              ) : (
                <><RiRefreshLine className="w-4 h-4" /><span>Wipe Data</span></>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PrivacyAccessControl;
