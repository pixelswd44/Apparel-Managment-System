import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Plus, Search, Pencil, Trash2, Phone, Mail, MapPin, User, AlertTriangle, ChevronRight,
} from 'lucide-react';
import api from '../lib/api';
import Drawer from '../components/Drawer';

// Shipping agency profiles — picked on a project's Shipping tab.

const BLANK = { name: '', contact_name: '', phone: '', email: '', address: '', city: '', country: '', notes: '' };
const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400';
const fmtDate = d => {
  if (!d) return '—';
  const dt = new Date(String(d).length === 10 ? `${d}T00:00:00` : String(d).replace(' ', 'T'));
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const place = a => [a.city, a.country].filter(Boolean).join(', ');
const pkr = v => `₨${Math.round(parseFloat(v) || 0).toLocaleString('en-US')}`;

// ── Add / edit form ──────────────────────────────────────────────────────────
function AgentForm({ agent, onClose, onSaved }) {
  const [form, setForm]     = useState(agent ? { ...BLANK, ...agent } : BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Enter the agency name.'); return; }
    setSaving(true); setError('');
    try {
      const { data } = agent
        ? await api.put(`/shipping-agents/${agent.id}`, form)
        : await api.post('/shipping-agents', form);
      onSaved(data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save.');
    } finally { setSaving(false); }
  }

  const field = (key, label, props = {}) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input value={form[key]} onChange={e => set(key, e.target.value)} className={inputCls} {...props} />
    </div>
  );

  return (
    <Drawer open onClose={onClose} title={agent ? 'Edit Shipping Agent' : 'New Shipping Agent'} width="max-w-md">
      <form onSubmit={submit} className="p-6 space-y-4">
        {field('name', 'Agency Name *', { placeholder: 'e.g. Abdullah Shipping', autoFocus: true })}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('contact_name', 'Contact Person')}
          {field('phone', 'Phone', { placeholder: '+92 …' })}
        </div>
        {field('email', 'Email', { type: 'email' })}
        {field('address', 'Address')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field('city', 'City')}
          {field('country', 'Country')}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
            className={`${inputCls} resize-none`} placeholder="Rates, routes, account details…" />
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50">
            {saving ? 'Saving…' : agent ? 'Save Changes' : 'Add Agent'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ── Profile panel ────────────────────────────────────────────────────────────
function AgentProfile({ agentId, onClose, onEdit, onDeleted }) {
  const navigate = useNavigate();
  const [agent, setAgent]       = useState(null);
  const [confirmDel, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    api.get(`/shipping-agents/${agentId}`).then(r => { if (live) setAgent(r.data); }).catch(() => {});
    return () => { live = false; };
  }, [agentId]);

  async function remove() {
    setDeleting(true);
    try { await api.delete(`/shipping-agents/${agentId}`); onDeleted(); }
    finally { setDeleting(false); }
  }

  return (
    <Drawer open onClose={onClose} title={agent?.name || 'Shipping Agent'} subtitle="Shipping agency profile" width="max-w-lg">
      {!agent ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
      ) : (
        <div className="p-6 space-y-5">
          {/* Contact */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-2 text-sm">
            {[
              { icon: User,   value: agent.contact_name },
              { icon: Phone,  value: agent.phone },
              { icon: Mail,   value: agent.email },
              { icon: MapPin, value: [agent.address, place(agent)].filter(Boolean).join(' · ') },
            ].filter(r => r.value).map(({ icon: Icon, value }, i) => (
              <div key={i} className="flex items-center gap-2 text-slate-700">
                <Icon size={14} className="text-slate-400 flex-shrink-0" /> <span className="break-all">{value}</span>
              </div>
            ))}
            {!agent.contact_name && !agent.phone && !agent.email && !agent.address && !place(agent) && (
              <p className="text-slate-400 italic text-xs">No contact details yet — use Edit to add them.</p>
            )}
          </div>
          {agent.notes && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{agent.notes}</p>
            </div>
          )}

          {/* Shipments */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Shipments <span className="text-slate-400 normal-case font-normal">({agent.shipments.length}{agent.total_cost > 0 ? ` · ${pkr(agent.total_cost)} paid` : ''})</span>
            </p>
            {agent.shipments.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No shipments with this agent yet.</p>
            ) : (
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                {agent.shipments.map(s => (
                  <button key={s.id} type="button" onClick={() => navigate(`/projects?open=${s.project_id}`)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.project_title || 'Project'}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {fmtDate(s.shipping_date)}
                        {s.tracking_number ? <> · <span className="font-mono">#{s.tracking_number}</span></> : ' · no tracking number'}
                        {s.client_name ? ` · ${s.client_name}` : ''}
                      </p>
                    </div>
                    {s.cost_total > 0 && <span className="text-sm font-semibold text-slate-700 flex-shrink-0">{pkr(s.cost_total)}</span>}
                    <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          {confirmDel ? (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 text-xs">
              <AlertTriangle size={14} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700">
                Delete {agent.name}?{agent.shipments.length > 0 && ' Past shipments keep the agent name.'}
              </span>
              <button onClick={() => setConfirm(false)} className="px-2 py-1 border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
              <button onClick={remove} disabled={deleting} className="px-2 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={() => onEdit(agent)}
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

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ShippingAgents({ embedded = false }) {
  const [agents, setAgents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [editing, setEditing] = useState(null);  // null | 'new' | agent
  const [viewing, setViewing] = useState(null);  // agent id

  const load = useCallback(async () => {
    try { const { data } = await api.get('/shipping-agents'); setAgents(Array.isArray(data) ? data : []); }
    catch { setAgents([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const shown = agents.filter(a => !q || [a.name, a.contact_name, a.phone, a.city, a.country]
    .some(f => f && f.toLowerCase().includes(q)));

  return (
    <div>
      <div className={`flex items-center justify-between gap-3 ${embedded ? 'mb-4' : 'mb-6'}`}>
        <div>
          {embedded
            ? <p className="text-sm text-slate-500">Agencies you ship orders with — pick them on a project's Shipping tab</p>
            : <>
                <h1 className="text-2xl font-bold text-slate-900">Shipping Agents</h1>
                <p className="text-slate-500 text-sm mt-0.5">Agencies you ship orders with — pick them on a project's Shipping tab</p>
              </>}
        </div>
        <button onClick={() => setEditing('new')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm flex-shrink-0">
          <Plus size={16} /> Add<span className="hidden sm:inline"> Agent</span>
        </button>
      </div>

      <div className="relative mb-5">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search agents…"
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white" />
      </div>

      {loading ? (
        <div className="py-24 text-center">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
        </div>
      ) : shown.length === 0 ? (
        <div className="py-20 text-center bg-white border border-slate-200 rounded-2xl">
          <Truck size={32} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">{q ? 'No agents match your search' : 'No shipping agents yet'}</p>
          {!q && (
            <button onClick={() => setEditing('new')} className="mt-3 text-sm text-indigo-600 hover:underline font-medium">Add your first agent</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map(a => (
            <div key={a.id} onClick={() => setViewing(a.id)}
              className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-indigo-300 hover:shadow transition-all cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Truck size={18} className="text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 truncate group-hover:text-indigo-700">{a.name}</p>
                  <p className="text-xs text-slate-400 truncate">{[a.contact_name, place(a)].filter(Boolean).join(' · ') || 'No contact details'}</p>
                </div>
                <div className="flex gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setEditing(a)} title="Edit"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Pencil size={13} /></button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-100 text-xs">
                <span className="text-slate-500 whitespace-nowrap">{a.phone ? <span className="inline-flex items-center gap-1"><Phone size={11} /> {a.phone}</span> : <span className="text-slate-300">No phone</span>}</span>
                <span className="text-slate-500 text-right">
                  <strong className="text-slate-800">{a.shipment_count}</strong> shipment{a.shipment_count !== 1 ? 's' : ''}
                  {a.total_cost > 0 ? <> · <strong className="text-slate-800">{pkr(a.total_cost)}</strong> paid</> : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* While editing, an open profile is hidden; it re-opens and reloads afterwards */}
      {editing && (
        <AgentForm
          agent={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {viewing && !editing && (
        <AgentProfile
          key={viewing}
          agentId={viewing}
          onClose={() => setViewing(null)}
          onEdit={a => setEditing(a)}
          onDeleted={() => { setViewing(null); load(); }}
        />
      )}
    </div>
  );
}
