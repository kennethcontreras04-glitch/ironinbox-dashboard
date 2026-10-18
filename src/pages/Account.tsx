import React, { useEffect, useState } from 'react';

import Header from '../components/layout/Header';
import { RiCheckLine, RiDeleteBinLine } from 'react-icons/ri';
import { useSettings } from '../contexts/useSettings';
import { useAuth } from '../contexts/useAuth';

const Account: React.FC = () => {

  const { profile } = useSettings();
  const { user, accountIntegrations, addMailbox, disconnectIntegration, setMonitoring } = useAuth();

  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('connection') === 'error' ? 'Mailbox connection failed or expired. Please try again and grant read-only access.' : '');
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState({ gmail: false, outlook: false });
  useEffect(() => {
    void fetch('/api/health').then(response => response.json()).then(data => setProviders(data.providers || { gmail: false, outlook: false })).catch(() => {});
  }, []);
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to update this account.'); }
    finally { setBusy(false); }
  };
  const panel = 'bg-white border border-slate-200 rounded-xl p-6 dark:bg-[var(--dm-surface-card)] dark:border-[var(--dm-border)]';
  const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-[var(--dm-border)]';
  const socialProvider = user?.loginProvider === 'gmail' || user?.loginProvider === 'outlook' ? user.loginProvider : null;
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

      <section className={panel + ' dark:text-[var(--dm-text-primary)]'}>
        <h2 className="font-semibold mb-2">{accountIntegrations.length ? 'Add another email account' : 'Choose an email account to monitor'}</h2>
        {!accountIntegrations.length && socialProvider && <div className="mb-4 space-y-2">
          <p className="text-sm">Would you like to monitor {user?.email}, or add a different account?</p>
          <button className={`${button} bg-blue-600 text-white`} disabled={busy || !providers[socialProvider]} onClick={() => addMailbox(socialProvider, true)}>Monitor this email account</button>
          <p className="text-xs text-slate-500">You will be asked to grant mailbox access. To use a different account, choose a provider below.</p>
        </div>}
        {!accountIntegrations.length && !socialProvider && <p className="text-sm mb-4">Add the email account you want to monitor.</p>}
        <div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy || !providers.gmail} onClick={() => addMailbox('gmail')}>Add Gmail account</button>
          <button className={button} disabled={busy || !providers.outlook} onClick={() => addMailbox('outlook')}>Add Microsoft account</button>
        </div>
        {!providers.outlook && <p className="text-xs text-slate-500 mt-3">Microsoft connection requires administrator setup.</p>}
      </section>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        {/* Connected mailbox controls */}
        <div className={panel}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-[var(--dm-text-primary)] mb-1">
            Connected Accounts
          </h2>
          <p className="text-xs text-slate-400 mb-4 dark:text-[var(--dm-text-muted)]">
            Each mailbox grants its own read-only permission, independently of your app login.
          </p>
          <ul className="space-y-4">
            {accountIntegrations.map((int) => (
              <li
                key={int.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100 last:border-0 last:pb-0 dark:border-[var(--dm-border)]"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 text-emerald-600 dark:text-emerald-400">
                    <RiCheckLine className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-primary)]">
                      {int.provider === 'gmail' ? 'Gmail' : 'Microsoft Outlook'}
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
                    {int.monitoring ? 'Monitoring' : 'Paused'}
                  </span>
                  <button className={button} disabled={busy} onClick={() => addMailbox(int.provider, false, int.id)}>Reconnect</button>
                  <button className={button} disabled={busy} onClick={() => void act(() => setMonitoring(int.id, !int.monitoring))}>{int.monitoring ? 'Pause' : 'Resume'}</button>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => void act(() => disconnectIntegration(int.id))}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    <RiDeleteBinLine className="w-3.5 h-3.5" />
                    Disconnect
                  </button>
                </div>
              </li>
            ))}
            {accountIntegrations.length === 0 && (
              <li className="text-xs text-slate-400 dark:text-[var(--dm-text-muted)]">
                No mailboxes connected yet.
              </li>
            )}
          </ul>
        </div>

        <div className={panel}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-[var(--dm-text-primary)] mb-2">
            Disconnect an Account
          </h2>
          <p className="text-xs text-slate-500 dark:text-[var(--dm-text-muted)] leading-relaxed">
            Disconnect removes the selected mailbox’s saved tokens and monitoring records without signing you out.
            Signing out keeps your mailbox connections for your next visit. Disconnect does not delete emails or revoke provider consent; you can revoke consent in your Google or Microsoft account settings.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Account;
