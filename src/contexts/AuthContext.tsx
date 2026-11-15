import { AuthContext } from './useAuth';
import React, { useEffect, useState, type ReactNode } from 'react';
import { useSettings } from './useSettings';

export type IntegrationProvider = 'gmail' | 'outlook';
export interface AccountIntegration {
  id: string; provider: IntegrationProvider; connected: boolean; accountEmail: string;
  monitoring: boolean; lastSyncedAt: string | null;
}
interface AppUser {uid: string; email: string; displayName: string; photoURL: string; loginProvider: IntegrationProvider | 'password' | 'supabase';}
interface Status extends AppUser { mailboxes: AccountIntegration[]; }
export interface AuthContextType {
  user: AppUser | null; monitoredEmail: string | null; loading: boolean;
  accountIntegrations: AccountIntegration[]; beginGmailSignIn: () => void; beginMicrosoftSignIn: () => void;
  addMailbox: (provider: IntegrationProvider, same?: boolean, mailboxId?: string) => void;
  passwordSignIn: (username: string, password: string, register: boolean) => Promise<void>;
  supabaseSignIn: (email: string, password: string) => Promise<void>;supabaseRegister: (
  email: string,
  password: string,
  firstName: string,
  lastName: string
) => Promise<{ requiresConfirmation: boolean }>;
  signOut: () => Promise<void>; refreshAccounts: () => Promise<void>;
  disconnectIntegration: (id: string) => Promise<void>;
  setMonitoring: (id: string, monitoring: boolean) => Promise<void>;
}
async function mutate(path: string, body: object = {}) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json() as { error?: string };
  if (!response.ok) throw new Error(data.error || 'Unable to complete the request. Please retry.');
}
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [accountIntegrations, setAccounts] = useState<AccountIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const { updateProfile } = useSettings();
  const refreshAccounts = async () => {
    const response = await fetch('/api/auth/status');
    if (response.status === 401) { setUser(null); setAccounts([]); return; }
    const data = await response.json() as Status & { error?: string };
    if (!response.ok) throw new Error(data.error || 'Unable to load your accounts.');
    setUser(previous => previous?.uid === data.uid ? previous : { uid: data.uid, email: data.email,
      displayName: data.displayName, photoURL: '', loginProvider: data.loginProvider });
    setAccounts(data.mailboxes);
  };
  useEffect(() => {
    let active = true;
    void fetch('/api/auth/status').then(async response => {
      if (!response.ok) return;
      const data = await response.json() as Status;
      if (active) {
        setUser({ uid: data.uid, email: data.email, displayName: data.displayName, photoURL: '', loginProvider: data.loginProvider });
        setAccounts(data.mailboxes);
      }
    }).catch(() => { /* Login remains available when the API is unavailable. */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (user) updateProfile({ name: user.displayName, email: user.email, avatar: user.photoURL, role: 'User' });
  }, [user, updateProfile]);
  const signOut = async () => {
    await mutate('/api/auth/logout');
    setUser(null); setAccounts([]);
  };
  const passwordSignIn = async (username: string, password: string, register: boolean) => {
    await mutate(register ? '/api/auth/register' : '/api/auth/password', { username, password });
    await refreshAccounts();
  };
  
const supabaseSignIn = async (email: string, password: string) => {
  await mutate('/api/auth/supabase/login', { email, password });
  await refreshAccounts();
};

const supabaseRegister = async (
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<{ requiresConfirmation: boolean }> => {
  const response = await fetch('/api/auth/supabase/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      email,
      password,
      firstName,
      lastName,
    }),
  });

  const data = await response.json() as {
    registered?: boolean;
    requiresConfirmation?: boolean;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error || 'Unable to create your account.');
  }

  return {
    requiresConfirmation: data.requiresConfirmation !== false,
  };
};

  const disconnectIntegration = async (mailboxId: string) => { await mutate('/api/mailboxes/disconnect', { mailboxId }); await refreshAccounts(); };
  const setMonitoring = async (mailboxId: string, monitoring: boolean) => { await mutate('/api/mailboxes/monitoring', { mailboxId, monitoring }); await refreshAccounts(); };
  return <AuthContext.Provider value={{
    user, monitoredEmail: accountIntegrations.find(item => item.monitoring)?.accountEmail ?? null, loading, accountIntegrations,
    beginGmailSignIn: () => window.location.assign('/api/auth/gmail/start'),
    beginMicrosoftSignIn: () => window.location.assign('/api/auth/outlook/start'),
    addMailbox: (provider, same = false, mailboxId) => window.location.assign(`/api/${provider}/connect?${new URLSearchParams({ ...(same ? { same: '1' } : {}), ...(mailboxId ? { mailboxId } : {}) })}`),
    passwordSignIn, supabaseSignIn, supabaseRegister, signOut, refreshAccounts, disconnectIntegration, setMonitoring,
  }}>{children}</AuthContext.Provider>;
};
