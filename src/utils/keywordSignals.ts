import { DetectionActions, FlaggedEmail, Keyword, Signal } from '../types';

const norm = (s: string) => s.trim().toLowerCase();

function keywordEnabled(keywords: Keyword[], value: string) {
  return keywords.some((kw) => kw.enabled && norm(kw.value) === norm(value));
}

function signalIsVisible(signal: Signal, keywords: Keyword[], detectionActions?: DetectionActions, forTags = false) {
  if (signal.type === 'keyword') {
    if (forTags && detectionActions?.showInDashboard === false) return false;
    if (signal.source === 'server' && signal.detector !== 'user-keyword') return true;
    if (signal.detector === 'user-keyword' || signal.source !== 'server') {
      return keywordEnabled(keywords, signal.value);
    }
    return true;
  }
  if (signal.source === 'server') return true;
  if (signal.type === 'typo') return true;
  return keywordEnabled(keywords, signal.value);
}

export function getVisibleSignals(
  email: FlaggedEmail,
  keywords: Keyword[],
  detectionActions?: DetectionActions
): Signal[] {
  return email.signals.filter((signal) => signalIsVisible(signal, keywords, detectionActions, true));
}

export function filterVisibleFlaggedEmails(
  emails: FlaggedEmail[],
  keywords: Keyword[]
): FlaggedEmail[] {
  return emails.filter((email) => {
    if (!email.signals || email.signals.length === 0) return true;
    return email.signals.some((signal) => signalIsVisible(signal, keywords, undefined, false));
  });
}

export function hasVisibleKeywordHit(
  email: FlaggedEmail,
  keywords: Keyword[],
  detectionActions?: DetectionActions
): boolean {
  return getVisibleSignals(email, keywords, detectionActions).some((signal) => signal.type === 'keyword');
}

export function hasVisibleTypoHit(
  email: FlaggedEmail,
  keywords: Keyword[],
  detectionActions?: DetectionActions
): boolean {
  return getVisibleSignals(email, keywords, detectionActions).some((signal) => signal.type === 'typo');
}
