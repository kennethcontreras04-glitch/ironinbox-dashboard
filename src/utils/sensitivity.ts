// Risk sensitivity: emails are flagged when their score is at least the threshold.
//
// 40 = "Balanced" (the default): wording alone is capped at 30 points, so an
// email needs at least one piece of technical evidence (failed authentication,
// a lookalike domain, a deceptive link, a dangerous attachment...) to be flagged.
export const DEFAULT_RISK_THRESHOLD = 40;
export const MIN_RISK_THRESHOLD = 25;
export const MAX_RISK_THRESHOLD = 75;

export const clampThreshold = (value: number) => Number.isFinite(value)
  ? Math.min(MAX_RISK_THRESHOLD, Math.max(MIN_RISK_THRESHOLD, Math.round(value)))
  : DEFAULT_RISK_THRESHOLD;

export const SENSITIVITY_PRESETS = [
  { label: 'Strict', threshold: 30, description: 'Flags more. Strong wording plus a minor warning sign is enough. Expect more emails to review.' },
  { label: 'Balanced', threshold: DEFAULT_RISK_THRESHOLD, description: 'Recommended. Needs at least one technical warning sign; wording alone is never enough.' },
  { label: 'Relaxed', threshold: 55, description: 'Flags less. Only emails with strong or multiple warning signs. Some real attacks may slip through.' },
] as const;

export function presetFor(threshold: number) {
  return SENSITIVITY_PRESETS.find(preset => preset.threshold === threshold);
}
