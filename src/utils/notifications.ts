import {
  AppNotification,
  DetectionActions,
  FlaggedEmail,
  Incident,
  Keyword,
} from '../types';
import { hasVisibleKeywordHit } from './keywordSignals';

export function buildNotifications(input: {
  flaggedEmails: FlaggedEmail[];
  keywords: Keyword[];
  incidents: Incident[];
  mailboxError: string | null;
  readIds: Set<string>;
  detectionActions?: DetectionActions;
}): AppNotification[] {
  const { flaggedEmails, keywords, incidents, mailboxError, readIds, detectionActions } = input;
  const items: AppNotification[] = [];

  for (const email of flaggedEmails) {
    if (email.riskLevel === 'Critical' || email.riskLevel === 'High') {
      const id = `email:${email.id}:${email.riskLevel.toLowerCase()}`;
      items.push({
        id,
        type: email.riskLevel === 'Critical' ? 'critical-email' : 'high-email',
        title: `${email.riskLevel} risk email`,
        body: email.subject || 'Flagged message requires review',
        createdAt: email.receivedAt || email.received,
        href: `/flagged-emails?email=${encodeURIComponent(email.id)}`,
        read: readIds.has(id),
        sourceId: email.id,
      });
    }
    if (hasVisibleKeywordHit(email, keywords, detectionActions)) {
      const id = `email:${email.id}:keyword`;
      items.push({
        id,
        type: 'keyword-match',
        title: 'Keyword match',
        body: email.subject || 'A monitored keyword was found',
        createdAt: email.receivedAt || email.received,
        href: `/flagged-emails?email=${encodeURIComponent(email.id)}`,
        read: readIds.has(id),
        sourceId: email.id,
      });
    }
  }

  for (const incident of incidents) {
    if (incident.status !== 'Open') continue;
    const id = `incident:${incident.id}:open`;
    items.push({
      id,
      type: 'open-incident',
      title: 'Open incident',
      body: incident.subject,
      createdAt: incident.createdTime,
      href: `/incidents?incident=${encodeURIComponent(incident.id)}`,
      read: readIds.has(id),
      sourceId: incident.id,
    });
  }

  if (mailboxError) {
    const id = 'sync-error';
    items.push({
      id,
      type: 'sync-error',
      title: 'Mailbox sync error',
      body: mailboxError,
      createdAt: new Date().toISOString(),
      href: '/dashboard',
      read: readIds.has(id),
    });
  }

  const rank = { 'critical-email': 0, 'high-email': 1, 'open-incident': 2, 'keyword-match': 3, 'sync-error': 4 };
  return items.sort((a, b) => rank[a.type] - rank[b.type] || Number(a.read) - Number(b.read));
}
