import React from 'react';
import Modal from '../common/Modal';
import { FlaggedEmail, Signal } from '../../types';
import { useApp } from '../../contexts/useApp';
import { useSettings } from '../../contexts/useSettings';
import { getVisibleSignals } from '../../utils/keywordSignals';
import { RiAlertLine, RiKeyLine, RiShieldCheckLine, RiTimeLine, RiUser3Line } from 'react-icons/ri';
import { BiEnvelope } from 'react-icons/bi';
import { useNavigate } from 'react-router-dom';

interface EmailDetailModalProps {
  email: FlaggedEmail | null;
  onClose: () => void;
}

const DETECTOR_LABELS: Record<string, string> = {
  'user-keyword': 'Keyword Detected',
  phrase: 'Pressure Language',
  auth: 'Authentication Failed',
  'lookalike-domain': 'Lookalike Domain',
  'display-name': 'Display-Name Spoof',
  'reply-to': 'Reply-To Mismatch',
  'link-mismatch': 'Deceptive Link',
  'link-ip': 'IP Address Link',
  attachment: 'Risky Attachment',
  'provider-spam': 'Provider Spam',
  llm: 'Model Review',
};

function signalLabel(signal: Signal) {
  if (signal.detector && DETECTOR_LABELS[signal.detector]) return DETECTOR_LABELS[signal.detector];
  return signal.type === 'keyword' ? 'Keyword Detected' : 'Suspicious Domain';
}

function signalWeight(signal: Signal) {
  if (typeof signal.weight !== 'number') return '';
  const signed = signal.weight > 0 ? `+${signal.weight}` : String(signal.weight);
  return ` · ${signed}`;
}

const EmailDetailModal: React.FC<EmailDetailModalProps> = ({ email, onClose }) => {
  const { releaseEmail, keywords, createIncidentFromFlaggedEmail } = useApp();
  const { riskFlagThreshold } = useSettings();
  const navigate = useNavigate();
  const [showCreateIncidentPanel, setShowCreateIncidentPanel] = React.useState(false);
  const [assignedTo, setAssignedTo] = React.useState('SOC Team');
  const [dueDate, setDueDate] = React.useState(() => {
    const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
    nextDay.setHours(17, 0, 0, 0);
    const offsetMs = nextDay.getTimezoneOffset() * 60 * 1000;
    return new Date(nextDay.getTime() - offsetMs).toISOString().slice(0, 16);
  });

  if (!email) return null;

  const visibleSignals = getVisibleSignals(email, keywords);

  const handleRelease = () => { releaseEmail(email.id); onClose(); };

  const handleCreateIncident = () => {
    if (!dueDate) return;
    const parsed = new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) return;
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const sameDay   = parsed.toDateString() === now.toDateString();
    const isTomorrow = parsed.toDateString() === tomorrow.toDateString();
    const timePart  = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const datePart  = parsed.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const friendlyDueDate = sameDay ? `Today, ${timePart}` : isTomorrow ? `Tomorrow, ${timePart}` : `${datePart}, ${timePart}`;
    createIncidentFromFlaggedEmail(email, { dueDate: friendlyDueDate, assignedTo: assignedTo.trim() || 'SOC Team' });
    setShowCreateIncidentPanel(false);
    onClose();
    navigate('/incidents');
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'Critical': return 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-800/60';
      case 'High':     return 'text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950/40 dark:border-orange-800/60';
      case 'Medium':   return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800/60';
      default:         return 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/40 dark:border-blue-800/60';
    }
  };

  const score = email.riskScore;
  const elevatedNumeric =
    score >= 82 || email.riskLevel === 'Critical' || email.riskLevel === 'High';
  const sensitivityOnlyFlag =
    (email.riskLevel === 'Low' || email.riskLevel === 'Medium') &&
    score >= riskFlagThreshold &&
    score < 72;

  const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all bg-white border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 dark:bg-[var(--dm-chrome)] dark:border-[var(--dm-border)] dark:text-[var(--dm-text-primary)] dark:focus:border-blue-500/40';

  return (
    <Modal isOpen={!!email} onClose={onClose} title="Email Analysis Report">
      <div className="space-y-6 animate-fade-in">
        {email.mailboxEmail && <p className="text-xs text-slate-500">Monitored account: {email.mailboxEmail}</p>}

        {/* Email header */}
        <div className="rounded-lg border p-4 bg-slate-50/80 border-slate-200 dark:bg-[var(--dm-bg-elevated)] dark:border-[var(--dm-border)]">
          <div className="flex items-start justify-between mb-4 gap-4">
            <h3 className="text-sm font-bold text-slate-900 leading-tight dark:text-[var(--dm-text-primary)]">{email.subject}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border flex-shrink-0 font-mono ${getRiskBadge(email.riskLevel)}`}>
              {email.riskLevel.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: <RiUser3Line className="w-4 h-4" />, label: 'Sender',   value: email.sender },
              { icon: <RiTimeLine className="w-4 h-4" />,  label: 'Received', value: email.received },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 dark:bg-[var(--dm-surface-popover)] dark:border-[var(--dm-border)] text-slate-400 dark:text-[var(--dm-text-muted)]">
                  {icon}
                </div>
                <div>
                  <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 dark:text-[var(--dm-text-muted)]">{label}</p>
                  <p className="text-xs font-medium text-slate-800 dark:text-[var(--dm-text-secondary)]">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Numeric risk (detail analysis only) */}
        <div
          className={`rounded-lg border p-4 transition-colors ${
            elevatedNumeric
              ? 'border-fuchsia-500/45 bg-fuchsia-50/60 dark:bg-fuchsia-950/25 dark:border-fuchsia-500/35'
              : 'border-slate-200 bg-white/50 dark:border-[var(--dm-border)] dark:bg-[var(--dm-bg-elevated)]'
          }`}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-[var(--dm-text-muted)]">
                Model risk score
              </p>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-[var(--dm-text-primary)] mt-0.5">
                {score}
                <span className="text-xs font-medium text-slate-400 dark:text-[var(--dm-text-muted)]"> / 100</span>
              </p>
            </div>
            <div className="text-right text-[10px] font-mono text-slate-500 dark:text-[var(--dm-text-muted)] max-w-[200px]">
              Current bar: <span className="text-slate-700 dark:text-[var(--dm-text-secondary)]">{riskFlagThreshold}</span>
              {sensitivityOnlyFlag && (
                <span className="block mt-1 text-fuchsia-700 dark:text-fuchsia-300">
                  In queue due to sensitivity threshold
                </span>
              )}
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-200/80 dark:bg-black/30 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                elevatedNumeric ? 'bg-fuchsia-500 dark:bg-fuchsia-400' : 'bg-slate-400 dark:bg-slate-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
            />
          </div>
        </div>

        {/* Detection signals */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <RiAlertLine className="w-4 h-4 text-slate-400 dark:text-[var(--dm-text-muted)]" />
            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-[var(--dm-text-muted)] dark:font-mono">
              Detection Signals
            </h3>
            <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-2 py-0.5 rounded dark:bg-[var(--dm-chrome)] dark:text-[var(--dm-text-muted)]">
              {visibleSignals.length}
            </span>
          </div>

          <div className="space-y-2">
            {visibleSignals.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-[var(--dm-text-muted)]">
                No active detection signals based on your current keyword settings.
              </p>
            ) : visibleSignals.map((signal, index) => (
              <div key={index}
                   className={`p-3 rounded-lg border transition-colors
                               ${signal.type === 'keyword'
                                 ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/50'
                                 : 'bg-indigo-50/50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900/50'}`}>
                <div className="flex items-start gap-3">
                  <div className={`p-1.5 rounded-md ${signal.type === 'keyword' ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400'}`}>
                    {signal.type === 'keyword' ? <RiKeyLine className="w-4 h-4" /> : <BiEnvelope className="w-4 h-4" />}
                  </div>
                  <div className="flex-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${signal.type === 'keyword' ? 'text-amber-700 dark:text-amber-400' : 'text-indigo-700 dark:text-indigo-400'}`}>
                      {signalLabel(signal)}{signalWeight(signal)}
                    </span>
                    <p className="text-xs text-slate-700 font-medium mt-0.5 dark:text-[var(--dm-text-secondary)]">{signal.description}</p>
                    <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono border bg-white/70 dark:bg-[var(--dm-surface-popover)] dark:border-[var(--dm-border)] dark:text-[var(--dm-text-secondary)]">
                      {signal.value}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-[var(--dm-border)]">
          <p className="text-[10px] font-mono text-slate-400 dark:text-[var(--dm-text-muted)]">
            Message ID: {email.id}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setShowCreateIncidentPanel(prev => !prev)}
              className="px-4 py-2 text-xs font-semibold rounded-lg border transition-colors
                         bg-white border-slate-200 text-slate-700 hover:bg-slate-50
                         dark:bg-[var(--dm-chrome)] dark:border-[var(--dm-border)] dark:text-[var(--dm-text-secondary)] dark:hover:bg-[var(--dm-inset-hover)]">
              {showCreateIncidentPanel ? 'Cancel' : 'Create Incident'}
            </button>
            <button onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors
                         text-slate-600 hover:bg-slate-50 dark:text-[var(--dm-text-muted)] dark:hover:bg-white/[0.03] dark:hover:text-[var(--dm-text-primary)]">
              Close
            </button>
            <button onClick={handleRelease}
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-all
                         bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5">
              <RiShieldCheckLine className="w-3.5 h-3.5" />
              Release Email
            </button>
          </div>
        </div>

        {/* Create incident panel */}
        {showCreateIncidentPanel && (
          <div className="rounded-lg border p-4 bg-blue-50/50 border-blue-200 dark:bg-blue-500/[0.05] dark:border-blue-500/20">
            <h4 className="text-xs font-bold text-blue-700 dark:text-blue-300 mb-1">Create Linked Incident</h4>
            <p className="text-xs text-slate-500 mb-4 dark:text-[var(--dm-text-muted)]">
              Review these fields, then confirm to avoid accidental incident creation.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-[var(--dm-text-muted)]">Due Date</label>
                <input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 mb-1.5 dark:text-[var(--dm-text-muted)]">Assigned To</label>
                <input type="text" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="SOC Team" className={inputCls} />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={handleCreateIncident} disabled={!dueDate}
                className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors
                           bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed
                           dark:bg-blue-600 dark:text-white dark:hover:bg-blue-500">
                Confirm & Create Incident
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default EmailDetailModal;
