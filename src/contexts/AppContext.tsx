import { AppContext } from './useApp';
import React, { useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import {
  FlaggedEmail,
  ReleasedEmail,
  Keyword,
  DetectionOptions,
  DetectionActions,
  EmailDisposition,
  EmailSourceProvider,
  Incident,
  AppNotification,
  WorkspaceSaveStatus,
} from '../types';
import { defaultKeywords } from '../data/defaultKeywords';
import { useSettings } from './useSettings';
import { useAuth } from './useAuth';
import { createIncidentFromEmail, createIncidentId, incidentForEmail } from '../utils/incidents';
import { buildNotifications } from '../utils/notifications';

const EMPTY_FLAGGED_EMAILS: FlaggedEmail[] = [];
const EMPTY_KEYWORDS: Keyword[] = [];
const EMPTY_RELEASED_EMAILS: ReleasedEmail[] = [];
const DEFAULT_OPTIONS: DetectionOptions = {
  caseInsensitive: true,
  matchInSubject: true,
  matchInBody: true,
  wholeWordOnly: false,
};
const DEFAULT_ACTIONS: DetectionActions = {
  flagEmail: true,
  logMatch: true,
  showInDashboard: true,
};

type WorkspacePayload = {
  keywords: Keyword[];
  detectionOptions: DetectionOptions;
  detectionActions: DetectionActions;
  riskThreshold: number;
  incidents: Incident[];
};

function workspaceLocalKey(uid: string) {
  return `ironinbox_workspace_${uid}`;
}

function notificationReadKey(uid: string) {
  return `ironinbox_notifications_read_${uid}`;
}

function readLocalWorkspace(uid: string): WorkspacePayload | null {
  try {
    const raw = localStorage.getItem(workspaceLocalKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspacePayload;
    if (!parsed || !Array.isArray(parsed.keywords)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocalWorkspace(uid: string, payload: WorkspacePayload) {
  try {
    localStorage.setItem(workspaceLocalKey(uid), JSON.stringify(payload));
  } catch { /* Workspace still lives in memory when browser storage is unavailable. */ }
}

function loadNotificationReadIds(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(notificationReadKey(uid));
    const parsed = JSON.parse(raw || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export interface AppContextType {
  flaggedEmails: FlaggedEmail[];
  releasedEmails: ReleasedEmail[];
  keywords: Keyword[];
  detectionOptions: DetectionOptions;
  detectionActions: DetectionActions;
  selectedEmail: FlaggedEmail | null;
  incidents: Incident[];
  notifications: AppNotification[];
  workspaceSaveStatus: WorkspaceSaveStatus;
  setSelectedEmail: (email: FlaggedEmail | null) => void;
  createIncidentFromFlaggedEmail: (
    email: FlaggedEmail,
    options: { dueDate: string; assignedTo?: string }
  ) => Incident;
  upsertIncident: (incident: Incident) => void;
  createManualIncident: (draft: Omit<Incident, 'id' | 'createdTime'> & Partial<Pick<Incident, 'id' | 'createdTime'>>) => Incident;
  releaseEmail: (emailId: string) => void;
  toggleStarReleasedEmail: (releasedId: string) => void;
  toggleReadReleasedEmail: (releasedId: string, isRead?: boolean) => void;
  reFlagReleasedEmails: (releasedIds: string[]) => void;
  addKeyword: (keyword: string) => boolean;
  deleteKeyword: (keywordId: string) => void;
  toggleKeyword: (id: string) => void;
  updateKeyword: (id: string, text: string) => boolean;
  updateDetectionOptions: (options: Partial<DetectionOptions>) => void;
  updateDetectionActions: (actions: Partial<DetectionActions>) => void;
  saveWorkspace: () => Promise<void>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  syncMailbox: () => Promise<void>;
  mailboxSyncing: boolean;
  mailboxError: string | null;
  lastSyncedAt: string | null;
  isWiped: boolean;
  wipeAllData: () => Promise<void>;
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { riskFlagThreshold, setRiskFlagThreshold, advanced } = useSettings();
  const { user, accountIntegrations } = useAuth();
  const [isWiped, setIsWiped] = useState(false);
  const [flaggedEmails, setFlaggedEmails] = useState<FlaggedEmail[]>([]);
  const [releasedEmails, setReleasedEmails] = useState<ReleasedEmail[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>(defaultKeywords);
  const [selectedEmail, setSelectedEmail] = useState<FlaggedEmail | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [detectionOptions, setDetectionOptions] = useState<DetectionOptions>(DEFAULT_OPTIONS);
  const [detectionActions, setDetectionActions] = useState<DetectionActions>(DEFAULT_ACTIONS);
  const [mailboxSyncing, setMailboxSyncing] = useState(false);
  const [mailboxError, setMailboxError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [workspaceSaveStatus, setWorkspaceSaveStatus] = useState<WorkspaceSaveStatus>('idle');
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const hydratingRef = useRef(true);
  const readyForResyncRef = useRef(false);
  const gradingRef = useRef({ keywords, detectionOptions, detectionActions, riskFlagThreshold, user, incidents, accountIntegrations });
  const syncMailboxRef = useRef<() => Promise<void>>(async () => {});
  const persistWorkspaceRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    gradingRef.current = { keywords, detectionOptions, detectionActions, riskFlagThreshold, user, incidents, accountIntegrations };
  }, [keywords, detectionOptions, detectionActions, riskFlagThreshold, user, incidents, accountIntegrations]);

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
              body: JSON.stringify({ mailboxId: mailbox.id, keywords: snapshot.detectionActions.flagEmail ? snapshot.keywords.filter(keyword => keyword.enabled).map(keyword => keyword.value) : [], options: snapshot.detectionOptions, threshold: snapshot.riskFlagThreshold }),
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

  syncMailboxRef.current = syncMailbox;

  const persistWorkspace = async () => {
    const currentUser = gradingRef.current.user;
    if (!currentUser?.uid || hydratingRef.current) return;
    const payload: WorkspacePayload = {
      keywords: gradingRef.current.keywords,
      detectionOptions: gradingRef.current.detectionOptions,
      detectionActions: gradingRef.current.detectionActions,
      riskThreshold: gradingRef.current.riskFlagThreshold,
      incidents: gradingRef.current.incidents,
    };
    writeLocalWorkspace(currentUser.uid, payload);
    setWorkspaceSaveStatus('saving');
    try {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Unable to save workspace.');
      setWorkspaceSaveStatus('saved');
    } catch {
      setWorkspaceSaveStatus('error');
    }
  };
  persistWorkspaceRef.current = persistWorkspace;

  const connectedProviders = useMemo(() => {
    const set = new Set<EmailSourceProvider>();
    accountIntegrations.forEach((i) => {
      if (i.connected && i.monitoring) set.add(i.provider as EmailSourceProvider);
    });
    return set;
  }, [accountIntegrations]);

  const mailboxSnapshot = accountIntegrations.map(item => item.id + ':' + item.monitoring).sort().join(',');

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      hydratingRef.current = true;
      readyForResyncRef.current = false;
      setFlaggedEmails(EMPTY_FLAGGED_EMAILS);
      setReleasedEmails(EMPTY_RELEASED_EMAILS);
      setSelectedEmail(null);
      setIncidents([]);
      setKeywords(defaultKeywords);
      setDetectionOptions(DEFAULT_OPTIONS);
      setDetectionActions(DEFAULT_ACTIONS);
      setIsWiped(false);
      setReadNotificationIds(new Set());
      setLastSyncedAt(null);
      setMailboxError(null);
      return;
    }

    hydratingRef.current = true;
    readyForResyncRef.current = false;
    setFlaggedEmails([]);
    setReleasedEmails([]);
    setSelectedEmail(null);
    setIsWiped(false);

    setReadNotificationIds(loadNotificationReadIds(user.uid));

    const local = readLocalWorkspace(user.uid);
    if (local) {
      setKeywords(local.keywords.length ? local.keywords : defaultKeywords);
      if (local.detectionOptions) setDetectionOptions({ ...DEFAULT_OPTIONS, ...local.detectionOptions });
      if (local.detectionActions) setDetectionActions({ ...DEFAULT_ACTIONS, ...local.detectionActions });
      if (Number.isFinite(local.riskThreshold)) setRiskFlagThreshold(local.riskThreshold);
      setIncidents(Array.isArray(local.incidents) ? local.incidents : []);
    } else {
      setKeywords(defaultKeywords);
      setDetectionOptions(DEFAULT_OPTIONS);
      setDetectionActions(DEFAULT_ACTIONS);
      setIncidents([]);
    }

    void (async () => {
      try {
        const response = await fetch('/api/workspace');
        if (!response.ok) throw new Error('workspace');
        const data = await response.json() as Partial<WorkspacePayload> & { saved?: boolean };
        if (cancelled) return;
        if (data.saved) {
          if (Array.isArray(data.keywords)) setKeywords(data.keywords);
          if (data.detectionOptions) setDetectionOptions({ ...DEFAULT_OPTIONS, ...data.detectionOptions });
          if (data.detectionActions) setDetectionActions({ ...DEFAULT_ACTIONS, ...data.detectionActions });
          if (Number.isFinite(Number(data.riskThreshold))) setRiskFlagThreshold(Number(data.riskThreshold));
          if (Array.isArray(data.incidents)) setIncidents(data.incidents);
          writeLocalWorkspace(user.uid, {
            keywords: Array.isArray(data.keywords) ? data.keywords : defaultKeywords,
            detectionOptions: { ...DEFAULT_OPTIONS, ...data.detectionOptions },
            detectionActions: { ...DEFAULT_ACTIONS, ...data.detectionActions },
            riskThreshold: Number(data.riskThreshold) || 50,
            incidents: Array.isArray(data.incidents) ? data.incidents : [],
          });
        }
      } catch {
        // Keep locally cached settings instead of replacing them with defaults.
      }
      if (cancelled) return;
      hydratingRef.current = false;
      await syncMailboxRef.current();
      readyForResyncRef.current = true;
    })();

    return () => { cancelled = true; };
  }, [user?.uid, setRiskFlagThreshold]);

  useEffect(() => {
    if (!user?.uid) return;
    const timer = window.setTimeout(() => {
      if (!readyForResyncRef.current) return;
      void syncMailboxRef.current();
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [keywords, detectionOptions, detectionActions.flagEmail, riskFlagThreshold, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const timer = window.setTimeout(() => {
      if (hydratingRef.current) return;
      void persistWorkspaceRef.current();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [keywords, detectionOptions, detectionActions, incidents, riskFlagThreshold, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !advanced.autoRefresh) return;
    const interval = window.setInterval(() => {
      void syncMailboxRef.current();
    }, advanced.refreshInterval);
    return () => window.clearInterval(interval);
  }, [user?.uid, advanced.autoRefresh, advanced.refreshInterval]);

  useEffect(() => {
    const connectedIds = new Set(accountIntegrations.map(account => account.id));
    setFlaggedEmails(items => items.filter(item => item.mailboxId && connectedIds.has(item.mailboxId)));
    setReleasedEmails(items => items.filter(item => item.originalEmail.mailboxId && connectedIds.has(item.originalEmail.mailboxId)));
    setSelectedEmail(item => item?.mailboxId && connectedIds.has(item.mailboxId) ? item : null);
    if (readyForResyncRef.current) void syncMailboxRef.current();
  }, [mailboxSnapshot]);

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
  const displayedIncidents = isWiped ? [] : incidents;

  const notifications = useMemo(
    () => buildNotifications({
      flaggedEmails: displayedFlaggedEmails,
      keywords: displayedKeywords,
      incidents: displayedIncidents,
      mailboxError,
      readIds: readNotificationIds,
      detectionActions,
    }),
    [displayedFlaggedEmails, displayedKeywords, displayedIncidents, mailboxError, readNotificationIds, detectionActions]
  );

  const wipeAllData = async () => {
    if (user?.uid) {
      const response = await fetch('/api/data/wipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (!response.ok) throw new Error('Unable to wipe mailbox data. Please try again.');
      try {
        localStorage.removeItem(workspaceLocalKey(user.uid));
        localStorage.removeItem(notificationReadKey(user.uid));
      } catch { /* Server wipe already removed the durable copy. */ }
    }
    setIsWiped(true);
    setIncidents([]);
    setSelectedEmail(null);
    setFlaggedEmails([]);
    setReleasedEmails([]);
    setKeywords(defaultKeywords);
    setDetectionOptions(DEFAULT_OPTIONS);
    setDetectionActions(DEFAULT_ACTIONS);
    setReadNotificationIds(new Set());
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
    const trimmed = keyword.trim();
    if (!trimmed) return false;
    if (keywords.some((item) => item.value.trim().toLowerCase() === trimmed.toLowerCase())) return false;
    const newKeyword: Keyword = {
      id: Date.now().toString(),
      value: trimmed,
      createdAt: new Date().toISOString(),
      enabled: true
    };
    setKeywords(prev => [...prev, newKeyword]);
    return true;
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
    if (!trimmed) return false;
    if (keywords.some((item) => item.id !== keywordId && item.value.trim().toLowerCase() === trimmed.toLowerCase())) {
      return false;
    }
    setKeywords(prev =>
      prev.map(kw =>
        kw.id === keywordId ? { ...kw, value: trimmed } : kw
      )
    );
    return true;
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
    const existing = incidentForEmail(incidents, email.id);
    if (existing) return existing;
    const incident = createIncidentFromEmail(email, { ...options, reporter: user?.email || 'Flagged Email Workflow' }, incidents);
    setIncidents(prev => [incident, ...prev]);
    return incident;
  };

  const upsertIncident = (incident: Incident) => {
    setIncidents((prev) => {
      const without = prev.filter((item) => item.id !== incident.id);
      return [incident, ...without];
    });
  };

  const createManualIncident = (draft: Omit<Incident, 'id' | 'createdTime'> & Partial<Pick<Incident, 'id' | 'createdTime'>>) => {
    const incident: Incident = {
      ...draft,
      id: draft.id && !incidents.some((item) => item.id === draft.id) ? draft.id : createIncidentId(incidents.map((item) => item.id)),
      createdTime: draft.createdTime || 'Just now',
    };
    setIncidents((prev) => [incident, ...prev]);
    return incident;
  };

  const persistReadIds = (next: Set<string>) => {
    setReadNotificationIds(next);
    if (!user?.uid) return;
    try {
      localStorage.setItem(notificationReadKey(user.uid), JSON.stringify([...next]));
    } catch { /* Unread badges still work for this session. */ }
  };

  const markNotificationRead = (id: string) => {
    persistReadIds(new Set([...readNotificationIds, id]));
  };

  const markAllNotificationsRead = () => {
    persistReadIds(new Set(notifications.map((item) => item.id)));
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
        incidents: displayedIncidents,
        notifications,
        workspaceSaveStatus,
        setSelectedEmail,
        createIncidentFromFlaggedEmail,
        upsertIncident,
        createManualIncident,
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
        saveWorkspace: persistWorkspace,
        markNotificationRead,
        markAllNotificationsRead,
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
