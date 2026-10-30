import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';
import { RiGoogleFill, RiMicrosoftFill } from 'react-icons/ri';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const {beginGmailSignIn, beginMicrosoftSignIn, passwordSignIn, supabaseSignIn, supabaseRegister, user,} = useAuth();
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('auth') === 'error' ? 'Sign-in failed or expired. Please try again.' : '');
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [authMode, setAuthMode] = useState<'supabase' | 'legacy'>('supabase');
  const [success, setSuccess] = useState('');
  const [providers, setProviders] = useState({ gmail: false, outlook: false });
  useEffect(() => {
    void fetch('/api/health').then(response => response.json()).then(data => setProviders(data.providers || { gmail: false, outlook: false })).catch(() => {});
  }, []);
  useEffect(() => {
    if (user) navigate('/account', { replace: true });
  }, [user, navigate]);
  
const submit = async (event: React.FormEvent) => {
  event.preventDefault();
  setBusy(true);
  setError('');
  setSuccess('');

  try {
    if (authMode === 'legacy') {
      await passwordSignIn(username, password, register);
    } else if (register) {
      const result = await supabaseRegister(
        username,
        password,
        firstName,
        lastName
      );

      if (result.requiresConfirmation) {
        setSuccess('Account created! Check your email to confirm your account before signing in.');
      } else {
        setSuccess('Account created successfully! You can now sign in.');
      }

      setRegister(false);
    } else {
      await supabaseSignIn(username, password);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Authentication failed.');
  } finally {
    setBusy(false);
    setPassword('');
  }
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
          
<div className="border-t border-slate-200 mt-5 pt-4 dark:border-[var(--dm-border)]">
  <div className="flex gap-2 mb-4">
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setAuthMode('supabase');
        setRegister(false);
        setError('');
        setSuccess('');
        setUsername('');
        setPassword('');
      }}
      className={`${button} ${authMode === 'supabase' ? 'bg-blue-600 text-white' : ''}`}
    >
      Email
    </button>
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setAuthMode('legacy');
        setRegister(false);
        setError('');
        setSuccess('');
        setUsername('');
        setPassword('');
      }}
      className={`${button} ${authMode === 'legacy' ? 'bg-blue-600 text-white' : ''}`}
    >
      Username
    </button>
  </div>

  <form onSubmit={submit} className="space-y-3 dark:text-[var(--dm-text-primary)]">
    <h2 className="text-sm font-semibold">
      {register ? 'Create an account' : authMode === 'supabase' ? 'Sign in with email and password' : 'Sign in with username and password'}
    </h2>

    {authMode === 'supabase' && register && (
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          First name
          <input className={input} value={firstName} onChange={event => setFirstName(event.target.value)} required maxLength={100} autoComplete="given-name" />
        </label>
        <label className="block text-sm">
          Last name
          <input className={input} value={lastName} onChange={event => setLastName(event.target.value)} required maxLength={100} autoComplete="family-name" />
        </label>
      </div>
    )}

    <label className="block text-sm">
      {authMode === 'supabase' ? 'Email' : 'Username'}
      <input
        className={input}
        type={authMode === 'supabase' ? 'email' : 'text'}
        autoComplete={authMode === 'supabase' ? 'email' : 'username'}
        value={username}
        onChange={event => setUsername(event.target.value)}
        required
        minLength={authMode === 'legacy' ? 3 : undefined}
        maxLength={authMode === 'legacy' ? 64 : 254}
        pattern={authMode === 'legacy' ? '[a-zA-Z0-9._-]+' : undefined}
      />
    </label>

    <label className="block text-sm">
      Password
      <input
        className={input}
        type="password"
        autoComplete={register ? 'new-password' : 'current-password'}
        value={password}
        onChange={event => setPassword(event.target.value)}
        required
        minLength={12}
        maxLength={128}
      />
    </label>

    {register && (
      <p className="text-xs text-slate-500">
        Use at least 12 characters. Keep your password safe.
      </p>
    )}

    <button className={button + ' bg-blue-600 text-white'} disabled={busy}>
      {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
    </button>
  </form>

  <button
    type="button"
    className="text-sm text-blue-600 my-4"
    disabled={busy}
    onClick={() => {
      setRegister(!register);
      setError('');
      setSuccess('');
      setPassword('');
    }}
  >
    {register ? 'Already have an account? Sign in' : 'Create an account'}
  </button>
</div>

{success && (
  <div className="mb-4 px-3 py-2.5 rounded-lg text-xs bg-green-50 border border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-900/50 dark:text-green-400">
    {success}
  </div>
)}


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
