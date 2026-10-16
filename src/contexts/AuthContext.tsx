import React, { useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { AuthContext } from './useAuth';
// import { useSettings } from './useSettings'; // Temporarily removed during authentication migration
import { supabase } from '../lib/supabase';

export type IntegrationProvider = 'gmail';

export interface AccountIntegration {
  id: string;
  provider: IntegrationProvider;
  connected: boolean;
  accountEmail: string | null;
  monitoring: boolean;
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
  disconnectIntegration: (provider: IntegrationProvider) => void;
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
      setMonitoredEmail(null);
      return;
    }

    let active = true;

    void fetch('/api/gmail/status')
      .then(async response => {
        if (!response.ok) return;

        const account = (await response.json()) as {
          connected: boolean;
          email: string;
        };

        if (active && account.connected) {
          setMonitoredEmail(account.email);
        }
      })
      .catch(() => {
        // IronInbox authentication still works if Gmail/API is unavailable.
      });

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

  const beginGmailSignIn = () => {
  window.alert(
    'Gmail integration will be available after the authentication migration.'
  );
};

const disconnectIntegration = (_provider: IntegrationProvider) => {
  window.alert(
    'Gmail integration will be available after the authentication migration.'
  );
};

  const accountIntegrations: AccountIntegration[] = [];

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