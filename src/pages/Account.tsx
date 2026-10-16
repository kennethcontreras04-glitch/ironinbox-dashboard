import React from 'react';

import Header from '../components/layout/Header';
import { RiCheckLine, RiDeleteBinLine } from 'react-icons/ri';
import { useSettings } from '../contexts/useSettings';
import { useAuth } from '../contexts/useAuth';

const Account: React.FC = () => {

  const { profile } = useSettings();
  const {
  user,
  accountIntegrations,
  beginGmailSignIn,
  disconnectIntegration
} = useAuth();

  const panel =
    'bg-white border border-slate-200 rounded-xl p-6 shadow-sm dark:bg-[var(--dm-surface-card)] dark:border-[var(--dm-border)]';

  return (
    <div className="flex-1 overflow-auto bg-slate-50 dark:bg-[var(--dm-bg-page)]">
      <Header title="Account" />

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Account info — reflects signed-in user + profile (updated from auth) */}
        <div className={panel}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-[var(--dm-text-primary)] mb-4">
            Account Info
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            <img
              src={profile.avatar || '/logo.png'}
              alt=""
              className="w-20 h-20 rounded-full border border-slate-200 dark:border-[var(--dm-border)] object-cover"
            />
            <div className="min-w-0">
              <p className="text-lg font-semibold text-slate-900 dark:text-[var(--dm-text-primary)]">
                {profile.name}
              </p>
              <p className="text-sm text-slate-500 dark:text-[var(--dm-text-muted)] mt-0.5">{profile.email}</p>

              {user?.email && user.email !== profile.email && (
                <p className="text-[10px] font-mono text-slate-400 mt-2 dark:text-[var(--dm-text-muted)]">
                  Session: {user.email}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Current Gmail connection */}
        <div className={panel}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-[var(--dm-text-primary)] mb-1">
            Connected Accounts
          </h2>
          <p className="text-xs text-slate-400 mb-4 dark:text-[var(--dm-text-muted)]">
            Gmail is connected through Google OAuth with read-only mailbox access.
          </p>
          <ul className="space-y-4">
            {accountIntegrations.map((int) => (
              <li
                key={int.provider}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100 last:border-0 last:pb-0 dark:border-[var(--dm-border)]"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 text-emerald-600 dark:text-emerald-400">
                    <RiCheckLine className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-primary)]">
                      Gmail
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[var(--dm-text-muted)] mt-0.5">
                      Email:{' '}
                      {int.connected && int.accountEmail ? int.accountEmail : 'Not connected'}
                    </p>

                  </div>
                </div>
                <div className="flex items-center gap-2 sm:flex-shrink-0">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${
                      int.connected
                        ? 'border-emerald-500/40 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800/50'
                        : 'border-rose-500/35 text-rose-700 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800/50'
                    }`}
                  >
                    {int.connected ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    type="button"
                    onClick={() => disconnectIntegration(int.provider)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    <RiDeleteBinLine className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
            {accountIntegrations.length === 0 && (
  <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <p className="text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-primary)]">
        Gmail
      </p>

      <p className="text-xs text-slate-500 dark:text-[var(--dm-text-muted)] mt-1">
        No Gmail inbox is currently connected.
      </p>
    </div>

    <button
      type="button"
      onClick={beginGmailSignIn}
      className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold rounded-lg
                 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
    >
      Connect Gmail
    </button>
  </li>
)}
          </ul>
        </div>

        <div className={panel}>
  <h2 className="text-sm font-semibold text-slate-900 dark:text-[var(--dm-text-primary)] mb-2">
    Gmail Integration
  </h2>

            <p className="text-xs text-slate-500 dark:text-[var(--dm-text-muted)] leading-relaxed">
                  Connecting Gmail allows IronInbox to securely monitor your mailbox using
                  Google OAuth. Disconnecting Gmail removes the mailbox connection from
                  IronInbox but does not delete messages from Gmail or sign you out of your
                  IronInbox account.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Account;
