import type { Keyword } from '../types';

// Starter keywords for new users: phrases that phishing and payment scams use,
// rather than everyday words like "account" or "confirm" that appear in most
// normal mail. A match flags the email as a "Keyword match" but never changes
// its risk score. Users can edit this list on the Keyword Monitoring page.
export const defaultKeywords: Keyword[] = [
  { id: '1', value: 'verify your account', createdAt: '2026-11-16', enabled: true },
  { id: '2', value: 'confirm your identity', createdAt: '2026-11-16', enabled: true },
  { id: '3', value: 'password expires', createdAt: '2026-11-16', enabled: true },
  { id: '4', value: 'account suspended', createdAt: '2026-11-16', enabled: true },
  { id: '5', value: 'gift card', createdAt: '2026-11-16', enabled: true },
  { id: '6', value: 'wire transfer', createdAt: '2026-11-16', enabled: true },
  { id: '7', value: 'bank details', createdAt: '2026-11-16', enabled: true },
  { id: '8', value: 'direct deposit', createdAt: '2026-11-16', enabled: true },
  { id: '9', value: 'claim your prize', createdAt: '2026-11-16', enabled: true },
  { id: '10', value: 'unusual sign-in', createdAt: '2026-11-16', enabled: true },
];
