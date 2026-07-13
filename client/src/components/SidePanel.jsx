import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Slide-out panel from the right edge — 480px wide on desktop, full-width on mobile
 *
 * Props:
 *   open       — boolean, controls visibility
 *   onClose    — callback when backdrop or close button clicked
 *   title      — header title
 *   subtitle   — small subtitle text below title
 *   children   — body content
 *   footer     — optional footer (e.g. Cancel/Save buttons)
 *   width      — optional, defaults to 'md' (480px). Options: 'md' | 'lg' (640px)
 */
export default function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}) {
  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const widthCls = width === 'lg' ? 'sm:max-w-[640px]' : 'sm:max-w-[480px]';

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-200
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`fixed top-0 right-0 h-screen w-full ${widthCls} bg-white z-50 shadow-2xl
          flex flex-col transition-transform duration-300 ease-out
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="min-w-0 flex-1 pr-3">
            <h2 className="text-lg font-bold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">{children}</div>

        {/* Footer — sticky */}
        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex-shrink-0">
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}
