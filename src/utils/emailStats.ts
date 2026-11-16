import {
  DetectionActions,
  FlaggedEmail,
  Incident,
  Keyword,
  ReleasedEmail,
} from '../types';
import {
  filterVisibleFlaggedEmails,
  hasVisibleKeywordHit,
  hasVisibleTypoHit,
} from './keywordSignals';

export type EmailStats = {
  /** Everything in the Flagged Emails queue (threats + keyword-only matches). */
  totalFlagged: number;
  /** Flagged because of real risk evidence; drives the threat numbers below. */
  threatCount: number;
  /** Flagged only because a monitored keyword matched; not counted as threats. */
  keywordMatchCount: number;
  totalReleased: number;
  totalProcessed: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  highCritical: number;
  keywordHits: number;
  typoHits: number;
  overallRiskScore: number;
  detectionRate: number;
  topThreats: [string, number][];
  recentReleased: ReleasedEmail[];
  activeKeywords: number;
  totalIncidents: number;
  openIncidents: number;
  incidentsLinkedToEmails: number;
  flaggedEmailsEscalated: number;
};

const RISK_WEIGHTS = { Critical: 100, High: 70, Medium: 40, Low: 20 };

export function threatDomain(email: FlaggedEmail): string {
  const domain = (email.senderDomain || '').trim().toLowerCase();
  if (domain) return domain;
  const fromEmail = (email.senderEmail || '').trim();
  const at = fromEmail.split('@')[1];
  if (at) return at.toLowerCase();
  const match = email.sender.match(/@([^>\s]+)/);
  return (match?.[1] || email.sender).toLowerCase();
}

export function computeEmailStats(input: {
  flaggedEmails: FlaggedEmail[];
  releasedEmails?: ReleasedEmail[];
  releasedCount?: number;
  keywords: Keyword[];
  incidents: Incident[];
  detectionActions?: DetectionActions;
}): EmailStats {
  const { flaggedEmails, releasedEmails = [], keywords, incidents, detectionActions } = input;
  const visibleFlagged = filterVisibleFlaggedEmails(flaggedEmails, keywords);
  const totalFlagged = visibleFlagged.length;
  // Keyword-only matches are the user's own watch list, not threat evidence, so
  // they stay out of the risk distribution, risk score and threat sources.
  const threats = visibleFlagged.filter((email) => email.flagReason !== 'keyword');
  const threatCount = threats.length;
  const totalReleased = releasedEmails.length || input.releasedCount || 0;
  const totalProcessed = totalFlagged + totalReleased;
  const criticalCount = threats.filter((email) => email.riskLevel === 'Critical').length;
  const highCount = threats.filter((email) => email.riskLevel === 'High').length;
  const mediumCount = threats.filter((email) => email.riskLevel === 'Medium').length;
  const lowCount = threats.filter((email) => email.riskLevel === 'Low').length;
  const totalRiskPoints =
    criticalCount * RISK_WEIGHTS.Critical +
    highCount * RISK_WEIGHTS.High +
    mediumCount * RISK_WEIGHTS.Medium +
    lowCount * RISK_WEIGHTS.Low;
  const overallRiskScore = threatCount > 0 ? Math.round((totalRiskPoints / (threatCount * 100)) * 100) : 0;
  const domainCounts: Record<string, number> = {};
  threats.forEach((email) => {
    const domain = threatDomain(email);
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  });
  const linkedEmailIds = new Set(
    incidents.map((incident) => incident.sourceEmailId).filter((id): id is string => Boolean(id))
  );

  return {
    totalFlagged,
    threatCount,
    keywordMatchCount: totalFlagged - threatCount,
    totalReleased,
    totalProcessed,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    highCritical: criticalCount + highCount,
    keywordHits: visibleFlagged.filter((email) => hasVisibleKeywordHit(email, keywords, detectionActions)).length,
    typoHits: visibleFlagged.filter((email) => hasVisibleTypoHit(email, keywords, detectionActions)).length,
    overallRiskScore,
    detectionRate: totalProcessed > 0 ? Math.round((threatCount / totalProcessed) * 100) : 0,
    topThreats: Object.entries(domainCounts).sort(([, a], [, b]) => b - a).slice(0, 5),
    recentReleased: releasedEmails.slice(0, 5),
    activeKeywords: keywords.filter((keyword) => keyword.enabled).length,
    totalIncidents: incidents.length,
    openIncidents: incidents.filter((incident) => incident.status === 'Open').length,
    incidentsLinkedToEmails: incidents.filter((incident) => Boolean(incident.sourceEmailId)).length,
    flaggedEmailsEscalated: visibleFlagged.filter((email) => linkedEmailIds.has(email.id)).length,
  };
}
