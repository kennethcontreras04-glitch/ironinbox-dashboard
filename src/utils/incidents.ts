import { FlaggedEmail, Incident, IncidentEmailSnapshot } from '../types';

export function snapshotEmail(email: FlaggedEmail): IncidentEmailSnapshot {
  return {
    id: email.id,
    sender: email.sender,
    senderEmail: email.senderEmail,
    senderDomain: email.senderDomain,
    subject: email.subject,
    received: email.received,
    receivedAt: email.receivedAt,
    riskLevel: email.riskLevel,
    riskScore: email.riskScore,
    signals: email.signals.map((signal) => ({ ...signal })),
    auth: email.auth ? { ...email.auth } : undefined,
    links: email.links?.map((link) => ({ ...link })),
    attachments: email.attachments?.map((file) => ({ ...file })),
    snippet: email.snippet || email.content?.slice(0, 280),
    content: email.content,
    disposition: email.disposition,
  };
}

export function createIncidentId(existingIds: string[]): string {
  const used = new Set(existingIds);
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const suffix = (globalThis.crypto?.randomUUID?.() || `${Date.now()}${attempt}`).replace(/-/g, '').slice(0, 8).toUpperCase();
    const id = `INC-${year}-${suffix}`;
    if (!used.has(id)) return id;
  }
  return `INC-${year}-${Date.now()}`;
}

export function createIncidentFromEmail(
  email: FlaggedEmail,
  options: { dueDate: string; assignedTo?: string; reporter?: string },
  existing: Incident[]
): Incident {
  return {
    id: createIncidentId(existing.map((incident) => incident.id)),
    createdTime: 'Just now',
    reporter: options.reporter || 'Flagged Email Workflow',
    subject: `Email Threat Investigation: ${email.subject}`,
    priority: email.riskLevel,
    status: 'Open',
    dueDate: options.dueDate,
    description: `A flagged email was automatically escalated for investigation after detection controls identified multiple suspicious indicators in the message context and content. The email was received from ${email.sender} on ${email.received} and classified as ${email.riskLevel.toLowerCase()} risk based on the triggered rules.\n\nInitial analysis found the following indicators: ${email.signals.map((signal) => `${signal.type} match "${signal.value}"`).join(', ') || 'none listed'}. Analysts should validate sender legitimacy, review embedded links or attachments, and confirm whether recipient interaction occurred before containment and remediation actions are finalized.`,
    category: 'Email Security',
    assignedTo: options.assignedTo || 'SOC Team',
    source: 'Flagged Email',
    sourceEmailId: email.id,
    sourceEmail: snapshotEmail(email),
  };
}

export function incidentForEmail(incidents: Incident[], emailId: string): Incident | undefined {
  return incidents.find((incident) => incident.sourceEmailId === emailId);
}
