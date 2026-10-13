import type { ReactNode } from 'react';
import { RiFileDownloadLine } from 'react-icons/ri';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '../../contexts/useSettings';
import NotificationBell from './NotificationBell';

interface HeaderProps {
  title: string;
  showActions?: boolean;
  onExportPDF?: () => void;
  actionNode?: ReactNode;
}
export default function Header({ title, showActions = false, onExportPDF, actionNode }: HeaderProps) {
  const { profile } = useSettings();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-40 px-8 py-3.5 bg-white/95 border-b border-slate-200 shadow-sm dark:bg-[var(--dm-bg-header)] dark:border-[var(--dm-border)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            <button onClick={() => navigate('/dashboard')} className="hover:text-blue-600">Home</button>
            <span>/</span><span className="text-blue-600 dark:text-blue-400">{title}</span>
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-[var(--dm-text-primary)]">{title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {showActions && onExportPDF && (
            <button onClick={onExportPDF} className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700">
              <RiFileDownloadLine className="w-4 h-4" />Export PDF
            </button>
          )}
          {actionNode}
          <NotificationBell />
          <button onClick={() => navigate('/account')} aria-label="Open account" className="rounded-full border border-slate-200 overflow-hidden">
            <img src={profile.avatar || '/logo.png'} alt="" className="w-9 h-9 object-cover" />
          </button>
        </div>
      </div>
    </header>
  );
}
