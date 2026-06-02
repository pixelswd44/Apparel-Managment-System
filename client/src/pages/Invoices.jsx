import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, FileText, Pencil, Trash2, AlertTriangle, User,
  ArrowLeft, X, Check, Printer, Receipt, Banknote,
  CreditCard, Smartphone, ListChecks, Download,
  Copy, Landmark,
} from 'lucide-react';
import api from '../lib/api';
import { printDoc, downloadDoc } from '../lib/printDoc';
import TemplatePicker from '../components/TemplatePicker';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ['unpaid', 'partial', 'paid', 'overdue', 'cancelled'];
const STATUS_CFG = {
  unpaid:    { label: 'Unpaid',    color: 'bg-amber-100  text-amber-700',    dot: 'bg-amber-500'   },
  partial:   { label: 'Partial',   color: 'bg-blue-100   text-blue-700',     dot: 'bg-blue-500'    },
  paid:      { label: 'Paid',      color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  overdue:   { label: 'Overdue',   color: 'bg-rose-100   text-rose-700',     dot: 'bg-rose-500'    },
  cancelled: { label: 'Cancelled', color: 'bg-slate-100  text-slate-500',    dot: 'bg-slate-400'   },
};

const PAY_METHODS = [
  { value: 'cash',   label: 'Cash',           icon: Banknote   },
  { value: 'bank',   label: 'Bank Transfer',  icon: CreditCard },
  { value: 'online', label: 'Online Payment', icon: Smartphone },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = d => {
  if (!d) return '—';
  // Replace SQLite space separator so all browsers parse correctly
  const dt = new Date(String(d).replace(' ', 'T'));
  if (isNaN(dt.getTime())) return '—';
  return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const fmtMoney = (v, sym = '$') => `${sym}${(parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const getSym   = code => ({ PKR: '₨', EUR: '€', GBP: '£', AED: 'د.إ' }[code] ?? '$');
const methodLabel = m => PAY_METHODS.find(p => p.value === m)?.label ?? m;

const inputCls = 'w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-3 focus:ring-indigo-100 transition-all duration-150 bg-white placeholder:text-slate-400';

// ── Shared ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.unpaid;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

// ── Payment Modal ─────────────────────────────────────────────────────────────

function PaymentModal({ invoice, onClose, onSuccess }) {
  const [form, setForm] = useState({
    amount:    (parseFloat(invoice.total) - parseFloat(invoice.amount_paid || 0)).toFixed(2),
    method:    'cash',
    reference: '',
    notes:     '',
    paid_at:   new Date().toISOString().split('T')[0],
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const sym = getSym(invoice.currency);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!parseFloat(form.amount) || parseFloat(form.amount) <= 0) {
      setError('Enter a valid payment amount.'); return;
    }
    setSaving(true); setError('');
    try {
      const { data } = await api.post(`/invoices/${invoice.id}/payments`, {
        ...form, paid_at: new Date(form.paid_at).toISOString(),
      });
      onSuccess(data);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.error ?? 'Failed to record payment.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 animate-overlay">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-modal">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-slate-900">Record Payment</h3>
            <p className="text-xs text-slate-400 mt-0.5">{invoice.number} · Balance: {fmtMoney(parseFloat(invoice.total) - parseFloat(invoice.amount_paid || 0), sym)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"><X size={16} /></button>
        </div>

        {error && (
          <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm px-3 py-2.5 rounded-xl flex items-center gap-2">
            <AlertTriangle size={14} />{error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Payment Method</label>
            <div className="flex gap-2">
              {PAY_METHODS.map(({ value, label, icon: Icon }) => (
                <button key={value} type="button" onClick={() => set('method', value)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all ${
                    form.method === value
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50'
                  }`}>
                  <Icon size={16} />{label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Amount ({sym})</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{sym}</span>
              <input type="number" min="0" step="any" value={form.amount}
                onChange={e => set('amount', e.target.value)}
                className={`${inputCls} pl-7`} placeholder="0.00" autoFocus />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date</label>
              <input type="date" value={form.paid_at} onChange={e => set('paid_at', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Reference #</label>
              <input value={form.reference} onChange={e => set('reference', e.target.value)} className={inputCls} placeholder="Cheque / TXN ID…" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)}
              className={`${inputCls} resize-none`} placeholder="Optional note…" />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2.5 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-60 font-semibold transition-colors flex items-center justify-center gap-2">
            {saving ? 'Recording…' : <><Check size={14} />Record Payment</>}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Receipt Voucher (print-isolated) ─────────────────────────────────────────

function ReceiptVoucher({ invoice, payment, settings, onClose, templates = [], activeTemplate = null, onTemplateSelect }) {
  const voucherRef = useRef();
  const [downloading, setDownloading] = useState(false);
  const sym = getSym(invoice.currency);
  const tplCfg = (() => { try { return typeof activeTemplate?.config === 'string' ? JSON.parse(activeTemplate.config) : (activeTemplate?.config || {}); } catch { return {}; } })();
  const tplLayout = activeTemplate?.layout || 'classic';
  const tplColor  = tplCfg.primaryColor || '#4f46e5';
  const mLabel = methodLabel(payment.method);

  // Use the invoice's issuing company (which has its own logo + logo_size + name + address)
  // Falls back to app-level branding from settings
  const companies = settings?._companies || [];
  const issuingCo = (invoice.company_id && companies.find(c => c.id === invoice.company_id))
    || companies.find(c => c.is_default)
    || null;
  const receiptLogo     = issuingCo?.logo     || settings?.company_logo || '';
  const receiptLogoSize = issuingCo?.logo_size || 36;
  const receiptCoName   = issuingCo?.name     || settings?.company_name    || '';
  const receiptCoAddr   = issuingCo?.address  || settings?.company_address || '';
  const receiptCoCity   = issuingCo?.city     || settings?.company_city    || '';
  const receiptCoCountry= issuingCo?.country  || settings?.company_country || '';
  const receiptCoPhone  = issuingCo?.phone    || settings?.company_phone   || '';
  const receiptCoEmail  = issuingCo?.email    || settings?.company_email   || '';
  const receiptCoLocation = [receiptCoCity, receiptCoCountry].filter(Boolean).join(', ');
  const balance = parseFloat(invoice.balance_due ?? invoice.total) || 0;
  const paid    = parseFloat(payment.amount) || 0;
  const remaining = Math.max(0, balance - paid);

  async function handleDownload() {
    setDownloading(true);
    try { await downloadDoc(voucherRef, `Receipt – ${invoice.number}`); }
    finally { setDownloading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[70] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-medium">
            <ArrowLeft size={15} /> Back
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-sm font-semibold text-slate-700">Payment Receipt · {invoice.number}</span>
        </div>
        <div className="flex items-center gap-2">
          {onTemplateSelect && (
            <TemplatePicker
              type="voucher"
              selected={activeTemplate}
              templates={templates}
              onSelect={onTemplateSelect}
            />
          )}
          <button onClick={() => printDoc(voucherRef, `Receipt – ${invoice.number}`)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors">
            <Printer size={14} /> Print
          </button>
          <button onClick={handleDownload} disabled={downloading}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 rounded-xl text-sm font-semibold transition-colors">
            {downloading
              ? <><span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin flex-shrink-0" /> Generating…</>
              : <><Download size={14} /> PDF</>
            }
          </button>
        </div>
      </div>

      {/* Voucher document — compact, A5-like */}
      <div className="flex-1 overflow-y-auto bg-slate-100 py-6 px-4 print:p-0 print:bg-white print:overflow-visible">
        <div ref={voucherRef}
          className="max-w-[520px] mx-auto bg-white shadow-xl print:shadow-none print:max-w-none overflow-hidden relative"
          data-layout={tplLayout}
          style={{ fontFamily: 'system-ui, sans-serif', '--tp': tplColor }}
        >
          {tplCfg.showWatermark && tplCfg.watermarkText && (
            <div className="doc-watermark"><span>{tplCfg.watermarkText}</span></div>
          )}

          {/* ── Header: Logo (left) | RECEIPT title (right) ── */}
          <div className="px-7 pt-7 pb-5">
            <div className="flex items-start justify-between gap-6 mb-7">
              {/* Logo / company */}
              <div>
                {receiptLogo
                  ? <img src={receiptLogo} alt="logo"
                      className="w-auto object-contain"
                      style={{ height: `${receiptLogoSize}px` }} />
                  : receiptCoName
                    ? <p className="text-xl font-black text-slate-900 tracking-tight uppercase">{receiptCoName}</p>
                    : null
                }
              </div>
              {/* Title block */}
              <div className="text-right flex-shrink-0">
                <span className="inline-block border border-slate-900 text-slate-900 px-2.5 py-1 text-xs font-bold uppercase tracking-widest">Receipt</span>
                <p className="font-mono font-semibold text-slate-500 text-sm mt-2">{invoice.number}</p>
              </div>
            </div>

            {/* ── Received From (left) | From / Pay To (right) ── plain, no backgrounds */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Received From</p>
                <p className="font-bold text-slate-900 text-sm leading-tight">{invoice.client_name || '—'}</p>
                {invoice.shipping_phone && (
                  <p className="text-xs text-slate-600 mt-0.5">{invoice.shipping_phone}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Pay To</p>
                {receiptCoName && <p className="font-bold text-slate-900 text-sm leading-tight">{receiptCoName}</p>}
                {receiptCoAddr && (
                  <p className="text-xs text-slate-600 mt-1 leading-snug">{receiptCoAddr}</p>
                )}
                {receiptCoLocation && (
                  <p className="text-xs text-slate-600 leading-snug">{receiptCoLocation}</p>
                )}
                {receiptCoPhone && (
                  <p className="text-xs text-slate-600 mt-0.5">{receiptCoPhone}</p>
                )}
                {receiptCoEmail && (
                  <p className="text-xs text-slate-600 mt-0.5">{receiptCoEmail}</p>
                )}
              </div>
            </div>
          </div>

          {/* Dates strip — plain bordered row */}
          <div className="px-7 py-2.5 border-t border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-slate-500 flex-shrink-0">
              <span className="font-semibold text-slate-700">Date:</span> {fmt(payment.paid_at)}
              &nbsp;·&nbsp; <span className="font-semibold text-slate-700">Invoice:</span> {invoice.number}
            </p>
            <p className="text-xs text-slate-500 flex-shrink-0 ml-auto">
              <span className="font-semibold text-slate-700">Method:</span> {mLabel}
              {payment.reference && <> &nbsp;·&nbsp; <span className="font-semibold text-slate-700">Ref:</span> {payment.reference}</>}
            </p>
          </div>

          {/* ── Details: Amount Paid + balance — plain rows, no background card ── */}
          <div className="px-7 py-4">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Amount Paid</p>
                <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">{fmtMoney(paid, sym)}</p>
                <p className="text-2xs text-slate-500 mt-1.5">In words — {mLabel}</p>
              </div>
              <div className="text-right">
                <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">Invoice Total</span>
                  <span className="font-medium text-slate-700 tabular-nums">{fmtMoney(invoice.total, sym)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">This Payment</span>
                  <span className="font-medium text-slate-700 tabular-nums">{fmtMoney(paid, sym)}</span>
                </div>
                <div className="border-t-2 border-slate-300 mt-1 py-2 flex justify-between items-center">
                  <span className="font-bold text-slate-900 text-sm">Balance Remaining</span>
                  <span className={`font-bold text-base tabular-nums ${remaining > 0 ? 'text-slate-900' : 'text-slate-900'}`}>{fmtMoney(remaining, sym)}</span>
                </div>
              </div>
            </div>
          </div>

          {payment.notes && (
            <div className="px-7 pb-4">
              <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1">Notes</p>
              <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{payment.notes}</p>
            </div>
          )}

          {/* ── Confirmation + signatures ── */}
          <div className="px-7 pb-6 border-t border-slate-200 pt-4">
            <p className="text-2xs text-center text-slate-500 mb-5 uppercase tracking-widest font-semibold">Payment Confirmed — Thank you</p>
            <div className="flex justify-between gap-8">
              <div className="flex-1">
                <div className="border-b border-slate-400 pb-0.5 mb-1.5 min-h-[36px]" />
                <p className="text-2xs text-slate-500 text-center">Received By / Customer Signature</p>
              </div>
              <div className="flex-1">
                <div className="border-b border-slate-400 pb-0.5 mb-1.5 min-h-[36px]" />
                <p className="text-2xs text-slate-500 text-center">Authorized Signature & Stamp</p>
              </div>
            </div>
          </div>

          {tplCfg.footerText && (
            <div className="px-7 py-2 border-t border-slate-100 text-center">
              <p className="text-2xs text-slate-400">{tplCfg.footerText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Invoice View (detail overlay) ─────────────────────────────────────────────

function InvoiceView({ invoiceId, onClose, onConverted, embedded = false }) {
  const navigate = useNavigate();
  const [invoice,     setInvoice]    = useState(null);
  const [settings,    setSettings]   = useState({});
  const [loading,     setLoading]    = useState(true);
  const [payModal,    setPayModal]   = useState(false);
  const [receipt,     setReceipt]    = useState(null);
  const [delConfirm,  setDelConfirm] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting,   setDeleting]   = useState(false);
  const [templates,   setTemplates]  = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const printRef = useRef();

  async function handleDownload() {
    setDownloading(true);
    try {
      const name = [invoice?.number, invoice?.client_name, invoice?.subject].filter(Boolean).join(' – ');
      await downloadDoc(printRef, name || 'Invoice');
    }
    finally { setDownloading(false); }
  }

  const load = useCallback(async () => {
    try {
      const [invRes, setRes, coRes, tplRes] = await Promise.all([
        api.get(`/invoices/${invoiceId}`),
        api.get('/settings'),
        api.get('/companies'),
        api.get('/document-templates', { params: { type: 'invoice' } }),
      ]);
      setInvoice(invRes.data);
      setSettings({ ...setRes.data, _companies: coRes.data });
      const tpls = Array.isArray(tplRes.data) ? tplRes.data : [];
      setTemplates(tpls);
      setActiveTemplate(prev => prev || tpls.find(t => t.is_default) || tpls[0] || null);
    } catch {}
    finally { setLoading(false); }
  }, [invoiceId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    setDeleting(true);
    try {
      await api.delete(`/invoices/${invoiceId}`);
      onConverted?.();
      onClose();
    } catch {}
    finally { setDeleting(false); }
  }

  async function handleDuplicate() {
    try {
      const { data } = await api.post(`/invoices/${invoiceId}/duplicate`);
      onClose();
      navigate(`/invoices/${data.id}/edit`);
    } catch (e) {
      alert(e?.response?.data?.error ?? 'Failed to duplicate invoice.');
    }
  }

  function handlePaymentSuccess(data) {
    setInvoice(prev => ({
      ...prev,
      amount_paid: data.amount_paid,
      status:      data.status,
      payments:    [data.payment, ...(prev.payments || [])],
    }));
    setReceipt(data.payment);
  }

  if (loading) {
    return (
      <div className={embedded ? 'flex-1 flex items-center justify-center' : 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center'}>
        <div className={`w-8 h-8 border-2 ${embedded ? 'border-indigo-200 border-t-indigo-600' : 'border-white/20 border-t-white'} rounded-full animate-spin`} />
      </div>
    );
  }
  if (!invoice) return null;

  if (receipt) {
    return <ReceiptVoucher invoice={invoice} payment={receipt} settings={settings} onClose={() => setReceipt(null)}
      templates={templates} activeTemplate={activeTemplate} onTemplateSelect={setActiveTemplate} />;
  }

  const sym      = getSym(invoice.currency);
  const items    = (() => { try { return JSON.parse(invoice.items || '[]'); } catch { return []; } })();
  const payments = invoice.payments || [];
  const balance  = parseFloat(invoice.total) - parseFloat(invoice.amount_paid || 0);

  const companies = settings._companies || [];
  const selectedCo = (invoice.company_id && companies.find(c => c.id === invoice.company_id))
    || companies.find(c => c.is_default)
    || null;
  const co = selectedCo ? {
    name:         selectedCo.name         || '',
    logo:         selectedCo.logo         || '',
    logo_size:    selectedCo.logo_size    || 40,
    address:      selectedCo.address      || '',
    city:         selectedCo.city         || '',
    country:      selectedCo.country      || '',
    phone:        selectedCo.phone        || '',
    email:        selectedCo.email        || '',
    website:      selectedCo.website      || '',
    tax_number:   selectedCo.tax_number   || '',
    bank_details: selectedCo.bank_details || '',
  } : {
    name:    settings.company_name    || '',
    logo:    settings.company_logo    || '',
    logo_size: 40,
    address: settings.company_address || '',
    city:    settings.company_city    || '',
    country: settings.company_country || '',
    phone:   settings.company_phone   || '',
    email:   settings.company_email   || '',
    website: '',
    tax_number: '',
  };

  return (
    <>
      {payModal && (
        <PaymentModal invoice={invoice} onClose={() => setPayModal(false)} onSuccess={handlePaymentSuccess} />
      )}

      <div className={embedded
        ? 'flex flex-col h-full'
        : 'fixed inset-0 bg-slate-900/70 z-50 flex flex-col'}>

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
          {/* Left: number + status */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-sm text-indigo-700 font-semibold truncate">{invoice.number}</span>
            <StatusBadge status={invoice.status} />
            {invoice.is_sampling && (
              <span className="inline-flex items-center text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold border border-violet-200 flex-shrink-0">2×</span>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
              <button onClick={() => setPayModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                <Receipt size={12} /> Record Payment
              </button>
            )}
            <div className="w-px h-4 bg-slate-200 mx-0.5" />
            <TemplatePicker
              type="invoice"
              selected={activeTemplate}
              templates={templates}
              onSelect={setActiveTemplate}
            />
            <div className="w-px h-4 bg-slate-200 mx-0.5" />
            <button title="Print" onClick={() => {
                const t = [invoice?.number, invoice?.client_name, invoice?.subject].filter(Boolean).join(' – ');
                printDoc(printRef, t || 'Invoice');
              }}
              className="p-1.5 text-slate-400 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors">
              <Printer size={14} />
            </button>
            <button title={downloading ? 'Generating…' : 'Download PDF'} onClick={handleDownload} disabled={downloading}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50">
              {downloading
                ? <span className="w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin block" />
                : <Download size={14} />
              }
            </button>
            <button title="Edit" onClick={() => { if (!embedded) onClose(); navigate(`/invoices/${invoiceId}/edit`); }}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <Pencil size={14} />
            </button>
            <button title="Duplicate" onClick={handleDuplicate}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
              <Copy size={14} />
            </button>
            <button title="Delete" onClick={() => setDelConfirm(true)}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
              <Trash2 size={14} />
            </button>
            {!embedded && (
              <>
                <div className="w-px h-4 bg-slate-200 mx-0.5" />
                <button title="Close" onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  <X size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Scrollable document ── */}
        <div className="flex-1 overflow-y-auto bg-slate-100 py-6 px-3 print:p-0 print:bg-white print:overflow-visible">
          {(() => {
            const tplCfg = (() => { try { return typeof activeTemplate?.config === 'string' ? JSON.parse(activeTemplate.config) : (activeTemplate?.config || {}); } catch { return {}; } })();
            const tplLayout = activeTemplate?.layout || 'classic';
            const tplColor  = tplCfg.primaryColor || '#4f46e5';
            return (
          <div ref={printRef}
            className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden relative"
            data-layout={tplLayout}
            style={{ '--tp': tplColor }}
          >
            {tplCfg.showWatermark && tplCfg.watermarkText && (
              <div className="doc-watermark"><span>{tplCfg.watermarkText}</span></div>
            )}
            <div className="doc-accent-bar hidden" />

            {/* ── Logo  |  INVOICE title ── */}
            <div className="doc-header-band px-7 pt-7 pb-5">
              <div className="flex items-start justify-between gap-6 mb-7">
                {/* Logo only — clean */}
                <div>
                  {co.logo
                    ? <img src={co.logo} alt="logo"
                        className="w-auto object-contain"
                        style={{ height: `${co.logo_size || 40}px` }} />
                    : co.name
                      ? <p className="text-xl font-black text-slate-900 tracking-tight uppercase">{co.name}</p>
                      : null
                  }
                </div>
                {/* Title block */}
                <div className="text-right flex-shrink-0">
                  <p className="doc-title text-2xl font-black text-slate-900 tracking-tight uppercase">Invoice</p>
                  <p className="font-mono font-semibold text-slate-500 text-sm mt-1">{invoice.number}</p>
                  {!!invoice.is_sampling && (
                    <p className="text-2xs font-bold text-slate-500 uppercase tracking-widest mt-1">Sampling 2×</p>
                  )}
                </div>
              </div>

              {/* ── Bill To (left)  |  From / Our Company (right) ── plain, no backgrounds */}
              <div className="grid grid-cols-2 gap-8">
                {/* Client */}
                <div className="doc-info-left">
                  <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Bill To</p>
                  <p className="font-bold text-slate-900 text-sm leading-tight">{invoice.client_name || '—'}</p>
                  {(invoice.client_address || invoice.client_city || invoice.client_country) && (
                    <p className="text-xs text-slate-600 mt-1 leading-snug">
                      {[invoice.client_address, invoice.client_city, invoice.client_country].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {invoice.client_phone && (
                    <p className="text-xs text-slate-600 mt-0.5">{invoice.client_phone}</p>
                  )}
                  {invoice.client_email && (
                    <p className="text-xs text-slate-600 mt-0.5">{invoice.client_email}</p>
                  )}
                </div>

                {/* Our company */}
                <div className="doc-info-right text-right">
                  <p className="text-2xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">From</p>
                  {co.name && <p className="font-bold text-slate-900 text-sm leading-tight">{co.name}</p>}
                  {(co.address || co.city || co.country) && (
                    <p className="text-xs text-slate-600 mt-1 leading-snug">
                      {[co.address, co.city, co.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {co.phone && (
                    <p className="text-xs text-slate-600 mt-0.5">{co.phone}</p>
                  )}
                  {co.email && (
                    <p className="text-xs text-slate-600 mt-0.5">{co.email}</p>
                  )}
                  {co.website && (
                    <p className="text-xs text-slate-600 mt-0.5">{co.website}</p>
                  )}
                  {co.tax_number && (
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">TRN/VAT: {co.tax_number}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Subject + Dates — plain row, no background */}
            <div className="px-7 py-2.5 border-t border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
              {invoice.subject && (
                <p className="text-xs font-semibold text-slate-700 flex-1 min-w-0 truncate">{invoice.subject}</p>
              )}
              <p className="text-xs text-slate-500 flex-shrink-0 ml-auto whitespace-nowrap">
                <span className="font-semibold text-slate-700">Date:</span> {fmt(invoice.created_at)}
                {invoice.due_date && (
                  <> &nbsp;·&nbsp;
                    <span className={`font-semibold ${new Date(invoice.due_date) < new Date() && invoice.status !== 'paid' ? 'text-rose-600' : 'text-slate-700'}`}>Due:</span>{' '}
                    <span className={new Date(invoice.due_date) < new Date() && invoice.status !== 'paid' ? 'text-rose-600 font-semibold' : ''}>{fmt(invoice.due_date)}</span>
                  </>
                )}
                &nbsp;·&nbsp; <span className="font-semibold text-slate-700">Currency:</span> {invoice.currency}
              </p>
            </div>

            {/* Items table */}
            <div className="px-7 py-4">
              <table className="doc-table w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider w-7">#</th>
                    <th className="text-left pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="text-center pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider w-16">Qty</th>
                    <th className="text-right pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider w-28">Unit Price</th>
                    <th className="text-right pb-2 pt-1 text-2xs font-bold text-slate-500 uppercase tracking-wider w-28">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-3 text-slate-400 text-xs align-top">{i + 1}</td>
                      <td className="py-2 pr-4 align-top leading-snug">
                        <span className="font-semibold text-slate-800">{item.name}</span>
                        {item.description && (
                          <span className="text-slate-500 whitespace-pre-wrap"> — {item.description}</span>
                        )}
                      </td>
                      <td className="py-2 text-center text-slate-700 tabular-nums font-medium align-top">{item.quantity}</td>
                      <td className="py-2 text-right text-slate-700 tabular-nums align-top">{fmtMoney(item.unit_price, sym)}</td>
                      <td className="py-2 text-right font-semibold text-slate-900 tabular-nums align-top">{fmtMoney(item.total, sym)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals — plain rows, no background */}
            <div className="px-7 pb-5">
              <div className="flex justify-end">
                <div className="doc-total-box min-w-[240px]">
                  <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-medium text-slate-700">{fmtMoney(invoice.subtotal, sym)}</span>
                  </div>
                  {parseFloat(invoice.discount) > 0 && (
                    <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                      <span className="text-slate-500">Discount</span>
                      <span className="font-semibold text-rose-600">− {fmtMoney(invoice.discount, sym)}</span>
                    </div>
                  )}
                  {parseFloat(invoice.tax_rate) > 0 && (
                    <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                      <span className="text-slate-500">Tax ({invoice.tax_rate}%)</span>
                      <span className="font-medium text-slate-700">+ {fmtMoney(invoice.tax_amount, sym)}</span>
                    </div>
                  )}
                  {parseFloat(invoice.shipping_cost) > 0 && (
                    <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                      <span className="text-slate-500">Shipping</span>
                      <span className="font-medium text-slate-700">+ {fmtMoney(invoice.shipping_cost, sym)}</span>
                    </div>
                  )}
                  <div className="border-t-2 border-slate-300 mt-1 py-2 flex justify-between items-center">
                    <span className="font-bold text-slate-900 text-sm">Total</span>
                    <span className="font-bold text-slate-900 text-base tabular-nums">{fmtMoney(invoice.total, sym)}</span>
                  </div>
                  {parseFloat(invoice.amount_paid) > 0 && (
                    <>
                      <div className="flex justify-between py-1.5 border-t border-slate-100 text-xs">
                        <span className="text-slate-500">Amount Paid</span>
                        <span className="font-semibold text-emerald-600">− {fmtMoney(invoice.amount_paid, sym)}</span>
                      </div>
                      <div className="border-t-2 border-slate-300 mt-1 py-2 flex justify-between items-center">
                        <span className="font-bold text-slate-900 text-sm">Balance Due</span>
                        <span className={`font-bold text-base tabular-nums ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {fmtMoney(balance, sym)}
                        </span>
                      </div>
                    </>
                  )}
                  <p className="text-2xs text-slate-400 text-right mt-1">
                    {items.length} item{items.length !== 1 ? 's' : ''} · Qty: <span className="font-semibold text-slate-600">{items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0).toLocaleString()}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Notes / Bank Details / Terms */}
            {(invoice.customer_notes || ((invoice.bank_details || co.bank_details) && tplCfg.showBankDetails !== false) || (invoice.terms_conditions && tplCfg.showTerms !== false)) && (
              <div className="border-t border-slate-100 px-5 py-3 space-y-3">
                {invoice.customer_notes && (
                  <div>
                    <p className="text-2xs font-black text-slate-400 uppercase tracking-widest mb-1">Notes</p>
                    <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{invoice.customer_notes}</p>
                  </div>
                )}
                {(invoice.bank_details || co.bank_details) && tplCfg.showBankDetails !== false && (
                  <div>
                    <p className="text-2xs font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                      <Landmark size={10} /> Bank Details
                    </p>
                    <p className="text-xs text-slate-600 whitespace-pre-line font-mono leading-relaxed border-l-2 border-slate-200 pl-3 py-1">
                      {invoice.bank_details || co.bank_details}
                    </p>
                  </div>
                )}
                {invoice.terms_conditions && tplCfg.showTerms !== false && (
                  <div>
                    <p className="text-2xs font-black text-slate-400 uppercase tracking-widest mb-1">Terms & Conditions</p>
                    <p className="text-xs text-slate-500 whitespace-pre-line leading-relaxed">{invoice.terms_conditions}</p>
                  </div>
                )}
              </div>
            )}

            {/* Template footer text */}
            {tplCfg.footerText && (
              <div className="px-5 py-2 bg-slate-50/60 border-t border-slate-100 text-center">
                <p className="text-xs text-slate-400">{tplCfg.footerText}</p>
              </div>
            )}
            <div className="doc-accent-bar-bottom hidden" />
          </div>
            );
          })()}

          {/* ── Payment history ── */}
          {payments.length > 0 && (
            <div className="max-w-3xl mx-auto mt-4 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                <h3 className="text-sm font-bold text-slate-800">Payment History</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {payments.map(p => (
                  <div key={p.id} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
                        {(() => { const I = PAY_METHODS.find(m => m.value === p.method)?.icon ?? Banknote; return <I size={14} className="text-emerald-600" />; })()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{methodLabel(p.method)}</p>
                        {p.reference && <p className="text-xs text-slate-400">Ref: {p.reference}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-700">{fmtMoney(p.amount, getSym(invoice.currency))}</p>
                        <p className="text-xs text-slate-400">{fmt(p.paid_at)}</p>
                      </div>
                      <button onClick={() => setReceipt(p)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors">
                        Receipt
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Delete confirm ── */}
        {delConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
                  <AlertTriangle size={18} className="text-rose-600" />
                </div>
                <h3 className="font-semibold text-slate-900">Delete Invoice</h3>
              </div>
              <p className="text-sm text-slate-600 mb-5">
                Delete <span className="font-bold">{invoice.number}</span>? All payments will also be removed. This cannot be undone.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDelConfirm(false)}
                  className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex-1 px-4 py-2.5 text-sm bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-60 transition-colors font-medium">
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Confirm Delete (list level) ───────────────────────────────────────────────

function ConfirmDelete({ invoice, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-rose-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Delete Invoice</h3>
            <p className="text-xs text-slate-400 mt-0.5">{invoice.number}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-5">Permanently delete this invoice and all its payments? This cannot be undone.</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-medium">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm bg-rose-600 text-white rounded-xl hover:bg-rose-700 disabled:opacity-60 transition-colors font-medium">
            {loading ? 'Deleting…' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Payments Tab ──────────────────────────────────────────────────────────────

function PaymentsTab({ onPrintReceipt, settings }) {
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    api.get('/payments')
      .then(r => setPayments(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? payments.filter(p =>
        (p.invoice_number || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.client_name    || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.reference      || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.method         || '').toLowerCase().includes(search.toLowerCase()))
    : payments;

  const total = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Total Payments</p>
          <p className="text-2xl font-bold text-slate-800">{payments.length}</p>
        </div>
        <div className="col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Methods Breakdown</p>
          <div className="flex items-center gap-6">
            {PAY_METHODS.map(m => {
              const count = payments.filter(p => p.method === m.value).length;
              return (
                <div key={m.value} className="flex items-center gap-2">
                  <m.icon size={14} className="text-slate-400" />
                  <span className="text-sm text-slate-600">{m.label}</span>
                  <span className="text-sm font-bold text-slate-800">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          className={`${inputCls} pl-9`} placeholder="Search by invoice, client or reference…" />
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Receipt size={28} className="text-slate-300" />
            </div>
            <p className="text-slate-600 font-semibold">No payments found</p>
            <p className="text-slate-400 text-sm mt-1.5">{search ? 'Try clearing your search' : 'Record a payment on an invoice to see it here'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Invoice</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Client</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Method</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Reference</th>
                <th className="text-right px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">Amount</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(p => {
                const sym = getSym(p.currency);
                const I   = PAY_METHODS.find(m => m.value === p.method)?.icon ?? Banknote;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg">
                        {p.invoice_number || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {p.client_name && (
                        <div className="flex items-center gap-1.5">
                          <User size={11} className="text-slate-400 flex-shrink-0" />
                          <span className="font-semibold text-slate-800 truncate max-w-[160px]">{p.client_name}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <I size={13} className="text-slate-400" />
                        <span className="text-slate-700">{methodLabel(p.method)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap">{fmt(p.paid_at)}</td>
                    <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">{p.reference || '—'}</td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-bold text-emerald-700">{fmtMoney(p.amount, sym)}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => onPrintReceipt({
                          invoice: {
                            number:        p.invoice_number,
                            currency:      p.currency,
                            total:         p.invoice_total,
                            client_name:   p.client_name,
                            shipping_phone: p.shipping_phone,
                          },
                          payment: {
                            amount:    p.amount,
                            method:    p.method,
                            reference: p.reference,
                            paid_at:   p.paid_at,
                            notes:     p.notes,
                          },
                        })}
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-200">
                        <Printer size={12} /> Receipt
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          {filtered.length} payment{filtered.length !== 1 ? 's' : ''}
          {search ? ` matching "${search}"` : ''}
        </p>
      )}
    </div>
  );
}

// ── Main Invoices List Page ───────────────────────────────────────────────────

export default function Invoices() {
  const navigate = useNavigate();
  const [activeTab,    setActiveTab]    = useState('invoices');  // 'invoices' | 'payments'
  const [invoices,     setInvoices]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [viewId,       setViewId]       = useState(null);
  const [delConfirm,   setDelConfirm]   = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  // For printing a receipt from the Payments tab
  const [paymentsReceipt, setPaymentsReceipt] = useState(null); // { invoice, payment }
  const [settings,        setSettings]        = useState({});
  const [voucherTemplates, setVoucherTemplates] = useState([]);
  const [activeVoucherTpl, setActiveVoucherTpl] = useState(null);

  useEffect(() => {
    api.get('/settings').then(r => setSettings(r.data)).catch(() => {});
    api.get('/document-templates', { params: { type: 'voucher' } }).then(r => {
      const tpls = Array.isArray(r.data) ? r.data : [];
      setVoucherTemplates(tpls);
      setActiveVoucherTpl(tpls.find(t => t.is_default) || tpls[0] || null);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (search)       params.search = search;
      const { data } = await api.get('/invoices', { params });
      setInvoices(data);
    } catch {}
    finally { setLoading(false); }
  }, [filterStatus, search]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete() {
    if (!delConfirm) return;
    setDeleting(true);
    try {
      await api.delete(`/invoices/${delConfirm.id}`);
      setInvoices(prev => prev.filter(i => i.id !== delConfirm.id));
      setDelConfirm(null);
      if (viewId === delConfirm.id) setViewId(null);
    } catch {}
    finally { setDeleting(false); }
  }

  async function handleDuplicateInv(inv) {
    try {
      const { data } = await api.post(`/invoices/${inv.id}/duplicate`);
      navigate(`/invoices/${data.id}/edit`);
    } catch (e) {
      alert(e?.response?.data?.error ?? 'Failed to duplicate invoice.');
    }
  }

  const total   = invoices.length;
  const unpaid  = invoices.filter(i => i.status === 'unpaid').length;
  const partial = invoices.filter(i => i.status === 'partial').length;
  const paid    = invoices.filter(i => i.status === 'paid').length;
  const overdue = invoices.filter(i => {
    const today = new Date().toISOString().split('T')[0];
    return i.due_date && i.due_date < today && i.status !== 'paid';
  }).length;

  // Receipt voucher from Payments tab
  if (paymentsReceipt) {
    return (
      <ReceiptVoucher
        invoice={paymentsReceipt.invoice}
        payment={paymentsReceipt.payment}
        settings={settings}
        onClose={() => setPaymentsReceipt(null)}
        templates={voucherTemplates}
        activeTemplate={activeVoucherTpl}
        onTemplateSelect={setActiveVoucherTpl}
      />
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8.5rem)' }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices & Payments</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage invoices and track all payment records</p>
        </div>
        <button onClick={() => navigate('/quotations/new')}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-sm shadow-indigo-200 transition-colors">
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {/* Tab switcher (flex-shrink-0) */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit flex-shrink-0">
        <button onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'invoices'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}>
          <FileText size={14} /> Invoices {activeTab === 'invoices' && total > 0 && <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full">{total}</span>}
        </button>
        <button onClick={() => setActiveTab('payments')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'payments'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}>
          <ListChecks size={14} /> Payments
        </button>
      </div>

      {/* ── Payments tab ── */}
      {activeTab === 'payments' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <PaymentsTab
            settings={settings}
            onPrintReceipt={data => setPaymentsReceipt(data)}
          />
        </div>
      )}

      {/* ── Invoices tab: Two-panel split ── */}
      {activeTab === 'invoices' && (
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white print:border-0 print:rounded-none print:shadow-none print:overflow-visible">

          {/* LEFT: Invoice list */}
          <div className="w-full lg:w-80 flex-shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white print:hidden">

            {/* Stats strip */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
              {[
                { label: 'All',     val: total,   dot: 'bg-slate-400'   },
                { label: 'Unpaid',  val: unpaid,  dot: 'bg-amber-400'   },
                { label: 'Partial', val: partial, dot: 'bg-blue-400'    },
                { label: 'Paid',    val: paid,    dot: 'bg-emerald-500' },
                { label: 'Overdue', val: overdue, dot: 'bg-rose-500'    },
              ].map(({ label, val, dot }) => (
                <button key={label}
                  onClick={() => setFilterStatus(label === 'All' ? '' : label.toLowerCase())}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${
                    (label === 'All' && !filterStatus) || filterStatus === label.toLowerCase()
                      ? 'bg-white shadow-sm text-slate-800 border border-slate-200'
                      : 'text-slate-500 hover:bg-white/60'
                  }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                  {val}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 bg-slate-50"
                  placeholder="Search invoices…" />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                </div>
              ) : invoices.length === 0 ? (
                <div className="py-16 text-center px-4">
                  <FileText size={24} className="text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">{search || filterStatus ? 'No matches' : 'No invoices yet'}</p>
                </div>
              ) : (
                invoices.map(inv => {
                  const sym     = getSym(inv.currency);
                  const balance = parseFloat(inv.total) - parseFloat(inv.amount_paid || 0);
                  const isOverdue = inv.due_date && inv.due_date < new Date().toISOString().split('T')[0] && inv.status !== 'paid';
                  const isSelected = viewId === inv.id;
                  return (
                    <button key={inv.id}
                      onClick={() => setViewId(isSelected ? null : inv.id)}
                      className={`w-full text-left px-4 py-3.5 border-b border-slate-100 transition-colors flex flex-col gap-1 relative group ${
                        isSelected
                          ? 'bg-indigo-50 border-l-[3px] border-l-indigo-600'
                          : 'hover:bg-slate-50/80 border-l-[3px] border-l-transparent'
                      }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700">{inv.number}</span>
                        <StatusBadge status={isOverdue && inv.status !== 'paid' ? 'overdue' : inv.status} />
                      </div>
                      {inv.client_name && (
                        <p className="text-xs font-semibold text-slate-800 truncate">{inv.client_name}</p>
                      )}
                      {inv.subject && (
                        <p className="text-xs text-slate-400 truncate">{inv.subject}</p>
                      )}
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-slate-400">{fmt(inv.created_at)}</span>
                        <div className="text-right">
                          <span className="text-xs font-bold text-slate-700">{fmtMoney(inv.total, sym)}</span>
                          {balance > 0 && (
                            <span className="block text-2xs text-rose-500 font-semibold">Due: {fmtMoney(balance, sym)}</span>
                          )}
                        </div>
                      </div>
                      {/* Hover actions */}
                      <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={e => e.stopPropagation()}>
                        <button onClick={() => navigate(`/invoices/${inv.id}/edit`)} title="Edit"
                          className="p-1 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                          <Pencil size={11} />
                        </button>
                        <button onClick={() => handleDuplicateInv(inv)} title="Duplicate"
                          className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors">
                          <Copy size={11} />
                        </button>
                        <button onClick={() => setDelConfirm(inv)} title="Delete"
                          className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT: Invoice preview */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {viewId ? (
              <InvoiceView
                embedded
                invoiceId={viewId}
                onClose={() => setViewId(null)}
                onConverted={load}
              />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
                  <FileText size={28} className="text-indigo-300" />
                </div>
                <p className="font-semibold text-slate-600">Select an invoice to preview</p>
                <p className="text-sm text-slate-400 mt-1">Click any invoice on the left to view details</p>
                <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{unpaid} unpaid</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" />{partial} partial</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />{paid} paid</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {delConfirm && (
        <ConfirmDelete
          invoice={delConfirm}
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDelConfirm(null)}
        />
      )}
    </div>
  );
}
