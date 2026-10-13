import { AppContext } from './useApp';
import React, { useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import {
  FlaggedEmail,
  ReleasedEmail,
  Keyword,
  DetectionOptions,
  DetectionActions,
  EmailDisposition,
  EmailSourceProvider
} from '../types';
import { defaultKeywords } from '../data/defaultKeywords';
import { useSettings } from './useSettings';
import { useAuth } from './useAuth';

const EMPTY_FLAGGED_EMAILS: FlaggedEmail[] = [];
const EMPTY_KEYWORDS: Keyword[] = [];
const EMPTY_RELEASED_EMAILS: ReleasedEmail[] = [];

export type AppIncident = {
  id: string;
  createdTime: string;
  reporter: string;
  subject: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Open' | 'In Progress' | 'Resolved';
  dueDate: string;
  description: string;
  category?: string;
  assignedTo?: string;
  source?: string;
  sourceEmailId?: string;
};

export interface AppContextType {
  flaggedEmails: FlaggedEmail[];
  releasedEmails: ReleasedEmail[];
  keywords: Keyword[];
  detectionOptions: DetectionOptions;
  detectionActions: DetectionActions;
  selectedEmail: FlaggedEmail | null;
  linkedIncidents: AppIncident[];
  setSelectedEmail: (email: FlaggedEmail | null) => void;
  createIncidentFromFlaggedEmail: (
    email: FlaggedEmail,
    options: { dueDate: string; assignedTo?: string }
  ) => AppIncident;
  releaseEmail: (emailId: string) => void;
  toggleStarReleasedEmail: (releasedId: string) => void;
  toggleReadReleasedEmail: (releasedId: string, isRead?: boolean) => void;
  reFlagReleasedEmails: (releasedIds: string[]) => void;
  addKeyword: (keyword: string) => void;
  deleteKeyword: (keywordId: string) => void;
  toggleKeyword: (id: string) => void;
  updateKeyword: (id: string, text: string) => void;
  updateDetectionOptions: (options: Partial<DetectionOptions>) => void;
  updateDetectionActions: (actions: Partial<DetectionActions>) => void;
  syncMailbox: () => Promise<void>;
  mailboxSyncing: boolean;
  mailboxError: string | null;
  lastSyncedAt: string | null;
  isWiped: boolean;
  wipeAllData: () => Promise<void>;
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { riskFlagThreshold } = useSettings();
  const { user, accountIntegrations } = useAuth();
  const [isWiped, setIsWiped] = useState(false);
  const [flaggedEmails, setFlaggedEmails] = useState<FlaggedEmail[]>([]);
  const [releasedEmails, setReleasedEmails] = useState<ReleasedEmail[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>(defaultKeywords);
  const [selectedEmail, setSelectedEmail] = useState<FlaggedEmail | null>(null);
  const [linkedIncidents, setLinkedIncidents] = useState<AppIncident[]>([]);
  const [detectionOptions, setDetectionOptions] = useState<DetectionOptions>({
    caseInsensitive: true,
    matchInSubject: true,
    matchInBody: true,
    wholeWordOnly: false
  });
  const [detectionActions, setDetectionActions] = useState<DetectionActions>({
    flagEmail: true,
    logMatch: true,
    showInDashboard: true
  });
  const [mailboxSyncing, setMailboxSyncing] = useState(false);
  const [mailboxError, setMailboxError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const gradingRef = useRef({ keywords, detectionOptions, riskFlagThreshold, user, accountIntegrations });
  useEffect(() => {
    gradingRef.current = { keywords, detectionOptions, riskFlagThreshold, user, accountIntegrations };
  }, [keywords, detectionOptions, riskFlagThreshold, user, accountIntegrations]);

  const applyMailboxMessages = (messages: Array<FlaggedEmail & { disposition?: EmailDisposition }>) => {
    setFlaggedEmails(messages.filter((message) => message.disposition === 'flagged'));
    setReleasedEmails((previous) => {
      const prior = new Map<string, ReleasedEmail>();
      for (const item of previous) {
        prior.set(item.originalEmail.id, item);
        prior.set(item.id, item);
      }
      return messages.filter((message) => message.disposition === 'safe').map((message) => {
        const existing = prior.get(message.id);
        return {
          id: message.id,
          originalEmail: message,
          releasedAt: existing?.releasedAt || message.review?.at || message.received,
          releasedBy: existing?.releasedBy || message.review?.by || 'Automated analysis',
          starred: existing?.starred ?? false,
          isRead: existing?.isRead ?? true,
        };
      });
    });
  };

  const persistDisposition = async (ids: string[], disposition: EmailDisposition) => {
    const currentUser = gradingRef.current.user;
    if (!currentUser?.uid || ids.length === 0) return;
    try {
      const response = await fetch('/api/emails/disposition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, disposition }),
      });
      if (!response.ok) throw new Error('Review could not be saved. Sync to reload the saved mailbox state.');
    } catch (error) {
      setMailboxError(error instanceof Error ? error.message : 'Unable to save review.');
    }
  };

  const syncInFlight = useRef(false);
  const syncQueued = useRef(false);
  const syncMailbox = async () => {
    const snapshot = gradingRef.current;
    const currentUser = snapshot.user;
    if (!currentUser?.uid) return;
    if (syncInFlight.current) { syncQueued.current = true; return; }
    syncInFlight.current = true;
    setMailboxSyncing(true);
    setMailboxError(null);
    const failures: string[] = [];
    const stillCurrent = () => gradingRef.current.user?.uid === currentUser.uid;
    try {
      for (const mailbox of snapshot.accountIntegrations.filter(item => item.monitoring)) {
        try {
          for (let batch = 0; batch < 10; batch++) {
            if (!stillCurrent()) return;
            const response = await fetch('/api/mailboxes/sync', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mailboxId: mailbox.id, keywords: snapshot.keywords.filter(keyword => keyword.enabled).map(keyword => keyword.value), options: snapshot.detectionOptions, threshold: snapshot.riskFlagThreshold }),
            });
            const data = await response.json() as { lastSyncedAt?: string; error?: string; hasMore?: boolean };
            if (!response.ok) throw new Error(data.error || 'Unable to sync this mailbox.');
            if (!stillCurrent()) return;
            setLastSyncedAt(data.lastSyncedAt || null);
            if (!data.hasMore) break;
          }
        } catch (error) { failures.push(mailbox.accountEmail + ': ' + (error instanceof Error ? error.message : 'Sync failed.')); }
      }
      const response = await fetch('/api/emails');
      if (!response.ok) throw new Error('Unable to load mailbox messages.');
      const data = await response.json() as { messages: Array<FlaggedEmail & { disposition: EmailDisposition }> };
      if (stillCurrent()) {
        applyMailboxMessages(data.messages);
        setMailboxError(failures.length ? failures.join(' ') : null);
      }
    } catch (error) {
      if (stillCurrent()) setMailboxError(error instanceof Error ? error.message : 'Unable to sync mailboxes.');
    } finally {
      syncInFlight.current = false;
      setMailboxSyncing(false);
      if (syncQueued.current) { syncQueued.current = false; void syncMailbox(); }
    }
  };

  const connectedProviders = useMemo(() => {
    const set = new Set<EmailSourceProvider>();
    accountIntegrations.forEach((i) => {
      if (i.connected && i.monitoring) set.add(i.provider as EmailSourceProvider);
    });
    return set;
  }, [accountIntegrations]);

  const mailboxSnapshot = accountIntegrations.map(item => item.id + ':' + item.monitoring).sort().join(',');

  useEffect(() => {
    if (!user) {
      setFlaggedEmails(EMPTY_FLAGGED_EMAILS);
      setReleasedEmails(EMPTY_RELEASED_EMAILS);
      setSelectedEmail(null);
      setLinkedIncidents([]);
      setIsWiped(false);
      setLastSyncedAt(null);
      setMailboxError(null);
      return;
    }
    setFlaggedEmails([]);
    setReleasedEmails([]);
    setKeywords(defaultKeywords);
    setSelectedEmail(null);
    setLinkedIncidents([]);
    setIsWiped(false);
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    void syncMailbox();
    // First load for this signed-in mailbox; settings-driven sync is debounced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, mailboxSnapshot]);

  useEffect(() => {
    if (!user?.uid) return;
    const timer = window.setTimeout(() => { void syncMailbox(); }, 1500);
    return () => window.clearTimeout(timer);
    // Re-grade after keyword, option, or threshold edits. Login already syncs immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keywords, detectionOptions, riskFlagThreshold]);

  useEffect(() => {
    const connectedIds = new Set(accountIntegrations.map(account => account.id));
    setFlaggedEmails(items => items.filter(item => item.mailboxId && connectedIds.has(item.mailboxId)));
    setReleasedEmails(items => items.filter(item => item.originalEmail.mailboxId && connectedIds.has(item.originalEmail.mailboxId)));
    setSelectedEmail(item => item?.mailboxId && connectedIds.has(item.mailboxId) ? item : null);
    setLinkedIncidents(items => items.filter(item => !item.sourceEmailId || connectedIds.has(item.sourceEmailId.split(':')[0])));
  }, [accountIntegrations]);

  const displayedFlaggedEmails = useMemo(() => {
    const base = isWiped ? EMPTY_FLAGGED_EMAILS : flaggedEmails;
    if (!user) return base;
    if (accountIntegrations.length === 0) return [];
    if (connectedProviders.size === 0) return [];
    return base.filter((e) => connectedProviders.has(e.sourceProvider) && accountIntegrations.some(account => account.id === e.mailboxId && account.monitoring));
  }, [isWiped, flaggedEmails, user, accountIntegrations, connectedProviders]);

  const displayedKeywords = isWiped ? EMPTY_KEYWORDS : keywords;
  const displayedReleasedEmails = useMemo(() => {
    const base = isWiped ? EMPTY_RELEASED_EMAILS : releasedEmails;
    if (!user) return base;
    if (accountIntegrations.length === 0) return [];
    if (connectedProviders.size === 0) return [];
    return base.filter((r) => connectedProviders.has(r.originalEmail.sourceProvider) && accountIntegrations.some(account => account.id === r.originalEmail.mailboxId && account.monitoring));
  }, [isWiped, releasedEmails, user, accountIntegrations, connectedProviders]);

  const displayedSelectedEmail = !isWiped && selectedEmail && accountIntegrations.some(account => account.id === selectedEmail.mailboxId && account.monitoring) ? selectedEmail : null;

  const wipeAllData = async () => {
    if (user?.uid) {
      const response = await fetch('/api/data/wipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) throw new Error('Unable to wipe mailbox data. Please try again.');
    }
    setIsWiped(true);
    setLinkedIncidents([]);
    setSelectedEmail(null);
    setFlaggedEmails([]);
    setReleasedEmails([]);
  };

  const releaseEmail = (emailId: string) => {
    const emailToRelease = flaggedEmails.find(email => email.id === emailId);
    if (emailToRelease) {
      const releasedEmail: ReleasedEmail = {
        id: emailToRelease.id,
        originalEmail: { ...emailToRelease, disposition: 'safe' },
        releasedAt: new Date().toLocaleString(),
        releasedBy: user?.email || 'analyst',
        starred: false,
        isRead: false
      };

      setReleasedEmails(prev => [releasedEmail, ...prev]);
      setFlaggedEmails(prev => prev.filter(email => email.id !== emailId));
      void persistDisposition([emailId], 'safe');

      if (selectedEmail?.id === emailId) {
        setSelectedEmail(null);
      }
    }
  };

  const addKeyword = (keyword: string) => {
    const newKeyword: Keyword = {
      id: Date.now().toString(),
      value: keyword,
      createdAt: new Date().toISOString(),
      enabled: true
    };
    setKeywords(prev => [...prev, newKeyword]);
  };

  const deleteKeyword = (keywordId: string) => {
    setKeywords(prev => prev.filter(kw => kw.id !== keywordId));
  };

  const toggleKeyword = (keywordId: string) => {
    setKeywords(prev =>
      prev.map(kw =>
        kw.id === keywordId ? { ...kw, enabled: !kw.enabled } : kw
      )
    );
  };

  const updateKeyword = (keywordId: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setKeywords(prev =>
      prev.map(kw =>
        kw.id === keywordId ? { ...kw, value: trimmed } : kw
      )
    );
  };

  const toggleStarReleasedEmail = (releasedId: string) => {
    setReleasedEmails(prev =>
      prev.map(released =>
        released.id === releasedId ? { ...released, starred: !released.starred } : released
      )
    );
  };

  const toggleReadReleasedEmail = (releasedId: string, isRead?: boolean) => {
    setReleasedEmails(prev =>
      prev.map(released => {
        if (released.id !== releasedId) return released;
        const nextRead = typeof isRead === 'boolean' ? isRead : !released.isRead;
        return { ...released, isRead: nextRead };
      })
    );
  };

  const reFlagReleasedEmails = (releasedIds: string[]) => {
    if (releasedIds.length === 0) return;

    const toReflag = releasedEmails.filter(r => releasedIds.includes(r.id));
    if (toReflag.length === 0) return;

    setFlaggedEmails(prev => [...toReflag.map(r => ({ ...r.originalEmail, disposition: 'flagged' as const })), ...prev]);
    setReleasedEmails(prev => prev.filter(r => !releasedIds.includes(r.id)));
    void persistDisposition(toReflag.map((item) => item.originalEmail.id), 'flagged');
  };

  const updateDetectionOptions = (options: Partial<DetectionOptions>) => {
    setDetectionOptions(prev => ({ ...prev, ...options }));
  };

  const updateDetectionActions = (actions: Partial<DetectionActions>) => {
    setDetectionActions(prev => ({ ...prev, ...actions }));
  };

  const createIncidentFromFlaggedEmail = (
    email: FlaggedEmail,
    options: { dueDate: string; assignedTo?: string }
  ) => {
    const now = new Date();
    const suffix = String(now.getTime()).slice(-4);
    const incident: AppIncident = {
      id: `INC-LINK-${suffix}`,
      createdTime: 'Just now',
      reporter: 'Flagged Email Workflow',
      subject: `Email Threat Investigation: ${email.subject}`,
      priority: email.riskLevel,
      status: 'Open',
      dueDate: options.dueDate,
      description: `A flagged email was automatically escalated for investigation after detection controls identified multiple suspicious indicators in the message context and content. The email was received from ${email.sender} on ${email.received} and classified as ${email.riskLevel.toLowerCase()} risk based on the triggered rules.\n\nInitial analysis found the following indicators: ${email.signals.map(signal => `${signal.type} match "${signal.value}"`).join(', ')}. Analysts should validate sender legitimacy, review embedded links or attachments, and confirm whether recipient interaction occurred before containment and remediation actions are finalized.`,
      category: 'Email Security',
      assignedTo: options.assignedTo || 'SOC Team',
      source: 'Flagged Email',
      sourceEmailId: email.id
    };

    setLinkedIncidents(prev => [incident, ...prev]);
    return incident;
  };

  return (
    <AppContext.Provider
      value={{
        flaggedEmails: displayedFlaggedEmails,
        releasedEmails: displayedReleasedEmails,
        keywords: displayedKeywords,
        detectionOptions,
        detectionActions,
        selectedEmail: displayedSelectedEmail,
        linkedIncidents,
        setSelectedEmail,
        createIncidentFromFlaggedEmail,
        releaseEmail,
        toggleStarReleasedEmail,
        toggleReadReleasedEmail,
        reFlagReleasedEmails,
        addKeyword,
        deleteKeyword,
        toggleKeyword,
        updateKeyword,
        updateDetectionOptions,
        updateDetectionActions,
        syncMailbox,
        mailboxSyncing,
        mailboxError,
        lastSyncedAt,
        isWiped,
        wipeAllData
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
