import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api, { imgUrl } from '../lib/api';
import {
  Receipt, Plus, Search, X, Edit2, Trash2, RefreshCw, ArrowLeft,
  Tag, Calendar, Repeat, ChevronDown, Check, SlidersHorizontal,
  Home, Zap, Droplets, Truck, Coffee, Package, MoreHorizontal,
  BarChart2, AlertTriangle, TrendingUp, TrendingDown, Banknote, Flame, Scissors,
  Paperclip, FileText, ExternalLink,
} from 'lucide-react';
import PeriodPicker, { currentMonthRange } from '../components/PeriodPicker';
import Drawer from '../components/Drawer';
import { pkr } from '../lib/currency';
import { PRODUCTION_KINDS } from '../lib/production';
import ShippingAgents from './ShippingAgents';
import ProductionTab from './ProductionPayments';

// ── Helpers ────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];
const curMonth = () => new Date().toISOString().slice(0, 7);
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// Types that are payments to an employee — they ask which employee
const EMPLOYEE_TYPES = ['Salary', 'Advance'];
const PAYMENT_METHODS = ['cash', 'bank transfer', 'cheque', 'online', 'card'];
const RECURRING_PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];

// Expense types — picking one fills the title and category (created on first use).
// Kept to a few broad types; the title can still say exactly what it was.
// aliases are older type names, so expenses saved under them still show their type.
// Embroidery … Belts must match PRODUCTION_KINDS, Salary / Advance EMPLOYEE_TYPES.
const EXPENSE_PRESETS = [
  { group: 'Production', label: 'Fabric',             category: 'Fabric Expanses', color: '#8b5cf6', aliases: ['Fabric Purchased'] },
  { group: 'Production', label: 'Production',         category: 'Production',      color: '#3b82f6' },
  { group: 'Production', label: 'Embroidery',         category: 'Production',      color: '#3b82f6' },
  { group: 'Production', label: 'Sublimation',        category: 'Production',      color: '#3b82f6' },
  { group: 'Production', label: 'Cutting & Threads',  category: 'Production',      color: '#3b82f6' },
  { group: 'Production', label: 'Belts',              category: 'Production',      color: '#3b82f6' },
  { group: 'Production', label: 'Packaging & Labels', category: 'Packaging',       color: '#0ea5e9', aliases: ['Threads, Cleaning & Packaging', 'Labels & Cards'] },
  { group: 'Running costs', label: 'Rent & Bills',    category: 'Bills',           color: '#f59e0b', aliases: ['Rent', 'Internet Bill', 'Electricity Bill', 'Subscription'] },
  { group: 'Running costs', label: 'Office & Petty Cash', category: 'Petty Cash',  color: '#f97316', aliases: ['Petty Cash', 'Office Supplies', 'Staff Meals'] },
  { group: 'Running costs', label: 'Taxes',           category: 'Taxes',           color: '#ef4444' },
  { group: 'Staff', label: 'Salary',                  category: 'Salaries',        color: '#06b6d4' },
  { group: 'Staff', label: 'Advance',                 category: 'Salaries',        color: '#06b6d4' },
  { group: 'Other', label: 'Charity',                 category: 'Charity',         color: '#10b981' },
  { group: 'Other', label: 'Personal',                category: 'Personal Use',    color: '#64748b', aliases: ['Self Use / Personal Use'] },
];
const PRESET_GROUPS = [...new Set(EXPENSE_PRESETS.map(p => p.group))];
// The type an expense title belongs to (its own label or an older alias)
const presetFor = title => EXPENSE_PRESETS.find(p => p.label === title || p.aliases?.includes(title));

// Shipping picked on a project's expense is saved as a shipping cost on its shipment
const SHIPPING = 'Shipping';
const NEW = '__new__';

const DEFAULT_CATEGORIES = [
  { name: 'Rent', color: '#6366f1' },
  { name: 'Electricity', color: '#f59e0b' },
  { name: 'Gas / Utilities', color: '#10b981' },
  { name: 'Transport', color: '#3b82f6' },
  { name: 'Petty Cash', color: '#8b5cf6' },
  { name: 'Staff Meals', color: '#f97316' },
  { name: 'Maintenance', color: '#14b8a6' },
  { name: 'Miscellaneous', color: '#94a3b8' },
];

// Quick-pick presets for miscellaneous income — selling scrap fabric, cuttings,
// old equipment, etc. outside the normal invoice flow.
const INCOME_PRESETS = [
  { label: 'Fabric Cuttings',  icon: '🧵', category: 'Fabric Scraps' },
  { label: 'Fabric Scraps',    icon: '🪡', category: 'Fabric Scraps' },
  { label: 'Old Machinery',    icon: '⚙️', category: 'Old Equipment' },
  { label: 'Packaging Waste',  icon: '📦', category: 'Scrap Materials' },
  { label: 'Scrap Sale',       icon: '♻️', category: 'Scrap Materials' },
  { label: 'Other Income',     icon: '💰', category: 'Miscellaneous' },
];

// ── CategoryModal ──────────────────────────────────────────────────────────
function CategoryModal({ category, onClose, onSave }) {
  const COLORS = ['#6366f1','#f59e0b','#10b981','#3b82f6','#8b5cf6','#f97316','#14b8a6','#ef4444','#ec4899','#94a3b8'];
  const [form, setForm] = useState(category || { name: '', color: '#6366f1' });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = category
        ? await api.put(`/expenses/categories/${category.id}`, form)
        : await api.post('/expenses/categories', form);
      onSave(res.data);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Drawer open={true} onClose={onClose} title={category ? 'Edit Category' : 'New Category'} width="max-w-sm">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Name *</label>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">Color</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map(c => (
              <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-offset-1 ring-slate-400' : 'hover:scale-110'}`}
                style={{ background: c }} />
            ))}
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
          <button type="submit" disabled={saving || !form.name}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ── Bill / invoice attachment (one photo or PDF, kept in receipt_url) ─────────
const isPdf = url => /\.pdf($|\?)/i.test(url || '');

function ReceiptAttach({ url, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('That file is over 10 MB.'); return; }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/uploads', fd);
      onChange(data.url);
    } catch { setError('Upload failed — please try again.'); }
    finally { setUploading(false); }
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">Bill / Invoice</label>
      {url ? (
        <div className="flex items-center gap-3 p-2 border border-slate-200 rounded-xl">
          <a href={imgUrl(url)} target="_blank" rel="noreferrer" className="flex items-center gap-3 flex-1 min-w-0 group">
            {isPdf(url)
              ? <span className="w-12 h-12 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0"><FileText size={20} /></span>
              : <img src={imgUrl(url)} alt="Bill" className="w-12 h-12 rounded-lg object-cover bg-slate-50 flex-shrink-0" />}
            <span className="text-sm text-slate-700 group-hover:text-indigo-600 truncate">{isPdf(url) ? 'PDF attached' : 'Photo attached'} — view</span>
          </a>
          <button type="button" onClick={() => onChange('')} title="Remove"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0"><X size={14} /></button>
        </div>
      ) : (
        <label className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm border border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-indigo-400 hover:text-indigo-600 cursor-pointer transition-colors ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
          <Paperclip size={14} /> {uploading ? 'Uploading…' : 'Attach bill or invoice (photo or PDF)'}
          <input type="file" accept="image/*,application/pdf" onChange={pick} className="hidden" />
        </label>
      )}
      {error && <p className="text-2xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
}

// Defined at module level so the form isn't remounted (losing focus) on every keystroke.
function ExpenseShell({ page, expense, onClose, children }) {
  if (!page) return <Drawer open={true} onClose={onClose} title={expense ? 'Edit Expense' : 'New Expense'} width="max-w-md">{children}</Drawer>;
  return (
    <div className="max-w-xl mx-auto pb-10">
      <button type="button" onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-3">
        <ArrowLeft size={15} /> Back
      </button>
      <h1 className="text-2xl font-bold text-slate-900 mb-4">{expense ? 'Edit Expense' : 'New Expense'}</h1>
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">{children}</div>
    </div>
  );
}

// ── ExpenseModal ───────────────────────────────────────────────────────────
// defaultType pre-picks a Type (e.g. from Expenses → Production → Add payment).
export function ExpenseModal({ expense, categories, projects = [], defaultProjectId = '', defaultType = '', onClose, onSave, page = false }) {
  const blank = {
    title: '', expense_category_id: '', amount: '', paid_by: '', paid_to: '',
    project_id: defaultProjectId ? String(defaultProjectId) : '', employee_id: '', agent_id: '',
    expense_date: today(), payment_method: 'bank transfer', notes: '', receipt_url: '',
    // Shipping only — saved on the project's shipment, not as an expense
    ship_agent_id: '', shipment_id: '', tracking_number: '', new_name: '',
  };
  const [form, setForm] = useState(expense
    ? { ...blank, ...expense,
        expense_category_id: expense.expense_category_id || '',
        project_id: expense.project_id ? String(expense.project_id) : '',
        employee_id: expense.employee_id ? String(expense.employee_id) : '',
        agent_id: expense.agent_id ? String(expense.agent_id) : '',
        paid_to: expense.paid_to || '' }
    : blank);
  // Only active projects — except the one this expense is already on, so editing
  // an old expense doesn't blank its project. Most recent first.
  const projectOptions = projects
    .filter(p => p.status !== 'completed' || String(p.id) === String(expense?.project_id))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Employees for Salary / Advance payments
  const [employees, setEmployees] = useState([]);
  useEffect(() => {
    api.get('/employees').then(r => setEmployees((Array.isArray(r.data) ? r.data : []).filter(e => e.status !== 'inactive' || String(e.id) === String(expense?.employee_id)))).catch(() => {});
  }, []);
  const isEmpType = EMPLOYEE_TYPES.includes(form.title);
  function pickEmployee(id) {
    const emp = employees.find(e => String(e.id) === String(id));
    setForm(f => ({ ...f, employee_id: id, paid_to: emp ? emp.name : f.paid_to }));
  }

  // Production payments (embroidery, belts…) go to a person on that job's list
  const prodKind = PRODUCTION_KINDS.find(k => k.label === form.title);
  const [prodAgents, setProdAgents] = useState([]);
  useEffect(() => {
    if (!prodKind) return;
    api.get('/production-agents', { params: { kind: prodKind.kind } })
      .then(r => setProdAgents(Array.isArray(r.data) ? r.data : [])).catch(() => setProdAgents([]));
  }, [prodKind?.kind]);

  // Shipping (new entries on a project only) is saved as a payment on the
  // project's shipment for the chosen agent, so it shows on its Shipping tab.
  const isShipping = !expense && !!form.project_id && form.title === SHIPPING;
  const [shipAgents, setShipAgents] = useState([]);
  const [shipments, setShipments] = useState([]);
  useEffect(() => {
    if (!isShipping) return;
    api.get('/shipping-agents').then(r => setShipAgents(Array.isArray(r.data) ? r.data : [])).catch(() => setShipAgents([]));
    api.get(`/projects/${form.project_id}`).then(r => setShipments(r.data?.shipping || [])).catch(() => setShipments([]));
  }, [isShipping, form.project_id]);
  const agentShipments = shipments.filter(s => form.ship_agent_id && String(s.agent_id) === String(form.ship_agent_id));
  function pickShipAgent(id) {
    const latest = shipments.find(s => id && String(s.agent_id) === String(id)); // newest first
    setForm(f => ({ ...f, ship_agent_id: id, shipment_id: latest ? String(latest.id) : NEW, new_name: '' }));
  }

  function pickProject(id) {
    // Shipping needs a project — without one the type is cleared
    setForm(f => ({ ...f, project_id: id, ...(!id && f.title === SHIPPING ? { title: '' } : {}), shipment_id: '', ship_agent_id: '' }));
  }

  // Picking a type fills the title and category; the category is created on first use.
  const [cats, setCats] = useState(categories);
  useEffect(() => { setCats(categories); }, [categories]);

  async function applyPreset(preset) {
    let cat = cats.find(c => c.name.toLowerCase() === preset.category.toLowerCase());
    setForm(f => ({ ...f, title: preset.label, agent_id: '', new_name: '', ...(cat ? { expense_category_id: String(cat.id) } : {}) }));
    if (!cat) {
      try {
        const { data } = await api.post('/expenses/categories', { name: preset.category, color: preset.color });
        setCats(c => [...c, data]);
        setForm(f => (f.title === preset.label ? { ...f, expense_category_id: String(data.id) } : f));
      } catch {}
    }
  }

  function pickType(label) {
    if (label === SHIPPING) { setForm(f => ({ ...f, title: SHIPPING, agent_id: '', new_name: '' })); return; }
    const p = EXPENSE_PRESETS.find(x => x.label === label);
    if (p) applyPreset(p);
  }

  // A link like ?type=Belts opens the form with that type picked (once categories are in)
  const [typeApplied, setTypeApplied] = useState(false);
  useEffect(() => {
    if (expense || !defaultType || typeApplied || !categories.length) return;
    setTypeApplied(true);
    pickType(defaultType);
  }, [categories]);

  // A typed new name reuses a saved person/agent with that name, else creates one
  async function resolveAgent(list, url, extra) {
    const name = form.new_name.trim();
    const found = list.find(a => a.name.trim().toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const { data } = await api.post(url, { name, ...extra });
    return data.id;
  }

  async function saveShipping() {
    const agentId = form.ship_agent_id === NEW ? await resolveAgent(shipAgents, '/shipping-agents') : form.ship_agent_id;
    const cost = { amount: parseFloat(form.amount) || 0, cost_date: form.expense_date, payment_method: form.payment_method, notes: form.notes };
    if (form.shipment_id && form.shipment_id !== NEW) {
      await api.post(`/projects/${form.project_id}/shipping/${form.shipment_id}/costs`, cost);
    } else {
      await api.post(`/projects/${form.project_id}/shipping`, {
        agent_id: agentId, shipping_date: form.expense_date, tracking_number: form.tracking_number, cost,
      });
    }
    onSave(null, { shipping: true });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      if (isShipping) { await saveShipping(); return; }
      const agentId = !prodKind ? null
        : form.agent_id === NEW ? await resolveAgent(prodAgents, '/production-agents', { kind: prodKind.kind })
        : (form.agent_id || null);
      const payload = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        expense_category_id: form.expense_category_id || null,
        project_id: form.project_id || null,
        employee_id: isEmpType ? (form.employee_id || null) : null,
        agent_id: agentId,
        recurring: 0,
      };
      const res = expense
        ? await api.put(`/expenses/${expense.id}`, payload)
        : await api.post('/expenses', payload);
      onSave(res.data); // the page closes the form (and may return to the project)
    } catch (err) {
      setError(err?.response?.data?.error || 'Could not save — please try again.');
    } finally { setSaving(false); }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20';
  const typeValue = isShipping ? SHIPPING : (presetFor(form.title)?.label || '');

  // Type is picked in two steps: a group (radio buttons), then a type in that group.
  // The group follows the type when one is already set (editing, ?type= links).
  const [pickedGroup, setPickedGroup] = useState('');
  const group = (isShipping ? 'Production' : presetFor(form.title)?.group) || pickedGroup;
  function pickGroup(g) {
    if (g === group) return;
    setPickedGroup(g);
    // A type from another group is cleared with its category (no longer shown to
    // fix by hand); a hand-typed title stays
    if (typeValue) setForm(f => ({ ...f, title: '', expense_category_id: '', agent_id: '', new_name: '' }));
  }

  return (
    <ExpenseShell page={page} expense={expense} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">

          {/* ── Project — charging an expense to a project adds it to that project's cost ── */}
          <div className={`rounded-xl p-3 border ${form.project_id ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">
              <Flame size={12} className="text-orange-500" /> Project
              <span className="font-normal text-slate-400">{prodKind ? '*' : '(optional)'}</span>
            </label>
            <select value={form.project_id} onChange={e => pickProject(e.target.value)} required={!!prodKind}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="">No project — business expense / petty cash</option>
              {projectOptions.map(p => (
                <option key={p.id} value={p.id}>
                  {p.title}{p.client_name ? ` · ${p.client_name}` : ''}{p.status === 'completed' ? ' (completed)' : ''}
                </option>
              ))}
            </select>
            {form.project_id ? (
              <p className="text-2xs text-orange-700 mt-1.5">This amount is added to the project's cost automatically.</p>
            ) : prodKind ? (
              <p className="text-2xs text-slate-500 mt-1.5">{prodKind.label} is paid per project — pick the project.</p>
            ) : null}
          </div>

          {/* ── Type — group, then type; fills the title and category ── */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Type</label>
            <div role="radiogroup" aria-label="Expense group" className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {PRESET_GROUPS.map(g => (
                <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => pickGroup(g)}
                  className={`px-2 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                    group === g ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                  {g}
                </button>
              ))}
            </div>
            {group && (
              <select value={typeValue} onChange={e => pickType(e.target.value)} className={`${inputCls} mt-2`}>
                <option value="">Select {group.toLowerCase()} type…</option>
                {EXPENSE_PRESETS.filter(p => p.group === group).map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                {group === 'Production' && form.project_id && !expense && <option value={SHIPPING}>Shipping</option>}
              </select>
            )}
          </div>

          {/* ── Shipping — agent and shipment on this project ── */}
          {isShipping && (
            <div className="rounded-xl p-3 border bg-sky-50 border-sky-200 space-y-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Shipping Agent *</label>
                <select value={form.ship_agent_id} onChange={e => pickShipAgent(e.target.value)} required
                  className={`${inputCls} bg-white`}>
                  <option value="">Select agent…</option>
                  {shipAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  <option value={NEW}>+ New agent…</option>
                </select>
              </div>
              {form.ship_agent_id === NEW && (
                <input value={form.new_name} onChange={e => set('new_name', e.target.value)} required autoFocus
                  placeholder="Agency name" className={`${inputCls} bg-white`} />
              )}
              {agentShipments.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Shipment</label>
                  <select value={form.shipment_id} onChange={e => set('shipment_id', e.target.value)} className={`${inputCls} bg-white`}>
                    {agentShipments.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.shipping_date ? fmtDate(s.shipping_date) : 'No date'}{s.tracking_number ? ` · #${s.tracking_number}` : ''}{s.cost_total > 0 ? ` · ${pkr(s.cost_total)} paid` : ''}
                      </option>
                    ))}
                    <option value={NEW}>+ New shipment</option>
                  </select>
                </div>
              )}
              {form.ship_agent_id && form.shipment_id === NEW && (
                <input value={form.tracking_number} onChange={e => set('tracking_number', e.target.value)}
                  placeholder="Tracking number (optional)" className={`${inputCls} bg-white`} />
              )}
              <p className="text-2xs text-sky-700">Saved on the project's Shipping tab as a payment to this agent.</p>
            </div>
          )}

          {/* ── Production person — embroidery, sublimation, cutting & threads, belts ── */}
          {prodKind && (
            <div className="rounded-xl p-3 border bg-violet-50 border-violet-200 space-y-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{prodKind.person} *</label>
                <select value={form.agent_id} onChange={e => setForm(f => ({ ...f, agent_id: e.target.value, new_name: '' }))} required
                  className={`${inputCls} bg-white`}>
                  <option value="">Select…</option>
                  {prodAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  <option value={NEW}>+ Add new…</option>
                </select>
              </div>
              {form.agent_id === NEW && (
                <input value={form.new_name} onChange={e => set('new_name', e.target.value)} required autoFocus
                  placeholder="Name" className={`${inputCls} bg-white`} />
              )}
              <p className="text-2xs text-violet-700">Shows under Expenses → Production → {prodKind.label}.</p>
            </div>
          )}

          {/* ── Employee — for salary and advance payments ── */}
          {isEmpType && (
            <div className="rounded-xl p-3 border bg-cyan-50 border-cyan-200">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1">Employee *</label>
              <select value={form.employee_id} onChange={e => pickEmployee(e.target.value)} required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.designation ? ` · ${e.designation}` : ''}</option>)}
              </select>
              <p className="text-2xs text-cyan-700 mt-1.5">Shows on the employee's Payments tab and in the Ledger under Salaries.</p>
            </div>
          )}

          {!isShipping && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                Title * <span className="font-normal text-slate-400 ml-1">or type your own</span>
              </label>
              <input type="text" value={form.title} onChange={e => set('title', e.target.value)} required
                placeholder="e.g. October rent, electricity bill, sales tax" className={inputCls} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (PKR) *</label>
              <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
              <input type="date" value={form.expense_date} onChange={e => set('expense_date', e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* No Category or Payment Method fields: the Type sets the category, and the
              payment method keeps its default (or, when editing, what was saved). */}

          {/* The production person / shipping agent is the payee for those types */}
          {!isShipping && !prodKind && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Paid To</label>
              <input type="text" value={form.paid_to} onChange={e => set('paid_to', e.target.value)}
                placeholder="e.g. fabric supplier, stitcher" className={inputCls} />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>

          {!isShipping && <ReceiptAttach url={form.receipt_url} onChange={u => set('receipt_url', u)} />}

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
            <button type="submit" disabled={saving || !form.title}
              className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50">
              {saving ? 'Saving…' : expense ? 'Save Changes' : isShipping ? 'Add Shipping Payment' : 'Add Expense'}
            </button>
          </div>
        </form>
    </ExpenseShell>
  );
}

// ── IncomeModal ────────────────────────────────────────────────────────────
function IncomeModal({ income, onClose, onSave }) {
  const blank = {
    title: '', category: '', amount: '', received_by: '',
    income_date: today(), payment_method: 'cash', notes: '',
  };
  const [form, setForm] = useState(income ? { ...blank, ...income } : blank);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function applyPreset(preset) {
    setForm(f => ({ ...f, title: preset.label, category: preset.category }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) || 0 };
      const res = income
        ? await api.put(`/income/${income.id}`, payload)
        : await api.post('/income', payload);
      onSave(res.data);
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Drawer open={true} onClose={onClose} title={income ? 'Edit Income' : 'New Income'} width="max-w-md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">

        {/* ── Quick-pick presets ── */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2">Quick Pick</label>
          <div className="flex flex-wrap gap-1.5">
            {INCOME_PRESETS.map(p => {
              const active = form.title === p.label;
              return (
                <button key={p.label} type="button" onClick={() => applyPreset(p)}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border font-medium transition-all
                    ${active
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50'
                    }`}>
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            Title * <span className="font-normal text-slate-400 ml-1">or type your own</span>
          </label>
          <input type="text" value={form.title} onChange={e => set('title', e.target.value)} required
            placeholder="e.g. Sold fabric cuttings"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Amount (PKR) *</label>
            <input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Date</label>
            <input type="date" value={form.income_date} onChange={e => set('income_date', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Category / Source</label>
            <input type="text" value={form.category} onChange={e => set('category', e.target.value)}
              placeholder="e.g. Fabric Scraps"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Payment Method</label>
            <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
              {PAYMENT_METHODS.map(m => <option key={m} value={m} className="capitalize">{m}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Received By</label>
          <input type="text" value={form.received_by} onChange={e => set('received_by', e.target.value)}
            placeholder="Person or account"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none" />
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
          <button type="submit" disabled={saving || !form.title}
            className="flex-1 px-4 py-2.5 text-sm bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium disabled:opacity-50">
            {saving ? 'Saving…' : income ? 'Save Changes' : 'Add Income'}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

// ── DetailReport ──────────────────────────────────────────────────────────
function DetailReport({ expenses }) {
  const total = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
  const count = expenses.length;

  // Build category rows from live expenses (not just summary) so counts are accurate
  const catMap = {};
  expenses.forEach(e => {
    const key   = e.expense_category_id || 'none';
    const label = e.category_name  || 'Uncategorized';
    const color = e.category_color || '#94a3b8';
    if (!catMap[key]) catMap[key] = { label, color, total: 0, count: 0 };
    catMap[key].total += parseFloat(e.amount) || 0;
    catMap[key].count += 1;
  });
  const catRows = Object.values(catMap)
    .sort((a, b) => b.total - a.total)
    .map(c => ({ ...c, pct: total > 0 ? (c.total / total) * 100 : 0 }));

  // Payment method breakdown
  const methodMap = {};
  expenses.forEach(e => {
    const m = e.payment_method || 'cash';
    methodMap[m] = (methodMap[m] || 0) + (parseFloat(e.amount) || 0);
  });
  const methodRows = Object.entries(methodMap)
    .sort(([, a], [, b]) => b - a)
    .map(([method, amt]) => ({ method, amt, pct: total > 0 ? (amt / total) * 100 : 0 }));

  // Top 5 by amount
  const top5 = [...expenses].sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount)).slice(0, 5);

  return (
    <div className="space-y-5 pb-4">

      {/* ── Expenses by Category ── */}
      {catRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
            <div className="flex items-center gap-2">
              <Tag size={14} className="text-indigo-500" />
              <span className="font-bold text-slate-800 text-sm">Expenses by Category</span>
            </div>
            <span className="text-xs text-slate-400">{catRows.length} categories · {pkr(total)} total</span>
          </div>

          {/* Category table */}
          <div className="divide-y divide-slate-50">
            {catRows.map((c, i) => (
              <div key={i} className="px-5 py-3.5">
                {/* Top row: dot + name + amount */}
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span className="text-sm font-semibold text-slate-800">{c.label}</span>
                    <span className="text-xs text-slate-400 flex-shrink-0">
                      {c.count} {c.count === 1 ? 'entry' : 'entries'}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-bold text-slate-900">{pkr(c.total)}</span>
                    <span className="text-xs text-slate-400 ml-2">{c.pct.toFixed(1)}%</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, c.pct)}%`, background: c.color }} />
                </div>
              </div>
            ))}
          </div>

          {/* Category totals footer */}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total</span>
            <span className="text-sm font-bold text-slate-800">{pkr(total)}</span>
          </div>
        </div>
      )}


      {/* ── Largest Expenses ── */}
      {top5.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
            <Receipt size={14} className="text-rose-500" />
            <span className="font-bold text-slate-800 text-sm">Largest Expenses</span>
          </div>
          <div className="divide-y divide-slate-50">
            {top5.map((e, i) => (
              <div key={e.id} className="flex items-center gap-4 px-5 py-3.5">
                <span className="text-sm font-bold text-slate-300 w-5 flex-shrink-0 text-center">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{e.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtDate(e.expense_date)}
                    {e.category_name && (
                      <span className="font-medium ml-1.5" style={{ color: e.category_color || '#94a3b8' }}>
                        · {e.category_name}
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-900 flex-shrink-0">{pkr(e.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {count === 0 && (
        <p className="text-center text-sm text-slate-400 py-4">No expenses recorded for this period.</p>
      )}
    </div>
  );
}


// ── Shipping tab ───────────────────────────────────────────────────────────
// Read-only overview of every shipment and what was paid for it. Shipments and
// their costs are entered on the project's Shipping tab — tapping a row opens it.
function ShippingTab() {
  const navigate = useNavigate();
  const [view, setView] = useState('shipments'); // 'shipments' | 'agents'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ from: null, to: null, label: 'All Time' });

  useEffect(() => {
    setLoading(true);
    api.get('/shipping-agents/shipments/all', { params: range.from ? { from: range.from, to: range.to } : {} })
      .then(r => setRows(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [range.from, range.to]);

  const q = search.trim().toLowerCase();
  const shown = rows.filter(r => !q || [r.project_title, r.client_name, r.agent_name, r.tracking_number]
    .some(f => f && String(f).toLowerCase().includes(q)));
  const total = shown.reduce((s, r) => s + (parseFloat(r.cost_total) || 0), 0);
  const open = r => r.project_id && navigate(`/projects?open=${r.project_id}`);

  const viewSwitch = (
    <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
      {[['shipments', 'Shipments'], ['agents', 'Agents']].map(([k, l]) => (
        <button key={k} onClick={() => setView(k)}
          className={`px-4 py-1.5 text-sm rounded-lg font-semibold transition-all ${view === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
      ))}
    </div>
  );
  if (view === 'agents') return <div className="space-y-4">{viewSwitch}<ShippingAgents embedded /></div>;

  return (
    <div className="space-y-4">
      {viewSwitch}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="bg-sky-50 text-sky-600 p-2.5 rounded-xl flex-shrink-0 hidden sm:block"><Truck size={18} /></div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-900 break-words">{pkr(total)}</p>
            <p className="text-xs text-slate-500">Shipping Paid</p>
            <p className="text-2xs text-slate-400 truncate">{range.label}</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl flex-shrink-0 hidden sm:block"><Package size={18} /></div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-900">{shown.length}</p>
            <p className="text-xs text-slate-500">Shipments</p>
            <p className="text-2xs text-slate-400 truncate">tap one to open its project</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input placeholder="Search project, client, agent, tracking…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
        </div>
        <PeriodPicker defaultMode="all" onChange={setRange} />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center">
            <Truck size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-400">No shipments found</p>
            <p className="text-xs text-slate-400 mt-1">Add shipments on a project's Shipping tab.</p>
          </div>
        ) : (<>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 w-10">#</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Tracking #</th>
                  <th className="px-4 py-3 text-right">Shipping Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r, idx) => (
                  <tr key={r.id} onClick={() => open(r)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-3 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmtDate(r.shipping_date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{r.project_title || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.client_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.agent_name || '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.tracking_number || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                      {r.cost_total > 0 ? pkr(r.cost_total) : <span className="font-normal text-slate-300">not entered</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200">
                  <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-slate-500">{shown.length} shipments</td>
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
                  <p className="text-sm font-semibold text-slate-800">{r.project_title || 'Project'}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {fmtDate(r.shipping_date)}{r.agent_name ? ` · ${r.agent_name}` : ''}{r.client_name ? ` · ${r.client_name}` : ''}
                  </p>
                  {r.tracking_number && <p className="text-2xs font-mono text-slate-400 mt-0.5">#{r.tracking_number}</p>}
                </div>
                <span className="text-sm font-bold text-slate-900 flex-shrink-0">
                  {r.cost_total > 0 ? pkr(r.cost_total) : <span className="text-xs font-normal text-slate-300">—</span>}
                </span>
              </button>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
              <span className="text-xs font-semibold text-slate-500">{shown.length} shipments</span>
              <span className="text-sm font-bold text-slate-900">{pkr(total)}</span>
            </div>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [summary, setSummary] = useState({ thisMonth: 0, recurringMonthly: 0, byCategory: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [projects, setProjects] = useState([]);
  // Links from a project: /expenses?project=ID&new=1 opens the form pre-set to
  // that project (saving returns to it); /expenses?filter=ID shows its expenses.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState(() => searchParams.get('filter') || ''); // '' all · 'none' business only · id
    const [catModal, setCatModal] = useState(null);
  const [showCats, setShowCats] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [delTarget, setDelTarget] = useState(null);       // expense id pending delete
  const [delCatTarget, setDelCatTarget] = useState(null); // category id pending delete
  const [selected, setSelected] = useState(null);         // expense shown in detail drawer
  // Period filter: { from, to, label } — defaults to the current month; null from/to means "all time"
  const [periodRange, setPeriodRange] = useState(currentMonthRange());

  // ── Income tab ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(() => (['shipping', 'production'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'expenses')); // 'expenses' | 'income' | 'shipping' | 'production'
  const [income, setIncome] = useState([]);
  const [incomeSummary, setIncomeSummary] = useState({ thisMonth: 0, bySource: [] });
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [incomeSearch, setIncomeSearch] = useState('');
  const [incomeModal, setIncomeModal] = useState(null);
  const [incomeDelTarget, setIncomeDelTarget] = useState(null);
  const [incomePeriodRange, setIncomePeriodRange] = useState(currentMonthRange());

  const loadIncome = useCallback(async () => {
    setIncomeLoading(true);
    const dateParams = incomePeriodRange.from ? { from: incomePeriodRange.from, to: incomePeriodRange.to } : {};
    const [incRes, sumRes] = await Promise.all([
      api.get('/income', { params: dateParams }),
      api.get('/income/summary', { params: dateParams }),
    ]);
    setIncome(incRes.data);
    setIncomeSummary(sumRes.data);
    setIncomeLoading(false);
  }, [incomePeriodRange.from, incomePeriodRange.to]);

  useEffect(() => { loadIncome(); }, [loadIncome]);

  async function confirmDeleteIncome() {
    await api.delete(`/income/${incomeDelTarget}`);
    setIncome(p => p.filter(i => i.id !== incomeDelTarget));
    setIncomeDelTarget(null);
    loadIncome();
  }

  const filteredIncome = income.filter(i =>
    !incomeSearch || i.title.toLowerCase().includes(incomeSearch.toLowerCase())
  );
  const filteredIncomeTotal = filteredIncome.reduce((s, i) => s + parseFloat(i.amount || 0), 0);

  const load = useCallback(async () => {
    setLoading(true);
    // A single project's expenses are shown across all dates.
    const oneProject = projectFilter && projectFilter !== 'none';
    const dateParams = oneProject ? {} : periodRange.from ? { from: periodRange.from, to: periodRange.to } : {};
    const [expRes, catRes, sumRes] = await Promise.all([
      api.get('/expenses', { params: { ...dateParams, category_id: catFilter || undefined, project_id: projectFilter || undefined } }),
      api.get('/expenses/categories'),
      api.get('/expenses/summary', { params: dateParams }),
    ]);
    setExpenses(expRes.data);
    setCategories(catRes.data);
    setSummary(sumRes.data);
    setLoading(false);
  }, [catFilter, projectFilter, periodRange.from, periodRange.to]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/projects').then(r => setProjects(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  // The link parameters were read on open — clear them from the address bar
  useEffect(() => {
    if (searchParams.get('filter') || searchParams.get('tab')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const goNew = () => navigate('/expenses/new' + (projectFilter && projectFilter !== 'none' ? `?project=${projectFilter}` : ''));
  const goEdit = exp => navigate(`/expenses/${exp.id}/edit`, { state: { expense: exp } });

  async function seedCategories() {
    setSeeding(true);
    for (const c of DEFAULT_CATEGORIES) {
      await api.post('/expenses/categories', c).catch(() => {});
    }
    await load();
    setSeeding(false);
  }

  async function confirmDeleteExpense() {
    await api.delete(`/expenses/${delTarget}`);
    setExpenses(p => p.filter(e => e.id !== delTarget));
    setDelTarget(null);
    setSelected(null);
    load();
  }

  async function confirmDeleteCategory() {
    const id = delCatTarget;
    await api.delete(`/expenses/categories/${id}`);
    setDelCatTarget(null);
    load();
    if (catFilter === String(id)) setCatFilter('');
  }

  const filtered = expenses.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [e.title, e.paid_to, e.project_title, e.notes].some(f => f && String(f).toLowerCase().includes(q));
  });

  const filteredTotal = filtered.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const activeFilters = (catFilter ? 1 : 0) + (projectFilter ? 1 : 0) + (periodRange.from ? 1 : 0);
  const chipCls = on => `px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`;

  return (
    <div className="pb-8">

      {/* ── Header ── */}
      <div className="glass-bar sticky top-[65px] lg:top-4 z-20 flex items-start justify-between gap-3 mb-4 px-4 sm:px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">
            {activeTab === 'income' ? 'Other Income' : activeTab === 'shipping' ? 'Shipping' : activeTab === 'production' ? 'Production' : 'Expenses'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeTab === 'income' ? 'Miscellaneous income outside the invoice flow'
              : activeTab === 'shipping' ? 'What you paid to ship each project'
              : activeTab === 'production' ? 'Embroidery, sublimation, cutting & threads and belts — paid per project'
              : 'Track business spending'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeTab === 'expenses' && (
            <button onClick={() => setShowCats(v => !v)} title="Categories"
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border rounded-xl font-medium transition-colors ${
                showCats ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
              }`}>
              <Tag size={14} /> <span className="hidden sm:inline">Categories</span>
            </button>
          )}
          {activeTab === 'income' && (
            <button onClick={() => setIncomeModal('new')}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-semibold text-sm shadow-sm transition-colors">
              <Plus size={16} /> <span>Add<span className="hidden sm:inline"> Income</span></span>
            </button>
          )}
          {activeTab === 'expenses' && (
            <button onClick={() => goNew()}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold text-sm shadow-sm transition-colors">
              <Plus size={16} /> <span>Add<span className="hidden sm:inline"> Expense</span></span>
            </button>
          )}
        </div>
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4 w-fit max-w-full overflow-x-auto">
        {[
          { key: 'expenses', label: 'Expenses', icon: TrendingDown },
          { key: 'income',   label: 'Income',   icon: TrendingUp },
          { key: 'shipping', label: 'Shipping', icon: Truck },
          { key: 'production', label: 'Production', icon: Scissors },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg font-semibold transition-all whitespace-nowrap ${
              activeTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ── Categories panel (collapsible) ── */}
      {activeTab === 'expenses' && showCats && (
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-200 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Manage Categories</p>
            <div className="flex gap-2">
              {categories.length === 0 && (
                <button onClick={seedCategories} disabled={seeding}
                  className="text-xs text-indigo-600 hover:underline font-medium disabled:opacity-50">
                  {seeding ? 'Loading…' : 'Seed defaults'}
                </button>
              )}
              <button onClick={() => setCatModal('new')}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold">
                <Plus size={11} /> New
              </button>
            </div>
          </div>
          {delCatTarget && (
            <div className="flex items-center gap-3 px-4 py-3 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-sm">
              <AlertTriangle size={15} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700 font-medium">Delete this category? Expenses will become uncategorized.</span>
              <button onClick={() => setDelCatTarget(null)}
                className="px-3 py-1.5 text-xs border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
              <button onClick={confirmDeleteCategory}
                className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">Delete</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                <span className="text-sm text-slate-700">{c.name}</span>
                <button onClick={() => setCatModal(c)} className="text-slate-300 hover:text-slate-500 transition-colors"><Edit2 size={11} /></button>
                <button onClick={() => setDelCatTarget(c.id)} className="text-slate-300 hover:text-rose-500 transition-colors"><X size={11} /></button>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="text-sm text-slate-400">No categories yet. <button onClick={seedCategories} className="text-indigo-600 hover:underline">Load defaults</button></p>
            )}
          </div>
        </div>
      )}

      {/* ════════════ EXPENSES TAB ════════════ */}
      {activeTab === 'expenses' && (<>
        {/* Stats — two big numbers */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="bg-rose-50 text-rose-600 p-2.5 rounded-xl flex-shrink-0 hidden sm:block"><TrendingDown size={18} /></div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-slate-900 break-words">{pkr(summary.thisMonth || 0)}</p>
              <p className="text-xs text-slate-500">Total Spent</p>
              <p className="text-2xs text-slate-400 truncate">{projectFilter && projectFilter !== 'none' ? 'all dates' : periodRange.label || 'all time'}</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl flex-shrink-0 hidden sm:block"><Receipt size={18} /></div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-slate-900">{expenses.length}</p>
              <p className="text-xs text-slate-500">Entries</p>
              <p className="text-2xs text-slate-400 truncate">recorded</p>
            </div>
          </div>
        </div>

        {/* Toolbar: search + Filters + Breakdown */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Search expenses…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-sm border rounded-xl font-medium transition-colors flex-shrink-0 ${
              showFilters ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
            }`}>
            <SlidersHorizontal size={14} /> Filters
            {activeFilters > 0 && (
              <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-2xs font-bold flex items-center justify-center">{activeFilters}</span>
            )}
          </button>
          <button onClick={() => setShowBreakdown(v => !v)} title="Breakdown by category"
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm border rounded-xl font-medium transition-colors flex-shrink-0 ${
              showBreakdown ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'
            }`}>
            <BarChart2 size={14} /> <span className="hidden sm:inline">Breakdown</span>
          </button>
        </div>

        {/* Filter panel — hidden, not unmounted, so the period picker keeps its state */}
        <div className={`${showFilters ? '' : 'hidden'} bg-white border border-slate-200 rounded-2xl p-4 mb-3 shadow-sm space-y-4`}>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Period</p>
            <PeriodPicker defaultMode="month" onChange={range => setPeriodRange(range)} />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Category</p>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCatFilter('')} className={chipCls(!catFilter)}>All</button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setCatFilter(catFilter === String(c.id) ? '' : String(c.id))}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${catFilter === String(c.id) ? 'text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'}`}
                  style={catFilter === String(c.id) ? { background: c.color } : {}}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2">Project</p>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
              <option value="">All expenses</option>
              <option value="none">Business only (no project)</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.title}{p.status === 'completed' ? ' (completed)' : ''}</option>)}
            </select>
            {projectFilter && projectFilter !== 'none' && (
              <p className="text-2xs text-orange-600 mt-1.5">Showing this project's expenses from all dates.</p>
            )}
          </div>
        </div>

        {/* Active filter summary (when the panel is closed) */}
        {!showFilters && activeFilters > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3 text-2xs">
            {periodRange.from && !(projectFilter && projectFilter !== 'none') && (
              <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold">{periodRange.label}</span>
            )}
            {catFilter && (
              <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold flex items-center gap-1">
                {categories.find(c => String(c.id) === catFilter)?.name || 'Category'}
                <button onClick={() => setCatFilter('')}><X size={10} /></button>
              </span>
            )}
            {projectFilter && (
              <span className="px-2 py-1 rounded-lg bg-orange-50 text-orange-700 font-semibold flex items-center gap-1">
                {projectFilter === 'none' ? 'Business only' : projects.find(p => String(p.id) === projectFilter)?.title || 'Project'}
                <button onClick={() => setProjectFilter('')}><X size={10} /></button>
              </span>
            )}
          </div>
        )}

        {showBreakdown && !loading && (
          <div className="mb-3"><DetailReport expenses={filtered} /></div>
        )}

        {/* Expense list — a normal page list, no inner scroll box */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Loading…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Receipt size={28} className="mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-400">No expenses found</p>
              <button onClick={() => goNew()} className="mt-3 text-xs text-indigo-600 hover:underline font-medium">Record an expense</button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(exp => (
                <div key={exp.id} onClick={() => setSelected(exp)}
                  className="flex items-start gap-3 px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: exp.category_color || '#94a3b8' }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800">{exp.title}</p>
                      {exp.receipt_url && <Paperclip size={12} className="text-slate-400" aria-label="Bill attached" />}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fmtDate(exp.expense_date)}
                      {exp.category_name && ` · ${exp.category_name}`}
                      {exp.paid_to && ` · to ${exp.paid_to}`}
                      {exp.payment_method && ` · ${exp.payment_method}`}
                    </p>
                    {exp.employee_name && (
                      <span className="inline-flex items-center gap-1 mt-1 mr-1 text-2xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-100 px-1.5 py-0.5 rounded-full max-w-full">
                        <span className="truncate">👤 {exp.employee_name}</span>
                      </span>
                    )}
                    {exp.project_title && (
                      <span className="inline-flex items-center gap-1 mt-1 text-2xs font-semibold bg-orange-50 text-orange-700 border border-orange-100 px-1.5 py-0.5 rounded-full max-w-full">
                        <Flame size={9} className="flex-shrink-0" /> <span className="truncate">{exp.project_title}</span>
                      </span>
                    )}
                    {exp.notes && <p className="text-xs text-slate-500 mt-1 italic">{exp.notes}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-sm font-bold text-slate-800">{pkr(exp.amount)}</span>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => goEdit(exp)} title="Edit"
                        className="p-2 rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => setDelTarget(exp.id)} title="Delete"
                        className="p-2 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">{filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'}</span>
              <span className="text-sm font-bold text-slate-800">{pkr(filteredTotal)}</span>
            </div>
          )}
        </div>
      </>)}

      {/* ════════════ INCOME TAB ════════════ */}
      {activeTab === 'income' && (
        <div>
          <div className="mb-3">
            <PeriodPicker defaultMode="month" onChange={range => setIncomePeriodRange(range)} />
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: 'Total Income', value: pkr(filteredIncomeTotal), sub: incomePeriodRange.label || 'this period', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Entries',      value: String(filteredIncome.length), sub: incomeSummary.bySource?.[0]?.category ? `top: ${incomeSummary.bySource[0].category}` : 'income recorded', icon: Banknote, color: 'text-indigo-600', bg: 'bg-indigo-50' },
            ].map(({ label, value, sub, icon: Icon, color, bg }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                <div className={`${bg} ${color} p-2.5 rounded-xl flex-shrink-0 hidden sm:block`}><Icon size={18} /></div>
                <div className="min-w-0">
                  <p className="text-lg font-bold text-slate-900 break-words">{value}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-2xs text-slate-400 truncate">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input placeholder="Search income…" value={incomeSearch} onChange={e => setIncomeSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>

          {incomeDelTarget && (
            <div className="flex items-center gap-2 px-4 py-2.5 mb-3 bg-rose-50 border border-rose-200 rounded-xl text-xs">
              <AlertTriangle size={13} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700 font-medium">Delete this income entry?</span>
              <button onClick={() => setIncomeDelTarget(null)}
                className="px-2 py-1 border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
              <button onClick={confirmDeleteIncome}
                className="px-2 py-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium">Delete</button>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {incomeLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <div className="w-5 h-5 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Loading…</p>
              </div>
            ) : filteredIncome.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <Banknote size={28} className="mb-3 text-slate-300" />
                <p className="text-sm font-medium text-slate-400">No income recorded</p>
                <button onClick={() => setIncomeModal('new')} className="mt-3 text-xs text-emerald-600 hover:underline font-medium">Record first income</button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredIncome.map(inc => (
                  <div key={inc.id} className="flex items-start gap-3 px-4 py-3.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-emerald-400 mt-1.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{inc.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {fmtDate(inc.income_date)}
                        {inc.category && ` · ${inc.category}`}
                        {inc.received_by && ` · ${inc.received_by}`}
                      </p>
                      {inc.notes && <p className="text-xs text-slate-500 mt-1 italic">{inc.notes}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-600">+{pkr(inc.amount)}</span>
                      <div className="flex gap-1">
                        <button onClick={() => setIncomeModal(inc)} title="Edit"
                          className="p-2 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-600 transition-colors">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => setIncomeDelTarget(inc.id)} title="Delete"
                          className="p-2 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-500 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ SHIPPING TAB ════════════ */}
      {activeTab === 'shipping' && <ShippingTab />}
      {activeTab === 'production' && <ProductionTab />}

      {/* ── Expense detail (drawer — works the same on phone and desktop) ── */}
      {selected && (
        <Drawer open onClose={() => setSelected(null)} title={selected.title}
          subtitle={selected.category_name || 'Uncategorized'} width="max-w-md"
          footer={
            <div className="flex gap-3">
              <button onClick={() => { goEdit(selected); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                <Edit2 size={14} /> Edit
              </button>
              <button onClick={() => { setDelTarget(selected.id); setSelected(null); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-rose-200 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          }>
          <div className="p-6 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Amount Paid</p>
              <p className="text-2xl font-bold text-rose-600 break-all">{pkr(selected.amount)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-50 overflow-hidden">
              {[
                { label: 'Date',           value: fmtDate(selected.expense_date) },
                { label: 'Project',        value: selected.project_title || 'None (business expense)' },
                { label: 'Paid To',        value: selected.paid_to || '—' },
                { label: 'Payment Method', value: selected.payment_method || '—' },
                { label: 'Category',       value: selected.category_name || 'Uncategorized' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-5 py-3 gap-4">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex-shrink-0">{label}</span>
                  <span className="text-sm font-medium text-slate-800 text-right capitalize">{value}</span>
                </div>
              ))}
            </div>
            {selected.receipt_url && (
              <a href={imgUrl(selected.receipt_url)} target="_blank" rel="noreferrer"
                className="block bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 transition-colors">
                <p className="flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <Paperclip size={12} /> Bill / Invoice <ExternalLink size={11} className="ml-auto text-slate-400" />
                </p>
                {isPdf(selected.receipt_url)
                  ? <p className="flex items-center gap-2 px-4 py-3 text-sm text-slate-700"><FileText size={18} className="text-rose-500" /> Open PDF</p>
                  : <img src={imgUrl(selected.receipt_url)} alt="Bill" className="w-full max-h-80 object-contain bg-slate-50 mt-2" />}
              </a>
            )}
            {selected.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Notes / Description</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{selected.notes}</p>
              </div>
            )}
          </div>
        </Drawer>
      )}

      {/* ── Delete confirmation ── */}
      {delTarget && (
        <Drawer open onClose={() => setDelTarget(null)} title="Delete expense?" width="max-w-sm">
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-700">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>This removes the expense permanently and takes it off its project's cost.</span>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDelTarget(null)}
                className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
              <button onClick={confirmDeleteExpense}
                className="flex-1 px-4 py-2.5 text-sm bg-rose-600 text-white rounded-xl hover:bg-rose-700 font-medium">Delete</button>
            </div>
          </div>
        </Drawer>
      )}

      {/* ── Modals ── */}
      {catModal && (
        <CategoryModal
          category={catModal === 'new' ? null : catModal}
          onClose={() => setCatModal(null)}
          onSave={() => { setCatModal(null); load(); }}
        />
      )}
      {incomeModal && (
        <IncomeModal
          income={incomeModal === 'new' ? null : incomeModal}
          onClose={() => setIncomeModal(null)}
          onSave={() => { setIncomeModal(null); loadIncome(); }}
        />
      )}
    </div>
  );
}
