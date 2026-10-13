import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { RiGoogleFill, RiMicrosoftFill } from 'react-icons/ri';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { beginGmailSignIn, beginMicrosoftSignIn, passwordSignIn, user } = useAuth();
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('auth') === 'error' ? 'Sign-in failed or expired. Please try again.' : '');
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [providers, setProviders] = useState({ gmail: false, outlook: false });
  useEffect(() => {
    void fetch('/api/health').then(response => response.json()).then(data => setProviders(data.providers || { gmail: false, outlook: false })).catch(() => {});
  }, []);
  useEffect(() => {
    if (user) navigate('/account', { replace: true });
  }, [user, navigate]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await passwordSignIn(username, password, register); }
    catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.'); }
    finally { setBusy(false); setPassword(''); }
  };
  const button = 'w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 dark:border-[var(--dm-border)]';
  const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-transparent dark:border-[var(--dm-border)]';
  return (
    <div className="min-h-screen flex items-center justify-center p-6
                    bg-slate-100 dark:bg-[var(--dm-bg-page)]">

      {/* Dark mode: grid background */}
      <div className="fixed inset-0 pointer-events-none hidden dark:block"
           style={{
             backgroundImage: 'linear-gradient(rgba(100,116,139,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.07) 1px, transparent 1px)',
             backgroundSize: '40px 40px',
           }} />
      <div className="fixed inset-0 pointer-events-none hidden dark:block
                      bg-gradient-to-b from-blue-500/8 via-transparent to-blue-500/5" />

      {/* Card */}
      <div className="relative w-full max-w-md animate-fade-in">

        {/* Glow (dark mode only) */}
        <div className="absolute -inset-px rounded-2xl hidden dark:block
                        bg-gradient-to-b from-blue-500/18 to-transparent blur-sm" />

        <div className="relative rounded-xl border p-8
                        bg-white border-slate-200 shadow-xl
                        dark:bg-[var(--dm-surface-popover)] dark:border-[var(--dm-border)] dark:shadow-[0_24px_48px_rgba(0,0,0,0.6)]">

          {/* Top accent line */}
          <div className="absolute top-0 left-8 right-8 h-px hidden dark:block
                          bg-gradient-to-r from-transparent via-blue-500/35 to-transparent" />

          {/* Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 flex items-center justify-center mb-2">
              <img src="/logo.png" alt="IronInbox" className="w-24 h-24 object-contain" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight dark:text-[var(--dm-text-primary)]">
              IronInbox
            </h1>
            <p className="text-[9px] font-mono font-bold uppercase tracking-[0.25em] text-slate-400 mt-1
                          dark:text-blue-400/50">
              Security Operations Platform
            </p>
          </div>

          {/* Heading */}
          <div className="text-center mb-6">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-secondary)]">
              Sign in to IronInbox
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 dark:text-[var(--dm-text-muted)]">
              Sign in, then choose which email accounts to monitor.
            </p>
          </div>

          {/* Google SSO */}
          <button
            type="button"
            onClick={beginGmailSignIn}
            disabled={busy || !providers.gmail}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg border text-sm font-medium transition-all disabled:opacity-50
                       bg-white border-slate-200 text-slate-700 hover:bg-slate-50
                       dark:bg-[var(--dm-chrome)] dark:border-[var(--dm-border)] dark:text-[var(--dm-text-secondary)] dark:hover:bg-[var(--dm-inset-hover)] dark:hover:text-[var(--dm-text-primary)] dark:hover:border-blue-500/30"
          >
            <RiGoogleFill className="w-4 h-4 text-red-500" />
            Continue with Google
          </button>

          <button className={button + ' mt-3'} disabled={busy || !providers.outlook} onClick={beginMicrosoftSignIn}><RiMicrosoftFill /> Continue with Microsoft</button>
          {!providers.outlook && <p className="text-xs text-slate-500 mt-2">Microsoft connection requires administrator setup.</p>}
          <form onSubmit={submit} className="space-y-3 border-t border-slate-200 mt-5 pt-4 dark:border-[var(--dm-border)] dark:text-[var(--dm-text-primary)]">
            <h2 className="text-sm font-semibold">{register ? 'Create an account' : 'Sign in with username and password'}</h2>
            <label className="block text-sm">Username<input className={input} autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required minLength={3} maxLength={64} pattern="[a-zA-Z0-9._\-]+" /></label>
            <label className="block text-sm">Password<input className={input} type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={12} maxLength={128} /></label>
            {register && <p className="text-xs text-slate-500">Use at least 12 characters. Keep your password safe; password recovery is not available yet.</p>}
            <button className={button + ' bg-blue-600 text-white'} disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
          </form>
          <button className="text-sm text-blue-600 my-4" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Already have an account? Sign in' : 'Create an account with username and password'}</button>

          {/* Error */}
          {error && (
            <div className="mb-4 px-3 py-2.5 rounded-lg text-xs
                            bg-red-50 border border-red-200 text-red-600
                            dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400">
              {error}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Login;
