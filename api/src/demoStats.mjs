
export const DEMO_STATS = Object.freeze({
  totalFlagged: 48,
  threatCount: 39,
  keywordMatchCount: 9,
  totalReleased: 152,
  totalProcessed: 200,

  criticalCount: 8,
  highCount: 14,
  mediumCount: 12,
  lowCount: 5,
  highCritical: 22,

  keywordHits: 18,
  typoHits: 11,
  overallRiskScore: 62,
  detectionRate: 20,

  activeKeywords: 6,
  totalIncidents: 15,
  openIncidents: 7,
  incidentsLinkedToEmails: 10,
  flaggedEmailsEscalated: 10,
});

export function publicDemoStats() {
  return { ...DEMO_STATS };
}
