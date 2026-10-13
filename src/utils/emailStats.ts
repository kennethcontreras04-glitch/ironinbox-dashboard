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
  totalFlagged: number;
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
  const visibleFlagged = filterVisibleFlaggedEmails(flaggedEmails, keywords, detectionActions);
  const totalFlagged = visibleFlagged.length;
  const totalReleased = releasedEmails.length || input.releasedCount || 0;
  const totalProcessed = totalFlagged + totalReleased;
  const criticalCount = visibleFlagged.filter((email) => email.riskLevel === 'Critical').length;
  const highCount = visibleFlagged.filter((email) => email.riskLevel === 'High').length;
  const mediumCount = visibleFlagged.filter((email) => email.riskLevel === 'Medium').length;
  const lowCount = visibleFlagged.filter((email) => email.riskLevel === 'Low').length;
  const totalRiskPoints =
    criticalCount * RISK_WEIGHTS.Critical +
    highCount * RISK_WEIGHTS.High +
    mediumCount * RISK_WEIGHTS.Medium +
    lowCount * RISK_WEIGHTS.Low;
  const overallRiskScore = totalFlagged > 0 ? Math.round((totalRiskPoints / (totalFlagged * 100)) * 100) : 0;
  const domainCounts: Record<string, number> = {};
  visibleFlagged.forEach((email) => {
    const domain = threatDomain(email);
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  });
  const linkedEmailIds = new Set(
    incidents.map((incident) => incident.sourceEmailId).filter((id): id is string => Boolean(id))
  );

  return {
    totalFlagged,
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
    detectionRate: totalProcessed > 0 ? Math.round((totalFlagged / totalProcessed) * 100) : 0,
    topThreats: Object.entries(domainCounts).sort(([, a], [, b]) => b - a).slice(0, 5),
    recentReleased: releasedEmails.slice(0, 5),
    activeKeywords: keywords.filter((keyword) => keyword.enabled).length,
    totalIncidents: incidents.length,
    openIncidents: incidents.filter((incident) => incident.status === 'Open').length,
    incidentsLinkedToEmails: incidents.filter((incident) => Boolean(incident.sourceEmailId)).length,
    flaggedEmailsEscalated: visibleFlagged.filter((email) => linkedEmailIds.has(email.id)).length,
  };
}
