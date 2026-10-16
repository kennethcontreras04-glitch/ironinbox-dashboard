import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { signIn, signUp, user } = useAuth();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    setError('');
    setMessage('');

    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(email, password);

        setMessage(
          'Account created. Check your email to confirm your account before signing in.'
        );
      } else {
        await signIn(email, password);
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(current => (current === 'signin' ? 'signup' : 'signin'));
    setError('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6
                 bg-slate-100 dark:bg-[var(--dm-bg-page)]"
    >
      {/* Dark mode grid background */}
      <div
        className="fixed inset-0 pointer-events-none hidden dark:block"
        style={{
          backgroundImage:
            'linear-gradient(rgba(100,116,139,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.07) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div
        className="fixed inset-0 pointer-events-none hidden dark:block
                   bg-gradient-to-b from-blue-500/8 via-transparent to-blue-500/5"
      />

      <div className="relative w-full max-w-md animate-fade-in">
        <div
          className="absolute -inset-px rounded-2xl hidden dark:block
                     bg-gradient-to-b from-blue-500/18 to-transparent blur-sm"
        />

        <div
          className="relative rounded-xl border p-8
                     bg-white border-slate-200 shadow-xl
                     dark:bg-[var(--dm-surface-popover)]
                     dark:border-[var(--dm-border)]
                     dark:shadow-[0_24px_48px_rgba(0,0,0,0.6)]"
        >
          <div
            className="absolute top-0 left-8 right-8 h-px hidden dark:block
                       bg-gradient-to-r from-transparent via-blue-500/35 to-transparent"
          />

          {/* Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-24 h-24 flex items-center justify-center mb-2">
              <img
                src="/logo.png"
                alt="IronInbox"
                className="w-24 h-24 object-contain"
              />
            </div>

            <h1
              className="text-xl font-bold text-slate-900 tracking-tight
                         dark:text-[var(--dm-text-primary)]"
            >
              IronInbox
            </h1>

            <p
              className="text-[9px] font-mono font-bold uppercase
                         tracking-[0.25em] text-slate-400 mt-1
                         dark:text-blue-400/50"
            >
              Security Operations Platform
            </p>
          </div>

          {/* Heading */}
          <div className="text-center mb-6">
            <h2
              className="text-sm font-semibold text-slate-800
                         dark:text-[var(--dm-text-secondary)]"
            >
              {mode === 'signin'
                ? 'Sign in to your account'
                : 'Create your account'}
            </h2>

            <p
              className="text-xs text-slate-400 mt-1.5
                         dark:text-[var(--dm-text-muted)]"
            >
              {mode === 'signin'
                ? 'Access the IronInbox security dashboard.'
                : 'Create an IronInbox account to get started.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-slate-600 mb-1.5
                           dark:text-[var(--dm-text-secondary)]"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="name@example.com"
                disabled={loading}
                className="w-full rounded-lg border px-3 py-2.5 text-sm
                           bg-white border-slate-200 text-slate-900
                           focus:outline-none focus:ring-2 focus:ring-blue-500/30
                           focus:border-blue-500
                           disabled:opacity-50
                           dark:bg-[var(--dm-chrome)]
                           dark:border-[var(--dm-border)]
                           dark:text-[var(--dm-text-primary)]"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-slate-600 mb-1.5
                           dark:text-[var(--dm-text-secondary)]"
              >
                Password
              </label>

              <input
                id="password"
                type="password"
                autoComplete={
                  mode === 'signin' ? 'current-password' : 'new-password'
                }
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Enter your password"
                disabled={loading}
                className="w-full rounded-lg border px-3 py-2.5 text-sm
                           bg-white border-slate-200 text-slate-900
                           focus:outline-none focus:ring-2 focus:ring-blue-500/30
                           focus:border-blue-500
                           disabled:opacity-50
                           dark:bg-[var(--dm-chrome)]
                           dark:border-[var(--dm-border)]
                           dark:text-[var(--dm-text-primary)]"
              />
            </div>

            {/* Confirm password - signup only */}
            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-medium text-slate-600 mb-1.5
                             dark:text-[var(--dm-text-secondary)]"
                >
                  Confirm Password
                </label>

                <input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={event =>
                    setConfirmPassword(event.target.value)
                  }
                  placeholder="Confirm your password"
                  disabled={loading}
                  className="w-full rounded-lg border px-3 py-2.5 text-sm
                             bg-white border-slate-200 text-slate-900
                             focus:outline-none focus:ring-2
                             focus:ring-blue-500/30 focus:border-blue-500
                             disabled:opacity-50
                             dark:bg-[var(--dm-chrome)]
                             dark:border-[var(--dm-border)]
                             dark:text-[var(--dm-text-primary)]"
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                className="px-3 py-2.5 rounded-lg text-xs
                           bg-red-50 border border-red-200 text-red-600
                           dark:bg-red-950/30 dark:border-red-900/50
                           dark:text-red-400"
              >
                {error}
              </div>
            )}

            {/* Success */}
            {message && (
              <div
                className="px-3 py-2.5 rounded-lg text-xs
                           bg-green-50 border border-green-200 text-green-700
                           dark:bg-green-950/30 dark:border-green-900/50
                           dark:text-green-400"
              >
                {message}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold
                         bg-blue-600 text-white hover:bg-blue-700
                         transition-all disabled:opacity-50
                         disabled:cursor-not-allowed"
            >
              {loading
                ? 'Please wait...'
                : mode === 'signin'
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>

          {/* Switch sign-in / signup */}
          <div className="text-center mt-5">
            <span
              className="text-xs text-slate-400
                         dark:text-[var(--dm-text-muted)]"
            >
              {mode === 'signin'
                ? "Don't have an account? "
                : 'Already have an account? '}
            </span>

            <button
              type="button"
              onClick={switchMode}
              disabled={loading}
              className="text-xs font-medium text-blue-600 hover:text-blue-700
                         dark:text-blue-400 dark:hover:text-blue-300"
            >
              {mode === 'signin' ? 'Create Account' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;