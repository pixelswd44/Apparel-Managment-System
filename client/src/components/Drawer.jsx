/**
 * Drawer — right-side sliding panel (replaces all modal dialogs).
 *
 * Props:
 *   open     — boolean, controls visibility
 *   onClose  — fn() called on backdrop click or Escape key
 *   title    — string header title
 *   subtitle — optional sub-text under the title
 *   width    — Tailwind max-w class, default 'max-w-lg'
 *   footer   — optional ReactNode rendered in a sticky footer bar
 *   children — main scrollable body content
 */
import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function Drawer({ open, onClose, title, subtitle, width = 'max-w-lg', children, footer }) {
  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-overlay"
        onClick={onClose}
      />

      {/* Sliding panel */}
      <div
        className={`fixed inset-y-0 right-0 ${width} w-full bg-white z-50 flex flex-col shadow-2xl animate-drawer`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="font-semibold text-slate-900 text-base leading-tight">{title}</h2>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer && (
          <div className="flex-shrink-0 border-t border-slate-200 px-6 py-4 bg-slate-50/60">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
