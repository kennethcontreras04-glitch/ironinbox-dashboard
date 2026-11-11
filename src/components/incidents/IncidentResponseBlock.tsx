import React, { useState } from 'react';
import clsx from 'clsx';
import type { Incident, IncidentResponse, ReportDevice, SensitiveKind, UnusualSign, YesNoUnsure } from '../../types';
import {
  CLAIMED_OPTIONS,
  DEVICE_OPTIONS,
  SENSITIVE_OPTIONS,
  SUSPICION_OPTIONS,
  UNUSUAL_OPTIONS,
  WHEN_OPTIONS,
  YES_NO_OPTIONS,
  assessIncident,
  blockSenderInMailbox,
  looksLikeSecret,
  resolveSenderAddress,
  responseProgress,
} from '../../utils/incidentGuidance';

const fieldClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 dark:border-[var(--dm-border)] dark:bg-[var(--dm-inset)] dark:text-[var(--dm-text-primary)]';

const SENSITIVE_CHOICES = [
  { id: 'no', label: 'No' },
  { id: 'unsure', label: 'Not sure' },
  { id: 'yes:password', label: 'Yes — a password' },
  { id: 'yes:code', label: 'Yes — a verification code' },
  { id: 'yes:ssn', label: 'Yes — a Social Security number' },
  { id: 'yes:bank', label: 'Yes — bank or payroll details' },
  { id: 'yes:gift-card', label: 'Yes — a gift card or wire payment' },
];

const DID_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

const UNUSUAL_CHOICES = [
  { id: 'no', label: 'No' },
  { id: 'unsure', label: 'Not sure' },
  ...UNUSUAL_OPTIONS.map((option) => ({ id: option.id, label: `Yes — ${option.label.charAt(0).toLowerCase()}${option.label.slice(1)}` })),
  { id: 'unknown', label: 'Yes, but I’m not sure what' },
];

const urgencyTone: Record<string, string> = {
  Critical: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100',
  High: 'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-100',
  Medium: 'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/60 dark:bg-yellow-950/40 dark:text-yellow-100',
  Low: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100',
};

function Choice({
  id,
  label,
  hint,
  value,
  onChange,
  options,
  placeholder = 'Choose one',
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800 dark:text-[var(--dm-text-primary)]">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-[var(--dm-text-muted)]">
          {hint}
        </p>
      )}
      <select
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        value={value}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className={fieldClass}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function flagValue(flag: boolean | undefined): string {
  if (flag === true) return 'yes';
  if (flag === false) return 'no';
  return '';
}

function sensitiveValue(response: IncidentResponse | undefined): string {
  if (!response?.askedSensitive) return '';
  if (response.askedSensitive !== 'yes') return response.askedSensitive;
  const kind = response.sensitiveKinds?.[0];
  if (kind && SENSITIVE_OPTIONS.some((option) => option.id === kind)) return `yes:${kind}`;
  return '';
}

function unusualValue(response: IncidentResponse | undefined): string {
  if (!response?.unusualSince) return '';
  if (response.unusualSince !== 'yes') return response.unusualSince;
  const sign = response.unusualSigns?.[0];
  if (sign) return sign;
  return response.unusualDetailAnswered ? 'unknown' : '';
}

const IncidentResponseBlock: React.FC<{
  incident: Incident;
  assignmentLocked: boolean;
  onChange: (patch: Partial<IncidentResponse>) => void;
}> = ({ incident, assignmentLocked, onChange }) => {
  const response = incident.response;
  const guidance = assessIncident(response, incident.sourceEmail);
  const progress = responseProgress(response);
  const [noteRejected, setNoteRejected] = useState(false);
  const sender = resolveSenderAddress(incident.sourceEmail, response);
  const checked = new Set(response?.actionsChecked ?? []);
  let step = 0;

  const setInteraction = (key: 'clickedLink' | 'openedAttachment' | 'replied', value: string) => {
    onChange({ [key]: value === '' ? undefined : value === 'yes' });
  };

  const toggleAction = (id: string, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(id);
    else next.delete(id);
    const patch: Partial<IncidentResponse> = { actionsChecked: [...next] };
    if (id === 'block' && on && sender) {
      blockSenderInMailbox(sender);
      patch.senderBlocked = true;
      patch.senderAddress = sender;
    }
    onChange(patch);
  };

  const happened = response?.happenedAround || '';
  const whenOptions = !happened || WHEN_OPTIONS.some((option) => option.id === happened)
    ? WHEN_OPTIONS
    : [{ id: happened, label: happened }, ...WHEN_OPTIONS];

  return (
    <section
      aria-labelledby="incident-response-heading"
      className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="incident-response-heading" className="text-sm font-semibold text-slate-900 dark:text-[var(--dm-text-primary)]">
            Incident response
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-[var(--dm-text-secondary)]">
            Answer a few plain questions. Extra questions appear only when they apply. This stays inside IronInbox, and it never asks you to type a password or a verification code.
          </p>
        </div>
        <p className="flex-shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-[var(--dm-chrome)] dark:text-[var(--dm-text-muted)]">
          {progress.answered} of {progress.total}
        </p>
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(15rem,0.85fr)]">
        <div className="space-y-4">
          <div className="flex gap-3">
            <Step n={++step} />
            <div className="min-w-0 flex-1">
              <Choice
                id="ir-suspicion"
                label="What made this email seem suspicious?"
                value={response?.suspicion || ''}
                onChange={(value) => onChange({ suspicion: value ? value as IncidentResponse['suspicion'] : undefined })}
                options={SUSPICION_OPTIONS}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Step n={++step} />
            <div className="min-w-0 flex-1">
              <Choice
                id="ir-sensitive"
                label="Did it ask for personal or sensitive information?"
                hint="Pick the closest match. Don’t type the password, code, or number."
                value={sensitiveValue(response)}
                onChange={(value) => {
                  if (!value) {
                    onChange({ askedSensitive: undefined, sensitiveKinds: undefined, sensitiveDetailAnswered: undefined });
                    return;
                  }
                  if (value === 'no' || value === 'unsure') {
                    onChange({ askedSensitive: value, sensitiveKinds: undefined, sensitiveDetailAnswered: undefined });
                    return;
                  }
                  const kind = value.slice(4) as SensitiveKind;
                  onChange({ askedSensitive: 'yes', sensitiveKinds: [kind], sensitiveDetailAnswered: true });
                }}
                options={SENSITIVE_CHOICES}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Step n={++step} />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium text-slate-800 dark:text-[var(--dm-text-primary)]">
                Did you click a link, open or download an attachment, or reply?
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                <Choice
                  id="ir-clicked"
                  label="Clicked a link"
                  value={flagValue(response?.clickedLink)}
                  onChange={(value) => setInteraction('clickedLink', value)}
                  options={DID_OPTIONS}
                />
                <Choice
                  id="ir-attachment"
                  label="Opened an attachment"
                  value={flagValue(response?.openedAttachment)}
                  onChange={(value) => setInteraction('openedAttachment', value)}
                  options={DID_OPTIONS}
                />
                <Choice
                  id="ir-replied"
                  label="Replied"
                  value={flagValue(response?.replied)}
                  onChange={(value) => setInteraction('replied', value)}
                  options={DID_OPTIONS}
                />
              </div>
            </div>
          </div>

          {(response?.clickedLink || response?.openedAttachment || response?.replied) && (
            <div className="flex gap-3">
              <Step n={++step} />
              <div className="min-w-0 flex-1 space-y-2">
                <Choice
                  id="ir-secret"
                  label="Did you then type a password or a verification code?"
                  hint="Yes or no is enough. Don’t type the password or code here."
                  value={response?.typedSecret || ''}
                  onChange={(value) => onChange({ typedSecret: (value || undefined) as YesNoUnsure | undefined })}
                  options={YES_NO_OPTIONS}
                />
                <Choice
                  id="ir-sent"
                  label="Did you send money, files, or personal information?"
                  value={response?.sentMoneyOrFiles || ''}
                  onChange={(value) => onChange({ sentMoneyOrFiles: (value || undefined) as YesNoUnsure | undefined })}
                  options={YES_NO_OPTIONS}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <Step n={++step} />
            <div className="min-w-0 flex-1 space-y-2">
              <Choice
                id="ir-claimed"
                label="Did the sender claim to be someone you know?"
                hint="For example a manager, an executive, a vendor, IT, or a coworker."
                value={response?.claimedIdentity || ''}
                onChange={(value) => onChange({ claimedIdentity: (value || undefined) as YesNoUnsure | undefined })}
                options={YES_NO_OPTIONS}
              />
              {response?.claimedIdentity === 'yes' && (
                <Choice
                  id="ir-who"
                  label="Who did they claim to be?"
                  value={response.claimedWho || ''}
                  onChange={(value) => onChange({ claimedWho: (value || undefined) as IncidentResponse['claimedWho'] })}
                  options={CLAIMED_OPTIONS}
                />
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <Step n={++step} />
            <div className="min-w-0 flex-1">
              <Choice
                id="ir-since"
                label="Has anything unusual happened since?"
                hint="Pop-ups, sign-in codes you didn’t request, a locked account, or a slow computer."
                value={unusualValue(response)}
                onChange={(value) => {
                  if (!value) {
                    onChange({ unusualSince: undefined, unusualSigns: undefined, unusualDetailAnswered: undefined });
                    return;
                  }
                  if (value === 'no' || value === 'unsure') {
                    onChange({ unusualSince: value, unusualSigns: undefined, unusualDetailAnswered: undefined });
                    return;
                  }
                  if (value === 'unknown') {
                    onChange({ unusualSince: 'yes', unusualSigns: [], unusualDetailAnswered: true });
                    return;
                  }
                  onChange({ unusualSince: 'yes', unusualSigns: [value as UnusualSign], unusualDetailAnswered: true });
                }}
                options={UNUSUAL_CHOICES}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Step n={++step} />
            <div className="min-w-0 flex-1 grid gap-2 sm:grid-cols-2">
              <Choice
                id="ir-device"
                label="Which device were you using?"
                value={response?.device || ''}
                onChange={(value) => onChange({ device: (value || undefined) as ReportDevice | undefined })}
                options={DEVICE_OPTIONS}
              />
              <Choice
                id="ir-when"
                label="Roughly when did this happen?"
                value={happened}
                onChange={(value) => onChange({ happenedAround: value })}
                options={whenOptions}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Step n={++step} />
            <div className="min-w-0 flex-1">
              <Choice
                id="ir-others"
                label="Do you know if anyone else received the same email?"
                value={response?.othersReceived || ''}
                onChange={(value) => onChange({ othersReceived: (value || undefined) as YesNoUnsure | undefined })}
                options={YES_NO_OPTIONS}
              />
            </div>
          </div>

          <div className="pl-9">
            <div className="min-w-0 flex-1">
              <label htmlFor="ir-note" className="block text-sm font-medium text-slate-800 dark:text-[var(--dm-text-primary)]">
                Anything else we should know? <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="ir-note"
                name="incident-note"
                rows={2}
                autoComplete="off"
                maxLength={400}
                value={response?.note || ''}
                placeholder="What you noticed. Don’t include a password, code, or account number."
                onChange={(event) => {
                  const next = event.target.value;
                  if (looksLikeSecret(next)) {
                    setNoteRejected(true);
                    return;
                  }
                  setNoteRejected(false);
                  onChange({ note: next });
                }}
                className={clsx(fieldClass, 'resize-none')}
              />
              {noteRejected && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">
                  That looks like a password, code, or account number, so it wasn’t saved.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-0" aria-live="polite">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[var(--dm-border)] dark:bg-[var(--dm-surface-card)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-[var(--dm-text-muted)]">Do this now</p>
            <ul className="mt-2 space-y-2">
              {guidance.actions.map((action) => {
                const done = action.id === 'block' ? Boolean(response?.senderBlocked || checked.has(action.id)) : checked.has(action.id);
                const detail = action.id === 'block' && sender && !response?.senderBlocked
                  ? `Block ${sender} for your mailbox only. A company-wide block needs an analyst.`
                  : action.detail;
                return (
                  <li key={action.id}>
                    <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-[var(--dm-text-secondary)]">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={done}
                        disabled={action.id === 'block' && Boolean(response?.senderBlocked)}
                        onChange={(event) => toggleAction(action.id, event.target.checked)}
                      />
                      <span>
                        <span className="font-medium text-slate-800 dark:text-[var(--dm-text-primary)]">{action.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-[var(--dm-text-muted)]">{detail}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={clsx('rounded-xl border p-3', guidance.urgency ? urgencyTone[guidance.urgency] : 'border-slate-200 bg-white text-slate-700 dark:border-[var(--dm-border)] dark:bg-[var(--dm-surface-card)] dark:text-[var(--dm-text-secondary)]')}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">Urgency</p>
            <p className="mt-1 text-sm font-semibold">{guidance.urgency ?? 'Still gathering answers'}</p>
            {guidance.provisional && (
              <p className="mt-1 text-xs leading-relaxed">This can still go up once the rest of the answers are in. It won’t be lowered on its own.</p>
            )}
            {!guidance.urgency && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-[var(--dm-text-muted)]">
                IronInbox can raise the urgency from your answers and the email’s own score. It won’t lower a higher rating by itself.
              </p>
            )}
            {guidance.reasons.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs leading-relaxed">
                {guidance.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            {guidance.signals.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed">From the email: {guidance.signals.join(' · ')}</p>
            )}
            {guidance.afterHours && (
              <p className="mt-2 text-xs font-medium">It’s outside business hours, so the on-call analyst is flagged.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-[var(--dm-border)] dark:bg-[var(--dm-surface-card)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-[var(--dm-text-muted)]">Who looks at this</p>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-[var(--dm-text-primary)]">{guidance.routes[0]?.label}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-[var(--dm-text-muted)]">{guidance.routes[0]?.why}</p>
            {guidance.routes.length > 1 && (
              <p className="mt-2 text-xs text-slate-600 dark:text-[var(--dm-text-secondary)]">
                Also notified: {guidance.routes.slice(1).map((route) => route.label).join(', ')}
              </p>
            )}
            {assignmentLocked && (
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-[var(--dm-text-muted)]">
                {incident.assignedTo?.trim() || 'The current assignee'} stays on it. IronInbox won’t replace someone an analyst assigned.
              </p>
            )}
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-[var(--dm-text-muted)]">
              An analyst still decides company-wide blocks, password resets, and whether a critical report is a false alarm.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

function Step({ n }: { n: number }) {
  return (
    <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white" aria-hidden>
      {n}
    </span>
  );
}

export default IncidentResponseBlock;
