import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2, Phone, MapPin, AlertTriangle, ChevronRight, Scissors, Users } from 'lucide-react';
import api from '../lib/api';
import { pkr } from '../lib/currency';
import Drawer from '../components/Drawer';
import PeriodPicker from '../components/PeriodPicker';
import { PRODUCTION_KINDS } from '../lib/production';

// Expenses → Production: what was paid per project for embroidery, sublimation,
// cutting & threads and belts, and the people on each job's list. Payments are
// ordinary project expenses (with agent_id) entered on the expense form.

const BLANK = { name: '', phone: '', city: '', notes: '' };
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';
const fmtDate = d => {
  if (!d) return '—';
  const dt = new Date(String(d).length === 10 ? `${d}T00:00:00` : String(d).replace(' ', 'T'));
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const Spinner = () => (
  <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
);

// ── Add / edit a person ──────────────────────────────────────────────────────
function PersonForm({ kind, person, onClose, onSaved }) {
  const [form, setForm]     = useState(person ? { ...BLANK, ...person } : BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Enter the name.'); return; }
    setSaving(true); setError('');
    try {
      const { data } = person
        ? await api.put(`/production-agents/${person.id}`, form)
        : await api.post('/production-agents', { ...form, kind: kind.kind });
      onSaved(data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save.');
    } finally { setSaving(false); }
  }

  return (
    <Drawer open onClose={onClose} title={person ? `Edit ${kind.person}` : `New ${kind.person}`} width="max-w-md">
      <form onSubmit={submit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} autoFocus />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} placeholder="+92 …" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">City</label>
            <input value={form.city} onChange={e => set('city', e.target.value)} className={inputCls} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
            className={`${inputCls} resize-none`} placeholder="Rates, account details…" />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50">
            {saving ? 'Saving…' : person ? 'Save Changes' : 'Add'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ── A person's profile with everything paid to them ──────────────────────────
function PersonProfile({ kind, personId, onClose, onEdit, onDeleted }) {
  const navigate = useNavigate();
  const [person, setPerson]      = useState(null);
  const [confirmDel, setConfirm] = useState(false);
  const [deleting, setDeleting]  = useState(false);

  useEffect(() => {
    let live = true;
    api.get(`/production-agents/${personId}`).then(r => { if (live) setPerson(r.data); }).catch(() => {});
    return () => { live = false; };
  }, [personId]);

  async function remove() {
    setDeleting(true);
    try { await api.delete(`/production-agents/${personId}`); onDeleted(); }
    finally { setDeleting(false); }
  }

  return (
    <Drawer open onClose={onClose} title={person?.name || kind.person} subtitle={kind.person} width="max-w-lg">
      {!person ? <Spinner /> : (
        <div className="p-6 space-y-5">
          {(person.phone || person.city) ? (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm">
              {person.phone && <div className="flex items-center gap-2 text-slate-700"><Phone size={14} className="text-slate-400" /> {person.phone}</div>}
              {person.city && <div className="flex items-center gap-2 text-slate-700"><MapPin size={14} className="text-slate-400" /> {person.city}</div>}
            </div>
          ) : (
            <p className="text-slate-400 italic text-xs">No contact details yet — use Edit to add them.</p>
          )}
          {person.notes && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{person.notes}</p>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Payments <span className="text-slate-400 normal-case font-normal">({person.payments.length}{person.total_paid > 0 ? ` · ${pkr(person.total_paid)} paid` : ''})</span>
            </p>
            {person.payments.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Nothing paid yet.</p>
            ) : (
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {person.payments.map(p => (
                  <button key={p.id} type="button" onClick={() => p.project_id && navigate(`/projects?open=${p.project_id}`)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.project_title || 'No project'}</p>
                      <p className="text-xs text-slate-400 truncate">{fmtDate(p.expense_date)}{p.client_name ? ` · ${p.client_name}` : ''}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700 flex-shrink-0">{pkr(p.amount)}</span>
                    <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {confirmDel ? (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-xs">
              <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700">
                Delete {person.name}?{person.payments.length > 0 && ' Past payments stay and keep the name.'}
              </span>
              <button onClick={() => setConfirm(false)} className="px-2 py-1 border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
              <button onClick={remove} disabled={deleting} className="px-2 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => onEdit(person)}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium">
                <Pencil size={14} /> Edit
              </button>
              <button onClick={() => setConfirm(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 font-medium">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

// ── Payments of one kind ─────────────────────────────────────────────────────
function Payments({ kind }) {
  const navigate = useNavigate();
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [range, setRange]     = useState({ from: null, to: null, label: 'All Time' });

  useEffect(() => {
    setLoading(true);
    api.get('/production-agents/payments', { params: { kind: kind.kind, ...(range.from ? { from: range.from, to: range.to } : {}) } })
      .then(r => setRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [kind.kind, range.from, range.to]);

  const q = search.trim().toLowerCase();
  const shown = rows.filter(r => !q || [r.project_title, r.client_name, r.agent_name, r.notes]
    .some(f => f && String(f).toLowerCase().includes(q)));
  const total = shown.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const projectCount = new Set(shown.map(r => r.project_id).filter(Boolean)).size;
  const open = r => r.project_id && navigate(`/projects?open=${r.project_id}`);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-w-0">
          <p className="text-lg font-bold text-slate-900 break-words">{pkr(total)}</p>
          <p className="text-xs text-slate-500">{kind.label} Paid</p>
          <p className="text-2xs text-slate-400 truncate">{range.label}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm min-w-0">
          <p className="text-lg font-bold text-slate-900">{projectCount}</p>
          <p className="text-xs text-slate-500">Projects</p>
          <p className="text-2xs text-slate-400 truncate">{shown.length} payment{shown.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input placeholder={`Search project, client, ${kind.person.toLowerCase()}…`} value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <PeriodPicker defaultMode="all" onChange={setRange} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? <Spinner /> : shown.length === 0 ? (
          <div className="py-16 text-center">
            <Scissors size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-400">No {kind.label.toLowerCase()} payments found</p>
            <button onClick={() => navigate(`/expenses/new?type=${encodeURIComponent(kind.label)}`)}
              className="mt-2 text-sm text-indigo-600 hover:underline font-medium">Add a payment</button>
          </div>
        ) : (<>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">{kind.person}</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(r => (
                  <tr key={r.id} onClick={() => open(r)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(r.expense_date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.project_title || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.client_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.agent_name || <span className="text-slate-300">not set</span>}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-[220px] truncate">{r.notes || ''}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">{pkr(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={5} className="px-4 py-3 text-xs font-semibold text-slate-500">{shown.length} payments</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900">{pkr(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-100">
            {shown.map(r => (
              <button key={r.id} type="button" onClick={() => open(r)} className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{r.project_title || 'No project'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtDate(r.expense_date)}{r.agent_name ? ` · ${r.agent_name}` : ''}{r.client_name ? ` · ${r.client_name}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-900 flex-shrink-0">{pkr(r.amount)}</span>
              </button>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
              <span className="text-xs font-semibold text-slate-500">{shown.length} payments</span>
              <span className="text-sm font-bold text-slate-900">{pkr(total)}</span>
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ── People on one kind's list ────────────────────────────────────────────────
function People({ kind }) {
  const [people, setPeople]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);  // null | 'new' | person
  const [viewing, setViewing] = useState(null);  // person id

  const load = useCallback(async () => {
    try { const { data } = await api.get('/production-agents', { params: { kind: kind.kind } }); setPeople(Array.isArray(data) ? data : []); }
    catch { setPeople([]); }
    finally { setLoading(false); }
  }, [kind.kind]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">Pick them when you add a {kind.label} expense</p>
        <button onClick={() => setEditing('new')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex-shrink-0">
          <Plus size={16} /> Add
        </button>
      </div>

      {loading ? <Spinner /> : people.length === 0 ? (
        <div className="py-16 text-center bg-white border border-slate-200 rounded-2xl">
          <Users size={30} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">No {kind.person.toLowerCase()}s yet</p>
          <button onClick={() => setEditing('new')} className="mt-2 text-sm text-indigo-600 hover:underline font-medium">Add the first one</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {people.map(a => (
            <div key={a.id} onClick={() => setViewing(a.id)}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-indigo-300 hover:shadow transition-all cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Scissors size={18} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate group-hover:text-indigo-700">{a.name}</p>
                  <p className="text-xs text-slate-400 truncate">{[a.phone, a.city].filter(Boolean).join(' · ') || 'No contact details'}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); setEditing(a); }} title="Edit"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 flex-shrink-0"><Pencil size={13} /></button>
              </div>
              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <span><strong className="text-slate-800">{a.project_count}</strong> project{a.project_count !== 1 ? 's' : ''}</span>
                <span>{a.total_paid > 0 ? <><strong className="text-slate-800">{pkr(a.total_paid)}</strong> paid</> : <span className="text-slate-300">nothing paid yet</span>}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* While editing, an open profile is hidden; it re-opens and reloads afterwards */}
      {editing && (
        <PersonForm kind={kind} person={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {viewing && !editing && (
        <PersonProfile key={viewing} kind={kind} personId={viewing}
          onClose={() => setViewing(null)} onEdit={a => setEditing(a)} onDeleted={() => { setViewing(null); load(); }} />
      )}
    </div>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────
export default function ProductionTab() {
  const navigate = useNavigate();
  const [kindKey, setKindKey] = useState(PRODUCTION_KINDS[0].kind);
  const [view, setView] = useState('payments'); // 'payments' | 'people'
  const kind = PRODUCTION_KINDS.find(k => k.kind === kindKey);
  const chip = on => `px-3 py-1.5 text-sm rounded-lg font-semibold transition-all whitespace-nowrap ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit max-w-full overflow-x-auto">
        {PRODUCTION_KINDS.map(k => (
          <button key={k.kind} onClick={() => setKindKey(k.kind)} className={chip(kindKey === k.kind)}>{k.label}</button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
          <button onClick={() => setView('payments')} className={chip(view === 'payments')}>Payments</button>
          <button onClick={() => setView('people')} className={chip(view === 'people')}>{kind.person}s</button>
        </div>
        {view === 'payments' && (
          <button onClick={() => navigate(`/expenses/new?type=${encodeURIComponent(kind.label)}`)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
            <Plus size={16} /> Add<span className="hidden sm:inline"> {kind.label} Payment</span>
          </button>
        )}
      </div>
      {view === 'payments' ? <Payments key={kind.kind} kind={kind} /> : <People key={kind.kind} kind={kind} />}
    </div>
  );
}
