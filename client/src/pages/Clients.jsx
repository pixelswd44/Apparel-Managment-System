import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Plus, Search, Pencil, Trash2, X, Mail, Phone,
  MapPin, Building2, FileText, ChevronRight, ArrowLeft,
  AlertTriangle, Check, Truck, Upload, File, XCircle,
  User, CreditCard, Clock, DollarSign, Package,
  ChevronDown, Receipt, Users, FileImage, MessageSquare, Send,
} from 'lucide-react';
import api, { imgUrl } from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const LEAD_SOURCES = ['WhatsApp', 'Instagram', 'Facebook', 'Email', 'Website', 'Referral', 'Alibaba', 'Walk-in', 'Other'];

const fmtSize = bytes => {
  const n = parseFloat(bytes) || 0;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024)      return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

// ── Client messages / initial conversation log ───────────────────────────────
function ClientMessages({ client, onPatch }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const list = (() => { try { const v = typeof client.messages === 'string' ? JSON.parse(client.messages || '[]') : (client.messages || []); return Array.isArray(v) ? v : []; } catch { return []; } })();

  async function add() {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      await onPatch({ messages: [...list, { id: Date.now(), text: t, at: new Date().toISOString(), source: client.lead_source || '' }] });
      setText('');
    } finally { setBusy(false); }
  }
  async function remove(id) {
    await onPatch({ messages: list.filter(m => m.id !== id) });
  }

  return (
    <div className="rounded-2xl p-4 bg-white border border-slate-200 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><MessageSquare size={12} /> Conversation</p>
        <span className="text-xs text-slate-500">{list.length} message{list.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 space-y-2 max-h-56 overflow-y-auto pr-1">
        {list.length === 0 && <p className="text-sm text-slate-500 italic">Log the first messages / requirements the client sent you.</p>}
        {list.map(m => (
          <div key={m.id} className="group bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-snug">{m.text}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-slate-500">{fmt(m.at)}{m.source ? ` · ${m.source}` : ''}</span>
              <button onClick={() => remove(m.id)} className="text-xs text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">remove</button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Paste a message or note…"
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
        <button onClick={add} disabled={busy || !text.trim()}
          className="px-3 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-1">
          <Send size={12} /> Add
        </button>
      </div>
    </div>
  );
}

// ── Reusable file list with upload (documents / tech packs) ──────────────────
function ClientFiles({ title, hint, icon: Icon, accent = 'slate', files, onChange }) {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const isImg = f => /\.(png|jpe?g|gif|webp|svg)$/i.test(f.filename || f.originalName || '');
  const tone = accent === 'indigo'
    ? { head: 'text-indigo-700', box: 'bg-white border-slate-200 border-t-4 border-t-indigo-500', btn: 'border-indigo-200 text-indigo-600 hover:bg-indigo-50' }
    : accent === 'emerald'
    ? { head: 'text-emerald-700', box: 'bg-white border-slate-200 border-t-4 border-t-emerald-500', btn: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' }
    : { head: 'text-slate-600',  box: 'bg-white border-slate-200',        btn: 'border-slate-200 text-slate-600 hover:bg-slate-50' };

  async function handleFiles(e) {
    const picked = [...e.target.files];
    if (!picked.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(picked.map(async file => {
        const fd = new FormData(); fd.append('file', file);
        const { data } = await api.post('/uploads', fd);
        return data;
      }));
      await onChange([...files, ...uploaded]);
    } finally { setUploading(false); e.target.value = ''; }
  }
  async function remove(f) {
    await api.delete(`/uploads/${f.filename}`).catch(() => {});
    await onChange(files.filter(x => x.filename !== f.filename));
  }

  return (
    <div className={`rounded-2xl p-4 border h-full ${tone.box}`}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${tone.head}`}><Icon size={12} /> {title} <span className="font-normal normal-case text-slate-500">({files.length})</span></p>
          {hint && <p className="text-xs text-slate-500 mt-0.5 truncate">{hint}</p>}
        </div>
        <button onClick={() => inputRef.current?.click()} disabled={uploading}
          className={`flex items-center gap-1 text-xs font-semibold border bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0 ${tone.btn}`}>
          <Upload size={12} /> {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFiles} />
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-slate-500 italic py-2">No files yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {files.map(f => (
            <div key={f.filename} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden">
              <a href={imgUrl(f.url || f.filename)} target="_blank" rel="noreferrer" className="block">
                {isImg(f)
                  ? <img src={imgUrl(f.url || f.filename)} alt={f.originalName} className="w-full h-20 object-cover" />
                  : <div className="w-full h-20 flex items-center justify-center bg-slate-50"><File size={20} className="text-slate-300" /></div>}
                <div className="px-2 py-1.5">
                  <p className="text-2xs font-medium text-slate-700 truncate">{f.originalName || f.filename}</p>
                  {f.size && <p className="text-2xs text-slate-400">{fmtSize(f.size)}</p>}
                </div>
              </a>
              <button onClick={() => remove(f)}
                className="absolute top-1 right-1 w-5 h-5 bg-white/90 border border-slate-200 rounded-full text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Deal-status badge (replaces the old active/inactive/lead status)
function Badge({ status, deal }) {
  const key = deal || 'open';
  const map = {
    open:        { label: 'Open', cls: 'bg-amber-100 text-amber-700' },
    closed_won:  { label: 'Won',  cls: 'bg-emerald-100 text-emerald-700' },
    closed_lost: { label: 'Lost', cls: 'bg-rose-100 text-rose-700' },
  };
  const cfg = map[key] || map.open;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = d => {
  if (!d) return '—';
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
// Built-in symbol map for the most common currencies
const CURRENCY_SYMBOLS = {
  USD: '$',  EUR: '€',  GBP: '£',  JPY: '¥',
  AED: 'د.إ ', SAR: 'ر.س ', QAR: 'ر.ق ', OMR: 'ر.ع ', KWD: 'د.ك ', BHD: 'د.ب ',
  PKR: '₨', INR: '₹', BDT: '৳',
  CNY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', TRY: '₺', RUB: '₽',
};
const symFor = code => CURRENCY_SYMBOLS[(code || '').toUpperCase()] || `${code || ''} `;

const fmtMoney = (v, codeOrSym = '$') => {
  // Accept either a currency code ("USD", "AED") or a literal symbol ("$").
  // If it looks like a 3-letter currency code, look up its proper symbol.
  const sym = /^[A-Z]{2,4}$/.test(codeOrSym) ? symFor(codeOrSym) : codeOrSym;
  const num = (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sym}${num}`;
};

const STATUS_COLORS = {
  draft: 'bg-slate-100 text-slate-600', sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-600',
  expired: 'bg-amber-100 text-amber-700', unpaid: 'bg-rose-100 text-rose-700',
  partial: 'bg-amber-100 text-amber-700', paid: 'bg-emerald-100 text-emerald-700',
  overdue: 'bg-red-100 text-red-700', cancelled: 'bg-slate-100 text-slate-500',
};

// ── New Transaction Dropdown ──────────────────────────────────────────────────

function NewTransactionButton({ client, fullWidth }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={`relative ${fullWidth ? 'w-full' : ''}`} ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm ${fullWidth ? 'w-full justify-center' : ''}`}>
        <Plus size={14} /> New Transaction
        <ChevronDown size={13} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden animate-modal">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
              For {client.display_name || client.name}
            </p>
          </div>
          {[
            { label: 'New Quotation', icon: FileText, path: '/quotations/new' },
            { label: 'New Invoice',   icon: Receipt,  path: '/invoices/new'   },
          ].map(({ label, icon: Icon, path }) => (
            <button key={path} onClick={() => { setOpen(false); navigate(path, { state: { client } }); }}
              className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left">
              <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon size={14} className="text-slate-500" />
              </div>
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Client List Item ──────────────────────────────────────────────────────────

function ClientListItem({ client, isSelected, onClick }) {
  const label = client.display_name || client.name || '?';
  const initials = label.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors flex items-center gap-3 relative
        ${isSelected
          ? 'bg-indigo-50 border-l-[3px] border-l-indigo-600'
          : 'hover:bg-slate-50/80 border-l-[3px] border-l-transparent'
        }`}
    >
      <div className={`w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden
        ${!client.avatar ? (isSelected ? 'bg-indigo-600' : 'bg-slate-100') : ''}`}>
        {client.avatar
          ? <img src={imgUrl(client.avatar)} alt={label} className="w-full h-full object-cover" />
          : <span className={`w-full h-full flex items-center justify-center text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-600'}`}>{initials || '?'}</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-slate-800'}`}>
          {label}
        </p>
        {client.company && client.company !== label && (
          <p className="text-xs text-slate-400 truncate mt-0.5">{client.company}</p>
        )}
        {client.customer_number && (
          <p className="text-xs text-slate-300 mt-0.5">#{client.customer_number}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <Badge deal={client.deal_status} />
        {(client.city || client.country) && (
          <p className="text-2xs text-slate-300 truncate max-w-[80px]">
            {[client.city, client.country].filter(Boolean).join(', ')}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Client Detail Panel (right side) ─────────────────────────────────────────

const DETAIL_TABS = ['Overview', 'Transactions', 'Statement'];

function ClientDetailPanel({ client, stats, statsLoading, onEdit, onDelete, onClose, onPatch }) {
  const [tab, setTab] = useState('Overview');

  // Reset to Overview when client changes
  useEffect(() => { setTab('Overview'); }, [client?.id]);

  if (!client) return null;

  const parseList = v => { try { const x = typeof v === 'string' ? JSON.parse(v || '[]') : (v || []); return Array.isArray(x) ? x : []; } catch { return []; } };
  const techPacks = parseList(client.tech_packs);
  const finalDesigns = parseList(client.final_designs);
  const billing  = [client.address, client.city, client.zip, client.country].filter(Boolean).join(', ') || null;
  const shipping = [client.shipping_address, client.shipping_city, client.shipping_zip, client.shipping_country].filter(Boolean).join(', ') || null;
  const receiver = [client.shipping_receiver_name, client.shipping_receiver_phone].filter(Boolean).join(' · ') || null;
  const sym      = client.currency || 'USD';

  return (
    <div className="flex flex-col">

      {/* ── Header ── */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 flex-shrink-0 bg-white rounded-tr-2xl">
        {/* Row 1: back + avatar + name + edit/delete */}
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden bg-indigo-100">
            {client.avatar
              ? <img src={imgUrl(client.avatar)} alt={client.display_name || client.name} className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center text-sm font-bold text-indigo-700">
                  {(client.display_name || client.name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                </span>
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-slate-900 text-base leading-tight truncate">{client.display_name || client.name}</h2>
              <Badge deal={client.deal_status} />
            </div>
            {client.company && <p className="text-slate-400 text-xs truncate">{client.company}</p>}
            {client.customer_number && <p className="text-slate-300 text-xs">#{client.customer_number}</p>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => onEdit(client)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-medium transition-colors">
              <Pencil size={13} /> <span className="hidden sm:inline">Edit</span>
            </button>
            <button onClick={() => onDelete(client)}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
              <Trash2 size={15} />
            </button>
          </div>
        </div>
        {/* Row 2: New Transaction button (full width on mobile) */}
        <div className="mt-2.5">
          <NewTransactionButton client={client} fullWidth />
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-slate-200 px-6 flex-shrink-0 bg-white gap-1">
        {DETAIL_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-all duration-150 ${
              tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Body — no inner scroll; the page scrolls ── */}
      <div className="flex-1 bg-slate-50/40 rounded-br-2xl">

        {/* ── Overview — bento grid ── */}
        {tab === 'Overview' && (() => {
          const out    = stats?.stats?.outstanding   ?? 0;
          const rev    = stats?.stats?.total_revenue ?? 0;
          const pipe   = stats?.stats?.pipeline_value ?? 0;
          const deal   = client.deal_status || 'open';
          const dealCfg = {
            open:        { label: 'Open',        cls: 'bg-amber-100/70 text-amber-700 border-amber-200/70',     dot: 'bg-amber-500' },
            closed_won:  { label: 'Closed · Won',  cls: 'bg-emerald-100/70 text-emerald-700 border-emerald-200/70', dot: 'bg-emerald-500' },
            closed_lost: { label: 'Closed · Lost', cls: 'bg-rose-100/70 text-rose-700 border-rose-200/70',       dot: 'bg-rose-500' },
          }[deal] || { label: deal, cls: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' };
          const paidUp = !statsLoading && rev > 0 && out <= 0.005;
          const pill = (children, cls) => (
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider border px-2.5 py-1 rounded-full ${cls}`}>{children}</span>
          );
          return (
            <div className="p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-3 auto-rows-min">

              {/* Deal / source — 2 wide */}
              <div className="col-span-2 rounded-2xl p-4 bg-white border border-slate-200 border-t-4 border-t-indigo-500">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Deal</span>
                  <div className="flex items-center gap-1.5">
                    {['open','closed_won','closed_lost'].map(k => {
                      const c = { open: 'Open', closed_won: 'Won', closed_lost: 'Lost' }[k];
                      const on = deal === k;
                      return (
                        <button key={k} onClick={() => onPatch({ deal_status: k })}
                          className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-colors ${
                            on ? (k === 'closed_won' ? 'bg-emerald-600 border-emerald-600 text-white' : k === 'closed_lost' ? 'bg-rose-600 border-rose-600 text-white' : 'bg-amber-500 border-amber-500 text-white')
                               : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'
                          }`}>{c}</button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {pill(<><span className={`w-1.5 h-1.5 rounded-full ${dealCfg.dot}`} />{dealCfg.label}</>, dealCfg.cls)}
                  {paidUp && pill(<><Check size={10} />Paid up</>, 'bg-emerald-100/70 text-emerald-700 border-emerald-200/70')}
                  {deal === 'closed_won' && paidUp && pill(<>Tech packs sync to projects</>, 'bg-indigo-100/70 text-indigo-700 border-indigo-200/70')}
                </div>
                <div className="mt-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Lead source · where the conversation started</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {LEAD_SOURCES.map(s => (
                      <button key={s} onClick={() => onPatch({ lead_source: client.lead_source === s ? '' : s })}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                          client.lead_source === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
                        }`}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Revenue tile */}
              <div className="rounded-2xl p-4 bg-white border border-slate-200 border-t-4 border-t-emerald-500 flex flex-col justify-between min-h-[110px]">
                {pill(<><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Revenue</>, 'bg-emerald-100/70 text-emerald-700 border-emerald-200/70')}
                <div>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{statsLoading ? '…' : fmtMoney(rev, sym)}</p>
                  <p className="text-sm text-slate-600 mt-1">{stats?.stats?.payments_count ?? 0} payments</p>
                </div>
              </div>

              {/* Outstanding tile */}
              <div className={`rounded-2xl p-4 border flex flex-col justify-between min-h-[110px] ${
                out > 0 ? 'bg-white border-slate-200 border-t-4 border-t-rose-500' : 'bg-white border-slate-200 border-t-4 border-t-slate-300'}`}>
                {pill(<><span className={`w-1.5 h-1.5 rounded-full ${out > 0 ? 'bg-rose-500' : 'bg-slate-400'}`} />Outstanding</>,
                  out > 0 ? 'bg-rose-100/70 text-rose-700 border-rose-200/70' : 'bg-slate-100 text-slate-500 border-slate-200')}
                <div>
                  <p className={`text-2xl font-black tracking-tight ${out > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{statsLoading ? '…' : fmtMoney(out, sym)}</p>
                  <p className="text-sm text-slate-600 mt-1">{stats?.stats?.invoices_count ?? 0} invoices · {client.payment_terms || 'Due on receipt'}</p>
                </div>
              </div>

              {/* Contact — 2 wide */}
              <div className="col-span-2 rounded-2xl p-4 bg-white border border-slate-200">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Contact & Address</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="space-y-1.5">
                    {client.phone && <p className="flex items-center gap-2 text-slate-700"><Phone size={12} className="text-slate-400" />{client.phone}</p>}
                    {client.email && <p className="flex items-center gap-2 text-slate-700 min-w-0"><Mail size={12} className="text-slate-400 flex-shrink-0" /><a href={`mailto:${client.email}`} className="text-indigo-600 hover:underline truncate">{client.email}</a></p>}
                    {!client.phone && !client.email && <p className="text-slate-500 italic text-sm">No contact info</p>}
                  </div>
                  <div className="space-y-2 text-sm">
                    <p className="flex items-start gap-2 text-slate-700"><MapPin size={11} className="text-indigo-400 mt-0.5 flex-shrink-0" />{billing || <span className="text-slate-500 italic">No billing address</span>}</p>
                    <p className="flex items-start gap-2 text-slate-700"><Truck size={11} className="text-violet-400 mt-0.5 flex-shrink-0" />{shipping || <span className="text-slate-500 italic">No shipping address</span>}</p>
                  </div>
                </div>
              </div>

              {/* Pipeline tile */}
              <div className="rounded-2xl p-4 bg-white border border-slate-200 border-t-4 border-t-violet-500 flex flex-col justify-between min-h-[110px]">
                {pill(<><span className="w-1.5 h-1.5 rounded-full bg-violet-500" />Pipeline</>, 'bg-violet-100/70 text-violet-700 border-violet-200/70')}
                <div>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{statsLoading ? '…' : fmtMoney(pipe, sym)}</p>
                  <p className="text-sm text-slate-600 mt-1">{stats?.stats?.quotations_count ?? 0} quotations</p>
                </div>
              </div>

              {/* Details tile */}
              <div className="rounded-2xl p-4 bg-white border border-slate-200 text-sm space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Details</p>
                {[
                  ['Type', client.customer_type], ['Currency', client.currency], ['Origin', client.products_origin],
                  ['Owner', client.customer_owner], ['Since', fmt(client.created_at)],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <p key={k} className="flex justify-between gap-2"><span className="text-slate-500">{k}</span><span className="font-semibold text-slate-700 capitalize truncate">{v}</span></p>
                ))}
              </div>

              {/* Final designs — 2 wide */}
              <div className="col-span-2">
                <ClientFiles
                  title="Final Designs"
                  hint="Approved artwork only — this is what syncs into projects & prints on the floor docs"
                  icon={FileImage}
                  accent="emerald"
                  files={finalDesigns}
                  onChange={list => onPatch({ final_designs: list })}
                />
              </div>

              {/* Tech packs — 2 wide */}
              <div className="col-span-2">
                <ClientFiles
                  title="Tech Packs"
                  hint="Specs, size charts, reference artwork — kept for reference, not synced to projects"
                  icon={FileImage}
                  accent="indigo"
                  files={techPacks}
                  onChange={list => onPatch({ tech_packs: list })}
                />
              </div>

              {/* Notes — 2 wide */}
              <div className="col-span-2 rounded-2xl p-4 bg-white border border-slate-200 border-t-4 border-t-amber-400">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1.5">Notes</p>
                {client.notes
                  ? <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{client.notes}</p>
                  : <p className="text-sm text-amber-600/80 italic">No notes — use Edit to add.</p>}
              </div>
            </div>
          );
        })()}

        {/* ── Transactions ── */}
        {tab === 'Transactions' && (
          <div className="p-6">
            {statsLoading ? (
              <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Loading transactions…</p>
              </div>
            ) : (
              <TransactionTimeline stats={stats} sym={sym} />
            )}
          </div>
        )}

        {/* ── Statement ── */}
        {tab === 'Statement' && (
          <div className="p-6">
            {statsLoading ? (
              <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Generating statement…</p>
              </div>
            ) : (
              <StatementView client={client} stats={stats} sym={sym} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transaction Timeline ──────────────────────────────────────────────────────

function TransactionTimeline({ stats, sym }) {
  if (!stats) return <EmptyIllustration text="No transactions yet" sub="Invoices, quotations and payments will appear here." />;

  const events = [
    ...(stats.quotations || []).map(q => ({
      type: 'quotation', date: q.created_at, id: q.id,
      number: q.number, status: q.status, amount: q.total, currency: q.currency,
      label: 'Quotation created',
    })),
    ...(stats.invoices || []).map(i => ({
      type: 'invoice', date: i.created_at, id: i.id,
      number: i.number, status: i.status, amount: i.total, amountPaid: i.amount_paid,
      currency: i.currency, dueDate: i.due_date, label: 'Invoice created',
    })),
    ...(stats.payments || []).map(p => ({
      type: 'payment', date: p.paid_at || p.created_at, id: p.id,
      number: p.invoice_number, method: p.method, reference: p.reference,
      amount: p.amount, currency: p.currency, label: 'Payment received',
    })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (events.length === 0) return <EmptyIllustration text="No transactions yet" sub="Invoices, quotations and payments will appear here." />;

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
      <div className="space-y-3">
        {events.map(ev => {
          const isP = ev.type === 'payment';
          const isI = ev.type === 'invoice';
          return (
            <div key={`${ev.type}-${ev.id}`} className="flex gap-4 items-start relative">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white shadow-sm
                ${isP ? 'bg-emerald-100' : isI ? 'bg-indigo-100' : 'bg-violet-100'}`}>
                {isP && <DollarSign size={12} className="text-emerald-600" />}
                {isI && <Receipt    size={12} className="text-indigo-600" />}
                {!isP && !isI && <FileText size={12} className="text-violet-600" />}
              </div>
              <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm hover:border-slate-300 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-800 text-xs">{ev.label}</span>
                      {ev.number && <span className="font-mono text-xs text-slate-400 bg-slate-100 px-1 py-0.5 rounded">{ev.number}</span>}
                      {ev.status && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[ev.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {ev.status}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{fmt(ev.date)}</p>
                    {isP && ev.method && (
                      <p className="text-xs text-slate-500 mt-0.5">via <span className="capitalize font-medium">{ev.method}</span>
                        {ev.reference && <> · <span className="font-mono">{ev.reference}</span></>}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`font-bold text-xs tabular-nums ${isP ? 'text-emerald-700' : 'text-slate-800'}`}>
                      {isP ? '+' : ''}{fmtMoney(ev.amount, ev.currency || sym)}
                    </p>
                    {isI && parseFloat(ev.amountPaid) > 0 && parseFloat(ev.amountPaid) < parseFloat(ev.amount) && (
                      <p className="text-xs text-slate-400 mt-0.5">Paid: {fmtMoney(ev.amountPaid, ev.currency || sym)}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Statement View ────────────────────────────────────────────────────────────

function StatementView({ client, stats, sym }) {
  if (!stats || (stats.invoices.length === 0 && stats.payments.length === 0)) {
    return <EmptyIllustration text="No statement available" sub="A statement will be generated once invoices exist for this client." />;
  }
  const totalPaid = stats.payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
          <p className="text-xs text-slate-400 mb-1">Total Invoiced ({sym})</p>
          <p className="font-bold text-slate-800">{fmtMoney(stats.stats.total_revenue, sym)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center shadow-sm">
          <p className="text-xs text-slate-400 mb-1">Total Paid ({sym})</p>
          <p className="font-bold text-emerald-700">{fmtMoney(totalPaid, sym)}</p>
        </div>
        <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-center shadow-sm">
          <p className="text-xs text-slate-400 mb-1">Outstanding ({sym})</p>
          <p className="font-bold text-rose-600">{fmtMoney(stats.stats.outstanding, sym)}</p>
        </div>
      </div>

      {stats.invoices.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Invoices</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Invoice #</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Date</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-400">Amount</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-400">Paid</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-400">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-indigo-600 font-semibold">{inv.number}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fmt(inv.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[inv.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{fmtMoney(inv.total, inv.currency || sym)}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-700 font-semibold">{fmtMoney(inv.amount_paid || 0, inv.currency || sym)}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-rose-600">
                    {fmtMoney(Math.max(0, (parseFloat(inv.total) || 0) - (parseFloat(inv.amount_paid) || 0)), inv.currency || sym)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {stats.payments.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payments Received</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Date</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Invoice</th>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-400">Method</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-400">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.payments.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{fmt(p.paid_at)}</td>
                  <td className="px-4 py-2.5 font-mono text-indigo-600">{p.invoice_number || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600 capitalize">{p.method || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{fmtMoney(p.amount, p.currency || sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Empty Illustration ────────────────────────────────────────────────────────

function EmptyIllustration({ text, sub }) {
  return (
    <div className="py-16 text-center">
      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <FileText size={20} className="text-slate-300" />
      </div>
      <p className="text-slate-500 font-medium">{text}</p>
      {sub && <p className="text-slate-400 text-sm mt-1">{sub}</p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// Filters are deal-status based (status active/inactive/lead is legacy)
const FILTERS = [
  { key: 'All',         label: 'All' },
  { key: 'open',        label: 'Open' },
  { key: 'closed_won',  label: 'Won' },
  { key: 'closed_lost', label: 'Lost' },
];

export default function Clients() {
  const navigate                        = useNavigate();
  const location                        = useLocation();
  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState('All');
  const [selected,     setSelected]     = useState(null);

  // Re-clicking "Clients" in the sidebar returns to the list from a detail view
  useEffect(() => { setSelected(null); }, [location.key]);
  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [delTarget,    setDelTarget]    = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [delError,     setDelError]     = useState('');

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/clients'); setClients(data); }
    catch { setClients([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Load stats whenever selected client changes
  useEffect(() => {
    if (!selected) { setStats(null); return; }
    setStats(null);
    setStatsLoading(true);
    api.get(`/clients/${selected.id}/stats`)
      .then(r => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, [selected?.id]);

  const handleDelete = async () => {
    setDeleting(true); setDelError('');
    try {
      await api.delete(`/clients/${delTarget.id}`);
      if (selected?.id === delTarget.id) setSelected(null);
      setDelTarget(null);
      await load();
    } catch (e) {
      setDelError(e?.response?.data?.error ?? 'Failed to delete client.');
    } finally { setDeleting(false); }
  };

  const dealOf = c => c.deal_status || 'open';
  const filtered = clients.filter(c => {
    const matchStatus = filter === 'All' || dealOf(c) === filter;
    const matchSearch = !search || [c.name, c.company, c.display_name, c.email, c.phone, c.city, c.customer_number]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const stats_counts = {
    total: clients.length,
    open:  clients.filter(c => dealOf(c) === 'open').length,
    won:   clients.filter(c => dealOf(c) === 'closed_won').length,
    lost:  clients.filter(c => dealOf(c) === 'closed_lost').length,
  };
  const kpi = [
    { key: 'All',         label: 'Clients', value: stats_counts.total, sub: 'all customers',        tint: 'border-slate-200 border-t-4 border-t-indigo-500',   pill: 'bg-indigo-100/70 text-indigo-700 border-indigo-200/70',   dot: 'bg-indigo-500' },
    { key: 'open',        label: 'Open',    value: stats_counts.open,  sub: 'deals in progress',    tint: 'border-slate-200 border-t-4 border-t-amber-500',     pill: 'bg-amber-100/70 text-amber-700 border-amber-200/70',     dot: 'bg-amber-500' },
    { key: 'closed_won',  label: 'Won',     value: stats_counts.won,   sub: 'closed · producing',   tint: 'border-slate-200 border-t-4 border-t-emerald-500',   pill: 'bg-emerald-100/70 text-emerald-700 border-emerald-200/70', dot: 'bg-emerald-500' },
    { key: 'closed_lost', label: 'Lost',    value: stats_counts.lost,  sub: 'did not convert',      tint: stats_counts.lost > 0 ? 'border-slate-200 border-t-4 border-t-rose-500' : 'border-slate-200 border-t-4 border-t-slate-300', pill: stats_counts.lost > 0 ? 'bg-rose-100/70 text-rose-700 border-rose-200/70' : 'bg-slate-100 text-slate-500 border-slate-200', dot: stats_counts.lost > 0 ? 'bg-rose-500' : 'bg-slate-400' },
  ];

  return (
    <div className="flex flex-col">

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm mt-0.5">Leads, deals, conversations and tech packs — everything about a customer</p>
        </div>
        <button onClick={() => navigate('/clients/new')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200">
          <Plus size={16} /> New Customer
        </button>
      </div>

      {/* ── KPI tiles (click to filter by deal status) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {kpi.map(k => (
          <button key={k.key} onClick={() => setFilter(filter === k.key ? 'All' : k.key)}
            className={`text-left rounded-2xl p-4 bg-white border shadow-sm transition-all ${k.tint} ${filter === k.key && k.key !== 'All' ? 'ring-2 ring-indigo-300' : 'hover:shadow'}`}>
            <span className={`inline-flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider border px-2.5 py-1 rounded-full ${k.pill}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${k.dot}`} />{k.label}
            </span>
            <p className="text-2xl font-black text-slate-900 mt-2 leading-none">{k.value}</p>
            <p className="text-2xs text-slate-500 mt-1">{k.sub}</p>
          </button>
        ))}
      </div>

      {/* ── Split Pane — page scrolls naturally; only the client list has its own scroll ── */}
      <div className="flex flex-col lg:flex-row lg:items-start rounded-2xl border border-slate-200 shadow-sm bg-white">

        {/* LEFT: Client List (sticky on desktop) */}
        <div className={`w-full lg:w-72 lg:flex-none flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] rounded-t-2xl lg:rounded-tr-none lg:rounded-l-2xl overflow-hidden ${selected ? 'hidden lg:flex' : ''}`}>

          {/* Search & Filter */}
          <div className="p-3 border-b border-slate-100 space-y-2 flex-shrink-0 bg-white">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search clients…"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all bg-white"
              />
            </div>
            <div className="flex gap-1">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${
                    filter === f.key ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 px-0.5">
              {filtered.length} of {clients.length} customer{clients.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center">
                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                <p className="text-slate-400 text-xs">Loading…</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center px-4">
                <Users size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-xs">
                  {search || filter !== 'All' ? 'No matches' : 'No clients yet'}
                </p>
              </div>
            ) : (
              filtered.map(c => (
                <ClientListItem
                  key={c.id}
                  client={c}
                  isSelected={selected?.id === c.id}
                  onClick={() => setSelected(c)}
                />
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Detail Panel — grows with content */}
        <div className="flex-1 min-w-0 flex flex-col min-h-[60vh]">
          {/* Inline delete confirmation */}
          {delTarget && (
            <div className="flex items-center gap-3 px-5 py-3 bg-rose-50 border-b border-rose-200 text-sm flex-shrink-0">
              <AlertTriangle size={15} className="text-rose-500 flex-shrink-0" />
              <span className="flex-1 text-rose-700 font-medium">
                Delete <strong>{delTarget.display_name || delTarget.name}</strong>? This cannot be undone.
              </span>
              {delError && <span className="text-rose-600 text-xs mr-2">{delError}</span>}
              <button onClick={() => { setDelTarget(null); setDelError(''); }}
                className="px-3 py-1.5 text-xs border border-rose-200 rounded-lg text-rose-600 hover:bg-rose-100 font-medium">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-3 py-1.5 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-medium disabled:opacity-50">
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
          {selected ? (
            <ClientDetailPanel
              client={selected}
              stats={stats}
              statsLoading={statsLoading}
              onEdit={c => navigate(`/clients/${c.id}/edit`)}
              onDelete={c => setDelTarget(c)}
              onClose={() => setSelected(null)}
              onPatch={async patch => {
                // Partial update — server only writes the fields present in the body
                const { data } = await api.put(`/clients/${selected.id}`, patch);
                setSelected(data);
                setClients(cs => cs.map(c => c.id === data.id ? data : c));
              }}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50/40">
              <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users size={28} className="text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">Select a client</p>
              <p className="text-slate-400 text-sm mt-1">Click any client in the list to view their details</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
