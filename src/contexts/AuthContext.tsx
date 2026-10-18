import React, { useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { AuthContext } from './useAuth';
// import { useSettings } from './useSettings'; // Temporarily removed during authentication migration
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';

export type IntegrationProvider = 'gmail';

export interface AccountIntegration {
  id: string;
  provider: IntegrationProvider;
  connected: boolean;
  monitoring: boolean;
  accountEmail: string | null;
}

export interface IronInboxUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}

export interface AuthContextType {
  // IronInbox account
  user: IronInboxUser | null;
  loading: boolean;

  // Supabase authentication
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;

  // Gmail integration
  monitoredEmail: string | null;
  accountIntegrations: AccountIntegration[];
  beginGmailSignIn: () => void;
  disconnectIntegration: (provider: IntegrationProvider) => Promise<void>;
}

const mapSupabaseUser = (supabaseUser: User): IronInboxUser => ({
  uid: supabaseUser.id,
  email: supabaseUser.email ?? '',
  displayName:
    supabaseUser.user_metadata?.display_name ??
    supabaseUser.email?.split('@')[0] ??
    'User',
  photoURL: supabaseUser.user_metadata?.avatar_url ?? '',
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // IronInbox account from Supabase
  const [user, setUser] = useState<IronInboxUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Gmail is now an integration, NOT the logged-in IronInbox user
  const [monitoredEmail, setMonitoredEmail] = useState<string | null>(null);

  // const { updateProfile } = useSettings();

  // Restore Supabase session and listen for auth changes
  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!active) return;

      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setLoading(false);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      setUser(session?.user ? mapSupabaseUser(session.user) : null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Check whether Gmail is connected
 useEffect(() => {
  if (!user) {
    return;
  }

  let active = true;

  const checkGmailStatus = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        return;
      }

      const response = await fetch('/api/gmail/status', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        console.error(
          'Gmail status failed:',
          response.status,
          await response.text()
        );
        return;
      }

      const account = (await response.json()) as {
        connected: boolean;
        email?: string;
      };

      if (active) {
        setMonitoredEmail(
          account.connected ? account.email ?? null : null
        );
      }
    } catch (error) {
      console.error('Failed to check Gmail status:', error);
    }
  };

  void checkGmailStatus();

  return () => {
    active = false;
  };
}, [user]);

  // Update the existing IronInbox profile context - temporarily removed during authentication migration
  // useEffect(() => {
  //   if (!user) return;

  //   updateProfile({
  //     name: user.displayName,
  //     email: user.email,
  //     avatar: user.photoURL,
  //     role: 'User',
  //   });
  // }, [user, updateProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    setUser(null);
    setMonitoredEmail(null);
  };

  const beginGmailSignIn = async () => {
  const response = await apiFetch('/api/gmail/connect/start', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error || 'Unable to start Gmail connection.');
  }

  const { authorizationUrl } = await response.json();

  window.location.assign(authorizationUrl);
};

const disconnectIntegration = async (provider: IntegrationProvider) => {
  if (provider !== 'gmail') return;

  const response = await apiFetch('/api/gmail/status');

  if (!response.ok) {
    throw new Error('Unable to retrieve Gmail connection.');
  }

  const data = await response.json();

  const gmail = data.mailboxes?.find(
    (mailbox: { provider: string }) => mailbox.provider === 'gmail'
  );

  if (!gmail) {
    throw new Error('No Gmail account is connected.');
  }

  const disconnectResponse = await apiFetch('/api/gmail/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mailboxId: gmail.id }),
  });

  if (!disconnectResponse.ok) {
    throw new Error('Unable to disconnect Gmail.');
  }

  setMonitoredEmail(null);
};

  //const accountIntegrations: AccountIntegration[] = [];

  const accountIntegrations: AccountIntegration[] =
  user && monitoredEmail
    ? [
        {
          id: monitoredEmail,
          provider: 'gmail',
          connected: true,
          monitoring: true,
          accountEmail: monitoredEmail,
        },
      ]
    : [];

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        monitoredEmail,
        accountIntegrations,
        beginGmailSignIn,
        disconnectIntegration,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};