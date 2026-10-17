const ROLE_PERMISSIONS = {
  admin: { viewSensitive: true, reviewEmails: true, manageWorkspace: true, manageMailboxes: true, wipeData: true },
  manager: { viewSensitive: true, reviewEmails: true, manageWorkspace: true, manageMailboxes: true, wipeData: false },
  viewer: { viewSensitive: false, reviewEmails: false, manageWorkspace: false, manageMailboxes: false, wipeData: false },
};

export function roleOf(user) {
  const role = user?.role;
  return Object.hasOwn(ROLE_PERMISSIONS, role) ? role : 'admin';
}

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[roleOf({ role })];
}

function hiddenSignal(signal) {
  return {
    type: signal?.type === 'typo' ? 'typo' : 'keyword',
    source: signal?.source === 'server' ? 'server' : undefined,
    detector: typeof signal?.detector === 'string' ? signal.detector : undefined,
    weight: Number.isFinite(Number(signal?.weight)) ? Number(signal.weight) : undefined,
    value: signal?.detector === 'user-keyword' ? String(signal.value || '') : (signal?.detector || signal?.type || 'signal'),
    description: 'Hidden for your role',
  };
}

// Viewers keep risk and disposition so dashboard counts stay aligned with the
// mailbox, but message content, addresses, links, and attachments are removed.
export function presentMessageForRole(message, role) {
  if (permissionsFor(role).viewSensitive) return message;
  return {
    id: message.id,
    threadId: message.threadId,
    mailboxId: message.mailboxId,
    mailboxEmail: message.mailboxEmail,
    receivedAt: message.receivedAt,
    received: message.received,
    sender: 'Restricted sender',
    senderEmail: '',
    senderDomain: '',
    subject: 'Restricted subject',
    snippet: '',
    content: '',
    labelIds: Array.isArray(message.labelIds) ? message.labelIds : [],
    links: [],
    attachments: [],
    signals: Array.isArray(message.signals) ? message.signals.map(hiddenSignal) : [],
    riskScore: message.riskScore,
    riskLevel: message.riskLevel,
    sourceProvider: message.sourceProvider,
    disposition: message.disposition,
    review: message.review ? { disposition: message.review.disposition, at: message.review.at, by: 'Restricted' } : undefined,
    masked: true,
  };
}

export function presentIncidentForRole(incident, role) {
  if (!incident || permissionsFor(role).viewSensitive) return incident;
  const linked = Boolean(incident.sourceEmailId || incident.sourceEmail);
  const source = incident.sourceEmail;
  return {
    ...incident,
    subject: linked ? 'Restricted email incident' : incident.subject,
    description: linked
      ? 'Email content is hidden for your role. The incident remains linked to the original message.'
      : incident.description,
    sourceEmail: source ? {
      id: source.id,
      sender: 'Restricted sender',
      senderEmail: '',
      senderDomain: '',
      subject: 'Restricted subject',
      received: source.received,
      receivedAt: source.receivedAt,
      riskLevel: source.riskLevel,
      riskScore: source.riskScore,
      signals: [],
      links: [],
      attachments: [],
      snippet: '',
      content: '',
      disposition: source.disposition,
    } : undefined,
  };
}
