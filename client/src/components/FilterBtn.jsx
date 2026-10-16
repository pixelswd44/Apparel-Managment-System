import { SlidersHorizontal } from 'lucide-react';

// Small filter toggle that sits inside a search field (position it in a `relative` wrapper).
// Shows a dot badge when a filter is active so hidden filters are never forgotten.
export default function FilterBtn({ open, onClick, active = false }) {
  return (
    <button type="button" onClick={onClick} title="Filters"
      className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
        open ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'}`}>
      <SlidersHorizontal size={14} />
      {active && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" />}
    </button>
  );
}
