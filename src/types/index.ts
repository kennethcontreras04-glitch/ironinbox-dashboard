export type EmailSourceProvider = 'gmail' | 'outlook' | 'slack';

export type EmailDisposition = 'flagged' | 'safe';

export type EmailAuthResults = {
  spf: string;
  dkim: string;
  dmarc: string;
}

export type EmailLink = {
  href: string;
  text: string;
  host: string;
}

export type EmailAttachment = {
  filename: string;
  mimeType: string;
  size: number;
}

export type EmailReview = {
  disposition: EmailDisposition;
  by?: string;
  at?: string;
}

export type SignalDetector =
  | 'user-keyword'
  | 'phrase'
  | 'auth'
  | 'lookalike-domain'
  | 'display-name'
  | 'reply-to'
  | 'link-mismatch'
  | 'link-ip'
  | 'attachment'
  | 'provider-spam'
  | 'llm';

export type FlaggedEmail = {
  id: string;
  received: string;
  sender: string;
  subject: string;
  signals: Signal[];
  riskLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  riskScore: number;
  sourceProvider: EmailSourceProvider;
  content: string;
  receivedAt?: string;
  threadId?: string;
  senderEmail?: string;
  senderDomain?: string;
  snippet?: string;
  labelIds?: string[];
  auth?: EmailAuthResults;
  links?: EmailLink[];
  attachments?: EmailAttachment[];
  disposition?: EmailDisposition;
  review?: EmailReview;
}

export type ReleasedEmail = {
  id: string;
  originalEmail: FlaggedEmail;
  releasedAt: string;
  releasedBy: string;
  starred: boolean;
  isRead: boolean;
}

export type Signal = {
  type: 'keyword' | 'typo';
  value: string;
  description: string;
  source?: 'server';
  detector?: SignalDetector;
  weight?: number;
}

export type Keyword = {
  id: string;
  value: string;
  createdAt: string;
  enabled: boolean;
}

export type DetectionOptions = {
  caseInsensitive: boolean;
  matchInSubject: boolean;
  matchInBody: boolean;
  wholeWordOnly: boolean;
}

export type DetectionActions = {
  flagEmail: boolean;
  logMatch: boolean;
  showInDashboard: boolean;
}

export type DetectionSettings = {
  options: DetectionOptions;
  actions: DetectionActions;
  riskThreshold: number;
}

export type IncidentEmailSnapshot = {
  id: string;
  sender: string;
  senderEmail?: string;
  senderDomain?: string;
  subject: string;
  received: string;
  receivedAt?: string;
  riskLevel: FlaggedEmail['riskLevel'];
  riskScore: number;
  signals: Signal[];
  auth?: EmailAuthResults;
  links?: EmailLink[];
  attachments?: EmailAttachment[];
  snippet?: string;
  content?: string;
  disposition?: EmailDisposition;
}

export type Incident = {
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
  sourceEmail?: IncidentEmailSnapshot;
}

export type NotificationType =
  | 'critical-email'
  | 'high-email'
  | 'keyword-match'
  | 'open-incident'
  | 'sync-error';

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  href: string;
  read: boolean;
  sourceId?: string;
}

export type WorkspaceSaveStatus = 'idle' | 'saving' | 'saved' | 'error';
