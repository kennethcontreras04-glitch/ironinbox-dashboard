import type {
  ClaimedWho,
  IncidentEmailSnapshot,
  IncidentResponse,
  ReportDevice,
  SensitiveKind,
  SuspicionReason,
  Incident,
  UnusualSign,
  YesNoUnsure,
} from '../types';

export type ResponseStep =
  | 'suspicion'
  | 'sensitive'
  | 'interaction'
  | 'follow'
  | 'impersonation'
  | 'since'
  | 'device'
  | 'others';

export type RouteId = 'identity' | 'endpoint' | 'fraud' | 'privacy' | 'triage';

export type GuidanceAction = { id: string; title: string; detail: string };

export type GuidanceRoute = { id: RouteId; label: string; why: string };

export type Guidance = {
  urgency: 'Critical' | 'High' | 'Medium' | 'Low' | null;
  provisional: boolean;
  reasons: string[];
  signals: string[];
  routes: GuidanceRoute[];
  actions: GuidanceAction[];
  afterHours: boolean;
};

export const SUSPICION_OPTIONS: { id: SuspicionReason; label: string }[] = [
  { id: 'unexpected-request', label: 'An unexpected request' },
  { id: 'urgent-tone', label: 'An urgent tone' },
  { id: 'unknown-sender', label: 'An unknown sender' },
  { id: 'strange-link', label: 'A strange link or attachment' },
  { id: 'other', label: 'Something else' },
];

export const SENSITIVE_OPTIONS: { id: SensitiveKind; label: string }[] = [
  { id: 'password', label: 'Password' },
  { id: 'code', label: 'Verification code' },
  { id: 'ssn', label: 'Social Security number' },
  { id: 'bank', label: 'Bank or payroll details' },
  { id: 'gift-card', label: 'Gift card or wire payment' },
];

export const CLAIMED_OPTIONS: { id: ClaimedWho; label: string }[] = [
  { id: 'manager', label: 'A manager' },
  { id: 'executive', label: 'An executive' },
  { id: 'vendor', label: 'A vendor' },
  { id: 'it', label: 'IT' },
  { id: 'coworker', label: 'A coworker' },
  { id: 'other', label: 'Someone else' },
];

export const UNUSUAL_OPTIONS: { id: UnusualSign; label: string }[] = [
  { id: 'popups', label: 'Pop-ups' },
  { id: 'unexpected-codes', label: 'Sign-in codes I didn’t request' },
  { id: 'locked-account', label: 'A locked account' },
  { id: 'slow-computer', label: 'A slow computer' },
];

export const DEVICE_OPTIONS: { id: ReportDevice; label: string }[] = [
  { id: 'work-computer', label: 'Work computer' },
  { id: 'phone', label: 'Phone' },
  { id: 'home-computer', label: 'Home computer' },
  { id: 'unsure', label: 'Not sure' },
];

export const YES_NO_OPTIONS: { id: YesNoUnsure; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unsure', label: 'Not sure' },
];

export const WHEN_OPTIONS: { id: string; label: string }[] = [
  { id: 'Just now', label: 'Just now' },
  { id: 'Earlier today', label: 'Earlier today' },
  { id: 'Yesterday', label: 'Yesterday' },
  { id: 'This week', label: 'This week' },
  { id: 'Not sure', label: 'Not sure' },
];

const BLOCKED_SENDERS_KEY = 'ironinbox_blocked_senders';

const SUSPICION_LABEL = Object.fromEntries(SUSPICION_OPTIONS.map((option) => [option.id, option.label])) as Record<SuspicionReason, string>;
const SENSITIVE_LABEL = Object.fromEntries(SENSITIVE_OPTIONS.map((option) => [option.id, option.label])) as Record<SensitiveKind, string>;
const CLAIMED_LABEL = Object.fromEntries(CLAIMED_OPTIONS.map((option) => [option.id, option.label])) as Record<ClaimedWho, string>;
const UNUSUAL_LABEL = Object.fromEntries(UNUSUAL_OPTIONS.map((option) => [option.id, option.label])) as Record<UnusualSign, string>;
const DEVICE_LABEL = Object.fromEntries(DEVICE_OPTIONS.map((option) => [option.id, option.label])) as Record<ReportDevice, string>;

export function looksLikeSecret(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^\d{4,8}$/.test(text)) return true;
  if (/password\s*(is|:)\s*\S+/i.test(text)) return true;
  if (/(verification|security)\s+code\s*(is|:)\s*\S+/i.test(text)) return true;
  if (/\b(pin|ssn)\s*(is|:)\s*\S+/i.test(text)) return true;
  if (/social security\s*(number\s*)?(is|:)\s*\d/i.test(text)) return true;
  return false;
}

export function extractEmail(value: string): string {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] || '';
}

export function resolveSenderAddress(source?: IncidentEmailSnapshot, response?: IncidentResponse): string {
  return extractEmail(response?.senderAddress || '') || extractEmail(source?.senderEmail || '') || extractEmail(source?.sender || '');
}

export function readBlockedSenders(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(BLOCKED_SENDERS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function blockSenderInMailbox(address: string): void {
  const email = extractEmail(address).toLowerCase();
  if (!email) return;
  const next = readBlockedSenders();
  if (!next.includes(email)) next.push(email);
  try {
    localStorage.setItem(BLOCKED_SENDERS_KEY, JSON.stringify(next));
  } catch {
    /* The incident still records that the employee asked to block the sender. */
  }
}

export function senderIsBlocked(address: string): boolean {
  const email = extractEmail(address).toLowerCase();
  return Boolean(email) && readBlockedSenders().includes(email);
}

export function mergeResponse(current: IncidentResponse | undefined, patch: Partial<IncidentResponse>): IncidentResponse {
  const next: IncidentResponse = { ...current, ...patch };
  if (patch.askedSensitive && patch.askedSensitive !== 'yes') {
    next.sensitiveKinds = undefined;
    next.sensitiveDetailAnswered = undefined;
  }
  if (patch.claimedIdentity && patch.claimedIdentity !== 'yes') {
    next.claimedWho = undefined;
  }
  if (patch.unusualSince && patch.unusualSince !== 'yes') {
    next.unusualSigns = undefined;
    next.unusualDetailAnswered = undefined;
  }
  if (!interacted(next)) {
    next.typedSecret = undefined;
    next.sentMoneyOrFiles = undefined;
  }
  if (next.note && looksLikeSecret(next.note)) next.note = '';
  if (next.happenedAround && looksLikeSecret(next.happenedAround)) next.happenedAround = '';
  return next;
}

export function interacted(response: IncidentResponse | undefined): boolean {
  return Boolean(response?.clickedLink || response?.openedAttachment || response?.replied);
}

export function responseSteps(response: IncidentResponse | undefined): ResponseStep[] {
  const steps: ResponseStep[] = ['suspicion', 'sensitive', 'interaction'];
  if (interacted(response)) steps.push('follow');
  steps.push('impersonation', 'since', 'device', 'others');
  return steps;
}

export function isStepAnswered(step: ResponseStep, response: IncidentResponse | undefined): boolean {
  const value = response ?? {};
  switch (step) {
    case 'suspicion':
      return Boolean(value.suspicion);
    case 'sensitive':
      if (!value.askedSensitive) return false;
      if (value.askedSensitive !== 'yes') return true;
      return Boolean(value.sensitiveDetailAnswered || (value.sensitiveKinds && value.sensitiveKinds.length > 0));
    case 'interaction':
      return Boolean(value.interactionAnswered);
    case 'follow':
      return Boolean(value.typedSecret && value.sentMoneyOrFiles);
    case 'impersonation':
      if (!value.claimedIdentity) return false;
      if (value.claimedIdentity !== 'yes') return true;
      return Boolean(value.claimedWho);
    case 'since':
      if (!value.unusualSince) return false;
      if (value.unusualSince !== 'yes') return true;
      return Boolean(value.unusualDetailAnswered || (value.unusualSigns && value.unusualSigns.length > 0));
    case 'device':
      return Boolean(value.device);
    case 'others':
      return Boolean(value.othersReceived);
    default:
      return false;
  }
}

export function stepSummary(step: ResponseStep, response: IncidentResponse | undefined): string {
  const value = response ?? {};
  switch (step) {
    case 'suspicion':
      return value.suspicion ? SUSPICION_LABEL[value.suspicion] : '';
    case 'sensitive':
      if (value.askedSensitive === 'yes') {
        const kinds = (value.sensitiveKinds || []).map((kind) => SENSITIVE_LABEL[kind]);
        return kinds.length ? `Yes · ${kinds.join(', ')}` : 'Yes · not sure which';
      }
      return value.askedSensitive === 'no' ? 'No' : value.askedSensitive === 'unsure' ? 'Not sure' : '';
    case 'interaction': {
      const parts = [
        value.clickedLink ? 'Clicked a link' : '',
        value.openedAttachment ? 'Opened an attachment' : '',
        value.replied ? 'Replied' : '',
      ].filter(Boolean);
      return parts.length ? parts.join(', ') : 'No interaction';
    }
    case 'follow': {
      const parts = [];
      if (value.typedSecret === 'yes') parts.push('Entered a password or code');
      if (value.typedSecret === 'no') parts.push('No password or code');
      if (value.sentMoneyOrFiles === 'yes') parts.push('Sent money or files');
      if (value.sentMoneyOrFiles === 'no') parts.push('No money or files');
      return parts.join(' · ');
    }
    case 'impersonation':
      if (value.claimedIdentity === 'yes') return value.claimedWho ? `Yes · ${CLAIMED_LABEL[value.claimedWho]}` : 'Yes';
      return value.claimedIdentity === 'no' ? 'No' : value.claimedIdentity === 'unsure' ? 'Not sure' : '';
    case 'since':
      if (value.unusualSince === 'yes') {
        const signs = (value.unusualSigns || []).map((sign) => UNUSUAL_LABEL[sign]);
        return signs.length ? signs.join(', ') : 'Yes · not sure what';
      }
      return value.unusualSince === 'no' ? 'Nothing unusual' : value.unusualSince === 'unsure' ? 'Not sure' : '';
    case 'device':
      return value.device ? `${DEVICE_LABEL[value.device]}${value.happenedAround ? ` · ${value.happenedAround}` : ''}` : '';
    case 'others':
      return value.othersReceived === 'yes' ? 'Yes' : value.othersReceived === 'no' ? 'No' : value.othersReceived === 'unsure' ? 'Not sure' : '';
    default:
      return '';
  }
}

const STEP_TITLES: Record<ResponseStep, string> = {
  suspicion: 'What seemed suspicious',
  sensitive: 'Sensitive information',
  interaction: 'What you did',
  follow: 'What happened next',
  impersonation: 'Who they claimed to be',
  since: 'Anything since',
  device: 'Device and time',
  others: 'Anyone else',
};

export function stepTitle(step: ResponseStep): string {
  return STEP_TITLES[step];
}

export function responseProgress(response: IncidentResponse | undefined): { answered: number; total: number } {
  const steps = responseSteps(response);
  return {
    total: steps.length,
    answered: steps.filter((step) => isStepAnswered(step, response)).length,
  };
}

function scoreIsHigh(email?: IncidentEmailSnapshot): boolean | null {
  if (!email) return null;
  if (email.riskLevel === 'High' || email.riskLevel === 'Critical') return true;
  return email.riskScore >= 60;
}

function textHintsFinance(email?: IncidentEmailSnapshot): boolean {
  if (!email) return false;
  const haystack = [
    email.subject,
    email.snippet,
    email.sender,
    ...(email.signals || []).map((signal) => `${signal.value} ${signal.description}`),
  ].join(' ').toLowerCase();
  return ['payroll', 'wire', 'gift card', 'giftcard', 'invoice', 'direct deposit', 'ceo', 'cfo', 'executive'].some((word) => haystack.includes(word));
}

function signalNotes(email?: IncidentEmailSnapshot): string[] {
  const detectors = new Set((email?.signals || []).map((signal) => signal.detector).filter(Boolean));
  const notes: string[] = [];
  if (detectors.has('auth')) notes.push('Failed email authentication');
  if (detectors.has('lookalike-domain')) notes.push('Lookalike domain');
  if (detectors.has('reply-to')) notes.push('Reply-To doesn’t match the sender');
  if (detectors.has('link-mismatch') || detectors.has('link-ip')) notes.push('Deceptive link');
  if (detectors.has('attachment')) notes.push('Risky attachment type');
  return notes;
}

function isAfterHours(now: Date): boolean {
  const day = now.getDay();
  const hour = now.getHours();
  return day === 0 || day === 6 || hour < 8 || hour >= 18;
}

export function assessIncident(responseInput: IncidentResponse | undefined, email?: IncidentEmailSnapshot, now = new Date()): Guidance {
  const response = responseInput ?? {};
  const takeover = Boolean(response.unusualSigns?.includes('locked-account') || response.unusualSigns?.includes('unexpected-codes'));
  const deviceStrange = Boolean(response.unusualSigns?.includes('popups') || response.unusualSigns?.includes('slow-computer'));
  const impersonated = response.claimedIdentity === 'yes';
  const askedMoney = Boolean(response.sensitiveKinds?.includes('bank') || response.sensitiveKinds?.includes('gift-card'));
  const criticalReasons: string[] = [];
  if (response.typedSecret === 'yes') criticalReasons.push('A password or code was entered.');
  if (response.openedAttachment) criticalReasons.push('An attachment was opened.');
  if (response.sentMoneyOrFiles === 'yes') criticalReasons.push('Money or files were sent.');
  if (takeover) criticalReasons.push('There are signs of an account takeover.');
  if ((askedMoney && impersonated) || (textHintsFinance(email) && impersonated)) {
    criticalReasons.push('An executive or finance request was targeted.');
  }
  if (response.replied && response.askedSensitive === 'yes') {
    criticalReasons.push('A reply was sent after a request for sensitive information.');
  }

  const highReasons: string[] = [];
  if (response.clickedLink) highReasons.push('A link was clicked.');
  if (response.askedSensitive === 'yes') highReasons.push('The email asked for sensitive information.');
  if (impersonated) highReasons.push('The sender claimed to be someone you know.');
  if (deviceStrange) highReasons.push('The device has been acting strangely.');

  let urgency: Guidance['urgency'] = null;
  let reasons: string[] = [];
  let provisional = false;
  if (criticalReasons.length > 0) {
    urgency = 'Critical';
    reasons = criticalReasons;
  } else if (highReasons.length > 0) {
    urgency = 'High';
    reasons = highReasons;
    provisional = !response.interactionAnswered;
  } else if (response.interactionAnswered && !interacted(response)) {
    const highScore = scoreIsHigh(email);
    const strongSuspicion = response.suspicion === 'unknown-sender' || response.suspicion === 'strange-link' || response.suspicion === 'unexpected-request';
    if (highScore === true || (highScore === null && strongSuspicion)) {
      urgency = 'Medium';
      reasons = [highScore === true
        ? 'Nothing was clicked or opened, and the IronInbox score is high.'
        : 'Nothing was clicked or opened, and this email has no IronInbox score yet.'];
    } else if (response.suspicion) {
      urgency = 'Low';
      reasons = ['Nothing was clicked or opened, and the IronInbox score is low.'];
    }
  }

  const routes: GuidanceRoute[] = [];
  if (response.typedSecret === 'yes' || takeover) {
    routes.push({ id: 'identity', label: 'Identity and account security analyst', why: 'A password, a code, or a sign-in may be involved.' });
  }
  if (response.openedAttachment || deviceStrange || takeover) {
    routes.push({
      id: 'endpoint',
      label: 'Endpoint and malware analyst',
      why: response.openedAttachment ? 'An attachment was opened on a device.' : 'The device is acting strangely.',
    });
  }
  if (response.sentMoneyOrFiles === 'yes' || askedMoney) {
    routes.push({ id: 'fraud', label: 'Fraud analyst and the finance contact', why: 'Money or payment details are involved.' });
  }
  if (response.sentMoneyOrFiles === 'yes' || (response.askedSensitive === 'yes' && response.replied)) {
    routes.push({ id: 'privacy', label: 'Privacy or legal reviewer', why: 'Personal or sensitive information may have been shared.' });
  }
  if (routes.length === 0) {
    routes.push({
      id: 'triage',
      label: 'Phishing triage queue',
      why: response.clickedLink
        ? 'A link was clicked. Triage takes the first look.'
        : 'Nothing was clicked, opened, or replied to, so this starts in triage.',
    });
  }
  const routeRank: Record<RouteId, number> = { identity: 0, endpoint: 1, fraud: 2, privacy: 3, triage: 4 };
  routes.sort((a, b) => routeRank[a.id] - routeRank[b.id]);

  const actions: GuidanceAction[] = [
    { id: 'leave', title: 'Leave the email where it is', detail: 'Don’t reply, forward, or delete it.' },
  ];
  if (response.askedSensitive === 'yes') {
    actions.push({
      id: 'sensitive',
      title: 'Don’t send what they asked for',
      detail: 'IronInbox never needs your password, a verification code, or payment numbers.',
    });
  }
  if (response.clickedLink && response.typedSecret !== 'yes' && response.sentMoneyOrFiles !== 'yes') {
    actions.push({ id: 'close-page', title: 'Close that page', detail: 'If you didn’t type anything, close it and don’t go back.' });
  }
  if (response.typedSecret === 'yes' || takeover) {
    actions.push({
      id: 'password',
      title: 'Change the password from a different device',
      detail: 'Do that now. An analyst is alerted. Don’t type the password or code in this report.',
    });
  }
  if (response.openedAttachment || deviceStrange) {
    actions.push({
      id: 'disconnect',
      title: 'Disconnect the network and leave the computer on',
      detail: 'Turn off Wi-Fi or unplug the cable so the evidence stays on the machine.',
    });
  }
  if (response.sentMoneyOrFiles === 'yes') {
    actions.push({ id: 'money', title: 'Call finance and the bank', detail: 'Do that immediately. This report is critical.' });
  }
  if (response.othersReceived === 'yes') {
    actions.push({
      id: 'warn',
      title: 'Tell coworkers not to open it',
      detail: 'Warn them in person or on chat. Don’t forward the email.',
    });
  }
  actions.push({
    id: 'block',
    title: response.senderBlocked ? 'Sender blocked in your mailbox' : 'Block the sender in your mailbox',
    detail: response.senderBlocked
      ? 'Future mail from them is flagged for you. Blocking them for the whole company needs an analyst.'
      : 'Check this once IronInbox knows the sender. A company-wide block needs an analyst, so a real vendor isn’t cut off.',
  });

  const afterHours = urgency === 'Critical' && isAfterHours(now);
  return {
    urgency,
    provisional,
    reasons,
    signals: signalNotes(email),
    routes,
    actions,
    afterHours,
  };
}

export function assigneeFor(guidance: Guidance): string {
  const label = guidance.routes[0]?.label || 'Phishing triage queue';
  return guidance.afterHours ? `${label} · on-call` : label;
}

export function categoryFor(guidance: Guidance): string {
  switch (guidance.routes[0]?.id) {
    case 'identity':
      return 'Account security';
    case 'endpoint':
      return 'Endpoint';
    case 'fraud':
      return 'Fraud';
    case 'privacy':
      return 'Privacy';
    default:
      return 'Email Security';
  }
}

export function subjectFromResponse(response: IncidentResponse | undefined): string {
  if (!response?.suspicion) return '';
  return `Suspicious email: ${SUSPICION_LABEL[response.suspicion]}`;
}

export function summaryFromResponse(response: IncidentResponse | undefined, guidance: Guidance): string {
  if (!response?.suspicion) return '';
  const parts = [`Reported in IronInbox as ${SUSPICION_LABEL[response.suspicion].toLowerCase()}.`];
  if (response.askedSensitive === 'yes') parts.push('The email asked for sensitive information.');
  if (response.askedSensitive === 'no') parts.push('The email did not ask for sensitive information.');
  if (response.clickedLink) parts.push('A link was clicked.');
  if (response.openedAttachment) parts.push('An attachment was opened.');
  if (response.replied) parts.push('The employee replied.');
  if (response.interactionAnswered && !interacted(response)) parts.push('The employee did not click, open, or reply.');
  if (response.typedSecret === 'yes') parts.push('A password or code was entered.');
  if (response.sentMoneyOrFiles === 'yes') parts.push('Money or files were sent.');
  if (response.senderBlocked) parts.push('The sender was blocked in that employee’s mailbox.');
  if (guidance.urgency) parts.push(`Suggested urgency: ${guidance.urgency}.`);
  if (guidance.routes[0]) parts.push(`Suggested route: ${guidance.routes[0].label}.`);
  return parts.join(' ');
}

const PRIORITY_RANK: Record<Incident['priority'], number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Critical: 3,
};

const AUTO_CATEGORIES = new Set(['', 'General', 'Email Security', 'Account security', 'Endpoint', 'Fraud', 'Privacy']);

const AUTO_ASSIGNEE_ROOTS = [
  'Unassigned',
  'SOC Team',
  'Phishing triage queue',
  'Identity and account security analyst',
  'Endpoint and malware analyst',
  'Fraud analyst and the finance contact',
  'Privacy or legal reviewer',
];

export function isDefaultAssignee(value: string | undefined): boolean {
  const normalized = (value || '').trim();
  if (!normalized) return true;
  return AUTO_ASSIGNEE_ROOTS.some((root) => normalized === root || normalized === `${root} · on-call`);
}

export function applyGuidanceToIncident(
  incident: Incident,
  response: IncidentResponse,
  guidance: Guidance,
  options: {
    creating: boolean;
    manualPriority: Incident['priority'] | null;
    openedPriority: Incident['priority'];
    assigneeTouched: boolean;
    allowDowngrade: boolean;
    subjectTouched: boolean;
    descriptionTouched: boolean;
    categoryTouched: boolean;
  }
): Incident {
  const suggested = guidance.urgency;
  const manual = options.manualPriority;
  let priority = incident.priority;
  const managerDowngrade = Boolean(
    manual
    && options.allowDowngrade
    && options.openedPriority === 'Critical'
    && PRIORITY_RANK[manual] < PRIORITY_RANK.Critical
  );
  if (options.creating) {
    if (manual && suggested && PRIORITY_RANK[suggested] > PRIORITY_RANK[manual]) priority = suggested;
    else if (manual) priority = manual;
    else if (suggested) priority = suggested;
  } else if (manual) {
    if (!managerDowngrade && suggested && PRIORITY_RANK[suggested] > PRIORITY_RANK[manual]) priority = suggested;
    else priority = manual;
  } else if (suggested && PRIORITY_RANK[suggested] > PRIORITY_RANK[options.openedPriority]) {
    priority = suggested;
  } else {
    priority = options.openedPriority;
  }

  let assignedTo = incident.assignedTo;
  if (!options.assigneeTouched && (options.creating || isDefaultAssignee(incident.assignedTo))) {
    assignedTo = assigneeFor(guidance);
  }

  let category = incident.category;
  if (!options.categoryTouched && (options.creating || AUTO_CATEGORIES.has(category || ''))) {
    category = categoryFor(guidance);
  }

  let subject = incident.subject;
  const nextSubject = subjectFromResponse(response);
  if (!options.subjectTouched && nextSubject && (!subject.trim() || subject.startsWith('Suspicious email:'))) {
    subject = nextSubject;
  }

  let description = incident.description;
  const nextDescription = summaryFromResponse(response, guidance);
  if (!options.descriptionTouched && nextDescription && (!description.trim() || description.startsWith('Reported in IronInbox'))) {
    description = nextDescription;
  }

  let dueDate = incident.dueDate;
  if (options.creating && suggested && !dueDate.trim()) {
    dueDate = suggested === 'Critical' || suggested === 'High' ? 'Today' : 'This week';
  }

  let source = incident.source;
  if (options.creating && (!source || source === 'Manual')) {
    source = incident.sourceEmail ? 'Flagged Email' : 'Employee report';
  }

  return { ...incident, response, priority, assignedTo, category, subject, description, dueDate, source };
}
