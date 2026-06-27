import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Pencil, Trash2, X, Mail, Phone,
  MapPin, Building2, FileText, ChevronRight, ArrowLeft,
  AlertTriangle, Check, Truck, Upload, File, XCircle,
  User, CreditCard, Clock, DollarSign, Package,
  ChevronDown, Receipt, Users,
} from 'lucide-react';
import api from '../lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function Badge({ status }) {
  const map = {
    active:   'bg-emerald-100 text-emerald-700',
    inactive: 'bg-slate-100 text-slate-500',
    lead:     'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${map[status] ?? map.inactive}`}>
      {status}
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
const fmtSize = b => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

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
          ? <img src={client.avatar} alt={label} className="w-full h-full object-cover" />
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
        <Badge status={client.status} />
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

function ClientDetailPanel({ client, stats, statsLoading, onEdit, onDelete, onClose }) {
  const [tab, setTab] = useState('Overview');

  // Reset to Overview when client changes
  useEffect(() => { setTab('Overview'); }, [client?.id]);

  if (!client) return null;

  const docs     = (() => { try { return JSON.parse(client.documents ?? '[]'); } catch { return []; } })();
  const billing  = [client.address, client.city, client.zip, client.country].filter(Boolean).join(', ') || null;
  const shipping = [client.shipping_address, client.shipping_city, client.shipping_zip, client.shipping_country].filter(Boolean).join(', ') || null;
  const receiver = [client.shipping_receiver_name, client.shipping_receiver_phone].filter(Boolean).join(' · ') || null;
  const sym      = client.currency || 'USD';

  return (
    <div className="h-full flex flex-col">

      {/* ── Header ── */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 flex-shrink-0 bg-white">
        {/* Row 1: back + avatar + name + edit/delete */}
        <div className="flex items-center gap-3 min-w-0">
          {onClose && (
            <button onClick={onClose} className="lg:hidden p-1 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0">
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden bg-indigo-100">
            {client.avatar
              ? <img src={client.avatar} alt={client.display_name || client.name} className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center text-sm font-bold text-indigo-700">
                  {(client.display_name || client.name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')}
                </span>
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-slate-900 text-base leading-tight truncate">{client.display_name || client.name}</h2>
              <Badge status={client.status} />
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

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/40">

        {/* ── Overview ── */}
        {tab === 'Overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 divide-x-0 lg:divide-x divide-slate-100 min-h-full">

            {/* Left */}
            <div className="lg:col-span-3 px-6 py-5 space-y-6">

              {/* Contact */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Contact</h3>
                <div className="space-y-2">
                  {client.phone && (
                    <div className="flex items-center gap-2.5 text-sm text-slate-700">
                      <Phone size={13} className="text-slate-400 flex-shrink-0" />
                      {client.phone}
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-2.5 text-sm text-slate-700">
                      <Mail size={13} className="text-slate-400 flex-shrink-0" />
                      <a href={`mailto:${client.email}`} className="text-indigo-600 hover:underline">{client.email}</a>
                    </div>
                  )}
                  {!client.phone && !client.email && (
                    <p className="text-slate-400 text-sm italic">No contact info</p>
                  )}
                </div>
              </div>

              {/* Address */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Address</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                      <MapPin size={11} className="text-indigo-400" /> Billing
                    </p>
                    <p className="text-sm text-slate-700">{billing ?? <span className="text-slate-400 italic">No billing address</span>}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-1 flex items-center gap-1">
                      <Truck size={11} className="text-violet-400" /> Shipping
                    </p>
                    {receiver && <p className="text-xs text-indigo-600 font-medium mb-0.5">{receiver}</p>}
                    <p className="text-sm text-slate-700">{shipping ?? <span className="text-slate-400 italic">No shipping address</span>}</p>
                  </div>
                </div>
              </div>

              {/* Other Details */}
              <div>
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Details</h3>
                <div className="grid grid-cols-2 gap-y-3 gap-x-6">
                  {[
                    { label: 'Customer Type',    value: client.customer_type },
                    { label: 'Customer #',       value: client.customer_number },
                    { label: 'Currency',         value: client.currency },
                    { label: 'Products Origin',  value: client.products_origin },
                    { label: 'Payment Terms',    value: client.payment_terms },
                    { label: 'Owner',            value: client.customer_owner },
                    { label: 'Language',         value: client.customer_language },
                    { label: 'Added',            value: fmt(client.created_at) },
                  ].filter(({ value }) => value).map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs text-slate-400">{label}</p>
                      <p className="text-sm text-slate-800 font-medium capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {client.notes && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</h3>
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {client.notes}
                  </div>
                </div>
              )}

              {/* Documents */}
              {docs.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Documents</h3>
                  <div className="space-y-2">
                    {docs.map(doc => (
                      <a key={doc.filename} href={doc.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-3 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl px-3 py-2.5 transition-colors group">
                        <File size={14} className="text-indigo-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 group-hover:text-indigo-700 truncate">{doc.originalName}</p>
                          <p className="text-xs text-slate-400">{fmtSize(doc.size)}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Financials */}
            <div className="lg:col-span-2 px-5 py-5 space-y-5 bg-white">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Payment Due Period</p>
                <p className="text-sm font-semibold text-slate-800">{client.payment_terms || 'Due on Receipt'}</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Receivables</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-slate-100">
                      <th className="text-left pb-2 font-semibold">Currency</th>
                      <th className="text-right pb-2 font-semibold">Outstanding</th>
                      <th className="text-right pb-2 font-semibold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-slate-700">
                      <td className="py-2">{sym}</td>
                      <td className="py-2 text-right font-medium text-rose-600">
                        {statsLoading ? '…' : fmtMoney(stats?.stats?.outstanding ?? 0, sym)}
                      </td>
                      <td className="py-2 text-right font-medium text-emerald-700">
                        {statsLoading ? '…' : fmtMoney(stats?.stats?.total_revenue ?? 0, sym)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {!statsLoading && (stats?.stats?.pipeline_value ?? 0) > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-indigo-600 font-semibold">Pipeline (Quotations)</p>
                    <span className="text-2xs font-mono text-indigo-500 bg-indigo-100 px-2 py-0.5 rounded-full">
                      {stats.stats.currency || sym}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-indigo-700 mt-0.5">
                    {fmtMoney(stats.stats.pipeline_value, sym)}
                  </p>
                  {stats.quotations?.some(q => (q.currency || sym) !== sym) && (
                    <p className="text-2xs text-indigo-500/70 mt-1">
                      Includes quotes in other currencies, converted via your exchange rates.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Quotations', value: statsLoading ? '…' : (stats?.stats?.quotations_count ?? 0) },
                  { label: 'Invoices',   value: statsLoading ? '…' : (stats?.stats?.invoices_count  ?? 0) },
                  { label: 'Payments',   value: statsLoading ? '…' : (stats?.stats?.payments_count  ?? 0) },
                  { label: 'Revenue',    value: statsLoading ? '…' : fmtMoney(stats?.stats?.total_revenue ?? 0, sym) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-sm font-bold text-slate-800 truncate">{value}</p>
                    <p className="text-xs text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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

const FILTERS = ['All', 'Active', 'Inactive', 'Lead'];

export default function Clients() {
  const navigate                        = useNavigate();
  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filter,       setFilter]       = useState('All');
  const [selected,     setSelected]     = useState(null);
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

  const filtered = clients.filter(c => {
    const matchStatus = filter === 'All' || c.status === filter.toLowerCase();
    const matchSearch = !search || [c.name, c.company, c.display_name, c.email, c.phone, c.city, c.customer_number]
      .some(f => f?.toLowerCase().includes(search.toLowerCase()));
    return matchStatus && matchSearch;
  });

  const stats_counts = {
    total:    clients.length,
    active:   clients.filter(c => c.status === 'active').length,
    inactive: clients.filter(c => c.status === 'inactive').length,
    lead:     clients.filter(c => c.status === 'lead').length,
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8.5rem)' }}>

      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {stats_counts.active} active · {stats_counts.lead} leads · {stats_counts.total} total
          </p>
        </div>
        <button onClick={() => navigate('/clients/new')}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
          <Plus size={16} /> New Customer
        </button>
      </div>

      {/* ── Split Pane ── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">

        {/* LEFT: Client List */}
        <div className={`w-full lg:w-72 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 ${selected ? 'hidden lg:flex' : ''}`}>

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
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 py-1 text-xs rounded-lg font-medium transition-all ${
                    filter === f ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}>
                  {f}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 px-0.5">
              {filtered.length} of {clients.length} customer{clients.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto">
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

        {/* RIGHT: Detail Panel */}
        <div className="flex-1 min-w-0 flex flex-col">
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
