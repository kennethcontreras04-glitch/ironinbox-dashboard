import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RiNotification3Line } from 'react-icons/ri';
import { useApp } from '../../contexts/useApp';

const NotificationBell = () => {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((value) => !value)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[var(--dm-border)] dark:bg-[var(--dm-chrome)] dark:text-[var(--dm-text-secondary)] dark:hover:bg-[var(--dm-inset-hover)]"
      >
        <RiNotification3Line className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-[var(--dm-border)] dark:bg-[var(--dm-surface-card)]">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-[var(--dm-border)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[var(--dm-text-muted)]">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllNotificationsRead}
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-slate-400 dark:text-[var(--dm-text-muted)]">No alerts right now</p>
            ) : notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  markNotificationRead(item.id);
                  setOpen(false);
                  navigate(item.href);
                }}
                className={`block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-slate-50 dark:border-[var(--dm-border)] dark:hover:bg-white/[0.03] ${item.read ? 'opacity-70' : ''}`}
              >
                <p className="text-xs font-semibold text-slate-800 dark:text-[var(--dm-text-primary)]">{item.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-[var(--dm-text-muted)]">{item.body}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
