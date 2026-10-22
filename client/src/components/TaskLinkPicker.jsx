import { useState, useEffect } from 'react';
import { Search, Check, Tag, UserRound, FolderKanban } from 'lucide-react';
import api from '../lib/api';

// Inline panel under the task quick-add: choose whether a task is general or for
// a client / project, then pick which one. value = null | { type, id, name, sub }.

export default function TaskLinkPicker({ value, onChange, allowProjects = true }) {
  const [tab, setTab]       = useState(value?.type || 'general');
  const [links, setLinks]   = useState(null); // { clients, projects }
  const [query, setQuery]   = useState('');
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get('/reminders/links')
      .then(r => setLinks({ clients: r.data?.clients || [], projects: r.data?.projects || [] }))
      .catch(() => setError('Could not load clients and projects.'));
  }, []);

  const tabs = [
    { key: 'general', label: 'General', icon: Tag },
    { key: 'client',  label: 'Client',  icon: UserRound },
    ...(allowProjects ? [{ key: 'project', label: 'Project', icon: FolderKanban }] : []),
  ];

  const q = query.trim().toLowerCase();
  const items = !links || tab === 'general' ? []
    : tab === 'client'
      ? links.clients.map(c => ({ type: 'client', id: c.id, name: c.name || `Client #${c.id}` }))
      : links.projects.map(p => ({ type: 'project', id: p.id, name: p.title || `Project #${p.id}`, sub: p.client_name || '' }));
  const shown = q ? items.filter(i => `${i.name} ${i.sub || ''}`.toLowerCase().includes(q)) : items;

  return (
    <div className="mt-1.5 mr-1.5 mb-0.5 rounded-2xl bg-white/80 border border-black/[.06] p-2">
      {/* iOS-style segmented control */}
      <div className="flex p-0.5 rounded-xl bg-black/[.05]">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} type="button"
              onClick={() => { setTab(t.key); setQuery(''); if (t.key === 'general') onChange(null); }}
              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-[10px] text-[11px] font-semibold transition-colors ${
                active ? 'bg-white text-[#1d1d1f] shadow-sm' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
              <Icon size={11} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab !== 'general' && (
        <>
          <div className="mt-2 flex items-center gap-1.5 px-2.5 rounded-xl bg-black/[.04]">
            <Search size={12} className="text-[#86868b] flex-shrink-0" />
            <input autoFocus key={tab} value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (shown[0]) onChange(shown[0]); } }}
              placeholder={tab === 'client' ? 'Search clients…' : 'Search projects…'}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none focus-visible:outline-none text-xs text-[#1d1d1f] placeholder:text-[#86868b] py-1.5" />
          </div>
          <ul className="mt-1 max-h-44 overflow-y-auto">
            {error ? <li className="px-2 py-3 text-xs text-rose-600">{error}</li>
              : !links ? <li className="px-2 py-3 text-xs text-[#86868b]">Loading…</li>
              : shown.length === 0 ? (
                <li className="px-2 py-3 text-xs text-[#86868b]">
                  {items.length ? 'No matches.' : tab === 'client' ? 'No clients yet.' : 'No projects yet.'}
                </li>
              ) : shown.map(i => {
                const selected = value?.type === i.type && value?.id === i.id;
                return (
                  <li key={`${i.type}-${i.id}`}>
                    <button type="button" onClick={() => onChange(i)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-[#0071e3]/[.08] ${selected ? 'bg-[#0071e3]/10' : ''}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-[#1d1d1f] truncate">{i.name}</span>
                        {i.sub && <span className="block text-[10px] text-[#86868b] truncate">{i.sub}</span>}
                      </span>
                      {selected && <Check size={12} className="text-[#0071e3] flex-shrink-0" />}
                    </button>
                  </li>
                );
              })}
          </ul>
        </>
      )}
    </div>
  );
}
